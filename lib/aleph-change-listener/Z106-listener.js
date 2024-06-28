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
const fs = require('fs');
const _ = require('lodash');
const moment = require('moment');
const createDebug = require('debug');
const utils = require('./utils');

function create(base, stashPrefix = 'stash') {
  const debug = createDebug(`Z106-Listener-for${base}`);
  const persistedChangesFilename = `${stashPrefix}_${base}`;
  let alreadyPassedChanges = readPersistedChanges(persistedChangesFilename);

  async function getNextDate(connection, sinceDate) {
    debug(`getNextDate: ${connection}, ${sinceDate}`);
    const date = sinceDate.format('YYYYMMDD');
    const time = sinceDate.format('HHmm');

    const result = await connection.execute(`select * from ${base}.z106 where Z106_UPDATE_DATE > :dateVar OR (Z106_UPDATE_DATE = :dateVar AND Z106_TIME > :timeVar) ORDER BY Z106_UPDATE_DATE, Z106_TIME ASC`, [date, date, time], {resultSet: true});
    const nextRow = await result.resultSet.getRow();
    await result.resultSet.close();
    if (nextRow === null) {
      return null;
    }

    const row = parseZ106Row(nextRow);
    return row.date;
  }

  async function getChangesAtDate(connection, sinceDate) {
    debug(`getChagesAtDate: ${connection}, ${sinceDate}`);
    const date = sinceDate.format('YYYYMMDD');
    const time = sinceDate.format('HHmm');

    const query = `
    select Z106_REC_KEY, Z106_SECONDARY_KEY, Z106_CATALOGER, Z106_LEVEL, Z106_UPDATE_DATE, Z106_LIBRARY, Z106_TIME, count(*) AS COUNT
    from ${base}.z106 where Z106_UPDATE_DATE = :dateVar AND Z106_TIME = :timeVar
    group by Z106_REC_KEY, Z106_SECONDARY_KEY, Z106_CATALOGER, Z106_LEVEL, Z106_UPDATE_DATE, Z106_LIBRARY, Z106_TIME
    ORDER BY Z106_UPDATE_DATE, Z106_TIME ASC
    `;

    const result = await connection.execute(query, [date, time], {resultSet: true});
    const rows = await utils.readAllRows(result.resultSet);

    const changes = rows.map(parseZ106Row);
    debug(`getChagesAtDate: we got ${changes.length} changes.`);
    return changes;
  }

  async function getChangesSinceDate(connection, sinceDate) {
    debug(`Fetching changes at (sinceDate) ${sinceDate}`);

    // Fetch current minute and next minute

    const currentDateChanges = await getChangesAtDate(connection, sinceDate);
    debug(`We managed to getChangesAtDate`);

    const nextDate = await getNextDate(connection, sinceDate);
    debug(`Fetching changes at (nextDate) ${nextDate}`);

    let nextDateChanges = [];
    if (nextDate) {
      debug(`We have nextDate ${nextDate}`);
      nextDateChanges = await getChangesAtDate(connection, nextDate);
      debug(`We managed to getChangesAtDate`);
    }

    debug(`Changes at ${sinceDate}: ${currentDateChanges.length}`);
    debug(`Changes at ${nextDate}: ${nextDateChanges.length}`);

    const changes = _.concat(currentDateChanges, nextDateChanges);

    debug(`we got have total of ${changes.length} changes.`);

    // Since resolution is 1 minute, persist result from last minute to file
    // after fetch, filter out stuff that was persisted

    const dateOfLastChange = _.get(_.last(changes), 'date');
    const setOfChangesToPersist = _.takeRightWhile(changes, change => dateOfLastChange.isSame(change.date));
    const newChanges = _.differenceWith(changes, alreadyPassedChanges, isEqualChangeObject);
    alreadyPassedChanges = setOfChangesToPersist;
    debug(`write changes to file.`);
    await writePersistedChanges(persistedChangesFilename, setOfChangesToPersist);

    debug(`new changes: ${newChanges.length}, next: ${dateOfLastChange}`);

    return {
      changes: _.uniqWith(newChanges, isEqualChangeObject),
      nextCursor: dateOfLastChange
    };
  }

  async function getDefaultCursor(connection) {
    debug('Querying default value for the cursor.');
    const result = await connection.execute(`select * from ${base}.z106 ORDER BY Z106_UPDATE_DATE DESC, Z106_TIME DESC`, [], {resultSet: true});
    const latestChangeRow = await result.resultSet.getRow();
    await result.resultSet.close();
    if (latestChangeRow === null) {
      return moment.now();
    }
    const latestChange = parseZ106Row(latestChangeRow);

    // Call getChangesSinceDate to persist changes of current minute to
    // ensure that the changes from current minute are not returned when cursor is first used.
    const {nextCursor} = await getChangesSinceDate(connection, latestChange.date);
    return nextCursor;
  }

  function readPersistedChanges(file) {
    try {
      const data = fs.readFileSync(file, 'utf8');
      const changes = JSON.parse(data);
      return changes.map(change => {
        return Object.assign(change, {date: moment(change.date)});
      });
    } catch (error) {
      debug(`Cannot read file! ${file}`)
      return [];
    }
  }

  function writePersistedChanges(file, data) {
    debug(`Remembering ${data.length} changes`);
    return new Promise((resolve, reject) => {
      fs.writeFile(file, JSON.stringify(data), 'utf8', (err) => {
        if (err) {
          debug(`Cannot write file!  ${file}`);
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  return {
    getChangesSinceDate,
    getDefaultCursor
  };
}

function isEqualChangeObject(a, b) {

  return _.isEqual(_.omit(a, 'date'), _.omit(b, 'date')) && a.date.isSame(b.date);
}



function parseZ106Row(row) {
  const {Z106_REC_KEY, Z106_SECONDARY_KEY, Z106_CATALOGER, Z106_LEVEL, Z106_UPDATE_DATE, Z106_LIBRARY, Z106_TIME} = row;

  return {
    recordId: Z106_REC_KEY,
    secondaryKey: Z106_SECONDARY_KEY,
    user: Z106_CATALOGER && Z106_CATALOGER.trim(),
    changeLevel: Z106_LEVEL,
    date: parseDate(Z106_UPDATE_DATE, Z106_TIME),
    library: Z106_LIBRARY,
    count: row.COUNT ? row.COUNT : 1
  };
}


function parseDate(dateString, timeNumber) {

  if (dateString.length !== 8) {
    throw new Error(`Incorrect format for aleph date ${dateString}`);
  }

  const timeString = _.padStart(timeNumber.toString(), 4, '0');

  if (timeString.length !== 4) {
    throw new Error(`Incorrect format for aleph time ${timeString}`);
  }

  return moment(`${dateString} ${timeString}`, 'YYYYMMDD HHmmssSS');
}

module.exports = {
  create
};
