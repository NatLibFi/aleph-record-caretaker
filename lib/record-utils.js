const _ = require('lodash');

const RecordType = {
  AUTH: 'AUTH',
  BIB: 'BIB'
};

function fieldToString(field) {
  const subfields = field.subfields.map(subfield => `‡${subfield.code}${subfield.value}`).join('');
  return `${field.tag} ${field.ind1}${field.ind2} ${subfields}`;
}

function stringToField(fieldStr) {
  const tag = fieldStr.substr(0,3);
  const ind1 = fieldStr.substr(4,1);
  const ind2 = fieldStr.substr(5,1);
  const subfieldsStr = fieldStr.substr(6);
  
  const subfields = _.tail(subfieldsStr.split('‡')).map(subfieldStr => ({
    code: subfieldStr.substr(0,1),
    value: subfieldStr.substr(1)
  }));

  return { tag, ind1, ind2, subfields };
}

function setSubfields(record, tag, subfields) {
  record.getFields(tag).forEach(field => {
    field.subfields = subfields;
  });
}

function parseYearsFrom100d(record) {
  const f100d = selectFirstSubfieldValue(record, '100', 'd');
  const [birth, death] = f100d ? f100d.split('-') : [];

  return [birth || undefined, death || undefined];
}

function subfieldOrderNumber(subfieldCode) {
  if (_.includes(['0','1','2','3','4','5','6','7','8','9'], subfieldCode)) {
    return subfieldCode.charCodeAt(0) + 200;
  } else {
    return subfieldCode.charCodeAt(0);
  }
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


/*
Bib-tietueen auktorisoituja muotoja sisältävät kentät
------------------------------------------------------

100, 600, 700, 800 - henkilöt, auktoriteettitietueet, joissa 100 -kenttä
X00:
nimiosuus: $a, $b, $c, $d, $g (jos ennen $t:tä), $j, $q
funktio: $e, $4
organisatorinen kytkös: $u
nimekeosuus: $f, $g (jos $t:n jälkeen), $h, $k, $l, $m, $n, $o, $p, $r, $s, $t, $v, $x, $y, $z
kontrolliosakentät: $0, $2, $6, $8, $9
aineiston osa: $3

110, 610, 710, 810 - yhteisöt, auktoriteettitietueet, joissa 110 -kenttä
X10:
nimiosuus: $a, $b, $c, $d, $g (jos ennen $t:tä), $n
funktio: $e, $4
nimekeosuus: $f, $g (jos $t:n jälkeen), $k, $l, $p, $t, 
organisatorinen kytkös: $u
kontrolliosakentät: $0, $2, $6, $8, $9
aineiston osa: $3

111, 611, 711, 811 - kokoukset, auktoriteettitietueet, joissa 111 -kenttä
X11:
nimiosuus: $a, $c, $d, $e, $g (jos ennen $t:tä), $n (jos ennen $t:tä), $q, 
funktio: $j, $4
nimekeosuus: $f, $g (jos $t:n jälkeen), $k, $l, $n (jos $t:n jälkeen), $t
organisatorinen kytkös: $u
kontrolliosakentät: $0, $2, $6, $8, $9
aineiston osa: $3

6XX vain jos 2. indikaattori on 4 tai (toinen indikaattori on 7 ja on osakenttä $2:n sisältö on ysa).


(130, 630, 730, 830 - yhtenäistetyt nimekkeet, auktoriteettitietueet, joissa 130 -kenttä)
(647, 648, 650, 651, 655 - asiasanoja, auktoriteettitietueet, joissa vastaavat 1XX -kentät)
*/


// This is not to be used in the fenni migration for setting any values.
function findAuthorizedPortion(recordType, recordField) {
  if (recordType === RecordType.AUTH) {

    let isTitlePortion = _.curry(isTitlePortionSubfield)(recordField);
    const titlePortionStart = recordField.subfields.findIndex(isTitlePortion);
    const hasTitlePortion = titlePortionStart !== -1;
    const titlePortionEnd = _.findLastIndex(recordField.subfields, isTitlePortion);
    const titlePortionLength = titlePortionEnd - titlePortionStart + 1;


    let isSpecifierSubfield;
    switch(recordField.tag) {
      case '110': isSpecifierSubfield = (sub) => _.includes(['c', 'd', 'g', 'n'], sub.code) && !isTitlePortion(sub); break;
      case '610': isSpecifierSubfield = (sub) => _.includes(['c', 'd', 'g', 'n'], sub.code) && !isTitlePortion(sub); break;
      case '710': isSpecifierSubfield = (sub) => _.includes(['c', 'd', 'g', 'n'], sub.code) && !isTitlePortion(sub); break;

      case '111': isSpecifierSubfield = (sub) => _.includes(['c', 'd', 'g', 'n'], sub.code) && !isTitlePortion(sub); break;
      case '611': isSpecifierSubfield = (sub) => _.includes(['c', 'd', 'g', 'n'], sub.code) && !isTitlePortion(sub); break;
      case '711': isSpecifierSubfield = (sub) => _.includes(['c', 'd', 'g', 'n'], sub.code) && !isTitlePortion(sub); break;

      default: isSpecifierSubfield = () => false;
    }
    
    let isAuthorizedSubfield;
    switch(recordField.tag) {
      case '100': isAuthorizedSubfield = (sub) => !_.includes(['6', '8', '0'], sub.code) && !isSpecifierSubfield(sub) && !isTitlePortion(sub); break;
      case '110': isAuthorizedSubfield = (sub) => !_.includes(['6', '8', '0'], sub.code) && !isSpecifierSubfield(sub) && !isTitlePortion(sub); break;
      case '111': isAuthorizedSubfield = (sub) => !_.includes(['6', '8', '0'], sub.code) && !isSpecifierSubfield(sub) && !isTitlePortion(sub); break;
      
      case '500': isAuthorizedSubfield = (sub) => !_.includes(['i', 'w', '4', '5', '6', '8', '9', '0'], sub.code) && !isSpecifierSubfield(sub) && !isTitlePortion(sub); break;
      case '510': isAuthorizedSubfield = (sub) => !_.includes(['i', 'w', '4', '5', '6', '8', '9', '0'], sub.code) && !isSpecifierSubfield(sub) && !isTitlePortion(sub); break;
      case '511': isAuthorizedSubfield = (sub) => !_.includes(['i', 'w', '4', '5', '6', '8', '9', '0'], sub.code) && !isSpecifierSubfield(sub) && !isTitlePortion(sub); break;
      
      case '700': isAuthorizedSubfield = (sub) => !_.includes(['i', 'w', '4', '0'], sub.code) && !isSpecifierSubfield(sub) && !isTitlePortion(sub); break;
      case '710': isAuthorizedSubfield = (sub) => !_.includes(['i', 'w', '4', '0'], sub.code) && !isSpecifierSubfield(sub) && !isTitlePortion(sub); break;
      case '711': isAuthorizedSubfield = (sub) => !_.includes(['i', 'w', '4', '0'], sub.code) && !isSpecifierSubfield(sub) && !isTitlePortion(sub); break;
      
      default: throw new Error(`Could not find authorized portion for field ${recordField.tag}`);
    }
   
    const specifierPortionStart = recordField.subfields.findIndex(isSpecifierSubfield);
    const hasSpecifier = specifierPortionStart !== -1;
    const specifierPortionEnd = _.findLastIndex(recordField.subfields, isSpecifierSubfield);
    const specifierPortionLength = specifierPortionEnd - specifierPortionStart + 1;



    const authorizedPortionStart = recordField.subfields.findIndex(isAuthorizedSubfield);
    const authorizedPortionEnd = _.findLastIndex(recordField.subfields, isAuthorizedSubfield);
    const authorizedPortionLength = authorizedPortionEnd - authorizedPortionStart + 1;

    if (!recordField.subfields.slice(authorizedPortionStart, authorizedPortionEnd+1).every(isAuthorizedSubfield)) {
      throw new Error('Field contains extra fields in the middle of authorized portion');
    }

    return {
      ind1: recordField.ind1,
      tag: recordField.tag,
      subfields: _.cloneDeep(recordField.subfields).filter(isAuthorizedSubfield),
      range: {
        start: authorizedPortionStart,
        length: authorizedPortionLength
      },
      specifier: hasSpecifier ? {
        range: {
          start: specifierPortionStart,
          length: specifierPortionLength
        },
        subfields: _.cloneDeep(recordField.subfields).filter(isSpecifierSubfield)
      } : null,
      titlePortion: hasTitlePortion ? {
        range: {
          start: titlePortionStart,
          length: titlePortionLength
        },
        subfields: _.cloneDeep(recordField.subfields).filter(isTitlePortion)
      } : null
    };

  }
  if (recordType === RecordType.BIB) {
    

    let isTitlePortion = _.curry(isTitlePortionSubfield)(recordField);
    const titlePortionStart = recordField.subfields.findIndex(isTitlePortion);
    const hasTitlePortion = titlePortionStart !== -1;
    const titlePortionEnd = _.findLastIndex(recordField.subfields, isTitlePortion);
    const titlePortionLength = titlePortionEnd - titlePortionStart + 1;

    let isAuthorizedSubfield;
    switch(recordField.tag) {
      case '100': isAuthorizedSubfield = (sub) => _.includes(['a', 'b', 'c', 'd', 'g', 'j', 'q'], sub.code) && !isTitlePortion(sub); break;
      case '600': isAuthorizedSubfield = (sub) => _.includes(['a', 'b', 'c', 'd', 'g', 'j', 'q'], sub.code) && !isTitlePortion(sub); break;
      case '700': isAuthorizedSubfield = (sub) => _.includes(['a', 'b', 'c', 'd', 'g', 'j', 'q'], sub.code) && !isTitlePortion(sub); break;
      case '800': isAuthorizedSubfield = (sub) => _.includes(['a', 'b', 'c', 'd', 'g', 'j', 'q'], sub.code) && !isTitlePortion(sub); break;

      case '110': isAuthorizedSubfield = (sub) => _.includes(['a', 'b'], sub.code); break;
      case '610': isAuthorizedSubfield = (sub) => _.includes(['a', 'b'], sub.code); break;
      case '710': isAuthorizedSubfield = (sub) => _.includes(['a', 'b'], sub.code); break;
      case '810': isAuthorizedSubfield = (sub) => _.includes(['a', 'b'], sub.code); break;

      case '111': isAuthorizedSubfield = (sub) => _.includes(['a', 'e', 'q'], sub.code); break;      
      case '611': isAuthorizedSubfield = (sub) => _.includes(['a', 'e', 'q'], sub.code); break;
      case '711': isAuthorizedSubfield = (sub) => _.includes(['a', 'e', 'q'], sub.code); break;
      case '811': isAuthorizedSubfield = (sub) => _.includes(['a', 'e', 'q'], sub.code); break;
      
      default: throw new Error(`Could not find authorized portion for field ${recordField.tag}`);
    }
    

    let isSpecifierSubfield;
    switch(recordField.tag) {
      case '110': isSpecifierSubfield = (sub) => _.includes(['c', 'd', 'g', 'n'], sub.code) && ! isTitlePortion(sub); break;
      case '610': isSpecifierSubfield = (sub) => _.includes(['c', 'd', 'g', 'n'], sub.code) && ! isTitlePortion(sub); break;
      case '710': isSpecifierSubfield = (sub) => _.includes(['c', 'd', 'g', 'n'], sub.code) && ! isTitlePortion(sub); break;
      case '810': isSpecifierSubfield = (sub) => _.includes(['c', 'd', 'g', 'n'], sub.code) && ! isTitlePortion(sub); break;

      case '111': isSpecifierSubfield = (sub) => _.includes(['c', 'd', 'g', 'n'], sub.code) && ! isTitlePortion(sub); break;
      case '611': isSpecifierSubfield = (sub) => _.includes(['c', 'd', 'g', 'n'], sub.code) && ! isTitlePortion(sub); break;
      case '711': isSpecifierSubfield = (sub) => _.includes(['c', 'd', 'g', 'n'], sub.code) && ! isTitlePortion(sub); break;
      case '811': isSpecifierSubfield = (sub) => _.includes(['c', 'd', 'g', 'n'], sub.code) && ! isTitlePortion(sub); break;

      default: isSpecifierSubfield = () => false;
    }


    const authorizedPortionStart = recordField.subfields.findIndex(isAuthorizedSubfield);
    const authorizedPortionEnd = _.findLastIndex(recordField.subfields, isAuthorizedSubfield);
    const authorizedPortionLength = authorizedPortionEnd - authorizedPortionStart + 1;

    if (!recordField.subfields.slice(authorizedPortionStart, authorizedPortionEnd+1).every(isAuthorizedSubfield)) {
      throw new Error('Field contains extra fields in the middle of authorized portion');
    }

    const specifierPortionStart = recordField.subfields.findIndex(isSpecifierSubfield);
    const hasSpecifier = specifierPortionStart !== -1;
    const specifierPortionEnd = _.findLastIndex(recordField.subfields, isSpecifierSubfield);
    const specifierPortionLength = specifierPortionEnd - specifierPortionStart + 1;

  
    return {
      ind1: recordField.ind1,
      tag: recordField.tag,
      subfields: _.cloneDeep(recordField.subfields).filter(isAuthorizedSubfield),
      range: {
        start: authorizedPortionStart,
        length: authorizedPortionLength
      },
      specifier: hasSpecifier ? {
        range: {
          start: specifierPortionStart,
          length: specifierPortionLength
        },
        subfields: _.cloneDeep(recordField.subfields).filter(isSpecifierSubfield)
      } : null,
      titlePortion: hasTitlePortion ? {
        range: {
          start: titlePortionStart,
          length: titlePortionLength
        },
        subfields: _.cloneDeep(recordField.subfields).filter(isTitlePortion)
      } : null
    };
  }
  throw new Error(`Invalid record type ${recordType}`);
}

function isTitlePortionSubfield(field, subfield) {
  const subfieldsAfterT = _.dropWhile(field.subfields, sub => sub.code !== 't');
  if (!_.find(subfieldsAfterT, (afterT) => _.isEqual(afterT, subfield))) {
    return false;
  }

  switch(field.tag) {
    case '100': return _.includes(['f','g','h','k','l','m','o','r','s','t','v','x','y','z','p','t','d','g','n'], subfield.code);
    case '600': return _.includes(['f','g','h','k','l','m','o','r','s','t','v','x','y','z','p','t','d','g','n'], subfield.code);
    case '700': return _.includes(['f','g','h','k','l','m','o','r','s','t','v','x','y','z','p','t','d','g','n'], subfield.code);
    case '800': return _.includes(['f','g','h','k','l','m','o','r','s','t','v','x','y','z','p','t','d','g','n'], subfield.code);

    case '110': return _.includes(['f','k','l','p','t','d','g','n'], subfield.code);
    case '610': return _.includes(['f','h','k','l','m','o','p','r','s','t','d','g','n'], subfield.code);
    case '710': return _.includes(['f','h','k','l','m','o','p','r','s','t','d','g','n'], subfield.code);
    case '810': return _.includes(['f','h','k','l','m','o','p','r','s','t','d','g','n'], subfield.code);

    case '111': return _.includes(['f','k','l','p','t','g','n'], subfield.code);
    case '611': return _.includes(['f','h','k','l','p','s','t','g','n'], subfield.code);
    case '711': return _.includes(['f','h','k','l','p','s','t','g','n'], subfield.code);
    case '811': return _.includes(['f','h','k','l','p','s','t','g','n'], subfield.code);

    default: return false;
  }
}

// This is not to be used in the fenni migration!
function updateAuthorizedPortion(recordType, recordField, authorizedPortion) {
  if (recordType === RecordType.AUTH) {
    const currentAuthorizedPortion = findAuthorizedPortion(recordType, recordField);

    const updatedRecordField = _.cloneDeep(recordField);
    updatedRecordField.subfields.splice.bind(updatedRecordField.subfields, currentAuthorizedPortion.range.start, currentAuthorizedPortion.range.length).apply(null, authorizedPortion.subfields); 
    updatedRecordField.ind1 = authorizedPortion.ind1;
    
    // update tag series
    const tagSeries = tag => tag.substr(1);
    if (tagSeries(recordField.tag) !== tagSeries(authorizedPortion.tag)) {
      updatedRecordField.tag = updatedRecordField.tag.substr(0,1) + tagSeries(authorizedPortion.tag);
    }

    return updatedRecordField;
  }
  if (recordType === RecordType.BIB) {
    const currentAuthorizedPortion = findAuthorizedPortion(recordType, recordField);
    
    const updatedRecordField = _.cloneDeep(recordField);
    updatedRecordField.subfields.splice.bind(updatedRecordField.subfields, currentAuthorizedPortion.range.start, currentAuthorizedPortion.range.length).apply(null, authorizedPortion.subfields); 
    updatedRecordField.ind1 = authorizedPortion.ind1;
    
    // update tag series
    const tagSeries = tag => tag.substr(1);
    if (tagSeries(recordField.tag) !== tagSeries(authorizedPortion.tag)) {
      updatedRecordField.tag = updatedRecordField.tag.substr(0,1) + tagSeries(authorizedPortion.tag);
    }

    // update specifier portion if authorizedPortion contains it.
    if (authorizedPortion.specifier && authorizedPortion.specifier.range.length > 0) {
      // find the authorized portion again since the ranges may change after fields are updated.
      const updatedFieldPortion = findAuthorizedPortion(recordType, updatedRecordField);

      updatedRecordField.subfields.splice.bind(updatedRecordField.subfields, updatedFieldPortion.specifier.range.start, updatedFieldPortion.specifier.range.length).apply(null, authorizedPortion.specifier.subfields); 
    }
    
    return updatedRecordField;
  }
  throw new Error(`Invalid record type ${recordType}`);
}


//nimiosuus: $a, $b, $c, $d, $g (jos ennen $t:tä), $j, $q

// Links should be selected from 035a. the content must start with FCC.
function selectMelindaLinks(record, linkPrefix='FCC') {
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
  findAuthorizedPortion,
  updateAuthorizedPortion
};

