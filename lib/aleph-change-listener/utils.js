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
const debug = require('debug')('@natlibfi/aleph-record-caretaker:aleph-change-listener:utils');
const moment = require('moment');

async function readAllRows(resultSet, rows = []) {
  debug(`utils/readAllRows`);
  debug(`Result set: ${JSON.stringify(resultSet)}`);
  debug(`Rows: ${JSON.stringify(resultSet)}`);
  const nextRow = await resultSet.getRow();
  if (nextRow === null || nextRow === undefined || !nextRow) {
    await resultSet.close();
    return rows;
  }

  rows.push(nextRow);
  return readAllRows(resultSet, rows);
}

// Parses an Aleph date (8 digit number or string, YYYYMMDD) together with a
// full 8 character time string (HHmmssSS) into a moment.
// Listeners with coarser time resolution (e.g. Z106 uses HHmm) must pad their
// time value to 8 characters before calling this (e.g. '1753' -> '17530000').
function parseDate(dateNumber, timeString) {
  const dateString = String(dateNumber);
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
  readAllRows,
  parseDate
};
