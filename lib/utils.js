/* eslint-disable no-console */
const _ = require('lodash');
const crypto = require('crypto');
const debug = require('debug')('utils');

function decorateConnectionWithDebug(connection) {

  const actualExecute = connection.execute;
  connection.execute = function() {
    console.log('DEBUG-SQL', `'${arguments[0]}'`, arguments[1]); //eslint-disable-line no-console
    return actualExecute.apply(this, arguments);
  };
}

function serial(funcs) {
  return funcs.reduce((promise, func) => {
    return promise.then((all) => func().then(result => _.concat(all, result)));
  }, Promise.resolve([]));
}

function readEnvironmentVariable(name, defaultValue, opts) {

  if (process.env[name] === undefined) {
    if (defaultValue === undefined) {
      const message = `Mandatory environment variable missing: ${name}`;
      console.error(message);
      throw new Error(message);
    }
    const loggedDefaultValue = _.get(opts, 'hideDefaultValue') ? '[hidden]' : defaultValue;
    console.log(`No environment variable set for ${name}, using default value: ${loggedDefaultValue}`);
  }

  return _.get(process.env, name, defaultValue);
}
function readArrayEnvironmentVariable(name, defaultValue, opts) {
  const value = readEnvironmentVariable(name, defaultValue, opts);
  return value === defaultValue ? value : value.split('|');
}


function deepDiff(collectionA, collectionB) {
  const identicalFields = _.intersectionWith(collectionA, collectionB, _.isEqual);
  const a = collectionA.filter(field => !_.find(identicalFields, _.curry(_.isEqual)(field)));
  const b = collectionB.filter(field => !_.find(identicalFields, _.curry(_.isEqual)(field)));
  return {a,b};
}

function RecentChangesManager(recentChangeCooldownMs = 20000) {
  const recentChanges = {};
  function checkAndUpdateRecentChanges(library, recordId, patch, now = Date.now()) {

    purgeOldChanges(now);

    const changeHash = createChangeHash(library, recordId, patch);

    const isRecentChange = _.get(recentChanges, changeHash);
    const wasChangedDuringCooldown = now - _.get(isRecentChange, 'at', 0) < recentChangeCooldownMs;
    if (isRecentChange && wasChangedDuringCooldown) {
      return true;
    }

    _.set(recentChanges, changeHash, { at: now });
    return false;
  }

  function createChangeHash(library, recordId, patch) {
    const hash = crypto.createHash('sha256');
    hash.update(library + recordId + JSON.stringify(patch));
    return hash.digest('hex');
  }

  function purgeOldChanges(now) {
    
    Object.keys(recentChanges).forEach(changeHash => {
      
      const changeDate = _.get(recentChanges, [changeHash, 'at']);
      if (now - changeDate > recentChangeCooldownMs) {
        debug(`Purging old change from ${changeDate}`);
        delete(recentChanges[changeDate]);
      }
    });
  }

  return {
    checkAndUpdateRecentChanges
  };
}

module.exports = {
  decorateConnectionWithDebug,
  serial,
  readEnvironmentVariable,
  readArrayEnvironmentVariable,
  deepDiff,
  RecentChangesManager
};
