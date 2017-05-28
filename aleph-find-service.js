const _ = require('lodash');
const promisify = require('es6-promisify');
const fetch = require('isomorphic-fetch');
const parseString = require('xml2js').parseString;
const parseXML = promisify(parseString);

function create(X_SERVER) {
    
  async function findLinkedBibRecords(authorityRecordId) {
    const normalizedRecordId = _.padStart(authorityRecordId, 9, '0');
    const result = await queryIndex('fin01', 'ANAID', normalizedRecordId);
    return result.map(res => res.recordId);
  }

  async function queryIndex(base, index, query) {

    const requestUrl = `${X_SERVER}?op=find&request=${index}%3D${query}&base=${base}`;
    const response = await fetch(requestUrl);
    if (response.status !== 200) {
      throw new Error(response.status);
    }
    
    const resultSet = await parseResultSet(response);
    const items = await fetchItems(resultSet);
    return items;
  }

  async function parseResultSet(response) {

    const body = await response.text();

    const jsonBody = await parseXML(body);

    const setNumber = _.get(jsonBody, 'find.set_number[0]');
    const noRecords = _.get(jsonBody, 'find.no_records[0]');
    const noEntries = _.get(jsonBody, 'find.no_entries[0]');
    const sessionId = _.get(jsonBody, 'find.session-id[0]');

    return {setNumber, noRecords, noEntries, sessionId};
  }

  async function fetchItems(resultSet) {

    const requestUrl = `${X_SERVER}?op=present&set_number=${resultSet.setNumber}&set_entry=1-${resultSet.noEntries}`;
    const response = await fetch(requestUrl);
    if (response.status !== 200) {
      throw new Error(response.status);
    }
    
    const body = await response.text();

    const jsonBody = await parseXML(body);

    //TODO handles only first record.
    const record = _.get(jsonBody, 'present.record[0]');
    const sessionId = _.get(jsonBody, 'present.session-id[0]');
    const recordId = record.doc_number[0];

    return [{recordId, sessionId}];
  }

  return {
    findLinkedBibRecords,
    queryIndex
  };

}

module.exports = {
  create
};
