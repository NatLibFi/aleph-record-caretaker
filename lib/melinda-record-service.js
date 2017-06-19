const AlephRecordService = require('./aleph-record-service');
const MelindaClient = require('melinda-api-client');


function createMelindaRecordService(melindaEndpoint, XServer, credentials) {

  const client = new MelindaClient({
    endpoint: melindaEndpoint,
    user: credentials.username,
    password: credentials.password
  });
  
  const alephRecordServiceX = AlephRecordService.createAlephRecordService(XServer, credentials);

  function loadRecord(base, recordId) {
    return alephRecordServiceX.loadRecord(base, recordId);
  }

  function createRecord(base, record) {
    if (base.toLowerCase() === 'fin01') {
      return new Promise((resolve, reject) => client.createRecord(record).then(resolve).catch(reject).done());
    }
    return saveRecord(base, '000000000', record);
  }

  function saveRecord(base, recordId, record) {
    if (base.toLowerCase() === 'fin01') {
      return new Promise((resolve, reject) => client.updateRecord(record).then(resolve).catch(reject).done());
    }
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
