/**
 * Copyright 2026 University Of Helsinki (The National Library Of Finland)
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
const moment = require('moment');

const Z115Listener = require('./Z115-listener');

const fakeBase = 'XXX00';

function fakeResultSet(rows) {
  let index = 0;
  return {
    getRow: sinon.stub().callsFake(async () => {
      const row = rows[index];
      index = index + 1;
      return row === undefined ? null : row;
    }),
    close: sinon.spy()
  };
}

function fakeConnection(resultSets) {
  const resultSetsQueue = Array.isArray(resultSets) ? resultSets.slice() : [resultSets];
  return {
    execute: sinon.stub().callsFake(async () => {
      const resultSet = resultSetsQueue.shift();
      if (typeof resultSet === 'function') {
        return { resultSet: resultSet() };
      }
      return { resultSet };
    })
  };
}

function fakeZ115Row(overrides) {
  return Object.assign({
    Z115_REC_KEY: '123',
    Z115_LIBRARY: 'FIN11',
    Z115_OWN: 'FIN11  ',
    Z115_STATUS: 'C',
    Z115_TODAY_DATE: 20170523,
    Z115_TODAY_TIME: '17530012  ',
    Z115_NO_LINES: 42,
    Z115_TAB: '000090001'
  }, overrides);
}

describe('Z115-Listener', () => {

  describe('parseZ115Row (via getChangesSinceId)', () => {

    it('should map all fields from a Z115 row', async () => {
      const row = fakeZ115Row({ Z115_OWN: 'FIN11  ' });
      const connection = fakeConnection([
        fakeResultSet([row]),       // getNextChangeId
        fakeResultSet([row])        // getChangesSinceId
      ]);

      const changes = await Z115Listener.getChangesSinceId(fakeBase, connection, '122');

      expect(changes).to.have.lengthOf(1);
      const change = changes[0];
      expect(change.changeId).to.equal('123');
      expect(change.library).to.equal('FIN11');
      expect(change.lowTag).to.eql(['FIN11']);
      expect(change.status).to.equal(Z115Listener.STATUS.UPDATE);
      expect(change.noLines).to.equal(42);
      expect(change.recordId).to.equal('000090001');
      expect(change.date.isSame(moment('20170523 17530012', 'YYYYMMDD HHmmssSS'))).to.be.true;
    });

    it('should map status N to LOW_ADD and D to LOW_DELETE', async () => {
      // different recordIds so that compactChanges keeps them separate
      const addRow = fakeZ115Row({ Z115_STATUS: 'N', Z115_REC_KEY: '1', Z115_TAB: '000090001' });
      const delRow = fakeZ115Row({ Z115_STATUS: 'D', Z115_REC_KEY: '2', Z115_TAB: '000090002' });
      const connection = fakeConnection([
        fakeResultSet([addRow]),
        fakeResultSet([addRow, delRow])
      ]);

      const changes = await Z115Listener.getChangesSinceId(fakeBase, connection, '0');

      expect(changes).to.have.lengthOf(2);
      expect(changes[0].status).to.equal(Z115Listener.STATUS.LOW_ADD);
      expect(changes[1].status).to.equal(Z115Listener.STATUS.LOW_DELETE);
    });

    it('should leave unknown status codes undefined', async () => {
      const row = fakeZ115Row({ Z115_STATUS: 'X' });
      const connection = fakeConnection([
        fakeResultSet([row]),
        fakeResultSet([row])
      ]);

      const changes = await Z115Listener.getChangesSinceId(fakeBase, connection, '0');

      expect(changes).to.have.lengthOf(1);
      expect(changes[0].status).to.equal(undefined);
    });

    it('should throw on incorrectly formatted date', async () => {
      const row = fakeZ115Row({ Z115_TODAY_DATE: 2017052 }); // 7 digits
      const connection = fakeConnection([
        fakeResultSet([row]),
        fakeResultSet([row])
      ]);

      let error;
      try {
        await Z115Listener.getChangesSinceId(fakeBase, connection, '0');
      } catch (e) {
        error = e;
      }

      expect(error).to.be.an.instanceOf(Error);
      expect(error.message).to.contain('Incorrect format for aleph date');
    });

    it('should throw on incorrectly formatted time', async () => {
      const row = fakeZ115Row({ Z115_TODAY_TIME: '1753  ' }); // 4 digits
      const connection = fakeConnection([
        fakeResultSet([row]),
        fakeResultSet([row])
      ]);

      let error;
      try {
        await Z115Listener.getChangesSinceId(fakeBase, connection, '0');
      } catch (e) {
        error = e;
      }

      expect(error).to.be.an.instanceOf(Error);
      expect(error.message).to.contain('Incorrect format for aleph time');
    });
  });

  describe('compactChanges (via getChangesSinceId)', () => {
    it('should merge rows with the same date and recordId and concatenate their lowTags', async () => {
      const row1 = fakeZ115Row({ Z115_OWN: 'FIN11', Z115_REC_KEY: '10' });
      const row2 = fakeZ115Row({ Z115_OWN: 'FIN11', Z115_REC_KEY: '11' });
      // both rows share the same TODAY_DATE/TODAY_TIME and Z115_TAB -> same group
      const connection = fakeConnection([
        fakeResultSet([row1]),
        fakeResultSet([row1, row2])
      ]);

      const changes = await Z115Listener.getChangesSinceId(fakeBase, connection, '0');

      expect(changes).to.have.lengthOf(1);
      expect(changes[0].lowTag).to.eql(['FIN11', 'FIN11']);
    });

    it('should keep changes with different recordIds separate', async () => {
      const row1 = fakeZ115Row({ Z115_TAB: '000090001' });
      const row2 = fakeZ115Row({ Z115_TAB: '000090002' });
      const connection = fakeConnection([
        fakeResultSet([row1]),
        fakeResultSet([row1, row2])
      ]);

      const changes = await Z115Listener.getChangesSinceId(fakeBase, connection, '0');

      expect(changes).to.have.lengthOf(2);
      expect(changes.map(c => c.recordId)).to.eql(['000090001', '000090002']);
    });

    it('should keep changes with different dates separate', async () => {
      const row1 = fakeZ115Row({ Z115_TODAY_DATE: 20170523, Z115_TODAY_TIME: '17530012  ' });
      const row2 = fakeZ115Row({ Z115_TODAY_DATE: 20170523, Z115_TODAY_TIME: '18000000  ' });
      const connection = fakeConnection([
        fakeResultSet([row1]),
        fakeResultSet([row1, row2])
      ]);

      const changes = await Z115Listener.getChangesSinceId(fakeBase, connection, '0');

      expect(changes).to.have.lengthOf(2);
    });

    it('should sort the compacted changes by date', async () => {
      const laterRow = fakeZ115Row({ Z115_TAB: '2', Z115_TODAY_DATE: 20170524 });
      const earlierRow = fakeZ115Row({ Z115_TAB: '1', Z115_TODAY_DATE: 20170523 });
      const connection = fakeConnection([
        fakeResultSet([laterRow]),
        fakeResultSet([laterRow, earlierRow])
      ]);

      const changes = await Z115Listener.getChangesSinceId(fakeBase, connection, '0');

      expect(changes.map(c => c.recordId)).to.eql(['1', '2']);
    });
  });

  describe('getChangesSinceId', () => {
    it('should return an empty list when there is no next change', async () => {
      const connection = fakeConnection([fakeResultSet([])]);

      const changes = await Z115Listener.getChangesSinceId(fakeBase, connection, '999');

      expect(changes).to.eql([]);
      expect(connection.execute.callCount).to.equal(1);
    });

    it('should return an empty list when the next change row is null', async () => {
      const connection = fakeConnection([fakeResultSet([])]);

      const changes = await Z115Listener.getChangesSinceId(fakeBase, connection, '999');

      expect(changes).to.eql([]);
    });

    it('should query for the next change id with the given sinceChangeId', async () => {
      const row = fakeZ115Row();
      const connection = fakeConnection([
        fakeResultSet([row]),
        fakeResultSet([row])
      ]);

      await Z115Listener.getChangesSinceId(fakeBase, connection, '122');

      expect(connection.execute.callCount).to.equal(2);
      const [firstSql, firstParams] = connection.execute.getCall(0).args;
      expect(firstSql).to.contain(`from ${fakeBase}.Z115`);
      expect(firstSql).to.contain('Z115_REC_KEY > :sinceChangeId');
      expect(firstParams).to.eql(['122']);

      const [secondSql, secondParams] = connection.execute.getCall(1).args;
      expect(secondSql).to.contain('Z115_REC_KEY = :nextChangeId');
      expect(secondParams).to.eql(['123']);
    });
  });

  describe('getChangesSinceDate', () => {
    it('should return an empty list when no rows match', async () => {
      const connection = fakeConnection([fakeResultSet([])]);
      const sinceDate = moment('20170523 17530012', 'YYYYMMDD HHmmssSS');

      const changes = await Z115Listener.getChangesSinceDate(fakeBase, connection, sinceDate);

      expect(changes).to.eql([]);
    });

    it('should query with the date and time formatted as YYYYMMDD and HHmmssSS', async () => {
      const row = fakeZ115Row();
      const connection = fakeConnection([fakeResultSet([row])]);
      const sinceDate = moment('20170523 17530012', 'YYYYMMDD HHmmssSS');

      const changes = await Z115Listener.getChangesSinceDate(fakeBase, connection, sinceDate);

      expect(changes).to.have.lengthOf(1);
      const [sql, params] = connection.execute.firstCall.args;
      expect(sql).to.contain('Z115_today_date >= :datevar');
      expect(sql).to.contain('z115_today_time > :timevar');
      expect(params).to.eql(['20170523', '17530012']);
    });

    it('should return compacted changes', async () => {
      const row1 = fakeZ115Row({ Z115_OWN: 'FIN11', Z115_REC_KEY: '10' });
      const row2 = fakeZ115Row({ Z115_OWN: 'FIN11', Z115_REC_KEY: '11' });
      const connection = fakeConnection([fakeResultSet([row1, row2])]);
      const sinceDate = moment('20170523 00000000', 'YYYYMMDD HHmmssSS');

      const changes = await Z115Listener.getChangesSinceDate(fakeBase, connection, sinceDate);

      expect(changes).to.have.lengthOf(1);
      expect(changes[0].lowTag).to.eql(['FIN11', 'FIN11']);
    });
  });

  describe('getDefaultCursor', () => {
    it('should return the max Z115_REC_KEY as the default cursor', async () => {
      const connection = fakeConnection([{
        getRow: sinon.stub().resolves({ CHANGEID: '999' }),
        close: sinon.spy()
      }]);

      const cursor = await Z115Listener.getDefaultCursor(fakeBase, connection);

      expect(cursor).to.equal('999');
      const [sql, params] = connection.execute.firstCall.args;
      expect(sql).to.contain('max(Z115_REC_KEY)');
      expect(params).to.eql([]);
    });

    it('should return null when the table is empty', async () => {
      const connection = fakeConnection([{
        getRow: sinon.stub().resolves({ CHANGEID: null }),
        close: sinon.spy()
      }]);

      const cursor = await Z115Listener.getDefaultCursor(fakeBase, connection);

      expect(cursor).to.equal(null);
    });
  });
});
