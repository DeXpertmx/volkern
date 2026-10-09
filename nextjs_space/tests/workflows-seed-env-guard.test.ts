import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

/**
 * Guardia de los workflows que ejecutan `scripts/seed.ts`.
 *
 * Por qué existe
 * --------------
 * `scripts/seed.ts` dejó de llevar contraseñas literales: las lee del entorno con
 * `requireEnv(...)` y **aborta** si faltan (ver scripts/bootstrap-admin.env.example
 * y docs/ROTACION-CREDENCIALES-ADMIN.md). Ese cambio endureció el script, pero el
 * workflow `unit-tests.yml` siguió invocándolo sin declarar las variables, así que
 * el paso del seed moría con `❌ Define SEED_TEST_USER_PASSWORD...` y el job entero
 * quedaba rojo por un defecto del workflow, no del código: en la lista de CI se
 * lee igual que un test roto y se pierde el día mirando el sitio equivocado.
 *
 * Cómo lo comprueba
 * -----------------
 * No repite la lista de variables a mano (eso se desincroniza solo): extrae los
 * `requireEnv('...')` del propio `scripts/seed.ts` y exige cada uno en el `env:`
 * del paso que ejecuta el script. Si mañana el seed necesita una cuarta variable,
 * la guardia empieza a exigirla sin tocar este archivo.
 *
 * Incluye una autocomprobación con contenido sintético: una guardia que no puede
 * fallar es decoración, así que se verifica que el comprobador detecta el fallo
 * (paso sin las variables) y acepta el caso bueno (paso con todas).
 */

const RUTA_SEED = 'scripts/seed.ts';

/** Raíces válidas, tanto si el test corre en nextjs_space/ como en la raíz del repo. */
function bases(): string[] {
  return [process.cwd(), join(process.cwd(), 'nextjs_space')];
}

function rutaSeed(): string {
  for (const base of bases()) {
    const p = join(base, RUTA_SEED);
    if (existsSync(p)) return p;
  }
  throw new Error(`No se encontró ${RUTA_SEED} en: ${bases().join(', ')}`);
}

/**
 * Directorios de workflows a revisar. Hay dos en el repo (`nextjs_space/.github`
 * con los cron y el `.github` de la raíz con unit-tests) y el seed se invoca
 * desde el de la raíz, así que se revisan todos en vez de quedarse con el primero
 * que aparezca: buscar solo en `nextjs_space/.github` hacía que la guardia
 * aprobara sin haber mirado el workflow que importa.
 */
function dirsWorkflows(): string[] {
  const nextjsSpace = resolve(dirname(rutaSeed()), '..');
  const candidatos = [
    join(nextjsSpace, '.github', 'workflows'),
    join(nextjsSpace, '..', '.github', 'workflows'),
    join(process.cwd(), '.github', 'workflows'),
    join(process.cwd(), '..', '.github', 'workflows'),
  ];
  const dirs: string[] = [];
  for (const candidato of candidatos) {
    if (existsSync(candidato) && !dirs.includes(candidato)) dirs.push(candidato);
  }
  if (dirs.length === 0) throw new Error(`No hay .github/workflows en: ${bases().join(', ')}`);
  return dirs;
}

interface Workflow {
  /** Etiqueta legible para el mensaje de error. */
  etiqueta: string;
  contenido: string;
}

function leerWorkflows(): Workflow[] {
  const workflows: Workflow[] = [];
  for (const dir of dirsWorkflows()) {
    for (const archivo of readdirSync(dir).filter((f) => /\.ya?ml$/.test(f))) {
      workflows.push({
        etiqueta: `${dir.replace(`${resolve(dirname(rutaSeed()), '..', '..')}/`, '')}/${archivo}`,
        contenido: readFileSync(join(dir, archivo), 'utf8'),
      });
    }
  }
  return workflows;
}

/** Pasos de workflow; se corta el bloque en el siguiente `- name|run|uses:`. */
export interface Paso {
  archivo: string;
  nombre: string;
  bloque: string;
}

