// @vitest-environment node
//
// Guardia de módulos huérfanos de la vertical de Hospitality.
//
// El cruce de las dos pilas de Hospitality dejó restos que ya nadie importaba
// —el enlace firmado del modelo de viajeros retirado, el módulo de tarifas de la
// otra implementación, el asistente de reserva que quedó sin ruta— y nada los
// señalaba: un módulo sin importadores no rompe el build ni los tipos, solo
// engorda el árbol y hace dudar de qué está vivo.
//
// La regla que se vigila aquí: **todo módulo de la vertical lo importa alguien
// que no es una prueba**. Un módulo al que solo llega su propio test es código
// muerto sostenido por su guardia (le pasó a `pricing.ts`).
//
// El alcance es la vertical (`lib/hospitality`, `lib/cron/hospitality*` y
// `components/hospitality`) y es de tolerancia cero. El resto de `lib/` y
// `components/` arrastra huérfanos de otras líneas anteriores al cruce; ampliar
// el alcance exige limpiarlos primero, no añadirlos aquí.

import { describe, it, expect } from 'vitest';
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';

const RAIZ = resolve(__dirname, '..');

/** Directorios que no aportan importadores (ni candidatos). */
const IGNORAR = new Set(['node_modules', '.next', '.git', '.turbo', 'dist', 'coverage', 'public']);
const EXTENSIONES = ['.ts', '.tsx', '.mjs', '.js', '.jsx'];

