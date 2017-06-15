/* eslint no-console: 0 */

const _ = require('lodash');
const RecordUtils = require('../../lib/record-utils');
const fixBibRecordField = require('./fix-bib-record');
const fs = require('fs');

const Constants = require('./constants');
const TASK_TYPES = Constants.TASK_TYPES;

const MarcPunctuation = require('./marc-punctuation-fix');

const bibRules = MarcPunctuation.readRulesFromCSV(fs.readFileSync('./melinda-bib-punctuation.csv', 'utf8'));
const authRules =  MarcPunctuation.readRulesFromCSV(fs.readFileSync('./melinda-auth-punctuation.csv', 'utf8'));

const fixPunctuationFromBibField = MarcPunctuation.createRecordFixer(bibRules);
const fixPunctuationFromAuthField = MarcPunctuation.createRecordFixer(authRules, MarcPunctuation.RecordTypes.AUTHORITY);


function handleLinkings(task) {

  if (task.type === TASK_TYPES.FENAU_ASTERI) {
    handleFenauRecord(task);
  }

  if (task.type === TASK_TYPES.LINKED_FENAU_ASTERI) {
    handleLinkedFenauRecord(task);
  }

  if (task.type === TASK_TYPES.FENNI_ASTERI) {
    handleFenniRecord(task);
  }

  if (task.type === TASK_TYPES.LINKED_ASTERI_ASTERI) {
    handleLinkedAsteriRecord(task);
  }

  if (task.type === TASK_TYPES.ASTERI_ASTERI) {
    handleAsteriRecordFix(task);
  }

  if (task.type === TASK_TYPES.MELINDA_ASTERI) {
    handleMelindaRecord(task);
  }
}

