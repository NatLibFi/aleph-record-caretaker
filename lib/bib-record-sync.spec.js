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

const chai = require('chai');
const expect = chai.expect;
const sinon = require('sinon');
const MarcRecord = require('marc-record-js');

const RecordUtils = require('./record-utils');
const BibRecordSyncService = require('./bib-record-sync');

const {Punctuation} = require('@natlibfi/melinda-marc-record-utils');
const {BibRules: bibRules} = Punctuation;
const parseAuthorityLinkGlobal = BibRecordSyncService.parseAuthorityRecordLinkGlobal;

describe('parseAuthorityLinkGlobal', function () {
  const baseMap = {
    'TST01': 'TST01',
    'TST10': 'TST10',
  };

  const urnBaseMap = {
    'TST10': 'URN:NBN:fi:au:cn:'
  };

  const urnResolverPrefix = 'http://urn.fi/';

  const options = {
    baseMap,
    urnBaseMap,
    urnResolverPrefix,
    noOperation: false,
    noOperationBibChange: false,
    punctuationRulesForBibRecord: bibRules
  };

  it('should parse Aleph-ID correctly', () => {
    const link = parseAuthorityLinkGlobal("(FIN11)000123456", options);

    expect(link.base).to.equal('FIN11');
    expect(link.recordId).to.equal('000123456');
  });

  it('should parse Aleph-ID with incorrect end punctuation correctly', () => {
    const link = parseAuthorityLinkGlobal("(FIN11)000123456,", options);
    const link2 = parseAuthorityLinkGlobal("(FIN11)000123456.", options);

    expect(link.base).to.equal('FIN11');
    expect(link.recordId).to.equal('000123456');
    expect(link2.base).to.equal('FIN11');
    expect(link2.recordId).to.equal('000123456');
  });


  it('should parse isni correctly', () => {
    const link = parseAuthorityLinkGlobal("(isni)000123456", options);

    expect(link.base).to.equal('isni');
    expect(link.recordId).to.equal('000123456');
  });

  it('should skip non-mapped URNS', () => {
    expect(function () {
      parseAuthorityLinkGlobal("http://urn.fi/URN:ISBN:fi:au:cn:123456", options);
    }).to.throw(Error);
  });

  it('should skip URNS with no mapped resolver', () => {
    expect(function () {
      parseAuthorityLinkGlobal("URN:ISBN:fi:au:cn:123456", options);
    }).to.throw(Error);
  });

  it('should parse URN correctly', () => {
    const link = parseAuthorityLinkGlobal("http://urn.fi/URN:NBN:fi:au:cn:123456", options);
    const link2 = parseAuthorityLinkGlobal("http://urn.fi/URN:NBN:fi:au:cn:000123456", options);
    const link3 = parseAuthorityLinkGlobal("http://urn.fi/URN:NBN:fi:au:cn:123456A", options);

    expect(link.base).to.equal('TST10');
    expect(link.recordId).to.equal('123456');

    expect(link2.base).to.equal('TST10');
    expect(link2.recordId).to.equal('000123456');

    expect(link3.base).to.equal('TST10');
    expect(link3.recordId).to.equal('123456A');
  });
});


