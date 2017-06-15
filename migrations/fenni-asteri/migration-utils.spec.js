const expect = require('chai').expect;
const MarcRecord = require('marc-record-js');

const MigrationUtils = require('./migration-utils');
const RecordUtils = require('../../lib/record-utils');

describe('MigrationUtils', () => {

  describe('selectNameHeadingPermutations', () => {
    let fakeRecord;
    beforeEach(() => fakeRecord = createFakeRecord());

    it('should create array of name-heading permutations from record', () => {
      fakeRecord.appendField(RecordUtils.stringToField('100    ‡aAakkula, Immo,‡tcontent'));
      expect(MigrationUtils.selectNameHeadingPermutations(fakeRecord)).to.be.instanceOf(Array);
    });

    it('should pick authorized fields for the name-heading permutations', () => {
      fakeRecord.appendField(RecordUtils.stringToField('100    ‡aAakkula, Immo,‡c(Immis)‡qboink‡tcontent'));
      expect(MigrationUtils.selectNameHeadingPermutations(fakeRecord)).to.be.eql([
        [ 
          { code: 'a', value: 'AAKKULA IMMO' }, 
          { code: 'q', value: 'BOINK' },
          { code: 'c', value: 'IMMIS' }
        ]
      ]);
    });

    it('should generate permutations for the d subfield (dates of birth and death)', () => {
      fakeRecord.appendField(RecordUtils.stringToField('046    ‡f1992‡g2017'));
      fakeRecord.appendField(RecordUtils.stringToField('100    ‡aAakkula, Immo,‡tcontent'));
      expect(MigrationUtils.selectNameHeadingPermutations(fakeRecord)).to.be.eql([
        [ { code: 'a', value: 'AAKKULA IMMO' } ],
        [ { code: 'a', value: 'AAKKULA IMMO' }, { code: 'd', value: '1992' } ],
        [ { code: 'a', value: 'AAKKULA IMMO' }, { code: 'd', value: '1992 2017' } ]
      ]);
    });

    it('should generate permutations for the d subfield (dates of birth and death) if 100d already contains a permutation', () => {
      fakeRecord.appendField(RecordUtils.stringToField('046    ‡f1992‡g2017'));
      fakeRecord.appendField(RecordUtils.stringToField('100    ‡aAakkula, Immo,‡d1992-‡tcontent'));
      expect(MigrationUtils.selectNameHeadingPermutations(fakeRecord)).to.be.eql([
        [ { code: 'a', value: 'AAKKULA IMMO' } ],
        [ { code: 'a', value: 'AAKKULA IMMO' }, { code: 'd', value: '1992' } ],
        [ { code: 'a', value: 'AAKKULA IMMO' }, { code: 'd', value: '1992 2017' } ]
      ]);
    });
    it('should throw an error if 100d is not any of the generated permutations', () => {
      fakeRecord.appendField(RecordUtils.stringToField('046    ‡f1900‡g2000'));
      fakeRecord.appendField(RecordUtils.stringToField('100    ‡aAakkula, Immo,‡dkuollut 2000‡tcontent'));
      expect(MigrationUtils.selectNameHeadingPermutations.bind(null, fakeRecord)).to.throw('Record contains 100d with content that cannot be reconstructed from 046');
    });

    it('should not generate permutations for the d subfield (dates of birth and death) if 100d already contains something different', () => {
      fakeRecord.appendField(RecordUtils.stringToField('100    ‡aAakkula, Immo,‡dkuollut 2000‡tcontent'));
      expect(MigrationUtils.selectNameHeadingPermutations(fakeRecord)).to.be.eql([
        [ { code: 'a', value: 'AAKKULA IMMO' }, { code: 'd', value: 'KUOLLUT 2000' } ]
      ]);
    });
  });

});
 

function createFakeRecord() {
  return MarcRecord.fromString(`LDR    00533cz  a2200193n  4500
001    115575
005    20160523161656.0
008    011001|n|az|||aab|           | aaa      `);
}
