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
/* eslint no-console: 0 */
const dbConfig = require('./dbconfig.js');
const oracledb = require('oracledb');

const AlephChangeListener = require('./aleph-change-listener');

const DEBUG_SQL = process.env.DEBUG_SQL;

const options = {
  Z106Bases: ['FIN01', 'FIN10', 'FIN11'],
  pollIntervalMs: '5000',
  cursorSaveFile: '.aleph-changelistener-cursors.json'
};

start().catch(error => {console.error(error);});

async function start() {

  const connection = await oracledb.getConnection(dbConfig);

  if (DEBUG_SQL) {
    decorateConnectionWithDebug(connection);
  }

  const alephChangeListener = await AlephChangeListener.create(connection, options, onChange);

  alephChangeListener.start();

}

function onChange(changes) {
  console.log(changes);
}

function decorateConnectionWithDebug(connection) {

  const actualExecute = connection.execute;
  connection.execute = function () {
    console.log('DEBUG-SQL', `'${arguments[0]}'`, arguments[1]);
    return actualExecute.apply(this, arguments);
  };
}
