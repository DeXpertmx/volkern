#!/usr/bin/env node
/**
 * Sincroniza el plugin local de ESLint (`eslint-rules/`) a `node_modules/eslint-plugin-eslint-rules/`
 * tras cualquier `yarn install` o `npm install` (incluyendo el install de Vercel).
 *
 * Por qué existe: `eslint-rules/no-hardcoded-currency-fallback` es una regla
 * custom que vive en el repo. El `.eslintrc.json` la referencia por nombre
 * (`eslint-rules`), pero el resolver de ESLint solo busca plugins en
 * `node_modules/`. Sin este hook postinstall, el plugin desaparecería de Vercel.
 *
 * Idempotente: si los archivos ya están al día, no hace nada.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'eslint-rules');
const DST = path.join(ROOT, 'node_modules', 'eslint-plugin-eslint-rules');

const FILES = ['package.json', 'index.js', 'no-hardcoded-currency-fallback.js'];

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function copyIfChanged(src, dst) {
  if (!fs.existsSync(src)) return false;
  let changed = false;
  for (const f of FILES) {
    const a = path.join(src, f);
    const b = path.join(dst, f);
    if (!fs.existsSync(a)) continue;
    const aBuf = fs.readFileSync(a);
    let bBuf = null;
    if (fs.existsSync(b)) bBuf = fs.readFileSync(b);
    if (!bBuf || !bBuf.equals(aBuf)) {
      fs.writeFileSync(b, aBuf);
      changed = true;
    }
  }
  return changed;
}

try {
  if (!fs.existsSync(SRC)) {
    console.warn('[eslint-local-rules] Origen no existe:', SRC);
    process.exit(0);
  }
  ensureDir(DST);
  const changed = copyIfChanged(SRC, DST);
  if (changed) {
    console.log('[eslint-local-rules] Plugin sincronizado →', DST);
  } else {
    console.log('[eslint-local-rules] Plugin al día.');
  }
} catch (err) {
  console.error('[eslint-local-rules] Error:', err.message);
  // No rompemos el install: este paso es defensivo, no crítico.
  process.exit(0);
}
