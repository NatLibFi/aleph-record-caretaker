const _ = require('lodash');
const debug = require('debug')('auth-record-sync');
const fixBibRecordField = require('../sync-tool/fix-bib-record');
const MarcRecord = require('marc-record-js');
const utils = require('./utils');

function create(alephRecordService, alephFindService) {

  async function handleAuthChange(change) {
    debug('Handling changed auth record', change);
    debug('loading auth record');
    const authorityRecord = await alephRecordService.loadRecord(change.library, change.recordId);

    const bibRecordBase = 'TST01';
    const agentRecordBase = 'TST10';

    
    if (authorityRecord.isDeleted()) {
      debug('Record is deleted, skipping.');
      return;
    }

    // TODO: check that auth record is agent authority (for now)


    debug('extracting authorized portion from auth record');


    debug('query from index for bib records that are linked to this auth record');
    const bibIdList = await alephFindService.findLinkedAgentRecords(bibRecordBase, change.recordId);
    
    await utils.serial(bibIdList.map(bibId => async () => {
      debug('loading bib record that are linked to auth record');
      const bibRecord = await alephRecordService.loadRecord(bibRecordBase, bibId);

      if (bibRecord.isDeleted()) {
        debug('Record is deleted, skipping.');
        return;
      }

      debug('checking and maybe resetting authorized portion from bib record fields. Multiple fields may link to same authority.');
      const query = `(${change.library})${change.recordId}`;
      
      const fixedRecord = new MarcRecord(bibRecord);

      fixedRecord.fields = bibRecord.fields.map(field => {
        if (field.subfields === undefined) return field;
        if (!hasSubfield('0', query)(field)) return field;
        // TODO: handle others than 100 in authorityrecord
        return fixBibRecordField(field, authorityRecord);
      });

      if (!_.isEqual(bibRecord.fields, fixedRecord.fields) || !_.isEqual(bibRecord.leader, fixedRecord.leader)) {
        debug('The record was changed.');
        debug('Saving changed bib record.');
        await alephRecordService.saveRecord(bibRecordBase, bibId, fixedRecord);
      } else {
        debug('Record was not changed.');
      }

    }));

    debug('loading linked auth records findLinkedAgentRecords(fin11, id)');
    const linkedAgentAuthIdList = await alephFindService.findLinkedAgentRecords(agentRecordBase, change.recordId);
    await utils.serial(linkedAgentAuthIdList.map(linkedAuthId => async () => {
      debug('loading auth record that are linked to auth record');
      const linkedAuthRecord = await alephRecordService.loadRecord(agentRecordBase, linkedAuthId);

      if (linkedAuthRecord.isDeleted()) {
        debug('Record is deleted, skipping.');
        return;
      }

      debug('checking and maybe resetting authrozied portion from linked auth record fields');
      const fixedRecord = new MarcRecord(linkedAuthRecord);
      const query = `(${change.library})${change.recordId}`;
    
      fixedRecord.fields = fixedRecord.fields.map(field => {
        if (field.subfields === undefined) return field;
        if (!hasSubfield('0', query)(field)) return field;
        // TODO: handle others than 100 in authorityrecord
        return fixBibRecordField(field, authorityRecord);
      });

      if (!_.isEqual(linkedAuthRecord.fields, fixedRecord.fields) || !_.isEqual(linkedAuthRecord.leader, fixedRecord.leader)) {
        debug('The record was changed.');
        debug('Saving changed linked auth record.');
        await alephRecordService.saveRecord(agentRecordBase, linkedAuthId, fixedRecord);
      } else {
        debug('Record was not changed.');
      }

    }));

  }

  return {
    handleAuthChange
  };
}

function hasSubfield(code, value) {
  return (field) => {
    return field.subfields.some(subfield => subfield.code === code && subfield.value === value);
  };
}

module.exports = {
  create
};
