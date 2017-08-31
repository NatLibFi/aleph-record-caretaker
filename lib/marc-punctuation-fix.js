const _ = require('lodash');
const parse = require('csv-parse/lib/sync');
const debug = require('debug')('marc-punctuation-fix');
const RecordUtils = require('./record-utils');

const RecordTypes = {
  AUTHORITY: 'AUTHORITY',
  BIBLIOGRAPHIC: 'BIBLIOGRAPHIC',
};

class PunctuationError extends Error {
  constructor ( message ) {
    super();
    Error.captureStackTrace( this, this.constructor );
    this.name = 'PunctuationError';
    this.message = message;
  }
}

function readRulesFromCSV(csv) {
  
  const rows = parse(csv);
  const rules = _.tail(rows).filter(row => row[0] !== '').map(row => {
    const [selector, namePortion, description, portion, preceedingPunctuation, exceptions] = row;
    return {
      selector: new RegExp(selector.replace(/X/g, '.')),
      namePortion: namePortion.replace(/\$/g, '').trim(),
      description, portion, preceedingPunctuation, exceptions
    };
  });

  return rules;

}

function createRecordFixer(rules, recordType = RecordTypes.BIBLIOGRAPHIC) {


  function punctuateField(field) {
    debug(`Handling field ${field.tag}`);
    debug(`Field contents: ${RecordUtils.fieldToString(field)}`);
    const rulesForField = getRulesForField(field.tag);
    if (rulesForField.length === 0) {
      debug(`No matching rules for field ${field.tag}`);
    }
    
    let currentPortion;
    let preceedingField;
    let inNamePortion = true;

    debug(`Field subfields: ${field.subfields.map(sub => sub.code)}`);
    debug(`Field portions: ${field.subfields.map(sub => getPortion(sub, rulesForField))}`);

    field.subfields.forEach(subfield => {
      debug(`Handling subfield ${subfield.code}`);
      let portion = getPortion(subfield, rulesForField);
      
      if (portion === 'CF' || portion === 'NC') {
        return;
      }

      if (inNamePortion && _.includes('T', 'S', portion)) {
        debug(`Portion changed to ${portion}. Not in name portion anymore`);
        inNamePortion = false;
      }

      if (inNamePortion && portion === 'NT') {
        portion = 'N';
      } 
      if (!inNamePortion && portion === 'NT') {
        portion = 'T';
      }

      debug(`Current portion is ${portion}.`);
      
      if (currentPortion) {
        if (currentPortion !== portion) {
          debug(`Current portion changed to ${portion}.`);
          if (portion !== 'S') {
            debug('Adding punctuation for portion.');
            addNamePortionPunctuation(preceedingField);
          }
        } else {
          debug(`Current stayed as ${portion}. Adding punctuation for subfield.`);
          addSubfieldPunctuation(preceedingField, subfield, rulesForField);
        }
      }
      
      currentPortion = portion;
      preceedingField = subfield;
      
    });
    
    if (recordType == RecordTypes.BIBLIOGRAPHIC) {
      addNamePortionPunctuation(preceedingField);
    }
    debug(`After punctuation: ${RecordUtils.fieldToString(field)}`);
    
  }


  function getRulesForField(tag) {
    return rules.filter(rule => rule.selector.test(tag));
  }

  function getPortion(subfield, rules) {
    debug(`Looking for namePortion for ${subfield.code}`);
    const portions = rules.filter(rule => rule.namePortion === subfield.code).map(rule => rule.portion);
    
    if (portions.length === 0) {
      throw new PunctuationError(`Unknown subfield code ${subfield.code}`);
    }
    return _.head(portions).toUpperCase();
    
  }

  function addNamePortionPunctuation(preceedingSubfield) {
    const subfieldContainsPunctuation = /[\?"\)\]\.\-!,]$/.test(preceedingSubfield.value);
    if (!subfieldContainsPunctuation) {
      const nextValue = preceedingSubfield.value + '.';
      debug(`Updated subfield ${preceedingSubfield.code} from '${preceedingSubfield.value}' to '${nextValue}'`);
      preceedingSubfield.value = nextValue;
      
    }
  }


  function addSubfieldPunctuation(preceedingSubfield, currentSubfield, rules) {
    
    const punctType = getPrecedingPunctuation(currentSubfield, rules);
    const exceptionsFunctions = getExceptions(currentSubfield, rules);
    
    for (let i in exceptionsFunctions) {
      const fn = exceptionsFunctions[i];
      const isExceptionCase = fn.call(null, preceedingSubfield);
      if (isExceptionCase) {
        return;
      }
    }
    
    const endsInPunctuation = /[\?"\)\]\-!,]$/.test(preceedingSubfield.value);
    debug(`addSubfieldPunctuation -- punctType: ${punctType} endsInPunctuation: ${endsInPunctuation}`);

    if (! endsInPunctuation) {
      
      if (punctType === 'PERIOD' && !/\.$/.test(preceedingSubfield.value)) {
        const nextValue = preceedingSubfield.value + '.';
        debug(`Updated subfield ${preceedingSubfield.code} from '${preceedingSubfield.value}' to '${nextValue}'`);
        preceedingSubfield.value = nextValue;
      }
    }

    if (punctType === 'COMMA') {
      if (!/,$/.test(preceedingSubfield.value)) {
        if (! /^[\[\(]/.test(currentSubfield.value)) {
          const nextValue = preceedingSubfield.value + ',';
          debug(`Updated subfield ${preceedingSubfield.code} from '${preceedingSubfield.value}' to '${nextValue}'`);
          preceedingSubfield.value = nextValue;
        }
      }
    }
    if (punctType === 'COND_COMMA') {
      if (! /[\-,]$/.test(preceedingSubfield.value)) {
        const nextValue = preceedingSubfield.value + ',';
        debug(`Updated subfield ${preceedingSubfield.code} from '${preceedingSubfield.value}' to '${nextValue}'`);
        preceedingSubfield.value = nextValue;
      }
    }

    debug('addSubfieldPunctuation -- end');
  
  }

  function getPrecedingPunctuation(subfield, rules) {
    
    const punct = rules.filter(rule => rule.namePortion === subfield.code).map(rule => rule.preceedingPunctuation);
    
    if (punct.length === 0) {
      throw new PunctuationError(`Unknown subfield code ${subfield.code}`);
    }
    return _.head(punct).toUpperCase();
    
  }

  function getExceptions(subfield, rules) {
    
    const exceptions = rules.filter(rule => rule.namePortion === subfield.code).map(rule => parseExceptions(rule.exceptions));
    
    if (exceptions.length === 0) {
      throw new PunctuationError(`Unknown subfield code ${subfield.code}`);
    }
    return _.head(exceptions);
    
  }

  function parseExceptions(expectionsString) {
    const exceptionRules = expectionsString.split('\n');
    const exceptionFuncs = [];
    
    exceptionRules.forEach(exceptionRule => {
      const match = /- (.*) if preceded by (.*)/.exec(exceptionRule);
      if (match) {
        const [,type, preceededCode] = match;
        const normalizedType = type.trim().toUpperCase().trim();
        const normalizedCode = preceededCode.replace(/\$/g, '').trim();
        exceptionFuncs.push( ifPrecededByException( normalizedCode, normalizedType ));
      }
    });
    
    return exceptionFuncs;
  }


  function ifPrecededByException(code, type) {
    
    return (preceedingSubfield) => {
      if (code === preceedingSubfield.code) {
        debug(`Adding ${type} to ${preceedingSubfield.code}`);
        if (type === 'SEMICOLON') {
          const nextValue = preceedingSubfield.value + ' ;';
          debug(`Updated subfield ${preceedingSubfield.code} from '${preceedingSubfield.value}' to '${nextValue}'`);
          preceedingSubfield.value = nextValue;

        }
        if (type === 'COLON') {
          const nextValue = preceedingSubfield.value + ' :';
          debug(`Updated subfield ${preceedingSubfield.code} from '${preceedingSubfield.value}' to '${nextValue}'`);
          preceedingSubfield.value = nextValue;
        }
        return true;
      }
      return false;
    };
  }

  return punctuateField;
}

module.exports = {
  readRulesFromCSV,
  createRecordFixer,
  RecordTypes,
  PunctuationError
};
