import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Guardia de los DISPARADORES del workflow `Migrations (reproducible from zero)`.
 *
 * Por qué existe
 * --------------
 * El fallo que persigue no es un job rojo: es un job que no llega a existir. Un
 * filtro de rutas demasiado estrecho deja la garantía sin verificar sin que nada
 * lo diga —«verde» y «no hay run» se leen igual en la lista de Actions— y encima
 * es un fallo asimétrico: el 9-oct-2026 `on.push.paths` solo miraba
 * `nextjs_space/prisma/**` y el propio workflow, mientras `on.pull_request.paths`
 * miraba además el schema y la guardia estática. Resultado: los dos últimos
 * pushes de master (f36f179a, un workflow y un test de CI; 0a1dd3b4, un test) no
 * ejecutaron el job, y un cambio equivalente llegando por PR sí lo habría
 * ejecutado.
 *
 * Cómo lo comprueba
 * -----------------
 * No repite la lista de rutas a mano: lee `on.push.paths` y `on.pull_request.paths`
 * del workflow real y exige que (1) existan ambas, (2) sean idénticas —la
 * asimetría es justo el fallo— y (3) cubran, con un emparejador de globs mínimo,
 * las rutas que este job existe para comprobar, incluidos los dos casos reales de
 * los pushes que se saltaron el job.
 *
 * La última prueba mete las listas ANTIGUAS como fixture y comprueba que dejaban
 * huecos: una guardia que no puede fallar es decoración, y estos dos casos son
 * exactamente los que se colaron.
 */

const WORKFLOW_REL = '.github/workflows/migrations.yml';

/**
 * El workflow vive en el `.github` de la RAÍZ del repo, así que `cwd` puede ser
 * `nextjs_space/` (la suite corre ahí) o la raíz.
 */
function rutaWorkflow(): string {
  const candidatos = [
    join(process.cwd(), WORKFLOW_REL),
    join(process.cwd(), '..', WORKFLOW_REL),
    join(process.cwd(), 'nextjs_space', '..', WORKFLOW_REL),
  ];
  for (const candidato of candidatos) {
    if (existsSync(candidato)) return candidato;
  }
  throw new Error(`No se encontró ${WORKFLOW_REL} en: ${candidatos.join(', ')}`);
}

/** Bloque de un disparador (`push:`, `pull_request:`), sin comentarios. */
export function bloqueDeEvento(contenido: string, evento: string): string {
  const lineas = contenido.replace(/\r/g, '').split('\n');
  const inicio = lineas.findIndex((linea) => new RegExp(`^ {2}${evento}:\\s*$`).test(linea));
  if (inicio === -1) {
    throw new Error(`El workflow no declara el disparador "${evento}"`);
  }

  const bloque: string[] = [];
  for (let i = inicio + 1; i < lineas.length; i++) {
    const linea = lineas[i];
    // Los comentarios se descartan: una ruta comentada no dispara nada, y si
    // contara, la guardia aprobaría «arreglando» el fallo en un comentario.
    if (linea.trim() === '' || /^\s*#/.test(linea)) continue;
    const sangria = linea.length - linea.trimStart().length;
    if (sangria <= 2) break; // otro disparador (o el final del bloque `on:`)
    bloque.push(linea);
  }
  return bloque.join('\n');
}

/** Rutas de `paths:` dentro de un disparador; [] si el disparador no las declara. */
export function rutasDelEvento(contenido: string, evento: string): string[] {
  const lineas = bloqueDeEvento(contenido, evento).split('\n');
  const inicio = lineas.findIndex((linea) => /^ {4}paths:\s*$/.test(linea));
  if (inicio === -1) return [];

  const rutas: string[] = [];
  for (let i = inicio + 1; i < lineas.length; i++) {
    const linea = lineas[i];
    const sangria = linea.length - linea.trimStart().length;
    if (sangria <= 4) break; // siguiente clave del disparador (branches:, …)
    const coincidencia = /^ {6}-\s*'?([^']+?)'?\s*$/.exec(linea);
    if (coincidencia) rutas.push(coincidencia[1]);
  }
  return rutas;
}

/** Glob → expresión regular, con la semántica que usa GitHub en `paths`. */
export function comoRegex(patron: string): RegExp {
  const escapado = patron.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  const conComodines = escapado
    .replace(/\*\*/g, '\u0000')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '[^/]')
    .replace(/\u0000/g, '.*');
  return new RegExp(`^${conComodines}$`);
}

/** De las rutas dadas, las que NINGÚN patrón cubre. */
export function rutasNoCubiertas(patrones: string[], rutas: string[]): string[] {
  return rutas.filter((ruta) => !patrones.some((patron) => comoRegex(patron).test(ruta)));
}

/**
 * Rutas cuyo cambio DEBE ejecutar el job. Las dos últimas son los cambios reales
 * de los pushes que se lo saltaron; se quedan fijas para que el hueco no vuelva
 * por otra vía (p. ej. re-estrechar la lista «porque el job tarda»).
 */
