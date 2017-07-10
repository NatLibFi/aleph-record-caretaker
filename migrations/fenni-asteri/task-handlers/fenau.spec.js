const _ = require('lodash');
const expect = require('chai').expect;

const MarcRecord = require('marc-record-js');
const RecordUtils = require('../../../lib/record-utils');
const handleFenauRecord = require('./fenau');
const Constants = require('../constants');
const TASK_TYPES = Constants.TASK_TYPES;

describe('fenau', () => {
  let fakeFenauRecord;
  let fakeFixedAuthorityRecord;
  let fakeAsteriId = '000000123';
  let fakeFenauRecordId = '22';
  let fakeQueryTerms = [
    [{code: 'a', value: 'AAKKULA IMMO'}]
  ];

  describe('handleFenauRecord', () => {

    describe('while fennica record did not need fixing for years', () => {
      beforeEach(() => {
        fakeFenauRecord = createFakeRecord();
        fakeFixedAuthorityRecord = fakeFenauRecord;
      });

      it('should throw error if adding link that is different from the current link', async () => {
        
        fakeFixedAuthorityRecord.fields = fakeFenauRecord.fields.filter(field => field.tag !== '100');
        fakeFixedAuthorityRecord.appendField(RecordUtils.stringToField('100    ‡aAakkula, Immo‡0(FI-ASTERI-N)444444'));

        const result = await handleFenauRecord({
          type: TASK_TYPES.FENAU_ASTERI,
          asteriIdForLinking: fakeAsteriId,
          fenauRecord: fakeFenauRecord,
          fenauRecordId: fakeFenauRecordId,
          queryTermsForFieldSearch: fakeQueryTerms,
          queryTermsString: '', 
          fixedAuthorityRecord: fakeFixedAuthorityRecord
        });
        
        expect(result).to.instanceOf(Error);
        expect(result.message).to.equal('Record 22 already has 0 link (100    ‡aAakkula, Immo‡0(FI-ASTERI-N)444444) that is different from the one being added (FI-ASTERI-N)000000123.');
      });
    });
    
    describe('while fennica record was fixed', () => {
      beforeEach(() => {
        fakeFenauRecord = createFakeRecord();
        fakeFixedAuthorityRecord = createFakeRecord();
      });

      it('should work', async () => {

        const result = await handleFenauRecord({
          type: TASK_TYPES.FENAU_ASTERI,
          asteriIdForLinking: fakeAsteriId,
          fenauRecord: fakeFenauRecord,
          fenauRecordId: fakeFenauRecordId,
          queryTermsForFieldSearch: fakeQueryTerms,
          queryTermsString: '', 
          fixedAuthorityRecord: fakeFixedAuthorityRecord
        });

        expect(result).to.be.undefined;

      });

      it('should throw error if adding link that is different from the current link', async () => {

        fakeFixedAuthorityRecord.fields = fakeFenauRecord.fields.filter(field => field.tag !== '100');
        fakeFixedAuthorityRecord.appendField(RecordUtils.stringToField('100    ‡aAakkula, Immo‡0(FI-ASTERI-N)444444'));

        const result = await handleFenauRecord({
          type: TASK_TYPES.FENAU_ASTERI,
          asteriIdForLinking: fakeAsteriId,
          fenauRecord: fakeFenauRecord,
          fenauRecordId: fakeFenauRecordId,
          queryTermsForFieldSearch: fakeQueryTerms,
          queryTermsString: '', 
          fixedAuthorityRecord: fakeFixedAuthorityRecord
        });
        
        expect(result).to.instanceOf(Error);
        expect(result.message).to.equal('Record 22 already has 0 link (100    ‡aAakkula, Immo‡0(FI-ASTERI-N)444444) that is different from the one being added (FI-ASTERI-N)000000123.');
      });
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