const _ = require('lodash');
const chai = require('chai');

const expect = chai.expect;
const MarcRecord = require('marc-record-js');

const RecordUtils = require('../../../lib/record-utils');
const Utils = require('./task-handler-utils');


describe('task-handler-utils', () => {
  describe('updateUPDToY', () => {
    let record;
    beforeEach(() => {
      record = createFakeRecord();
    });

    it('should change UPD ‡aN to UPD ‡aY', () => {
      record.appendField(RecordUtils.stringToField('UPD    ‡aN'));
      Utils.updateUPDToY(record);
      const fields = record.fields.map(RecordUtils.fieldToString);
      expect(fields).to.contain('UPD    ‡aY');
      expect(fields).not.to.contain('UPD    ‡aN');
    });
    it('should do nothing if record does not have UPD field', () => {
      const before = MarcRecord.clone(record);
      Utils.updateUPDToY(record);
      expect(before.toString()).to.eql(record.toString());
    });
    it('should do nothing if record has UPD ‡aY', () => {
      record.appendField(RecordUtils.stringToField('UPD    ‡aY'));
      const before = MarcRecord.clone(record);
      Utils.updateUPDToY(record);
      expect(before.toString()).to.eql(record.toString());
    });
    it('should do nothing if record has UPD ‡aX', () => {
      record.appendField(RecordUtils.stringToField('UPD    ‡aX'));
      const before = MarcRecord.clone(record);
      Utils.updateUPDToY(record);
      expect(before.toString()).to.eql(record.toString());
    });
    
  });
});

function createFakeRecord() {
  return MarcRecord.fromString(`LDR    00533cz  a2200193n  4500
001    115575
005    20160523161656.0
008    011001|n|az|||aab|           | aaa      
100 1  ‡aAakkula, Immo`);
}
