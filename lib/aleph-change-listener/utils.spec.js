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

const utils = require('./utils');

describe('aleph-change-listener/utils', () => {

  describe('readAllRows', () => {

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

    it('should read all rows until the result set is exhausted', async () => {
      const row1 = { Z115_REC_KEY: '1' };
      const row2 = { Z115_REC_KEY: '2' };
      const resultSet = fakeResultSet([row1, row2]);

      const rows = await utils.readAllRows(resultSet);

      expect(rows).to.eql([row1, row2]);
      expect(resultSet.getRow.callCount).to.equal(3);
    });

    it('should return an empty array for an empty result set', async () => {
      const resultSet = fakeResultSet([]);

      const rows = await utils.readAllRows(resultSet);

      expect(rows).to.eql([]);
      expect(resultSet.getRow.callCount).to.equal(1);
    });

    it('should stop when getRow returns undefined', async () => {
      const resultSet = {
        getRow: sinon.stub().onCall(0).resolves({ a: 1 }).onCall(1).resolves(undefined),
        close: sinon.spy()
      };

      const rows = await utils.readAllRows(resultSet);

      expect(rows).to.eql([{ a: 1 }]);
    });

    it('should stop when getRow returns a falsy value', async () => {
      const resultSet = {
        getRow: sinon.stub().onCall(0).resolves({ a: 1 }).onCall(1).resolves(false),
        close: sinon.spy()
      };

      const rows = await utils.readAllRows(resultSet);

      expect(rows).to.eql([{ a: 1 }]);
    });

    it('should close the result set when done', async () => {
      const resultSet = fakeResultSet([{ a: 1 }]);

      await utils.readAllRows(resultSet);

      expect(resultSet.close.calledOnce).to.be.true;
    });

    it('should append rows to the rows array given as second argument', async () => {
      const existing = { existing: true };
      const resultSet = fakeResultSet([{ a: 1 }]);

      const rows = await utils.readAllRows(resultSet, [existing]);

      expect(rows).to.eql([existing, { a: 1 }]);
    });

    it('should return the same array instance that was given as second argument', async () => {
      const resultSet = fakeResultSet([]);

      const rows = await utils.readAllRows(resultSet);

      expect(Array.isArray(rows)).to.be.true;
    });
  });

  describe('parseDate', () => {

    it('should parse a valid date number and time string into a moment', () => {
      const result = utils.parseDate(20170523, '17530012');

      expect(result.isValid()).to.be.true;
      expect(result.isSame(moment('20170523 17530012', 'YYYYMMDD HHmmssSS'))).to.be.true;
    });

    it('should parse a date given as a string', () => {
      const result = utils.parseDate('20170523', '17530012');

      expect(result.isSame(moment('20170523 17530012', 'YYYYMMDD HHmmssSS'))).to.be.true;
    });

    it('should trim surrounding whitespace from the time string', () => {
      const result = utils.parseDate(20170523, '  17530012  ');

      expect(result.isSame(moment('20170523 17530012', 'YYYYMMDD HHmmssSS'))).to.be.true;
    });

    it('should throw on a date that is not 8 characters', () => {
      expect(() => utils.parseDate(201705, '17530012')).to.throw('Incorrect format for aleph date');
    });

    it('should throw on a time that is not 8 characters', () => {
      expect(() => utils.parseDate(20170523, '175300')).to.throw('Incorrect format for aleph time');
    });
  });
});
