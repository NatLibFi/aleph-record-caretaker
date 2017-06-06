const debug = require('debug')('auth-record-sync');

function create(alephRecordService, alephFindService) {

  async function handleAuthChange(change) {
    debug('Handling changed auth record', change);
    debug('loading auth record');
    const record = await alephRecordService.loadRecord(change.library, change.recordId);
    console.log(record.toString());
    // check that auth record is not deleted?
    // check that auth record is agent authority (for now)
    debug('extracting name from auth record');
    debug('loading bib records that are linked to auth record');
    debug('checking and maybe resetting name from bib record field');

    debug('loading linked auth records');
    debug('extracting name from auth record for linked auth records');
    debug('checking and maybe resetting name from linked auth record fields');
    debug('saving changed auth record.');
  }

  return {
    handleAuthChange
  };
}

module.exports = {
  create
};
