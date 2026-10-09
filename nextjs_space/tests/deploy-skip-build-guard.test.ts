import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

/**
 * Guardia del gate de build (`deploy-vps/decidir-build.sh`).
 *
 * Por qué existe
 * --------------
 * El gate decide si el pipeline tiene que reconstruir la imagen. Su error barato
 * es un «construir» de más (10-20 minutos tirados); su error caro es un
 * «saltar» de más, que sirve en producción una imagen vieja **sin que nada lo
 * delate**: el deploy termina en verde, `service update` converge y la app
 * responde 200, pero el código desplegado no es el del repo. Es exactamente la
 * clase de fallo silencioso que este proyecto persigue con guardias
 * (`deploy-docker-templates-guard`, `deploy-scripts-syntax-guard`) en vez de con
 * confianza.
 *
 * Cómo lo comprueba
 * -----------------
 * Monta un repositorio git temporal con la forma real del proyecto (un
 * `nextjs_space/` con `app/`, `docs/`, `.github/`, `tests/`), **copia el script
 * real** y su `.gitignore` real, y ejecuta el gate contra escenarios concretos:
 *
 *   · documentación/workflows/tests → debe SALTAR (código 1)
 *   · cualquier cosa que entre en la imagen → debe CONSTRUIR (código 0)
 *   · sin baseline, árbol sucio, `.env*` cambiados, baseline no ancestro → 0
 *
 * Copiar el `.gitignore` real (y no inventarlo) es deliberado: el marcador
 * `deploy-vps/.ultimo-deploy` aparece como fichero sin seguimiento si deja de
 * estar ignorado, y entonces el gate construiría siempre. Ese test lo caza.
 *
 * Se usan ambos códigos de salida porque el contrato del script es justamente
 * eso: `1` = saltar, cualquier otra cosa = construir.
 */

const SCRIPT_REL = 'deploy-vps/decidir-build.sh';

/** Raíces válidas, tanto si el test corre en nextjs_space/ como en la raíz del repo. */
function bases(): string[] {
  return [process.cwd(), join(process.cwd(), 'nextjs_space')];
}

function rutaScript(): string {
  for (const base of bases()) {
    const p = join(base, SCRIPT_REL);
    if (existsSync(p)) return p;
  }
  throw new Error(`No se encontró ${SCRIPT_REL} en: ${bases().join(', ')}`);
}

const SCRIPT = rutaScript();
/** El `nextjs_space/` real, del que se copian script y .gitignore. */
const CTX_REAL = resolve(dirname(SCRIPT), '..');

// Git aislado: sin configuración global (hooks, plantillas, firmas) que pueda
// alterar el resultado, y con identidad explícita para poder commitear.
const ENV_GIT: NodeJS.ProcessEnv = {
  ...process.env,
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_SYSTEM: '/dev/null',
  GIT_AUTHOR_NAME: 'Guardia Build',
  GIT_AUTHOR_EMAIL: 'guardia@test',
  GIT_COMMITTER_NAME: 'Guardia Build',
  GIT_COMMITTER_EMAIL: 'guardia@test',
  GIT_TERMINAL_PROMPT: '0',
};

function ejecutar(bin: string, args: string[], cwd: string): string {
  const r = spawnSync(bin, args, { cwd, env: ENV_GIT, encoding: 'utf8' });
  if (r.error) throw r.error;
  if (r.status !== 0) {
    throw new Error(`${bin} ${args.join(' ')} falló (${r.status}):\n${r.stderr}`);
  }
  return r.stdout ?? '';
}

interface Repositorio {
  /** Raíz del repo temporal (el `Volkern/`). */
  dir: string;
  /** Contexto de build (`nextjs_space/`). */
  ctx: string;
  /** Commit inicial, usado como baseline. */
  base: string;
  /** Escribe un fichero dentro del contexto de build. */
  escribirCtx(rel: string, contenido: string): void;
  /** Escribe un fichero fuera del contexto (raíz del repo). */
  escribirRepo(rel: string, contenido: string): void;
  /** Commit de todo lo pendiente; devuelve el SHA. */
  commit(mensaje: string): string;
  git(...args: string[]): string;
  /** `git status --porcelain` en el repo. */
  estado(): string;
  /** Ejecuta el gate real. Devuelve el código y la salida completa. */
  gate(...args: string[]): { codigo: number; salida: string };
}

