const _ = require('lodash');
const expect = require('chai').expect;
const sinon = require('sinon');
const fs = require('fs');
const MarcRecord = require('marc-record-js');

const RecordUtils = require('../sync-tool/record-utils');

const BibRecordSyncService = require('./bib-record-sync');

describe('BibRecordSyncService', () => {

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


    recordSyncService = BibRecordSyncService.create(recordServiceStub, findServiceStub);
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

});

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