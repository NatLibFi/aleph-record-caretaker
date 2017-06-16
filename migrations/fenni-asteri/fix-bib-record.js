const _ = require('lodash');
const MigrationUtils = require('./migration-utils');

function fixBibRecordField(inputBibRecordField, authRecord) {
  
  if (inputBibRecordField === undefined || _.head(authRecord.getFields('100')) === undefined) {
    return inputBibRecordField;
  }

  let bibRecordField = _.cloneDeep(inputBibRecordField);
  
  const authorizedPortion = MigrationUtils.selectAuthorizedPortion(authRecord);

  bibRecordField = MigrationUtils.migrateCSubfield(authorizedPortion, bibRecordField);

  MigrationUtils.setAuthorizedPortion(bibRecordField, authorizedPortion);
  
  return bibRecordField;
}

module.exports = fixBibRecordField;
