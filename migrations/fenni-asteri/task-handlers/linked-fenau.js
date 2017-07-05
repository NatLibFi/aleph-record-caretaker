/* eslint no-console: 0 */

const _ = require('lodash');
const MarcRecord = require('marc-record-js');

const RecordUtils = require('../../../lib/record-utils');
const MigrationUtils = require('../migration-utils');

const taskUtils = require('./task-handler-utils');

function handleLinkedFenauRecord(fixPunctuationFromAuthField, task) {
  const { fenauRecordId, linkedFenauRecord, linkedFenauRecordId, fixedAuthorityRecord, queryTermsString } = task;


  if (MigrationUtils.isIndexTermRecord(linkedFenauRecord)) {
    console.log(`WARN FENAU auth_id ${linkedFenauRecordId} \t Linked record ${linkedFenauRecordId} is an index term record. Skipping.`);
    return Promise.resolve();
  }

  try {
    const fixedRecord = transformRecord(fixPunctuationFromAuthField, task);
    taskUtils.logFieldDiff(fixedRecord, linkedFenauRecord);

    console.log('DEBUG saving record to fenau', linkedFenauRecordId);
    
    return Promise.resolve();

  } catch(error) {

    taskUtils.errorLogger({
      record1Type: 'LINKED-AUTH', 
      record1: linkedFenauRecord,
      record2Type: 'AUTH',
      record2: fixedAuthorityRecord,
      linkSourceRecordId: linkedFenauRecordId,
      linkTargetRecordId: fenauRecordId,
      queryTermsString,
      db: 'FENAU',
      dbType: 'auth_id'
    })(error);
  }
}

function transformRecord(fixPunctuationFromAuthField, task) {

  const { fenauRecordId, asteriIdForLinking, linkedFenauRecord, linkedFenauRecordId, queryTermsForFieldSearch, fixedAuthorityRecord } = task;

  const fixedRecord = MarcRecord.clone(linkedFenauRecord);

  const fields = MigrationUtils.selectFieldFromAuthorityRecordForLinkingWithZero(linkedFenauRecord, queryTermsForFieldSearch);

  fixedRecord.fields = linkedFenauRecord.fields.map(field => {
    if (!_.includes(fields, field)) {
      return field;
    }

    const link = `(FI-ASTERI-N)${asteriIdForLinking}`;

    const fixedField = _.cloneDeep(field);
    if (!taskUtils.validateLink(fixedField, link)) {  
      throw new taskUtils.TaskError(`Record ${fenauRecordId} already has 0 link (${RecordUtils.fieldToString(fixedField)}) that is different from the one being added ${link}.`);
    }

    if (field.tag === '100') {
      const fennicaAutorityRecordNamePortion = RecordUtils.selectNamePortion(fixedAuthorityRecord);
      RecordUtils.setLinkedAuthorityNamePortion(fixedField, fennicaAutorityRecordNamePortion);
      fixPunctuationFromAuthField(fixedField);
    }
    if (_.isEqual(field, fixedField)) {

      RecordUtils.setSubfield(fixedField, '0', link, '9');
      const changedContent = RecordUtils.fieldToString(fixedField);
      console.log(`INFO FENAU auth_id ${linkedFenauRecordId} \t Adds $0 link without other changes:  ${changedContent}`);
    } else {
      
      const currentContent = RecordUtils.fieldToString(field);
      const changedContent = RecordUtils.fieldToString(fixedField);

      RecordUtils.setSubfield(fixedField, '0', link, '9');
      const changedContentWithLink = RecordUtils.fieldToString(fixedField);
      
      console.log(`WARN FENAU auth_id ${linkedFenauRecordId} \t Changes content in the field ${fixedField.tag}`);
      console.log(`WARN FENAU auth_id ${linkedFenauRecordId} \t Currently the content is: ${currentContent}`);
      console.log(`WARN FENAU auth_id ${linkedFenauRecordId} \t After update it becomes:  ${changedContent}`);
      console.log(`WARN FENAU auth_id ${linkedFenauRecordId} \t Adds $0 link:             ${changedContentWithLink}`);
    }
    return fixedField;

  });

  return RecordUtils.mergeDuplicateFields(fixedRecord);
}

module.exports = handleLinkedFenauRecord;