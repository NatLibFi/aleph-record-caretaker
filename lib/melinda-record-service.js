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

const AlephRecordService = require('./aleph-record-service');
const MelindaClient = require('@natlibfi/melinda-api-client');
const debug = require('debug')('@natlibfi/aleph-record-caretaker:melinda-record-service');

function createMelindaRecordService(melindaEndpoint, XServer, credentials) {

  // We're using melinda-legacy api for bib records
  const client = new MelindaClient({
    endpoint: melindaEndpoint,
    user: credentials.username,
    password: credentials.password
  });

  // We're using X-server for authority records
  const alephRecordServiceX = AlephRecordService.createAlephRecordService(XServer, credentials);

  function loadRecord(base, recordId) {
    debug(`Loading record ${base} / ${recordId} from X-server: ${XServer}`);
    return alephRecordServiceX.loadRecord(base, recordId);
  }

  function createRecord(base, record) {
    debug(`Creating record ${base}`);
    if (base.toLowerCase() === 'fin01') {
      debug(`Creating record to ${base} through ${melindaEndpoint}`);
      return new Promise((resolve, reject) => client.createRecord(record).then(resolve).catch(reject).done());
    }
    debug(`Creating record to ${base} through X-server ${XServer}`);
    return saveRecord(base, '000000000', record);
  }

  function saveRecord(base, recordId, record) {
    debug(`Saving record ${base} / ${recordId}`);
    if (base.toLowerCase() === 'fin01') {
      debug(`Saving record ${base} / ${recordId} through ${melindaEndpoint}`);
      return new Promise((resolve, reject) => client.updateRecord(record).then(resolve).catch(reject).done());
    }
    debug(`Saving record ${base} / ${recordId} through X-server ${XServer}`);
    return alephRecordServiceX.saveRecord(base, recordId, record);
  }

  return {
    loadRecord,
    saveRecord,
    createRecord
  };
}

module.exports = {
  createMelindaRecordService,
  AlephRecordError: AlephRecordService.AlephRecordError
};