function crearRepositorio(dir: string): Repositorio {
  const ctx = join(dir, 'nextjs_space');
  for (const d of ['app', 'docs', '.github/workflows', 'tests', 'deploy-vps', 'public']) {
    mkdirSync(join(ctx, d), { recursive: true });
  }

  copyFileSync(SCRIPT, join(ctx, SCRIPT_REL));
  copyFileSync(join(CTX_REAL, '.gitignore'), join(ctx, '.gitignore'));
  copyFileSync(join(CTX_REAL, 'deploy-vps/.gitignore'), join(ctx, 'deploy-vps/.gitignore'));

  const iniciales: Record<string, string> = {
    Dockerfile: 'FROM node:20-slim\n',
    'package.json': '{ "name": "volkern-fake" }\n',
    'app/page.tsx': 'export default function P() { return null }\n',
    'docs/guia.md': '# guía\n',
    '.github/workflows/ci.yml': 'name: ci\n',
    'tests/algo.test.ts': 'export const x = 1\n',
    'public/logo.svg': '<svg/>\n',
  };
  for (const [rel, contenido] of Object.entries(iniciales)) {
    writeFileSync(join(ctx, rel), contenido);
  }
  writeFileSync(join(dir, 'README.md'), '# raíz\n');

  ejecutar('git', ['init', '-q', '-b', 'main', '.'], dir);

  const escribir = (raiz: string, rel: string, contenido: string): void => {
    const p = join(raiz, rel);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, contenido);
  };

  const git = (...args: string[]): string => ejecutar('git', args, dir);

  git('add', '-A');
  git('commit', '-qm', 'base');

  return {
    dir,
    ctx,
    base: git('rev-parse', 'HEAD').trim(),
    escribirCtx: (rel, contenido) => escribir(ctx, rel, contenido),
    escribirRepo: (rel, contenido) => escribir(dir, rel, contenido),
    commit: (mensaje) => {
      git('add', '-A');
      git('commit', '-qm', mensaje);
      return git('rev-parse', 'HEAD').trim();
    },
    git,
    estado: () => git('status', '--porcelain').trim(),
    gate: (...args) => {
      const r = spawnSync('bash', [join(ctx, SCRIPT_REL), ...args], {
        cwd: dir,
        env: ENV_GIT,
        encoding: 'utf8',
      });
      if (r.error) throw r.error;
      return { codigo: r.status ?? -1, salida: `${r.stdout ?? ''}${r.stderr ?? ''}` };
    },
  };
}

