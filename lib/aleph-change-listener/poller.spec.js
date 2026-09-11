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
const expect = require('chai').expect;
const sinon = require('sinon');
const proxyquire = require('proxyquire');

const sandbox = sinon.createSandbox();

describe('Poller', () => {
  const INTERVAL = 1000;
  let fakeTimers;
  let Poller;

  beforeEach(() => {
    // poller.js does: const debug = require('debug')('...'); debug('...')
    Poller = proxyquire('./poller', { debug: sinon.stub().returns(sinon.stub()) });
    fakeTimers = sandbox.useFakeTimers();
  });

  afterEach(() => {
    fakeTimers.restore();
    sandbox.restore();
  });

  it('start() invokes fn immediately and re-schedules after the interval', async () => {
    const fn = sinon.stub().resolves();
    const poller = Poller.create(INTERVAL, fn);
    await poller.start();
    expect(fn.callCount).to.equal(1);
    // Nothing should happen before the interval elapses
    await fakeTimers.tickAsync(INTERVAL - 1);
    expect(fn.callCount).to.equal(1);
    await fakeTimers.tickAsync(1);
    expect(fn.callCount).to.equal(2);
    await poller.stop();
  });

  it('stop() cancels the pending timeout so fn is not called again', async () => {
    const fn = sinon.stub().resolves();
    const poller = Poller.create(INTERVAL, fn);
    await poller.start();
    expect(fn.callCount).to.equal(1);
    await poller.stop();
    await fakeTimers.tickAsync(INTERVAL * 10);
    expect(fn.callCount).to.equal(1);
  });

  it('stop() awaits an in-flight fn', async () => {
    let resolveFn;
    const inFlight = new Promise(resolve => { resolveFn = resolve; });
    const fn = sinon.stub().returns(inFlight);
    let stopped = false;
    const poller = Poller.create(INTERVAL, fn);
    // poll() runs synchronously until it awaits fn, so currentAction is set
    poller.start();
    const stopping = poller.stop();
    stopping.then(() => { stopped = true; });
    // stop() must not resolve while fn is still pending
    await Promise.resolve();
    expect(stopped).to.equal(false);
    resolveFn();
    await stopping;
    expect(stopped).to.equal(true);
    // After stop, fn must not be called again (isRunning is false)
    await fakeTimers.tickAsync(INTERVAL * 10);
    expect(fn.callCount).to.equal(1);
  });

  it('does not overlap polls while a previous fn is still pending', async () => {
    const fn = sinon.stub().resolves();
    const poller = Poller.create(INTERVAL, fn);
    await poller.start();
    expect(fn.callCount).to.equal(1);
    // Make the second poll's fn pending and let the scheduled poll start
    let resolveNext;
    fn.onSecondCall().returns(new Promise(resolve => { resolveNext = resolve; }));
    await fakeTimers.tickAsync(INTERVAL);
    expect(fn.callCount).to.equal(2);
    // While fn is pending, advancing many intervals triggers no further polls
    await fakeTimers.tickAsync(INTERVAL * 10);
    expect(fn.callCount).to.equal(2);
    // Once fn resolves, exactly one scheduled poll fires
    resolveNext();
    await fakeTimers.tickAsync(INTERVAL);
    expect(fn.callCount).to.equal(3);
    await poller.stop();
  });
});
