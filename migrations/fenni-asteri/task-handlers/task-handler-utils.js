/* eslint no-console: 0 */

const _ = require('lodash');
const RecordUtils = require('../../../lib/record-utils');
const MigrationUtils = require('../migration-utils');
const fixBibRecordField = require('../fix-bib-record');
const MarcPunctuation = require('../../../lib/marc-punctuation-fix');
const Utils = require('../../../lib/utils');

const fs = require('fs');
const path = require('path');
const debug = require('debug')('task-handler-utils');

const bibRules = MarcPunctuation.readRulesFromCSV(fs.readFileSync(path.resolve(__dirname, '../../../lib/bib-punctuation.csv'), 'utf8'));
const fixPunctuationFromBibField = MarcPunctuation.createRecordFixer(bibRules);

class TaskError extends Error {
  constructor ( message ) {
    super();
    Error.captureStackTrace( this, this.constructor );
    this.name = 'TaskError';
    this.message = message;
  }
}

function readSettings() {

  const XServerUrl = Utils.readEnvironmentVariable('MIGRATION_MELINDA_X_SERVER');
  const melindaEndpoint = Utils.readEnvironmentVariable('MIGRATION_MELINDA_API');

  const melindaCredentials = {
    username: Utils.readEnvironmentVariable('MIGRATION_MELINDA_USER'),
    password: Utils.readEnvironmentVariable('MIGRATION_MELINDA_PASS')
  };

  const batchcatFennica = Utils.readEnvironmentVariable('MIGRATION_BATCHCAT_FENNICA');
  const library = Utils.readEnvironmentVariable('MIGRATION_FENNICA_LIBRARY');
  const catLocation = Utils.readEnvironmentVariable('MIGRATION_FENNICA_CAT_LOCATION');

  const fennicaCredentials = {
    username: Utils.readEnvironmentVariable('MIGRATION_FENNICA_USER'),
    password: Utils.readEnvironmentVariable('MIGRATION_FENNICA_PASS')
  };

  return { XServerUrl, melindaEndpoint, melindaCredentials, batchcatFennica, library, catLocation, fennicaCredentials };
}

function validateLink(field, expectedLinkValue) {
  const subfields = _.get(field, 'subfields', []);
  if (subfields.length > 0) {
    return subfields.filter(subfield => subfield.code === '0').every(subfield => subfield.value === expectedLinkValue);
  }
  return true;
}

function logFieldDiff(a, b) {
  const changedRecordFields = a.fields.map(RecordUtils.fieldToString);
  const originalRecordFields = b.fields.map(RecordUtils.fieldToString);
  const fieldsToRemove = _.difference(originalRecordFields, changedRecordFields);
  const fieldsToAdd = _.difference(changedRecordFields, originalRecordFields);

  debug('DEBUG These fields', fieldsToRemove);
  debug('DEBUG are replaced by', fieldsToAdd);
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

    if (error instanceof MigrationUtils.LinkingQueryError) {

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


function fixBibField(db, linkPrefix, asteriId, fixedAuthorityRecord, bib_id, field) {

  const link = `${linkPrefix}${asteriId}`;

  // TODO: before fixing bib record field we have to ensure that we will not overwrite any current d subfields. Throw error if target contains d subfield with differing content.
  const fixedField = fixBibRecordField(field, fixedAuthorityRecord);
  fixPunctuationFromBibField(fixedField);

  if (!validateLink(fixedField, link)) {  
    throw new TaskError(`Record ${db} bib_id ${bib_id} already has 0 link (${RecordUtils.fieldToString(fixedField)}) that is different from the one being added ${link}.`);
  }

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

  return fixedField;
  
}

module.exports = {
  validateLink,
  logFieldDiff,
  TaskError,
  errorLogger,
  fixBibField,
  readSettings
};