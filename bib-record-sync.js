const debug = require('debug')('bib-record-sync');
const MarcRecord = require('marc-record-js');
const _ = require('lodash');
const fixBibRecordField = require('../sync-tool/fix-bib-record');
const utils = require('./utils');

function create(alephRecordService, alephFindService, baseMap) {

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
      if (!_.includes(['100', '600', '700'], field.tag)) {
        return field;
      }
      // TODO: handlers for there:
      // 110, 610, 710
      // 111, 611, 711
      
      // mahdollisesti myös 800, 810, 811
      
      const authorityRecordLinkSubfields = field.subfields.filter(sub => sub.code === '0');
      
      if (authorityRecordLinkSubfields.length > 0) {

        const links = authorityRecordLinkSubfields.map(field => parseAuthorityRecordLink(field.value));
        
        const supportedLinks = links.filter(link => baseMap[link.base] !== undefined);
        if (supportedLinks.length > 1) {
          const offendingBases = supportedLinks.map(link => link.base).join(', ');
          throw new Error(`Record contains multiple links to supported bases (${offendingBases}). Unable to determine which one to use for updating the authorized portion.`);
        }
        if (supportedLinks.length === 1) {
          const { base, recordId } = supportedLinks[0];

          const authorityRecord = await alephRecordService.loadRecord(baseMap[base], recordId);

          // TODO: fixBibRecordField handles only authorityRecords with field 100. It must support 110, 111. and in the future also others.
          return fixBibRecordField(field, authorityRecord);
        } else {
          return field;
        }
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
