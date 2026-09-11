/**
 * Copyright 2017-2019 University Of Helsinki (The National Library Of Finland)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

const expect = require('chai').expect;
const { MarcRecord } = require('@natlibfi/marc-record');

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

    it('should not merge CAT fields', () => {
      fakeRecord.appendField(RecordUtils.stringToField('CAT    ‡avalue'));
      fakeRecord.appendField(RecordUtils.stringToField('CAT    ‡avalue'));
      const compactedRecord = RecordUtils.mergeDuplicateFields(fakeRecord);
      expect(compactedRecord.getFields('CAT').map(RecordUtils.fieldToString)).to.eql([
        'CAT    ‡avalue',
        'CAT    ‡avalue'
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


  describe('isRecordDeleted', () => {
    it('should return false for a non-deleted record', () => {
      expect(RecordUtils.isRecordDeleted(createFakeRecord())).to.be.false;
    });

    it('should return false for an empty record', () => {
      expect(RecordUtils.isRecordDeleted(new MarcRecord())).to.be.false;
    });

    it('should return true if record contains STA field with DELETED subfield', () => {
      const record = createFakeRecord();
      record.appendField(RecordUtils.stringToField('STA    ‡aDELETED'));
      expect(RecordUtils.isRecordDeleted(record)).to.be.true;
    });

    it('should return false if record contains STA field with another value', () => {
      const record = createFakeRecord();
      record.appendField(RecordUtils.stringToField('STA    ‡aACTIVE'));
      expect(RecordUtils.isRecordDeleted(record)).to.be.false;
    });

    it('should return true if record contains DEL field with Y subfield', () => {
      const record = createFakeRecord();
      record.appendField(RecordUtils.stringToField('DEL    ‡aY'));
      expect(RecordUtils.isRecordDeleted(record)).to.be.true;
    });

    it('should return false if record contains DEL field with N subfield', () => {
      const record = createFakeRecord();
      record.appendField(RecordUtils.stringToField('DEL    ‡aN'));
      expect(RecordUtils.isRecordDeleted(record)).to.be.false;
    });

    it('should return true if leader status position is d', () => {
      const record = MarcRecord.fromString('LDR    00533dz  a2200193n  4500\n001    115575');
      expect(RecordUtils.isRecordDeleted(record)).to.be.true;
    });

    it('should return false if leader status position is a', () => {
      const record = MarcRecord.fromString('LDR    00533az  a2200193n  4500\n001    115575');
      expect(RecordUtils.isRecordDeleted(record)).to.be.false;
    });

    it('should return true if record is deleted by several signals at once', () => {
      const record = MarcRecord.fromString('LDR    00533dz  a2200193n  4500\n001    115575');
      record.appendField(RecordUtils.stringToField('STA    ‡aDELETED'));
      record.appendField(RecordUtils.stringToField('DEL    ‡aY'));
      expect(RecordUtils.isRecordDeleted(record)).to.be.true;
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

  describe('parseYearsFrom100d', () => {
    it('should return birth and death years from 100d', () => {
      const record = createFakeRecord();
      record.appendField(RecordUtils.stringToField('100    ‡aAakkula, Immo‡d1950-2020'));
      expect(RecordUtils.parseYearsFrom100d(record)).to.eql(['1950', '2020']);
    });

    it('should return only the birth year when there is no death year', () => {
      const record = createFakeRecord();
      record.appendField(RecordUtils.stringToField('100    ‡aAakkula, Immo‡d1950'));
      expect(RecordUtils.parseYearsFrom100d(record)).to.eql(['1950', undefined]);
    });

    it('should return undefined values when there is no 100d', () => {
      expect(RecordUtils.parseYearsFrom100d(createFakeRecord())).to.eql([undefined, undefined]);
    });

    it('should filter out non-alphanumeric characters from the years', () => {
      const record = createFakeRecord();
      record.appendField(RecordUtils.stringToField('100    ‡aAakkula, Immo‡d1950.-2020.'));
      expect(RecordUtils.parseYearsFrom100d(record)).to.eql(['1950', '2020']);
    });
  });

  describe('selectBirthYear and selectDeathYear', () => {
    it('should return the 046f value', () => {
      const record = createFakeRecord();
      record.appendField(RecordUtils.stringToField('046    ‡f1950‡g2020'));
      expect(RecordUtils.selectBirthYear(record)).to.equal('1950');
    });

    it('should return the 046g value', () => {
      const record = createFakeRecord();
      record.appendField(RecordUtils.stringToField('046    ‡f1950‡g2020'));
      expect(RecordUtils.selectDeathYear(record)).to.equal('2020');
    });

    it('should return undefined when the 046 field is missing', () => {
      expect(RecordUtils.selectBirthYear(createFakeRecord())).to.equal(undefined);
      expect(RecordUtils.selectDeathYear(createFakeRecord())).to.equal(undefined);
    });
  });

  describe('selectFirstSubfieldValue', () => {
    it('should return the first matching subfield value across multiple fields', () => {
      const record = createFakeRecord();
      record.appendField(RecordUtils.stringToField('700    ‡aFirst, A‡d1900'));
      record.appendField(RecordUtils.stringToField('700    ‡aSecond, B‡d1901'));
      expect(RecordUtils.selectFirstSubfieldValue(record, '700', 'd')).to.equal('1900');
    });

    it('should return undefined when the tag is not present', () => {
      expect(RecordUtils.selectFirstSubfieldValue(createFakeRecord(), '700', 'd')).to.equal(undefined);
    });

    it('should return undefined when the subfield code is not present', () => {
      const record = createFakeRecord();
      record.appendField(RecordUtils.stringToField('700    ‡aFirst, A'));
      expect(RecordUtils.selectFirstSubfieldValue(record, '700', 'd')).to.equal(undefined);
    });
  });

  describe('setSubfield', () => {
    it('should replace the value of an existing subfield in place', () => {
      const field = RecordUtils.stringToField('100    ‡aAakkula, Immo‡d1950');
      RecordUtils.setSubfield(field, 'd', '1960', 'a');
      expect(field.subfields).to.eql([{ code: 'a', value: 'Aakkula, Immo' }, { code: 'd', value: '1960' }]);
    });

    it('should insert a new subfield before the subfield with the given beforeCode', () => {
      const field = RecordUtils.stringToField('100    ‡aAakkula, Immo‡d1950');
      RecordUtils.setSubfield(field, 'b', 'Middle', 'd');
      expect(field.subfields).to.eql([{ code: 'a', value: 'Aakkula, Immo' }, { code: 'b', value: 'Middle' }, { code: 'd', value: '1950' }]);
    });

    it('should append the new subfield at the end when no subfield sorts at or after beforeCode', () => {
      const field = RecordUtils.stringToField('100    ‡aAakkula, Immo‡bB');
      RecordUtils.setSubfield(field, 'z', 'Last', 'z');
      expect(field.subfields).to.eql([{ code: 'a', value: 'Aakkula, Immo' }, { code: 'b', value: 'B' }, { code: 'z', value: 'Last' }]);
    });
  });

  describe('setSubfields', () => {
    it('should replace the subfields of every matching field', () => {
      const record = createFakeRecord();
      record.appendField(RecordUtils.stringToField('100    ‡aFirst, A'));
      record.appendField(RecordUtils.stringToField('100    ‡aSecond, B'));
      const newSubfields = [{ code: 'a', value: 'New, N' }];
      RecordUtils.setSubfields(record, '100', newSubfields);
      record.getFields('100').forEach(field => {
        expect(field.subfields).to.eql(newSubfields);
      });
    });
  });

  describe('selectMelindaLinks', () => {
    it('should extract FCC-prefixed 035a values with the prefix stripped', () => {
      const record = createFakeRecord();
      record.appendField(RecordUtils.stringToField('035    ‡aFCC123'));
      expect(RecordUtils.selectMelindaLinks(record)).to.eql(['123']);
    });

    it('should ignore 035a values without the prefix and non-a subfields', () => {
      const record = createFakeRecord();
      record.appendField(RecordUtils.stringToField('035    ‡aABC456'));
      record.appendField(RecordUtils.stringToField('035    ‡bFCC789'));
      expect(RecordUtils.selectMelindaLinks(record)).to.eql([]);
    });

    it('should support a custom link prefix', () => {
      const record = createFakeRecord();
      record.appendField(RecordUtils.stringToField('035    ‡aMEL100'));
      expect(RecordUtils.selectMelindaLinks(record, 'MEL')).to.eql(['100']);
    });

    it('should return an empty list when there are no 035 fields', () => {
      expect(RecordUtils.selectMelindaLinks(createFakeRecord())).to.eql([]);
    });
  });

  describe('isLinkedField', () => {
    it('should return true when the field has a 6 subfield', () => {
      const field = RecordUtils.stringToField('100    ‡aAakkula, Immo‡6jee');
      expect(RecordUtils.isLinkedField(field)).to.be.true;
    });

    it('should return false when the field has no 6 subfield', () => {
      const field = RecordUtils.stringToField('100    ‡aAakkula, Immo');
      expect(RecordUtils.isLinkedField(field)).to.be.false;
    });
  });

  describe('extractAuthorizedPortion', () => {
    it('should return the authorized portion for a single 100 field', () => {
      const record = createFakeRecord();
      record.appendField(RecordUtils.stringToField('100 0  ‡aNimi,‡d1922-1999'));
      expect(RecordUtils.extractAuthorizedPortion(record)).to.eql({
        tag: '100',
        ind1: '0',
        subfields: [
          { code: 'a', value: 'Nimi,' },
          { code: 'd', value: '1922-1999' }
        ],
        range: { start: 0, length: 2 },
        specifier: null,
        titlePortion: null
      });
    });

    it('should throw when the record has no authorized portion field', () => {
      expect(() => RecordUtils.extractAuthorizedPortion(createFakeRecord()))
        .to.throw(Error, 'Could not parse authorized portion');
    });

    it('should throw when the record has multiple authorized portion fields', () => {
      const record = createFakeRecord();
      record.appendField(RecordUtils.stringToField('100 0  ‡aNimi,‡d1922-1999'));
      record.appendField(RecordUtils.stringToField('110 2  ‡aOrganisaatio'));
      expect(() => RecordUtils.extractAuthorizedPortion(record))
        .to.throw(Error, 'Could not parse authorized portion');
    });
  });

  describe('fieldToString', () => {
    it('should serialize a datafield with default indicators when ind1/ind2 are missing', () => {
      const field = { tag: '100', subfields: [{ code: 'a', value: 'Aakkula, Immo' }] };
      expect(RecordUtils.fieldToString(field)).to.equal('100    ‡aAakkula, Immo');
    });

    it('should serialize a control field without subfields', () => {
      const field = { tag: '001', value: '115575' };
      expect(RecordUtils.fieldToString(field)).to.equal('001    115575');
    });
  });

});

function createFakeRecord() {
  return MarcRecord.fromString(`LDR    00533cz  a2200193n  4500
001    115575
005    20160523161656.0
008    011001|n|az|||aab|           | aaa      `);
}
