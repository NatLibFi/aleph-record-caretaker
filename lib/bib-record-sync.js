const debug = require('debug')('bib-record-sync');
const MarcRecord = require('marc-record-js');
const _ = require('lodash');
const utils = require('./utils');
const RecordUtils = require('./record-utils');
const MarcPunctuation = require('./marc-punctuation-fix');
const DEFAULT_LOGGER = { log: () => {}};
const RECENT_CHANGE_COOLDOWN_MS = 20000;

function create(alephRecordService, alephFindService, options) {

  const bibRules = _.get(options, 'punctuationRulesForBibRecord');
  if (bibRules === undefined) {
    throw new Error('Missing punctuation rules for bibliographic records (options.punctuationRulesForBibRecord)');
  }

  const fixPunctuationFromBibField = MarcPunctuation.createRecordFixer(bibRules);
  
  const logger = _.get(options, 'logger', DEFAULT_LOGGER);
  const baseMap = options.baseMap;
  const recentChangesManager = utils.RecentChangesManager(RECENT_CHANGE_COOLDOWN_MS);

  async function handleBibChange(change) {
    logger.log('info', 'Handling changed bib record', JSON.stringify(change));

    debug('Loading record');
    const record = await alephRecordService.loadRecord(change.library, change.recordId);

    if (record.isDeleted()) {
      logger.log('info', 'Record is deleted, skipping.');
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

        let links = [];
        try {
          links = authorityRecordLinkSubfields.map(field => parseAuthorityRecordLink(field.value));
        } catch(error) {
          logger.log('warn', error.message);
        }
        
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
          
          const updatedField = RecordUtils.updateAuthorizedPortion(RecordUtils.RecordType.BIB, field, authorizedPortion);
          fixPunctuationFromBibField(updatedField);
          return updatedField;
          
        } else {
          return field;
        }
      }

      return field;

    }));

    if (!_.isEqual(record.fields, fixedRecord.fields) || !_.isEqual(record.leader, fixedRecord.leader)) {
      logger.log('info', 'The record has changed.');

      const {a, b} = utils.deepDiff(record.fields, fixedRecord.fields);

      const patch = {
        prev: a.map(RecordUtils.fieldToString),
        next: b.map(RecordUtils.fieldToString)
      };

      logger.log('info', 'Previous values:');
      logger.log('info', patch.prev);
      logger.log('info', 'Next values:');
      logger.log('info', patch.next);

      const wasRecentChange = recentChangesManager.checkAndUpdateRecentChanges(change.library, change.recordId, patch);
      if (wasRecentChange) {
        logger.log('info', 'I recently made this change, so skipping this for now.');
        return;
      }

      if (options.noOperation) {
        logger.log('info', 'no-operation flag is set, not saving record');
      } else {
        logger.log('info', 'Saving changed bib record.');
        await alephRecordService.saveRecord(change.library, change.recordId, fixedRecord);  
      }
      
    } else {
      logger.log('info', 'The record was not changed.');
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
