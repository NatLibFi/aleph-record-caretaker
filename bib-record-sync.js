const debug = require('debug')('bib-record-sync');
const MarcRecord = require('marc-record-js');
const _ = require('lodash');
const fixBibRecordField = require('../sync-tool/fix-bib-record');
const utils = require('./utils');

function create(alephRecordService, alephFindService) {

  async function handleBibChange(change) {
    debug('Handling changed bib record', change);

    debug('Loading record');
    const record = await alephRecordService.loadRecord(change.library, change.recordId);

    if (record.isDeleted()) {
      debug('Record is deleted, skipping.');
      return;
    }

    const fixedRecord = new MarcRecord(record);

    fixedRecord.fields = await utils.serial(record.fields.map(field => async () => {
      if (field.tag !== '100') return field;
      
      const authorityRecordLinkSubfield = _.head(field.subfields.filter(sub => sub.code === '0'));

      if (authorityRecordLinkSubfield) {
        const { base, recordId } = parseAuthorityRecordLink(authorityRecordLinkSubfield.value);

        const authorityRecord = await alephRecordService.loadRecord(base, recordId);

        return fixBibRecordField(field, authorityRecord);
      }
      return field;

    }));

    if (!_.isEqual(record.fields, fixedRecord.fields) || !_.isEqual(record.leader, fixedRecord.leader)) {
      debug('The record was changed.');
      debug('Saving changed bib record.');
      await alephRecordService.saveRecord(change.library, change.recordId, fixedRecord);
    } else {
      debug('Record was not changed.');
    }
  }

  function parseAuthorityRecordLink(authorityRecordLink) {

    const match = /^\((.*)\)(\d+)$/.exec(authorityRecordLink);
    if (match) {
      const [,base,recordId] = match;
      return { base, recordId };
    }

    throw new Error(`Invalid format in subfield 0: ${authorityRecordLink}`);
    
  }

  return {
    handleBibChange
  };
}

module.exports = {
  create
};
