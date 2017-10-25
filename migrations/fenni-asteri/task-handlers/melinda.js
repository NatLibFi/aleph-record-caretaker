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
 *//* eslint no-console: 0 */

const _ = require('lodash');
const MarcRecord = require('marc-record-js');

const RecordUtils = require('../../../lib/record-utils');
const MigrationUtils = require('../migration-utils');

const taskUtils = require('./task-handler-utils');

const MelindaRecordService = require('../melinda-record-service-fast-unsafe');
const { XServerUrl, melindaEndpoint, melindaCredentials, dryRun } = taskUtils.readSettings();
const melindaRecordService = MelindaRecordService.createMelindaRecordService(melindaEndpoint, XServerUrl, melindaCredentials);

function transformRecord(melindaRecord, task) {
  
  const {melindaId, queryTermsForFieldSearch, asteriIdForLinking, fixedAuthorityRecord} = task;
  
  const fixedRecord = MarcRecord.clone(melindaRecord);

  const fields = MigrationUtils.selectFieldForLinkingWithZero(fixedRecord, queryTermsForFieldSearch);

  fixedRecord.fields = fixedRecord.fields.map(field => {
    if (!_.includes(fields, field)) {
      return field;
    }

    if (RecordUtils.isLinkedField(field)) {
      console.log(`WARN Melinda record ${melindaId} contains linked fields (cyrillic): ${RecordUtils.fieldToString(field)}`);
      return field;
    }
    
    return taskUtils.fixBibField('MELINDA', '(FIN11)', asteriIdForLinking, fixedAuthorityRecord, melindaId, field);

  });

  return fixedRecord;
}

function handleMelindaRecord(tasks) {
  
  const {melindaRecord, melindaId, asteriIdForLinking, fixedAuthorityRecord, fenauRecordId, queryTermsString} = _.head(tasks);
 
  try {

    const fixedRecord = tasks.reduce(transformRecord, _.head(tasks).melindaRecord);
    
    const compactedRecord = RecordUtils.mergeDuplicateFields(fixedRecord);
    taskUtils.logFieldDiff(compactedRecord, melindaRecord);
    
    if (taskUtils.recordsEqual(compactedRecord.toString(), melindaRecord.toString())) {
      console.log(`INFO MELINDA bib_id ${melindaId} \t No changes.`);
      return;
    }

    console.log(`INFO MELINDA bib_id ${melindaId} \t Saving record to melinda`);
    if (dryRun) {
      console.log(`INFO MELINDA bib_id ${melindaId} \t Dry run - not saving.`);
      return;
    }
    return melindaRecordService.saveRecord('fin01', melindaId, compactedRecord).then(res => {
      console.log(`INFO MELINDA bib_id ${melindaId} \t Record saved successfully`);
      return res;
    });

  } catch(error) {


    if (error instanceof MigrationUtils.LinkingQueryError && error.message === 'Could not find field') {
      // check for stuff
      const seeFromTracingFields = fixedAuthorityRecord.fields.filter(field => _.includes(['400', '410', '411'], field.tag));
      // normalize seeFromTracingFields

      const normalizeField = (field) => {
        return field.subfields
          .map(sub => sub.value)
          .map(MigrationUtils.normalizeForHeadingQuery)
          .join(' ');
      };

      const normalizedSeeFromTracingFieldValues = seeFromTracingFields.map(normalizeField);
      
      const matches = melindaRecord.fields
        .filter(field => field.subfields !== undefined)
        .filter(field => _.includes(normalizedSeeFromTracingFieldValues, normalizeField(field)));

      if (!_.isEmpty(matches)) {
        const seeFromTracingFieldsStr = matches.map(RecordUtils.fieldToString);
        console.log(`WARN MELINDA bib_id ${melindaId} \t Linked to ${asteriIdForLinking} [=(FENAU)${fenauRecordId}] by it's 'See From Tracing' (4XX) field (fields: ${seeFromTracingFieldsStr}). Not adding any links.`);
        return;
      }
      
    }

    taskUtils.errorLogger({
      record1Type: 'BIB', 
      record1: melindaRecord,
      record2Type: 'AUTH',
      record2: fixedAuthorityRecord,
      linkSourceRecordId: melindaId,
      linkTargetRecordId: fenauRecordId,
      queryTermsString,
      db: 'MELINDA',
      dbType: 'bib_id'
    })(error);

  }
}

module.exports = handleMelindaRecord;
