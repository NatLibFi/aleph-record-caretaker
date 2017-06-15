const _ = require('lodash');

const RecordType = {
  AUTH: 'AUTH',
  BIB: 'BIB'
};

class LinkingQueryError extends Error {
  constructor ( message ) {
    super();
    Error.captureStackTrace( this, this.constructor );
    this.name = 'LinkingQueryError';
    this.message = message;
  }
}


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

function selectNameHeadingPermutations(record) {
  const corporateName = _.head(record.getFields('110'));
  const meetingName = _.head(record.getFields('111'));

  if (corporateName) {
    const nameFields = corporateName.subfields.filter(subfield => _.includes(['a', 'b', 'c', 'd', 'g', 'n'], subfield.code));
    const normalized = nameFields.map(subfield => ({ code: subfield.code, value: normalizeForHeadingQuery(subfield.value)}));
    return [normalized];
  }
  if (meetingName) {
    const nameFields = meetingName.subfields.filter(subfield => _.includes([ 'a', 'b', 'c', 'd','e', 'g', 'n', 'q'], subfield.code));
    const normalized = nameFields.map(subfield => ({ code: subfield.code, value: normalizeForHeadingQuery(subfield.value)}));
    return [normalized];
  }


  const name = selectFirstSubfieldValue(record, '100', 'a');
  const c = selectFirstSubfieldValue(record, '100', 'c');

  const [birth100d, death100d] = parseYearsFrom100d(record);
  const birth046 = selectBirthYear(record);
  const death046 = selectDeathYear(record);
  
  const birth = birth046 || birth100d;
  const death = death100d || death046;
  const normalizedName = normalizeForHeadingQuery(name);
  const normalizedC = normalizeForHeadingQuery(c);
  
  const dSubfieldFragments = [birth, death].filter(_.identity);
  
  const normalizedNameSubfield = { code: 'a', value: normalizedName };
  const normalizedCSubfield = { code: 'c', value: normalizedC };

  const nameAndMaybeC = [normalizedNameSubfield, normalizedCSubfield].filter(sub => sub.value !== undefined);
  
  const permutations = dSubfieldFragments.map((item, index) => dSubfieldFragments.slice(0, index+1)).map(values => {
    const dValue = values.join(' ');
    const dSubfield = { code: 'd', value: dValue };
    return _.concat(nameAndMaybeC, dSubfield);
  });

  permutations.unshift(nameAndMaybeC);
  
  return permutations;
}

