import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, dirname, posix } from 'node:path';

/**
 * Guardia de bundle: ningún archivo 'use client' puede acabar arrastrando
 * Prisma (ni `server-only`) al bundle del navegador.
 *
 * Caso real (25 sep 2026): el panel entero reventaba en el navegador con
 *
 *   Error: Extensions.defineExtension is unable to run in this browser
 *   environment, or has been bundled for the browser
 *
 * seguido del error de hidratación de React #423. La causa no era Prisma:
 * eran dos imports que metían `lib/db.ts` —que construye el cliente Prisma y
 * llama a `$extends` al evaluarse— dentro del bundle del cliente.
 *
 *   1. `components/dashboard/MorningBriefingModal.tsx` importaba la INTERFAZ
 *      `BriefingData` sin la palabra `type`. TypeScript la elide, pero el
 *      bundler (SWC, un archivo a la vez) no puede saber que es un tipo y se
 *      lleva el módulo entero: `lib/sales/morning-briefing-service.ts` →
 *      Prisma. Como el modal cuelga de `components/dashboard-layout.tsx`,
 *      afectaba a TODAS las páginas del panel.
 *   2. `app/dashboard/hospitality/reservas/page.tsx` importaba la etiqueta
 *      `ETIQUETA_FIANZA` desde `lib/hospitality/fianza.ts`, que abre la BD. Un
 *      literal de UI obligaba a cargar Prisma en el navegador.
 *
 * Esta guardia recorre el grafo de imports REAL (resolviendo `@/…` y rutas
 * relativas, e ignorando los imports de tipo, que sí se eliden) desde cada
 * archivo 'use client' y falla si alguno alcanza un módulo que importa Prisma.
 *
 * Cómo arreglarlo cuando salte:
 *   - Si solo necesitas un tipo: escribe `import type { … }`.
 *   - Si solo necesitas literales/etiquetas: muévelos a un módulo puro sin BD
 *     (ej. `lib/hospitality/fianza-estados.ts`) y reexporta desde el de
 *     servidor para no cambiar la superficie pública.
 *   - Si solo necesitas datos: hazlo por `fetch` a una ruta de API, o pásalos
 *     como props desde un Server Component.
 */

// ── Paquetes prohibidos en el bundle del cliente ────────────────────────────
/** Paquetes npm que solo existen en el servidor: si llegan al cliente, revientan. */
const FORBIDDEN_PACKAGES = new Set([
  '@prisma/client',
  'prisma',
  '@prisma/adapter-pg',
  '@prisma/driver-adapter-utils',
  'server-only',
  'next/headers',
  'next/server',
  'next/cache',
]);

/**
 * Builtins de Node que nunca se polyfillean para el navegador. Se excluyen a
 * propósito los que Next sí aporta al cliente (path, util, stream, buffer,
 * events…): mejor quedarse corto que convertir la guardia en ruido. El prefijo
 * `node:` cubre el resto sin mantener una lista.
 */
const FORBIDDEN_BUILTINS = new Set([
  'node:fs',
  'node:fs/promises',
  'node:child_process',
  'node:net',
  'node:tls',
  'node:dgram',
  'node:cluster',
  'node:worker_threads',
  'node:async_hooks',
  'node:vm',
  'node:readline',
  'node:perf_hooks',
  'node:v8',
  'node:inspector',
  'node:repl',
  'node:module',
]);

/** ¿El paquete es de servidor y no puede acabar en el bundle del navegador? */
export function esSoloServidor(pkg: string): boolean {
  if (FORBIDDEN_PACKAGES.has(pkg)) return true;
  if (FORBIDDEN_BUILTINS.has(pkg)) return true;
  if (pkg.startsWith('node:')) return true;
  // Builtins sin prefijo. `fs/promises` se normaliza a `fs/promises` en pkgOf.
  if (['fs', 'child_process', 'net', 'tls', 'dgram', 'cluster', 'async_hooks', 'vm', 'readline', 'perf_hooks', 'v8'].includes(pkg)) return true;
  if (pkg.startsWith('fs/')) return true;
  return false;
}

// ── Utilidades de archivo ───────────────────────────────────────────────────

