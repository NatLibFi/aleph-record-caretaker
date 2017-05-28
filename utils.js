/* eslint-disable no-console */

function decorateConnectionWithDebug(connection) {

  const actualExecute = connection.execute;
  connection.execute = function() {
    console.log('DEBUG-SQL', `'${arguments[0]}'`, arguments[1]);
    return actualExecute.apply(this, arguments);
  };
}

module.exports = {
  decorateConnectionWithDebug
};


