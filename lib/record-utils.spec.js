const expect = require('chai').expect;
const MarcRecord = require('marc-record-js');

const RecordUtils = require('./record-utils');


describe('RecordUtils', () => {

  describe('mergeDuplicateFields', () => {
    let fakeRecord;

    beforeEach(() => {
      fakeRecord = createFakeRecord();
    });

    it('should find and remove identical fields', () => {
      fakeRecord.appendField(RecordUtils.stringToField('700    ‡aAakkula, Immo'));
      fakeRecord.appendField(RecordUtils.stringToField('700    ‡aAakkula, Immo'));
      const compactedRecord = RecordUtils.mergeDuplicateFields(fakeRecord);
      expect(compactedRecord.getFields('700').map(RecordUtils.fieldToString)).to.eql(['700    ‡aAakkula, Immo']);
    });

    it('should find and remove three or more identical fields', () => {
      fakeRecord.appendField(RecordUtils.stringToField('700    ‡aAakkula, Immo'));
      fakeRecord.appendField(RecordUtils.stringToField('700    ‡aAakkula, Immo'));
      fakeRecord.appendField(RecordUtils.stringToField('700    ‡aAakkula, Immo'));
      const compactedRecord = RecordUtils.mergeDuplicateFields(fakeRecord);
      expect(compactedRecord.getFields('700').map(RecordUtils.fieldToString)).to.eql(['700    ‡aAakkula, Immo']);
    });


    it('should keep subfield 5 while removing identical fields', () => {
      fakeRecord.appendField(RecordUtils.stringToField('700    ‡aAakkula, Immo‡5testi'));
      fakeRecord.appendField(RecordUtils.stringToField('700    ‡aAakkula, Immo'));
      const compactedRecord = RecordUtils.mergeDuplicateFields(fakeRecord);
      expect(compactedRecord.getFields('700').map(RecordUtils.fieldToString)).to.eql(['700    ‡aAakkula, Immo‡5testi']);
    });

    it('should keep subfield 9 while removing identical fields', () => {
      fakeRecord.appendField(RecordUtils.stringToField('700    ‡aAakkula, Immo‡9testi'));
      fakeRecord.appendField(RecordUtils.stringToField('700    ‡aAakkula, Immo'));
      const compactedRecord = RecordUtils.mergeDuplicateFields(fakeRecord);
      expect(compactedRecord.getFields('700').map(RecordUtils.fieldToString)).to.eql(['700    ‡aAakkula, Immo‡9testi']);
    });

    it('should add every subfield with code 9 to the merged field', () => {
      fakeRecord.appendField(RecordUtils.stringToField('700    ‡aAakkula, Immo‡9testi'));
      fakeRecord.appendField(RecordUtils.stringToField('700    ‡aAakkula, Immo‡9testi2'));
      const compactedRecord = RecordUtils.mergeDuplicateFields(fakeRecord);
      expect(compactedRecord.getFields('700').map(RecordUtils.fieldToString)).to.eql(['700    ‡aAakkula, Immo‡9testi‡9testi2']);
    });

    it('should merge all subfield with code 9 or 5 to resulting field', () => {
      fakeRecord.appendField(RecordUtils.stringToField('700    ‡aAakkula, Immo‡9testi'));
      fakeRecord.appendField(RecordUtils.stringToField('700    ‡aAakkula, Immo‡9testi2‡5viisi'));
      const compactedRecord = RecordUtils.mergeDuplicateFields(fakeRecord);
      expect(compactedRecord.getFields('700').map(RecordUtils.fieldToString)).to.eql(['700    ‡aAakkula, Immo‡9testi‡9testi2‡5viisi']);
    });

    it('should not merge fields that are not exactly identical', () => {
      fakeRecord.appendField(RecordUtils.stringToField('700    ‡aAakkula, Immo‡zvalue'));
      fakeRecord.appendField(RecordUtils.stringToField('700    ‡aAakkula, Immo‡xvalue'));
      const compactedRecord = RecordUtils.mergeDuplicateFields(fakeRecord);
      expect(compactedRecord.getFields('700').map(RecordUtils.fieldToString)).to.eql([
        '700    ‡aAakkula, Immo‡zvalue',
        '700    ‡aAakkula, Immo‡xvalue'
      ]);
    });

    it('should collapse identical subfields from merged field', () => {
      fakeRecord.appendField(RecordUtils.stringToField('700    ‡aAakkula, Immo‡9testi'));
      fakeRecord.appendField(RecordUtils.stringToField('700    ‡aAakkula, Immo‡9testi‡5viisi'));
      const compactedRecord = RecordUtils.mergeDuplicateFields(fakeRecord);
      expect(compactedRecord.getFields('700').map(RecordUtils.fieldToString)).to.eql(['700    ‡aAakkula, Immo‡9testi‡5viisi']);
    });

  });

  describe('recordIsAgentAuthority', () => {
    let fakeRecord;

    beforeEach(() => {
      fakeRecord = createFakeRecord();
    });

    it('should return true if record contains 100 field', () => {
      fakeRecord.appendField(RecordUtils.stringToField('100    ‡aAakkula, Immo'));
      expect(RecordUtils.recordIsAgentAuthority(fakeRecord)).to.be.true;
    });
    it('should return true if record contains 110 field', () => {
      fakeRecord.appendField(RecordUtils.stringToField('110    ‡aMesta'));
      expect(RecordUtils.recordIsAgentAuthority(fakeRecord)).to.be.true;
    });
    it('should return true if record contains 111 field', () => {
      fakeRecord.appendField(RecordUtils.stringToField('111    ‡aJuttu'));
      expect(RecordUtils.recordIsAgentAuthority(fakeRecord)).to.be.true;
    });

    it('should return false if record contains 100 field with t subfield', () => {
      fakeRecord.appendField(RecordUtils.stringToField('100    ‡aAakkula, Immo,‡tcontent'));
      expect(RecordUtils.recordIsAgentAuthority(fakeRecord)).to.be.false;
    });
    it('should return false if record contains 110 field with t subfield', () => {
      fakeRecord.appendField(RecordUtils.stringToField('110    ‡aMesta,‡tcontent'));
      expect(RecordUtils.recordIsAgentAuthority(fakeRecord)).to.be.false;
    });
    it('should return false if record contains 111 field with t subfield', () => {
      fakeRecord.appendField(RecordUtils.stringToField('111    ‡aJuttu,‡tcontent'));
      expect(RecordUtils.recordIsAgentAuthority(fakeRecord)).to.be.false;
    });

    it('should return false if record does not contain 100, 110 or 110', () => {
      fakeRecord.appendField(RecordUtils.stringToField('150    ‡aJuttu,‡2ysa'));
      expect(RecordUtils.recordIsAgentAuthority(fakeRecord)).to.be.false;
    });
  });


  describe('subfieldOrderNumber', () => {
    it('should order alphabets lexically', () => {
      expect(RecordUtils.subfieldOrderNumber('a')).to.be.lessThan(RecordUtils.subfieldOrderNumber('b'));
      expect(RecordUtils.subfieldOrderNumber('x')).to.be.lessThan(RecordUtils.subfieldOrderNumber('y'));
    });
    it('should order numbers after alphabets', () => {
      expect(RecordUtils.subfieldOrderNumber('b')).to.be.lessThan(RecordUtils.subfieldOrderNumber('9'));
    });
    it('should order numbers in order', () => {
      expect(RecordUtils.subfieldOrderNumber('1')).to.be.lessThan(RecordUtils.subfieldOrderNumber('3'));
    });
    
  });


  describe('findAuthorizedPortion', () => {

    describe('for BIB records', () => {

      it('should return the found authorized portion', () => {
        const bibRecordField = RecordUtils.stringToField('100 0  ‡aNimi,‡d1922-1999');
        const authorizedPortion = RecordUtils.findAuthorizedPortion(RecordUtils.RecordType.BIB, bibRecordField);
        expect(authorizedPortion).to.eql({
          tag: '100',
          ind1: '0',
          subfields: [
            {code: 'a', value: 'Nimi,'},
            {code: 'd', value: '1922-1999'}
          ],
          range: { start: 0, length: 2 },
          specifier: null,
          titlePortion: null
        });
      });

      it('should not pick control subfields into the authorized portion', () => {
        const bibRecordField = RecordUtils.stringToField('100 0  ‡aNimi,‡d1922-1999‡8123‡6jee');
        const authorizedPortion = RecordUtils.findAuthorizedPortion(RecordUtils.RecordType.BIB, bibRecordField);
        expect(authorizedPortion).to.eql({
          tag: '100',
          ind1: '0',
          subfields: [
            {code: 'a', value: 'Nimi,'},
            {code: 'd', value: '1922-1999'}
          ],
          range: { start: 0, length: 2 },
          specifier: null,
          titlePortion: null
        });
      });

      it('should not pick 0 subfield into the authorized portion', () => {
        const bibRecordField = RecordUtils.stringToField('100 0  ‡aNimi,‡d1922-1999‡0(TST10)1234');
        const authorizedPortion = RecordUtils.findAuthorizedPortion(RecordUtils.RecordType.BIB, bibRecordField);
        expect(authorizedPortion).to.eql({
          tag: '100',
          ind1: '0',
          subfields: [
            {code: 'a', value: 'Nimi,'},
            {code: 'd', value: '1922-1999'}
          ],
          range: { start: 0, length: 2 },
          specifier: null,
          titlePortion: null

        });
      });

      it('should not pick non-authorized subfields into the authorized portion', () => {
        const bibRecordField = RecordUtils.stringToField('600 0  ‡3jotain‡aNimi,‡d1922-1999');
        const authorizedPortion = RecordUtils.findAuthorizedPortion(RecordUtils.RecordType.BIB, bibRecordField);
        expect(authorizedPortion).to.eql({
          tag: '600',
          ind1: '0',
          subfields: [
            {code: 'a', value: 'Nimi,'},
            {code: 'd', value: '1922-1999'}
          ],
          range: { start: 1, length: 2 },
          specifier: null,
          titlePortion: null
        });
      });


      it('should pick the specifier', () => {
        const bibRecordField = RecordUtils.stringToField('710 2  ‡aLääketieteellisen fysiikan & tekniikan yhdistys. ‡bProgress report -meeting,‡n(1 :‡d1979) ‡ejulkaisija. ‡0(TST10)123345');
        const authorizedPortion = RecordUtils.findAuthorizedPortion(RecordUtils.RecordType.BIB, bibRecordField);
        expect(authorizedPortion).to.eql({
          tag: '710',
          ind1: '2',
          subfields: [
            {code: 'a', value: 'Lääketieteellisen fysiikan & tekniikan yhdistys. '},
            {code: 'b', value: 'Progress report -meeting,'}
          ],
          range: { start: 0, length: 2 },
          specifier: {
            range: { start: 2, length: 2 },
            subfields: [
              {code: 'n', value: '(1 :'},
              {code: 'd', value: '1979) '}
            ]
          },
          titlePortion: null
        });
      });
      

    });

    describe('for AUTH records', () => {

      it('should return the found authorized portion', () => {
        const authorityRecordField = RecordUtils.stringToField('100 0  ‡aNimi,‡d1922-1999');
        const authorizedPortion = RecordUtils.findAuthorizedPortion(RecordUtils.RecordType.AUTH, authorityRecordField);
        expect(authorizedPortion).to.eql({
          tag: '100',
          ind1: '0',
          subfields: [
            {code: 'a', value: 'Nimi,'},
            {code: 'd', value: '1922-1999'}
          ],
          range: { start: 0, length: 2 },
          specifier: null,
          titlePortion: null
        });
      });

      it('should not pick control subfields into the authorized portion', () => {
        const authorityRecordField = RecordUtils.stringToField('100 0  ‡aNimi,‡d1922-1999‡8123‡6jee');
        const authorizedPortion = RecordUtils.findAuthorizedPortion(RecordUtils.RecordType.AUTH, authorityRecordField);
        expect(authorizedPortion).to.eql({
          tag: '100',
          ind1: '0',
          subfields: [
            {code: 'a', value: 'Nimi,'},
            {code: 'd', value: '1922-1999'}
          ],
          range: { start: 0, length: 2 },
          specifier: null,
          titlePortion: null
        });
      });

      it('should not pick 0 subfield into the authorized portion', () => {
        const authorityRecordField = RecordUtils.stringToField('100 0  ‡aNimi,‡d1922-1999‡0(TST10)1234');
        const authorizedPortion = RecordUtils.findAuthorizedPortion(RecordUtils.RecordType.AUTH, authorityRecordField);
        expect(authorizedPortion).to.eql({
          tag: '100',
          ind1: '0',
          subfields: [
            {code: 'a', value: 'Nimi,'},
            {code: 'd', value: '1922-1999'}
          ],
          range: { start: 0, length: 2 },
          specifier: null,
          titlePortion: null

        });
      });

      it('should not pick non-authorized subfields into the authorized portion', () => {
        const authorityRecordField = RecordUtils.stringToField('500 0  ‡ijotain‡aNimi,‡d1922-1999');
        const authorizedPortion = RecordUtils.findAuthorizedPortion(RecordUtils.RecordType.AUTH, authorityRecordField);
        expect(authorizedPortion).to.eql({
          tag: '500',
          ind1: '0',
          subfields: [
            {code: 'a', value: 'Nimi,'},
            {code: 'd', value: '1922-1999'}
          ],
          range: { start: 1, length: 2 },
          specifier: null,
          titlePortion: null
        });
      });

      it('should pick the specifier', () => {
        const authorityRecordField = RecordUtils.stringToField('110 2  ‡aLääketieteellisen fysiikan & tekniikan yhdistys. ‡bProgress report -meeting,‡n(1 :‡d1979) ‡ejulkaisija. ‡0(TST10)123345');
        const authorizedPortion = RecordUtils.findAuthorizedPortion(RecordUtils.RecordType.BIB, authorityRecordField);
        expect(authorizedPortion).to.eql({
          tag: '110',
          ind1: '2',
          subfields: [
            {code: 'a', value: 'Lääketieteellisen fysiikan & tekniikan yhdistys. '},
            {code: 'b', value: 'Progress report -meeting,'}
          ],
          range: { start: 0, length: 2 },
          specifier: {
            range: { start: 2, length: 2 },
            subfields: [
              {code: 'n', value: '(1 :'},
              {code: 'd', value: '1979) '}
            ]
          },
          titlePortion: null
        });
      });

      it('should pick the title portion', () => {
        const authorityRecordField = RecordUtils.stringToField('110 2  ‡aLääketieteellisen fysiikan & tekniikan yhdistys. ‡bProgress report -meeting,‡n(1 :‡d1979) ‡ejulkaisija. ‡ttitleportion‡0(TST10)123345');
        const authorizedPortion = RecordUtils.findAuthorizedPortion(RecordUtils.RecordType.BIB, authorityRecordField);
        expect(authorizedPortion).to.eql({
          tag: '110',
          ind1: '2',
          subfields: [
            {code: 'a', value: 'Lääketieteellisen fysiikan & tekniikan yhdistys. '},
            {code: 'b', value: 'Progress report -meeting,'}
          ],
          range: { start: 0, length: 2 },
          specifier: {
            range: { start: 2, length: 2 },
            subfields: [
              {code: 'n', value: '(1 :'},
              {code: 'd', value: '1979) '}
            ]
          },
          titlePortion: {
            range: { start: 5, length: 1 },
            subfields: [ {code: 't', value: 'titleportion'} ]
          }
        });
      });

      it('should separate the specifier and title portion fields', () => {
        const authorityRecordField = RecordUtils.stringToField('110 2  ‡aLääketieteellisen fysiikan & tekniikan yhdistys‡nn-in-specifier‡ttitleportion‡nn-in-title');
        const authorizedPortion = RecordUtils.findAuthorizedPortion(RecordUtils.RecordType.BIB, authorityRecordField);
        expect(authorizedPortion).to.eql({
          tag: '110',
          ind1: '2',
          subfields: [
            {code: 'a', value: 'Lääketieteellisen fysiikan & tekniikan yhdistys'},
          ],
          range: { start: 0, length: 1 },
          specifier: {
            range: { start: 1, length: 1 },
            subfields: [
              {code: 'n', value: 'n-in-specifier'}
            ]
          },
          titlePortion: {
            range: { start: 2, length: 2 },
            subfields: [ 
              {code: 't', value: 'titleportion'},
              {code: 'n', value: 'n-in-title'}
            ]
          }
        });
      });

    });

  });

  describe('updateAuthorizedPortion', () => {
    
    describe('for BIB records', () => {
      const tests = [
        [
          'Should update the field with content from authorized portion',
          '100    ‡aAakkula, Immo,‡tcontent',
          '100    ‡aAakkula, I,‡tcontent‡0(TST10)90001',
          '100    ‡aAakkula, Immo,‡tcontent‡0(TST10)90001'
        ],
        [
          'Should handle first indicator when updating authorized portion',
          '100 0  ‡aNimi, Toinen,‡d1922-1999‡0(TST10)1234',
          '100 1  ‡aToinen Nimi‡0(TST10)1234',
          '100 0  ‡aNimi, Toinen,‡d1922-1999‡0(TST10)1234'
        ],
        [
          'Should handle non-100 fileds',
          '100 0  ‡aNimi, Toinen,‡d1922-1999‡0(TST10)1234',
          '700 1  ‡aToinen Nimi‡0(TST10)1234',
          '700 0  ‡aNimi, Toinen,‡d1922-1999‡0(TST10)1234'
        ],
        [
          'Should not lose control subfields from target',
          '100 0  ‡aNimi, Toinen,‡d1922-1999‡0(TST10)1234',
          '100 1  ‡aToinen Nimi‡6jee‡0(TST10)1234',
          '100 0  ‡aNimi, Toinen,‡d1922-1999‡6jee‡0(TST10)1234'
        ],
        [
          'Should not lose non-authorized subfields from target',
          '100 0  ‡aNimi, Toinen,‡d1922-1999‡0(TST10)1234',
          '100 1  ‡ijotain‡aToinen Nimi‡0(TST10)1234',
          '100 0  ‡ijotain‡aNimi, Toinen,‡d1922-1999‡0(TST10)1234'
        ],
        [
          'Should not copy control subfields from source',
          '100 0  ‡aNimi, Toinen,‡d1922-1999‡6ctrl‡0(TST10)1234',
          '100 1  ‡aToinen Nimi‡0(TST10)1234',
          '100 0  ‡aNimi, Toinen,‡d1922-1999‡0(TST10)1234'
        ],
        [
          'Should not copy zero subfields from source',
          '100 0  ‡aNimi, Toinen,‡d1922-1999‡0(TST10)1234‡0(faraway)1111',
          '100 1  ‡aToinen Nimi‡0(TST10)1234',
          '100 0  ‡aNimi, Toinen,‡d1922-1999‡0(TST10)1234'
        ],
        [
          'Should not lose extra zero subfields from target',
          '100 0  ‡aNimi, Toinen,‡d1922-1999‡0(TST10)1234',
          '100 1  ‡aToinen Nimi‡0(TST10)1234‡0(faraway)1111',
          '100 0  ‡aNimi, Toinen,‡d1922-1999‡0(TST10)1234‡0(faraway)1111'
        ],
        [
          'Should update tag if it has changed',
          '110    ‡aAsia joka muuttui henkilöstä yhteisöksi‡0(TST10)115575',
          '100    ‡aAsia joka on henkilö,‡cnimimerkki‡0(TST10)115575',
          '110    ‡aAsia joka muuttui henkilöstä yhteisöksi‡0(TST10)115575'
        ],
        [
          'Should pick and replace specifier part from 110',
          '110 2  ‡aLääketieteellisen fysiikan ja tekniikan yhdistys. ‡bProgress report -kokous ‡n(1 :‡d1979)‡0(TST10)123345',
          '110 2  ‡aLääketieteellisen fysiikan & tekniikan yhdistys. ‡bProgress report -meeting ‡n(1 :‡d1989)‡0(TST10)123345',
          '110 2  ‡aLääketieteellisen fysiikan ja tekniikan yhdistys. ‡bProgress report -kokous ‡n(1 :‡d1979)‡0(TST10)123345'
        ],
        [
          'Should keep current specifier if authorized field does not have a specifier',
          '110 2  ‡aLääketieteellisen fysiikan ja tekniikan yhdistys. ‡bProgress report -kokous‡0(TST10)123345',
          '110 2  ‡aLääketieteellisen fysiikan & tekniikan yhdistys. ‡bProgress report -meeting‡n(1 :‡d1979) ‡0(TST10)123345',
          '110 2  ‡aLääketieteellisen fysiikan ja tekniikan yhdistys. ‡bProgress report -kokous‡n(1 :‡d1979) ‡0(TST10)123345'
        ],
        [
          'Should not lose non-authorized subfields from 710',
          '110 2  ‡aLääketieteellisen fysiikan ja tekniikan yhdistys. ‡bProgress report -kokous‡0(TST10)123345',
          '710 2  ‡3Kirja:‡aLääketieteellisen fysiikan & tekniikan yhdistys. ‡bProgress report -meeting,‡ejulkaisija. ‡0(TST10)123345',
          '710 2  ‡3Kirja:‡aLääketieteellisen fysiikan ja tekniikan yhdistys. ‡bProgress report -kokous‡ejulkaisija. ‡0(TST10)123345'
        ]
      ];

      tests.forEach(test => {

        const [testName, authorityRecordFieldStr, bibRecordFieldStr, expectedFieldStr] = test;
        it(testName, () => {
          const authorityRecordField = RecordUtils.stringToField(authorityRecordFieldStr);
          const bibRecordField = RecordUtils.stringToField(bibRecordFieldStr);

          const authorizedPortion = RecordUtils.findAuthorizedPortion(RecordUtils.RecordType.AUTH, authorityRecordField);
          const resultingField = RecordUtils.updateAuthorizedPortion(RecordUtils.RecordType.BIB, bibRecordField, authorizedPortion);
          expect(RecordUtils.fieldToString(resultingField)).to.equal(expectedFieldStr);
        });
        
      });

      it('should be idempotent', () => {

        const [, authorityRecordFieldStr, linkedAuthorityRecordFieldStr, expectedFieldStr] = tests[0];
        
        const authorityRecordField = RecordUtils.stringToField(authorityRecordFieldStr);
        const linkedAuthorityRecordField = RecordUtils.stringToField(linkedAuthorityRecordFieldStr);

        const authorizedPortion = RecordUtils.findAuthorizedPortion(RecordUtils.RecordType.AUTH, authorityRecordField);
        const resultingField = RecordUtils.updateAuthorizedPortion(RecordUtils.RecordType.AUTH, linkedAuthorityRecordField, authorizedPortion);
        const resultingFieldAfterSecondApplication = RecordUtils.updateAuthorizedPortion(RecordUtils.RecordType.AUTH, resultingField, authorizedPortion);
      
        expect(RecordUtils.fieldToString(resultingFieldAfterSecondApplication)).to.equal(expectedFieldStr);
      

      });
    });


    describe('for AUTH records', () => {
      const tests = [
        [
          'Should handle first indicator when updating authorized portion',
          '100 0  ‡aNimi, Toinen,‡d1922-1999‡0(TST10)1234',
          '500 1  ‡aToinen Nimi‡0(TST10)1234',
          '500 0  ‡aNimi, Toinen,‡d1922-1999‡0(TST10)1234'
        ],
        [
          'Should not lose control subfields from target',
          '100 0  ‡aNimi, Toinen,‡d1922-1999‡0(TST10)1234',
          '500 1  ‡aToinen Nimi‡6jee‡0(TST10)1234',
          '500 0  ‡aNimi, Toinen,‡d1922-1999‡6jee‡0(TST10)1234'
        ],
        [
          'Should not lose non-authorized subfields from target',
          '100 0  ‡aNimi, Toinen,‡d1922-1999‡0(TST10)1234',
          '500 1  ‡ijotain‡aToinen Nimi‡0(TST10)1234',
          '500 0  ‡ijotain‡aNimi, Toinen,‡d1922-1999‡0(TST10)1234'
        ],
        [
          'Should not copy control subfields from source',
          '100 0  ‡aNimi, Toinen,‡d1922-1999‡6ctrl‡0(TST10)1234',
          '500 1  ‡aToinen Nimi‡0(TST10)1234',
          '500 0  ‡aNimi, Toinen,‡d1922-1999‡0(TST10)1234'
        ],
        [
          'Should not copy zero subfields from source',
          '100 0  ‡aNimi, Toinen,‡d1922-1999‡0(TST10)1234‡0(faraway)1111',
          '500 1  ‡aToinen Nimi‡0(TST10)1234',
          '500 0  ‡aNimi, Toinen,‡d1922-1999‡0(TST10)1234'
        ],
        [
          'Should not lose extra zero subfields from target',
          '100 0  ‡aNimi, Toinen,‡d1922-1999‡0(TST10)1234',
          '500 1  ‡aToinen Nimi‡0(TST10)1234‡0(faraway)1111',
          '500 0  ‡aNimi, Toinen,‡d1922-1999‡0(TST10)1234‡0(faraway)1111'
        ],
        [
          'Should update tag if it has changed',
          '110    ‡aAsia joka muuttui henkilöstä yhteisöksi‡0(TST10)115575',
          '500    ‡aAsia joka on henkilö,‡cnimimerkki‡0(TST10)115575',
          '510    ‡aAsia joka muuttui henkilöstä yhteisöksi‡0(TST10)115575'
        ]
      ];

      tests.forEach(test => {

        const [testName, authorityRecordFieldStr, linkedAuthorityRecordFieldStr, expectedFieldStr] = test;
        it(testName, () => {
          const authorityRecordField = RecordUtils.stringToField(authorityRecordFieldStr);
          const linkedAuthorityRecordField = RecordUtils.stringToField(linkedAuthorityRecordFieldStr);

          const authorizedPortion = RecordUtils.findAuthorizedPortion(RecordUtils.RecordType.AUTH, authorityRecordField);
          const resultingField = RecordUtils.updateAuthorizedPortion(RecordUtils.RecordType.AUTH, linkedAuthorityRecordField, authorizedPortion);
          expect(RecordUtils.fieldToString(resultingField)).to.equal(expectedFieldStr);
        });
        
      });

      it('should be idempotent', () => {

        const [, authorityRecordFieldStr, linkedAuthorityRecordFieldStr, expectedFieldStr] = tests[0];
        
        const authorityRecordField = RecordUtils.stringToField(authorityRecordFieldStr);
        const linkedAuthorityRecordField = RecordUtils.stringToField(linkedAuthorityRecordFieldStr);

        const authorizedPortion = RecordUtils.findAuthorizedPortion(RecordUtils.RecordType.AUTH, authorityRecordField);
        const resultingField = RecordUtils.updateAuthorizedPortion(RecordUtils.RecordType.AUTH, linkedAuthorityRecordField, authorizedPortion);
        const resultingFieldAfterSecondApplication = RecordUtils.updateAuthorizedPortion(RecordUtils.RecordType.AUTH, resultingField, authorizedPortion);
      
        expect(RecordUtils.fieldToString(resultingFieldAfterSecondApplication)).to.equal(expectedFieldStr);
      

      });
    });
  });
});

function createFakeRecord() {
  return MarcRecord.fromString(`LDR    00533cz  a2200193n  4500
001    115575
005    20160523161656.0
008    011001|n|az|||aab|           | aaa      `);
}