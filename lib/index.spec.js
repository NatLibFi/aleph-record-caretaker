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
// NOTE: index.js runs run() and registers process listeners at require-time,
// so every test loads a fresh, fully stubbed copy of it via proxyquire (after
// setting the fake clock time) and restores the process state in teardown.

const expect = require('chai').expect;
const sinon = require('sinon');
const proxyquire = require('proxyquire').noCallThru();

const realUtils = require('./utils');
const realLogger = require('./logger');

describe('index (smoke + dispatch)', () => {
  // index.js requires these without defaults; they must be set for run() to proceed
  const MANDATORY_ENV_VARS = [
    'ORACLE_USER', 'ORACLE_PASS', 'ORACLE_CONNECT_STRING',
    'X_SERVER', 'ALEPH_CARETAKER_USER', 'ALEPH_CARETAKER_PASS'
  ];

  let sandbox;
  let clock;
  let envBackup;
  let savedProcessListeners;

  // Mutable, shared with the stubbed utils.getCurrentTime.
  // The default online window is '00:00-21:55, 22:30-24:00', so 22:00 is offline.
  const fakeTime = { value: '22:00' };

  // Stubs + captured state, reset in beforeEach
  let getConnectionStub;
  let listenerCreateStub;
  let listenerStartStub;
  let listenerStopStub;
  let bibCreateStub;
  let authCreateStub;
  let loggerLogStub;
  let onChange;
  let fakeConnection;
  let capturedListenerOptions;
  let handleBibChange;
  let handleAuthChange;
  let processExitStub;
  let oracledbStub;
  let loadIndex;

  beforeEach(() => {
    sandbox = sinon.createSandbox();

    clock = sinon.useFakeTimers();

    envBackup = {};
    MANDATORY_ENV_VARS.forEach(name => {
      envBackup[name] = process.env[name];
      process.env[name] = 'test';
    });
    process.env.ORACLE_USER = 'orcl-user';
    process.env.ORACLE_PASS = 'orcl-pass';
    process.env.ORACLE_CONNECT_STRING = 'orcl-db';
    process.env.X_SERVER = 'http://x.example';
    process.env.ALEPH_CARETAKER_USER = 'caretaker';
    process.env.ALEPH_CARETAKER_PASS = 'caretaker-pass';

    sandbox.stub(console, 'log');

    savedProcessListeners = {
      uncaughtException: process.listeners('uncaughtException').slice(),
      unhandledRejection: process.listeners('unhandledRejection').slice(),
      SIGINT: process.listeners('SIGINT').slice()
    };
    process.removeAllListeners('uncaughtException');
    process.removeAllListeners('unhandledRejection');
    process.removeAllListeners('SIGINT');

    processExitStub = sandbox.stub(process, 'exit');

    fakeTime.value = '22:00'; // offline by default

    // oracledb stub (the real native module is never loaded)
    fakeConnection = { close: sandbox.stub().resolves(), execute: sandbox.stub() };
    getConnectionStub = sandbox.stub().resolves(fakeConnection);
    oracledbStub = {
      outFormat: undefined,
      OBJECT: 'OBJECT',
      getConnection: getConnectionStub
    };

    // aleph-change-listener stub
    listenerStartStub = sandbox.stub();
    listenerStopStub = sandbox.stub();
    listenerCreateStub = sandbox.stub().callsFake((connection, options, callback) => {
      onChange = callback;
      capturedListenerOptions = options;
      return { start: listenerStartStub, stop: listenerStopStub };
    });

    // bib / auth sync service stubs
    handleBibChange = sandbox.stub().resolves();
    handleAuthChange = sandbox.stub().resolves();
    bibCreateStub = sandbox.stub().callsFake(() => ({ handleBibChange }));
    authCreateStub = sandbox.stub().callsFake(() => ({ handleAuthChange }));

    // logger stub (captured, not printed)
    loggerLogStub = sandbox.stub();
    const loggerStub = Object.create(realLogger);
    loggerStub.log = loggerLogStub;

    // utils stub: real utils + controllable getCurrentTime
    const utilsStub = {
      ...realUtils,
      getCurrentTime: () => fakeTime.value
    };

    // Load a fresh copy of index.js with all dependencies stubbed. The require
    // (and thus run()) happens on the first loadIndex() call, so the fake time
    // can be set beforehand.
    loadIndex = async () => {
      const indexPath = require.resolve('../index.js');
      delete require.cache[indexPath];
      proxyquire('../index.js', {
        'oracledb': oracledbStub,
        './lib/logger': loggerStub,
        './lib/utils': utilsStub,
        './lib/aleph-change-listener': { create: listenerCreateStub },
        './lib/aleph-find-service': { create: sandbox.stub().returns({}) },
        './lib/melinda-record-service': { createMelindaRecordService: sandbox.stub().returns({}) },
        './lib/bib-record-sync': { create: bibCreateStub },
        './lib/auth-record-sync': { create: authCreateStub },
        '@natlibfi/melinda-marc-record-utils': { Punctuation: { AuthRules: {} } }
      });
      await flush();
    };
  });

  afterEach(() => {
    if (clock) {
      clock.restore();
      clock = undefined;
    }
    // drop the listeners registered by the fresh index.js require
    process.removeAllListeners('uncaughtException');
    process.removeAllListeners('unhandledRejection');
    process.removeAllListeners('SIGINT');
    // restore the process state that existed before this test
    sandbox.restore();
    savedProcessListeners.uncaughtException.forEach(fn => process.on('uncaughtException', fn));
    savedProcessListeners.unhandledRejection.forEach(fn => process.on('unhandledRejection', fn));
    savedProcessListeners.SIGINT.forEach(fn => process.on('SIGINT', fn));
    // restore env
    MANDATORY_ENV_VARS.forEach(name => {
      if (envBackup[name] === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = envBackup[name];
      }
    });
  });

  async function flush() {
    for (let i = 0; i < 10; i += 1) {
      await clock.runMicrotasks();
    }
  }

  function loggedMessages(level) {
    return loggerLogStub.getCalls()
      .filter(call => call.args[0] === level)
      .map(call => call.args.slice(1).join(' '));
  }

  it('should log the startup messages and stay stopped outside the online window', async () => {
    await loadIndex(); // fakeTime is 22:00 (offline)

    const infoMessages = loggedMessages('info');
    expect(infoMessages).to.include('Starting aleph-record-caretaker');
    expect(infoMessages.some(m => m.startsWith('Online times:'))).to.be.true;

    expect(getConnectionStub.callCount).to.equal(0);
    expect(listenerCreateStub.callCount).to.equal(0);
  });

  it('should connect to oracle and start the listener inside the online window', async () => {
    fakeTime.value = '12:00';
    await loadIndex();

    expect(getConnectionStub.callCount).to.equal(1);
    const dbConfig = getConnectionStub.firstCall.args[0];
    expect(dbConfig).to.eql({ user: 'orcl-user', password: 'orcl-pass', connectString: 'orcl-db' });
    expect(oracledbStub.outFormat).to.equal('OBJECT');

    expect(listenerCreateStub.callCount).to.equal(1);
    expect(listenerCreateStub.firstCall.args[0]).to.equal(fakeConnection);
    expect(capturedListenerOptions.Z106Bases).to.eql(['FIN01', 'FIN10', 'FIN11']);
    expect(capturedListenerOptions.Z115Base).to.equal('USR00');
    expect(listenerStartStub.callCount).to.equal(1);
  });

  it('should decorate the connection with debug when DEBUG_SQL is truthy', async () => {
    process.env.DEBUG_SQL = '1';
    fakeTime.value = '12:00';

    const originalExecute = sandbox.stub();
    fakeConnection.execute = originalExecute;

    await loadIndex();

    // decorateConnectionWithDebug replaces execute with a wrapper that delegates
    // to the original execute
    fakeConnection.execute('select 1 from dual', []);
    expect(originalExecute.callCount).to.equal(1);
  });

  it('should not decorate the connection when DEBUG_SQL is 0', async () => {
    process.env.DEBUG_SQL = '0';
    fakeTime.value = '12:00';

    const originalExecute = fakeConnection.execute;

    await loadIndex();

    // execute is left untouched
    expect(fakeConnection.execute).to.equal(originalExecute);
    expect(getConnectionStub.callCount).to.equal(1);
    expect(listenerStartStub.callCount).to.equal(1);
  });

  it('should stop the listener and close the connection when the online window ends', async () => {
    fakeTime.value = '12:00';
    await loadIndex();
    expect(listenerStartStub.callCount).to.equal(1);

    // next interval tick (60 s) is outside the online window
    fakeTime.value = '22:00';
    clock.tick(60000);
    await flush();

    expect(listenerStopStub.callCount).to.equal(1);
    expect(fakeConnection.close.callCount).to.equal(1);
  });

  it('should log "No changes." after 12 consecutive empty change batches', async () => {
    fakeTime.value = '12:00';
    await loadIndex();

    for (let i = 0; i < 11; i += 1) {
      await onChange([]);
    }
    expect(loggedMessages('info')).to.not.include('No changes.');

    await onChange([]);

    expect(loggedMessages('info')).to.include('No changes.');
  });

  it('should dispatch changes to the bib and auth sync services by base', async () => {
    fakeTime.value = '12:00';
    await loadIndex();

    const bibChange = { library: 'FIN01', recordId: '000000001' };
    const authChange1 = { library: 'FIN11', recordId: '000000002' };
    const authChange2 = { library: 'FIN19', recordId: '000000003' };

    await onChange([bibChange, authChange1, authChange2]);

    expect(handleBibChange.callCount).to.equal(1);
    expect(handleBibChange.firstCall.args[0]).to.equal(bibChange);
    expect(handleAuthChange.callCount).to.equal(2);
    expect(handleAuthChange.getCall(0).args[0]).to.equal(authChange1);
    expect(handleAuthChange.getCall(1).args[0]).to.equal(authChange2);

    expect(loggedMessages('info')).to.include('Handling 3 changes.');
  });

  it('should log a warning and continue for an unknown base', async () => {
    fakeTime.value = '12:00';
    await loadIndex();

    const unknownChange = { library: 'FIN99', recordId: '000000004' };
    const bibChange = { library: 'FIN01', recordId: '000000001' };

    await onChange([unknownChange, bibChange]);

    const warningCalls = loggerLogStub.getCalls().filter(call => call.args[0] === 'warn');
    expect(warningCalls.length).to.equal(1);
    expect(warningCalls[0].args[1]).to.equal('Could not find handler for base FIN99');

    // the loop continued and handled the following change
    expect(handleBibChange.callCount).to.equal(1);
  });

  it('should log an error and continue when a handler throws', async () => {
    fakeTime.value = '12:00';
    await loadIndex();

    handleBibChange.onFirstCall().rejects(new Error('bib failure'));
    const failingChange = { library: 'FIN01', recordId: '000000005' };
    const nextChange = { library: 'FIN11', recordId: '000000006' };

    await onChange([failingChange, nextChange]);

    const errorCalls = loggerLogStub.getCalls().filter(call => call.args[0] === 'error');
    expect(errorCalls.length).to.equal(1);
    expect(errorCalls[0].args[1]).to.equal('[FIN01:000000005]');
    expect(errorCalls[0].args[2]).to.equal('bib failure');

    expect(handleAuthChange.callCount).to.equal(1);
  });

  it('should handle an uncaught exception by logging and exiting with 1', async () => {
    await loadIndex();

    const error = new Error('boom');
    process.emit('uncaughtException', error);

    const errorCalls = loggerLogStub.getCalls().filter(call => call.args[0] === 'error');
    expect(errorCalls.length).to.equal(1);
    expect(errorCalls[0].args[1]).to.equal(error.stack);
    expect(processExitStub.callCount).to.equal(1);
    expect(processExitStub.firstCall.args[0]).to.equal(1);
  });

  it('should re-evaluate the online state on the 60 second interval', async () => {
    fakeTime.value = '12:00';
    await loadIndex();
    expect(listenerStartStub.callCount).to.equal(1);

    // still online on the next tick: no duplicate start, no stop
    clock.tick(60000);
    await flush();
    expect(listenerStartStub.callCount).to.equal(1);
    expect(listenerStopStub.callCount).to.equal(0);

    // go offline: the interval tick stops everything
    fakeTime.value = '22:00';
    clock.tick(60000);
    await flush();
    expect(listenerStopStub.callCount).to.equal(1);
    expect(fakeConnection.close.callCount).to.equal(1);
  });
});
