import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * Guardia de integración: páginas 'use client' con catálogos locales vacíos.
 *
 * Contexto: en app/dashboard/integraciones/webhooks-salientes/page.tsx existía
 *   const getAvailableEvents: any = () => [];   // stub local
 * que ocultaba TODOS los eventos de la UI: el catálogo real vive en un módulo
 * server-only (lib/outgoing-webhooks.ts → prisma), no se podía importar desde el
 * cliente, y alguien lo "taponó" con una función local que devuelve [].
 *
 * Resultado: la pantalla se renderizaba sin opciones y nadie se enteraba.
 * Esta guardia falla si un archivo 'use client' declara localmente una función
 * con nombre de catálogo (getAvailableX, XOptions, XList, XCatalogo…) cuyo cuerpo
 * devuelve un array vacío, o si redeclara un catálogo que ya se exporta en lib/.
 */

// Nombres que delatan un catálogo de opciones: el identificador TERMINA en uno de
// estos sufijos (getAvailableEvents, getOpciones, getLista, getScopes…).
// Evita falsos positivos de helpers genéricos como getTotal() o getBackHref().
const CATALOG_SUFFIX_RE =
  /(?:Available|Options|Opciones|List|Lista|Catalogo|Catalog|Tipos|Types|Eventos|Events|Scopes|Canales|Channels|Acciones|Actions|Fuentes|Planos|Paises|Monedas|Servicios|Webhooks|Plantillas|Templates|Campos|Roles|Permisos|Usuarios|Categorias|Categories|Estados|Integraciones|Modulos|Productos)$/;

// Declaraciones de función que devuelven un array literal vacío.
// Cubre: const X = () => [] | const X: any = () => [] | const X = () => { return []; }
//        (multilínea acotada: parámetros y cuerpo cercanos)
const ARROW_EMPTY_RE =
  /(?:const|let)\s+([A-Za-z_$][\w$]*)\s*(?::\s*[^=;\n]+?)?\s*=\s*\([\s\S]{0,120}?\)\s*=>\s*(?:\[\s*\]|\[\s*\]\s+as\s+[\w<>[\] ]+|\(\s*\[\s*\]\s*\)|\{\s*return\s*\[\s*\]\s*;?\s*\})/g;
const FN_EMPTY_RE =
  /function\s+([A-Za-z_$][\w$]*)\s*\([\s\S]{0,120}?\)\s*\{\s*return\s*\[\s*\]\s*;?\s*\}/g;

// ── Utilidades de archivo ────────────────────────────────────────────────────

function findUIRoots(): string[] {
  const roots: string[] = [];
  const candidates = [process.cwd(), join(process.cwd(), 'nextjs_space')];
  for (const base of candidates) {
    for (const r of ['app', 'components']) {
      try {
        const p = join(base, r);
        if (statSync(p).isDirectory()) roots.push(p);
      } catch {
        // ignorar
      }
    }
  }
  return roots;
}

function walkFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      walkFiles(full, out);
    } else if (entry.endsWith('.tsx') || entry.endsWith('.ts')) {
      out.push(full);
    }
  }
  return out;
}

function isClientFile(content: string): boolean {
  return /['"]use client['"]/.test(content.slice(0, 400));
}

function lineOf(content: string, index: number): number {
  return content.slice(0, index).split('\n').length;
}

function isCatalogName(name: string): boolean {
  return CATALOG_SUFFIX_RE.test(name);
}

interface Hit {
  file: string;
  line: number;
  name: string;
}

/** Stubs de catálogo vacíos en archivos 'use client'. */
function collectEmptyCatalogStubs(): Hit[] {
  const hits: Hit[] = [];
  for (const root of findUIRoots()) {
    for (const file of walkFiles(root)) {
      const rel = relative(process.cwd(), file);
      if (rel.includes('node_modules') || rel.includes('.test.') || rel.includes('.spec.')) continue;
      const content = readFileSync(file, 'utf8');
      if (!isClientFile(content)) continue;

      ARROW_EMPTY_RE.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = ARROW_EMPTY_RE.exec(content)) !== null) {
        if (isCatalogName(m[1])) {
          hits.push({ file: rel, line: lineOf(content, m.index), name: m[1] });
        }
      }
      FN_EMPTY_RE.lastIndex = 0;
      while ((m = FN_EMPTY_RE.exec(content)) !== null) {
        if (isCatalogName(m[1])) {
          hits.push({ file: rel, line: lineOf(content, m.index), name: m[1] });
        }
      }
    }
  }
  return hits;
}

