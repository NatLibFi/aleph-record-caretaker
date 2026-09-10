const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
      },
    },
    rules: {
      'no-console': 'warn',
      'eqeqeq': ['error', 'always'],
      'no-const-assign': 'error',
      'max-depth': ['warn', 4],
      'max-lines': ['warn', 500],
      'max-lines-per-function': ['warn', { max: 100 }],
      'no-else-return': ['error', { allowElseIf: false }],
      'no-plusplus': ['error', { allowForLoopAfterthoughts: true }],
      'array-callback-return': ['error', { checkForEach: false }],
      'no-unused-vars': ['error', { argsIgnorePattern: 'next' }],
      'no-warning-comments': 'off',
    },
  },
  {
    // Mocha spec files
    files: ['**/*.spec.js'],
    languageOptions: {
      globals: {
        ...globals.mocha,
      },
    },
  },
  {
    ignores: [
      'node_modules/**',
      'lib/aleph-change-listener/node_modules/**',
      'lib/test-fixtures/**',
    ],
  },
];
