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
 */const chai = require('chai');
const expect = chai.expect;
const sinon = require('sinon');
const MarcRecord = require('marc-record-js');
const _ = require('lodash');

const RecordUtils = require('./record-utils');
const AuthRecordSyncService = require('./auth-record-sync');

const {Punctuation} = require('@natlibfi/melinda-marc-record-utils');
const {AuthRules: authRules, BibRules: bibRules} = Punctuation;
const fs = require('fs');
const path = require('path');

const createUrnQuery = AuthRecordSyncService.createUrnQuery;
const createUrnQueryPadded = AuthRecordSyncService.createUrnQueryPadded;

describe('CreateUrnQuery', () => {

    const baseMap = {
      'TST01': 'TST01',
      'TST10': 'TST10'
    };

   const urnBaseMap = {
      'TST10': 'URN:NBN:fi:au:cn:'
    };

   const urnResolverPrefix = 'http://urn.fi/';

    logger = { log: sinon.spy() };

    const options = {
      bibRecordBase: 'TST01',
      agentRecordBase: 'TST10',
      baseMap,
      urnBaseMap,
      urnResolverPrefix,
      punctuationRulesForBibRecord: bibRules,
      punctuationRulesForAuthRecord: authRules,
      logger
    };

    const fakeChange = {
        recordId: '90001',
        library: 'TST10'
    };

 
   it('should create URN query correctly from change data and options', () => {


       const query =   createUrnQuery(fakeChange,options);

       expect(query).to.equal('http://urn.fi/URN:NBN:fi:au:cn:90001');

   });



});

describe('CreateUrnQueryPadded', () => {

    const baseMap = {
      'TST01': 'TST01',
      'TST10': 'TST10'
    };

   const urnBaseMap = {
      'TST10': 'URN:NBN:fi:au:cn:'
    };

   const urnResolverPrefix = 'http://urn.fi/';

    logger = { log: sinon.spy() };

    const options = {
      bibRecordBase: 'TST01',
      agentRecordBase: 'TST10',
      baseMap,
      urnBaseMap,
      urnResolverPrefix,
      punctuationRulesForBibRecord: bibRules,
      punctuationRulesForAuthRecord: authRules,
      logger
    };

    const fakeChange = {
        recordId: '90001',
        library: 'TST10'
    };

 
   it('should create padded URN query correctly from change data and options', () => {


       const query =   createUrnQueryPadded(fakeChange,options);

       expect(query).to.equal('http://urn.fi/URN:NBN:fi:au:cn:000090001');

   });



});

