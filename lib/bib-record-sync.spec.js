const chai = require('chai');
const expect = chai.expect;
const sinon = require('sinon');
const MarcRecord = require('marc-record-js');

const RecordUtils = require('./record-utils');
const BibRecordSyncService = require('./bib-record-sync');

describe('BibRecordSyncService', () => {

  const baseMap = {
    'TST01': 'TST01',
    'TST10': 'TST10',
  };

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

    recordSyncService = BibRecordSyncService.create(recordServiceStub, findServiceStub, baseMap);
  });
  afterEach(() => {
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

    expect(RecordUtils.fieldToString(record.getFields('100')[0])).to.equal('100    ‡aAakkula, Immo,‡tcontent‡0(TST10)90001');

  });

  it('should handle 110 fields', async () => {

    const fakeChange = {
      recordId: '00001',
      library: 'TST01'
    };

    fakeBibRecord.appendField(RecordUtils.stringToField('110    ‡aAakkula-K.,‡0(TST10)90001'));
    fakeAuthRecord.appendField(RecordUtils.stringToField('110    ‡aAakkula-Kerho'));

    recordServiceStub.loadRecord.withArgs('TST01', '00001').resolves(fakeBibRecord);
    recordServiceStub.loadRecord.withArgs('TST10', '90001').resolves(fakeAuthRecord);

    await recordSyncService.handleBibChange(fakeChange);

    expect(recordServiceStub.saveRecord.callCount).to.equal(1, 'SaveRecord was not called');

    const [base, recordId, record] = recordServiceStub.saveRecord.getCall(0).args;
    expect(base).to.equal('TST01');
    expect(recordId).to.equal('00001');

    expect(RecordUtils.fieldToString(record.getFields('110')[0])).to.equal('110    ‡aAakkula-Kerho‡0(TST10)90001');

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

    expect(RecordUtils.fieldToString(record.getFields('100')[0])).to.equal('100    ‡aAakkula, Immo,‡tcontent‡0(TST10)90001');
    expect(RecordUtils.fieldToString(record.getFields('700')[0])).to.equal('700    ‡aAakkula, Immo,‡tcontent‡0(TST10)90002');

  });

  it('should handle case when there are multiple 0 subfields with different bases', async () => {

    const fakeChange = {
      recordId: '00001',
      library: 'TST01'
    };

    fakeBibRecord.appendField(RecordUtils.stringToField('100    ‡aAakkula, I,‡tcontent‡0(FARAWAY)999‡0(TST10)90001'));
    fakeAuthRecord.appendField(RecordUtils.stringToField('100    ‡aAakkula, Immo,‡tcontent'));

    recordServiceStub.loadRecord.withArgs('TST01', '00001').resolves(fakeBibRecord);
    recordServiceStub.loadRecord.withArgs('TST10', '90001').resolves(fakeAuthRecord);

    await recordSyncService.handleBibChange(fakeChange);

    expect(recordServiceStub.saveRecord.callCount).to.equal(1, 'SaveRecord was not called');

    const [base, recordId, record] = recordServiceStub.saveRecord.getCall(0).args;
    expect(base).to.equal('TST01');
    expect(recordId).to.equal('00001');

    expect(RecordUtils.fieldToString(record.getFields('100')[0])).to.equal('100    ‡aAakkula, Immo,‡tcontent‡0(FARAWAY)999‡0(TST10)90001');

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

    fakeBibRecord.appendField(RecordUtils.stringToField( '100    ‡aAsia joka on henkilö,‡tcontent‡0(TST10)90001'));
    fakeAuthRecord.appendField(RecordUtils.stringToField('110    ‡aAsia joka muuttui henkilöstä yhteisöksi‡0(TST10)90001'));

    recordServiceStub.loadRecord.withArgs('TST01', '00001').resolves(fakeBibRecord);
    recordServiceStub.loadRecord.withArgs('TST10', '90001').resolves(fakeAuthRecord);

    await recordSyncService.handleBibChange(fakeChange);
    
    expect(recordServiceStub.saveRecord.callCount).to.equal(1, 'SaveRecord was not called');

    const [base, recordId, record] = recordServiceStub.saveRecord.getCall(0).args;
    expect(base).to.equal('TST01');
    expect(recordId).to.equal('00001');

    expect(RecordUtils.fieldToString(record.getFields('110')[0])).to.equal('110    ‡aAsia joka muuttui henkilöstä yhteisöksi,‡tcontent‡0(TST10)90001');
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