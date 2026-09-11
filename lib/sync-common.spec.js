/**
 * Copyright 2017-2019, 2026 University Of Helsinki (The National Library Of Finland)
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
const syncCommon = require('./sync-common');

describe('sync-common', () => {
  describe('RECENT_CHANGE_COOLDOWN_MS', () => {
    it('should be 20000 ms', () => {
      expect(syncCommon.RECENT_CHANGE_COOLDOWN_MS).to.equal(20000);
    });
  });

  describe('createDefaultLogger', () => {
    it('should return a logger that writes through the debug function with level prefix', () => {
      const debug = sinon.stub();
      const logger = syncCommon.createDefaultLogger(debug);

      logger.log('info', 'hello');

      expect(debug.calledOnce).to.be.true;
      expect(debug.firstCall.args[0]).to.equal('info: hello');
    });
  });

  describe('recordChanged', () => {
    const original = {
      leader: '00000nam a2200000 i 4500',
      fields: [{ tag: '100', ind1: ' ', ind2: ' ', subfields: [{ code: 'a', value: 'Aakkula, Immo.' }] }]
    };

    it('should return false for an identical record', () => {
      const fixed = {
        leader: original.leader,
        fields: JSON.parse(JSON.stringify(original.fields))
      };
      expect(syncCommon.recordChanged(original, fixed)).to.be.false;
    });

    it('should return true when the fields differ', () => {
      const fixed = {
        leader: original.leader,
        fields: [{ tag: '100', ind1: ' ', ind2: ' ', subfields: [{ code: 'a', value: 'Aakkula, Immo,' }, { code: 'e', value: 'testaaja.' }] }]
      };
      expect(syncCommon.recordChanged(original, fixed)).to.be.true;
    });

    it('should return true when the leader differs', () => {
      const fixed = {
        leader: original.leader.substring(0, 5) + 'd' + original.leader.substring(6),
        fields: JSON.parse(JSON.stringify(original.fields))
      };
      expect(syncCommon.recordChanged(original, fixed)).to.be.true;
    });
  });

  describe('createPatch', () => {
    const field1 = { tag: '100', ind1: ' ', ind2: ' ', subfields: [{ code: 'a', value: 'Aakkula, Immo.' }] };
    const field2 = { tag: '700', ind1: ' ', ind2: ' ', subfields: [{ code: 'a', value: 'Aakkula, Immo.' }] };
    const field3 = { tag: '200', ind1: '1', ind2: ' ', subfields: [{ code: 'a', value: 'Content.' }] };

    it('should return empty patches for identical field arrays', () => {
      const patch = syncCommon.createPatch([field1, field2], [field1, field2]);
      expect(patch.prev).to.eql([]);
      expect(patch.next).to.eql([]);
    });

    it('should contain removed fields in prev and added fields in next', () => {
      const patch = syncCommon.createPatch([field1, field2], [field2, field3]);
      expect(patch.prev).to.eql([
        '100    ‡aAakkula, Immo.'
      ]);
      expect(patch.next).to.eql([
        '200 1  ‡aContent.'
      ]);
    });
  });

  describe('logPatch', () => {
    it('should log previous and next values with changeId, base and recordId', () => {
      const logger = { log: sinon.stub() };
      const patch = { prev: ['prev1'], next: ['next1'] };

      syncCommon.logPatch(logger, 'abc', 'FIN11', '90001', patch);

      expect(logger.log.callCount).to.equal(2);
      expect(logger.log.firstCall.args).to.eql(['info', '[abc] FIN11 / 90001 Previous values: prev1']);
      expect(logger.log.secondCall.args).to.eql(['info', '[abc] FIN11 / 90001 Next values: next1']);
    });
  });
});
