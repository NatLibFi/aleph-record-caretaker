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
const _ = require('lodash');

const fetchStub = sinon.stub();

// es6-promisify is ESM-only, so require() does not yield the function
// directly; provide a working promisify for the callback-based parseString.
function promisify(fn) {
  return (arg) => new Promise((resolve, reject) => {
    fn(arg, (err, result) => (err ? reject(err) : resolve(result)));
  });
}

const { create } = proxyquire('./aleph-find-service', {
  'isomorphic-fetch': fetchStub,
  'es6-promisify': promisify
});

const fakeXServer = 'http://xserver.example.com/aleph/X';
const MAX_ENTRIES = 99;

function fakeResponse(status, body) {
  return {
    status,
    text: sinon.stub().resolves(body)
  };
}

function findResponseXML(setNumber, noEntries, sessionId) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<find>
  <set_number>${setNumber}</set_number>
  <no_records>${noEntries}</no_records>
  <no_entries>${noEntries}</no_entries>
  <session-id>${sessionId}</session-id>
</find>`;
}

function presentResponseXML(docNumbers, sessionId) {
  const records = docNumbers.map(docNumber => `    <record><doc_number>${docNumber}</doc_number></record>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<present>
${records}
  <session-id>${sessionId}</session-id>
</present>`;
}

function paddedIds(count, startFrom = 1) {
  return _.times(count, i => String(i + startFrom).padStart(9, '0'));
}

describe('aleph-find-service', () => {

  let findService;

  beforeEach(() => {
    fetchStub.reset();
    findService = create(fakeXServer);
  });

  describe('queryIndex', () => {

    it('should query the find endpoint with op, request and base parameters and return record ids', async () => {
      fetchStub
        .onFirstCall().resolves(fakeResponse(200, findResponseXML(42, 2, 'sid-find')))
        .onSecondCall().resolves(fakeResponse(200, presentResponseXML(paddedIds(2), 'sid-present')));

      const result = await findService.queryIndex('fin01', 'ANAID', '000090001');

      // NOTE: querystring.stringify encodes the '=' inside the request value as %3D
      expect(fetchStub.firstCall.args[0]).to.equal(
        `${fakeXServer}?op=find&request=ANAID%3D000090001&base=fin01`
      );
      expect(fetchStub.secondCall.args[0]).to.equal(
        `${fakeXServer}?op=present&set_number=42&set_entry=1-100`
      );
      expect(result.recordIds).to.deep.equal(paddedIds(2));
      expect(result.sessionId).to.equal('sid-present');
    });

    it('should throw on non-200 response from find', async () => {
      fetchStub.resolves(fakeResponse(404, ''));
      let error;
      try {
        await findService.queryIndex('fin01', 'ANAID', '000090001');
      } catch (e) {
        error = e;
      }
      expect(error).to.be.instanceOf(Error);
      expect(error.message).to.equal('404');
    });

    it('should throw on non-200 response from present', async () => {
      fetchStub
        .onFirstCall().resolves(fakeResponse(200, findResponseXML(42, 2, 'sid-find')))
        .onSecondCall().resolves(fakeResponse(500, ''));
      let error;
      try {
        await findService.queryIndex('fin01', 'ANAID', '000090001');
      } catch (e) {
        error = e;
      }
      expect(error).to.be.instanceOf(Error);
      expect(error.message).to.equal('500');
    });

    it('should return empty record ids when no records are found', async () => {
      fetchStub
        .onFirstCall().resolves(fakeResponse(200, findResponseXML(7, 0, 'sid-find')))
        .onSecondCall().resolves(fakeResponse(200, presentResponseXML([], 'sid-present')));

      const result = await findService.queryIndex('fin01', 'ANAID', '000090001');

      expect(result.recordIds).to.deep.equal([]);
      expect(result.sessionId).to.equal('sid-present');
    });
  });

  describe('fetchItems pagination', () => {

    async function queryWithEntries(noEntries, pageSizes) {
      // pageSizes: how many records each present page actually returns
      const calls = [fakeResponse(200, findResponseXML(42, noEntries, 'sid-find'))];
      let offset = 1;
      pageSizes.forEach((size, i) => {
        calls.push(fakeResponse(200, presentResponseXML(paddedIds(size, offset), `sid-page-${i + 1}`)));
        offset += size;
      });
      calls.forEach((response, i) => fetchStub.onCall(i).resolves(response));
      return findService.queryIndex('fin01', 'ANAID', '000090001');
    }

    it('should fetch a single page when entries are below MAX_ENTRIES', async () => {
      const noEntries = 50;
      const result = await queryWithEntries(noEntries, [noEntries]);
      expect(fetchStub.callCount).to.equal(2);
      expect(fetchStub.secondCall.args[0]).to.include('set_entry=1-100');
      expect(result.recordIds).to.have.length(noEntries);
      expect(result.sessionId).to.equal('sid-page-1');
    });

    it('should fetch a trailing empty page when end (1 + MAX_ENTRIES) equals noEntries', async () => {
      // end (offset + MAX_ENTRIES) <= noEntries triggers one more present call
      const noEntries = MAX_ENTRIES + 1;
      const result = await queryWithEntries(noEntries, [noEntries, 0]);
      expect(fetchStub.callCount).to.equal(3);
      expect(fetchStub.thirdCall.args[0]).to.include('set_entry=101-200');
      expect(result.recordIds).to.have.length(noEntries);
      expect(result.sessionId).to.equal('sid-page-2');
    });

    it('should fetch a second page when entries equal MAX_ENTRIES + 1', async () => {
      const noEntries = MAX_ENTRIES + 1;
      const result = await queryWithEntries(noEntries, [MAX_ENTRIES, 1]);
      expect(fetchStub.callCount).to.equal(3);
      expect(fetchStub.secondCall.args[0]).to.include('set_entry=1-100');
      expect(fetchStub.thirdCall.args[0]).to.include('set_entry=101-200');
      expect(result.recordIds).to.have.length(noEntries);
      expect(result.sessionId).to.equal('sid-page-2');
    });

    it('should paginate multiple pages and return the last session id', async () => {
      const noEntries = 250;
      const result = await queryWithEntries(noEntries, [100, 100, 50]);
      expect(fetchStub.callCount).to.equal(4);
      expect(fetchStub.secondCall.args[0]).to.include('set_entry=1-100');
      expect(fetchStub.thirdCall.args[0]).to.include('set_entry=101-200');
      expect(fetchStub.lastCall.args[0]).to.include('set_entry=201-300');
      expect(result.recordIds).to.have.length(noEntries);
      expect(result.sessionId).to.equal('sid-page-3');
    });
  });

  describe('findRecordsLinkedToAgentRecord', () => {

    it('should pad the authority record id and query the ANAID index', async () => {
      fetchStub
        .onFirstCall().resolves(fakeResponse(200, findResponseXML(1, 1, 'sid')))
        .onSecondCall().resolves(fakeResponse(200, presentResponseXML(['000012345'], 'sid-present')));

      const recordIds = await findService.findRecordsLinkedToAgentRecord('fin11', '12345');

      expect(fetchStub.firstCall.args[0]).to.equal(
        `${fakeXServer}?op=find&request=ANAID%3D000012345&base=fin11`
      );
      expect(recordIds).to.deep.equal(['000012345']);
    });
  });

  describe('findRecordsLinkedToSubjectRecord', () => {

    it('should pad the authority record id and query the ASAID index', async () => {
      fetchStub
        .onFirstCall().resolves(fakeResponse(200, findResponseXML(1, 1, 'sid')))
        .onSecondCall().resolves(fakeResponse(200, presentResponseXML(['000054321'], 'sid-present')));

      const recordIds = await findService.findRecordsLinkedToSubjectRecord('fin01', '54321');

      expect(fetchStub.firstCall.args[0]).to.equal(
        `${fakeXServer}?op=find&request=ASAID%3D000054321&base=fin01`
      );
      expect(recordIds).to.deep.equal(['000054321']);
    });
  });

  describe('findBibRecordsLinkedToAgentRecord', () => {

    it('should query the ANAID index in fin01 by default', async () => {
      fetchStub
        .onFirstCall().resolves(fakeResponse(200, findResponseXML(1, 0, 'sid')))
        .onSecondCall().resolves(fakeResponse(200, presentResponseXML([], 'sid-present')));

      await findService.findBibRecordsLinkedToAgentRecord('12345');

      expect(fetchStub.firstCall.args[0]).to.equal(
        `${fakeXServer}?op=find&request=ANAID%3D000012345&base=fin01`
      );
    });
  });

  describe('findBibRecordsLinkedToSubjectRecord', () => {

    it('should query the ASAID index in fin01 by default', async () => {
      fetchStub
        .onFirstCall().resolves(fakeResponse(200, findResponseXML(1, 0, 'sid')))
        .onSecondCall().resolves(fakeResponse(200, presentResponseXML([], 'sid-present')));

      await findService.findBibRecordsLinkedToSubjectRecord('12345');

      expect(fetchStub.firstCall.args[0]).to.equal(
        `${fakeXServer}?op=find&request=ASAID%3D000012345&base=fin01`
      );
    });
  });
});
