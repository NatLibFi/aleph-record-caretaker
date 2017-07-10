/* eslint no-console: 0 */

const _ = require('lodash');
const MarcRecord = require('marc-record-js');

const RecordUtils = require('../../../lib/record-utils');
const MigrationUtils = require('../migration-utils');

const taskUtils = require('./task-handler-utils');

function handleAsteriRecordFix(fixPunctuationFromAuthField, task) {

  const {asteriRecord, queryTermsForFieldSearch, asteriIdForLinking, fixedAuthorityRecord, queryTermsString} = task;
  
  const fixedRecord = MarcRecord.clone(asteriRecord);

  try {
    
    const fields = MigrationUtils.selectFieldForLinkingWithZero(asteriRecord, queryTermsForFieldSearch);

    fixedRecord.fields = asteriRecord.fields.map(field => {
      if (!_.includes(fields, field)) {
        return field;
      }

      const link = `(FIN11)${asteriIdForLinking}`;

      const fixedField = _.cloneDeep(field);
      if (!taskUtils.validateLink(fixedField, link)) {  
        throw new taskUtils.TaskError(`Record ${asteriIdForLinking} already has 0 link (${RecordUtils.fieldToString(fixedField)}) that is different from the one being added ${link}.`);
      }

      if (field.tag === '100') {
        const fennicaAuthorizedPortion = MigrationUtils.selectAuthorizedPortion(fixedAuthorityRecord);
        MigrationUtils.setAuthorizedPortion(fixedField, fennicaAuthorizedPortion);
        fixPunctuationFromAuthField(fixedField);
      }
      if (_.isEqual(field, fixedField)) {

        RecordUtils.setSubfield(fixedField, '0', link, '9');
        const changedContent = RecordUtils.fieldToString(fixedField);
        console.log(`INFO ASTERI auth_id ${asteriIdForLinking} \t Adds $0 link without other changes:  ${changedContent}`);
      } else {
        
        const currentContent = RecordUtils.fieldToString(field);
        const changedContent = RecordUtils.fieldToString(fixedField);

        RecordUtils.setSubfield(fixedField, '0', link, '9');
        const changedContentWithLink = RecordUtils.fieldToString(fixedField);
        
        console.log(`WARN ASTERI auth_id ${asteriIdForLinking} \t Changes content in the field ${fixedField.tag}`);
        console.log(`WARN ASTERI auth_id ${asteriIdForLinking} \t Currently the content is: ${currentContent}`);
        console.log(`WARN ASTERI auth_id ${asteriIdForLinking} \t After update it becomes:  ${changedContent}`);
        console.log(`WARN ASTERI auth_id ${asteriIdForLinking} \t Adds $0 link:             ${changedContentWithLink}`);
      }

      return fixedField;

    });

    const compactedRecord = RecordUtils.mergeDuplicateFields(fixedRecord);
    taskUtils.logFieldDiff(compactedRecord, asteriRecord);

    console.log('DEBUG saving record to asteri', asteriIdForLinking);
    // save compactedRecord to asteri


  } catch(error) {

    taskUtils.errorLogger({
      record1Type: 'ASTERI-AUTH', 
      record1: asteriRecord,
      record2Type: 'AUTH',
      record2: fixedAuthorityRecord,
      linkSourceRecordId: asteriIdForLinking,
      linkTargetRecordId: asteriIdForLinking,
      queryTermsString,
      db: 'ASTERI',
      dbType: 'auth_id'
    })(error);
  }
}

module.exports = handleAsteriRecordFix;