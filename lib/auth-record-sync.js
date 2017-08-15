const _ = require('lodash');
const debug = require('debug')('auth-record-sync');
const MarcRecord = require('marc-record-js');
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

  const authRules = _.get(options, 'punctuationRulesForAuthRecord');
  if (authRules === undefined) {
    throw new Error('Missing punctuation rules for authority records (options.punctuationRulesForAuthRecord)');
  }

  const fixPunctuationFromBibField = MarcPunctuation.createRecordFixer(bibRules);
  const fixPunctuationFromAuthField = MarcPunctuation.createRecordFixer(authRules, MarcPunctuation.RecordTypes.AUTHORITY);

  const logger = _.get(options, 'logger', DEFAULT_LOGGER);
  const reverseBaseMap = Object.keys(options.baseMap).reduce((acc, key) => _.set(acc, options.baseMap[key], key), {});
  const recentChangesManager = utils.RecentChangesManager(RECENT_CHANGE_COOLDOWN_MS);

  async function handleAuthChange(change) {
    logger.log('info', 'Handling changed auth record', JSON.stringify(change));
    debug('loading auth record');
    const authorityRecord = await alephRecordService.loadRecord(change.library, change.recordId);

    const {bibRecordBase, agentRecordBase} = options;
    
    if (authorityRecord.isDeleted()) {
      logger.log('info', 'Record is deleted, skipping.');
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

    for (const bibId of bibIdList) {
      try {

        logger.log('info', `Loading bib record ${bibRecordBase} / ${bibId}`);
        const bibRecord = await alephRecordService.loadRecord(bibRecordBase, bibId);

        if (bibRecord.isDeleted()) {
          logger.log('info', 'Record is deleted, skipping.');
          continue;
        }

        debug('checking and maybe resetting authorized portion from bib record fields. Multiple fields may link to same authority.');
        const query = `(${reverseBaseMap[change.library]})${change.recordId}`;
        
        const fixedRecord = new MarcRecord(bibRecord);

        debug(`Updating fields with ‡0${query}`);
        fixedRecord.fields = bibRecord.fields.map(field => {
          if (field.subfields === undefined) return field;
          if (!hasSubfield('0', query)(field)) return field;
          const updatedField = RecordUtils.updateAuthorizedPortion(RecordUtils.RecordType.BIB, field, authorizedPortion);
          fixPunctuationFromBibField(updatedField);
          return updatedField;
        });

        if (!_.isEqual(bibRecord.fields, fixedRecord.fields) || !_.isEqual(bibRecord.leader, fixedRecord.leader)) {
          logger.log('info', 'The record has changed.');

          const {a, b} = utils.deepDiff(bibRecord.fields, fixedRecord.fields);

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
            continue;
          }
          if (options.noOperation) {
            logger.log('info', 'no-operation flag is set, not saving record');
          } else {
            logger.log('info', 'Saving changed bib record.');
            await alephRecordService.saveRecord(bibRecordBase, bibId, fixedRecord);
          }
          
        } else {
          logger.log('info', 'The record was not changed.');
        }
      } catch(error) {
        logger.log('error', error);
      }
    }

    debug('loading linked auth records findLinkedAgentRecords(fin11, id)');
    const linkedAgentAuthIdList = await alephFindService.findLinkedAgentRecords(agentRecordBase, change.recordId);
    debug(`Linked auth records [${linkedAgentAuthIdList.join(', ')}]`);
    for (const linkedAuthId of linkedAgentAuthIdList) {
      try {

        logger.log('info', `Loading linked auth record ${bibRecordBase} / ${linkedAuthId}`);
        const linkedAuthRecord = await alephRecordService.loadRecord(agentRecordBase, linkedAuthId);

        if (linkedAuthRecord.isDeleted()) {
          logger.log('info', 'Record is deleted, skipping.');
          continue;
        }

        debug('checking and maybe resetting authrozied portion from linked auth record fields');
        const fixedRecord = new MarcRecord(linkedAuthRecord);
        const query = `(${reverseBaseMap[change.library]})${change.recordId}`;
      
        fixedRecord.fields = fixedRecord.fields.map(field => {
          if (field.subfields === undefined) return field;
          if (!hasSubfield('0', query)(field)) return field;

          const updatedField = RecordUtils.updateAuthorizedPortion(RecordUtils.RecordType.AUTH, field, authorizedPortion);
          fixPunctuationFromAuthField(updatedField);
          return updatedField;
        });

        if (!_.isEqual(linkedAuthRecord.fields, fixedRecord.fields) || !_.isEqual(linkedAuthRecord.leader, fixedRecord.leader)) {
          logger.log('info', 'The record has changed.');
          
          if (options.noOperation) {
            logger.log('info', 'no-operation flag is set, not saving record');
          } else {
            logger.log('info', 'Saving changed bib record.');
            await alephRecordService.saveRecord(agentRecordBase, linkedAuthId, fixedRecord);
          }
          
        } else {
          logger.log('info', 'The record was not changed.');
        }
      } catch(error) {
        logger.log('error', error);
      }
    }

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
