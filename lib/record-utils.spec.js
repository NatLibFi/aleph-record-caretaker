/**
 * Copyright 2017 University Of Helsinki (The National Library Of Finland)
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
 */const expect = require('chai').expect;
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

});

function createFakeRecord() {
  return MarcRecord.fromString(`LDR    00533cz  a2200193n  4500
001    115575
005    20160523161656.0
008    011001|n|az|||aab|           | aaa      `);
}