export function pasosDeWorkflow(contenido: string, archivo: string): Paso[] {
  const pasos: Paso[] = [];
  let actual: { lineas: string[]; nombre: string } | null = null;

  const cerrar = () => {
    if (!actual) return;
    // Los comentarios se descartan: un `# scripts/seed.ts` no es un paso que
    // ejecute el seed, y un `# SEED_ADMIN_PASSWORD:` en un comentario no es una
    // variable declarada (si contaran, la guardia aprobaría documentando el
    // fallo en vez de arreglándolo).
    const bloque = actual.lineas.filter((l) => !/^\s*#/.test(l)).join('\n');
    pasos.push({ archivo, nombre: actual.nombre, bloque });
    actual = null;
  };

  for (const linea of contenido.split(/\r?\n/)) {
    const inicio = /^\s*- (name|run|uses):/.exec(linea);
    if (inicio) {
      cerrar();
      actual = { lineas: [linea], nombre: '' };
      const nombre = /^\s*- name:\s*(.*)$/.exec(linea);
      if (nombre) actual.nombre = nombre[1].trim().replace(/^['"]|['"]$/g, '');
      continue;
    }
    if (actual) actual.lineas.push(linea);
  }
  cerrar();

  return pasos;
}

/** Variables que el seed exige en el entorno, leídas del propio script. */
export function variablesDelSeed(contenidoSeed: string): string[] {
  const nombres = new Set<string>();
  for (const m of contenidoSeed.matchAll(/requireEnv\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    nombres.add(m[1]);
  }
  return [...nombres].sort();
}

/** Variables exigidas que el `env:` del paso no declara. */
export function variablesFaltantes(bloque: string, requeridas: string[]): string[] {
  return requeridas.filter(
    (nombre) => !new RegExp(`(^|[\\s{,])${nombre}\\s*:`, 'm').test(bloque)
  );
}

const SEED = readFileSync(rutaSeed(), 'utf8');
const REQUERIDAS = variablesDelSeed(SEED);
const WORKFLOWS = leerWorkflows();

describe('workflows que ejecutan scripts/seed.ts', () => {
  it('extrae las variables exigidas del propio seed (la guardia no es vacía)', () => {
    // Si un refactor del seed quita los requireEnv, esta guardia dejaría de
    // comprobar nada en silencio: eso también es un fallo.
    expect(REQUERIDAS).toEqual([
      'SEED_ADMIN_PASSWORD',
      'SEED_SUPERADMIN_PASSWORD',
      'SEED_TEST_USER_PASSWORD',
    ]);
  });

  it('declara todas las variables del seed en cada paso que lo ejecuta', () => {
    const problemas: string[] = [];

    for (const workflow of WORKFLOWS) {
      for (const paso of pasosDeWorkflow(workflow.contenido, workflow.etiqueta)) {
        if (!paso.bloque.includes(RUTA_SEED)) continue;
        const faltan = variablesFaltantes(paso.bloque, REQUERIDAS);
        if (faltan.length > 0) {
          problemas.push(
            `${workflow.etiqueta} · paso «${paso.nombre || '(sin nombre)'}»: faltan ${faltan.join(', ')} en su env:`
          );
        }
      }
    }

    expect(problemas).toEqual([]);
  });

  it('el paso del seed existe en al menos un workflow (no se comprueba el vacío)', () => {
    const pasosConSeed = WORKFLOWS.flatMap((workflow) =>
      pasosDeWorkflow(workflow.contenido, workflow.etiqueta)
    ).filter((paso) => paso.bloque.includes(RUTA_SEED));

    expect(pasosConSeed.length).toBeGreaterThan(0);
  });

  it('autocomprobación: detecta el paso incompleto y acepta el correcto', () => {
    const incompleto = [
      '    steps:',
      '      - name: Seed database',
      '        run: npx tsx scripts/seed.ts',
      '        env:',
      '          DATABASE_URL: postgresql://x@localhost/volkern_test',
      '',
      '      - name: Otro paso',
      '        run: echo hola',
    ].join('\n');

    const pasosIncompletos = pasosDeWorkflow(incompleto, 'sintetico.yml');
    const conSeed = pasosIncompletos.find((p) => p.bloque.includes(RUTA_SEED))!;
    expect(conSeed.nombre).toBe('Seed database');
    expect(variablesFaltantes(conSeed.bloque, REQUERIDAS)).toEqual(REQUERIDAS);

    // El paso siguiente no arrastra el env del anterior: si no, la guardia
    // aprobaría cualquier cosa puesta en cualquier sitio del archivo.
    const otro = pasosIncompletos.find((p) => p.nombre === 'Otro paso')!;
    expect(variablesFaltantes(otro.bloque, REQUERIDAS)).toEqual(REQUERIDAS);

    const completo = incompleto.replace(
      '          DATABASE_URL: postgresql://x@localhost/volkern_test',
      REQUERIDAS.map((v) => `          ${v}: ci-${v.toLowerCase()}`).join('\n')
    );
    const conEnvs = pasosDeWorkflow(completo, 'sintetico.yml').find((p) =>
      p.bloque.includes(RUTA_SEED)
    )!;
    expect(variablesFaltantes(conEnvs.bloque, REQUERIDAS)).toEqual([]);
  });
});