describe('AuthRecordSyncService', () => {

  let recordServiceStub;
  let findServiceStub;
  let recordSyncService;
  let fakeBibRecord;
  let fakeAuthRecord;
  let logger;

  beforeEach(() => {
    recordServiceStub = {
      loadRecord: sinon.stub(),
      saveRecord: sinon.spy()
    };
    findServiceStub = {
      findLinkedAgentRecords: sinon.stub()
    };

    findServiceStub.findLinkedAgentRecords.resolves([]);
    
    fakeBibRecord = createFakeBibRecord();
    fakeAuthRecord = createFakeAuthRecord();

    const baseMap = {
      'TST01': 'TST01',
      'TST10': 'TST10'
    };
 
   const urnBaseMap = {
      'TST10': 'URN:NBN:fi:au:cn:'
    };

   const urnResolverPrefix = 'http://urn.fi/';

    logger = { log: sinon.spy() };

    const options = {
      bibRecordBase: 'TST01',
      agentRecordBase: 'TST10',
      baseMap,
      urnBaseMap,
      urnResolverPrefix,
      punctuationRulesForBibRecord: bibRules,
      punctuationRulesForAuthRecord: authRules,
      logger
    };

    recordSyncService = AuthRecordSyncService.create(recordServiceStub, findServiceStub, options);
  });
  afterEach(() => {
  });

  describe('for linked bib records', () => {

    beforeEach(() => {
      recordServiceStub.loadRecord.withArgs('TST01', '00001').resolves(fakeBibRecord);
      recordServiceStub.loadRecord.withArgs('TST10', '90001').resolves(fakeAuthRecord);
      findServiceStub.findLinkedAgentRecords.withArgs('TST01', '90001').resolves(['00001']);
    });

    
    it('should not save the record if it has not changed', async () => {

      const fakeChange = {
        recordId: '90001',
        library: 'TST10'
      };

      fakeAuthRecord.appendField(RecordUtils.stringToField('100    ‡aAakkula, Immo,‡tcontent'));
      fakeBibRecord.appendField(RecordUtils.stringToField('100    ‡aAakkula, Immo,‡tcontent'));
      
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

      await recordSyncService.handleAuthChange(fakeChange);

      expect(recordServiceStub.saveRecord.callCount).to.equal(1, 'SaveRecord was not called');

      const [base, recordId, record] = recordServiceStub.saveRecord.getCall(0).args;
      expect(base).to.equal('TST01');
      expect(recordId).to.equal('00001');

      expect(RecordUtils.fieldToString(record.getFields('100')[0])).to.equal('100    ‡aAakkula, Immo,‡tcontent.‡0(TST10)90001');
      expect(RecordUtils.fieldToString(record.getFields('700')[0])).to.equal('700    ‡aAakkula, Immo,‡tcontent.‡0(TST10)90001');

    });


    it('should copy the name from the authority record and update the bib record fields linked with matching URN with it', async () => {

      const fakeChange = {
        recordId: '90001',
        library: 'TST10'
      };

      fakeBibRecord.appendField(RecordUtils.stringToField('100    ‡aAakkula, I,‡tcontent‡0http://urn.fi/URN:NBN:fi:au:cn:000090001'));
      fakeBibRecord.appendField(RecordUtils.stringToField('700    ‡aAakkula, I,‡tcontent‡0http://urn.fi/URN:NBN:fi:au:cn:90001'));
      fakeAuthRecord.appendField(RecordUtils.stringToField('100    ‡aAakkula, Immo,‡tcontent'));

      await recordSyncService.handleAuthChange(fakeChange);

      expect(recordServiceStub.saveRecord.callCount).to.equal(1, 'SaveRecord was not called');

      const [base, recordId, record] = recordServiceStub.saveRecord.getCall(0).args;
      expect(base).to.equal('TST01');
      expect(recordId).to.equal('00001');

      expect(RecordUtils.fieldToString(record.getFields('100')[0])).to.equal('100    ‡aAakkula, Immo,‡tcontent.‡0http://urn.fi/URN:NBN:fi:au:cn:000090001');
      expect(RecordUtils.fieldToString(record.getFields('700')[0])).to.equal('700    ‡aAakkula, Immo,‡tcontent.‡0http://urn.fi/URN:NBN:fi:au:cn:90001');


    });

    it('should copy the name from the authority record and update the bib record fields linked with it, even if link subfield in bib record has mistaken punctuation', async () => {

      const fakeChange = {
        recordId: '90001',
        library: 'TST10'
      };

      fakeBibRecord.appendField(RecordUtils.stringToField('100    ‡aAakkula, I,‡tcontent‡0(TST10)90001,'));
      fakeBibRecord.appendField(RecordUtils.stringToField('700    ‡aAakkula, I,‡tcontent‡0(TST10)90001.'));
      fakeAuthRecord.appendField(RecordUtils.stringToField('100    ‡aAakkula, Immo,‡tcontent'));

      await recordSyncService.handleAuthChange(fakeChange);

      expect(recordServiceStub.saveRecord.callCount).to.equal(1, 'SaveRecord was not called');

      const [base, recordId, record] = recordServiceStub.saveRecord.getCall(0).args;
      expect(base).to.equal('TST01');
      expect(recordId).to.equal('00001');

      expect(RecordUtils.fieldToString(record.getFields('100')[0])).to.equal('100    ‡aAakkula, Immo,‡tcontent.‡0(TST10)90001,');
      expect(RecordUtils.fieldToString(record.getFields('700')[0])).to.equal('700    ‡aAakkula, Immo,‡tcontent.‡0(TST10)90001.');


    });


    it('should handle case when there are multiple 0 subfields with different bases', async () => {

      const fakeChange = {
        recordId: '90001',
        library: 'TST10'
      };

      fakeBibRecord.appendField(RecordUtils.stringToField('100    ‡aAakkula, I,‡tcontent‡0(FARAWAY)999‡0(TST10)90001'));
      fakeAuthRecord.appendField(RecordUtils.stringToField('100    ‡aAakkula, Immo,‡tcontent'));

      await recordSyncService.handleAuthChange(fakeChange);

      expect(recordServiceStub.saveRecord.callCount).to.equal(1, 'SaveRecord was not called');

      const [base, recordId, record] = recordServiceStub.saveRecord.getCall(0).args;
      expect(base).to.equal('TST01');
      expect(recordId).to.equal('00001');

      expect(RecordUtils.fieldToString(record.getFields('100')[0])).to.equal('100    ‡aAakkula, Immo,‡tcontent.‡0(FARAWAY)999‡0(TST10)90001');

    });


    it('should handle case when there are multiple similar 0 subfields with same bases', async () => {

      const fakeChange = {
        recordId: '90001',
        library: 'TST10'
      };

      fakeBibRecord.appendField(RecordUtils.stringToField('100    ‡aAakkula, I,‡tcontent‡0(TST10)90001‡0(TST10)90001'));
      fakeAuthRecord.appendField(RecordUtils.stringToField('100    ‡aAakkula, Immo,‡tcontent'));

      await recordSyncService.handleAuthChange(fakeChange);

      expect(recordServiceStub.saveRecord.callCount).to.equal(1, 'SaveRecord was not called');

      const [base, recordId, record] = recordServiceStub.saveRecord.getCall(0).args;
      expect(base).to.equal('TST01');
      expect(recordId).to.equal('00001');

      expect(RecordUtils.fieldToString(record.getFields('100')[0])).to.equal('100    ‡aAakkula, Immo,‡tcontent.‡0(TST10)90001‡0(TST10)90001');

    });


    it('should not handle deleted auth records', async () => {

      const fakeChange = {
        recordId: '90001',
        library: 'TST10'
      };

      fakeBibRecord.appendField(RecordUtils.stringToField('100    ‡aAakkula, I,‡tcontent‡0(TST10)90001'));
      fakeAuthRecord.appendField(RecordUtils.stringToField('100    ‡aAakkula, Immo,‡tcontent'));
      fakeAuthRecord.appendField(RecordUtils.stringToField('STA    ‡aDELETED'));

      await recordSyncService.handleAuthChange(fakeChange);

      expect(recordServiceStub.saveRecord.callCount).to.equal(0, 'SaveRecord was called for deleted record');

    });


    it('should handle multiple records', async () => {

      const fakeChange = {
        recordId: '90001',
        library: 'TST10'
      };

      const fakeBibRecord1 = MarcRecord.clone(fakeBibRecord);
      const fakeBibRecord2 = MarcRecord.clone(fakeBibRecord);
      
      fakeBibRecord1.appendField(RecordUtils.stringToField('100    ‡aAakkula, I,‡etestaaja.‡0(TST10)90001'));
      fakeBibRecord2.appendField(RecordUtils.stringToField('100    ‡aAakkula, I‡0(TST10)90001'));

      fakeAuthRecord.appendField(RecordUtils.stringToField('100    ‡aAakkula, Immo'));

      findServiceStub.findLinkedAgentRecords.withArgs('TST01', '90001').resolves(['00001', '00002']);
      recordServiceStub.loadRecord.withArgs('TST01', '00001').resolves(fakeBibRecord1);
      recordServiceStub.loadRecord.withArgs('TST01', '00002').resolves(fakeBibRecord2);
      
      await recordSyncService.handleAuthChange(fakeChange);

      expect(recordServiceStub.saveRecord.callCount).to.equal(2, 'Expected saveRecord to be called 2 times.');

      const [,,record1] = recordServiceStub.saveRecord.getCall(0).args;
      const [,,record2] = recordServiceStub.saveRecord.getCall(1).args;
      
      expect(RecordUtils.fieldToString(record1.getFields('100')[0])).to.equal('100    ‡aAakkula, Immo,‡etestaaja.‡0(TST10)90001');
      expect(RecordUtils.fieldToString(record2.getFields('100')[0])).to.equal('100    ‡aAakkula, Immo.‡0(TST10)90001');
      
    });
  

    it('should not handle deleted bib records', async () => {

      const fakeChange = {
        recordId: '90001',
        library: 'TST10'
      };

      fakeBibRecord.appendField(RecordUtils.stringToField('100    ‡aAakkula, I,‡tcontent‡0(TST10)90001'));
      fakeBibRecord.appendField(RecordUtils.stringToField('STA    ‡aDELETED'));
      fakeAuthRecord.appendField(RecordUtils.stringToField('100    ‡aAakkula, Immo,‡tcontent'));
      
      await recordSyncService.handleAuthChange(fakeChange);

      expect(recordServiceStub.saveRecord.callCount).to.equal(0, 'SaveRecord was called for deleted record');
    });

    it('should not stop when one of the records fail', async () => {

      const fakeChange = {
        recordId: '90001',
        library: 'TST10'
      };

      const fakeBibRecord1 = createFakeBibRecord();
      const fakeBibRecord2 = createFakeBibRecord();
      const fakeBibRecord3 = createFakeBibRecord();

      fakeBibRecord1.appendField(RecordUtils.stringToField('100    ‡aAakkula, I,‡tcontent‡0(TST10)90001'));
      fakeBibRecord1.appendField(RecordUtils.stringToField('STA    ‡aDELETED'));

      fakeAuthRecord.appendField(RecordUtils.stringToField('100    ‡aAakkula, Immo,‡tcontent'));
      
      fakeBibRecord2.appendField(RecordUtils.stringToField('100    ‡aAakkula, I,‡Hxxx‡tcontent‡0(TST10)90001'));
      fakeBibRecord3.appendField(RecordUtils.stringToField('100    ‡aAakkula, I,‡tcontent‡0(TST10)90001'));

      recordServiceStub.loadRecord.withArgs('TST01', '00001').resolves(fakeBibRecord1);
      recordServiceStub.loadRecord.withArgs('TST01', '00002').resolves(fakeBibRecord2);
      recordServiceStub.loadRecord.withArgs('TST01', '00003').resolves(fakeBibRecord3);
      recordServiceStub.loadRecord.withArgs('TST10', '90001').resolves(fakeAuthRecord);
      findServiceStub.findLinkedAgentRecords.withArgs('TST01', '90001').resolves(['00001', '00002', '00003']);
      
      await recordSyncService.handleAuthChange(fakeChange);

      expect(recordServiceStub.saveRecord.callCount).to.equal(1);

      const removeJobIdFromMessage = (msg) => ([msg[0], _.isString(msg[1]) ? msg[1].replace(/^\[.*\]/, '[##########]') : msg[1] ]);
      const logMessages = _.range(0, logger.log.callCount).map(i => logger.log.getCall(i)).map(i => _.get(i, 'args'));
      const logMessagesWithoutJobId = logMessages.map(removeJobIdFromMessage);

      /*expect(logMessagesWithoutJobId).to.deep.include(['info', '[##########] Loading bib record TST01 / 00001']);
      expect(logMessagesWithoutJobId).to.deep.include(['info', '[##########] Loading bib record TST01 / 00002']);
      expect(logMessagesWithoutJobId).to.deep.include(['info', '[##########] Loading bib record TST01 / 00003']);*/
      
      const errorMessages = logMessages.filter(msg => msg[0] === 'error');
      const error = _.get(errorMessages, '[0][2]');
      expect(error.name).to.equal('PunctuationError');
      expect(error.message).to.equal('Unknown subfield code H');
      
      //expect(logMessagesWithoutJobId).to.deep.include(['info', '[##########] Record TST01 / 00001 is deleted, skipping.']);

    });
  });

  describe('for linked auth records', () => {
    let fakeLinkedAuthRecord;
    let fakeChange;

    beforeEach(() => {
      fakeLinkedAuthRecord = new MarcRecord(fakeAuthRecord);

      fakeChange = {
        recordId: '90001',
        library: 'TST10'
      };

      recordServiceStub.loadRecord.withArgs('TST10', '00001').resolves(fakeLinkedAuthRecord);
      recordServiceStub.loadRecord.withArgs('TST10', '90001').resolves(fakeAuthRecord);
      findServiceStub.findLinkedAgentRecords.withArgs('TST10', '90001').resolves(['00001']);
      findServiceStub.findLinkedAgentRecords.withArgs('TST01', '90001').resolves([]);

    });

    it('should copy the name from the authority record and update the linked record fields with it', async () => {

      fakeAuthRecord.appendField(RecordUtils.stringToField('100    ‡aAakkula, Immo,‡d1934-1992‡0(TST10)90001'));
      fakeLinkedAuthRecord.appendField(RecordUtils.stringToField('500    ‡aAakkula, I.,‡0(TST10)90001'));

      await recordSyncService.handleAuthChange(fakeChange);

      expect(recordServiceStub.saveRecord.callCount).to.equal(1, 'SaveRecord was not called');
      const [, , record] = recordServiceStub.saveRecord.getCall(0).args;
 
      expect(RecordUtils.fieldToString(record.getFields('500')[0])).to.equal('500    ‡aAakkula, Immo,‡d1934-1992‡0(TST10)90001');
    });

    it('should copy the name from the authority record and update the linked record fields (linked with URNs) with it', async () => {

      fakeAuthRecord.appendField(RecordUtils.stringToField('100    ‡aAakkula, Immo,‡d1934-1992‡0(TST10)90001'));
      fakeLinkedAuthRecord.appendField(RecordUtils.stringToField('500    ‡aAakkula, I.,‡0http://urn.fi/URN:NBN:fi:au:cn:000090001'));

      await recordSyncService.handleAuthChange(fakeChange);

      expect(recordServiceStub.saveRecord.callCount).to.equal(1, 'SaveRecord was not called');
      const [, , record] = recordServiceStub.saveRecord.getCall(0).args;
 
      expect(RecordUtils.fieldToString(record.getFields('500')[0])).to.equal('500    ‡aAakkula, Immo,‡d1934-1992‡0http://urn.fi/URN:NBN:fi:au:cn:000090001');
    });



    it('should copy the name and tag if it changes', async () => {

      fakeAuthRecord.appendField(RecordUtils.stringToField('110    ‡aAsia joka muuttui henkilöstä yhteisöksi‡0(TST10)90001'));
      fakeLinkedAuthRecord.appendField(RecordUtils.stringToField('500    ‡aAsia joka on henkilö,‡cnimimerkki‡0(TST10)90001'));

      await recordSyncService.handleAuthChange(fakeChange);

      expect(recordServiceStub.saveRecord.callCount).to.equal(1, 'SaveRecord was not called');
      const [, , record] = recordServiceStub.saveRecord.getCall(0).args;
 
      expect(RecordUtils.fieldToString(record.getFields('510')[0])).to.equal('510    ‡aAsia joka muuttui henkilöstä yhteisöksi‡0(TST10)90001');
      expect(record.getFields('500')).to.have.lengthOf(0);
      
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
