/* eslint no-console: 0 */

const fs = require('fs');

const Constants = require('./constants');
const TASK_TYPES = Constants.TASK_TYPES;

const MarcPunctuation = require('./marc-punctuation-fix');

const authRules =  MarcPunctuation.readRulesFromCSV(fs.readFileSync('./melinda-auth-punctuation.csv', 'utf8'));

const fixPunctuationFromAuthField = MarcPunctuation.createRecordFixer(authRules, MarcPunctuation.RecordTypes.AUTHORITY);

const handleFenauRecord = require('./task-handlers/fenau');
const handleLinkedFenauRecord = require('./task-handlers/linked-fenau');
const handleLinkedAsteriRecord = require('./task-handlers/linked-asteri');
const handleAsteriRecordFix = require('./task-handlers/asteri');
const handleMelindaRecord = require('./task-handlers/melinda');
const handleFenniRecord = require('./task-handlers/fenni');

function TaskHandler(alephRecordService, voyagerRecordService) {

  function createLinkings(task) {

    if (task.type === TASK_TYPES.FENAU_ASTERI) {
      return handleFenauRecord(task);
    }

    if (task.type === TASK_TYPES.LINKED_FENAU_ASTERI) {
      return handleLinkedFenauRecord(fixPunctuationFromAuthField, task);
    }

    if (task.type === TASK_TYPES.FENNI_ASTERI) {
      return handleFenniRecord(task);
    }

    if (task.type === TASK_TYPES.LINKED_ASTERI_ASTERI) {
      return handleLinkedAsteriRecord(fixPunctuationFromAuthField, task);
    }

    if (task.type === TASK_TYPES.ASTERI_ASTERI) {
      return handleAsteriRecordFix(fixPunctuationFromAuthField, task);
    }

    if (task.type === TASK_TYPES.MELINDA_ASTERI) {
      return handleMelindaRecord(task);
    }
    throw new Error(`Unable to find handler for task ${task.type}`);
  }

  return createLinkings;

}

module.exports = TaskHandler;