/**
 * Copyright 2017 University Of Helsinki (The National Library Of Finland)
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

const proxyquire = require('proxyquire').noCallThru();
const AlephChangeListener = proxyquire('./aleph-change-listener', { 'oracledb': {} });

const _ = require('lodash');
const sinon = require('sinon');
let sandbox = require('sinon').createSandbox();
const expect = require('chai').expect;
const fs = require('fs');
const moment = require('moment');
const debug = require('debug')('@natlibfi/aleph-record-caretaker:aleph-change-listener');

const Z115Listener = require('./Z115-listener');
const Z106Listener = require('./Z106-listener');
const Poller = require('./poller');


describe('aleph-change-listener', () => {

  const options = {
    Z106Bases: ['USR00'],
    logger: { log: debug.bind(debug)}
  };
  const CURSOR_FILE = '.aleph-changelistener-cursors';
  const CHANGES_QUEUE_FILE = '.aleph-changelistener-changesqueue';
  let fakeConnection;
  let onChangeCb;
  let pollAction;
  let Z115getChangesSinceId;
  let Z106getChangesSinceDate;
  let changesQueueData;
  let cursorFileData;
  let cursorFileReadError;
  let queueFileReadError;
  let loggerLogStub;
  let writtenQueueData;

  beforeEach(async () => {

    changesQueueData = '[]';
    cursorFileData = 'null';
    cursorFileReadError = null;
    queueFileReadError = null;
    onChangeCb = sinon.spy();
    Z115getChangesSinceId = sinon.stub();
    Z106getChangesSinceDate = sinon.stub();

    loggerLogStub = sandbox.stub(options.logger, 'log');

    sandbox.stub(fs, 'writeFileSync').callsFake((name, data) => {
      if (name === CHANGES_QUEUE_FILE) {
        changesQueueData = data;
        writtenQueueData = data;
      }
    });
    sandbox.stub(fs, 'readFileSync').callsFake((name) => {
      if (name === CURSOR_FILE) {
        if (cursorFileReadError) {
          throw cursorFileReadError;
        }
        return cursorFileData;
      }
      if (queueFileReadError) {
        throw queueFileReadError;
      }
      return changesQueueData;
    });


    sandbox.stub(Z115Listener, 'getDefaultCursor').callsFake(() => { });
    sandbox.stub(Z115Listener, 'getChangesSinceId').callsFake(Z115getChangesSinceId);
    sandbox.stub(Z106Listener, 'create').callsFake(() => {
      return {
        getDefaultCursor: () => {},
        getChangesSinceDate: Z106getChangesSinceDate
      };
    });

    sandbox.stub(Poller, 'create').callsFake((interval, action) => {
      pollAction = action;
      return {
        start: sinon.spy(),
        stop: sinon.spy()
      };
    });

    await AlephChangeListener.create(fakeConnection, options, onChangeCb);
  });

  afterEach(() => sandbox.restore());

  it('First call should keep changes stashed', async () => {
    Z115getChangesSinceId.returns([]);
    Z106getChangesSinceDate.returns({changes: [], nextCursor: null });
    await pollAction();
    expect(onChangeCb.callCount).to.equal(0);
  });

  it('Given two empty polls, it should emit 0 changes', async () => {
    Z115getChangesSinceId.returns([]);
    Z106getChangesSinceDate.returns({changes: [], nextCursor: null });
    await pollAction();
    await pollAction();
    expect(onChangeCb.callCount).to.equal(1);
    expect(onChangeCb.getCall(0).args[0]).to.eql([]);
  });

  it('Given two non-empty polls, it should emit changes from first polling', async () => {
    Z115getChangesSinceId.onCall(0).returns([fakeChange('001', 'lib1')]);
    Z115getChangesSinceId.onCall(1).returns([fakeChange('002', 'lib1')]);
    Z106getChangesSinceDate.returns({changes: [], nextCursor: null });

    await pollAction();
    await pollAction();
    expect(onChangeCb.callCount).to.equal(1);

    const emittedChanges = _.map(onChangeCb.getCall(0).args[0], change => _.pick(change, ['recordId', 'library']));
    expect(emittedChanges).to.eql([ fakeChange('001', 'lib1') ]);
  });

  it('Given two non-empty polls, it should emit changes from first polling and any changes from the second polling if it is about same record', async () => {
    Z115getChangesSinceId.onCall(0).returns([fakeChange('001', 'lib1')]);
    Z106getChangesSinceDate.onCall(0).returns({changes: [], nextCursor: null });

    Z115getChangesSinceId.onCall(1).returns([fakeChange('002', 'lib1')]);
    Z106getChangesSinceDate.onCall(1).returns({ changes: [fakeChange('001', 'lib1')], nextCursor: null});

    Z115getChangesSinceId.onCall(2).returns([]);
    Z106getChangesSinceDate.onCall(2).returns({changes: [], nextCursor: null });

    await pollAction();
    await pollAction();
    await pollAction();
    expect(onChangeCb.callCount).to.equal(2);

    const firstEmittedChanges = _.map(onChangeCb.getCall(0).args[0], change => _.pick(change, ['recordId', 'library']));
    const secondEmittedChanges = _.map(onChangeCb.getCall(1).args[0], change => _.pick(change, ['recordId', 'library']));

    expect(firstEmittedChanges).to.eql([ fakeChange('001', 'lib1') ]);
    expect(secondEmittedChanges).to.eql([ fakeChange('002', 'lib1') ]);
  });

  it('should start without cursors and log a warning when the cursor file is missing', async () => {
    const enoentError = new Error('no such file');
    enoentError.code = 'ENOENT';
    cursorFileReadError = enoentError;

    await AlephChangeListener.create(fakeConnection, options, onChangeCb);

    expect(loggerLogStub.calledWith('warn', 'Cursor file not found, starting without cursor file.')).to.be.true;
  });

  it('should start without cursors and log an error when the cursor file contains invalid JSON', async () => {
    cursorFileData = 'not json';

    await AlephChangeListener.create(fakeConnection, options, onChangeCb);

    const errorArgs = loggerLogStub.args.find(args => args[0] === 'error');
    expect(errorArgs).to.be.an('array');
    expect(errorArgs[1]).to.match(/^Failed to load cursors from file: /);
  });

  it('should use an empty queue and recover when the changes queue file is corrupt', async () => {
    queueFileReadError = new SyntaxError('invalid queue json');

    Z115getChangesSinceId.returns([]);
    Z106getChangesSinceDate.returns({changes: [], nextCursor: null });

    await pollAction();

    expect(onChangeCb.callCount).to.equal(0);
    // the recovered empty queue plus the (empty) batch from this poll
    expect(JSON.parse(writtenQueueData)).to.eql([[]]);
  });

  it('should momentize string dates in the persisted changes queue', async () => {
    changesQueueData = JSON.stringify([
      [{ recordId: '001', library: 'libA', meta: { Z106: { date: '20170523' } } }]
    ]);

    Z115getChangesSinceId.returns([]);
    Z106getChangesSinceDate.returns({changes: [], nextCursor: null });

    await pollAction();

    expect(onChangeCb.callCount).to.equal(1);
    const emittedChange = onChangeCb.getCall(0).args[0][0];
    const emittedDate = emittedChange.meta.Z106.date;
    expect(moment.isMoment(emittedDate)).to.be.true;
    // the string '20170523' is parsed as local midnight
    expect(emittedDate.format('YYYY-MM-DD HH:mm:ss')).to.equal('2017-05-23 00:00:00');
  });

  it('should complete polling without throwing when created without an onChangeCallback', async () => {
    await AlephChangeListener.create(fakeConnection, options, undefined);

    Z115getChangesSinceId.returns([]);
    Z106getChangesSinceDate.returns({changes: [], nextCursor: null });

    await pollAction();
    await pollAction();

    expect(onChangeCb.callCount).to.equal(0);
  });
});

function fakeChange(recordId, library) {
  return { recordId, library };
}