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
const utils = require('./utils');

describe('utils', () => {
  const fakePatch = { prev: [], next: [] };
  const fakeLibrary = 'FIN01';

  describe('RecentChangesManager', () => {
    it('should return false if the change is first one', () => {
      let fakeRecordId = '1';
      const mgr = utils.RecentChangesManager(1000);
      const wasRecentlyChanged = mgr.checkAndUpdateRecentChanges(fakeLibrary, fakeRecordId, fakePatch);

      expect(wasRecentlyChanged).to.be.false;
    });

    it('should return true if the same change as just made', () => {
      let fakeRecordId = '1';
      const mgr = utils.RecentChangesManager(1000);
      mgr.checkAndUpdateRecentChanges(fakeLibrary, fakeRecordId, fakePatch);
      const wasRecentlyChanged = mgr.checkAndUpdateRecentChanges(fakeLibrary, fakeRecordId, fakePatch);

      expect(wasRecentlyChanged).to.be.true;
    });

    it('should return false for changes that are older than cooldown', () => {
      let fakeRecordId = '1';
      const mgr = utils.RecentChangesManager(1000);
      const timeAtFirstChange = 0;
      const timeAtSecondChange = 1500;
      mgr.checkAndUpdateRecentChanges(fakeLibrary, fakeRecordId, fakePatch, timeAtFirstChange);
      const wasRecentlyChanged = mgr.checkAndUpdateRecentChanges(fakeLibrary, fakeRecordId, fakePatch, timeAtSecondChange);

      expect(wasRecentlyChanged).to.be.false;
    });

    it('should purge entries older than the cooldown', () => {
      const mgr = utils.RecentChangesManager(1000);
      mgr.checkAndUpdateRecentChanges(fakeLibrary, '1', fakePatch, 0);
      expect(mgr.getEntryCount()).to.equal(1);

      // at t=2000 the t=0 entry is older than cooldown and gets purged,
      // then a fresh entry for t=2000 is stored
      mgr.checkAndUpdateRecentChanges(fakeLibrary, '1', fakePatch, 2000);
      expect(mgr.getEntryCount()).to.equal(1);

      // at t=3200 the t=2000 entry is purged and replaced
      mgr.checkAndUpdateRecentChanges(fakeLibrary, '2', {prev: ['a'], next: ['b']}, 3200);
      expect(mgr.getEntryCount()).to.equal(1);
    });

    it('should treat the same record with a different patch as a new change', () => {
      const mgr = utils.RecentChangesManager(1000);
      mgr.checkAndUpdateRecentChanges(fakeLibrary, '1', { prev: ['a'], next: ['b'] });
      const wasRecentlyChanged = mgr.checkAndUpdateRecentChanges(fakeLibrary, '1', { prev: ['a'], next: ['c'] });

      expect(wasRecentlyChanged).to.be.false;
      expect(mgr.getEntryCount()).to.equal(2);
    });
  });

  describe('readEnvironmentVariable', () => {
    const ENV_NAME = 'TEST_UTILS_SPEC_VAR';
    let logStub;
    let errorStub;

    beforeEach(() => {
      delete process.env[ENV_NAME];
      logStub = sinon.stub(console, 'log');
      errorStub = sinon.stub(console, 'error');
    });

    afterEach(() => {
      sinon.restore();
      delete process.env[ENV_NAME];
    });

    it('should return the environment variable when set', () => {
      process.env[ENV_NAME] = 'custom-value';

      expect(utils.readEnvironmentVariable(ENV_NAME, 'default-value')).to.equal('custom-value');
      expect(logStub.callCount).to.equal(0);
    });

    it('should return the default value when the variable is not set', () => {
      expect(utils.readEnvironmentVariable(ENV_NAME, 'default-value')).to.equal('default-value');
      expect(logStub.calledOnce).to.be.true;
      expect(logStub.firstCall.args[0]).to.contain(`No environment variable set for ${ENV_NAME}`);
    });

    it('should throw when a mandatory variable is missing', () => {
      expect(() => utils.readEnvironmentVariable(ENV_NAME)).to.throw(`Mandatory environment variable missing: ${ENV_NAME}`);
      expect(errorStub.calledOnce).to.be.true;
    });

    it('should hide the default value when hideDefaultValue is set', () => {
      expect(utils.readEnvironmentVariable(ENV_NAME, 'secret-password', { hideDefaultValue: true })).to.equal('secret-password');
      expect(logStub.firstCall.args[0]).to.contain('[hidden]');
      expect(logStub.firstCall.args[0]).to.not.contain('secret-password');
    });
  });

  describe('readArrayEnvironmentVariable', () => {
    const ENV_NAME = 'TEST_UTILS_SPEC_ARRAY_VAR';

    afterEach(() => {
      delete process.env[ENV_NAME];
    });

    it('should return the default array when the variable is not set', () => {
      const defaults = ['A', 'B'];

      expect(utils.readArrayEnvironmentVariable(ENV_NAME, defaults)).to.eql(defaults);
    });

    it('should split the variable value on pipe', () => {
      process.env[ENV_NAME] = 'FIN01|FIN10|FIN11';

      expect(utils.readArrayEnvironmentVariable(ENV_NAME, ['DEFAULT'])).to.eql(['FIN01', 'FIN10', 'FIN11']);
    });
  });

  describe('deepDiff', () => {
    it('should find items only present in each collection', () => {
      const a = [{ x: 1 }, { x: 2 }];
      const b = [{ x: 2 }, { x: 3 }];

      const { a: onlyInA, b: onlyInB } = utils.deepDiff(a, b);

      expect(onlyInA).to.eql([{ x: 1 }]);
      expect(onlyInB).to.eql([{ x: 3 }]);
    });

    it('should return empty diffs for identical collections', () => {
      const a = [{ x: 1 }, { x: 2 }];
      const b = [{ x: 2 }, { x: 1 }];

      const { a: onlyInA, b: onlyInB } = utils.deepDiff(a, b);

      expect(onlyInA).to.eql([]);
      expect(onlyInB).to.eql([]);
    });
  });

  describe('serial', () => {
    it('should run the functions in order and concatenate their results', async () => {
      const calls = [];
      const funcs = [
        () => { calls.push(1); return Promise.resolve(['a']); },
        () => { calls.push(2); return Promise.resolve(['b', 'c']); },
        () => { calls.push(3); return Promise.resolve([]); }
      ];

      const result = await utils.serial(funcs);

      expect(result).to.eql(['a', 'b', 'c']);
      expect(calls).to.eql([1, 2, 3]);
    });

    it('should resolve to an empty list when there are no functions', async () => {
      expect(await utils.serial([])).to.eql([]);
    });

    it('should reject when one of the functions rejects', async () => {
      const pro = utils.serial([
        () => Promise.resolve(['a']),
        () => Promise.reject(new Error('boom'))
      ]);

      let error;
      try {
        await pro;
      } catch (e) {
        error = e;
      }

      expect(error).to.be.an.instanceOf(Error);
      expect(error.message).to.equal('boom');
    });
  });

  describe('accumulate', () => {
    it('should call the function only after the given number of calls', () => {
      const fn = sinon.spy();
      const accumulator = utils.accumulate(3, fn);

      accumulator();
      expect(fn.callCount).to.equal(0);
      accumulator();
      expect(fn.callCount).to.equal(0);
      accumulator();
      expect(fn.callCount).to.equal(1);

      // count resets after firing
      accumulator();
      expect(fn.callCount).to.equal(1);
    });

    it('should reset the counter', () => {
      const fn = sinon.spy();
      const accumulator = utils.accumulate(2, fn);

      accumulator();
      accumulator.reset();
      accumulator();
      expect(fn.callCount).to.equal(0);
      accumulator();
      expect(fn.callCount).to.equal(1);
    });

    it('should call the function with the given context', () => {
      const ctx = { value: 'ctx-value' };
      let seenThis;
      const accumulator = utils.accumulate(1, function() { seenThis = this.value; }, ctx);

      accumulator();

      expect(seenThis).to.equal('ctx-value');
    });
  });

  describe('parseTime', () => {
    it('should convert hour:minute to minutes since midnight', () => {
      expect(utils.parseTime('00:00')).to.equal(0);
      expect(utils.parseTime('21:55')).to.equal(1315);
      expect(utils.parseTime('24:00')).to.equal(1440);
    });
  });

  describe('parseTimeRanges', () => {
    it('should parse multiple comma-separated ranges', () => {
      const ranges = utils.parseTimeRanges('00:00-21:55, 22:30-24:00');

      expect(ranges).to.eql([
        { from: 0, to: 1315 },
        { from: 1350, to: 1440 }
      ]);
    });

    it('should parse a single range', () => {
      expect(utils.parseTimeRanges('09:00-17:00')).to.eql([{ from: 540, to: 1020 }]);
    });
  });

  describe('getCurrentTime', () => {
    let clock;

    afterEach(() => {
      if (clock) {
        clock.restore();
      }
    });

    it('should return the current local time in hour:minute format', () => {
      const frozenTime = new Date(2026, 0, 15, 13, 45); // local time
      clock = sinon.useFakeTimers({ now: frozenTime.getTime(), toFake: ['Date'] });

      const time = utils.getCurrentTime();

      expect(time).to.equal('13:45');
      expect(time).to.match(/^([01]?\d|2[0-3]):[0-5]\d$/);
    });
  });

  describe('chunkWith', () => {
    it('should group similar consecutive items into chunks', () => {
      const sameGroup = (item, candidate) => Math.floor(item / 10) === Math.floor(candidate / 10);

      const chunks = utils.chunkWith([1, 2, 10, 11, 20], sameGroup);

      expect(chunks).to.eql([
        [1, 2],
        [10, 11],
        [20]
      ]);
    });

    it('should put every item in its own chunk when nothing is similar', () => {
      const chunks = utils.chunkWith(['a', 'b', 'c'], () => false);

      expect(chunks).to.eql([['a'], ['b'], ['c']]);
    });
  });

  describe('randomString', () => {
    it('should return a non-empty hexadecimal string', () => {
      const result = utils.randomString();

      expect(result).to.be.a('string');
      expect(result).to.match(/^[0-9a-f]+$/);
    });
  });

  describe('decorateConnectionWithDebug', () => {
    let logStub;

    beforeEach(() => {
      logStub = sinon.stub(console, 'log');
    });

    afterEach(() => {
      sinon.restore();
    });

    it('should wrap execute so that SQL is logged and the original execute is called with the same arguments', async () => {
      const actualExecute = sinon.stub().resolves('result');
      const connection = { execute: actualExecute };

      utils.decorateConnectionWithDebug(connection);
      const result = await connection.execute('select * from Z115', ['param1']);

      expect(result).to.equal('result');
      expect(actualExecute.calledOnce).to.be.true;
      expect(actualExecute.firstCall.args).to.eql(['select * from Z115', ['param1']]);
      expect(logStub.calledOnce).to.be.true;
      expect(logStub.firstCall.args).to.eql(['DEBUG-SQL', `'select * from Z115'`, ['param1']]);
    });
  });
});
