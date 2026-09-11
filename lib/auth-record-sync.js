/**
 * Copyright 2017-2019, 2026 University Of Helsinki (The National Library Of Finland)
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
/**
 * Authority record synchronization.
 *
 * This module is triggered by ANY change in an authority record (e.g. FIN11 /
 * FIN19), not only changes to the authorized portion itself. On every such
 * change it extracts the current authorized portion of the authority record
 * and propagates it to all bib records and linked agent (authority) records
 * that reference the changed record via a ‡0 subfield. When the propagated
 * value does not differ from what is already in the linked record, the save is
 * a no-op.
 */

const _ = require('lodash');
const debug = require('debug')('@natlibfi/aleph-record-caretaker:auth-record-sync');
const debugDev = require('debug')('@natlibfi/aleph-record-caretaker:auth-record-sync:dev');
const { MarcRecord } = require('@natlibfi/marc-record');
const utils = require('./utils');
const RecordUtils = require('./record-utils');
const syncCommon = require('./sync-common');
const authorityRecordLink = require('./authority-record-link');
const {Punctuation: MarcPunctuation, AuthorizedPortion: MarcAuthorizedPortion} = require('@natlibfi/melinda-marc-record-utils');
const DEFAULT_LOGGER = syncCommon.createDefaultLogger(debug);

// Punctuation fix for bib records, shared with bib-record-sync via sync-common
const fieldFixPunctuation = syncCommon.fieldFixPunctuation;

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
    recentChangesManager: utils.RecentChangesManager(syncCommon.RECENT_CHANGE_COOLDOWN_MS),
    fixPunctuationFromAuthField
  };

  return {
    handleAuthChange: (change) => handleAuthChange(context, change)
  };
}

function createStats() {
  return { noChanges: 0, changes: 0, saves: 0, errors: 0, noOps: 0, recents: 0 };
}

// Maps the status returned by syncCommon.saveIfChanged onto the stats object.
// Note: any status other than 'noChange' means the record differed, so the
// changes counter is incremented alongside the status-specific counter.
function recordResult(stats, status) {
  switch (status) {
    case 'noChange': stats.noChanges = stats.noChanges + 1; break;
    case 'recent': stats.changes = stats.changes + 1; stats.recents = stats.recents + 1; break;
    case 'noOp': stats.changes = stats.changes + 1; stats.noOps = stats.noOps + 1; break;
    case 'saved': stats.changes = stats.changes + 1; stats.saves = stats.saves + 1; break;
    case 'error': stats.changes = stats.changes + 1; stats.errors = stats.errors + 1; break;
  }
}

function extractAuthorizedPortion(authorityRecord, change, changeId) {
  debug(`[${changeId}] extracting authorized portion from auth record ${change.recordId}`);
  const authorizedPortion = RecordUtils.extractAuthorizedPortion(authorityRecord);
  debug(`[${changeId}] Authorized portion from record ${change.recordId} is ${JSON.stringify(authorizedPortion)}`);
  return authorizedPortion;
}

function formatBibSummary(bibCount, s) {
  return `BibCount: ${bibCount}. bibNoChanges: ${s.noChanges}, bibChanges: ${s.changes}, bibSaves: ${s.saves}, bibErrors ${s.errors}, bibNoOps: ${s.noOps}, bibRecents: ${s.recents}`;
}

function formatLinkedAgentSummary(count, s) {
  return `linkedAgentCount: ${count}. linkedAgentNoChanges: ${s.noChanges}, linkedAgentChanges: ${s.changes}, linkedAgentSaves: ${s.saves}, linkedAgentErrors ${s.errors}, linkedAgentNoOps: ${s.noOps}, linkedAgentRecents: ${s.recents}`;
}

async function handleAuthChange(context, change) {
  const changeId = utils.randomString();
  const logger = context.logger;

  logger.log('info', `[${changeId}] Handling changed auth record`, JSON.stringify(change));
  debug(`[${changeId}] loading auth record ${change.recordId}`);
  const authorityRecord = await context.alephRecordService.loadRecord(change.library, change.recordId);
  debug(`[${changeId}] Authority record (${change.recordId}):\n${authorityRecord.toString()}`);

  if (RecordUtils.isRecordDeleted(authorityRecord)) {
    // TODO: we could do something for records linked to deleted authority record - at least some kind of repor
    logger.log('info', `[${changeId}] Authority record ${change.recordId} is deleted, skipping.`);
    return;
  }

  const authorizedPortion = extractAuthorizedPortion(authorityRecord, change, changeId);

  const {bibRecordBase, agentRecordBase} = context.options;

  debug(`[${changeId}] query from index for bib records that are linked to this auth record (${change.recordId})`);
  const bibIdList = await context.alephFindService.findRecordsLinkedToAgentRecord(bibRecordBase, change.recordId);
  debug(`[${changeId}] Bib records (${bibIdList.length}) [${bibIdList.join(', ')}]`);

  const bibStats = createStats();
  for (const bibId of bibIdList) {
    await processBibRecord(context, bibId, authorizedPortion, change, changeId, bibStats);
  }
  logger.log('info', `[${changeId}] Handled bibs linked to ${change.recordId}: ${formatBibSummary(bibIdList.length, bibStats)}`);

  debug(`[${changeId}] loading linked auth records for ${change.recordId} in ${agentRecordBase}`);
  const linkedAgentAuthIdList = await context.alephFindService.findRecordsLinkedToAgentRecord(agentRecordBase, change.recordId);
  debug(`[${changeId}] Linked to ${change.recordId} auth records [${linkedAgentAuthIdList.join(', ')}]`);

  const linkedAgentStats = createStats();
  for (const linkedAuthId of linkedAgentAuthIdList) {
    await processLinkedAuthRecord(context, linkedAuthId, authorizedPortion, change, changeId, linkedAgentStats);
  }
  logger.log('info', `[${changeId}] Handled linkedAgents linked to ${change.recordId}: ${formatLinkedAgentSummary(linkedAgentAuthIdList.length, linkedAgentStats)}`);
}

