/**
 * Plugin ESLint local de Volkern.
 *
 * Convención de carga: ESLint v8 resuelve plugins por nombre (e.g. "eslint-rules")
 * usando node-style resolution. Aquí exportamos el manifest `{ rules, configs }`
 * con la(s) regla(s) custom del proyecto.
 */
'use strict';

module.exports = {
  meta: { name: 'eslint-plugin-eslint-rules', version: '1.0.0' },
  rules: {
    'no-hardcoded-currency-fallback': require('./no-hardcoded-currency-fallback.js'),
  },
  configs: {
    recommended: {
      plugins: ['eslint-rules'],
      rules: {
        'eslint-rules/no-hardcoded-currency-fallback': 'error',
      },
    },
  },
};
