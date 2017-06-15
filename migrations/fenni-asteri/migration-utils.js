const RecordUtils = require('../../lib/record-utils');
const _ = require('lodash');

const selectFirstSubfieldValue = RecordUtils.selectFirstSubfieldValue;


class LinkingQueryError extends Error {
  constructor ( message ) {
    super();
    Error.captureStackTrace( this, this.constructor );
    this.name = 'LinkingQueryError';
    this.message = message;
  }
}


function selectNameHeadingPermutations(record) {
  const corporateName = _.head(record.getFields('110'));
  const meetingName = _.head(record.getFields('111'));

  if (corporateName) {
    const authorizedPortion = RecordUtils.findAuthorizedPortion(RecordUtils.RecordType.AUTH, corporateName);
    const subfields = _.concat(authorizedPortion.subfields, _.get(authorizedPortion, 'specifier.subfields', []));
    const normalized = subfields.map(subfield => ({ code: subfield.code, value: normalizeForHeadingQuery(subfield.value)}));
    return [normalized];
  }

  if (meetingName) {
    const authorizedPortion = RecordUtils.findAuthorizedPortion(RecordUtils.RecordType.AUTH, meetingName);
    const subfields = _.concat(authorizedPortion.subfields, _.get(authorizedPortion, 'specifier.subfields', []));
    const normalized = subfields.map(subfield => ({ code: subfield.code, value: normalizeForHeadingQuery(subfield.value)}));
    return [normalized];
  }

  //'a', 'b', 'c', 'd', 'g', 'j', 'q'

  // order is: a b q c d g j 
  // jos c:ssä on suluissa oleva termi ni se tulee vikaksi.

  const name = selectFirstSubfieldValue(record, '100', 'a');
  const c = selectFirstSubfieldValue(record, '100', 'c');
  const q = selectFirstSubfieldValue(record, '100', 'q');

  const d = selectFirstSubfieldValue(record, '100', 'd');
  const normalizedD = normalizeForHeadingQuery(d);

  // TODO: JOS ON D jossa on vain suluissa oleva numero, ex. (1) niin sen voi heittää <<<-:seen
  const [birth100d, death100d] = RecordUtils.parseYearsFrom100d(record);
  const birth046 = RecordUtils.selectBirthYear(record);
  const death046 = RecordUtils.selectDeathYear(record);
  
  const birth = birth046 || birth100d;
  const death = death100d || death046;
  const normalizedName = normalizeForHeadingQuery(name);
  
  const dSubfieldFragments = [birth, death].filter(_.identity);
  
  const normalizedNameSubfield = { code: 'a', value: normalizedName };
  const normalizedCSubfield = { code: 'c', value: normalizeForHeadingQuery(c) };
  const normalizedQSubfield = { code: 'q', value: normalizeForHeadingQuery(q) };

  const nameAndMaybeQC = [normalizedNameSubfield, normalizedQSubfield, normalizedCSubfield].filter(sub => sub.value !== undefined);
  
  const permutationsForDSubfield = dSubfieldFragments.map((item, index) => dSubfieldFragments.slice(0, index+1)).map(values => {
    const dValue = values.join(' ');
    const dSubfield = { code: 'd', value: dValue };
    return dSubfield;
  });

  if (d && !permutationsForDSubfield.some(dSubfield => normalizeForHeadingQuery(dSubfield.value) === normalizedD)) {
    throw new Error('Record contains 100d with content that cannot be reconstructed from 046');
  }
  if (d && !birth046 && !death046) {
    return [_.concat(nameAndMaybeQC, { code: 'd', value: normalizedD })];
  }

  const permutations = permutationsForDSubfield.map(dSubfield => _.concat(nameAndMaybeQC, dSubfield));
  permutations.unshift(nameAndMaybeQC);
  
  return permutations;
}


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


function selectNameFields(tags, record) {
  const fields = record.fields.filter(field => _.includes(tags, field.tag));
  return fields
    .filter(keepFennicaOrYsa600)
    .map(field => {

      const authorizedPortion = RecordUtils.findAuthorizedPortion(RecordUtils.RecordType.BIB, field);
      const nameFields = _.concat(authorizedPortion.subfields, _.get(authorizedPortion, 'specifier.subfields', []));
      return { field, nameFields };
    });
}


function selectFieldForLinkingWithZero(record, queryTerms) {
  const selectPersonalNameFields = _.partial(selectNameFields,  ['100', '600', '700']);
  const selectCorporateNameFields = _.partial(selectNameFields, ['110', '610', '710']);
  const selectMeetingNameFields = _.partial(selectNameFields,   ['111', '611', '711']);

  const select8XXPersonalNameFields = _.partial(selectNameFields,  ['800']);
  const select8XXCorporateNameFields = _.partial(selectNameFields, ['810']);
  const select8XXMeetingNameFields = _.partial(selectNameFields,   ['811']);
  
  
  // TODO: bibissä voi olla X00 kentissä d-osakentässä suluissa numero ex. (1), jota ei käytetä vertailussa.

  const matcher = name => {
    const normalized = name.nameFields.map(sub => ({ code: sub.code, value: normalizeForHeadingQuery(sub.value) }));
    
    return queryTerms.some(term => _.isEqual(term, normalized)); 
    
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
      const nameFields = field.subfields.filter(subfield => _.includes(['a', 'b', 'c', 'd' ,'e', 'g', 'n', 'q'], subfield.code));
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

module.exports = {
  selectAuthorizedPortion,
  selectNameHeadingPermutations,
  selectFieldForLinkingWithZero,
  selectFieldFromAuthorityRecordForLinkingWithZero,
  normalizeForHeadingQuery,
  setLinkedAuthorityNamePortion,
  setAuthorizedPortion,
  LinkingQueryError
};