async function processBibRecord(context, bibId, authorizedPortion, change, changeId, stats) {
  const bibRecordBase = context.options.bibRecordBase;
  return processLinkedRecord(context, {
    base: bibRecordBase,
    recordId: bibId,
    updateField: (field, authorizedPortion) => {
      debugDev(`[${changeId}] ${bibRecordBase} / ${bibId} Field before updateAuthorizedPortion and fieldFixPunctuation: ${RecordUtils.fieldToString(field)}`);
      const updatedField = MarcAuthorizedPortion.updateAuthorizedPortion(MarcAuthorizedPortion.RecordType.BIB, field, authorizedPortion);
      debugDev(`[${changeId}] ${bibRecordBase} / ${bibId} Field after updateAuthorizedPortion ${RecordUtils.fieldToString(updatedField)}`);
      const fixedField = fieldFixPunctuation(updatedField, true);
      debugDev(`[${changeId}] ${bibRecordBase} / ${bibId} Field after new punctuation fix ${RecordUtils.fieldToString(fixedField)}`);
      return fixedField;
    }
  }, authorizedPortion, change, changeId, stats);
}

async function processLinkedAuthRecord(context, linkedAuthId, authorizedPortion, change, changeId, stats) {
  const agentRecordBase = context.options.agentRecordBase;
  return processLinkedRecord(context, {
    base: agentRecordBase,
    recordId: linkedAuthId,
    updateField: (field, authorizedPortion) => {
      const updatedField = MarcAuthorizedPortion.updateAuthorizedPortion(MarcAuthorizedPortion.RecordType.AUTH, field, authorizedPortion);
      context.fixPunctuationFromAuthField(updatedField);
      return updatedField;
    }
  }, authorizedPortion, change, changeId, stats);
}

// Shared processing for a record (bib or linked agent) that contains a ‡0 link
// to the changed authority record.
// params: { base, recordId, updateField }
//   updateField: (field, authorizedPortion) => updatedField - applies the
//   record-type-specific authorized-portion update and punctuation fix.
async function processLinkedRecord(context, params, authorizedPortion, change, changeId, stats) {
  const logger = context.logger;
  const { base, recordId, updateField } = params;
  try {
    logger.log('debug', `[${changeId}] Loading record ${base} / ${recordId}`);
    const record = await context.alephRecordService.loadRecord(base, recordId);

    if (RecordUtils.isRecordDeleted(record)) {
      logger.log('info', `[${changeId}] Record ${base} / ${recordId} is deleted, skipping.`);
      stats.noChanges = stats.noChanges + 1;
      return;
    }

    debug(`[${changeId}] checking and maybe resetting authorized portion from ${base} / ${recordId} fields. Multiple fields may link to same authority.`);
    // TODO: error when a field contains multiple different ‡0 identifiers for the same base,
    // like bib-record-sync does. Currently the field is matched by any ‡0 subfield and all
    // identifiers are silently preserved (see skipped test in auth-record-sync.spec.js).

    const fixedRecord = MarcRecord.clone(record);

    debug(`[${changeId}] Updating fields in ${base} / ${recordId} with ‡0 link to ${change.library} / ${change.recordId} (ISIL, plain base or URN form)`);
    const isLinkToChange = authorityRecordLink.createFieldMatcher(change, context.options);
    // Build the fixed fields on the clone; the original record stays untouched
    // for the recordChanged/patch comparison below.
    fixedRecord.fields = fixedRecord.fields.map(field => {
      if (field.subfields === undefined) return field;
      if (!isLinkToChange(field)) return field;
      return updateField(field, authorizedPortion);
    });

    // NOTE: the auth sync module uses only the general no-operation flag.
    // (The bib sync module additionally honors noOperationBibChange.)
    const status = await syncCommon.saveIfChanged({
      logger,
      changeId,
      base,
      recordId,
      record,
      fixedRecord,
      recentChangesManager: context.recentChangesManager,
      saveRecord: (b, rid, rec) => context.alephRecordService.saveRecord(b, rid, rec),
      noOperation: context.options.noOperation
    });
    recordResult(stats, status);
  } catch(error) {
    stats.errors = stats.errors + 1;
    logger.log('error', `[${changeId}] ${base} / ${recordId}`, error.message, error);
  }
}

// Re-exported for backward compatibility (used by auth-record-sync.spec.js);
// the implementation now lives in lib/authority-record-link.js.
const { createUrnQuery, createUrnQueryPadded, createPlainBaseQuery } = authorityRecordLink;

module.exports = {
  create,
  createUrnQuery,
  createUrnQueryPadded,
  createPlainBaseQuery
};
