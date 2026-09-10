/**
 * Copyright 2017-2019 University Of Helsinki (The National Library Of Finland)
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
 */

const _ = require('lodash');
const debug = require('debug')('@natlibfi/aleph-record-caretaker:auth-record-sync');
const debugDev = require('debug')('@natlibfi/aleph-record-caretaker:auth-record-sync:dev');
const MarcRecord = require('marc-record-js');
const utils = require('./utils');
const RecordUtils = require('./record-utils');
const {Punctuation: MarcPunctuation, AuthorizedPortion: MarcAuthorizedPortion} = require('@natlibfi/melinda-marc-record-utils');
const DEFAULT_LOGGER = { log: (level, message) => debug(`${level}: ${message}`) };
const RECENT_CHANGE_COOLDOWN_MS = 20000;

// Use the new punctuation fix function from @natlibfi/marc-record-validators-melinda for bib records
const fieldFixPunctuation = require('@natlibfi/marc-record-validators-melinda/dist/punctuation2').fieldFixPunctuation;

function create(alephRecordService, alephFindService, options) {
  debug(`Create auth-record-sync with options: ${JSON.stringify(options)}`);

  const authRules = _.get(options, 'punctuationRulesForAuthRecord');
  if (authRules === undefined) {
    throw new Error('Missing punctuation rules for authority records (options.punctuationRulesForAuthRecord)');
  }

  const fixPunctuationFromAuthField = MarcPunctuation.createRecordFixer(authRules, MarcPunctuation.RecordTypes.AUTHORITY);

  const context = {
    alephRecordService,
    alephFindService,
    options,
    logger: _.get(options, 'logger', DEFAULT_LOGGER),
    reverseBaseMap: buildReverseBaseMap(options.baseMap),
    recentChangesManager: utils.RecentChangesManager(RECENT_CHANGE_COOLDOWN_MS),
    fixPunctuationFromAuthField
  };

  return {
    handleAuthChange: (change) => handleAuthChange(context, change)
  };
}

function buildReverseBaseMap(baseMap) {
  return Object.keys(baseMap).reduce((acc, key) => _.set(acc, baseMap[key], key), {});
}

function createStats() {
  return { noChanges: 0, changes: 0, saves: 0, errors: 0, noOps: 0, recents: 0 };
}

function recordChanged(original, fixed) {
  return !_.isEqual(original.fields, fixed.fields) || !_.isEqual(original.leader, fixed.leader);
}

function createPatch(originalFields, fixedFields) {
  const { a, b } = utils.deepDiff(originalFields, fixedFields);
  return {
    prev: a.map(RecordUtils.fieldToString),
    next: b.map(RecordUtils.fieldToString)
  };
}

function logPatch(context, changeId, base, recordId, patch) {
  context.logger.log('info', `[${changeId}] ${base} / ${recordId} Previous values: ${patch.prev}`);
  context.logger.log('info', `[${changeId}] ${base} / ${recordId} Next values: ${patch.next}`);
}

function createFieldMatcher(context, change) {
  const query = `(${context.reverseBaseMap[change.library]})${change.recordId}`;
  const urnQuery = createUrnQuery(change, context.options);
  const urnQuery2 = createUrnQueryPadded(change, context.options);
  return (field) => hasSubfield('0', query)(field) || hasSubfield('0', urnQuery)(field) || hasSubfield('0', urnQuery2)(field);
}

function extractAuthorizedPortion(context, authorityRecord, change, changeId) {
  // TODO: this supports only agent authorities. Expand to support also subject authorities
  debug(`[${changeId}] extracting authorized portion from auth record ${change.recordId}`);
  const authorizedFields = authorityRecord.fields.filter(field => _.includes(['100', '110', '111'], field.tag));

  // TODO: handle multilingual records with several authorized portion fields
  if (authorizedFields.length !== 1) {
    throw new Error('Could not parse authorized portion from authority record');
  }
  const authorizedPortion = MarcAuthorizedPortion.findAuthorizedPortion(MarcAuthorizedPortion.RecordType.AUTH, authorizedFields[0]);
  debug(`[${changeId}] Authorized portion from record ${change.recordId} is ${JSON.stringify(authorizedPortion)}`);
  return authorizedPortion;
}

function formatBibSummary(bibCount, s) {
  return `BibCount: ${bibCount}. bibNoChanges: ${s.noChanges}, bibChanges: ${s.changes}, bibSaves: ${s.saves}, bibErrors ${s.errors}, bibNoOps: ${s.noOps}, bibRecents: ${s.recents}`;
}

