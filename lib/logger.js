const winston = require('winston');
const moment = require('moment');

var logger = new (winston.Logger)({
  transports: [
    new (winston.transports.Console)({
      timestamp: () => moment().format('YYYY-MM-DDTHH:mm:ss.SSSZ')
    })
  ]
});

module.exports = logger;
