/**
 * Copyright 2017-2019 University Of Helsinki (The National Library Of Finland)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

const expect = require('chai').expect;
const sinon = require('sinon');
const proxyquire = require('proxyquire').noCallThru();
const winston = require('winston');

describe('logger', () => {
  let sandbox;
  let processWriteStub;
  let consoleTransportOptions;
  let logger;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    // winston's Console transport writes to process.stdout; silence it
    processWriteStub = sandbox.stub(process.stdout, 'write').returns(true);

    consoleTransportOptions = {};
    logger = proxyquire('./logger', {
      winston: {
        ...winston,
        transports: {
          ...winston.transports,
          Console: function(options) {
            consoleTransportOptions = options;
            return new winston.transports.Console(options);
          }
        }
      }
    });
  });

  afterEach(() => sandbox.restore());

  it('should be a winston logger with a log function', () => {
    expect(logger).to.be.instanceOf(winston.Logger);
    expect(logger.log).to.be.a('function');
  });

  it('should use a console transport with an ISO 8601 timestamp', () => {
    expect(consoleTransportOptions).to.be.an('object');
    expect(consoleTransportOptions.timestamp).to.be.a('function');
    expect(consoleTransportOptions.timestamp())
      .to.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}[+-]\d{2}:\d{2}$/);
  });

  it('should not throw when logging at different levels', () => {
    expect(() => logger.log('info', 'info message')).to.not.throw();
    expect(() => logger.log('warn', 'warn message')).to.not.throw();
    expect(() => logger.log('error', 'error message')).to.not.throw();
  });

  it('should forward messages to the console transport', () => {
    logger.log('info', 'forwarded message');

    const written = processWriteStub.getCalls().map(call => call.args.join(''));
    const messageWrite = written.find(text => text.includes('forwarded message'));
    expect(messageWrite).to.be.an('string');
    expect(messageWrite).to.include('"level":"info"');
  });
});
