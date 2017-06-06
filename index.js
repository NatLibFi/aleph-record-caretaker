// running this requires at least node 7.10.0
/* eslint no-console: 0 */
const dbConfig = require('./dbconfig.js');
const oracledb = require('oracledb');
oracledb.outFormat = oracledb.OBJECT;
const debug = require('debug')('auth-sync-service');

const AlephChangeListener = require('../aleph-change-listener/aleph-change-listener');
const AlephFindService = require('./aleph-find-service');
const AlephRecordService = require('../sync-tool/aleph-record-service');
const BibRecordSyncService = require('./bib-record-sync');
const AuthRecordSyncService = require('./auth-record-sync');

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

const XServerUrl = dbConfig.connectString === 'melinda' ? 'http://melinda.kansalliskirjasto.fi/X' : 'http://libtest.csc.fi:8992/X';

const alephRecordService = AlephRecordService.createAlephRecordService(XServerUrl);
const alephFindService = AlephFindService.create(XServerUrl);

const bibRecordSyncService = BibRecordSyncService.create(alephRecordService, alephFindService);
const authRecordSyncService = AuthRecordSyncService.create(alephRecordService, alephFindService);


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
  
  return utils.serial(changes.map((change) => () => {

    switch(change.library) {
      case 'FIN01': return bibRecordSyncService.handleBibChange(change);
      //case 'FIN10': return AuthRecordSync.handleAuthChange(change);
      case 'FIN11': return authRecordSyncService.handleAuthChange(change);
      case 'FIN19': return authRecordSyncService.handleAuthChange(change);
    }
  }));
}
