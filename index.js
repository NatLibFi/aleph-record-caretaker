// running this requires at least node 7.10.0
/* eslint no-console: 0 */
const dbConfig = require('./dbconfig.js');
const oracledb = require('oracledb');
oracledb.outFormat = oracledb.OBJECT;

const AlephChangeListener = require('../aleph-change-listener/aleph-change-listener');
const utils = require('./utils');

const DEBUG_SQL = process.env.DEBUG_SQL;

const options = {
  Z106Bases: ['FIN01', 'FIN10', 'FIN11'],
  pollIntervalMs: '5000',
  cursorSaveFile: '.aleph-changelistener-cursors.json'
};

start().catch(error => { console.error(error); });

async function start() {
  
  const connection = await oracledb.getConnection(dbConfig);

  if (DEBUG_SQL) {
    utils.decorateConnectionWithDebug(connection);
  }

  const alephChangeListener = await AlephChangeListener.create(connection, options, onChange);

  alephChangeListener.start();
  
}

function onChange(changes) {
  console.log(changes);
}
