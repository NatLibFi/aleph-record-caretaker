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

const debug = require('debug')('@natlibfi/aleph-record-caretaker:bib-record-sync');
const MarcRecord = require('marc-record-js');
const _ = require('lodash');
const utils = require('./utils');
const RecordUtils = require('./record-utils');
const {Punctuation: MarcPunctuation, AuthorizedPortion: MarcAuthorizedPortion} = require('@natlibfi/melinda-marc-record-utils');
const DEFAULT_LOGGER = { log: (level, message) => debug(`${level}: ${message}`) };
const RECENT_CHANGE_COOLDOWN_MS = 20000;

// Use the new punctuation fix function from @natlibfi/marc-record-validators-melinda for bib records
const fieldFixPunctuation = require('@natlibfi/marc-record-validators-melinda/dist/punctuation2').fieldFixPunctuation;

function create(alephRecordService, alephFindService, options) {
  debug(`Create bib-record-sync with options: ${JSON.stringify(options)}`);

  const logger = _.get(options, 'logger', DEFAULT_LOGGER);
  const baseMap = options.baseMap;
  const recentChangesManager = utils.RecentChangesManager(RECENT_CHANGE_COOLDOWN_MS);

  async function handleBibChange(change) {
    const changeId = utils.randomString();

    logger.log('info', `[${changeId}] Handling changed bib record`, JSON.stringify(change));

    debug(`[${changeId}] Loading record ${change.library} / ${change.recordId}`);
    const record = await alephRecordService.loadRecord(change.library, change.recordId);

    if (record.isDeleted()) {
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

          // TODO: this supports only agent authorities. Expand to support also subject authorities
          debug(`[${changeId}] ${change.library} / ${change.recordId} extracting authorized portion from auth record  ${base} / ${recordId}`);
          const authorizedFields = authorityRecord.fields.filter(field => _.includes(['100', '110', '111'], field.tag));

          if (authorizedFields.length !== 1) {
            throw new Error(`Could not parse authorized portion from authority record ${base} / ${recordId}`);
          }
          const authorizedPortion = MarcAuthorizedPortion.findAuthorizedPortion(MarcAuthorizedPortion.RecordType.AUTH, authorizedFields[0]);

          const updatedField = MarcAuthorizedPortion.updateAuthorizedPortion(MarcAuthorizedPortion.RecordType.BIB, field, authorizedPortion);
          try {
            debug(`[${changeId}] ${change.library} / ${change.recordId} fixing punctuation`);
            fieldFixPunctuation(updatedField);
            debugDev(`[${changeId}] ${bibRecordBase} / ${bibId} Field after new punctuation fix ${RecordUtils.fieldToString(fixedField)}`);

          } catch(error) {
            logger.log('error', `[${changeId}] ${change.library} / ${change.recordId}`, error);
          }
          // NOTE: fixedField === updatedField, since fieldFixPunctuation mutates the field in place
          return updatedField;

        } else {
          return field;
        }
      }

      return field;

    }));

    if (!_.isEqual(record.fields, fixedRecord.fields) || !_.isEqual(record.leader, fixedRecord.leader)) {
      logger.log('debug', `[${changeId}] ${change.library} / ${change.recordId} The record has changed.`);

      const {a, b} = utils.deepDiff(record.fields, fixedRecord.fields);

      const patch = {
        prev: a.map(RecordUtils.fieldToString),
        next: b.map(RecordUtils.fieldToString)
      };

      logger.log('info', `[${changeId}] ${change.library} / ${change.recordId} Previous values: ${patch.prev}`);
      logger.log('info', `[${changeId}] ${change.library} / ${change.recordId} Next values: ${patch.next}`);

      const wasRecentChange = recentChangesManager.checkAndUpdateRecentChanges(change.library, change.recordId, patch);
      if (wasRecentChange) {
        logger.log('info', `[${changeId}] ${change.library} / ${change.recordId} I recently made this change, so skipping this for now.`);
        return;
      }

      if (options.noOperation || options.noOperationBibChange) {
        logger.log('info', `[${changeId}] ${change.library} / ${change.recordId} no-operation flag is set, not saving record`);
      } else {
        logger.log('info', `[${changeId}] ${change.library} / ${change.recordId} Saving changed bib record.`);
        try {
          await alephRecordService.saveRecord(change.library, change.recordId, fixedRecord);
          logger.log('info', `[${changeId}] Record ${change.library} / ${change.recordId} was saved succesfully.`);
        } catch(error) {
          logger.log('error', `[${changeId}] Saving ${change.library} / ${change.recordId} failed.`);
          logger.log('error', `[${changeId}] ${change.library} / ${change.recordId}`, error.message, error);
        }

      }

    } else {
      logger.log('debug', `[${changeId}] ${change.library} / ${change.recordId} The record was not changed.`);
    }
  }

  return {
    handleBibChange
  };
}

function parseAuthorityRecordLinkGlobal(authorityRecordLink, options) {
  const match = /^\((.*)\)(\d+)([,.]?)$/.exec(authorityRecordLink);
    if (match) {
      const [,base,recordId] = match;
      return { base, recordId };
    }

   // TODO: handle non-numeric recordIds

    const urnRegexp = RegExp("^"+options.urnResolverPrefix+"(.*:)(.*)$");
    const urn = urnRegexp.exec(authorityRecordLink);

    if (urn) {
      const [, prefix, id] = urn;
      const urnBase = _.invert(options.urnBaseMap)[prefix];

      if (typeof urnBase !== 'undefined' && urnBase !== null) {
        return { 'base': urnBase, 'recordId': id };
      } else {
        throw new Error(`Found non-mapped URN in: ${authorityRecordLink}. ${prefix}  ${id} ${urnBase}`);
      }
    }

  const url = /^http:\/\//.exec(authorityRecordLink);
   if (url) {
    throw new Error(`Invalid format (url) in subfield 0: ${authorityRecordLink}. Not matching known URN pattern: ${options.urnResolverPrefix}`);
   }
  throw new Error(`Invalid format in subfield 0: ${authorityRecordLink}`);
}

module.exports = {
  create,
  parseAuthorityRecordLinkGlobal
};
