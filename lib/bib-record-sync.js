const debug = require('debug')('bib-record-sync');
const MarcRecord = require('marc-record-js');
const _ = require('lodash');
const utils = require('./utils');
const RecordUtils = require('./record-utils');

function create(alephRecordService, alephFindService, options) {

  const baseMap = options.baseMap;

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
      if (!_.includes(['100', '110', '111', '600', '610', '611', '700', '710', '711',], field.tag)) {
        return field;
      }
      // TODO: handlers for 800, 810, 811
      
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

          debug('Loading authority record');
          const authorityRecord = await alephRecordService.loadRecord(baseMap[base], recordId);

          // TODO: this supports only agent authorities. Expand to support also subject authorities
          debug('extracting authorized portion from auth record');
          const authorizedFields = authorityRecord.fields.filter(field => _.includes(['100', '110', '111'], field.tag));

          if (authorizedFields.length !== 1) {
            throw new Error('Could not parse authorized portion from authority record');
          }
          const authorizedPortion = RecordUtils.findAuthorizedPortion(RecordUtils.RecordType.AUTH, authorizedFields[0]);
          
          return RecordUtils.updateAuthorizedPortion(RecordUtils.RecordType.BIB, field, authorizedPortion);

        } else {
          return field;
        }
      }

      return field;

    }));

    if (!_.isEqual(record.fields, fixedRecord.fields) || !_.isEqual(record.leader, fixedRecord.leader)) {
      debug('The record was changed.');
      const {a, b} = deepDiff(record.fields, fixedRecord.fields);
      debug('Previous values:');
      debug(a.map(RecordUtils.fieldToString));
      debug('Next values:');
      debug(b.map(RecordUtils.fieldToString));
      debug('Saving changed bib record.');

      if (options.noOperation) {
        debug('no-operation flag is set, not saving record');
      } else {
        await alephRecordService.saveRecord(change.library, change.recordId, fixedRecord);  
      }
      
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

function deepDiff(collectionA, collectionB) {
  const identicalFields = _.intersectionWith(collectionA, collectionB, _.isEqual);
  const a = collectionA.filter(field => !_.find(identicalFields, _.curry(_.isEqual)(field)));
  const b = collectionB.filter(field => !_.find(identicalFields, _.curry(_.isEqual)(field)));
  return {a,b};
}
 

module.exports = {
  create
};
