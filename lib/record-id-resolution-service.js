const _ = require('lodash');
const xml2js = require('xml2js');
const promisify = require('es6-promisify');
const fetch = require('isomorphic-fetch');
const RecordSerializers = require('marc-record-serializers');
const debug = require('debug')('record-id-resolution-service');

const parseXMLStringToJSON = promisify(xml2js.parseString);

const ALEPH_ERROR_EMPTY_SET = 'empty set';

class ParseError extends Error {
  constructor ( message ) {
    super();
    Error.captureStackTrace( this, this.constructor );
    this.name = 'ParseError';
    this.message = message;
  }
}

function create(XServer, alephUrl, base) {

  function resolveMelindaId(melindaId, localId, libraryTag, links) {
    if (libraryTag === undefined) {
      throw new Error('Library tag cannot be undefined');
    }

    debug('Resolving melinda id', {melindaId, localId, libraryTag, links});

    return Promise.all([
      querySIDAindex(localId, libraryTag, links),
      queryMIDDRindex(melindaId, links),
      queryXServer(melindaId, links)
    ])
    .then(([sidaRecordIdList, middrRecordIdList, XServerRecordIdList]) => {
      const combinedResolvedIdList = _.uniq(_.concat(sidaRecordIdList, middrRecordIdList, XServerRecordIdList));
      return combinedResolvedIdList;
    })
    .then(validateResult)
    .then(recordIdList => {
      return _.head(recordIdList);
    }).catch(error => {
      
      if (error && _.startsWith(error.message, 'Unexpected close tag')) {
        throw new ParseError('Could not parse aleph xml response');
      }

      error.message = `${error.message} (${libraryTag})${localId}`;
      throw error;
    });
  }

  function querySIDAindex(localId, libraryTag, links) {
    const normalizedLibraryTag = libraryTag.toLowerCase();

    const linksPart = links.map(link => `sida=FCC${_.padStart(link, 9, '0')}${normalizedLibraryTag}`);

    const query = [`sida=${localId}${normalizedLibraryTag}`].concat(linksPart).join(' OR ');
    const requestUrl = `${alephUrl}/X?op=find&request=${encodeURIComponent(query)}&base=${base}`;
    debug(requestUrl);
    return fetch(requestUrl)
      .then(response => response.text())
      .then(parseXMLStringToJSON)
      .then(loadRecordIdList);
  }

  function queryMIDDRindex(melindaId, links) {

    const melindaIdOption = melindaId ? [melindaId] : [];

    const queryIdList = _.concat(melindaIdOption, links);
    if (queryIdList.length === 0) {
      return Promise.resolve([]);
    }

    const query = queryIdList.map(recordId => `MIDRR=${_.padStart(recordId, 9, '0')}`).join(' OR ');
    
    const requestUrl = `${alephUrl}/X?op=find&request=${encodeURIComponent(query)}&base=${base}`;
    debug(requestUrl);
    return fetch(requestUrl)
      .then(response => response.text())
      .then(parseXMLStringToJSON)
      .then(_.partial(loadRecordIdList, _, melindaIdOption));
  }

  function queryXServer(melindaId, links) {
    const melindaIdOption = melindaId ? [melindaId] : [];

    const queryIdList = _.concat(melindaIdOption, links);
    if (queryIdList.length === 0) {
      return Promise.resolve([]);
    }

    const isValidRecordInBase = _.partial(isRecordValid, base);

    return Promise.all(queryIdList.map(isValidRecordInBase)).then((validationResults) => {
      return _.zipWith(queryIdList, validationResults, (id, isValid) => ({id, isValid}))
        .filter(item => item.isValid)
        .map(item => item.id);

    });
  }

  /*
  base:
    fin01: bib
    fin11: name authorities
  */
  function isRecordValid(base, melindaId) {
    return loadRecord(base, melindaId).then(record => {
      return !record.isDeleted();
    });
  }

  function loadRecord(base, melindaId) {
    
    const requestUrl = `${XServer}?op=find-doc&doc_num=${melindaId}&base=${base}`;
    debug(requestUrl);

    return fetch(requestUrl)
      .then(response => response.text())
      .then(parseXMLRecordResponse);
  }

  function parseXMLRecordResponse(XServerXMLResponse) {
    return RecordSerializers.OAI_MARCXML.fromOAI_MARCXML(XServerXMLResponse);
  }


  function loadRecordIdList(setResponse, defaultValue = []) {

    const error = _.head(_.get(setResponse, 'find.error'));
    if (error !== undefined) {
      if (_.head(setResponse.find.error) === ALEPH_ERROR_EMPTY_SET) {
        return defaultValue;
      } else {
        throw new Error(error);
      }  
    }

    if (_.get(setResponse, 'find') === undefined) {
      debug(`invalid setResponse ${setResponse}`);
      throw new Error('setResponse.find was not valid.');
    }    
    
    const { set_number, no_entries } = setResponse.find;
    const presentRequestUrl = `${alephUrl}/X?op=present&set_number=${set_number}&set_entry=1-${no_entries}`;
    debug(presentRequestUrl);
    return fetch(presentRequestUrl)
      .then(response => response.text())
      .then(parseXMLStringToJSON)
      .then(json => selectRecordIdList(json));
  }

  function validateResult(resolvedRecordIdList) {
    const numberOfRecords = resolvedRecordIdList.length;
    
    if (numberOfRecords > 1) {
      throw new Error(`Resolved into multiple records: ${resolvedRecordIdList.join(', ')}`);
    }
    if (numberOfRecords === 0) {
      throw new Error('Resolved into 0 records.');
    }
    return resolvedRecordIdList;
  }

  function selectRecordIdList(presentResponse) {
    return _.get(presentResponse, 'present.record', []).map(record => _.head(record.doc_number));
  }

  return resolveMelindaId;

}

module.exports = {
  create,
  ParseError
};
