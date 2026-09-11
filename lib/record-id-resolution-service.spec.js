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
const { MarcRecord } = require('@natlibfi/marc-record');
const RecordSerializers = require('@natlibfi/marc-record-serializers');

const fetchStub = sinon.stub();

// es6-promisify is ESM-only, so require() does not yield the function
// directly; provide a working promisify for the callback-based parseString.
function promisify(fn) {
  return (arg) => new Promise((resolve, reject) => {
    fn(arg, (err, result) => (err ? reject(err) : resolve(result)));
  });
}

const { create, ParseError } = proxyquire('./record-id-resolution-service', {
  'isomorphic-fetch': fetchStub,
  'es6-promisify': promisify
});

const fakeXServer = 'http://xserver.example.com/aleph/X';
const fakeAlephUrl = 'http://aleph.example.com';
const fakeBase = 'fin01';

function fakeResponse(status, body) {
  return {
    status,
    text: sinon.stub().resolves(body)
  };
}

function findResponseXML(setNumber, noEntries) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<find>
  <set_number>${setNumber}</set_number>
  <no_entries>${noEntries}</no_entries>
</find>`;
}

function findErrorResponseXML(error) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<find>
  <error>${error}</error>
</find>`;
}

function presentResponseXML(docNumbers) {
  const records = docNumbers.map(docNumber => `    <record><doc_number>${docNumber}</doc_number></record>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<present>
${records}
</present>`;
}

function createFakeRecord() {
  return MarcRecord.fromString('LDR    00533cz  a2200193n  4500\n001    115575\n100    ‡aAakkula, Immo');
}

// Builds OAI_MARCXML for a record; when deleted, flips leader status (position 5) to 'd'
function recordXML(deleted = false) {
  const xml = RecordSerializers.OAI_MARCXML.to(createFakeRecord());
  if (!deleted) {
    return xml;
  }
  return xml.replace(/<fixfield id="LDR">(.{5})./, (match, first5) => `<fixfield id="LDR">${first5}d`);
}

describe('record-id-resolution-service', () => {

  let resolveMelindaId;

  beforeEach(() => {
    fetchStub.reset();
    resolveMelindaId = create(fakeXServer, fakeAlephUrl, fakeBase);
  });

  it('should throw when libraryTag is undefined', async () => {
    let error;
    try {
      await resolveMelindaId('999999999', '123456', undefined, []);
    } catch (e) {
      error = e;
    }
    expect(error).to.be.instanceOf(Error);
    expect(error.message).to.equal('Library tag cannot be undefined');
    expect(fetchStub.callCount).to.equal(0);
  });

  it('should resolve a single record from the SIDA index', async () => {
    fetchStub
      .onCall(0).resolves(fakeResponse(200, findResponseXML(1, 1)))
      .onCall(1).resolves(fakeResponse(200, presentResponseXML(['111111111'])));

    const resolvedId = await resolveMelindaId(null, '123456', 'FIN01', []);

    expect(resolvedId).to.equal('111111111');
    expect(fetchStub.callCount).to.equal(2);
    expect(fetchStub.firstCall.args[0]).to.equal(
      `${fakeAlephUrl}/X?op=find&request=${encodeURIComponent('sida=123456fin01')}&base=${fakeBase}`
    );
    expect(fetchStub.secondCall.args[0]).to.equal(
      `${fakeAlephUrl}/X?op=present&set_number=1&set_entry=1-1`
    );
  });

  it('should include link ids in the SIDA query', async () => {
    fetchStub
      .onCall(0).resolves(fakeResponse(200, findErrorResponseXML('empty set')))
      .onCall(1).resolves(fakeResponse(200, findResponseXML(1, 1)))
      .onCall(2).resolves(fakeResponse(200, recordXML(false)))
      .onCall(3).resolves(fakeResponse(200, presentResponseXML(['777777777'])));

    const resolvedId = await resolveMelindaId(null, '123456', 'FIN01', ['777777777']);

    expect(resolvedId).to.equal('777777777');
    const sidaQuery = 'sida=123456fin01 OR sida=FCC777777777fin01';
    expect(fetchStub.firstCall.args[0]).to.equal(
      `${fakeAlephUrl}/X?op=find&request=${encodeURIComponent(sidaQuery)}&base=${fakeBase}`
    );
  });

  it('should skip MIDDR and XServer queries when there is no melinda id and no links', async () => {
    fetchStub
      .onCall(0).resolves(fakeResponse(200, findResponseXML(1, 1)))
      .onCall(1).resolves(fakeResponse(200, presentResponseXML(['111111111'])));

    const resolvedId = await resolveMelindaId(null, '123456', 'FIN01', []);

    expect(resolvedId).to.equal('111111111');
    expect(fetchStub.callCount).to.equal(2);
  });

  it('should deduplicate record ids resolved from multiple indexes', async () => {
    fetchStub
      .onCall(0).resolves(fakeResponse(200, findErrorResponseXML('empty set')))
      .onCall(1).resolves(fakeResponse(200, findResponseXML(2, 1)))
      .onCall(2).resolves(fakeResponse(200, recordXML(false)))
      .onCall(3).resolves(fakeResponse(200, presentResponseXML(['999999999'])));

    const resolvedId = await resolveMelindaId('999999999', '123456', 'FIN01', []);

    expect(resolvedId).to.equal('999999999');
    expect(fetchStub.firstCall.args[0]).to.contain(encodeURIComponent('sida=123456fin01'));
    expect(fetchStub.getCall(1).args[0]).to.contain(encodeURIComponent('MIDRR=999999999'));
    expect(fetchStub.getCall(2).args[0]).to.equal(`${fakeXServer}?op=find-doc&doc_num=999999999&base=${fakeBase}`);
  });

  it('should throw when the melinda id resolves into multiple records', async () => {
    fetchStub
      .onCall(0).resolves(fakeResponse(200, findErrorResponseXML('empty set')))
      .onCall(1).resolves(fakeResponse(200, findResponseXML(2, 2)))
      .onCall(2).resolves(fakeResponse(200, recordXML(false)))
      .onCall(3).resolves(fakeResponse(200, recordXML(false)))
      .onCall(4).resolves(fakeResponse(200, presentResponseXML(['999999999', '888888888'])));

    let error;
    try {
      await resolveMelindaId('999999999', '123456', 'FIN01', ['888888888']);
    } catch (e) {
      error = e;
    }
    expect(error).to.be.instanceOf(Error);
    expect(error.message).to.contain('Resolved into multiple records');
  });

  it('should throw when no records are resolved', async () => {
    fetchStub
      .onCall(0).resolves(fakeResponse(200, findErrorResponseXML('empty set')));

    let error;
    try {
      await resolveMelindaId(null, '123456', 'FIN01', []);
    } catch (e) {
      error = e;
    }
    expect(error).to.be.instanceOf(Error);
    expect(error.message).to.equal('Resolved into 0 records. (FIN01)123456');
  });

  it('should filter out records that are deleted in the base', async () => {
    fetchStub
      .onCall(0).resolves(fakeResponse(200, findResponseXML(1, 1)))
      .onCall(1).resolves(fakeResponse(200, findResponseXML(1, 1)))
      .onCall(2).resolves(fakeResponse(200, recordXML(true)))
      .onCall(3).resolves(fakeResponse(200, presentResponseXML(['111111111'])))
      .onCall(4).resolves(fakeResponse(200, presentResponseXML(['111111111'])));

    // melinda id is deleted in the base, so the XServer query must not return it;
    // the SIDA and MIDDR indexes agree on 111111111, so resolution succeeds
    const resolvedId = await resolveMelindaId('111111111', '123456', 'FIN01', []);

    expect(resolvedId).to.equal('111111111');
  });

  it('should throw a ParseError when the aleph xml response cannot be parsed', async () => {
    fetchStub.onCall(0).rejects(new Error('Unexpected close tag: xyz'));

    let error;
    try {
      await resolveMelindaId(null, '123456', 'FIN01', []);
    } catch (e) {
      error = e;
    }
    expect(error).to.be.instanceOf(ParseError);
    expect(error.message).to.equal('Could not parse aleph xml response');
  });

  it('should append library tag context to other fetch errors', async () => {
    fetchStub.onCall(0).rejects(new Error('ECONNREFUSED'));

    let error;
    try {
      await resolveMelindaId(null, '123456', 'FIN01', []);
    } catch (e) {
      error = e;
    }
    expect(error).to.be.instanceOf(Error);
    expect(error.message).to.equal('ECONNREFUSED (FIN01)123456');
  });

  it('should throw when the find response contains an error other than empty set', async () => {
    fetchStub.onCall(0).resolves(fakeResponse(200, findErrorResponseXML('bad request')));

    let error;
    try {
      await resolveMelindaId(null, '123456', 'FIN01', []);
    } catch (e) {
      error = e;
    }
    expect(error).to.be.instanceOf(Error);
    expect(error.message).to.equal('bad request (FIN01)123456');
  });

  it('should throw when the find response does not contain a find element', async () => {
    fetchStub.onCall(0).resolves(fakeResponse(200, '<bogus/>'));

    let error;
    try {
      await resolveMelindaId(null, '123456', 'FIN01', []);
    } catch (e) {
      error = e;
    }
    expect(error).to.be.instanceOf(Error);
    expect(error.message).to.equal('setResponse.find was not valid. (FIN01)123456');
  });
});
