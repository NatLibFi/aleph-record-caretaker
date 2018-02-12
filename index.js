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
 */// running this requires at least node 7.10.0
/* eslint no-console: 0 */

const logger = require('./lib/logger');
logger.log('info', 'Starting aleph-record-caretaker');

const fs = require('fs');
const path = require('path');

const oracledb = require('oracledb');
oracledb.outFormat = oracledb.OBJECT;
const debug = require('debug')('main');
const _ = require('lodash');

const AlephChangeListener = require('@natlibfi/aleph-change-listener');

const AlephFindService = require('./lib/aleph-find-service');
const MelindaRecordService = require('./lib/melinda-record-service');
const BibRecordSyncService = require('./lib/bib-record-sync');
const AuthRecordSyncService = require('./lib/auth-record-sync');
const MarcPunctuation = require('@natlibfi/melinda-marc-record-utils/dist/punctuation');

const utils = require('./lib/utils');

const DEBUG_SQL = process.env.DEBUG_SQL;

const ONLINE = utils.readEnvironmentVariable('ONLINE', '00:00-21:55, 22:30-24:00');

const onlineTimes = utils.parseTimeRanges(ONLINE);

const NOOP = utils.readEnvironmentVariable('NOOP', '0');
const noOperation = NOOP !== '0' ? true : false;

const NOOP_BIBCHANGE = utils.readEnvironmentVariable('NOOP_BIBCHANGE', '0');
const noOperationBibChange = (NOOP !== '0' || NOOP_BIBCHANGE !== '0') ? true : false;

const baseMap = {
  'FI-ASTERI-S': 'FIN10',
  'FI-ASTERI-N': 'FIN11'
};

const bibRules = MarcPunctuation.readPunctuationRulesFromJSON(require('@natlibfi/melinda-marc-record-utils/dist/punctuation/bib-punctuation.json'));
const authRules = MarcPunctuation.readPunctuationRulesFromJSON(require('@natlibfi/melinda-marc-record-utils/dist/punctuation/auth-punctuation.json'));

const authSyncServiceOptions = {
  bibRecordBase: 'FIN01',
  agentRecordBase: 'FIN11',
  noOperation,
  baseMap,
  logger,
  punctuationRulesForAuthRecord: authRules,
  punctuationRulesForBibRecord: bibRules
};
const bibSyncServiceOptions = {
  noOperationBibChange,
  baseMap,
  logger,
  punctuationRulesForBibRecord: bibRules
};

const Z106_BASES = utils.readArrayEnvironmentVariable('Z106_BASES', ['FIN01', 'FIN10', 'FIN11']);
const Z115_BASE = utils.readEnvironmentVariable('Z115_BASE', 'USR00');
const POLL_INTERVAL_MS = utils.readEnvironmentVariable('POLL_INTERVAL_MS', 5000);
const CURSOR_FILE = utils.readEnvironmentVariable('CURSOR_FILE', '.aleph-changelistener-cursors.json');
const Z106_STASH_PREFIX = utils.readEnvironmentVariable('Z106_STASH_PREFIX', '.z106_stash');
const CHANGES_QUEUE_FILE = utils.readEnvironmentVariable('CHANGES_QUEUE_FILE', '.aleph-changelistener-changesqueue');

const options = {
  Z106Bases: Z106_BASES,
  Z115Base: Z115_BASE,
  pollIntervalMs: POLL_INTERVAL_MS,
  cursorSaveFile: CURSOR_FILE,
  Z106StashPrefix: Z106_STASH_PREFIX,
  changesQueueSaveFile: CHANGES_QUEUE_FILE
};

const dbConfig = {
  user: utils.readEnvironmentVariable('ORACLE_USER'),
  password: utils.readEnvironmentVariable('ORACLE_PASS'),
  connectString: utils.readEnvironmentVariable('ORACLE_CONNECT_STRING')
};

const XServerUrl = utils.readEnvironmentVariable('X_SERVER');
const melindaEndpoint = utils.readEnvironmentVariable('MELINDA_API', 'http://libtest1.csc.fi:8992/API');

const credentials = {
  username: utils.readEnvironmentVariable('ALEPH_CARETAKER_USER'),
  password: utils.readEnvironmentVariable('ALEPH_CARETAKER_PASS')
};

const alephRecordService = MelindaRecordService.createMelindaRecordService(melindaEndpoint, XServerUrl, credentials);
const alephFindService = AlephFindService.create(XServerUrl);


const bibRecordSyncService = BibRecordSyncService.create(alephRecordService, alephFindService, bibSyncServiceOptions);
const authRecordSyncService = AuthRecordSyncService.create(alephRecordService, alephFindService, authSyncServiceOptions);

let alephChangeListener;
let connection;

logger.log('info', `Online times: ${ONLINE}. Current time: ${utils.getCurrentTime()}`);

let isRunning = false;
function updateOnlineState() {
  const now = utils.parseTime(utils.getCurrentTime());
  debug(`now is ${now}`);
  if (onlineTimes.some(({from, to}) => from <= now && now <= to)) {
    if (!isRunning) {
            
      start().catch(error => { 
        console.error(error); 
        logger.log('error', error.message, error);
      });
      isRunning = true;
    }
  } else {
    if (isRunning) {
            
      stop().catch(error => { 
        console.error(error); 
        logger.log('error', error.message, error);
      });
      isRunning = false;
    }
  }
}

updateOnlineState();
setInterval(updateOnlineState, 60000);


async function start() {
  logger.log('info', 'Connecting to oracle');
  connection = await oracledb.getConnection(dbConfig);

  if (DEBUG_SQL) {
    utils.decorateConnectionWithDebug(connection);
  }

  logger.log('info', 'Creating aleph changelistener');
  alephChangeListener = await AlephChangeListener.create(connection, options, onChange);
  
  logger.log('info', 'Starting aleph changelistener');
  alephChangeListener.start();
  
  logger.log('info', 'Waiting for changes');

}

async function stop() {
  if (alephChangeListener) {
    alephChangeListener.stop();
    logger.log('info', 'Stopped aleph changelistener');

    await connection.close();
    logger.log('info', 'Disconnected from oracle');
  }
}

const noChangesLogger = utils.accumulate(12, () => {
  logger.log('info', 'No changes.');
});

async function onChange(changes) {
  debug(`Changes: ${changes.length}`);
  if (changes.length === 0) {
    return noChangesLogger();
  }
  logger.log('info', `Handling ${changes.length} changes.`);
  noChangesLogger.reset();
  
  for (const change of changes) {
  
    try {
      switch(change.library) {
        case 'FIN01': await bibRecordSyncService.handleBibChange(change); break;
        case 'FIN11': await authRecordSyncService.handleAuthChange(change); break;
        case 'FIN19': await authRecordSyncService.handleAuthChange(change); break;
        default: logger.log('warn', `Could not find handler for base ${change.library}`); return;
      }
    } catch(error) {
      logger.log('error', error.message, error);
      console.error(error);
    }

  }

}
