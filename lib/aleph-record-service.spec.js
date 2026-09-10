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

const { createAlephRecordService, AlephRecordError } = proxyquire('./aleph-record-service', {
  'node-fetch': fetchStub,
  'es6-promisify': promisify
});

const fakeXServer = 'http://xserver.example.com/aleph/X';
const fakeCredentials = { username: 'caretaker', password: 'passw0rd' };

function fakeResponse(status, body) {
  return {
    status,
    text: sinon.stub().resolves(body)
  };
}

// NOTE: xml2js returns a string for a single element and an array for
// multiple elements with the same tag; parseUpdateResponse assumes an array,
// so these fixtures must contain at least two <error> elements or none.
function updateResponseXML(errors, sessionId) {
  const errorBlock = errors.map(e => `<error>${e}</error>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<update-doc>
  ${errorBlock}
  <session-id>${sessionId || ''}</session-id>
</update-doc>`;
}

function loginResponseXML(loginErrors) {
  const errorBlock = loginErrors.map(e => `<error>${e}</error>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<login>
  ${errorBlock}
</login>`;
}

function createFakeRecord() {
  return MarcRecord.fromString('LDR    00533cz  a2200193n  4500\n001    115575\n100    ‡aAakkula, Immo');
}

describe('aleph-record-service', () => {

  let recordService;

  beforeEach(() => {
    fetchStub.reset();
    recordService = createAlephRecordService(fakeXServer, fakeCredentials);
  });

  describe('loadRecord', () => {
    it('should fetch the record from X-server with find-doc parameters', async () => {
      const record = createFakeRecord();
      const recordXML = RecordSerializers.OAI_MARCXML.to(record, {omitDeclaration: true});
      fetchStub.resolves(fakeResponse(200, recordXML));

      await recordService.loadRecord('FIN01', '00001');

      expect(fetchStub.calledOnce).to.be.true;
      const url = fetchStub.firstCall.args[0];
      expect(url).to.contain(`${fakeXServer}?op=find-doc`);
      expect(url).to.contain('doc_num=00001');
      expect(url).to.contain('base=FIN01');
      expect(url).to.contain('show_sub6=Y');
    });

    it('should parse the OAI_MARCXML response into a MarcRecord', async () => {
      const record = createFakeRecord();
      const recordXML = RecordSerializers.OAI_MARCXML.to(record, {omitDeclaration: true});
      fetchStub.resolves(fakeResponse(200, recordXML));

      const parsedRecord = await recordService.loadRecord('FIN01', '00001');

      expect(parsedRecord).to.be.an.instanceOf(MarcRecord);
      expect(parsedRecord.getFields('001')[0].value).to.equal('115575');
      expect(parsedRecord.getFields('100')[0].subfields[0].value).to.equal('Aakkula, Immo');
    });
  });

  describe('saveRecord', () => {
    it('should throw synchronously when no credentials are given', () => {
      const serviceWithoutCredentials = createAlephRecordService(fakeXServer, undefined);
      const record = createFakeRecord();

      expect(() => serviceWithoutCredentials.saveRecord('FIN01', '00001', record)).to.throw('Credentials are required for saving records');
    });

    it('should post the serialized record to X-server with credentials and return the parsed result', async () => {
      const record = createFakeRecord();
      fetchStub.resolves(fakeResponse(200, updateResponseXML(
        ['[1] Document: 00001 was updated successfully.', '[2] ok'],
        'SESSION-1'
      )));

      const result = await recordService.saveRecord('FIN01', '00001', record);

      // NOTE: xml2js returns arrays for elements with text content
      expect(result).to.eql({
        recordId: '00001',
        messages: [{ code: '2', message: 'ok', type: undefined }],
        sessionId: ['SESSION-1']
      });

      expect(fetchStub.calledOnce).to.be.true;
      const [url, options] = fetchStub.firstCall.args;
      expect(url).to.equal(fakeXServer);
      expect(options.method).to.equal('POST');
      expect(options.body).to.contain('user_name=caretaker');
      expect(options.body).to.contain('user_password=passw0rd');
      expect(options.body).to.contain('op=update_doc');
      expect(options.body).to.contain('doc_num=00001');
      expect(options.body).to.contain('library=FIN01');
      expect(options.body).to.contain('doc_action=UPDATE');
      expect(options.body).to.contain('xml_full_req=');
      // the body is querystring-encoded, so the serialized XML is percent-encoded
      expect(options.body).to.contain(encodeURIComponent('<oai_marc>'));
    });

    it('should throw AlephRecordError when the response status is not 200', async () => {
      const record = createFakeRecord();
      fetchStub.resolves(fakeResponse(500, ''));

      let error;
      try {
        await recordService.saveRecord('FIN01', '00001', record);
      } catch (e) {
        error = e;
      }

      expect(error).to.be.an.instanceOf(AlephRecordError);
      expect(error.message).to.contain('Updated failed. RecordId: 00001. Statuscode: 500');
    });
  });

  describe('createRecord', () => {
    it('should save the record with recordId 000000000', async () => {
      const record = createFakeRecord();
      fetchStub.resolves(fakeResponse(200, updateResponseXML(
        ['[1] Document: 000012345 was updated successfully.', '[2] ok']
      )));

      await recordService.createRecord('FIN01', record);

      const [url, options] = fetchStub.firstCall.args;
      expect(url).to.equal(fakeXServer);
      expect(options.body).to.contain('doc_num=000000000');
    });
  });

  describe('parseUpdateResponse', () => {
    async function saveWithXML(responseXML) {
      const record = createFakeRecord();
      fetchStub.resolves(fakeResponse(200, responseXML));
      return recordService.saveRecord('FIN01', '00001', record);
    }

    it('should return recordId, remaining messages and session id on success', async () => {
      const result = await saveWithXML(updateResponseXML([
        '[1] Document: 00001 was updated successfully.',
        '[100] Some warning - warning error'
      ], 'SESSION-42'));

      // NOTE: xml2js returns an array for the session-id element and the
      // parse regex keeps the space before the "- <type> error" suffix
      expect(result).to.eql({
        recordId: '00001',
        messages: [{ code: '100', message: 'Some warning ', type: 'WARNING' }],
        sessionId: ['SESSION-42']
      });
    });

    it('should throw an AlephRecordError with the login error message on login failure', async () => {
      let error;
      try {
        await saveWithXML(loginResponseXML(['Login failed: invalid user', 'second error']));
      } catch (e) {
        error = e;
      }

      expect(error).to.be.an.instanceOf(AlephRecordError);
      expect(error.message).to.equal('Login failed: invalid user');
    });

    it('should throw an AlephRecordError with the code when a mandatory error is present', async () => {
      let error;
      try {
        await saveWithXML(updateResponseXML([
          '[50] Mandatory field missing - mandatory error',
          '[51] Another mandatory - mandatory error'
        ]));
      } catch (e) {
        error = e;
      }

      expect(error).to.be.an.instanceOf(AlephRecordError);
      expect(error.message).to.equal('Mandatory field missing ');
      expect(error.code).to.equal('50');
    });

    it('should throw an AlephRecordError when the first non-mandatory error has a message', async () => {
      let error;
      try {
        await saveWithXML(updateResponseXML([
          '[70] Something went wrong - trigger error',
          '[71] Another trigger - trigger error'
        ]));
      } catch (e) {
        error = e;
      }

      expect(error).to.be.an.instanceOf(AlephRecordError);
      expect(error.message).to.contain('Something went wrong  RecordId: 00001 Response was:');
      expect(error.code).to.equal('70');
    });

    it('should throw an AlephRecordError for an error with an empty message', async () => {
      let error;
      try {
        await saveWithXML(updateResponseXML([
          '[70] - trigger error',
          '[71] Another trigger - trigger error'
        ]));
      } catch (e) {
        error = e;
      }

      expect(error).to.be.an.instanceOf(AlephRecordError);
      expect(error.message).to.contain('Update failed due to unkown reason. RecordId: 00001 Response was:');
    });

    it('should throw an AlephRecordError when there are no messages at all', async () => {
      let error;
      try {
        await saveWithXML(updateResponseXML([]));
      } catch (e) {
        error = e;
      }

      expect(error).to.be.an.instanceOf(AlephRecordError);
      expect(error.message).to.contain('Update failed due to unkown reason. RecordId: 00001 Response was:');
    });
  });

  describe('parseMessage', () => {
    async function saveWithMessages(messages) {
      const record = createFakeRecord();
      fetchStub.resolves(fakeResponse(200, updateResponseXML([
        '[1] Document: 00001 was updated successfully.',
        ...messages
      ])));
      return recordService.saveRecord('FIN01', '00001', record);
    }

    it('should parse a message without a type suffix', async () => {
      const result = await saveWithMessages(['[10] Plain message']);

      expect(result.messages).to.eql([{ code: '10', message: 'Plain message', type: undefined }]);
    });

    it('should parse warning, trigger and mandatory message types', async () => {
      const result = await saveWithMessages([
        '[10] Warning message - warning error',
        '[20] Trigger message - trigger error',
        '[30] Mandatory message - mandatory error'
      ]);

      // NOTE: the parse regex keeps the space before the "- <type> error" suffix
      expect(result.messages).to.eql([
        { code: '10', message: 'Warning message ', type: 'WARNING' },
        { code: '20', message: 'Trigger message ', type: 'TRIGGER' },
        { code: '30', message: 'Mandatory message ', type: 'MANDATORY' }
      ]);
    });

    it('should throw when a message does not match the expected format', async () => {
      let error;
      try {
        await saveWithMessages(['not a matching message', 'another not matching']);
      } catch (e) {
        error = e;
      }

      expect(error).to.be.an.instanceOf(Error);
      expect(error).to.not.be.an.instanceOf(AlephRecordError);
      expect(error.message).to.equal('Unable to parse message: not a matching message');
    });
  });
});