describe('BibRecordSyncService', () => {
  const baseMap = {
    'TST01': 'TST01',
    'TST10': 'TST10',
  };

  const urnBaseMap = {
    'TST10': 'URN:NBN:fi:au:cn:'
  };

  const urnResolverPrefix = 'http://urn.fi/';

  let recordServiceStub;
  let findServiceStub;
  let recordSyncService;
  let fakeBibRecord;
  let fakeAuthRecord;

  beforeEach(() => {
    recordServiceStub = {
      loadRecord: sinon.stub(),
      saveRecord: sinon.spy()
    };

    findServiceStub = {
      findLinkedBibRecords: sinon.stub()
    };

    fakeBibRecord = createFakeBibRecord();
    fakeAuthRecord = createFakeAuthRecord();

    const options = {
      baseMap,
      urnBaseMap,
      urnResolverPrefix,
      noOperation: false,
      noOperationBibChange: false,
      punctuationRulesForBibRecord: bibRules
    };

    const optionsNoOp = {
      baseMap,
      urnBaseMap,
      urnResolverPrefix,
      noOperation: false,
      noOperationBibChange: true,
      punctuationRulesForBibRecord: bibRules
    };

    recordSyncService = BibRecordSyncService.create(recordServiceStub, findServiceStub, options);
    recordSyncServiceNoOp = BibRecordSyncService.create(recordServiceStub, findServiceStub, optionsNoOp);
  });

  afterEach(() => {});

  it('should not save the record if "no operation" -flag or "no operation bib change" -flag is set', async () => {
    const fakeChange = {
      recordId: '00001',
      library: 'TST01'
    };

    fakeBibRecord.appendField(RecordUtils.stringToField('100    ‡aAakkula, I,‡tcontent‡0(TST10)90001'));
    fakeAuthRecord.appendField(RecordUtils.stringToField('100    ‡aAakkula, Immo,‡tcontent'));

    recordServiceStub.loadRecord.withArgs('TST01', '00001').resolves(fakeBibRecord);
    recordServiceStub.loadRecord.withArgs('TST10', '90001').resolves(fakeAuthRecord);

    await recordSyncServiceNoOp.handleBibChange(fakeChange);

    expect(recordServiceStub.saveRecord.callCount).to.equal(0, 'SaveRecord was called');
  });

  it('should not save the record if it has not changed', async () => {
    const fakeChange = {
      recordId: '00001',
      library: 'TST01'
    };

    fakeBibRecord.appendField(RecordUtils.stringToField('100    ‡aAakkula, Immo,‡tcontent'));
    fakeAuthRecord.appendField(RecordUtils.stringToField('100    ‡aAakkula, Immo,‡tcontent'));

    recordServiceStub.loadRecord.withArgs('TST01', '00001').resolves(fakeBibRecord);
    recordServiceStub.loadRecord.withArgs('TST10', '90001').resolves(fakeAuthRecord);

    await recordSyncService.handleBibChange(fakeChange);

    expect(recordServiceStub.saveRecord.callCount).to.equal(0, 'SaveRecord was called');
  });

  it('should copy the name from the authority record', async () => {
    const fakeChange = {
      recordId: '00001',
      library: 'TST01'
    };

    fakeBibRecord.appendField(RecordUtils.stringToField('100    ‡aAakkula, I,‡tcontent‡0(TST10)90001'));
    fakeAuthRecord.appendField(RecordUtils.stringToField('100    ‡aAakkula, Immo,‡tcontent'));

    recordServiceStub.loadRecord.withArgs('TST01', '00001').resolves(fakeBibRecord);
    recordServiceStub.loadRecord.withArgs('TST10', '90001').resolves(fakeAuthRecord);

    await recordSyncService.handleBibChange(fakeChange);

    expect(recordServiceStub.saveRecord.callCount).to.equal(1, 'SaveRecord was not called');

    const [base, recordId, record] = recordServiceStub.saveRecord.getCall(0).args;
    expect(base).to.equal('TST01');
    expect(recordId).to.equal('00001');

    expect(RecordUtils.fieldToString(record.getFields('100')[0])).to.equal('100    ‡aAakkula, Immo,‡tcontent.‡0(TST10)90001');
  });

  it('should skip field if link subfield is unparseable', async () => {
    const fakeChange = {
      recordId: '00001',
      library: 'TST01'
    };

    fakeBibRecord.appendField(RecordUtils.stringToField('100    ‡aAakkula, I,‡tcontent‡0TST1090001,'));
    fakeBibRecord.appendField(RecordUtils.stringToField('100    ‡aAakkula, I,‡tcontent'));
    fakeAuthRecord.appendField(RecordUtils.stringToField('100    ‡aAakkula, Immo,‡tcontent'));

    recordServiceStub.loadRecord.withArgs('TST01', '00001').resolves(fakeBibRecord);
    recordServiceStub.loadRecord.withArgs('TST10', '90001').resolves(fakeAuthRecord);

    await recordSyncService.handleBibChange(fakeChange);

    expect(recordServiceStub.saveRecord.callCount).to.equal(0, 'SaveRecord was called');
  });

  it('should handle linking by URNs', async () => {
    const fakeChange = {
      recordId: '00001',
      library: 'TST01'
    };

    fakeBibRecord.appendField(RecordUtils.stringToField('110    ‡aAakkula-K.,‡0http://urn.fi/URN:NBN:fi:au:cn:90001'));
    fakeBibRecord.appendField(RecordUtils.stringToField('710    ‡aAakkula-K.,‡0http://urn.fi/URN:NBN:fi:au:cn:000090001'));
    fakeAuthRecord.appendField(RecordUtils.stringToField('110    ‡aAakkula-Kerho'));

    recordServiceStub.loadRecord.withArgs('TST01', '00001').resolves(fakeBibRecord);
    recordServiceStub.loadRecord.withArgs('TST10', '90001').resolves(fakeAuthRecord);
    recordServiceStub.loadRecord.withArgs('TST10', '000090001').resolves(fakeAuthRecord);

    await recordSyncService.handleBibChange(fakeChange);

    expect(recordServiceStub.saveRecord.callCount).to.equal(1, 'SaveRecord was not called');

    const [base, recordId, record] = recordServiceStub.saveRecord.getCall(0).args;
    expect(base).to.equal('TST01');
    expect(recordId).to.equal('00001');

    expect(RecordUtils.fieldToString(record.getFields('110')[0])).to.equal('110    ‡aAakkula-Kerho.‡0http://urn.fi/URN:NBN:fi:au:cn:90001');
    expect(RecordUtils.fieldToString(record.getFields('710')[0])).to.equal('710    ‡aAakkula-Kerho.‡0http://urn.fi/URN:NBN:fi:au:cn:000090001');
  });

  it('should copy any names from multiple authority records', async () => {
    const fakeChange = {
      recordId: '00001',
      library: 'TST01'
    };

    fakeBibRecord.appendField(RecordUtils.stringToField('100    ‡aAakkula, I,‡tcontent‡0(TST10)90001'));
    fakeBibRecord.appendField(RecordUtils.stringToField('700    ‡aAakkula, I,‡tcontent‡0(TST10)90002'));
    fakeAuthRecord.appendField(RecordUtils.stringToField('100    ‡aAakkula, Immo,‡tcontent'));

    recordServiceStub.loadRecord.withArgs('TST01', '00001').resolves(fakeBibRecord);
    recordServiceStub.loadRecord.withArgs('TST10', '90001').resolves(fakeAuthRecord);
    recordServiceStub.loadRecord.withArgs('TST10', '90002').resolves(fakeAuthRecord);

    await recordSyncService.handleBibChange(fakeChange);

    expect(recordServiceStub.saveRecord.callCount).to.equal(1, 'SaveRecord was not called');

    const [base, recordId, record] = recordServiceStub.saveRecord.getCall(0).args;
    expect(base).to.equal('TST01');
    expect(recordId).to.equal('00001');

    expect(RecordUtils.fieldToString(record.getFields('100')[0])).to.equal('100    ‡aAakkula, Immo,‡tcontent.‡0(TST10)90001');
    expect(RecordUtils.fieldToString(record.getFields('700')[0])).to.equal('700    ‡aAakkula, Immo,‡tcontent.‡0(TST10)90002');
  });

  it('should handle case when there are multiple 0 subfields with different bases', async () => {
    const fakeChange = {
      recordId: '00001',
      library: 'TST01'
    };

    fakeBibRecord.appendField(RecordUtils.stringToField('100    ‡aAakkula, I,‡tcontent.‡0(FARAWAY)999‡0(TST10)90001'));
    fakeAuthRecord.appendField(RecordUtils.stringToField('100    ‡aAakkula, Immo,‡tcontent'));

    recordServiceStub.loadRecord.withArgs('TST01', '00001').resolves(fakeBibRecord);
    recordServiceStub.loadRecord.withArgs('TST10', '90001').resolves(fakeAuthRecord);

    await recordSyncService.handleBibChange(fakeChange);

    expect(recordServiceStub.saveRecord.callCount).to.equal(1, 'SaveRecord was not called');

    const [base, recordId, record] = recordServiceStub.saveRecord.getCall(0).args;

    expect(base).to.equal('TST01');
    expect(recordId).to.equal('00001');
    expect(RecordUtils.fieldToString(record.getFields('100')[0])).to.equal('100    ‡aAakkula, Immo,‡tcontent.‡0(FARAWAY)999‡0(TST10)90001');
  });

  it('should handle case when there are multiple similar 0 subfields with same base', async () => {
    const fakeChange = {
      recordId: '00001',
      library: 'TST01'
    };

    fakeBibRecord.appendField(RecordUtils.stringToField('100    ‡aAakkula, I,‡tcontent.‡0(TST10)90001‡0(TST10)90001'));
    fakeAuthRecord.appendField(RecordUtils.stringToField('100    ‡aAakkula, Immo,‡tcontent'));

    recordServiceStub.loadRecord.withArgs('TST01', '00001').resolves(fakeBibRecord);
    recordServiceStub.loadRecord.withArgs('TST10', '90001').resolves(fakeAuthRecord);

    await recordSyncService.handleBibChange(fakeChange);

    expect(recordServiceStub.saveRecord.callCount).to.equal(1, 'SaveRecord was not called');

    const [base, recordId, record] = recordServiceStub.saveRecord.getCall(0).args;

    expect(base).to.equal('TST01');
    expect(recordId).to.equal('00001');
    expect(RecordUtils.fieldToString(record.getFields('100')[0])).to.equal('100    ‡aAakkula, Immo,‡tcontent.‡0(TST10)90001‡0(TST10)90001');
  });

  it('should not handle deleted records', async () => {
    const fakeChange = {
      recordId: '00001',
      library: 'TST01'
    };

    fakeBibRecord.appendField(RecordUtils.stringToField('100    ‡aAakkula, I,‡tcontent‡0(TST10)90001'));
    fakeBibRecord.appendField(RecordUtils.stringToField('STA    ‡aDELETED'));
    fakeAuthRecord.appendField(RecordUtils.stringToField('100    ‡aAakkula, Immo,‡tcontent'));

    recordServiceStub.loadRecord.withArgs('TST01', '00001').resolves(fakeBibRecord);
    recordServiceStub.loadRecord.withArgs('TST10', '90001').resolves(fakeAuthRecord);

    await recordSyncService.handleBibChange(fakeChange);

    expect(recordServiceStub.saveRecord.callCount).to.equal(0, 'SaveRecord was called for deleted record');
  });

  it('should reject with an error if single field contains multiple links with same base', () => {
    const fakeChange = {
      recordId: '00001',
      library: 'TST01'
    };

    fakeBibRecord.appendField(RecordUtils.stringToField('100    ‡aAakkula, I,‡tcontent‡0(TST10)90001‡0(TST10)90002'));
    fakeAuthRecord.appendField(RecordUtils.stringToField('100    ‡aAakkula, Immo,‡tcontent'));

    recordServiceStub.loadRecord.withArgs('TST01', '00001').resolves(fakeBibRecord);
    recordServiceStub.loadRecord.withArgs('TST10', '90001').resolves(fakeAuthRecord);
    recordServiceStub.loadRecord.withArgs('TST10', '90002').resolves(fakeAuthRecord);

    const pro = recordSyncService.handleBibChange(fakeChange);

    return pro.then(expectFailure, (error) => {
      expect(error.message).to.equal('Record contains multiple links to supported bases (TST10, TST10). Unable to determine which one to use for updating the authorized portion.');
    });
  });

  it('should change bib record authorized portion tag to match the one in the authority record', async () => {
    const fakeChange = {
      recordId: '00001',
      library: 'TST01'
    };

    fakeBibRecord.appendField(RecordUtils.stringToField('100    ‡aAsia joka on henkilö,‡tcontent‡0(TST10)90001'));
    fakeAuthRecord.appendField(RecordUtils.stringToField('110    ‡aAsia joka muuttui henkilöstä yhteisöksi‡0(TST10)90001'));

    recordServiceStub.loadRecord.withArgs('TST01', '00001').resolves(fakeBibRecord);
    recordServiceStub.loadRecord.withArgs('TST10', '90001').resolves(fakeAuthRecord);

    await recordSyncService.handleBibChange(fakeChange);

    expect(recordServiceStub.saveRecord.callCount).to.equal(1, 'SaveRecord was not called');

    const [base, recordId, record] = recordServiceStub.saveRecord.getCall(0).args;

    expect(base).to.equal('TST01');
    expect(recordId).to.equal('00001');
    expect(RecordUtils.fieldToString(record.getFields('110')[0])).to.equal('110    ‡aAsia joka muuttui henkilöstä yhteisöksi.‡tcontent.‡0(TST10)90001');
    expect(record.getFields('100')).to.have.lengthOf(0);
  });

});

function expectFailure() {
  throw new Error('The action was successful when failure was expected');
}

function createFakeBibRecord() {
  return MarcRecord.fromString(`LDR    00533cz  a2200193n  4500
001    115575
005    20160523161656.0
008    011001|n|az|||aab|           | aaa      `);
}

function createFakeAuthRecord() {
  return MarcRecord.fromString(`LDR    00533cz  a2200193n  4500
001    115575
005    20160523161656.0
008    011001|n|az|||aab|           | aaa      `);
}