function formatLinkedAgentSummary(count, s) {
  return `linkedAgentCount: ${count}. linkedAgentNoChanges: ${s.noChanges}, linkedAgentChanges: ${s.changes}, linkedAgentSaves: ${s.saves}, linkedAgentErrors ${s.errors}, linkedAgentNoOps: ${s.noOps}`;
}

async function handleAuthChange(context, change) {
  const changeId = utils.randomString();
  const logger = context.logger;

  logger.log('info', `[${changeId}] Handling changed auth record`, JSON.stringify(change));
  debug(`[${changeId}] loading auth record ${change.recordId}`);
  const authorityRecord = await context.alephRecordService.loadRecord(change.library, change.recordId);
  debug(`[${changeId}] Authority record (${change.recordId}):\n${authorityRecord.toString()}`);

  if (authorityRecord.isDeleted()) {
    // TODO: we could do something for records linked to deleted authority record - at least some kind of repor
    logger.log('info', `[${changeId}] Authority record ${change.recordId} is deleted, skipping.`);
    return;
  }

  const authorizedPortion = extractAuthorizedPortion(context, authorityRecord, change, changeId);

  const {bibRecordBase, agentRecordBase} = context.options;

  debug(`[${changeId}] query from index for bib records that are linked to this auth record (${change.recordId})`);
  const bibIdList = await context.alephFindService.findLinkedAgentRecords(bibRecordBase, change.recordId);
  debug(`[${changeId}] Bib records (${bibIdList.length}) [${bibIdList.join(', ')}]`);

  const bibStats = createStats();
  for (const bibId of bibIdList) {
    await processBibRecord(context, bibId, authorizedPortion, change, changeId, bibStats);
  }
  logger.log('info', `[${changeId}] Handled bibs linked to ${change.recordId}: ${formatBibSummary(bibIdList.length, bibStats)}`);

  debug(`[${changeId}] loading linked auth records for ${change.recordId} in ${agentRecordBase}`);
  const linkedAgentAuthIdList = await context.alephFindService.findLinkedAgentRecords(agentRecordBase, change.recordId);
  debug(`[${changeId}] Linked to ${change.recordId} auth records [${linkedAgentAuthIdList.join(', ')}]`);

  const linkedAgentStats = createStats();
  for (const linkedAuthId of linkedAgentAuthIdList) {
    await processLinkedAuthRecord(context, linkedAuthId, authorizedPortion, change, changeId, linkedAgentStats);
  }
  logger.log('info', `[${changeId}] Handled linkedAgents linked to ${change.recordId}: ${formatLinkedAgentSummary(linkedAgentAuthIdList.length, linkedAgentStats)}`);
}

async function processBibRecord(context, bibId, authorizedPortion, change, changeId, stats) {
  const logger = context.logger;
  const bibRecordBase = context.options.bibRecordBase;
  try {
    logger.log('debug', `[${changeId}] Loading bib record ${bibRecordBase} / ${bibId}`);
    const bibRecord = await context.alephRecordService.loadRecord(bibRecordBase, bibId);

    if (bibRecord.isDeleted()) {
      logger.log('info', `[${changeId}] Record ${bibRecordBase} / ${bibId} is deleted, skipping.`);
      stats.noChanges = stats.noChanges + 1;
      return;
    }

    debug(`[${changeId}] checking and maybe resetting authorized portion from bib record fields. Multiple fields may link to same authority.`);
    const query = `(${context.reverseBaseMap[change.library]})${change.recordId}`;

    const fixedRecord = new MarcRecord(bibRecord);

    debug(`[${changeId}] Updating fields in ${bibRecordBase} / ${bibId} with ‡0${query}`);
    const isLinkToChange = createFieldMatcher(context, change);
    fixedRecord.fields = bibRecord.fields.map(field => {
      if (field.subfields === undefined) return field;
      if (!isLinkToChange(field)) return field;

      debugDev(`[${changeId}] ${bibRecordBase} / ${bibId} Field before updateAuthorizedPortion and fieldFixPunctuation: ${RecordUtils.fieldToString(field)}`);
      const updatedField = MarcAuthorizedPortion.updateAuthorizedPortion(MarcAuthorizedPortion.RecordType.BIB, field, authorizedPortion);
      debugDev(`[${changeId}] ${bibRecordBase} / ${bibId} Field after updateAuthorizedPortion ${RecordUtils.fieldToString(updatedField)}`);
      const fixedField = fieldFixPunctuation(updatedField, true);
      debugDev(`[${changeId}] ${bibRecordBase} / ${bibId} Field after new punctuation fix ${RecordUtils.fieldToString(fixedField)}`);

      return fixedField;
    });

    if (recordChanged(bibRecord, fixedRecord)) {
      logger.log('info', `[${changeId}] ${bibRecordBase} / ${bibId} The record has changed.`);
      stats.changes = stats.changes + 1;

      const patch = createPatch(bibRecord.fields, fixedRecord.fields);
      logPatch(context, changeId, bibRecordBase, bibId, patch);

      const wasRecentChange = context.recentChangesManager.checkAndUpdateRecentChanges(bibRecordBase, bibId, patch);
      if (wasRecentChange) {
        logger.log('info', `[${changeId}] ${bibRecordBase} / ${bibId} I recently made this change, so skipping this for now.`);
        stats.recents = stats.recents + 1;
        return;
      }
      if (context.options.noOperation) {
        logger.log('info', `[${changeId}] ${bibRecordBase} / ${bibId} no-operation flag is set, not saving record`);
        stats.noOps = stats.noOps + 1;
      } else {
        logger.log('info', `[${changeId}] ${bibRecordBase} / ${bibId} Saving changed bib record.`);
        await context.alephRecordService.saveRecord(bibRecordBase, bibId, fixedRecord);
        logger.log('info', `[${changeId}] ${bibRecordBase} / ${bibId} Record was saved succesfully.`);
        stats.saves = stats.saves + 1;
      }
    } else {
      logger.log('debug', `[${changeId}] ${bibRecordBase} / ${bibId} The record was not changed.`);
      stats.noChanges = stats.noChanges + 1;
    }
  } catch(error) {
    stats.errors = stats.errors + 1;
    logger.log('error', `[${changeId}] ${bibRecordBase} / ${bibId}`, error);
  }
}

