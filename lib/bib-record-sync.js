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
/**
 * Bib record synchronization.
 *
 * This module reacts to changes in BIB records (e.g. FIN01). When a bib
 * record changes, it re-resolves the authority records linked from the ‡0
 * subfields of the name/subject fields (100/110/111/600/610/611/700/710/711)
 * and updates the authorized portion in those fields to match the authority
 * records.
 */
const debug = require('debug')('@natlibfi/aleph-record-caretaker:bib-record-sync');
const { MarcRecord } = require('@natlibfi/marc-record');
const _ = require('lodash');
const utils = require('./utils');
const RecordUtils = require('./record-utils');
const syncCommon = require('./sync-common');
const authorityRecordLink = require('./authority-record-link');
const {AuthorizedPortion: MarcAuthorizedPortion} = require('@natlibfi/melinda-marc-record-utils');
const DEFAULT_LOGGER = syncCommon.createDefaultLogger(debug);
// Punctuation fix for bib records, shared with auth-record-sync via sync-common
const fieldFixPunctuation = syncCommon.fieldFixPunctuation;
function create(alephRecordService, alephFindService, options) {
  debug(`Create bib-record-sync with options: ${JSON.stringify(options)}`);
  const logger = _.get(options, 'logger', DEFAULT_LOGGER);
  const baseMap = options.baseMap;
  const recentChangesManager = utils.RecentChangesManager(syncCommon.RECENT_CHANGE_COOLDOWN_MS);
  async function handleBibChange(change) {
    const changeId = utils.randomString();
    logger.log('info', `[${changeId}] Handling changed bib record`, JSON.stringify(change));
    debug(`[${changeId}] Loading record ${change.library} / ${change.recordId}`);
    const record = await alephRecordService.loadRecord(change.library, change.recordId);
    if (RecordUtils.isRecordDeleted(record)) {
      logger.log('debug', `[${changeId}] Record is deleted, skipping.`);
      return;
    }
    const fixedRecord = MarcRecord.clone(record);
    fixedRecord.fields = await utils.serial(fixedRecord.fields.map(field => async () => {
      if (!_.includes(['100', '110', '111', '600', '610', '611', '700', '710', '711',], field.tag)) {
        return field;
      }
      // TODO: handlers for 800, 810, 811
      const authorityRecordLinkSubfields = field.subfields.filter(sub => sub.code === '0');
      if (authorityRecordLinkSubfields.length > 0) {
        let links = [];
        try {
          links = authorityRecordLinkSubfields.map(field => parseAuthorityRecordLinkGlobal(field.value,options));
        } catch(error) {
          logger.log('warn', `[${changeId}] ${change.library} / ${change.recordId}`, error.message);
        }
        const supportedLinks = links.filter(link => baseMap[link.base] !== undefined);
        const uniqSupportedLinks = _.uniqWith(supportedLinks, _.isEqual);
        if (uniqSupportedLinks.length > 1) {
          const offendingBases = uniqSupportedLinks.map(link => link.base).join(', ');
          throw new Error(`${change.library} / ${change.recordId} Record contains multiple links to supported bases (${offendingBases}). Unable to determine which one to use for updating the authorized portion.`);
        }
        if (uniqSupportedLinks.length === 1) {
          const { base, recordId } = uniqSupportedLinks[0];
          debug(`[${changeId}] ${change.library} / ${change.recordId} Loading authority record ${base} / ${recordId}`);
          const authorityRecord = await alephRecordService.loadRecord(baseMap[base], recordId);
          debug(`[${changeId}] ${change.library} / ${change.recordId} extracting authorized portion from auth record  ${base} / ${recordId}`);
          const authorizedPortion = RecordUtils.extractAuthorizedPortion(authorityRecord);
          const updatedField = MarcAuthorizedPortion.updateAuthorizedPortion(MarcAuthorizedPortion.RecordType.BIB, field, authorizedPortion);
          try {
            debug(`[${changeId}] ${change.library} / ${change.recordId} fixing punctuation`);
            fieldFixPunctuation(updatedField);
            debug(`[${changeId}] ${change.library} / ${change.recordId} Field after new punctuation fix ${RecordUtils.fieldToString(updatedField)}`);
          } catch(error) {
            logger.log('error', `[${changeId}] ${change.library} / ${change.recordId}`, error);
          }
          // NOTE: fixedField === updatedField, since fieldFixPunctuation mutates the field in place
          return updatedField;
        }
          return field;
      }
      return field;
    }));
    // NOTE: the bib sync module honors both the general no-operation flag and
    // the bib-specific one (NOOP_BIBCHANGE), see index.js.
    await syncCommon.saveIfChanged({
      logger,
      changeId,
      base: change.library,
      recordId: change.recordId,
      record,
      fixedRecord,
      recentChangesManager,
      saveRecord: (base, recordId, rec) => alephRecordService.saveRecord(base, recordId, rec),
      noOperation: !!(options.noOperation || options.noOperationBibChange)
    });
  }
  return {
    handleBibChange
  };
}
// Re-exported for backward compatibility (used by bib-record-sync.spec.js);
// the implementation now lives in lib/authority-record-link.js.
const parseAuthorityRecordLinkGlobal = authorityRecordLink.parseAuthorityRecordLink;
module.exports = {
  create,
  parseAuthorityRecordLinkGlobal
};
