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

const _ = require('lodash');
const utils = require('./utils');
const RecordUtils = require('./record-utils');
// Shared punctuation fix function for bib records (required once, by both sync modules)
const fieldFixPunctuation = require('@natlibfi/marc-record-validators-melinda/dist/punctuation2').fieldFixPunctuation;

// Cooldown for the recent-changes manager: if the caretaker itself made the
// same change within this window, the change is considered a confirmation of
// its own work and is skipped.
const RECENT_CHANGE_COOLDOWN_MS = 20000;

// Creates a logger that writes through a debug function, used as the default
// logger when no logger is provided in options.
function createDefaultLogger(debug) {
  return { log: (level, message) => debug(`${level}: ${message}`) };
}

// Whether a fixed record differs from the original record (fields or leader).
function recordChanged(original, fixed) {
  return !_.isEqual(original.fields, fixed.fields) || !_.isEqual(original.leader, fixed.leader);
}

// Builds a { prev, next } patch of human-readable field strings between
// the original and fixed field arrays.
function createPatch(originalFields, fixedFields) {
  const { a, b } = utils.deepDiff(originalFields, fixedFields);
  return {
    prev: a.map(RecordUtils.fieldToString),
    next: b.map(RecordUtils.fieldToString)
  };
}

// Logs the previous and next field values of a patch.
function logPatch(logger, changeId, base, recordId, patch) {
  logger.log('info', `[${changeId}] ${base} / ${recordId} Previous values: ${patch.prev}`);
  logger.log('info', `[${changeId}] ${base} / ${recordId} Next values: ${patch.next}`);
}

/**
 * Shared "compare, maybe save, report" flow for record sync modules.
 *
 * Checks whether the fixed record differs from the original; if so, logs the
 * patch, skips the save when the caretaker itself made the same change recently
 * (recent-changes cooldown) or when the caller's no-operation flag is set, and
 * otherwise saves the fixed record. Save failures are logged and reported via
 * the returned status instead of being thrown.
 *
 * NOTE: `noOperation` must be a caller-precomputed boolean, because the sync
 * modules use different flag semantics:
 *   - bib-record-sync: options.noOperation || options.noOperationBibChange
 *   - auth-record-sync: options.noOperation
 *
 * params:
 *   logger, changeId, base, recordId - for logging
 *   record, fixedRecord - original and fixed MarcRecords
 *   recentChangesManager - a utils.RecentChangesManager instance
 *   saveRecord - async (base, recordId, fixedRecord) => ...
 *   noOperation - boolean, see note above
 *
 * returns: 'noChange' | 'recent' | 'noOp' | 'saved' | 'error'
 */
async function saveIfChanged({ logger, changeId, base, recordId, record, fixedRecord, recentChangesManager, saveRecord, noOperation }) {
  if (!recordChanged(record, fixedRecord)) {
    logger.log('debug', `[${changeId}] ${base} / ${recordId} The record was not changed.`);
    return 'noChange';
  }

  logger.log('info', `[${changeId}] ${base} / ${recordId} The record has changed.`);

  const patch = createPatch(record.fields, fixedRecord.fields);
  logPatch(logger, changeId, base, recordId, patch);

  const wasRecentChange = recentChangesManager.checkAndUpdateRecentChanges(base, recordId, patch);
  if (wasRecentChange) {
    logger.log('info', `[${changeId}] ${base} / ${recordId} I recently made this change, so skipping this for now.`);
    return 'recent';
  }

  if (noOperation) {
    logger.log('info', `[${changeId}] ${base} / ${recordId} no-operation flag is set, not saving record`);
    return 'noOp';
  }

  logger.log('info', `[${changeId}] ${base} / ${recordId} Saving changed record.`);
  try {
    await saveRecord(base, recordId, fixedRecord);
    logger.log('info', `[${changeId}] Record ${base} / ${recordId} was saved succesfully.`);
    return 'saved';
  } catch (error) {
    logger.log('error', `[${changeId}] Saving ${base} / ${recordId} failed.`);
    logger.log('error', `[${changeId}] ${base} / ${recordId}`, error.message, error);
    return 'error';
  }
}

module.exports = {
  RECENT_CHANGE_COOLDOWN_MS,
  fieldFixPunctuation,
  createDefaultLogger,
  recordChanged,
  createPatch,
  logPatch,
  saveIfChanged
};