/** Nombres de catálogos exportados por lib/ (para detectar sombreado). */
function collectLibCatalogExports(): Set<string> {
  const names = new Set<string>();
  const libRoots = [process.cwd(), join(process.cwd(), 'nextjs_space')]
    .map((b) => join(b, 'lib'))
    .filter((p) => {
      try {
        return statSync(p).isDirectory();
      } catch {
        return false;
      }
    });
  const exportRe = /export\s+(?:async\s+)?(?:function|const|let)\s+([A-Za-z_$][\w$]*)/g;
  for (const root of libRoots) {
    for (const file of walkFiles(root)) {
      const rel = relative(process.cwd(), file);
      if (rel.includes('node_modules') || rel.includes('.test.')) continue;
      const content = readFileSync(file, 'utf8');
      exportRe.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = exportRe.exec(content)) !== null) {
        if (isCatalogName(m[1])) names.add(m[1]);
      }
    }
  }
  return names;
}

/**
 * Páginas 'use client' que redeclaran localmente un getter de catálogo ya
 * exportado en lib/. Solo getters (`get…`) para evitar falsos positivos de
 * loaders de datos (loadTemplates, fetchX…) que sí cargan contenido real.
 */
function collectShadowedCatalogNames(): Hit[] {
  const libExports = collectLibCatalogExports();
  const hits: Hit[] = [];
  const localRe =
    /(?:const|let)\s+(get[A-Z][\w$]*)\s*(?::\s*[^=;\n]+?)?\s*=\s*\(|function\s+(get[A-Z][\w$]*)\s*\(/g;
  for (const root of findUIRoots()) {
    for (const file of walkFiles(root)) {
      const rel = relative(process.cwd(), file);
      if (rel.includes('node_modules') || rel.includes('.test.') || rel.includes('.spec.')) continue;
      const content = readFileSync(file, 'utf8');
      if (!isClientFile(content)) continue;
      localRe.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = localRe.exec(content)) !== null) {
        const name = m[1];
        if (name && libExports.has(name)) {
          hits.push({ file: rel, line: lineOf(content, m.index), name });
        }
      }
    }
  }
  return hits;
}

// ─── Guardia ─────────────────────────────────────────────────────────────────

describe('Guardia de catálogos vacíos en páginas client', () => {
  it('ningún archivo "use client" declara localmente una función de catálogo que devuelve []', () => {
    const stubs = collectEmptyCatalogStubs();
    expect(stubs.map((s) => `- '${s.name}' en ${s.file}:${s.line}`), [
      'Stubs de catálogo vacío encontrados en archivos \'use client\':',
      'Una función tipo catálogo (getAvailableX, XOptions, XList…) que devuelve [] oculta',
      'opciones de la UI en silencio (caso real: getAvailableEvents = () => [] en webhooks-salientes).',
      'Si el catálogo existe en un módulo server-only, extráelo a un módulo puro compartido',
      '(ej. lib/webhook-events.ts) e impórtalo; NO lo redeclares vacío en el cliente.',
      '',
      ...stubs.map((s) => `- '${s.name}' en ${s.file}:${s.line}`),
    ].join('\n')).toEqual([]);
  });

  it('ninguna página "use client" redeclara localmente un catálogo ya exportado en lib/', () => {
    const shadows = collectShadowedCatalogNames();
    expect(shadows.map((s) => `- '${s.name}' en ${s.file}:${s.line}`), [
      'Catálogos exportados en lib/ que se redeclaran localmente en archivos \'use client\':',
      'La versión local suele ser un stub vacío (oculta opciones) o una copia que puede',
      'desincronizarse. Importa el catálogo desde lib/ en lugar de redefinirlo.',
      '',
      ...shadows.map((s) => `- '${s.name}' en ${s.file}:${s.line}`),
    ].join('\n')).toEqual([]);
  });

  it('el detector reconoce el anti-patrón histórico (self-test)', () => {
    const sample = `
      'use client';
      const getAvailableEvents: any = () => [];
      const eventosDisponibles = getAvailableEvents();
      const getOpciones = () => [];
      function getLista() { return []; }
      const getBackHref = () => '/home';
    `;
    const names: string[] = [];
    ARROW_EMPTY_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = ARROW_EMPTY_RE.exec(sample)) !== null) {
      if (isCatalogName(m[1])) names.push(m[1]);
    }
    FN_EMPTY_RE.lastIndex = 0;
    while ((m = FN_EMPTY_RE.exec(sample)) !== null) {
      if (isCatalogName(m[1])) names.push(m[1]);
    }
    expect(names).toEqual(['getAvailableEvents', 'getOpciones', 'getLista']);
    // getBackHref NO es catálogo → no debe aparecer
    expect(names).not.toContain('getBackHref');
  });
});