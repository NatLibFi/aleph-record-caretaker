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

describe('aleph-change-listener index', () => {
  // aleph-change-listener.js requires oracledb at module load; stub it in the
  // require cache so the native binding does not need to be loadable in tests.
  const oracledbPath = require.resolve('oracledb');
  const cachedOracledb = require.cache[oracledbPath];
  const oracledbStub = { id: oracledbPath, filename: oracledbPath, loaded: true, exports: {} };

  before(() => {
    require.cache[oracledbPath] = oracledbStub;
  });

  after(() => {
    if (cachedOracledb) {
      require.cache[oracledbPath] = cachedOracledb;
    } else {
      delete require.cache[oracledbPath];
    }
  });

  it('should re-export the aleph-change-listener module', () => {
    expect(require('./index')).to.equal(require('./aleph-change-listener'));
  });
});