function handleAsteriRecordFix(task) {

  const {asteriRecord, queryTermsForFieldSearch, asteriIdForLinking, fixedAuthorityRecord, queryTermsString} = task;
  
  try {
    
    const fields = RecordUtils.selectFieldForLinkingWithZero(asteriRecord, queryTermsForFieldSearch);
    fields.forEach(field => {

      const link = `(FIN11)${asteriIdForLinking}`;

      const fixedField = _.cloneDeep(field);
      
      if (field.tag === '100') {
        const fennicaAuthorizedPortion = RecordUtils.selectAuthorizedPortion(fixedAuthorityRecord);
        RecordUtils.setAuthorizedPortion(fixedField, fennicaAuthorizedPortion);
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

    });
  } catch(error) {

    errorLogger({
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

function handleMelindaRecord(task) {
  const {melindaRecord, melindaId, queryTermsForFieldSearch, asteriIdForLinking, fixedAuthorityRecord, fenauRecordId, queryTermsString} = task;
  
  try {
    const fields = RecordUtils.selectFieldForLinkingWithZero(melindaRecord, queryTermsForFieldSearch);

    fields.forEach(field => {
  
      if (RecordUtils.isLinkedField(field)) {
        console.log(`ERROR: Melinda record ${melindaId} contains linked fields (cyrillic)`);
        console.log('BIB:');
        console.log(melindaRecord.toString());
        return;
      }
      
      describeAction('MELINDA', '(FIN11)', asteriIdForLinking, fixedAuthorityRecord, melindaId, field);
    });

    return melindaRecord;
  } catch(error) {

    errorLogger({
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

function handleLinkedAsteriRecord(link) {
  
  const { fixedAuthorityRecord, linkedAsteriRecord, linkedAsteriId, asteriIdForLinking, queryTermsForFieldSearch, queryTermsString} = link;

  try {
    
    const fields = RecordUtils.selectFieldFromAuthorityRecordForLinkingWithZero(linkedAsteriRecord, queryTermsForFieldSearch);
    fields.forEach(field => {

      const link = `(FIN11)${asteriIdForLinking}`;

      const fixedField = _.cloneDeep(field);
      
      if (field.tag === '100') {
        const fennicaAutorityRecordNamePortion = RecordUtils.selectNamePortion(fixedAuthorityRecord);
        RecordUtils.setLinkedAuthorityNamePortion(fixedField, fennicaAutorityRecordNamePortion);
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

    });
  } catch(error) {

    errorLogger({
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

function handleFenniRecord(link) {

  const { bibRecord, bib_id, queryTermsForFieldSearch, asteriIdForLinking, fixedAuthorityRecord, fenauRecordId, queryTermsString } = link;

  // find the tag we want
  try {
    const fields = RecordUtils.selectFieldForLinkingWithZero(bibRecord, queryTermsForFieldSearch);
    fields.forEach(field => {
      // actually, the normal case is that the authority record is incorrect, so when that is fixed the linked ones are wrong
      // and fuzzy ones *may* be correct.
      

      if (RecordUtils.isLinkedField(field)) {
        console.log(`ERROR: FENNI record ${bib_id} contains linked fields (cyrillic)`);
        console.log('BIB:');
        console.log(bibRecord.toString());
        return;
      }

      
      describeAction('FENNI', '(FI-ASTERI-N)', asteriIdForLinking, fixedAuthorityRecord, bib_id, field);
      
    });
    
  } catch(error) {

    errorLogger({
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

function describeAction(db, linkPrefix, asteriId, fixedAuthorityRecord, bib_id, field) {

  const link = `${linkPrefix}${asteriId}`;

  // TODO: before fixing bib record field we have to ensure that we will not overwrite any current d subfields. Throw error if target contains d subfield with differing content.
  const fixedField = fixBibRecordField(field, fixedAuthorityRecord);
  fixPunctuationFromBibField(fixedField);

  if (_.isEqual(field, fixedField)) {
    RecordUtils.setSubfield(fixedField, '0', link, '9');
    const changedContent = RecordUtils.fieldToString(fixedField);
    console.log(`INFO ${db} bib_id ${bib_id} \t Adds $0 link without other changes:  ${changedContent}`);
  } else {
    
    const currentContent = RecordUtils.fieldToString(field);
    const changedContent = RecordUtils.fieldToString(fixedField);

    RecordUtils.setSubfield(fixedField, '0', link, '9');
    const changedContentWithLink = RecordUtils.fieldToString(fixedField);
    
    //console.log(`INFO: I would link authority record ${auth_id} to bibliographic record ${bib_id} with $0 subfield in field ${field.tag} containing ${link}`);
    
    console.log(`WARN ${db} bib_id ${bib_id} \t Changes content in the field ${fixedField.tag}`);
    console.log(`WARN ${db} bib_id ${bib_id} \t Currently the content is: ${currentContent}`);
    console.log(`WARN ${db} bib_id ${bib_id} \t After update it becomes:  ${changedContent}`);
    console.log(`WARN ${db} bib_id ${bib_id} \t Adds $0 link:             ${changedContentWithLink}`);
  }
  
}

function handleLinkedFenauRecord(link) {

  const { fenauRecordId, asteriIdForLinking, linkedFenauRecord, linkedFenauRecordId, queryTermsForFieldSearch, queryTermsString, fixedAuthorityRecord } = link;

  try {
    
    const fields = RecordUtils.selectFieldFromAuthorityRecordForLinkingWithZero(linkedFenauRecord, queryTermsForFieldSearch);
    fields.forEach(field => {

      const link = `(FI-ASTERI-N)${asteriIdForLinking}`;

      const fixedField = _.cloneDeep(field);
      
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

    });
  } catch(error) {

    errorLogger({
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


function handleFenauRecord(task) {

  const {asteriIdForLinking, fenauRecord, fenauRecordId, queryTermsForFieldSearch, queryTermsString, fixedAuthorityRecord} = task;
  const link = `(FI-ASTERI-N)${asteriIdForLinking}`;

  if (fixedAuthorityRecord !== fenauRecord) {

    if (_.isEqual(fenauRecord.getFields('100'), fixedAuthorityRecord.getFields('100'))) {

      const fixedField = _.head(fixedAuthorityRecord.getFields('100'));
      RecordUtils.setSubfield(fixedField, '0', link, '9');

      const fixedAuthorityRecordContent = RecordUtils.fieldToString(fixedField);

      console.log(`INFO FENAU auth_id ${fenauRecordId} \t Adds $0 link without other changes:  ${fixedAuthorityRecordContent}`);

    } else {
        
      const fixedField = _.head(fixedAuthorityRecord.getFields('100'));
      RecordUtils.setSubfield(fixedField, '0', link, '9');

      const currentAuthorityRecordContent = RecordUtils.fieldToString(_.head(fenauRecord.getFields('100')));
      const fixedAuthorityRecordContent = RecordUtils.fieldToString(fixedField);

      console.log(`WARN FENAU auth_id ${fenauRecordId} \t Currently the content is: ${currentAuthorityRecordContent}`);
      console.log(`WARN FENAU auth_id ${fenauRecordId} \t After update it becomes:  ${fixedAuthorityRecordContent}`);
    }
  } else {

    try {
      
      const fields = RecordUtils.selectFieldForLinkingWithZero(fenauRecord, queryTermsForFieldSearch);
      fields.forEach(field => {
        const fixedField = _.cloneDeep(field);

        RecordUtils.setSubfield(fixedField, '0', link, '9');
        const changedContent = RecordUtils.fieldToString(fixedField);
        console.log(`INFO FENAU auth_id ${fenauRecordId} \t Adds $0 link without other changes:  ${changedContent}`);
    

      });
    } catch(error) {
      console.log(error);
      console.log(`ERROR: Could not find field from authority record ${fenauRecordId} to add the link to authority record ${fenauRecordId}. Query terms: ${queryTermsString}`);

      console.log('AUTH:');
      console.log(fenauRecord.toString());
    }
  }
}


function errorLogger(params) {
  const { record1Type, record1, record2Type, record2, linkSourceRecordId, linkTargetRecordId, queryTermsString, db, dbType } = params;
  return function(error) {

    const logRecords = () => {
      console.log(`${record1Type}:`);
      console.log(record1.toString());
      console.log(`${record2Type}:`);
      console.log(record2.toString());
    };

    if (error instanceof MarcPunctuation.PunctuationError) {
      console.log(`ERROR ${db} ${dbType} ${linkSourceRecordId} \t ${error.name}: ${error.message}`);
      return;
    }

    if (error instanceof RecordUtils.LinkingQueryError) {

      if (error.message === 'Found only 8XX field for linking.') {
        console.log(`WARN: Found only 8XX field from ${db} record ${linkSourceRecordId} to add the link to authority record ${linkTargetRecordId}. Query terms: ${queryTermsString}`);
        return;
      }
      console.log(`ERROR: Could not find field from ${db} record ${linkSourceRecordId} to add the link to authority record ${linkTargetRecordId}. Query terms: ${queryTermsString}`);
      logRecords();
      return;
    }

    console.log('ERROR: Unhandled error');
    console.log(error);
    logRecords();

  };
}


module.exports = handleLinkings;