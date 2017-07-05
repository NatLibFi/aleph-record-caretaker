/* eslint no-console: 0 */

const _ = require('lodash');
const MarcRecord = require('marc-record-js');

const RecordUtils = require('../../../lib/record-utils');
const MigrationUtils = require('../migration-utils');

const taskUtils = require('./task-handler-utils');

function handleFenniRecord(link) {
  const { bibRecord, bib_id, queryTermsForFieldSearch, asteriIdForLinking, fixedAuthorityRecord, fenauRecordId, queryTermsString } = link;

  try {

    const fixedRecord = MarcRecord.clone(bibRecord);

    const fields = MigrationUtils.selectFieldForLinkingWithZero(bibRecord, queryTermsForFieldSearch);

    fixedRecord.fields = bibRecord.fields.map(field => {
      if (!_.includes(fields, field)) {
        return field;
      }

      if (RecordUtils.isLinkedField(field)) {
        console.log(`WARN: FENNI record ${bib_id} contains linked fields (cyrillic): ${RecordUtils.fieldToString(field)}`);
        return field;
      }

      return taskUtils.fixBibField('FENNI', '(FI-ASTERI-N)', asteriIdForLinking, fixedAuthorityRecord, bib_id, field);

    });
    
    const compactedRecord = RecordUtils.mergeDuplicateFields(fixedRecord);
    taskUtils.logFieldDiff(compactedRecord, bibRecord);

    console.log('DEBUG saving record to fenni', bib_id);
    
  } catch(error) {


    if (error instanceof MigrationUtils.LinkingQueryError && error.message === 'Could not find field') {
      const seeFromTracingFields = fixedAuthorityRecord.fields.filter(field => _.includes(['400', '410', '411'], field.tag));
      // normalize seeFromTracingFields

      const normalizeField = (field) => {
        return field.subfields
          .map(sub => sub.value)
          .map(MigrationUtils.normalizeForHeadingQuery)
          .join(' ');
      };

      const normalizedSeeFromTracingFieldValues = seeFromTracingFields.map(normalizeField);
      
      const matches = bibRecord.fields
        .filter(field => field.subfields !== undefined)
        .filter(field => _.includes(normalizedSeeFromTracingFieldValues, normalizeField(field)));

      if (!_.isEmpty(matches)) {
        const seeFromTracingFieldsStr = matches.map(RecordUtils.fieldToString);
        console.log(`WARN FENNI bib_id ${bib_id} \t Linked to ${fenauRecordId} by it's 'See From Tracing' (4XX) field (fields: ${seeFromTracingFieldsStr}). Not adding any links.`);
        return;
      }

    }

    taskUtils.errorLogger({
      record1Type: 'BIB', 
      record1: bibRecord,
      record2Type: 'AUTH',
      record2: fixedAuthorityRecord,
      linkSourceRecordId: bib_id,
      linkTargetRecordId: fenauRecordId,
      queryTermsString,
      db: 'FENNI',
      dbType: 'bib_id'
    })(error);

  }

}

module.exports = handleFenniRecord;