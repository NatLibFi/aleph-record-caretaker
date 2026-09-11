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
/**
 * Single source of truth for the authority record link ("‡0 subfield") grammar.
 *
 * A bib or authority record may link to an authority record in three forms:
 *  - ISIL namespace form:  (FI-ASTERI-N)90001        - baseMap key
 *  - plain Aleph base:     (FIN11)90001              - baseMap value, resolved back to the key
 *  - URN:                  http://urn.fi/URN:NBN:fi:au:cn:90001 (also zero-padded to 9 digits)
 * The plain base and ISIL forms may carry a trailing ',' or '.' in practice.
 *
 * Both record sync modules (auth-record-sync and bib-record-sync) use this module
 * to parse links and to build the field matchers / queries used to find links.
 */
const _ = require('lodash');
const utils = require('./utils');

// Inverts a { key: value } map into { value: key } (like _.invert, but keeps the
// first entry on collisions instead of the last).
function buildReverseBaseMap(baseMap) {
  return Object.keys(baseMap).reduce((acc, key) => _.set(acc, baseMap[key], key), {});
}

/**
 * Parses a ‡0 subfield value into { base, recordId }, where `base` is always a
 * baseMap key (namespace identifier), so that baseMap[link.base] yields the
 * Aleph base to load the record from.
 *
 * params:
 *   link: the raw ‡0 subfield value
 *   options: { baseMap, urnBaseMap, urnResolverPrefix }
 * throws on multiple (base)id pairs, unmapped URNs, url values or other invalid formats.
 */
function parseAuthorityRecordLink(link, options) {
  const reverseBaseMap = buildReverseBaseMap(options.baseMap);
  const reverseUrnBaseMap = buildReverseBaseMap(options.urnBaseMap);

  const pairs = link.match(/\([^)]*\)\d+[,.]?/g);
  if (pairs && pairs.length > 1) {
    throw new Error(`Subfield 0 contains multiple (base)id pairs: ${link}`);
  }
  const match = /^\((.+?)\)(\d+)([,.]?)$/.exec(link);
  if (match) {
    const [, base, recordId] = match;
    // The base may be either a namespace identifier (baseMap key, e.g. FI-ASTERI-N)
    // or a plain Aleph base (baseMap value, e.g. FIN11). Resolve the latter to the
    // baseMap key, so that baseMap[link.base] works for both forms.
    if (options.baseMap[base] === undefined) {
      const key = reverseBaseMap[base];
      if (typeof key !== 'undefined' && key !== null) {
        return { base: key, recordId };
      }
    }
    return { base, recordId };
  }

  // TODO: handle non-numeric recordIds
  const urnRegexp = RegExp('^' + options.urnResolverPrefix + '(.*:)(.*)$');
  const urn = urnRegexp.exec(link);
  if (urn) {
    const [, prefix, id] = urn;
    const urnBase = reverseUrnBaseMap[prefix];
    if (typeof urnBase !== 'undefined' && urnBase !== null) {
      // Resolve the Aleph base back to the baseMap key (namespace identifier),
      // so that both parse branches return a key usable as baseMap[link.base].
      const base = reverseBaseMap[urnBase];
      if (typeof base !== 'undefined' && base !== null) {
        return { base, recordId: id };
      }
      throw new Error(`URN maps to Aleph base ${urnBase} which has no baseMap key: ${link}`);
    }
    throw new Error(`Found non-mapped URN in: ${link}. ${prefix}  ${id} ${urnBase}`);
  }

  if (/^http:\/\//.exec(link)) {
    throw new Error(`Invalid format (url) in subfield 0: ${link}. Not matching known URN pattern: ${options.urnResolverPrefix}`);
  }
  throw new Error(`Invalid format in subfield 0: ${link}`);
}

// Plain base form of an authority link, e.g. (FIN11)90001.
function createPlainBaseQuery(change) {
  return `(${change.library})${change.recordId}`;
}

// URN form of an authority link, e.g. http://urn.fi/URN:NBN:fi:au:cn:000090001.
// Record ids may appear both unpadded and zero-padded to 9 digits.
function createUrnQuery(change, options, { padded = false } = {}) {
  const recordId = padded ? utils.padMelindaId(change.recordId) : change.recordId;
  return `${options.urnResolverPrefix}${options.urnBaseMap[change.library]}${recordId}`;
}

function createUrnQueryPadded(change, options) {
  return createUrnQuery(change, options, { padded: true });
}

// All link forms that may appear in a ‡0 subfield referring to the changed
// authority record (ISIL namespace, plain Aleph base, URN unpadded, URN padded).
function createLinkQueries(change, options) {
  const reverseBaseMap = buildReverseBaseMap(options.baseMap);
  return [
    `(${reverseBaseMap[change.library]})${change.recordId}`,
    createPlainBaseQuery(change),
    createUrnQuery(change, options),
    createUrnQueryPadded(change, options)
  ];
}

// A subfield value matches if it equals the query, or the query with a
// trailing ',' or '.' appended (trailing punctuation occurs in practice).
function hasSubfield(code, value) {
  return (field) => {
    return field.subfields.some(s => s.code === code && (s.value === value || s.value === value + ',' || s.value === value + '.'));
  };
}

// Returns a predicate matching a field that contains a ‡0 subfield linking to
// the changed authority record in any supported form.
function createFieldMatcher(change, options) {
  const queries = createLinkQueries(change, options);
  return (field) => queries.some(query => hasSubfield('0', query)(field));
}

module.exports = {
  buildReverseBaseMap,
  parseAuthorityRecordLink,
  createPlainBaseQuery,
  createUrnQuery,
  createUrnQueryPadded,
  createLinkQueries,
  createFieldMatcher
};