const SKIP_DIRS = new Set([
  'node_modules',
  '.next',
  '.git',
  '.turbo',
  'coverage',
  'dist',
  'app-movil',
  'mcp-server',
  'gemma-app',
  'public',
]);

/** Raíz de la app Next (funciona con cwd = nextjs_space o cwd = raíz del repo). */
function findAppRoot(): string | null {
  for (const base of [process.cwd(), join(process.cwd(), 'nextjs_space')]) {
    try {
      if (statSync(join(base, 'app')).isDirectory() && statSync(join(base, 'lib')).isDirectory()) {
        return base;
      }
    } catch {
      // candidato no aplicable
    }
  }
  return null;
}

function walkFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) walkFiles(full, out);
    else if (/\.(ts|tsx|mts|cts)$/.test(entry) && !entry.endsWith('.d.ts')) out.push(full);
  }
  return out;
}

/**
 * Quita comentarios antes de buscar imports. Sin esto, un comentario que
 * mencione `import … from '…'` inventa una arista falsa y la guardia se vuelve
 * un generador de ruido (pasó al escribir la primera versión de este test).
 * El `//` de `https://…` se respeta (va precedido de `:`).
 */
export function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:\\])\/\/[^\n]*/g, '$1');
}

/**
 * Especificadores de módulo que se evalúan al cargar el archivo, es decir los
 * que de verdad acaban en el bundle. Los `import type` y los `import()` dentro
 * de funciones quedan fuera: los primeros los elimina el compilador y los
 * segundos se cargan en diferido.
 */
