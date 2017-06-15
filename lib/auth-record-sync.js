const _ = require('lodash');
const debug = require('debug')('auth-record-sync');
const fixBibRecordField = require('../migrations/fenni-asteri/fix-bib-record');
const MarcRecord = require('marc-record-js');
const utils = require('./utils');
const RecordUtils = require('./record-utils');

function create(alephRecordService, alephFindService, options, baseMap) {

  const reverseBaseMap = Object.keys(baseMap).reduce((acc, key) => _.set(acc, baseMap[key], key), {});

  async function handleAuthChange(change) {
    debug('Handling changed auth record', change);
    debug('loading auth record');
    const authorityRecord = await alephRecordService.loadRecord(change.library, change.recordId);

    const {bibRecordBase, agentRecordBase} = options;
    
    if (authorityRecord.isDeleted()) {
      debug('Record is deleted, skipping.');
      return;
    }

    // TODO: this supports only agent authorities. Expand to support also subject authorities
    debug('extracting authorized portion from auth record');
    const authorizedFields = authorityRecord.fields.filter(field => _.includes(['100', '110', '111'], field.tag));

    if (authorizedFields.length !== 1) {
      throw new Error('Could not parse authorized portion from authority record');
    }
    const authorizedPortion = RecordUtils.findAuthorizedPortion(RecordUtils.RecordType.AUTH, authorizedFields[0]);

    debug('query from index for bib records that are linked to this auth record');
    const bibIdList = await alephFindService.findLinkedAgentRecords(bibRecordBase, change.recordId);
    debug(`Bib records [${bibIdList.join(', ')}]`);

    await utils.serial(bibIdList.map(bibId => async () => {
      debug(`Loading bib record ${bibRecordBase} / ${bibId}`);
      const bibRecord = await alephRecordService.loadRecord(bibRecordBase, bibId);

      if (bibRecord.isDeleted()) {
        debug('Record is deleted, skipping.');
        return;
      }

      debug('checking and maybe resetting authorized portion from bib record fields. Multiple fields may link to same authority.');
      const query = `(${reverseBaseMap[change.library]})${change.recordId}`;
      
      const fixedRecord = new MarcRecord(bibRecord);

      debug(`Updating fields with ‡0${query}`);
      fixedRecord.fields = bibRecord.fields.map(field => {
        if (field.subfields === undefined) return field;
        if (!hasSubfield('0', query)(field)) return field;
        return RecordUtils.updateAuthorizedPortion(RecordUtils.RecordType.BIB, field, authorizedPortion);
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
    debug(`Linked auth records [${linkedAgentAuthIdList.join(', ')}]`);
    await utils.serial(linkedAgentAuthIdList.map(linkedAuthId => async () => {
      debug(`Loading linked auth record ${bibRecordBase} / ${linkedAuthId}`);
      const linkedAuthRecord = await alephRecordService.loadRecord(agentRecordBase, linkedAuthId);

      if (linkedAuthRecord.isDeleted()) {
        debug('Record is deleted, skipping.');
        return;
      }

      debug('checking and maybe resetting authrozied portion from linked auth record fields');
      const fixedRecord = new MarcRecord(linkedAuthRecord);
      const query = `(${reverseBaseMap[change.library]})${change.recordId}`;
    
      fixedRecord.fields = fixedRecord.fields.map(field => {
        if (field.subfields === undefined) return field;
        if (!hasSubfield('0', query)(field)) return field;

        return RecordUtils.updateAuthorizedPortion(RecordUtils.RecordType.AUTH, field, authorizedPortion);
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
