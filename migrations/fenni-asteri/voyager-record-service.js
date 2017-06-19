const marc_record_converters = require('marc-record-converters');

async function readAuthorityRecord(connection, recordId) {
  return readRecord(connection, 'AUTH_DATA', 'AUTH_ID', recordId);
}

async function readBibRecord(connection, recordId) {
  return readRecord(connection, 'BIB_DATA', 'BIB_ID', recordId);
}

async function readRecord(connection, database, key, recordId) {

  const readQuery = `select utl_raw.CAST_TO_RAW(RECORD_SEGMENT) as SEG from fennicadb.${database} where ${key}=:id order by SEQNUM`;
  const recordSegments = await connection.execute(readQuery, [recordId]);
  const buffers = recordSegments.rows.map(row => row.SEG);
  const recordData = Buffer.concat(buffers).toString('utf-8');

  const record = marc_record_converters.iso2709.from(recordData);

  return record;
}

module.exports = {
  readAuthorityRecord,
  readBibRecord
};