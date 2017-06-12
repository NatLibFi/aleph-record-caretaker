const _ = require('lodash');

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

module.exports = {
  decorateConnectionWithDebug,
  serial
};


