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
const moment = require('moment');
const _ = require('lodash');
const debug = require('debug')('Z115-Listener');
const utils = require('./utils');

const STATUS = {
  LOW_ADD: 'LOW_ADD',
  UPDATE: 'UPDATE',
  LOW_DELETE: 'LOW_DELETE'
};

async function getNextChangeId(base, connection, changeId) {

  const result = await connection.execute(`select * from ${base}.Z115 where Z115_REC_KEY > :sinceChangeId ORDER BY Z115_REC_KEY ASC`, [changeId], {resultSet: true});
  const nextRow = await result.resultSet.getRow();
  await result.resultSet.close();
  if (nextRow === null) {
    return null;
  }
  const row = parseZ115Row(nextRow);
  const nextChangeId = row.changeId;

  return nextChangeId;
}

async function getChangesSinceId(base, connection, sinceChangeId) {
  debug(`Fetching changes since ${sinceChangeId}`);

  const nextChangeId = await getNextChangeId(base, connection, sinceChangeId);
  if (nextChangeId === null) {
    return [];
  }

  const result = await connection.execute(`select * from ${base}.Z115 where Z115_REC_KEY = :nextChangeId`, [nextChangeId], {resultSet: true});

  const rows = await utils.readAllRows(result.resultSet);

  const changes = rows.map(parseZ115Row);

  return compactChanges(changes);

}

async function getChangesSinceDate(base, connection, sinceDate) {
  debug(`Fetching changes since ${sinceDate}`);
  const date = sinceDate.format('YYYYMMDD');
  const time = sinceDate.format('HHmmssSS');
  const result = await connection.execute(`select /*+ INDEX(Z115_today_date Z115_DATE_ID) INDEX(Z115_today_time Z115_TIME_ID) */ * from ${base}.Z115 where Z115_today_date >= :datevar and z115_today_time > :timevar ORDER BY Z115_today_date, z115_today_time ASC`, [date, time], {resultSet: true});

  const rows = await utils.readAllRows(result.resultSet);

  const changes = rows.map(parseZ115Row);

  return compactChanges(changes);

}

function compactChanges(changes) {

  const grouped = _.groupBy(changes, change => {
    const dateStr = change.date.format('YYYYMMDD-HHmmssSS');
    return `${dateStr}-${change.recordId}`;
  });

  const compacted = _.values(grouped)
    .map(changes => {
      return changes.map(change => {
        change.lowTag = [change.lowTag];
        return change;
      });
    })
    .map(changes => changes.reduce((acc, change) => {
      acc.lowTag = _.concat(acc.lowTag, change.lowTag);
      return acc;
    }));

  return compacted.sort((a, b) => a.date - b.date);
}

async function getDefaultCursor(base, connection) {
  debug('Querying default value for the cursor.');
  const result = await connection.execute(`select max(Z115_REC_KEY) as CHANGEID from ${base}.Z115`, [], {resultSet: true});
  const latestChangeRow = await result.resultSet.getRow();
  await result.resultSet.close();
  const latestChangeId = latestChangeRow.CHANGEID;
  return latestChangeId;
}

function parseStatus(statusCode) {
  switch (statusCode) {
    case 'N': return STATUS.LOW_ADD;
    case 'C': return STATUS.UPDATE;
    case 'D': return STATUS.LOW_DELETE;
  }
}

function parseZ115Row(row) {
  const {Z115_REC_KEY, Z115_LIBRARY, Z115_OWN, Z115_STATUS, Z115_TODAY_DATE, Z115_TODAY_TIME, Z115_NO_LINES, Z115_TAB} = row;

  // Z115_TAB is equal to record's 001.

  return {
    changeId: Z115_REC_KEY,
    library: Z115_LIBRARY,
    lowTag: Z115_OWN.trim(),
    status: parseStatus(Z115_STATUS),
    date: parseDate(Z115_TODAY_DATE, Z115_TODAY_TIME),
    noLines: Z115_NO_LINES,
    recordId: Z115_TAB
  };

}

function parseDate(dateNumber, timeString) {
  const dateString = dateNumber.toString();
  if (dateString.length !== 8) {
    throw new Error(`Incorrect format for aleph date ${dateString}`);
  }

  const trimmedTimeString = timeString.trim();

  if (trimmedTimeString.length !== 8) {
    throw new Error(`Incorrect format for aleph time ${trimmedTimeString}`);
  }

  return moment(`${dateString} ${trimmedTimeString}`, 'YYYYMMDD HHmmssSS');
}

module.exports = {
  STATUS,
  getChangesSinceId,
  getChangesSinceDate,
  getDefaultCursor
};