/** Crea un repo temporal, ejecuta `fn` y lo borra siempre. */
function conRepositorio<T>(fn: (r: Repositorio) => T): T {
  const dir = mkdtempSync(join(tmpdir(), 'volkern-gate-build-'));
  try {
    return fn(crearRepositorio(dir));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ─── Guardia ─────────────────────────────────────────────────────────────────

describe('Gate de build (decidir-build.sh): ¿hace falta reconstruir la imagen?', () => {
  it('el script existe y no está vacío (la guardia no pasa por vacío)', () => {
    expect(existsSync(SCRIPT), `No se encontró ${SCRIPT}`).toBe(true);
    expect(statSync(SCRIPT).size, 'El gate está vacío o es un esqueleto').toBeGreaterThan(1000);
  });

  it('sin baseline construye: nunca se salta por defecto', () => {
    conRepositorio((r) => {
      const d = r.gate();
      expect(d.codigo, `Sin baseline el gate debe construir:\n${d.salida}`).toBe(0);
      expect(d.salida).toContain('CONSTRUIR');
      expect(d.salida).toContain('baseline');
    });
  });

  it('un baseline explícito inexistente construye (no se fía de una referencia rota)', () => {
    conRepositorio((r) => {
      const d = r.gate('--since', 'no-existe-esta-ref');
      expect(d.codigo, d.salida).toBe(0);
      expect(d.salida).toContain('CONSTRUIR');
    });
  });

  it('solo documentación, workflows y tests → SALTA (código 1)', () => {
    conRepositorio((r) => {
      r.escribirCtx('docs/guia.md', '# guía v2\n');
      r.escribirCtx('.github/workflows/ci.yml', 'name: ci-v2\n');
      r.escribirCtx('tests/algo.test.ts', 'export const x = 2\n');
      r.escribirCtx('app/notas.md', '# notas\n');
      r.commit('solo docs/workflows/tests');

      const d = r.gate('--since', r.base, '--verbose');
      expect(d.codigo, `Debería saltar el build:\n${d.salida}`).toBe(1);
      expect(d.salida).toContain('SALTAR');
      // Un `.md` en cualquier profundidad queda clasificado como documentación.
      expect(d.salida).toContain('no afecta: app/notas.md');
    });
  });

  it('un cambio real en el código → CONSTRUYE (código 0)', () => {
    conRepositorio((r) => {
      r.escribirCtx('app/page.tsx', 'export default function P() { return 1 }\n');
      r.commit('feat: algo real');

      const d = r.gate('--since', r.base);
      expect(d.codigo, `Debería construir:\n${d.salida}`).toBe(0);
      expect(d.salida).toContain('CONSTRUIR');
      expect(d.salida).toContain('app/page.tsx');
    });
  });

  it('cambios en package.json, Dockerfile o public/ → CONSTRUYE', () => {
    for (const rel of ['package.json', 'Dockerfile', 'public/logo.svg']) {
      conRepositorio((r) => {
        r.escribirCtx(rel, `${rel} modificado\n`);
        r.commit(`cambio en ${rel}`);

        const d = r.gate('--since', r.base);
        expect(d.codigo, `${rel} entra en la imagen y debe obligar a construir:\n${d.salida}`).toBe(0);
        expect(d.salida).toContain(rel);
      });
    }
  });

  it('mezcla de documentación y código → CONSTRUYE (basta un cambio real)', () => {
    conRepositorio((r) => {
      r.escribirCtx('docs/guia.md', '# guía v3\n');
      r.escribirCtx('app/page.tsx', 'export default function P() { return 2 }\n');
      r.commit('docs + código');

      const d = r.gate('--since', r.base);
      expect(d.codigo, d.salida).toBe(0);
      expect(d.salida).toContain('app/page.tsx');
      expect(d.salida).not.toContain('no afecta: app/page.tsx');
    });
  });

  it('cambios sin commitear dentro del contexto → CONSTRUYE (el diff no los ve)', () => {
    conRepositorio((r) => {
      r.escribirCtx('app/nuevo.tsx', 'export const nuevo = 1\n');

      const d = r.gate('--since', r.base);
      expect(d.codigo, `Un árbol sucio no puede saltar el build:\n${d.salida}`).toBe(0);
      expect(d.salida).toContain('sin commitear');
    });
  });

  it('cambios fuera del contexto de build no obligan a construir', () => {
    conRepositorio((r) => {
      r.escribirRepo('README.md', '# raíz v2\n');
      r.escribirRepo('docs/notas-raiz.md', '# notas\n');
      r.escribirRepo('.github/workflows/raiz.yml', 'name: raiz\n');
      r.commit('docs de la raíz del repo');

      const d = r.gate('--since', r.base);
      expect(d.codigo, `La raíz no viaja al docker build:\n${d.salida}`).toBe(1);
      expect(d.salida).toContain('SALTAR');
    });
  });

  it('el marcador (--marcar) no ensucia el árbol y el gate lo usa sin --since', () => {
    conRepositorio((r) => {
      const m = r.gate('--marcar');
      expect(m.codigo, `--marcar debe salir 0:\n${m.salida}`).toBe(0);
      expect(r.estado(), 'El marcador debe estar ignorado por git (deploy-vps/.gitignore)').toBe('');

      const marcador = readFileSync(join(r.ctx, 'deploy-vps/.ultimo-deploy'), 'utf8');
      expect(marcador).toMatch(/^commit=[0-9a-f]{40}$/m);
      expect(marcador).toMatch(/^arbol=limpio$/m);
      expect(marcador).toMatch(/^env_sha=[0-9a-f]{64}$/m);

      // Mismo árbol: nada que construir.
      expect(r.gate().codigo, 'Sin cambios respecto al marcador debe saltar').toBe(1);

      // Cambio real desde el marcador: hay que construir.
      r.escribirCtx('app/page.tsx', 'export default function P() { return 3 }\n');
      r.commit('feat tras el marcador');
      expect(r.gate().codigo, 'Un cambio real posterior al marcador debe construir').toBe(0);

      // Ojo: el marcador NO se refresca solo — sigue apuntando al commit viejo,
      // así que mientras ese cambio de código no se haya construido y desplegado,
      // el gate debe seguir construyendo, incluso si después solo tocan docs.
      r.escribirCtx('docs/otra.md', '# otra\n');
      r.commit('docs tras el marcador viejo');
      expect(
        r.gate().codigo,
        'Un cambio de código sin construir no puede quedar tapado por un commit de docs'
      ).toBe(0);

      // Se construye y despliega (el pipeline llama a --marcar) y a partir de ahí
      // la documentación vuelve a no obligar a construir.
      expect(r.gate('--marcar').codigo).toBe(0);
      r.escribirCtx('docs/tercera.md', '# tercera\n');
      const docs = r.commit('docs tras el marcador nuevo');
      expect(r.gate().codigo, 'Documentación tras refrescar el marcador debe saltar').toBe(1);
      expect(docs).not.toBe(r.base);
    });
  });

  it('si cambian los NEXT_PUBLIC_* horneados, construye aunque el commit sea el mismo', () => {
    conRepositorio((r) => {
      r.gate('--marcar');
      // `.env*` está ignorado por git: el diff no lo ve y el árbol sigue limpio.
      r.escribirCtx('.env', 'NEXT_PUBLIC_CDN_URL=https://cdn.example.com\n');
      expect(r.estado(), 'El .env de prueba debe estar ignorado').toBe('');

      const d = r.gate();
      expect(d.codigo, `Un cambio de NEXT_PUBLIC_* debe reconstruir:\n${d.salida}`).toBe(0);
      expect(d.salida).toContain('NEXT_PUBLIC');
    });
  });

  it('un marcador de un despliegue con árbol sucio → CONSTRUYE', () => {
    conRepositorio((r) => {
      const marcador = [
        'commit=' + r.base,
        'arbol=sucio',
        'env_sha=0'.repeat(64),
      ].join('\n');
      r.escribirCtx('deploy-vps/.ultimo-deploy', `${marcador}\n`);

      const d = r.gate();
      expect(d.codigo, `Una imagen construida desde un árbol sucio no corresponde a ningún commit:\n${d.salida}`).toBe(0);
      expect(d.salida).toContain('sin commitear');
    });
  });

  it('un baseline que no es ancestro de HEAD → CONSTRUYE', () => {
    conRepositorio((r) => {
      // Historia nueva sin relación con `base` (simula un rebase o una rama aparte).
      r.git('checkout', '-q', '--orphan', 'otra');
      r.git('add', '-A');
      r.git('commit', '-qm', 'otra historia');

      const d = r.gate('--since', r.base);
      expect(d.codigo, `Un baseline inalcanzable no permite afirmar nada:\n${d.salida}`).toBe(0);
      expect(d.salida).toContain('ancestro');
    });
  });

  it('una opción desconocida sale 2 (el llamador debe construir)', () => {
    conRepositorio((r) => {
      const d = r.gate('--loquesea');
      expect(d.codigo, `El contrato solo salta con 1; un error de uso es 2:\n${d.salida}`).toBe(2);
    });
  });
});