async function processLinkedAuthRecord(context, linkedAuthId, authorizedPortion, change, changeId, stats) {
  const logger = context.logger;
  const agentRecordBase = context.options.agentRecordBase;
  try {
    logger.log('info', `[${changeId}] Loading linked to ${change.recordId} auth record ${agentRecordBase} / ${linkedAuthId}`);
    const linkedAuthRecord = await context.alephRecordService.loadRecord(agentRecordBase, linkedAuthId);

    if (linkedAuthRecord.isDeleted()) {
      logger.log('info', `[${changeId}] Record ${agentRecordBase} / ${linkedAuthId} is deleted, skipping.`);
      stats.noChanges = stats.noChanges + 1;
      return;
    }

    debug(`[${changeId}] ${agentRecordBase} / ${linkedAuthId} checking and maybe resetting authrozied portion from linked auth record fields`);
    const fixedRecord = MarcRecord.clone(linkedAuthRecord);

    const isLinkToChange = createFieldMatcher(context, change);
    fixedRecord.fields = fixedRecord.fields.map(field => {
      if (field.subfields === undefined) return field;
      if (!isLinkToChange(field)) return field;

      const updatedField = MarcAuthorizedPortion.updateAuthorizedPortion(MarcAuthorizedPortion.RecordType.AUTH, field, authorizedPortion);
      context.fixPunctuationFromAuthField(updatedField);
      return updatedField;
    });

    if (recordChanged(linkedAuthRecord, fixedRecord)) {
      logger.log('info', `[${changeId}] The record has changed.`);
      stats.changes = stats.changes + 1;

      const patch = createPatch(linkedAuthRecord.fields, fixedRecord.fields);
      logPatch(context, changeId, agentRecordBase, linkedAuthId, patch);

      if (context.options.noOperation) {
        logger.log('info', `[${changeId}] ${agentRecordBase} / ${linkedAuthId} no-operation flag is set, not saving record`);
        stats.noOps = stats.noOps + 1;
      } else {
        logger.log('info', `[${changeId}] Saving linked to ${change.recordId} auth record ${agentRecordBase} / ${linkedAuthId}.`);
        await context.alephRecordService.saveRecord(agentRecordBase, linkedAuthId, fixedRecord);
        logger.log('info', `[${changeId}] ${agentRecordBase} / ${linkedAuthId} Record was saved succesfully.`);
        stats.saves = stats.saves + 1;
      }
    } else {
      logger.log('debug', `[${changeId}] ${agentRecordBase} / ${linkedAuthId} The record was not changed.`);
      stats.noChanges = stats.noChanges + 1;
    }
  } catch(error) {
    logger.log('error', `[${changeId}] ${agentRecordBase} / ${linkedAuthId}`, error.message, error);
    stats.errors = stats.errors + 1;
  }
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
