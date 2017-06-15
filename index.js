// running this requires at least node 7.10.0
/* eslint no-console: 0 */
const oracledb = require('oracledb');
oracledb.outFormat = oracledb.OBJECT;
const debug = require('debug')('auth-sync-service');

const AlephChangeListener = require('aleph-change-listener');

const AlephFindService = require('./lib/aleph-find-service');
const AlephRecordService = require('./lib/aleph-record-service');
const BibRecordSyncService = require('./lib/bib-record-sync');
const AuthRecordSyncService = require('./lib/auth-record-sync');

const utils = require('./lib/utils');

const DEBUG_SQL = process.env.DEBUG_SQL;

const authSyncServiceOptions = {
  bibRecordBase: 'FIN01',
  agentRecordBase: 'FIN11'
};

const baseMap = {
  'FI-ASTERI-S': 'FIN10',
  'FI-ASTERI-N': 'FIN11'
};

const Z106_BASES = utils.readArrayEnvironmentVariable('Z106_BASES', ['FIN01', 'FIN10', 'FIN11']);
const Z115_BASE = utils.readEnvironmentVariable('Z115Base', 'USR00');
const POLL_INTERVAL_MS = utils.readEnvironmentVariable('POLL_INTERVAL_MS', 5000);
const CURSOR_FILE = utils.readEnvironmentVariable('CURSOR_FILE', '.aleph-changelistener-cursors.json');
const Z106_STASH_PREFIX = utils.readEnvironmentVariable('Z106_STASH_PREFIX', '.z106_stash');

const options = {
  Z106Bases: Z106_BASES,
  Z115Base: Z115_BASE,
  pollIntervalMs: POLL_INTERVAL_MS,
  cursorSaveFile: CURSOR_FILE,
  Z106StashPrefix: Z106_STASH_PREFIX
};

const dbConfig = {
  user: utils.readEnvironmentVariable('ORACLE_USER'),
  password: utils.readEnvironmentVariable('ORACLE_PASS'),
  connectString: utils.readEnvironmentVariable('ORACLE_CONNECT_STRING')
};

const XServerUrl = utils.readEnvironmentVariable('X_SERVER');

const credentials = {
  username: utils.readEnvironmentVariable('ALEPH_CARETAKER_USER'),
  password: utils.readEnvironmentVariable('ALEPH_CARETAKER_PASS')
};

const alephRecordService = AlephRecordService.createAlephRecordService(XServerUrl, credentials);
const alephFindService = AlephFindService.create(XServerUrl);

const bibRecordSyncService = BibRecordSyncService.create(alephRecordService, alephFindService, baseMap);
const authRecordSyncService = AuthRecordSyncService.create(alephRecordService, alephFindService, authSyncServiceOptions, baseMap);

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
  debug(`Handling ${changes.length} changes.`);
  
  return utils.serial(changes.map((change) => () => {

    switch(change.library) {
      case 'FIN01': return bibRecordSyncService.handleBibChange(change);
      //case 'FIN10': return authRecordSyncService.handleAuthChange(change);
      case 'FIN11': return authRecordSyncService.handleAuthChange(change);
      case 'FIN19': return authRecordSyncService.handleAuthChange(change);
      default: throw new Error(`Could not find handler for base ${change.library}`);
    }
  })).catch(error => {
    console.error(error);
  });
}