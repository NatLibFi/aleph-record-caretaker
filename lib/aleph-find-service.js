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
 *
 */
const _ = require('lodash');
const promisify = require('es6-promisify');
const fetch = require('isomorphic-fetch');
const parseString = require('xml2js').parseString;
const parseXML = promisify(parseString);
const querystring = require('querystring');
const debug = require('debug')('aleph-find-service');

const MAX_ENTRIES = 100;

function create(X_SERVER) {
    
  async function findLinkedToAgentBibRecords(authorityRecordId) {
    return findLinkedAgentRecords('fin01', authorityRecordId);
  }
  
  async function findLinkedToSubjectBibRecords(authorityRecordId) {
    return findLinkedSubjectRecords('fin01', authorityRecordId);
  }

  async function findLinkedAgentRecords(base, authorityRecordId) {
    const normalizedRecordId = _.padStart(authorityRecordId, 9, '0');
    const result = await queryIndex(base, 'ANAID', normalizedRecordId);
    return result.recordIds;
  }

  async function findLinkedSubjectRecords(base, authorityRecordId) {
    const normalizedRecordId = _.padStart(authorityRecordId, 9, '0');
    const result = await queryIndex(base, 'ASAID', normalizedRecordId);
    return result.recordIds;
  }


  async function queryIndex(base, index, query) {

    const queryParameters = querystring.stringify({
      'op': 'find',
      'request': `${index}=${query}`,
      'base': base
    });
    
    const requestUrl = `${X_SERVER}?${queryParameters}`;
    debug(` Finding records from Aleph: ${requestUrl}`);

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

    async function fetchItemsIterate(resultSet, allRecordIds = [], offset=1) { 

      const end = offset + MAX_ENTRIES;
      const queryParameters = querystring.stringify({
        'op': 'present',
        'set_number': resultSet.setNumber,
        'set_entry': `${offset}-${end}`
      });

      const requestUrl = `${X_SERVER}?${queryParameters}`;
      debug(`Fetching recordIds from Aleph: ${requestUrl}`);

      const response = await fetch(requestUrl);
      if (response.status !== 200) {
        throw new Error(response.status);
      }
      
      const body = await response.text();

      const jsonBody = await parseXML(body);

      const records = _.get(jsonBody, 'present.record', []);
      const sessionId = _.get(jsonBody, 'present.session-id[0]');
      const recordIds = records.map(record => _.get(record, 'doc_number[0]'));

      allRecordIds.concat(recordIds);
      const foundIdsCount = allRecordIds.length;
      debug(` Currently found: ${foundIdsCount} records`);

      if (end <= resultSet.noEntries) { 
        return fetchItemsIterate(resultSet, allRecordIds, end + 1 )
      }
      else {
        // NOTE: This returns all recordIds but only last sessionId
        return { allRecordIds, sessionId  };  
      }

    }

    return { recordIds, sessionId };
  }

  return {
    findLinkedToAgentBibRecords,
    findLinkedToSubjectBibRecords,
    findLinkedAgentRecords,
    findLinkedSubjectRecords,
    queryIndex
  };

}

module.exports = {
  create
};
