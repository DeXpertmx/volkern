/**
 * Tests Vitest para la regla `no-hardcoded-currency-fallback`.
 *
 * Cubre:
 *   • Válidos: usar tenant.moneda / snapshot.tenantMoneda / prop explícita /
 *     `formatCurrency(value)` sin 2º arg o con `currency` del tenant.
 *   • Inválidos: 4 patrones de fallback hardcode ('MXN' como default param,
 *     en `??`, en `||`, en ternario).
 *   • JSXAttribute con value="MXN" no debe flagear (caso legítimo para Select).
 *   • Property estático `currency: 'MXN'` no debe flagear (config inmutable).
 *   • Template literal con `MXN` substring (no completo) no debe flagear.
 */
'use strict';

const { RuleTester } = require('eslint');
const rule = require('../no-hardcoded-currency-fallback.js');

// Usamos parser TS para soportar sintaxis con anotaciones (Number, string, : X = 'MXN').
// eslint-plugin-local-rules/project: parser local; si no está disponible cae a acorn.
let parser;
try {
  parser = require.resolve('@typescript-eslint/parser');
} catch (_) {
  parser = undefined;
}

const ruleTester = new RuleTester(
  parser
    ? {
        parser: require('@typescript-eslint/parser'),
        parserOptions: {
          ecmaVersion: 2022,
          sourceType: 'module',
          ecmaFeatures: { jsx: true },
        },
      }
    : {
        parserOptions: {
          ecmaVersion: 2022,
          sourceType: 'module',
          ecmaFeatures: { jsx: true },
        },
      }
);

ruleTester.run('no-hardcoded-currency-fallback', rule, {
  valid: [
    // Default param con moneda del tenant via undefined.
    'function f(x = tenant.moneda) {}',
    // Default param omitido completamente.
    'function f(x) {}',
    // Default param sin literal MXN: usa símbolo/constante.
    'function f(x = DEFAULT_MONEDA) {}',
    // Nullish coalescing con `tenant.moneda` (sin 'MXN' literal).
    "const m = tenant?.moneda ?? '?';",
    // Logical OR con default legítimo desde constantes del módulo.
    'const m = tenant?.moneda || process.env.DEFAULT_MONEDA;',
    // Ternario donde ninguna rama es 'MXN' literal.
    "const m = cond ? tenant.moneda : 'USD';",
    // Currency pasada por prop explícita.
    'function Card({ currency, value }) { return format(value, currency); }',
    // Currency desde snapshot.
    'const m = snapshot?.tenantMoneda ?? undefined;',
    // CURRENCY_CONSTANTS importado (default legítimo).
    'const m = CURRENCY_CONSTANTS.DEFAULT_TENANT_CURRENCY;',
    // JSX select con value="MXN" como opción visible al usuario (legítimo).
    '<SelectItem value="MXN">MXN ($)</SelectItem>',
    // Currency literal distinto a MXN en cualquier contexto.
    "function f(x = 'EUR') {} const m = x ?? 'USD'; cond ? 'USD' : 'EUR'",
    // Property estático currency: 'MXN' (configuración inmutable, no es fallback).
    "const config = { currency: 'MXN', rate: 1.0 };",
    // Template literal donde MXN aparece embebido pero NO como literal puro.
    'const s = `moneda: ${tenant.moneda}`;',
    // String 'MXN' dentro de una narrativa / comentario no es nodo Literal.
    "const doc = 'En México se usa MXN como default histórico.';",
    // Default param con CurrencyType usando el símbolo CURRENCY_CONSTANTS.DEFAULT_TENANT_CURRENCY.
    'function format(value, cur = CURRENCY_CONSTANTS.DEFAULT_TENANT_CURRENCY) {}',
  ],

  invalid: [
    // Default param con 'MXN' literal — versión JS puro.
    {
      code: 'function formatCurrency(value, currency = \'MXN\') {}',
      errors: [{ messageId: 'hardcodedMxn' }],
    },
    {
      code: 'function formatCurrencyExact(value, currency = \'MXN\') {}',
      errors: [{ messageId: 'hardcodedMxn' }],
    },
    // Nullish coalescing: `x ?? 'MXN'`.
    {
      code: 'const m = snapshot?.tenantMoneda ?? \'MXN\';',
      errors: [{ messageId: 'hardcodedMxn' }],
    },
    {
      code: 'const m = tenant?.moneda ?? \'MXN\';',
      errors: [{ messageId: 'hardcodedMxn' }],
    },
    // Logical OR: `x || 'MXN'`.
    {
      code: 'const m = snapshot?.tenantMoneda || \'MXN\';',
      errors: [{ messageId: 'hardcodedMxn' }],
    },
    {
      code: 'const m = tenant?.moneda || \'MXN\';',
      errors: [{ messageId: 'hardcodedMxn' }],
    },
    // Ternario con 'MXN' como consequent.
    {
      code: 'const m = useEur ? snapshot.tenantMoneda : \'MXN\';',
      errors: [{ messageId: 'hardcodedMxn' }],
    },
    // Ternario con 'MXN' como alternate.
    {
      code: 'const m = hasTenant ? tenant.moneda : \'MXN\';',
      errors: [{ messageId: 'hardcodedMxn' }],
    },
    // Múltiples violaciones en un mismo file.
    {
      code: [
        'function format(value, currency = \'MXN\') {}',
        'const m = tenant?.moneda ?? \'MXN\';',
        'const n = other || \'MXN\';',
        'const s = cond ? \'MXN\' : other;',
        'const t = cond2 ? a : \'MXN\';',
      ].join('\n'),
      errors: [
        { messageId: 'hardcodedMxn' },
        { messageId: 'hardcodedMxn' },
        { messageId: 'hardcodedMxn' },
        { messageId: 'hardcodedMxn' },
        { messageId: 'hardcodedMxn' },
      ],
    },
  ],
});

console.log('✅ All RuleTester tests for no-hardcoded-currency-fallback passed.');
