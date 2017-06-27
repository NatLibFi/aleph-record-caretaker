/* eslint no-console: 0 */

const _ = require('lodash');
const MarcRecord = require('marc-record-js');

const RecordUtils = require('../../../lib/record-utils');
const MigrationUtils = require('../migration-utils');

const taskUtils = require('./task-handler-utils');

function handleMelindaRecord(task) {
  const {melindaRecord, melindaId, queryTermsForFieldSearch, asteriIdForLinking, fixedAuthorityRecord, fenauRecordId, queryTermsString} = task;
  
  try {

    const fixedRecord = MarcRecord.clone(melindaRecord);

    const fields = MigrationUtils.selectFieldForLinkingWithZero(melindaRecord, queryTermsForFieldSearch);

    fixedRecord.fields = melindaRecord.fields.map(field => {
      if (!_.includes(fields, field)) {
        return field;
      }
  
      if (RecordUtils.isLinkedField(field)) {
        console.log(`WARN Melinda record ${melindaId} contains linked fields (cyrillic): ${RecordUtils.fieldToString(field)}`);
        return field;
      }
      
      return taskUtils.fixBibField('MELINDA', '(FIN11)', asteriIdForLinking, fixedAuthorityRecord, melindaId, field);

    });


    const compactedRecord = RecordUtils.mergeDuplicateFields(fixedRecord);
    taskUtils.logFieldDiff(compactedRecord, melindaRecord);

    console.log('DEBUG saving record to melinda', melindaId);

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

      if (matches) {
        console.log(`WARN MELINDA bib_id ${melindaId} \t Linked to ${asteriIdForLinking} [=(FENAU)${fenauRecordId}] by it's 'See From Tracing' (4XX) field. Not adding any links.`);
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