export function extractSpecifiers(rawSrc: string): string[] {
  const src = stripComments(rawSrc);
  const specs: string[] = [];

  // `import X from 'y'` | `import { a, type B } from 'y'` | `export * from 'y'`
  // Anclado a principio de línea y sin `type` delante del binding completo.
  const fromRe = /^[ \t]*(?:import|export)\s+(type\s+)?[\s\S]*?\sfrom\s*['"]([^'"]+)['"]/gm;
  for (const m of src.matchAll(fromRe)) {
    const spec = m[2];
    // `import type { A } from 'x'` / `import type A from 'x'` → elidido, no cuenta.
    if (m[1]) continue;
    // `import { type A, type B } from 'x'` → solo tipos, elidido.
    const binding = m[0].replace(/^[ \t]*(?:import|export)\s+/, '').replace(/\sfrom[\s\S]*$/, '');
    if (/^\s*\{/.test(binding)) {
      const inside = binding.slice(binding.indexOf('{') + 1, binding.lastIndexOf('}'));
      const parts = inside.split(',').map((p) => p.trim()).filter(Boolean);
      if (parts.length > 0 && parts.every((p) => /^type\s/.test(p))) continue;
    }
    specs.push(spec);
  }

  // `import 'x'` (import por efecto secundario)
  const bareRe = /^[ \t]*import\s*['"]([^'"]+)['"]/gm;
  for (const m of src.matchAll(bareRe)) specs.push(m[1]);

  return specs;
}

export function isClientSource(src: string): boolean {
  return /^[ \t]*(?:\/\/[^\n]*\n|\s)*['"]use client['"]/m.test(src.slice(0, 3000));
}

export interface Fuga {
  /** Archivo 'use client' por el que entra la fuga. */
  origen: string;
  /** Cadena de imports hasta el módulo prohibido (origen → … → culpable). */
  cadena: string[];
}

interface Info {
  src: string;
  client: boolean;
  /** Aristas resueltas a otros archivos del proyecto. */
  to: string[];
  /** Paquetes npm importados. */
  bare: Set<string>;
}

/** Analiza un mapa de archivos (rutas con `/`, relativas a la raíz de la app). */
export function analizarClientes(archivos: Map<string, string>): Fuga[] {
  const info = new Map<string, Info>();

  const resolve = (spec: string, from: string): string | null => {
    let base: string | null = null;
    if (spec.startsWith('@/')) base = spec.slice(2);
    else if (spec.startsWith('./') || spec.startsWith('../')) base = posix.join(posix.dirname(from), spec);
    if (base === null) return null;
    for (const cand of [base + '.ts', base + '.tsx', base + '.mts', base + '.cts', base + '/index.ts', base + '/index.tsx']) {
      if (archivos.has(cand)) return cand;
    }
    return null;
  };

  for (const [f, src] of archivos) {
    const to: string[] = [];
    const bare = new Set<string>();
    for (const spec of extractSpecifiers(src)) {
      const target = resolve(spec, f);
      if (target) to.push(target);
      else if (!spec.startsWith('.') && !spec.startsWith('@/')) {
        const segs = spec.split('/');
        bare.add(segs.slice(0, spec.startsWith('@') ? Math.min(2, segs.length) : 1).join('/'));
      }
    }
    info.set(f, { src, client: isClientSource(src), to, bare });
  }

  // Módulos culpables: importan un paquete prohibido.
  const culpables = new Set<string>();
  for (const [f, i] of info) {
    for (const b of i.bare) {
      if (esSoloServidor(b)) {
        culpables.add(f);
        break;
      }
    }
  }
  if (culpables.size === 0) return [];

  // BFS desde cada raíz cliente hasta el módulo culpable más cercano.
  const fugas: Fuga[] = [];
  for (const [root, i] of info) {
    if (!i.client) continue;
    const prev = new Map<string, string | null>([[root, null]]);
    const queue = [root];
    let encontrado: string | null = null;
    while (queue.length > 0 && !encontrado) {
      const actual = queue.shift() as string;
      if (culpables.has(actual)) {
        encontrado = actual;
        break;
      }
      for (const t of info.get(actual)?.to ?? []) {
        if (!prev.has(t)) {
          prev.set(t, actual);
          queue.push(t);
        }
      }
    }
    // Una raíz cliente que sea ella misma culpable también cuenta.
    if (!encontrado && culpables.has(root)) encontrado = root;
    if (encontrado) {
      const cadena: string[] = [];
      for (let n: string | null = encontrado; n !== null; n = prev.get(n) ?? null) cadena.unshift(n);
      fugas.push({ origen: root, cadena });
    }
  }
  return fugas;
}

function collectProjectSources(appRoot: string): Map<string, string> {
  const archivos = new Map<string, string>();
  for (const file of walkFiles(appRoot)) {
    const rel = relative(appRoot, file).split('\\').join('/');
    if (rel.includes('node_modules')) continue;
    if (/\.(test|spec)\.tsx?$/.test(rel)) continue;
    if (rel.startsWith('tests/')) continue;
    try {
      archivos.set(rel, readFileSync(file, 'utf8'));
    } catch {
      // archivo ilegible: se ignora
    }
  }
  return archivos;
}

// ─── Guardia ─────────────────────────────────────────────────────────────────

describe('Guardia de bundle: el cliente no arrastra código de servidor', () => {
  it('ningún archivo "use client" alcanza transitivamente Prisma, server-only ni builtins de Node', () => {
    const appRoot = findAppRoot();
    expect(appRoot, 'No se encontró la raíz de la app Next (app/ + lib/)').not.toBeNull();

    const archivos = collectProjectSources(appRoot as string);
    const fugas = analizarClientes(archivos);

    const detalle = fugas.flatMap((f) => [
      `- ${f.origen}`,
      ...f.cadena.map((paso, idx) => `    ${'  '.repeat(idx)}→ ${paso}`),
    ]);

    expect(fugas.map((f) => f.origen), [
      'Archivos \'use client\' que acaban cargando código de servidor en el navegador:',
      'Eso rompe la hidratación: Prisma construye el cliente y llama a $extends al evaluarse,',
      'y el navegador lanza «Extensions.defineExtension is unable to run in this browser',
      'environment» seguido del error de hidratación #423 de React (caso real del 25 sep 2026).',
      '',
      'Cómo arreglarlo:',
      '  · Solo necesitas un tipo  → `import type { … }` (sin `type`, el bundler no lo elide).',
      '  · Solo necesitas literales → muévelos a un módulo puro sin BD y reexporta desde el de servidor.',
      '  · Solo necesitas datos    → fetch a una ruta de API o props desde un Server Component.',
      '',
      ...detalle,
    ].join('\n')).toEqual([]);
  });

  it('el detector reconoce el anti-patrón histórico (self-test)', () => {
    const archivos = new Map<string, string>([
      // Caso 1: interfaz importada sin `type` → arrastra el servicio y lib/db.
      [
        'components/dashboard/MorningBriefingModal.tsx',
        `'use client';\nimport { BriefingData } from '@/lib/sales/morning-briefing-service';\nexport function M() { return null; }\n`,
      ],
      ['lib/sales/morning-briefing-service.ts', `import { prisma } from '@/lib/db';\nexport interface BriefingData { x: number }\n`],
      [`lib/db.ts`, `import { PrismaClient } from '@prisma/client'\nexport const prisma = new PrismaClient().$extends({})\n`],
      // Caso 2: etiqueta de UI que obliga a cargar el módulo con BD.
      [
        'app/dashboard/hospitality/reservas/page.tsx',
        `'use client';\nimport { ETIQUETA_FIANZA } from '@/lib/hospitality/fianza';\nexport default function P() { return ETIQUETA_FIANZA.pendiente; }\n`,
      ],
      ['lib/hospitality/fianza.ts', `import { prisma } from '@/lib/db';\nexport const ETIQUETA_FIANZA = { pendiente: 'x' };\n`],
      // Control: el mismo import con `type` y el módulo puro NO deben marcar fuga.
      ['components/BienImportado.tsx', `'use client';\nimport type { BriefingData } from '@/lib/sales/morning-briefing-service';\nexport const B = (_: BriefingData) => null;\n`],
      ['components/EtiquetaPura.tsx', `'use client';\nimport { ETIQUETA_FIANZA } from '@/lib/hospitality/fianza-estados';\nexport default function E() { return ETIQUETA_FIANZA.pendiente; }\n`],
      ['lib/hospitality/fianza-estados.ts', `export const ETIQUETA_FIANZA = { pendiente: 'x' };\n`],
    ]);

    const fugas = analizarClientes(archivos);
    const origenes = fugas.map((f) => f.origen).sort();

    expect(origenes).toEqual([
      'app/dashboard/hospitality/reservas/page.tsx',
      'components/dashboard/MorningBriefingModal.tsx',
    ]);
    expect(origenes).not.toContain('components/BienImportado.tsx');
    expect(origenes).not.toContain('components/EtiquetaPura.tsx');
    // Y la lista de prohibidos reconoce también builtins de Node y módulos de Next.
    expect(esSoloServidor('fs')).toBe(true);
    expect(esSoloServidor('node:fs/promises')).toBe(true);
    expect(esSoloServidor('next/headers')).toBe(true);
    expect(esSoloServidor('server-only')).toBe(true);
    expect(esSoloServidor('date-fns')).toBe(false);
    expect(esSoloServidor('react')).toBe(false);
    // La cadena debe señalar el módulo violador (el que importa @prisma/client),
    // no solo la víctima: es lo que hace útil el mensaje de fallo.
    const modal = fugas.find((f) => f.origen === 'components/dashboard/MorningBriefingModal.tsx');
    expect(modal?.cadena).toEqual([
      'components/dashboard/MorningBriefingModal.tsx',
      'lib/sales/morning-briefing-service.ts',
      'lib/db.ts',
    ]);
    const reservas = fugas.find((f) => f.origen === 'app/dashboard/hospitality/reservas/page.tsx');
    expect(reservas?.cadena).toEqual([
      'app/dashboard/hospitality/reservas/page.tsx',
      'lib/hospitality/fianza.ts',
      'lib/db.ts',
    ]);
  });

  it('los comentarios no inventan imports (self-test del stripper)', () => {
    const src = [
      "'use client';",
      '// comentario: el import que da problemas es import { X } from "@/lib/db";',
      '/* bloque: import { Y } from "@/lib/db"; */',
      "const url = 'https://ejemplo.test/ruta';",
      "import { real } from '@/lib/otro';",
    ].join('\n');
    expect(extractSpecifiers(src)).toEqual(['@/lib/otro']);
    expect(stripComments(src)).toContain('https://ejemplo.test/ruta');
  });
});
