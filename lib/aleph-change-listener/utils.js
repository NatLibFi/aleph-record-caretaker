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

module.exports = {
  readAllRows
};
