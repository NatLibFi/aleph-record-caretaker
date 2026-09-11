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
const _ = require('lodash');
const expect = require('chai').expect;
const sinon = require('sinon');
let sandbox = require('sinon').createSandbox();
const moment = require('moment');
const fs = require('fs');

const Z106Listener = require('./Z106-listener');

const fakeChanges = [
  {
    Z106_REC_KEY: '008050956',
    Z106_SECONDARY_KEY: 'CHANGE-1',
    Z106_CATALOGER: 'FIX-LINK  ',
    Z106_LEVEL: '30',
    Z106_UPDATE_DATE: '20170523',
    Z106_LIBRARY: 'FIN01',
    Z106_TIME: 1753
  },
  {
    Z106_REC_KEY: '008050956',
    Z106_SECONDARY_KEY: 'CHANGE-2',
    Z106_CATALOGER: 'FIX-LINK  ',
    Z106_LEVEL: '30',
    Z106_UPDATE_DATE: '20170523',
    Z106_LIBRARY: 'FIN01',
    Z106_TIME: 1754
  },
  {
    Z106_REC_KEY: '008050957',
    Z106_SECONDARY_KEY: 'CHANGE-3',
    Z106_CATALOGER: 'FIX-LINK  ',
    Z106_LEVEL: '30',
    Z106_UPDATE_DATE: '20170523',
    Z106_LIBRARY: 'FIN01',
    Z106_TIME: 1754
  },
  {
    Z106_REC_KEY: '008050957',
    Z106_SECONDARY_KEY: 'CHANGE-4',
    Z106_CATALOGER: 'FIX-LINK  ',
    Z106_LEVEL: '30',
    Z106_UPDATE_DATE: '20170523',
    Z106_LIBRARY: 'FIN01',
    Z106_TIME: 1754
  },
  {
    Z106_REC_KEY: '008050933',
    Z106_SECONDARY_KEY: 'CHANGE-5',
    Z106_CATALOGER: 'FIX-LINK  ',
    Z106_LEVEL: '30',
    Z106_UPDATE_DATE: '20170523',
    Z106_LIBRARY: 'FIN01',
    Z106_TIME: 1754
  },
];


