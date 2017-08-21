/* eslint no-console: 0 */

const _ = require('lodash');
const MarcRecord = require('marc-record-js');
const moment = require('moment');

const RecordUtils = require('../../../lib/record-utils');
const MigrationUtils = require('../migration-utils');
const utils = require('../utils');
const taskUtils = require('./task-handler-utils');

const oracledb = require('oracledb');
oracledb.outFormat = oracledb.OBJECT;

const MelindaRecordService = require('../melinda-record-service-fast-unsafe');
const { XServerUrl, melindaEndpoint, melindaCredentials, dryRun } = taskUtils.readSettings();
const melindaRecordService = MelindaRecordService.createMelindaRecordService(melindaEndpoint, XServerUrl, melindaCredentials);

const dbConfig = {
  user: utils.readEnvironmentVariable('ORACLE_USER'),
  password: utils.readEnvironmentVariable('ORACLE_PASS'),
  connectString: utils.readEnvironmentVariable('ORACLE_CONNECT_STRING')
};


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
    }).then((res) => {
      // remove stuff from index

      return oracledb.getConnection(dbConfig).then(connection => {
    
        const seq = moment().format('YYYYMMDDHHmm') + '%';
        return connection.execute('SELECT * FROM FIN01.Z07 where Z07_REC_KEY = :recordId AND Z07_SEQUENCE LIKE = :sequence', [melindaId, seq], {resultSet: true})
        .then(result => {
          return utils.readAllRows(result.resultSet);
        }).then(rows => {
          console.log(`INFO MELINDA removing rows from indexing-queue: ${JSON.stringify(rows)}`);
          return connection.execute('DELETE FROM FIN01.Z07 where Z07_REC_KEY = :recordId AND Z07_SEQUENCE LIKE = :sequence', [melindaId, seq]);
        }).then(() => connection.close());
      }).then(() => res);

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
