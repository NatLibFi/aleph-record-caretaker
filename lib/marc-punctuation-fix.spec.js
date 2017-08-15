const _ = require('lodash');
const expect = require('chai').expect;
const MarcPunctuation = require('./marc-punctuation-fix');
const RecordUtils = require('./record-utils');
const fs = require('fs');
const path = require('path');

const bibRules = MarcPunctuation.readRulesFromCSV(fs.readFileSync(path.resolve(__dirname, './bib-punctuation.csv'), 'utf8'));
const authRules =  MarcPunctuation.readRulesFromCSV(fs.readFileSync(path.resolve(__dirname, './auth-punctuation.csv'), 'utf8'));

describe('fixPunctuation', () => {

  const fixPunctuationFromBibField = MarcPunctuation.createRecordFixer(bibRules);
  const fixPunctuationFromAuthField = MarcPunctuation.createRecordFixer(authRules, MarcPunctuation.RecordTypes.AUTHORITY);

  const authorityRecordTests = [
    [
      '100 1  ‡aRosberg, Harri', 
      '100 1  ‡aRosberg, Harri'
    ],
    [
      '100 1  ‡aRosberg, H.', 
      '100 1  ‡aRosberg, H.'
    ],
    [
      '100 1  ‡aRosberg, Harri‡d1946-', 
      '100 1  ‡aRosberg, Harri,‡d1946-'
    ],
    [
      '700 1  ‡aLindstedt, Juha P.‡d1962-',
      '700 1  ‡aLindstedt, Juha P.,‡d1962-'
    ],
    [
      '100 1  ‡aRosberg, Harri‡d1946-‡0(FIN11)123', 
      '100 1  ‡aRosberg, Harri,‡d1946-‡0(FIN11)123'
    ],
    [
      '110 1  ‡aRosberg, Harri‡dabc‡0(FIN11)123', 
      '110 1  ‡aRosberg, Harri‡dabc‡0(FIN11)123'
    ],
    [
      '111 1  ‡aRosberg, Harri‡dabc‡0(FIN11)123', 
      '111 1  ‡aRosberg, Harri‡dabc‡0(FIN11)123'
    ],
  ];

  const bibRecordTests = [
    [
      '100 1  ‡aRosberg, Harri', 
      '100 1  ‡aRosberg, Harri.',
    ],
    [
      '100 1  ‡aRosas, Allan‡d1948-‡ekirjoittaja.',
      '100 1  ‡aRosas, Allan,‡d1948-‡ekirjoittaja.'
    ],
    [
      '100 1  ‡aRosas, Allan‡d1948-1998‡ekirjoittaja.',
      '100 1  ‡aRosas, Allan,‡d1948-1998,‡ekirjoittaja.'
    ],
    [
      '100 1  ‡aRonning, Mirja‡ekirjoittaja.',
      '100 1  ‡aRonning, Mirja,‡ekirjoittaja.'
    ],
    [
      '100 1  ‡aRonning, Mirja,‡ekirjoittaja.',
      '100 1  ‡aRonning, Mirja,‡ekirjoittaja.'
    ],
    [
      '100 1  ‡aRonning, Mirja.',
      '100 1  ‡aRonning, Mirja.'
    ],
    [
      '700 12 ‡aRentola, Kimmo‡d1953-‡ekirjoittaja‡tWhen to move?',
      '700 12 ‡aRentola, Kimmo,‡d1953-‡ekirjoittaja.‡tWhen to move?'
    ],
    [
      '700 1  ‡aPaavali,‡carkkipiispa‡ekääntäjä.',
      '700 1  ‡aPaavali,‡carkkipiispa,‡ekääntäjä.'
    ],
    [
      '100 1  ‡aRoberts, Charles G. D.‡d1860-1943',
      '100 1  ‡aRoberts, Charles G. D.,‡d1860-1943.'
    ],
    [
      '700 1  ‡aBelski, L. P.‡ekääntäjä.',
      '700 1  ‡aBelski, L. P.,‡ekääntäjä.'
    ],
    [
      '700 1  ‡aLindstedt, Juha P.‡d1962-',
      '700 1  ‡aLindstedt, Juha P.,‡d1962-'
    ],
    [
      '110 1  ‡aTeknillinen korkeakoulu‡bSähkömekaniikan laboratiorio',
      '110 1  ‡aTeknillinen korkeakoulu.‡bSähkömekaniikan laboratiorio.'
    ],
    [
      '110 1  ‡aTeknillinen korkeakoulu.‡bSähkömekaniikan laboratiorio',
      '110 1  ‡aTeknillinen korkeakoulu.‡bSähkömekaniikan laboratiorio.'
    ],
    [
      '100 1  ‡aRonning, Mirja,‡c(Iso)‡d1962-',
      '100 1  ‡aRonning, Mirja,‡c(Iso),‡d1962-'
    ],
    [
      '100 1  ‡aRonning, Mirja,‡c(Iso)',
      '100 1  ‡aRonning, Mirja,‡c(Iso)'
    ],
    [
      '110 2  ‡aKehitysaluerahasto‡9FENNI<KEEP>',
      '110 2  ‡aKehitysaluerahasto.‡9FENNI<KEEP>'
    ],
    [
      '110 2  ‡aKehitysaluerahasto‡0(FIN11)234897234',
      '110 2  ‡aKehitysaluerahasto.‡0(FIN11)234897234'
    ],
    [
      '100 1  ‡aRonning, Mirja‡q[Mirjami]',
      '100 1  ‡aRonning, Mirja‡q[Mirjami]'
    ],
    [
      '100 1  ‡aRonning, Mirja‡q(Mirjami)',
      '100 1  ‡aRonning, Mirja‡q(Mirjami)'
    ],
    [
      '100 1  ‡aRonning, Mirja‡q(Mirjami)‡ekirjoittaja',
      '100 1  ‡aRonning, Mirja‡q(Mirjami),‡ekirjoittaja.',
    ],
    [
      '100 12 ‡aMatti Meikäläinen‡bb-osakentt',
      '100 12 ‡aMatti Meikäläinen‡bb-osakentt.'
    ],
    [
      '100 12 ‡aMatti Meikäläinen‡cb-osakentt',
      '100 12 ‡aMatti Meikäläinen,‡cb-osakentt.'
    ],
    [
      '100 12 ‡aMatti Meikäläinen‡csub1‡esub2',
      '100 12 ‡aMatti Meikäläinen,‡csub1,‡esub2.'
    ],
    [
      '100 12 ‡aMatti Meikäläinen‡csub1',
      '100 12 ‡aMatti Meikäläinen,‡csub1.'
    ],
    [
      '100 12 ‡aMatti Meikäläinen‡csub1‡csub2',
      '100 12 ‡aMatti Meikäläinen,‡csub1,‡csub2.'
    ],
    [
      '100 12 ‡aMatti Meikäläinen,‡csub1‡csub2',
      '100 12 ‡aMatti Meikäläinen,‡csub1,‡csub2.'
    ],
    [
      '100 12 ‡aMatti Meikäläinen-‡esub1.',
      '100 12 ‡aMatti Meikäläinen-‡esub1.'
    ],
    [
      '100 12 ‡aMatti Meikäläinen‡esub1.',
      '100 12 ‡aMatti Meikäläinen,‡esub1.'
    ],
    [
      '100 12 ‡aMatti Meikäläinen,‡esäveltäjä',
      '100 12 ‡aMatti Meikäläinen,‡esäveltäjä.'
    ],
    [
      '110 12 ‡aKehitysaluerahasto‡csub1‡csub2',
      '110 12 ‡aKehitysaluerahasto,‡csub1 ;‡csub2.'
    ],
    [
      '110 12 ‡aKehitysaluerahasto‡dsub1‡csub2',
      '110 12 ‡aKehitysaluerahasto‡dsub1 :‡csub2.'
    ],
    [
      '100 12 ‡aMatti Meikäläinen‡bb-osakentt‡khöyry‡pding‡8controllia',
      '100 12 ‡aMatti Meikäläinen‡bb-osakentt.‡khöyry‡pding.‡8controllia'
    ],
    [
      '100 12 ‡aMatti Meikäläinen‡4dir',
      '100 12 ‡aMatti Meikäläinen.‡4dir'
    ],
    [
      '700 12 ‡iJulkaistu aiemmin:‡aHietamies, Laila,‡d1938-‡ekirjoittaja.‡tMyrskypilvet.',
      '700 12 ‡iJulkaistu aiemmin:‡aHietamies, Laila,‡d1938-‡ekirjoittaja.‡tMyrskypilvet.'
    ],
    [
      '600 14 ‡aHämäläinen, Helvi‡d1907-1998‡xhenkilöhistoria.',
      '600 14 ‡aHämäläinen, Helvi,‡d1907-1998‡xhenkilöhistoria.'
    ],
    [
      '700 1  ‡aTopelius, Zacharias‡d1818-1898‡tLjungblommor.‡nI‡f1845.',
      '700 1  ‡aTopelius, Zacharias,‡d1818-1898.‡tLjungblommor.‡nI.‡f1845.'
    ],
    [
      '700 1  ‡aTopelius, Zacharias‡d1818-1898,',
      '700 1  ‡aTopelius, Zacharias,‡d1818-1898,'
    ]
  ];

  describe('for authority records', () => {

    authorityRecordTests.forEach(testCase => {
      const [from, to, options] = testCase;
      
      let testDescriptionFn = options && _.includes(options, '!') ? it.only : it;

      testDescriptionFn(`should convert ${from} to ${to}`, () => {
        const field = RecordUtils.stringToField(from);
        fixPunctuationFromAuthField(field);
        expect(RecordUtils.fieldToString(field)).to.equal(to);
      });
    });
  });

  describe('for bibliographic records', () => {

    bibRecordTests.forEach(testCase => {
      const [from, to, options] = testCase;
      let testDescriptionFn = options && _.includes(options, '!') ? it.only : it;

      testDescriptionFn(`should convert ${from} to ${to}`, () => {
        const field = RecordUtils.stringToField(from);
        fixPunctuationFromBibField(field);
        expect(RecordUtils.fieldToString(field)).to.equal(to);
      });
    });
  });

});