/** Módulos de la vertical que deben tener importador. */
const ALCANCE = [/^lib\/hospitality\//, /^lib\/cron\/hospitality/, /^components\/hospitality\//];

/** Un importador vale si no es una prueba: rutas, páginas y scripts son puertas de entrada. */
const esPrueba = (ruta) => ruta.startsWith('tests/') || /\.test\.[cm]?[jt]sx?$/.test(ruta);

function ficherosDe(dir, out = []) {
  for (const entrada of readdirSync(dir)) {
    if (IGNORAR.has(entrada)) continue;
    const completo = join(dir, entrada);
    if (statSync(completo).isDirectory()) ficherosDe(completo, out);
    else if (EXTENSIONES.some((e) => entrada.endsWith(e)) && !entrada.endsWith('.d.ts')) {
      out.push(completo);
    }
  }
  return out;
}

// `from '…'`, `import('…')`, `require('…')` y `vi.mock('…')`: las cuatro formas
// en que este árbol referencia un módulo.
const REFERENCIA = /(?:from\s*|import\s*\(\s*|require\s*\(\s*|vi\.mock\s*\(\s*)['"]([^'"]+)['"]/g;

/** Resuelve un especificador a un fichero del árbol (o `null` si es un paquete). */
function resolverEspecificador(especificador, desde, raiz) {
  let base;
  if (especificador.startsWith('@/')) base = join(raiz, especificador.slice(2));
  else if (especificador.startsWith('./') || especificador.startsWith('../')) {
    base = resolve(dirname(desde), especificador);
  } else return null;

  const intentos = [
    base,
    ...EXTENSIONES.map((e) => base + e),
    ...EXTENSIONES.map((e) => join(base, `index${e}`)),
  ];
  for (const intento of intentos) {
    try {
      if (statSync(intento).isFile()) return intento;
    } catch {
      /* siguiente */
    }
  }
  return null;
}

/** Mapa fichero → importadores, sobre todo el árbol. */
function mapaDeImportadores(raiz) {
  const importadores = new Map();
  for (const fichero of ficherosDe(raiz)) {
    const texto = readFileSync(fichero, 'utf8');
    REFERENCIA.lastIndex = 0;
    let coincidencia;
    while ((coincidencia = REFERENCIA.exec(texto))) {
      const destino = resolverEspecificador(coincidencia[1], fichero, raiz);
      if (!destino) continue;
      if (!importadores.has(destino)) importadores.set(destino, new Set());
      importadores.get(destino).add(fichero);
    }
  }
  return importadores;
}

const relativo = (raiz, fichero) => relative(raiz, fichero).split(sep).join('/');

/**
 * Huérfanos de la vertical: sin ningún importador, o solo con su propia prueba.
 * Devuelve rutas relativas, ordenadas.
 */
export function detectarHuerfanos(raiz, alcance = ALCANCE) {
  const importadores = mapaDeImportadores(raiz);
  const huerfanos = [];
  for (const fichero of ficherosDe(raiz)) {
    const ruta = relativo(raiz, fichero);
    if (!alcance.some((patron) => patron.test(ruta))) continue;
    if (esPrueba(ruta)) continue;
    const quien = [...(importadores.get(fichero) ?? [])]
      .map((f) => relativo(raiz, f))
      .filter((f) => f !== ruta && !esPrueba(f));
    if (quien.length === 0) huerfanos.push(ruta);
  }
  return huerfanos.sort();
}

describe('detector de módulos huérfanos', () => {
  it('señala un módulo al que no llega nadie y no toca al que sí', () => {
    const raiz = mkdtempSync(join(tmpdir(), 'huerfanos-'));
    try {
      mkdirSync(join(raiz, 'lib'), { recursive: true });
      writeFileSync(join(raiz, 'lib/con-importador.ts'), 'export const a = 1;\n');
      writeFileSync(
        join(raiz, 'lib/lo-usa.ts'),
        "import { a } from './con-importador';\nexport const b = a;\n"
      );
      writeFileSync(
        join(raiz, 'lib/lo-usa-alias.ts'),
        "import { a } from '@/lib/con-importador';\nexport const c = a;\n"
      );
      // Las puertas de entrada no son candidatas, pero sí importadores.
      mkdirSync(join(raiz, 'app'), { recursive: true });
      writeFileSync(
        join(raiz, 'app/pagina.ts'),
        "import { b } from '@/lib/lo-usa';\nimport { c } from '@/lib/lo-usa-alias';\nexport const p = b + c;\n"
      );
      // Este solo lo importa su prueba: es código muerto sostenido por su guardia.
      writeFileSync(join(raiz, 'lib/solo-su-prueba.ts'), 'export const d = 1;\n');
      writeFileSync(
        join(raiz, 'lib/nadie.ts'),
        'export function huerfano() {\n  return 1;\n}\n'
      );
      mkdirSync(join(raiz, 'tests'), { recursive: true });
      writeFileSync(
        join(raiz, 'tests/solo-su-prueba.test.ts'),
        "import { d } from '../lib/solo-su-prueba';\nexport const t = d;\n"
      );
      // Un script es puerta de entrada: lo que importe NO queda huérfano.
      mkdirSync(join(raiz, 'scripts'), { recursive: true });
      writeFileSync(join(raiz, 'lib/para-el-script.ts'), 'export const e = 1;\n');
      writeFileSync(
        join(raiz, 'scripts/backfill.ts'),
        "import { e } from '../lib/para-el-script';\nexport const s = e;\n"
      );

      const huerfanos = detectarHuerfanos(raiz, [/^lib\//]);
      expect(huerfanos).toEqual(['lib/nadie.ts', 'lib/solo-su-prueba.ts']);
    } finally {
      rmSync(raiz, { recursive: true, force: true });
    }
  });
});

describe('la vertical de Hospitality no acumula módulos huérfanos', () => {
  it('el detector ve la vertical (no pasa por vacío)', () => {
    // Si la resolución o el alcance se rompieran, la lista saldría vacía y la
    // guardia pasaría en verde sin mirar nada. Estos dos anclajes lo impiden.
    const importadores = mapaDeImportadores(RAIZ);
    const ruta = join(RAIZ, 'lib/hospitality/finance.ts');
    const quien = [...(importadores.get(ruta) ?? [])].map((f) => relativo(RAIZ, f));
    expect(quien.length).toBeGreaterThan(0);
    expect(quien.some((f) => f.startsWith('app/'))).toBe(true);
  });

  it('todo módulo de lib/hospitality, lib/cron/hospitality* y components/hospitality lo usa alguien que no es una prueba', () => {
    const huerfanos = detectarHuerfanos(RAIZ);
    expect(
      huerfanos,
      `Sin importadores (o solo con su propio test):\n  ${huerfanos.join('\n  ')}\n\n` +
        'Si el módulo murió con una pila retirada, bórralo con su prueba; si está\n' +
        'pendiente de conectar, conéctalo: un huérfano en la vertical es deuda.'
    ).toEqual([]);
  });
});
