/**
 * Vendored from @natlibfi/melinda-marc-record-utils v1.2.1 (LGPL-3.0+).
 * Upstream: git@github.com:natlibfi/melinda-marc-record-utils.git
 *
 * Only the slice of the upstream API used by aleph-record-caretaker is
 * vendored (Punctuation, AuthorizedPortion and the field string helpers
 * the vendored regression tests need). See the license notices in the
 * individual files.
 */
const Punctuation = require('./punctuation');
const AuthorizedPortion = require('./authorized-portion');
const fieldToString = require('./field-to-string');
const stringToField = require('./string-to-field');

module.exports = {
	Punctuation,
	AuthorizedPortion,
	fieldToString,
	stringToField
};
