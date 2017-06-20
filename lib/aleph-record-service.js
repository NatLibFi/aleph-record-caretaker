const _ = require('lodash');
const fetch = require('node-fetch');
const RecordSerializers = require('marc-record-serializers');
const querystring = require('querystring');
const debug = require('debug')('aleph-record-service');
const promisify = require('es6-promisify');
const parseString = require('xml2js').parseString;
const parseXML = promisify(parseString);

const ResponseMessageTypes = {
  'WARNING': 'WARNING',
  'TRIGGER': 'TRIGGER',
  'MANDATORY': 'MANDATORY'
};

class AlephRecordError extends Error {
  constructor ( message, code ) {
    super();
    Error.captureStackTrace( this, this.constructor );
    this.name = 'AlephRecordError';
    this.message = message;
    this.code = code;
  }
}

function createAlephRecordService(XServer, credentials) {

  function loadRecord(base, recordId) {
    
    const requestUrl = `${XServer}?op=find-doc&doc_num=${recordId}&base=${base}&show_sub6=Y`;

    return fetch(requestUrl)
      .then(response => response.text())
      .then(parseXMLRecordResponse);
  }

  function createRecord(base, record) {
    return saveRecord(base, '000000000', record);
  }

  function saveRecord(base, recordId, record) {

    if (!credentials) {
      throw new Error('Credentials are required for saving records');
    }

    const recordInOAI_MARCXML = RecordSerializers.OAI_MARCXML.toOAI_MARCXML(record);    
    
    var declaration = '<?xml version = "1.0" encoding = "UTF-8"?>\n';

    const requestParams = querystring.stringify({
      'user_name': credentials.username,
      'user_password': credentials.password,
      'op': 'update-doc',
      'doc_num': recordId,
      'library': base,
      'doc_action': 'UPDATE',
      'xml_full_req': `${declaration}<record>${recordInOAI_MARCXML}</record>`
    });

    debug(`Saving record ${base} / ${recordId}`);
    return fetch(XServer, { method: 'POST', body: requestParams })
      .then(response => response.text())
      .then(parseXML)
      .then(parseUpdateResponse);
  }

  function parseUpdateResponse(updateResponse) {
    const rawMessages = _.get(updateResponse, 'update-doc.error', []);
    const sessionId = _.get(updateResponse, 'update-doc.session-id', []);
    
    const successMessagePattern = new RegExp('.*Document: (\\d+) was updated successfully.');
    const successMessage = rawMessages.find(message => successMessagePattern.test(message));

    if (successMessage) {
      
      const [, recordId] = successMessagePattern.exec(successMessage);
      const messages = _.without(rawMessages, successMessage).map(parseMessage);
      debug(`record ${recordId} was updated successfully.`);
      return { recordId, messages, sessionId };
    } else {
      // failed.
      const loginError = _.get(updateResponse, 'login.error', []);
      if (loginError.length) {
        throw new AlephRecordError(_.head(loginError));
      }

      const errorMessages = rawMessages.map(parseMessage);

      const failureMessages = errorMessages.filter(message => message.type === ResponseMessageTypes.MANDATORY);

      if (failureMessages.length) {
        const { code, message } = _.head(failureMessages);
        throw new AlephRecordError(message, code);
      } else {
        if (errorMessages.length) {
          const { code, message } = _.head(errorMessages);
          throw new AlephRecordError(message, code);
        } 
        throw new AlephRecordError('Update failed due to unkown reason.');
      }


    }

  }

  function parseMessage(message) {
    
    const messagePattern = new RegExp('^\\[(\\d+)\\] (.*?)(- (?:mandatory|warning|trigger) error)?$');
    
    const match = messagePattern.exec(message);
    
    if (match) {
      const [, code, message, type] = match;
      return { code, message, type: formatMessageType(type) };

    } else {
      throw new Error(`Unable to parse message: ${message}`);
    }
  }

  function formatMessageType(rawType) {
    switch (rawType) {
      case '- trigger error': return ResponseMessageTypes.TRIGGER;
      case '- warning error': return ResponseMessageTypes.WARNING;
      case '- mandatory error': return ResponseMessageTypes.MANDATORY;
    }
  }
  
  function parseXMLRecordResponse(XServerXMLResponse) {
    return RecordSerializers.OAI_MARCXML.fromOAI_MARCXML(XServerXMLResponse);
  }

  return {
    loadRecord,
    saveRecord,
    createRecord
  };

}
module.exports = { 
  createAlephRecordService,
  AlephRecordError
};
