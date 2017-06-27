/* eslint no-console: 0 */

const _ = require('lodash');
const MarcRecord = require('marc-record-js');

const RecordUtils = require('../../../lib/record-utils');
const MigrationUtils = require('../migration-utils');

const taskUtils = require('./task-handler-utils');

function handleLinkedAsteriRecord(fixPunctuationFromAuthField, link) {
  
  const { fixedAuthorityRecord, linkedAsteriRecord, linkedAsteriId, asteriIdForLinking, queryTermsForFieldSearch, queryTermsString} = link;

  try {
    
    const fixedRecord = MarcRecord.clone(linkedAsteriRecord);

    const fields = MigrationUtils.selectFieldFromAuthorityRecordForLinkingWithZero(linkedAsteriRecord, queryTermsForFieldSearch);

    fixedRecord.fields = linkedAsteriRecord.fields.map(field => {
      if (!_.includes(fields, field)) {
        return field;
      }

      const link = `(FIN11)${asteriIdForLinking}`;

      const fixedField = _.cloneDeep(field);
      if (!taskUtils.validateLink(fixedField, link)) {  
        throw new taskUtils.TaskError(`Record ${linkedAsteriId} already has 0 link (${RecordUtils.fieldToString(fixedField)}) that is different from the one being added ${link}.`);
      }

      
      if (field.tag === '100') {
        const fennicaAutorityRecordNamePortion = MigrationUtils.selectNamePortion(fixedAuthorityRecord);
        MigrationUtils.setLinkedAuthorityNamePortion(fixedField, fennicaAutorityRecordNamePortion);
        fixPunctuationFromAuthField(fixedField);
      }
      if (_.isEqual(field, fixedField)) {

        RecordUtils.setSubfield(fixedField, '0', link, '9');
        const changedContent = RecordUtils.fieldToString(fixedField);
        console.log(`INFO ASTERI auth_id ${linkedAsteriId} \t Adds $0 link without other changes:  ${changedContent}`);
      } else {
        
        const currentContent = RecordUtils.fieldToString(field);
        const changedContent = RecordUtils.fieldToString(fixedField);

        RecordUtils.setSubfield(fixedField, '0', link, '9');
        const changedContentWithLink = RecordUtils.fieldToString(fixedField);
        
        console.log(`WARN ASTERI auth_id ${linkedAsteriId} \t Changes content in the field ${fixedField.tag}`);
        console.log(`WARN ASTERI auth_id ${linkedAsteriId} \t Currently the content is: ${currentContent}`);
        console.log(`WARN ASTERI auth_id ${linkedAsteriId} \t After update it becomes:  ${changedContent}`);
        console.log(`WARN ASTERI auth_id ${linkedAsteriId} \t Adds $0 link:             ${changedContentWithLink}`);
      }

      return fixedField;

    });


    const compactedRecord = RecordUtils.mergeDuplicateFields(fixedRecord);
    taskUtils.logFieldDiff(compactedRecord, linkedAsteriRecord);

    console.log('DEBUG saving record to asteri', linkedAsteriId);
    


  } catch(error) {

    taskUtils.errorLogger({
      record1Type: 'LINKED-ASTERI', 
      record1: linkedAsteriRecord,
      record2Type: 'ASTERI-AUTH',
      record2: fixedAuthorityRecord,
      linkSourceRecordId: linkedAsteriId,
      linkTargetRecordId: asteriIdForLinking,
      queryTermsString,
      db: 'ASTERI',
      dbType: 'auth_id'
    })(error);

  }
}

module.exports = handleLinkedAsteriRecord;