function normalizeForHeadingQuery(string) {
  if (string === undefined) return string;

  return string
    .replace(/æ/g, 'ae')
    .replace(/ż/g, 'z')
    .replace(/ė/g, 'e')
    .replace(/s̆/g, 's')
    .replace(/ž/g, 'z')
    .replace(/č/g, 'c')
    .toUpperCase()
    .replace(/[ ̇(): –,.\-_\/*\[\]=$]+/g, ' ')
    .replace(/[‡'?ʼʻ"ʹ]+/g, '')
    .replace(/ {2}/g, ' ')
    .trim()
    .replace(/Ī/g, 'I')
    .replace(/Á́/g, 'A')
    .replace(/Ą/g, 'A')
    .replace(/Ạ/g, 'A')
    .replace(/Ạ/g, 'A')
    .replace(/Ă/g, 'A')
    .replace(/Ā/g, 'A')
    .replace(/Â/g, 'A')
    .replace(/À/g, 'A')
    .replace(/Æ/g, 'A')
    .replace(/Ą/g, 'A')
    .replace(/Ắ/g, 'A')
    .replace(/A̕/g, 'A')
    .replace(/Á/g, 'A')
    .replace(/Â/g, 'A')
    .replace(/Ã/g, 'A')
    .replace(/Ă/g, 'A')
    .replace(/Ā/g, 'A')
    .replace(/Ĉ/g, 'C')
    .replace(/Ç/g, 'C')
    .replace(/Č/g, 'C')
    .replace(/Ć/g, 'C')
    .replace(/C̜/g, 'C')
    .replace(/Č/g, 'C')
    .replace(/Ć/g, 'C')
    .replace(/Ç/g, 'C')
    .replace(/Đ/g, 'D')
    .replace(/Ð/g, 'D')
    .replace(/Þ/g, 'TH')
    .replace(/Ǧ/g, 'G')
    .replace(/Ē/g, 'E')
    .replace(/Ė/g, 'E')
    .replace(/É/g, 'E')
    .replace(/Ễ/g, 'E')
    .replace(/È/g, 'E')
    .replace(/Ë/g, 'E')
    .replace(/Ě/g, 'E')
    .replace(/Ė/g, 'E')
    .replace(/Ĕ/g, 'E')
    .replace(/Ę/g, 'E')
    .replace(/Ê/g, 'E')
    .replace(/É/g, 'E')
    .replace(/È/g, 'E')
    .replace(/Ë/g, 'E')
    .replace(/Ę/g, 'E')
    .replace(/È/g, 'E')
    .replace(/Ḥ/g, 'H')
    .replace(/Í/g, 'I')
    .replace(/Ì/g, 'I')
    .replace(/Ị/g, 'I')
    .replace(/Ï/g, 'I')
    .replace(/Ķ/g, 'K')
    .replace(/Ğ/g, 'G')
    .replace(/Ğ/g, 'G')
    .replace(/Ł/g, 'L')
    .replace(/Ļ/g, 'L')
    .replace(/Ø/g, 'Â')
    .replace(/Á/g, 'A')
    .replace(/Ã/g, 'A')
    .replace(/Ž/g, 'Z')
    .replace(/Š/g, 'S')
    .replace(/Ş/g, 'S')
    .replace(/Ś/g, 'S')
    .replace(/Ŝ/g, 'S')
    .replace(/Š/g, 'S')
    .replace(/S̆/g, 'S')
    .replace(/Ṣ/g, 'S')
    .replace(/Š/g, 'S')
    .replace(/Š/g, 'S')
    .replace(/Ş/g, 'S')
    .replace(/Ỳ/g, 'Y')
    .replace(/Ý/g, 'Y')
    .replace(/Ÿ/g, 'Y')
    .replace(/Ư/g, 'U')
    .replace(/Û/g, 'U')
    .replace(/Ü/g, 'U')
    .replace(/Ü/g, 'U')
    .replace(/Ô/g, 'O')
    .replace(/Ó/g, 'O')
    .replace(/Ò/g, 'O')
    .replace(/Õ/g, 'O')
    .replace(/Ó/g, 'O')
    .replace(/Ô/g, 'O')
    .replace(/Ō/g, 'O')
    .replace(/Ơ/g, 'O')
    .replace(/Ő/g, 'O')
    .replace(/Ő/g, 'O')
    .replace(/Ő/g, 'O')
    .replace(/Ō/g, 'O')
    .replace(/N̦/g, 'N')
    .replace(/Ǹ/g, 'N')
    .replace(/N̕/g, 'N')
    .replace(/Ř/g, 'R')
    .replace(/Ṛ/g, 'R')
    .replace(/Î/g, 'I')
    .replace(/Í/g, 'I')
    .replace(/Ï/g, 'I')
    .replace(/Ţ/g, 'T')
    .replace(/Ü/g, 'U')
    .replace(/Ú/g, 'U')
    .replace(/Ū/g, 'U')
    .replace(/Ù/g, 'U')
    .replace(/Ū/g, 'U')
    .replace(/U/g, 'U')
    .replace(/Ň/g, 'N')
    .replace(/Ñ/g, 'N')
    .replace(/Ń/g, 'N')
    .replace(/Ň/g, 'N')
    .replace(/Z̆/g, 'Z')
    .replace(/Ž/g, 'Z')
    .replace(/É/g, 'E')
    .replace(/Ö/g, 'Â')
    .replace(/Å/g, 'À')
    .replace(/Ä/g, 'Á')
    .replace(/‏/, ''); // <- there is content there
   
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

function isFennicaAuthority(field) {
  return field.tag.charAt(0) === '6' && field.ind2 === '4';
}
function isYSAAuthority(field) {
  return field.tag.charAt(0) === '6' && field.subfields.some(subfield => subfield.code === '2' && subfield.value.toUpperCase() === 'YSA');
}
function keepFennicaOrYsa600(field) {
  if (field.tag.charAt(0) === '6') {
    return isFennicaAuthority(field) || isYSAAuthority(field);
  }
  return true;
}

function selectNameFields(tags, subfieldCodes, record) {
  const fields = record.fields.filter(field => _.includes(tags, field.tag));
  return fields
    .filter(keepFennicaOrYsa600)
    .map(field => {

      const nameFields = field.subfields.filter(subfield => _.includes(subfieldCodes, subfield.code));
      return { field, nameFields };
    });
}

function selectFieldForLinkingWithZero(record, queryTerms) {
  const selectPersonalNameFields = _.partial(selectNameFields,  ['100', '600', '700'], ['a', 'b', 'c', 'd', 'g', 'j', 'q']);
  const selectCorporateNameFields = _.partial(selectNameFields, ['110', '610', '710'], ['a', 'b', 'c', 'd', 'g', 'n']);
  const selectMeetingNameFields = _.partial(selectNameFields,   ['111', '611', '711'], ['a', 'b', 'c', 'd', 'e', 'g', 'n', 'q']);

  const select8XXPersonalNameFields = _.partial(selectNameFields,  ['800'], ['a', 'b', 'c', 'd', 'g', 'j', 'q']);
  const select8XXCorporateNameFields = _.partial(selectNameFields, ['810'], ['a', 'b', 'c', 'd', 'g', 'n']);
  const select8XXMeetingNameFields = _.partial(selectNameFields,   ['811'], ['a', 'b', 'c', 'd', 'e', 'g', 'n', 'q']);
  
  const matcher = name => {
    const normalized = name.nameFields.map(sub => ({ code: sub.code, value: normalizeForHeadingQuery(sub.value) }));
    
    return queryTerms.some(term => {
      const difference = _.differenceWith(term, normalized, _.isEqual);
      const isSubset = difference.length === 0;
      return isSubset;
    });
    
  };

  const nameFields = _.concat(
    selectPersonalNameFields(record), 
    selectCorporateNameFields(record), 
    selectMeetingNameFields(record)
  );

  const nameFields800 = _.concat(
    select8XXPersonalNameFields(record), 
    select8XXCorporateNameFields(record), 
    select8XXMeetingNameFields(record)
  );

  const matches = nameFields.filter(matcher);
  const matches800 = nameFields800.filter(matcher);

  if (matches.length === 0 && matches800.length > 0) {
    throw new LinkingQueryError('Found only 8XX field for linking.');
  }

  if (matches.length === 0) {
    throw new LinkingQueryError('Could not find field');
  }
    
  return matches.map(match => match.field);

}

function selectFieldFromAuthorityRecordForLinkingWithZero(record, queryTerms) {
  const fields = record.fields
    .filter(field => _.includes(['500', '510', '511'], field.tag))
    .map(field => {
      const nameFields = field.subfields.filter(subfield => _.includes(['a', 'b', 'c', 'd','e', 'g', 'n', 'q'], subfield.code));
      return { field, nameFields };
    });

  const matches = fields.filter(name => {

    const normalized = name.nameFields.map(sub => ({ code: sub.code, value: normalizeForHeadingQuery(sub.value) }));

    return queryTerms.some(term => {
      const difference = _.differenceWith(term, normalized, _.isEqual);
      const isSubset = difference.length === 0;
      return isSubset;
    });

  });
  
  if (matches.length === 0) {
    throw new LinkingQueryError('Could not find field');
  }

  return matches.map(match => match.field);
}


function setLinkedAuthorityNamePortion(linkedAuthorityRecordField, namePortion) {
  
  const {startsAt, length} = find500NamePortion(linkedAuthorityRecordField);
  linkedAuthorityRecordField.subfields.splice.bind(linkedAuthorityRecordField.subfields, startsAt, length).apply(null, namePortion.subfields);
  linkedAuthorityRecordField.ind1 = namePortion.ind1;
}

function setAuthorizedPortion(bibRecordField, authorizedPortion) {

  const {startsAt, length} = findNamePortion(bibRecordField);
  bibRecordField.subfields.splice.bind(bibRecordField.subfields, startsAt, length).apply(null, authorizedPortion.subfields);
  bibRecordField.ind1 = authorizedPortion.ind1;
}


// This is not to be used in the fenni migration
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
      case '100': isAuthorizedSubfield = (sub) => _.includes(['a', 'b', 'c', 'd', 'g', 'h', 'q'], sub.code) && !isTitlePortion(sub); break;
      case '600': isAuthorizedSubfield = (sub) => _.includes(['a', 'b', 'c', 'd', 'g', 'h', 'q'], sub.code) && !isTitlePortion(sub); break;
      case '700': isAuthorizedSubfield = (sub) => _.includes(['a', 'b', 'c', 'd', 'g', 'h', 'q'], sub.code) && !isTitlePortion(sub); break;

      case '110': isAuthorizedSubfield = (sub) => _.includes(['a', 'b'], sub.code); break;
      case '610': isAuthorizedSubfield = (sub) => _.includes(['a', 'b'], sub.code); break;
      case '710': isAuthorizedSubfield = (sub) => _.includes(['a', 'b'], sub.code); break;

      case '111': isAuthorizedSubfield = (sub) => _.includes(['a', 'e', 'q'], sub.code); break;      
      case '611': isAuthorizedSubfield = (sub) => _.includes(['a', 'e', 'q'], sub.code); break;
      case '711': isAuthorizedSubfield = (sub) => _.includes(['a', 'e', 'q'], sub.code); break;
      
      default: throw new Error(`Could not find authorized portion for field ${recordField.tag}`);
    }
    

    let isSpecifierSubfield;
    switch(recordField.tag) {
      case '110': isSpecifierSubfield = (sub) => _.includes(['c', 'd', 'g', 'n'], sub.code) && ! isTitlePortion(sub); break;
      case '610': isSpecifierSubfield = (sub) => _.includes(['c', 'd', 'g', 'n'], sub.code) && ! isTitlePortion(sub); break;
      case '710': isSpecifierSubfield = (sub) => _.includes(['c', 'd', 'g', 'n'], sub.code) && ! isTitlePortion(sub); break;

      case '111': isSpecifierSubfield = (sub) => _.includes(['c', 'd', 'g', 'n'], sub.code) && ! isTitlePortion(sub); break;
      case '611': isSpecifierSubfield = (sub) => _.includes(['c', 'd', 'g', 'n'], sub.code) && ! isTitlePortion(sub); break;
      case '711': isSpecifierSubfield = (sub) => _.includes(['c', 'd', 'g', 'n'], sub.code) && ! isTitlePortion(sub); break;

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

    case '110': return _.includes(['f','k','l','p','t','d','g','n'], subfield.code);
    case '610': return _.includes(['f','h','k','l','m','o','p','r','s','t','d','g','n'], subfield.code);
    case '710': return _.includes(['f','h','k','l','m','o','p','r','s','t','d','g','n'], subfield.code);

    case '111': return _.includes(['f','k','l','p','t','g','n'], subfield.code);
    case '611': return _.includes(['f','h','k','l','p','s','t','g','n'], subfield.code);
    case '711': return _.includes(['f','h','k','l','p','s','t','g','n'], subfield.code);

    default: return false;
  }
}




// This is not to be used in the fenni migration
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

function findNamePortion(field) {
  if (_.includes(['100', '600', '700', '800'], field.tag)) {
    const codes = field.subfields.map(sub => sub.code);
    const subfieldTIndex = codes.indexOf('t');

    const codesBeforeT = subfieldTIndex === -1 ? codes : codes.slice(0, subfieldTIndex);

    const classified = codesBeforeT.map((code) => {
      return _.includes(['a', 'b', 'c', 'd', 'g', 'h', 'q'], code);
    });

    const startsAt = _.findIndex(classified);
    const endAt = _.findLastIndex(classified);
    const length = endAt - startsAt + 1;

    // validate that there are no non-name portion fields in the middle
    const containsOnlyNameFields = classified.slice(startsAt, endAt).every(_.identity);
    if (!containsOnlyNameFields) {
      throw new Error('Field contains extra fields in the middle of authorized portion');
    }

    return { startsAt, length };
  }
  
  throw new Error(`Could not find authorized portion for field ${field.tag}`);
}

function find500NamePortion(field) {
  if (field.tag === '500') {
    const codes = field.subfields.map(sub => sub.code);
    const subfieldTIndex = codes.indexOf('t');

    const codesBeforeT = subfieldTIndex === -1 ? codes : codes.slice(0, subfieldTIndex);

    const classified = codesBeforeT.map((code) => {
      return _.includes(['a', 'b', 'c', 'd', 'g', 'h', 'q'], code);
    });

    const startsAt = _.findIndex(classified);
    const endAt = _.findLastIndex(classified);
    const length = endAt - startsAt + 1;

    // validate that there are no non-name portion fields in the middle
    const containsOnlyNameFields = classified.slice(startsAt, endAt).every(_.identity);
    if (!containsOnlyNameFields) {
      throw new Error('Field contains extra fields in the middle of name portion');
    }

    return { startsAt, length };
  }
  
  throw new Error(`Could not find 500 name portion for field ${field.tag}`);
}

//nimiosuus: $a, $b, $c, $d, $g (jos ennen $t:tä), $j, $q

// the first indicator should only apply for 100, 110, 111. For this migration only 100 is handled.
function selectAuthorizedPortion(record) {
  const field100 = _.head(record.getFields('100'));
  const namePortion = field100.subfields.filter((subfield) => {
    return _.includes(['a', 'b', 'c', 'd', 'g', 'j', 'q'], subfield.code);
  });
  
  return  {
    subfields: _.cloneDeep(namePortion),
    ind1: field100.ind1
  };
}
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
  setLinkedAuthorityNamePortion,
  selectMelindaLinks,
  fieldToString,
  normalizeForHeadingQuery,
  parseYearsFrom100d,
  selectBirthYear,
  selectDeathYear,
  selectFieldForLinkingWithZero,
  selectFirstSubfieldValue,
  selectNameHeadingPermutations,
  selectAuthorizedPortion,
  setAuthorizedPortion,
  setSubfield,
  setSubfields,
  stringToField,
  selectFieldFromAuthorityRecordForLinkingWithZero,
  recordIsAgentAuthority,
  isLinkedField,
  subfieldOrderNumber,
  LinkingQueryError,
  RecordType,
  findAuthorizedPortion,
  updateAuthorizedPortion
};

