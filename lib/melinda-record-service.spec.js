/**
 * Copyright 2026 University Of Helsinki (The National Library Of Finland)
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

const proxyquire = require('proxyquire').noCallThru();
const expect = require('chai').expect;
const sinon = require('sinon');
const Q = require('q');

const fakeMelindaEndpoint = 'http://melinda.example.com';
const fakeXServer = 'http://xserver.example.com/aleph/X';
const fakeCredentials = { username: 'caretaker', password: 'passw0rd' };

const melindaClientStub = {
  createRecord: sinon.stub(),
  updateRecord: sinon.stub()
};
let fakeClientOptions;
class FakeMelindaClient {
  constructor(options) {
    fakeClientOptions = options;
  }
  createRecord(record) {
    return Q(melindaClientStub.createRecord(record));
  }
  updateRecord(record) {
    return Q(melindaClientStub.updateRecord(record));
  }
}

const alephRecordServiceStub = {
  loadRecord: sinon.stub(),
  saveRecord: sinon.stub(),
  createRecord: sinon.stub()
};
const fakeAlephRecordService = {
  createAlephRecordService: sinon.stub().returns(alephRecordServiceStub),
  AlephRecordError: class AlephRecordError extends Error {}
};

const { createMelindaRecordService, AlephRecordError } = proxyquire('./melinda-record-service', {
  '@natlibfi/melinda-api-client': FakeMelindaClient,
  './aleph-record-service': fakeAlephRecordService
});

function createFakeRecord() {
  return { tag: 'fake', fields: [] };
}

describe('melinda-record-service', () => {

  let recordService;

  beforeEach(() => {
    melindaClientStub.createRecord.reset();
    melindaClientStub.updateRecord.reset();
    alephRecordServiceStub.loadRecord.reset();
    alephRecordServiceStub.saveRecord.reset();
    recordService = createMelindaRecordService(fakeMelindaEndpoint, fakeXServer, fakeCredentials);
  });

  it('should create the melinda client with the endpoint and credentials', () => {
    expect(fakeAlephRecordService.createAlephRecordService.calledOnceWith(fakeXServer, fakeCredentials)).to.be.true;
    expect(fakeClientOptions).to.eql({
      endpoint: fakeMelindaEndpoint,
      user: fakeCredentials.username,
      password: fakeCredentials.password
    });
  });

  it('should re-export AlephRecordError from aleph-record-service', () => {
    expect(AlephRecordError).to.equal(fakeAlephRecordService.AlephRecordError);
  });

  describe('loadRecord', () => {

    it('should delegate to the X-server aleph record service', async () => {
      const fakeRecord = createFakeRecord();
      alephRecordServiceStub.loadRecord.resolves(fakeRecord);

      const result = await recordService.loadRecord('fin11', '000012345');

      expect(alephRecordServiceStub.loadRecord.calledOnceWith('fin11', '000012345')).to.be.true;
      expect(result).to.equal(fakeRecord);
    });
  });

  describe('createRecord', () => {

    it('should create fin01 records through the melinda client', async () => {
      const fakeRecord = createFakeRecord();
      melindaClientStub.createRecord.resolves({ recordId: '999999999' });

      const result = await recordService.createRecord('fin01', fakeRecord);

      expect(melindaClientStub.createRecord.calledOnceWith(fakeRecord)).to.be.true;
      expect(result).to.eql({ recordId: '999999999' });
      expect(alephRecordServiceStub.saveRecord.callCount).to.equal(0);
    });

    it('should create records in other bases through the X-server', async () => {
      const fakeRecord = createFakeRecord();
      alephRecordServiceStub.saveRecord.resolves({ recordId: '000000000' });

      const result = await recordService.createRecord('fin11', fakeRecord);

      expect(alephRecordServiceStub.saveRecord.calledOnceWith('fin11', '000000000', fakeRecord)).to.be.true;
      expect(result).to.eql({ recordId: '000000000' });
    });

    it('should treat base case-insensitively when routing fin01 to melinda', async () => {
      const fakeRecord = createFakeRecord();
      await recordService.createRecord('FIN01', fakeRecord);

      expect(melindaClientStub.createRecord.callCount).to.equal(1);
      expect(alephRecordServiceStub.saveRecord.callCount).to.equal(0);
    });
  });

  describe('saveRecord', () => {

    it('should save fin01 records through the melinda client', async () => {
      const fakeRecord = createFakeRecord();
      melindaClientStub.updateRecord.resolves({ recordId: '000012345' });

      const result = await recordService.saveRecord('fin01', '000012345', fakeRecord);

      expect(melindaClientStub.updateRecord.calledOnceWith(fakeRecord)).to.be.true;
      expect(alephRecordServiceStub.saveRecord.callCount).to.equal(0);
      expect(result).to.eql({ recordId: '000012345' });
    });

    it('should save records in other bases through the X-server', async () => {
      const fakeRecord = createFakeRecord();
      alephRecordServiceStub.saveRecord.resolves({ recordId: '000012345' });

      const result = await recordService.saveRecord('fin11', '000012345', fakeRecord);

      expect(alephRecordServiceStub.saveRecord.calledOnceWith('fin11', '000012345', fakeRecord)).to.be.true;
      expect(melindaClientStub.updateRecord.callCount).to.equal(0);
      expect(result).to.eql({ recordId: '000012345' });
    });

    it('should propagate errors from the melinda client', async () => {
      const fakeRecord = createFakeRecord();
      melindaClientStub.updateRecord.rejects(new Error('melinda unavailable'));

      let error;
      try {
        await recordService.saveRecord('fin01', '000012345', fakeRecord);
      } catch (e) {
        error = e;
      }
      expect(error).to.be.instanceOf(Error);
      expect(error.message).to.equal('melinda unavailable');
    });
  });
});
