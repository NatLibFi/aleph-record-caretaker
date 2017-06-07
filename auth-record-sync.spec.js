const chai = require('chai');
const expect = chai.expect;
const sinon = require('sinon');
const MarcRecord = require('marc-record-js');

const RecordUtils = require('../sync-tool/record-utils');
const AuthRecordSyncService = require('./auth-record-sync');

describe('AuthRecordSyncService', () => {

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
      findLinkedAgentRecords: sinon.stub()
    };

    findServiceStub.findLinkedAgentRecords.resolves([]);
    findServiceStub.findLinkedAgentRecords.resolves([]);
    
    fakeBibRecord = createFakeBibRecord();
    fakeAuthRecord = createFakeAuthRecord();

    recordSyncService = AuthRecordSyncService.create(recordServiceStub, findServiceStub, baseMap);
  });
  afterEach(() => {
  });

  describe('for linked bib records', () => {

    
    it('should not save the record if it has not changed', async () => {

      const fakeChange = {
        recordId: '90001',
        library: 'TST10'
      };

      fakeAuthRecord.appendField(RecordUtils.stringToField('100    ‡aAakkula, Immo,‡tcontent'));
      fakeBibRecord.appendField(RecordUtils.stringToField('100    ‡aAakkula, Immo,‡tcontent'));
      
      recordServiceStub.loadRecord.withArgs('TST10', '90001').resolves(fakeAuthRecord);
      recordServiceStub.loadRecord.withArgs('TST01', '00001').resolves(fakeBibRecord);
      findServiceStub.findLinkedAgentRecords.withArgs('TST01', '90001').resolves(['00001']);
      
      await recordSyncService.handleAuthChange(fakeChange);

      expect(recordServiceStub.saveRecord.callCount).to.equal(0, 'SaveRecord was called');

    });


    it('should copy the name from the authority record and update the bib record fields with it', async () => {

      const fakeChange = {
        recordId: '90001',
        library: 'TST10'
      };

      fakeBibRecord.appendField(RecordUtils.stringToField('100    ‡aAakkula, I,‡tcontent‡0(TST10)90001'));
      fakeBibRecord.appendField(RecordUtils.stringToField('700    ‡aAakkula, I,‡tcontent‡0(TST10)90001'));
      fakeAuthRecord.appendField(RecordUtils.stringToField('100    ‡aAakkula, Immo,‡tcontent'));

      recordServiceStub.loadRecord.withArgs('TST01', '00001').resolves(fakeBibRecord);
      recordServiceStub.loadRecord.withArgs('TST10', '90001').resolves(fakeAuthRecord);
      findServiceStub.findLinkedAgentRecords.withArgs('TST01', '90001').resolves(['00001']);

      await recordSyncService.handleAuthChange(fakeChange);

      expect(recordServiceStub.saveRecord.callCount).to.equal(1, 'SaveRecord was not called');

      const [base, recordId, record] = recordServiceStub.saveRecord.getCall(0).args;
      expect(base).to.equal('TST01');
      expect(recordId).to.equal('00001');

      expect(RecordUtils.fieldToString(record.getFields('100')[0])).to.equal('100    ‡aAakkula, Immo,‡tcontent‡0(TST10)90001');
      expect(RecordUtils.fieldToString(record.getFields('700')[0])).to.equal('700    ‡aAakkula, Immo,‡tcontent‡0(TST10)90001');

    });

    it('should handle case when there are multiple 0 subfields with different bases', async () => {

      const fakeChange = {
        recordId: '90001',
        library: 'TST10'
      };

      fakeBibRecord.appendField(RecordUtils.stringToField('100    ‡aAakkula, I,‡tcontent‡0(FARAWAY)999‡0(TST10)90001'));
      fakeAuthRecord.appendField(RecordUtils.stringToField('100    ‡aAakkula, Immo,‡tcontent'));

      recordServiceStub.loadRecord.withArgs('TST01', '00001').resolves(fakeBibRecord);
      recordServiceStub.loadRecord.withArgs('TST10', '90001').resolves(fakeAuthRecord);
      findServiceStub.findLinkedAgentRecords.withArgs('TST01', '90001').resolves(['00001']);

      await recordSyncService.handleAuthChange(fakeChange);

      expect(recordServiceStub.saveRecord.callCount).to.equal(1, 'SaveRecord was not called');

      const [base, recordId, record] = recordServiceStub.saveRecord.getCall(0).args;
      expect(base).to.equal('TST01');
      expect(recordId).to.equal('00001');

      expect(RecordUtils.fieldToString(record.getFields('100')[0])).to.equal('100    ‡aAakkula, Immo,‡tcontent‡0(FARAWAY)999‡0(TST10)90001');

    });

    it('should not handle deleted auth records', async () => {

      const fakeChange = {
        recordId: '90001',
        library: 'TST10'
      };

      fakeBibRecord.appendField(RecordUtils.stringToField('100    ‡aAakkula, I,‡tcontent‡0(TST10)90001'));
      fakeAuthRecord.appendField(RecordUtils.stringToField('100    ‡aAakkula, Immo,‡tcontent'));
      fakeAuthRecord.appendField(RecordUtils.stringToField('STA    ‡aDELETED'));

      recordServiceStub.loadRecord.withArgs('TST01', '00001').resolves(fakeBibRecord);
      recordServiceStub.loadRecord.withArgs('TST10', '90001').resolves(fakeAuthRecord);
      findServiceStub.findLinkedAgentRecords.withArgs('TST01', '90001').resolves(['00001']);

      await recordSyncService.handleAuthChange(fakeChange);

      expect(recordServiceStub.saveRecord.callCount).to.equal(0, 'SaveRecord was called for deleted record');

    });

    it('should not handle deleted bib records', async () => {

      const fakeChange = {
        recordId: '90001',
        library: 'TST10'
      };

      fakeBibRecord.appendField(RecordUtils.stringToField('100    ‡aAakkula, I,‡tcontent‡0(TST10)90001'));
      fakeBibRecord.appendField(RecordUtils.stringToField('STA    ‡aDELETED'));
      fakeAuthRecord.appendField(RecordUtils.stringToField('100    ‡aAakkula, Immo,‡tcontent'));
      
      recordServiceStub.loadRecord.withArgs('TST01', '00001').resolves(fakeBibRecord);
      recordServiceStub.loadRecord.withArgs('TST10', '90001').resolves(fakeAuthRecord);
      findServiceStub.findLinkedAgentRecords.withArgs('TST01', '90001').resolves(['00001']);

      await recordSyncService.handleAuthChange(fakeChange);

      expect(recordServiceStub.saveRecord.callCount).to.equal(0, 'SaveRecord was called for deleted record');

    });
  });

  describe('for linked auth records', () => {

    it('should copy the name from the authority record and update the linked record fields with it', async () => {

      const fakeChange = {
        recordId: '90001',
        library: 'TST10'
      };
      const fakeLinkedAuthRecord = new MarcRecord(fakeAuthRecord);

      fakeLinkedAuthRecord.appendField(RecordUtils.stringToField('400    ‡aAakkula, I,‡tcontent‡0(TST10)90001'));
      fakeAuthRecord.appendField(RecordUtils.stringToField('100    ‡aAakkula, Immo,‡tcontent'));

      recordServiceStub.loadRecord.withArgs('TST10', '00001').resolves(fakeLinkedAuthRecord);
      recordServiceStub.loadRecord.withArgs('TST10', '90001').resolves(fakeAuthRecord);
      findServiceStub.findLinkedAgentRecords.withArgs('TST10', '90001').resolves(['00001']);
      findServiceStub.findLinkedAgentRecords.withArgs('TST01', '90001').resolves([]);

      await recordSyncService.handleAuthChange(fakeChange);

      expect(recordServiceStub.saveRecord.callCount).to.equal(1, 'SaveRecord was not called');

      const [base, recordId, record] = recordServiceStub.saveRecord.getCall(0).args;
      expect(base).to.equal('TST10');
      expect(recordId).to.equal('00001');

      expect(RecordUtils.fieldToString(record.getFields('400')[0])).to.equal('400    ‡aAakkula, Immo,‡tcontent‡0(TST10)90001');

    });

  });
});

function expectFailure() {
  throw new Error('The action was succesfull when failure was expected');
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