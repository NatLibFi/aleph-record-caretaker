const _ = require('lodash');
const RecordUtils = require('../../lib/record-utils');

function fixBibRecordField(inputBibRecordField, authRecord) {
  
  if (inputBibRecordField === undefined || _.head(authRecord.getFields('100')) === undefined) {
    return inputBibRecordField;
  }

  const bibRecordField = _.cloneDeep(inputBibRecordField);
  
  const authorizedPortion = RecordUtils.selectAuthorizedPortion(authRecord);

  RecordUtils.setAuthorizedPortion(bibRecordField, authorizedPortion);
  
  return bibRecordField;
}

module.exports = fixBibRecordField;
