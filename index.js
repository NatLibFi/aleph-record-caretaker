// running this requires at least node 7.10.0
/* eslint no-console: 0 */
const dbConfig = require('./dbconfig.js');
const oracledb = require('oracledb');
oracledb.outFormat = oracledb.OBJECT;

const AlephChangeListener = require('../aleph-change-listener/aleph-change-listener');
const AlephFindService = require('./aleph-find-service');
const AlephRecordService = require('../sync-tool/aleph-record-service');

const utils = require('./utils');

const DEBUG_SQL = process.env.DEBUG_SQL;

const MELINDA_Z106_BASES = ['FIN01', 'FIN10', 'FIN11'];
const LIBTEST_Z106_BASES = ['FIN01', 'FIN19'];

const options = {
  Z106Bases: dbConfig.connectString === 'melinda' ? MELINDA_Z106_BASES : LIBTEST_Z106_BASES,
  Z115Base: dbConfig.connectString === 'melinda' ? 'FIN00' : 'USR00',
  pollIntervalMs: '5000',
  cursorSaveFile: dbConfig.connectString === 'melinda' ? '.aleph-changelistener-cursors.json' : '.libtest-cursors.json'
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

  // auth or bib?

  // for auth: load bibs, set name
  // linked auths?

  // for bib: load auth, get name from it and set it to bib.
}
