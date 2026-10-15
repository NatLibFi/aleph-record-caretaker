/**
 *
 * Vendored from @natlibfi/melinda-marc-record-utils v1.2.1 (LGPL-3.0+).
 * Upstream: git@github.com:natlibfi/melinda-marc-record-utils.git
 *
*
* @licstart  The following is the entire license notice for the JavaScript code in this file.
*
* Utility functions for dealing with MARC records
*
* Copyright (C) 2018-2019 University Of Helsinki (The National Library Of Finland)
*
* This file is part of melinda-marc-record-utils
*
* melinda-marc-record-utils is free software: you can redistribute it and/or modify
* it under the terms of the GNU Lesser General Public License as published by
* the Free Software Foundation, either version 3 of the License, or
* (at your option) any later version.
*
* melinda-marc-record-utils is distributed in the hope that it will be useful,
* but WITHOUT ANY WARRANTY; without even the implied warranty of
* MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
* GNU Lesser General Public License for more details.
*
* You should have received a copy of the GNU Lesser General Public License
* along with this program.  If not, see <http://www.gnu.org/licenses/>.
*
* @licend  The above is the entire license notice
* for the JavaScript code in this file.
*
*/
const dropWhile = require('lodash/dropWhile');
const includes = require('lodash/includes');
const find = require('lodash/find');
const isEqual = require('lodash/isEqual');

function isTitlePortionSubfield(field, subfield) {
	const subfieldsAfterT = dropWhile(field.subfields, sub => sub.code !== 't');
	if (!find(subfieldsAfterT, afterT => isEqual(afterT, subfield))) {
		return false;
	}

	switch (field.tag) {
		case '100': return includes(['f', 'g', 'h', 'k', 'l', 'm', 'o', 'r', 's', 't', 'v', 'x', 'y', 'z', 'p', 't', 'd', 'g', 'n'], subfield.code);
		case '600': return includes(['f', 'g', 'h', 'k', 'l', 'm', 'o', 'r', 's', 't', 'v', 'x', 'y', 'z', 'p', 't', 'd', 'g', 'n'], subfield.code);
		case '700': return includes(['f', 'g', 'h', 'k', 'l', 'm', 'o', 'r', 's', 't', 'v', 'x', 'y', 'z', 'p', 't', 'd', 'g', 'n'], subfield.code);
		case '800': return includes(['f', 'g', 'h', 'k', 'l', 'm', 'o', 'r', 's', 't', 'v', 'x', 'y', 'z', 'p', 't', 'd', 'g', 'n'], subfield.code);

		case '110': return includes(['f', 'k', 'l', 'p', 't', 'd', 'g', 'n'], subfield.code);
		case '610': return includes(['f', 'h', 'k', 'l', 'm', 'o', 'p', 'r', 's', 't', 'd', 'g', 'n'], subfield.code);
		case '710': return includes(['f', 'h', 'k', 'l', 'm', 'o', 'p', 'r', 's', 't', 'd', 'g', 'n'], subfield.code);
		case '810': return includes(['f', 'h', 'k', 'l', 'm', 'o', 'p', 'r', 's', 't', 'd', 'g', 'n'], subfield.code);

		case '111': return includes(['f', 'k', 'l', 'p', 't', 'g', 'n'], subfield.code);
		case '611': return includes(['f', 'h', 'k', 'l', 'p', 's', 't', 'g', 'n'], subfield.code);
		case '711': return includes(['f', 'h', 'k', 'l', 'p', 's', 't', 'g', 'n'], subfield.code);
		case '811': return includes(['f', 'h', 'k', 'l', 'p', 's', 't', 'g', 'n'], subfield.code);

		default: return false;
	}
}

module.exports = isTitlePortionSubfield;
