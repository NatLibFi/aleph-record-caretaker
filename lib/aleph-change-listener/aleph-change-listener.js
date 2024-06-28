/**
 * Copyright 2017 University Of Helsinki (The National Library Of Finland)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
*/
// running this requires at least node 7.10.0

const _ = require('lodash');
const oracledb = require('oracledb');
const debug = require('debug')('aleph-change-listener');
const moment = require('moment');
const fs = require('fs');

const Z115Listener = require('./Z115-listener');
const Z106Listener = require('./Z106-listener');
const Poller = require('./poller');

const DEFAULT_CURSOR_SAVE_FILE = '.aleph-changelistener-cursors';
const DEFAULT_Z106_STASH_PREFIX = 'stash';
const DEFAULT_POLL_INTERVAL_MS = 5000;
const DEFAULT_CHANGES_QUEUE_FILE = '.aleph-changelistener-changesqueue';

oracledb.outFormat = oracledb.OBJECT;

async function create(connection, options, onChangeCallback) {

  const Z106Bases = _.get(options, 'Z106Bases', []);
  const POLL_INTERVAL_MS = _.get(options, 'pollIntervalMs', DEFAULT_POLL_INTERVAL_MS);
  const CURSOR_SAVE_FILE = _.get(options, 'cursorSaveFile', DEFAULT_CURSOR_SAVE_FILE);
  const Z106_STASH_PREFIX = _.get(options, 'Z106StashPrefix', DEFAULT_Z106_STASH_PREFIX);
  const CHANGES_QUEUE_FILE = _.get(options, 'changesQueueSaveFile', DEFAULT_CHANGES_QUEUE_FILE);
  const logger = _.get(options, 'logger', {log: console.log.bind(console)}); //eslint-disable-line no-console

  const Z115Base = _.get(options, 'Z115Base');

  debug(`Bases for Z106 ${Z106Bases}`);
  debug(`Polling interval ${POLL_INTERVAL_MS}`);
  debug(`Using cursor file ${CURSOR_SAVE_FILE}`);

  const Z106CursorKeys = Z106Bases.reduce((keys, base) => _.set(keys, base, `Z106_FOR_${base}`), {});
  const Z106Listeners = Z106Bases.reduce((listeners, base) => _.set(listeners, base, Z106Listener.create(base, Z106_STASH_PREFIX)), {});


  const initialCursors = loadCursors(CURSOR_SAVE_FILE);

  // if initialCursors are not initialzied, then check from db for current cursors.
  await Promise.all(Z106Bases.map(async base => {
    if (!initialCursors[Z106CursorKeys[base]]) {
      logger.log('info', `Loading default value for Z106 cursor for ${base}`);
      initialCursors[Z106CursorKeys[base]] = await Z106Listeners[base].getDefaultCursor(connection);
    }
  }));

  if (!initialCursors.Z115_cursor) {
    logger.log('info', 'Loading default value for Z115 cursor');
    initialCursors.Z115_cursor = await Z115Listener.getDefaultCursor(Z115Base, connection);
  }

  const poller = Poller.create(POLL_INTERVAL_MS, pollAction(connection, initialCursors));

  function pollAction(connection, initialCursors) {

    let cursors = _.cloneDeep(initialCursors);

    return async function () {


      const z106changes = await Promise.all(Z106Bases.map(async base => {
        const cursor = cursors[Z106CursorKeys[base]];
        logger.log('verbose', `Loading changes from Z106/${base} at ${cursor}`);
        const {changes, nextCursor} = await Z106Listeners[base].getChangesSinceDate(connection, cursor);
        if (changes.length) {
          cursors[Z106CursorKeys[base]] = nextCursor;
        }

        return changes;
      }));

      logger.log('verbose', `Loading changes from Z115 at ${cursors.Z115_cursor}`);
      const z115changes = await Z115Listener.getChangesSinceId(Z115Base, connection, cursors.Z115_cursor);

      if (z115changes.length) {
        cursors.Z115_cursor = _.last(z115changes).changeId;
      }

      Z106Bases.forEach(base => {
        debug(`Cursor ${Z106CursorKeys[base]} is ${cursors[Z106CursorKeys[base]]}`);
      });

      debug(`Z115_cursor is ${cursors.Z115_cursor}`);

      await combineChanges(_.flatten(z106changes), z115changes);

      // write cursors to file for next startup
      saveCursors(CURSOR_SAVE_FILE, cursors);

    };
  }

  async function combineChanges(z106changes, z115changes) {
    debug(`z106changes: ${z106changes.length}, z115changes: ${z115changes.length}`);

    const z106ForMerge = z106changes.map(change => {
      return {
        recordId: change.recordId,
        library: change.library,
        meta: {
          Z106: _.omit(change, 'recordId', 'library')
        }
      };
    });

    const z115ForMerge = z115changes.map(change => {
      return {
        recordId: change.recordId,
        library: change.library,
        meta: {
          Z115: _.omit(change, 'recordId', 'library')
        }
      };
    });

    // new changes came
    const latestChanges = _.concat(z106ForMerge, z115ForMerge);
    // load changes-queue from file
    // changeQueue is like: [[ch1, ch2],[ch3, ch2, ch4]]
    const changesQueue = loadChangesQueue();
    // push new changes to queue
    changesQueue.push(latestChanges);
    debug('changesQueue', changesQueue);
    if (changesQueue.length > 1) {

      // shift/pop earliest changes from queue,
      const oldestChanges = changesQueue.shift();
      // make keygroup of earliset changes
      const key = change => `${change.recordId}-${change.library}`;
      const keyGroup = oldestChanges.map(key);
      // filter all changes with that keygroup
      const lookaheadChanges = _.flatten(changesQueue).filter(change => _.includes(keyGroup, key(change)));
      const filteredChangesQueue = changesQueue.map(changesArray => _.without(changesArray, ...lookaheadChanges));
      const changesForEmitting = _.concat(oldestChanges, lookaheadChanges);

      const changes = _.chain(changesForEmitting)
        .groupBy(change => `${change.recordId}-${change.library}`)
        .values()
        .map(changeGroup => _.merge({}, ...changeGroup))
        .value();

      await handleChanges(changes);
      saveChangesQueue(filteredChangesQueue);
    } else {
      saveChangesQueue(changesQueue);
    }
  }

  function handleChanges(changes) {
    debug('handleChanges', changes);
    if (onChangeCallback) {
      return onChangeCallback.call(null, changes);
    }
  }

  function loadCursors(CURSOR_SAVE_FILE) {
    try {
      const cursors = JSON.parse(fs.readFileSync(CURSOR_SAVE_FILE, 'utf8'));
      Z106Bases.forEach(base => {
        cursors[Z106CursorKeys[base]] = moment(cursors[Z106CursorKeys[base]]);
      });
      return cursors;
    } catch (error) {
      if (error.code === 'ENOENT') {
        logger.log('warn', 'Cursor file not found, starting without cursor file.');
      } else {
        logger.log('error', `Failed to load cursors from file: ${error.message}`);
      }
      return {};
    }
  }

  function saveCursors(CURSOR_SAVE_FILE, data) {
    fs.writeFileSync(CURSOR_SAVE_FILE, JSON.stringify(data), 'utf8');
  }

  function loadChangesQueue() {
    try {
      const changesQueue = JSON.parse(fs.readFileSync(CHANGES_QUEUE_FILE, 'utf8'));

      const momentizeChangeMetaDate = (change, ZDB) => {
        const date = _.get(change, ['meta', ZDB, 'date']);
        if (date) {
          _.set(change, ['meta', ZDB, 'date'], moment(date));
        }
      };

      _.flatten(changesQueue).forEach(change => {
        momentizeChangeMetaDate(change, 'Z106');
        momentizeChangeMetaDate(change, 'Z115');
      });

      debug('reading changesqueue', changesQueue);
      return changesQueue;
    } catch (error) {
      return [];
    }
  }
  function saveChangesQueue(changesQueue) {
    debug('writing changesqueue', changesQueue);
    fs.writeFileSync(CHANGES_QUEUE_FILE, JSON.stringify(changesQueue), 'utf8');
  }

  return {
    start: poller.start,
    stop: poller.stop
  };

}

module.exports = {
  create
};
