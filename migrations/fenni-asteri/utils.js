/* eslint no-console: 0 */
const  _ = require('lodash');

function readEnvironmentVariable(name, defaultValue, opts) {

  if (process.env[name] === undefined) {
    if (defaultValue === undefined) {
      const message = `Mandatory environment variable missing: ${name}`;
      console.log('error', message);
      throw new Error(message);
    }
    const loggedDefaultValue = _.get(opts, 'hideDefaultValue') ? '[hidden]' : defaultValue;
    console.log('info', `No environment variable set for ${name}, using default value: ${loggedDefaultValue}`);
  }

  return _.get(process.env, name, defaultValue);
}


function decorateConnectionWithDebug(connection) {

  const actualExecute = connection.execute;
  connection.execute = function() {
    console.log('DEBUG-SQL', `'${arguments[0]}'`, arguments[1]);
    return actualExecute.apply(this, arguments);
  };
}


function elapsedTime(start){
  const [s, nano] = process.hrtime(start);    
  const total = s + nano / 1000000000;
  const elapsed = Math.round(total * 100) / 100;
  return elapsed;
}

async function readAllRows(resultSet, rows = []) {
  
  const nextRow = await resultSet.getRow();
  if (nextRow === null) {
    await resultSet.close();
    return rows;
  }
  
  rows.push(nextRow);
  return readAllRows(resultSet, rows);
}


// [item] -> [[item]]
function chunkWith(arr, similarityPredicate) {

  let mutableArray = _.clone(arr);

  const result = [];

  do {
    const item = mutableArray.shift();
    const similarItems = mutableArray.filter(_.partial(similarityPredicate, item));
    result.push(_.concat(item, similarItems));

    mutableArray = _.without(mutableArray, ...similarItems);

  } while (mutableArray.length > 0);
  return result;
}



module.exports = {
  readAllRows,
  readEnvironmentVariable,
  decorateConnectionWithDebug,
  elapsedTime,
  chunkWith
};