
const AlephFindService = require('./aleph-find-service');
const AlephRecordService = require('../sync-tool/aleph-record-service');


run();

async function run() {

  const credentials = {
    username: process.env.ALEPH_TEST_USER,
    password: process.env.ALEPH_TEST_PASS
  };
  const X_SERVER = 'http://libtest.csc.fi:8992/X';
  const alephFindService = AlephFindService.create(X_SERVER);
  const alephRecordService = AlephRecordService.createAlephRecordService(X_SERVER, credentials);

  const bibIds1 = await alephFindService.findLinkedBibRecords('7');
  
  const recordId = bibIds1[0];
  const record = await alephRecordService.loadRecord('fin01', recordId);

  record.fields.filter(field => field.tag === '100').forEach(field => {
    console.log(field);
  });
  console.log(record.toString());

  try {
    
    const saveResponse = await alephRecordService.saveRecord('fin01', recordId, record);

    console.log(saveResponse.recordId);

  } catch(error) {
    if (error instanceof AlephRecordService.AlephRecordError) {
      console.log(error);
    } else {
      throw error;
    }
    
  }
}
