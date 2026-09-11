/**
 * Copyright 2017-2019, 2026 University Of Helsinki (The National Library Of Finland)
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

const chai = require('chai');
const expect = chai.expect;

const authorityRecordLink = require('./authority-record-link');
const {
  buildReverseBaseMap,
  parseAuthorityRecordLink,
  createPlainBaseQuery,
  createUrnQuery,
  createUrnQueryPadded,
  createLinkQueries,
  createFieldMatcher
} = authorityRecordLink;

// Production-shaped config: baseMap keys are namespace identifiers (as they
// appear in ‡0 subfields and as URN namespace prefixes), values are Aleph bases.
const baseMap = {
  'TST-A': 'TST01',
  'TST-B': 'TST10'
};

const urnBaseMap = {
  'TST10': 'URN:NBN:fi:au:cn:'
};

const urnResolverPrefix = 'http://urn.fi/';

const options = { baseMap, urnBaseMap, urnResolverPrefix };

describe('authority-record-link: parsing', () => {

  describe('buildReverseBaseMap', () => {
    it('should invert a baseMap', () => {
      expect(buildReverseBaseMap(baseMap)).to.eql({ TST01: 'TST-A', TST10: 'TST-B' });
    });
  });

  describe('parseAuthorityRecordLink', () => {
    it('should parse an ISIL namespace link (baseMap key)', () => {
      const link = parseAuthorityRecordLink('(TST-B)000123456', options);
      expect(link.base).to.equal('TST-B');
      expect(link.recordId).to.equal('000123456');
    });

    it('should parse a link with trailing punctuation', () => {
      const a = parseAuthorityRecordLink('(TST-B)000123456,', options);
      const b = parseAuthorityRecordLink('(TST-B)000123456.', options);
      expect(a).to.eql({ base: 'TST-B', recordId: '000123456' });
      expect(b).to.eql({ base: 'TST-B', recordId: '000123456' });
    });

    it('should resolve a plain Aleph base (baseMap value) to the baseMap key', () => {
      const link = parseAuthorityRecordLink('(TST10)90001', options);
      expect(link.base).to.equal('TST-B');
      expect(link.recordId).to.equal('90001');
      expect(baseMap[link.base]).to.equal('TST10');
    });

    it('should parse an unmapped plain base as-is (e.g. isni)', () => {
      const link = parseAuthorityRecordLink('(isni)000123456', options);
      expect(link.base).to.equal('isni');
      expect(link.recordId).to.equal('000123456');
    });

    it('should parse a URN and resolve to the baseMap key', () => {
      const link = parseAuthorityRecordLink('http://urn.fi/URN:NBN:fi:au:cn:123456', options);
      expect(link.base).to.equal('TST-B');
      expect(link.recordId).to.equal('123456');
      expect(baseMap[link.base]).to.equal('TST10');
    });

    it('should throw on multiple (base)id pairs', () => {
      expect(() => parseAuthorityRecordLink('(TST-B)000123456,(TST-B)000123457', options))
        .to.throw(Error, /multiple \(base\)id pairs/);
      expect(() => parseAuthorityRecordLink('(TST-B)000123456,(TST-A)000123456', options))
        .to.throw(Error, /multiple \(base\)id pairs/);
    });
  });

  describe('parseAuthorityRecordLink error cases', () => {
    it('should throw on a non-mapped URN', () => {
      expect(() => parseAuthorityRecordLink('http://urn.fi/URN:ISBN:fi:au:cn:123456', options)).to.throw(Error);
      expect(() => parseAuthorityRecordLink('URN:ISBN:fi:au:cn:123456', options)).to.throw(Error);
    });

    it('should throw on a non-URN http url and on other invalid values', () => {
      expect(() => parseAuthorityRecordLink('http://example.org/123', options)).to.throw(Error, /url/);
      expect(() => parseAuthorityRecordLink('garbage', options)).to.throw(Error, /Invalid format/);
    });
  });

});

describe('authority-record-link: query generation and field matching', () => {

  describe('query generation', () => {
    const change = { library: 'TST10', recordId: '90001' };

    it('should build the plain base query', () => {
      expect(createPlainBaseQuery(change)).to.equal('(TST10)90001');
    });

    it('should build the unpadded URN query', () => {
      expect(createUrnQuery(change, options)).to.equal('http://urn.fi/URN:NBN:fi:au:cn:90001');
    });

    it('should build the zero-padded URN query', () => {
      expect(createUrnQueryPadded(change, options)).to.equal('http://urn.fi/URN:NBN:fi:au:cn:000090001');
    });

    it('should produce all four link forms, keyed by the baseMap key', () => {
      expect(createLinkQueries(change, options)).to.eql([
        '(TST-B)90001',
        '(TST10)90001',
        'http://urn.fi/URN:NBN:fi:au:cn:90001',
        'http://urn.fi/URN:NBN:fi:au:cn:000090001'
      ]);
    });
  });

  describe('createFieldMatcher', () => {
    const change = { library: 'TST10', recordId: '90001' };
    const matcher = createFieldMatcher(change, options);
    const field = (value) => ({ subfields: [{ code: '0', value }] });

    it('should match all four link forms', () => {
      expect(matcher(field('(TST-B)90001'))).to.be.true;
      expect(matcher(field('(TST10)90001'))).to.be.true;
      expect(matcher(field('http://urn.fi/URN:NBN:fi:au:cn:90001'))).to.be.true;
      expect(matcher(field('http://urn.fi/URN:NBN:fi:au:cn:000090001'))).to.be.true;
    });

    it('should tolerate trailing , or . punctuation', () => {
      expect(matcher(field('(TST10)90001,'))).to.be.true;
      expect(matcher(field('(TST-B)90001.'))).to.be.true;
    });

    it('should not match a different record id or a missing ‡0 subfield', () => {
      expect(matcher(field('(TST10)90002'))).to.be.false;
      expect(matcher({ subfields: [{ code: 'a', value: 'foo' }] })).to.be.false;
    });

    it('should not match a different base with the same record id', () => {
      expect(matcher(field('(TST01)90001'))).to.be.false;
    });
  });
});
