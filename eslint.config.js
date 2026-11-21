import js from '@eslint/js';
import globals from 'globals';

export default [
  {
    ignores: [
      'dist/**',
      'repo/**',
      'public/shared/**',
      'src/vendor/**',
      'test-results/**',
      'playwright-report/**',
    ],
  },
  js.configs.recommended,
  {
    files: ['src/**/*.js'],
    languageOptions: { globals: { ...globals.browser, ...globals.worker } },
  },
  { files: ['*.{js,mjs}'], languageOptions: { globals: globals.node } },
  // Browser callbacks in these Node programs also reference DOM globals.
  {
    files: ['tests/**/*.{js,mjs}', 'scripts/**/*.mjs'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
  {
    rules: {
      'no-duplicate-imports': 'error',
      eqeqeq: ['error', 'smart'],
      'no-eval': 'error',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
];