const DEBEN_DISPARAR = [
  'nextjs_space/prisma/schema.prisma',
  'nextjs_space/prisma/migrations/20261009120000_hospitality_connectivity_config_tenant/migration.sql',
  'nextjs_space/package.json',
  'nextjs_space/package-lock.json',
  'nextjs_space/tests/migraciones-serie.test.ts',
  'nextjs_space/tests/webcreator-video-block.test.ts', // push 0a1dd3b4
  '.github/workflows/unit-tests.yml', // push f36f179a
  '.github/workflows/migrations.yml',
];

/** Listas anteriores al 9-oct-2026: el hueco que esta guardia detecta. */
const LISTAS_ANTIGUAS: Record<'push' | 'pull_request', string[]> = {
  push: ['nextjs_space/prisma/**', '.github/workflows/migrations.yml'],
  pull_request: [
    'nextjs_space/prisma/**',
    'nextjs_space/schema.prisma',
    'nextjs_space/tests/migraciones-serie.test.ts',
    '.github/workflows/migrations.yml',
  ],
};

const CONTENIDO = readFileSync(rutaWorkflow(), 'utf8');
const PATRONES_PUSH = rutasDelEvento(CONTENIDO, 'push');
const PATRONES_PR = rutasDelEvento(CONTENIDO, 'pull_request');

describe('disparadores del workflow de Migrations', () => {
  it('declara paths en push y en pull_request (no se comprueba el vacío)', () => {
    expect(PATRONES_PUSH.length).toBeGreaterThan(0);
    expect(PATRONES_PR.length).toBeGreaterThan(0);
    expect(DEBEN_DISPARAR.length).toBeGreaterThan(0);
  });

  it('extrae exactamente lo que declara el workflow (la extracción no se inventa nada)', () => {
    // Fijar el resultado de la lectura es lo que hace fiable a las pruebas
    // anteriores: si el lector devolviera el bloque equivocado, una lista de
    // patrones que «cubre» todo podría pasar por casualidad. Y si mañana se
    // añade o quita una ruta, este test obliga a aceptarlo a conciencia.
    expect(PATRONES_PUSH).toEqual([
      'nextjs_space/prisma/**',
      'nextjs_space/package.json',
      'nextjs_space/package-lock.json',
      'nextjs_space/tests/**',
      '.github/workflows/**',
    ]);
  });

  it('push y pull_request llevan la misma lista (la asimetría era el fallo)', () => {
    expect(PATRONES_PUSH).toEqual(PATRONES_PR);
  });

  it('los cambios que el job existe para comprobar lo disparan por las dos vías', () => {
    expect(rutasNoCubiertas(PATRONES_PUSH, DEBEN_DISPARAR)).toEqual([]);
    expect(rutasNoCubiertas(PATRONES_PR, DEBEN_DISPARAR)).toEqual([]);
  });

  it('autocomprobación: el emparejador acepta el encaje y detecta el hueco', () => {
    // `**` cruza directorios y `*` no: si no, `tests/**` «cubriría» cualquier cosa.
    expect(comoRegex('nextjs_space/tests/**').test('nextjs_space/tests/a/b.test.ts')).toBe(true);
    expect(comoRegex('.github/workflows/*.yml').test('.github/workflows/unit-tests.yml')).toBe(true);
    expect(comoRegex('.github/workflows/*.yml').test('.github/workflows/sub/x.yml')).toBe(false);
    expect(comoRegex('nextjs_space/prisma/**').test('nextjs_space/app/page.tsx')).toBe(false);

    expect(rutasNoCubiertas(['a/**'], ['a/b/c.txt'])).toEqual([]);
    expect(rutasNoCubiertas(['a/**'], ['a/b/c.txt', 'c/d.txt'])).toEqual(['c/d.txt']);
  });

  it('las listas antiguas fallaban: el hueco del 9-oct-2026 era real', () => {
    const casosPerdidos = [
      'nextjs_space/tests/webcreator-video-block.test.ts', // push 0a1dd3b4
      '.github/workflows/unit-tests.yml', // push f36f179a
    ];

    for (const caso of casosPerdidos) {
      expect(rutasNoCubiertas(LISTAS_ANTIGUAS.push, [caso])).toEqual([caso]);
    }

    // El push tampoco cubría la guardia estática, que el PR sí miraba: el mismo
    // cambio se comprobaba o no según cómo llegara. (El `nextjs_space/schema.prisma`
    // que solo tenía la lista del PR era además un filtro fantasma: ese fichero no
    // existe; el schema real es `prisma/schema.prisma`, ya cubierto por prisma/**.)
    expect(
      rutasNoCubiertas(LISTAS_ANTIGUAS.push, ['nextjs_space/tests/migraciones-serie.test.ts'])
    ).toEqual(['nextjs_space/tests/migraciones-serie.test.ts']);
    expect(
      rutasNoCubiertas(LISTAS_ANTIGUAS.pull_request, ['nextjs_space/tests/migraciones-serie.test.ts'])
    ).toEqual([]);
  });
});
