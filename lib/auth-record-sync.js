/**
 * Copyright 2017 University Of Helsinki (The National Library Of Finland)
 * 
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 * 
 *     http://www.apache.org/licenses/LICENSE-2.0
 * 
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */const _ = require('lodash');
const debug = require('debug')('auth-record-sync');
const MarcRecord = require('marc-record-js');
const utils = require('./utils');
const RecordUtils = require('./record-utils');
const MarcPunctuation = require('@natlibfi/melinda-marc-record-utils/dist/punctuation');
const MarcAuthorizedPortion = require('@natlibfi/melinda-marc-record-utils/dist/authorized-portion');
const DEFAULT_LOGGER = { log: (level, message) => debug(`${level}: ${message}`) };
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
  const urnBaseMap = options.urnBaseMap;  
  const urnResolverPrefix = options.urnResolverPrefix;
  const recentChangesManager = utils.RecentChangesManager(RECENT_CHANGE_COOLDOWN_MS);


  async function handleAuthChange(change) {
    const changeId = utils.randomString();

    logger.log('info', `[${changeId}] Handling changed auth record`, JSON.stringify(change));
    debug(`[${changeId}] loading auth record`);
    const authorityRecord = await alephRecordService.loadRecord(change.library, change.recordId);
    debug(`[${changeId}] Authority record:\n${authorityRecord.toString()}`);
    
    const {bibRecordBase, agentRecordBase} = options;
    
    if (authorityRecord.isDeleted()) {
      logger.log('info', `[${changeId}] Record is deleted, skipping.`);
      return;
    }

    // TODO: this supports only agent authorities. Expand to support also subject authorities
    debug(`[${changeId}] extracting authorized portion from auth record`);
    const authorizedFields = authorityRecord.fields.filter(field => _.includes(['100', '110', '111'], field.tag));

    if (authorizedFields.length !== 1) {
      throw new Error('Could not parse authorized portion from authority record');
    }
    const authorizedPortion = MarcAuthorizedPortion.findAuthorizedPortion(MarcAuthorizedPortion.RecordType.AUTH, authorizedFields[0]);
    debug(`[${changeId}] Authorized portion is ${JSON.stringify(authorizedPortion)}`);
    debug(`[${changeId}] query from index for bib records that are linked to this auth record`);
    const bibIdList = await alephFindService.findLinkedAgentRecords(bibRecordBase, change.recordId);
    debug(`[${changeId}] Bib records [${bibIdList.join(', ')}]`);

    for (const bibId of bibIdList) {
      try {

        logger.log('info', `[${changeId}] Loading bib record ${bibRecordBase} / ${bibId}`);
        const bibRecord = await alephRecordService.loadRecord(bibRecordBase, bibId);

        if (bibRecord.isDeleted()) {
          logger.log('info', `[${changeId}] Record ${bibRecordBase} / ${bibId} is deleted, skipping.`);
          continue;
        }

        debug(`[${changeId}] checking and maybe resetting authorized portion from bib record fields. Multiple fields may link to same authority.`);
        const query = `(${reverseBaseMap[change.library]})${change.recordId}`;
	const urnQuery=createUrnQuery(change,options);  
	const urnQuery2=createUrnQueryPadded(change,options);  

        const fixedRecord = new MarcRecord(bibRecord);

        debug(`[${changeId}] Updating fields in ${bibRecordBase} / ${bibId} with ‡0${query}`);
        fixedRecord.fields = bibRecord.fields.map(field => {
          if (field.subfields === undefined) return field;
          if (!hasSubfield('0', query)(field) && !hasSubfield('0', urnQuery)(field) && !hasSubfield('0', urnQuery2)(field)) return field;

          debug(`[${changeId}] Field before updateAuthorizedPortion and fixPunctuationFromBibField: ${RecordUtils.fieldToString(field)}`);
          const updatedField = MarcAuthorizedPortion.updateAuthorizedPortion(MarcAuthorizedPortion.RecordType.BIB, field, authorizedPortion);
          debug(`[${changeId}] Field after updateAuthorizedPortion ${RecordUtils.fieldToString(updatedField)}`);
          fixPunctuationFromBibField(updatedField);
          debug(`[${changeId}] Field after fixPunctuationFromBibField ${RecordUtils.fieldToString(updatedField)}`);
          return updatedField;
        });

        if (!_.isEqual(bibRecord.fields, fixedRecord.fields) || !_.isEqual(bibRecord.leader, fixedRecord.leader)) {
          logger.log('info', `[${changeId}] The record has changed.`);

          const {a, b} = utils.deepDiff(bibRecord.fields, fixedRecord.fields);

          const patch = {
            prev: a.map(RecordUtils.fieldToString),
            next: b.map(RecordUtils.fieldToString)
          };

          logger.log('info', `[${changeId}] Previous values:`);
          logger.log('info', patch.prev);
          logger.log('info', `[${changeId}] Next values:`);
          logger.log('info', patch.next);

          const wasRecentChange = recentChangesManager.checkAndUpdateRecentChanges(bibRecordBase, bibId, patch);
          if (wasRecentChange) {
            logger.log('info', `[${changeId}] I recently made this change, so skipping this for now.`);
            continue;
          }
          if (options.noOperation) {
            logger.log('info', `[${changeId}] no-operation flag is set, not saving record`);
          } else {
            logger.log('info', `[${changeId}] Saving changed bib record.`);
            await alephRecordService.saveRecord(bibRecordBase, bibId, fixedRecord);
            logger.log('info', `[${changeId}] Record was saved succesfully.`);
          }
          
        } else {
          logger.log('info', `[${changeId}] The record was not changed.`);
        }
      } catch(error) {
        logger.log('error', `[${changeId}]`, error);
      }
    }

    debug(`[${changeId}] loading linked auth records findLinkedAgentRecords(fin11, id)`);
    const linkedAgentAuthIdList = await alephFindService.findLinkedAgentRecords(agentRecordBase, change.recordId);
    debug(`[${changeId}] Linked auth records [${linkedAgentAuthIdList.join(', ')}]`);
    for (const linkedAuthId of linkedAgentAuthIdList) {
      try {

        logger.log('info', `[${changeId}] Loading linked auth record ${agentRecordBase} / ${linkedAuthId}`);
        const linkedAuthRecord = await alephRecordService.loadRecord(agentRecordBase, linkedAuthId);

        if (linkedAuthRecord.isDeleted()) {
          logger.log('info', `[${changeId}] Record ${agentRecordBase} / ${linkedAuthId} is deleted, skipping.`);
          continue;
        }

        debug(`[${changeId}] checking and maybe resetting authrozied portion from linked auth record fields`);
        const fixedRecord = MarcRecord.clone(linkedAuthRecord);
        const query = `(${reverseBaseMap[change.library]})${change.recordId}`;
    
	const urnQuery = createUrnQuery(change,options);
        const urnQuery2 = createUrnQueryPadded(change,options);


        fixedRecord.fields = fixedRecord.fields.map(field => {
	  if (field.subfields === undefined) return field;
          if (!hasSubfield('0', query)(field) && !hasSubfield('0', urnQuery)(field) && !hasSubfield('0', urnQuery2)(field)) return field;

          const updatedField = MarcAuthorizedPortion.updateAuthorizedPortion(MarcAuthorizedPortion.RecordType.AUTH, field, authorizedPortion);
          fixPunctuationFromAuthField(updatedField);
          return updatedField;
        });

        if (!_.isEqual(linkedAuthRecord.fields, fixedRecord.fields) || !_.isEqual(linkedAuthRecord.leader, fixedRecord.leader)) {
          logger.log('info', `[${changeId}] The record has changed.`);
          
          if (options.noOperation) {
            logger.log('info', `[${changeId}] no-operation flag is set, not saving record`);
          } else {
            logger.log('info', `[${changeId}] Saving linked auth record ${agentRecordBase} / ${linkedAuthId}.`);
            await alephRecordService.saveRecord(agentRecordBase, linkedAuthId, fixedRecord);
          }
          
        } else {
          logger.log('info', `[${changeId}] The record was not changed.`);
        }
      } catch(error) {
        logger.log('error', `[${changeId}]`, error.message, error);
      }
    }

  }

  return {
    handleAuthChange
  };
}


function hasSubfield(code, value) {
  return (field) => {
    return field.subfields.some(s => s.code === code && (s.value === value || s.value === value+"," || s.value === value+"."));
  };
}

function createUrnQuery(change,options) {
    const urnBaseMap = options.urnBaseMap;  
    const urnResolverPrefix = options.urnResolverPrefix;
    const urnQuery = `${urnResolverPrefix}${urnBaseMap[change.library]}${change.recordId}`;
    return urnQuery;

}

function createUrnQueryPadded(change,options) {
    const urnBaseMap = options.urnBaseMap;  
    const urnResolverPrefix = options.urnResolverPrefix;
    const recordId = change.recordId;
    const paddedRecordId = _.padStart(recordId, 9, '0');
    const urnQuery = `${urnResolverPrefix}${urnBaseMap[change.library]}${paddedRecordId}`;
    return urnQuery;

}


module.exports = {
  create,
  createUrnQuery,
  createUrnQueryPadded
};
