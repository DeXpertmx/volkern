import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * Guardia de navegación del backoffice: ningún enlace literal puede apuntar a
 * una ruta que no existe.
 *
 * Caso real (25 sep 2026): `components/admin/ImpersonationBanner.tsx` terminaba
 * la suplantación con
 *
 *   window.location.href = '/admin/tenants';
 *
 * pero los tenants del backoffice viven en `/admin/saas/tenants` — no hay
 * carpeta `tenants` bajo `app/admin/`. Detener la suplantación aterrizaba en un
 * 404. El fallo llevaba tiempo escrito y era invisible: no se podía llegar a
 * suplantar (ver `impersonate-superadmin-agencia.test.ts`), así que nadie
 * pulsaba ese botón. Al arreglar lo primero, apareció lo segundo.
 *
 * La guardia resuelve la ruta como lo hace el App Router —segmentos dinámicos
 * `[id]` y grupos `(grupo)`— y también acepta ficheros estáticos de `public/`.
 * El backoffice está limpio hoy, así que no hay lista de excepciones.
 */

// ── Utilidades de archivo ───────────────────────────────────────────────────

const SKIP_DIRS = new Set(['node_modules', '.next', '.git', 'coverage', '.turbo', 'dist']);

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
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(full, out);
    else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) out.push(full);
  }
  return out;
}

/** Ficheros del backoffice: la carpeta de rutas y la de componentes. */
function ficherosDelBackoffice(appRoot: string): string[] {
  return [
    ...walkFiles(join(appRoot, 'app', 'admin')),
    ...walkFiles(join(appRoot, 'components', 'admin')),
  ];
}

// ── Detección ───────────────────────────────────────────────────────────────

const PATRONES = [
  /(?:router\.(?:push|replace)|redirect)\(\s*['"`]([^'"`]+)['"`]/g,
  /window\.location(?:\.href)?\s*=\s*['"`]([^'"`]+)['"`]/g,
  /href=['"]([^'"]+)['"]/g,
];

const IGNORAR_PREFIJOS = ['/api/', '/_next', '/cdn-cgi', 'mailto:', 'tel:', 'http://', 'https://', '//'];

/** Literales de navegación utilizables (rutas absolutas internas, sin plantillas). */
export function extraerDestinos(src: string): string[] {
  const destinos = new Set<string>();
  for (const re of PATRONES) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) {
      let p = m[1];
      if (!p.startsWith('/')) continue;
      if (IGNORAR_PREFIJOS.some((s) => p.startsWith(s))) continue;
      // Con plantillas (`/x/${id}`), corchetes de segmento o arroba de grupo no
      // se puede decidir estáticamente: se dejan fuera para no dar falsos positivos.
      if (p.includes('${') || p.includes('[') || p.includes('@')) continue;
      p = p.split('?')[0].split('#')[0];
      if (p === '/') continue;
      destinos.add(p);
    }
  }
  return [...destinos];
}

/** ¿Existe esta ruta en el App Router (o como fichero estático de public/)? */
export function rutaExiste(appRoot: string, urlPath: string): boolean {
  const segs = urlPath.split('/').filter(Boolean);

  // Estático: public/<ruta>
  if (existsSync(join(appRoot, 'public', ...segs))) return true;

  const tienePage = (dir: string) =>
    ['page.tsx', 'page.ts', 'page.jsx', 'page.js', 'route.ts', 'route.tsx'].some((f) =>
      existsSync(join(dir, f))
    );

  let dir = join(appRoot, 'app');
  if (segs.length === 0) return tienePage(dir);

  for (const seg of segs) {
    const exacto = join(dir, seg);
    if (existsSync(exacto) && statSync(exacto).isDirectory()) {
      dir = exacto;
      continue;
    }
    // Segmento dinámico ([id], [...slug]) o grupo ((dashboard), que no aparece en la URL)
    let hijos: string[] = [];
    try {
      hijos = readdirSync(dir, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => e.name);
    } catch {
      return false;
    }
    const dinamico = hijos.find((h) => h.startsWith('['));
    if (dinamico) {
      dir = join(dir, dinamico);
      continue;
    }
    const grupo = hijos.find((h) => h.startsWith('('));
    if (grupo) {
      const anidado = join(dir, grupo, seg);
      if (existsSync(anidado) && statSync(anidado).isDirectory()) {
        dir = anidado;
        continue;
      }
    }
    return false;
  }
  return tienePage(dir);
}

export interface EnlaceMuerto {
  archivo: string;
  destino: string;
}

export function analizarEnlaces(fuentes: { archivo: string; src: string }[], appRoot: string): EnlaceMuerto[] {
  const muertos: EnlaceMuerto[] = [];
  for (const { archivo, src } of fuentes) {
    for (const destino of extraerDestinos(src)) {
      if (!rutaExiste(appRoot, destino)) muertos.push({ archivo, destino });
    }
  }
  return muertos;
}

// ─── Guardia ─────────────────────────────────────────────────────────────────

describe('Guardia de navegación del backoffice', () => {
  it('ningún enlace literal del backoffice apunta a una ruta inexistente', () => {
    const appRoot = findAppRoot();
    expect(appRoot, 'No se encontró la raíz de la app Next (app/ + lib/)').not.toBeNull();

    const fuentes = ficherosDelBackoffice(appRoot as string).map((f) => ({
      archivo: relative(appRoot as string, f).split('\\').join('/'),
      src: readFileSync(f, 'utf8'),
    }));

    const muertos = analizarEnlaces(fuentes, appRoot as string);

    expect(muertos.map((m) => `${m.archivo} → ${m.destino}`), [
      'Enlaces literales del backoffice que apuntan a rutas que no existen:',
      'Pulsarlos lleva a un 404 (caso real: el banner de suplantación enviaba a',
      "`/admin/tenants`, que no existe; los tenants están en `/admin/saas/tenants`).",
      '',
      ...muertos.map((m) => `- ${m.archivo} → ${m.destino}`),
    ].join('\n')).toEqual([]);
  });

  it('el detector reconoce el anti-patrón histórico (self-test)', () => {
    const appRoot = findAppRoot() as string;

    // El banner tal y como estaba antes del arreglo.
    const bannerRoto = {
      archivo: 'components/admin/ImpersonationBanner.tsx',
      src: [
        "'use client';",
        'export default function B() {',
        '  const parar = () => {',
        "    window.location.href = '/admin/tenants';",
        '  };',
        "  return <a href=\"/admin/saas/tenants\">volver</a>;",
        '}',
      ].join('\n'),
    };

    const muertos = analizarEnlaces([bannerRoto], appRoot);

    expect(muertos).toEqual([{ archivo: bannerRoto.archivo, destino: '/admin/tenants' }]);
    // La ruta correcta sí existe, y las plantillas y las APIs no se evalúan.
    expect(rutaExiste(appRoot, '/admin/saas/tenants')).toBe(true);
    expect(rutaExiste(appRoot, '/admin/tenants')).toBe(false);
    expect(extraerDestinos("router.push(`/dashboard/${id}`); fetch('/api/admin/tenants')")).toEqual([]);
  });
});
