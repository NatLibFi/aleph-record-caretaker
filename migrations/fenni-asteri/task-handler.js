/* eslint no-console: 0 */

const fs = require('fs');

const Constants = require('./constants');
const TASK_TYPES = Constants.TASK_TYPES;

const MarcPunctuation = require('../../lib/marc-punctuation-fix');

const authRules =  MarcPunctuation.readRulesFromCSV(fs.readFileSync('../../lib/auth-punctuation.csv', 'utf8'));

const fixPunctuationFromAuthField = MarcPunctuation.createRecordFixer(authRules, MarcPunctuation.RecordTypes.AUTHORITY);

const handleFenauRecord = require('./task-handlers/fenau');
const handleLinkedFenauRecord = require('./task-handlers/linked-fenau');
const handleLinkedAsteriRecord = require('./task-handlers/linked-asteri');
const handleAsteriRecordFix = require('./task-handlers/asteri');
const handleMelindaRecord = require('./task-handlers/melinda');
const handleFenniRecord = require('./task-handlers/fenni');

function TaskHandler(alephRecordService, voyagerRecordService) {

  function createLinkings(tasks, taskType) {

    if (taskType === TASK_TYPES.FENAU_ASTERI) {
      return handleFenauRecord(tasks);
    }

    if (taskType === TASK_TYPES.LINKED_FENAU_ASTERI) {
      return handleLinkedFenauRecord(fixPunctuationFromAuthField, tasks);
    }

    if (taskType === TASK_TYPES.FENNI_ASTERI) {
      return handleFenniRecord(tasks);
    }

    if (taskType === TASK_TYPES.LINKED_ASTERI_ASTERI) {
      return handleLinkedAsteriRecord(fixPunctuationFromAuthField, tasks);
    }

    if (taskType === TASK_TYPES.ASTERI_ASTERI) {
      return handleAsteriRecordFix(fixPunctuationFromAuthField, tasks);
    }

    if (taskType === TASK_TYPES.MELINDA_ASTERI) {
      return handleMelindaRecord(tasks);
    }
    throw new Error(`Unable to find handler for task ${taskType}`);
  }

  return createLinkings;

}

module.exports = TaskHandler;
