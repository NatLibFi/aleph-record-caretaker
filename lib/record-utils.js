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

const _ = require('lodash');
const MarcRecord = require('marc-record-js');
const utils = require('./utils');
const debug = require('debug')('record-utils');

const RecordType = {
  AUTH: 'AUTH',
  BIB: 'BIB'
};

function mergeDuplicateFields(record) {
  const copy = new MarcRecord(record);
  copy.fields = utils.chunkWith(copy.fields, isDuplicateFields).map(mergeFields);

  return copy;
}

function omitSubfields(codes, field) {
  if (field && field.subfields) {
    return _.assign({}, field, {
      subfields: field.subfields.filter(sub => !_.includes(codes, sub.code))
    });
  }

  return _.assign({}, field);
}

function isDuplicateFields(a, b) {
  const omitControlSubfields = _.partial(omitSubfields, ['5', '9']);
  if (a.tag === 'CAT') {
    return false;
  }

  return _.isEqual(
    omitControlSubfields(a),
    omitControlSubfields(b)
  );
}

// [item] -> item
function mergeFields(fields) {
  return fields.reduce((mergedField, field) => {
    return _.mergeWith(mergedField, field, customizer);
  });
}

function customizer(objValue, srcValue) {
  if (_.isArray(objValue)) {
    const diff = _.differenceWith(srcValue, objValue, _.isEqual);
    return _.concat(objValue, diff);
  }
}

function fieldToString(field) {

  if (field && field.subfields) {
    const ind1 = field.ind1 || ' ';
    const ind2 = field.ind2 || ' ';
    const subfields = field.subfields.map(subfield => `‡${subfield.code}${subfield.value}`).join('');
    return `${field.tag} ${ind1}${ind2} ${subfields}`;
  }

  return `${field.tag}    ${field.value}`;
}

function stringToField(fieldStr) {
  const tag = fieldStr.substr(0, 3);
  const ind1 = fieldStr.substr(4, 1);
  const ind2 = fieldStr.substr(5, 1);
  const subfieldsStr = fieldStr.substr(6);

  const subfields = _.tail(subfieldsStr.split('‡')).map(subfieldStr => ({
    code: subfieldStr.substr(0, 1),
    value: subfieldStr.substr(1)
  }));

  return {tag, ind1, ind2, subfields};
}

function setSubfields(record, tag, subfields) {
  record.getFields(tag).forEach(field => {
    field.subfields = subfields;
  });
}

function parseYearsFrom100d(record) {
  const f100d = selectFirstSubfieldValue(record, '100', 'd');
  const [birth, death] = f100d ? f100d.split('-') : [];

  const normalize = (str) => str && str.split('').filter(c => /[0-9]|\w|\s/.test(c)).join('');

  return [normalize(birth) || undefined, normalize(death) || undefined];
}

function subfieldOrderNumber(subfieldCode) {
  if (_.includes(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'], subfieldCode)) {
    return subfieldCode.charCodeAt(0) + 200;
  }

  return subfieldCode.charCodeAt(0);
}

function setSubfield(field, code, value, beforeCode) {
  const location = _.findIndex(field.subfields, sub => sub.code === code);

  if (location !== -1) {
    field.subfields.splice(location, 1, {code, value});
  } else {

    const appendLocation = _.findIndex(field.subfields, sub => subfieldOrderNumber(sub.code) >= subfieldOrderNumber(beforeCode));
    const index = appendLocation !== -1 ? appendLocation : field.subfields.length;

    field.subfields.splice(index, 0, {code, value});
  }
}

function selectBirthYear(record) {
  return selectFirstSubfieldValue(record, '046', 'f');
}

function selectDeathYear(record) {
  return selectFirstSubfieldValue(record, '046', 'g');
}

function selectFirstSubfieldValue(record, tag, code) {
  const subfields = _.flatMap(record.getFields(tag), field => field.subfields);
  const subfieldValues = subfields
    .filter(subfield => subfield.code === code)
    .map(subfield => subfield.value);

  return _.head(subfieldValues);
}

//nimiosuus: $a, $b, $c, $d, $g (jos ennen $t:tä), $j, $q

// Links should be selected from 035a. the content must start with FCC.
function selectMelindaLinks(record, linkPrefix = 'FCC') {
  return _.flatMap(record.getFields('035').map(field => field.subfields))
    .filter(subfield => subfield.code === 'a')
    .filter(subfield => _.startsWith(subfield.value, linkPrefix))
    .map(subfield => subfield.value.substr(linkPrefix.length));
}


// linked here means linked inside the record, like cyrillic information
function isLinkedField(field) {
  return field.subfields.some(subfield => subfield.code === '6');
}


function recordIsAgentAuthority(authorityRecord) {
  const agentAuthorityFields = authorityRecord.fields.filter(field => _.includes(['100', '110', '111'], field.tag));
  if (agentAuthorityFields.length === 0) {
    return false;
  }

  return agentAuthorityFields
    .every(field => {
      const subfieldCodes = field.subfields.map(subfield => subfield.code);
      return !_.includes(subfieldCodes, 't');
    });
}

module.exports = {
  selectMelindaLinks,
  fieldToString,
  parseYearsFrom100d,
  selectBirthYear,
  selectDeathYear,
  selectFirstSubfieldValue,
  setSubfield,
  setSubfields,
  stringToField,
  recordIsAgentAuthority,
  isLinkedField,
  subfieldOrderNumber,
  RecordType,
  mergeDuplicateFields
};