describe('Z106-Listener', () => {

  let fakeBase = 'XXX01';
  let fakeConnection;
  let getRowStub;
  let fakeDate;

  let z106Listener;

  let readFileSyncStub;
  let writeFileStub;

  beforeEach(() => {
    readFileSyncStub = sandbox.stub(fs, 'readFileSync').callsFake(() => '[]');
    writeFileStub = sandbox.stub(fs, 'writeFile').callsFake((file, data, encoding, callback) => callback(null));

    fakeConnection = {
      execute: sinon.stub()
    };

    z106Listener = Z106Listener.create(fakeBase);

    fakeDate = moment();

    getRowStub = sinon.stub();

    fakeConnection.execute.resolves({
      resultSet: {
        getRow: getRowStub,
        close: sinon.spy()
      }
    });
  });
  afterEach(() => {
    sandbox.restore();
  });

  it('should return list of changes', async () => {
    getRowStub.onCall(0).resolves(fakeChanges[0]);
    getRowStub.onCall(1).resolves(null);
    getRowStub.onCall(2).resolves(null);

    const {changes} = await z106Listener.getChangesSinceDate(fakeConnection, fakeDate);
    expect(changes.length).to.equal(1);
  });

  it('should filter out changes that have already been given', async () => {
    getRowStub.onCall(0).resolves(fakeChanges[0]);
    getRowStub.onCall(1).resolves(fakeChanges[1]);
    getRowStub.onCall(2).resolves(null);
    getRowStub.onCall(3).resolves(null);

    getRowStub.onCall(4).resolves(fakeChanges[1]);
    getRowStub.onCall(5).resolves(fakeChanges[2]);
    getRowStub.onCall(6).resolves(fakeChanges[3]);
    getRowStub.onCall(7).resolves(null);
    getRowStub.onCall(8).resolves(null);

    const changesAfterFirstRequest = await z106Listener.getChangesSinceDate(fakeConnection, fakeDate);
    expect(_.map(changesAfterFirstRequest.changes, 'secondaryKey')).to.eql(['CHANGE-1', 'CHANGE-2']);

    const changesAfterSecondRequest = await z106Listener.getChangesSinceDate(fakeConnection, fakeDate);
    expect(_.map(changesAfterSecondRequest.changes, 'secondaryKey')).to.eql(['CHANGE-3', 'CHANGE-4']);
  });

  it('should pad a four character Z106_TIME to eight characters when parsing the date', async () => {
    getRowStub.onCall(0).resolves({ ...fakeChanges[0], Z106_TIME: 1753 });
    getRowStub.onCall(1).resolves(null);
    getRowStub.onCall(2).resolves(null);

    const {changes} = await z106Listener.getChangesSinceDate(fakeConnection, fakeDate);
    expect(changes.length).to.equal(1);
    expect(changes[0].date.isSame(moment('20170523 17530000', 'YYYYMMDD HHmmssSS'))).to.be.true;
  });

  it('should parse a four character Z106_TIME with leading zero', async () => {
    getRowStub.onCall(0).resolves({ ...fakeChanges[0], Z106_TIME: 5 });
    getRowStub.onCall(1).resolves(null);
    getRowStub.onCall(2).resolves(null);

    const {changes} = await z106Listener.getChangesSinceDate(fakeConnection, fakeDate);
    expect(changes.length).to.equal(1);
    expect(changes[0].date.isSame(moment('20170523 00050000', 'YYYYMMDD HHmmssSS'))).to.be.true;
  });

  it('should trim the cataloger and default the count to 1 when COUNT is missing', async () => {
    getRowStub.onCall(0).resolves({ ...fakeChanges[0], Z106_CATALOGER: '  FIX-LINK  ' });
    getRowStub.onCall(1).resolves(null);
    getRowStub.onCall(2).resolves(null);

    const {changes} = await z106Listener.getChangesSinceDate(fakeConnection, fakeDate);
    expect(changes[0].user).to.equal('FIX-LINK');
    expect(changes[0].count).to.equal(1);
  });

  it('should use the COUNT column value when present', async () => {
    getRowStub.onCall(0).resolves({ ...fakeChanges[0], COUNT: 5 });
    getRowStub.onCall(1).resolves(null);
    getRowStub.onCall(2).resolves(null);

    const {changes} = await z106Listener.getChangesSinceDate(fakeConnection, fakeDate);
    expect(changes[0].count).to.equal(5);
  });

  it('should return the current time as the default cursor when the table is empty', async () => {
    getRowStub.onCall(0).resolves(null);

    const cursor = await z106Listener.getDefaultCursor(fakeConnection);
    expect(moment(cursor).isSame(moment.now(), 'second')).to.be.true;
  });

  it('should delegate to getChangesSinceDate and return its nextCursor when the table has rows', async () => {
    getRowStub.onCall(0).resolves(fakeChanges[0]);
    getRowStub.onCall(1).resolves(fakeChanges[0]);
    getRowStub.onCall(2).resolves(null);
    getRowStub.onCall(3).resolves(null);

    const cursor = await z106Listener.getDefaultCursor(fakeConnection);
    expect(cursor.isSame(moment('20170523 17530000', 'YYYYMMDD HHmmssSS'))).to.be.true;
  });

  it('should reject when writing the persisted changes fails', async () => {
    writeFileStub.resetBehavior();
    writeFileStub.yields(new Error('write failed'));
    getRowStub.onCall(0).resolves(fakeChanges[0]);
    getRowStub.onCall(1).resolves(null);
    getRowStub.onCall(2).resolves(null);

    let caughtError;
    try {
      await z106Listener.getChangesSinceDate(fakeConnection, fakeDate);
    } catch (error) {
      caughtError = error;
    }
    expect(caughtError).to.be.an.instanceOf(Error);
    expect(caughtError.message).to.equal('write failed');
  });

  it('should treat a corrupt stash file as an empty list of already passed changes', async () => {
    readFileSyncStub.resetBehavior();
    readFileSyncStub.returns('not json');
    const listener = Z106Listener.create(fakeBase);

    getRowStub.onCall(0).resolves(fakeChanges[0]);
    getRowStub.onCall(1).resolves(null);
    getRowStub.onCall(2).resolves(null);

    const {changes} = await listener.getChangesSinceDate(fakeConnection, fakeDate);
    expect(changes.length).to.equal(1);
  });
});
