import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
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
import { join, resolve } from 'node:path';

/**
 * Guardia del aviso de commit huérfano (`scripts/comprobar-head-desacoplado.sh`
 * y los hooks `post-commit` que lo invocan).
 *
 * Por qué existe
 * --------------
 * Un `git commit` con HEAD desacoplado y sin ninguna rama que contenga el commit
 * termina **en verde**: git no avisa de nada, la salida es la de siempre, y el
 * commit no avanza ninguna referencia. El reflog es lo único que lo sostiene.
 * Pasó de verdad en este repo, donde el checkout principal está desacoplado a
 * propósito (porque `master` está retirado en otro worktree): el commit quedó
 * huérfano y se descubrió de casualidad.
 *
 * Un aviso así solo sirve si avisa en el caso real y calla el resto del tiempo:
 * si se dispara en un rebase o en un HEAD desacoplado que sí está en una rama,
 * se convierte en ruido y deja de leerse. Por eso esta guardia comprueba las dos
 * direcciones —avisa cuando debe y calla cuando no debe— y también el cableado
 * del hook, que es donde el aviso se pierde sin que nadie lo note.
 */

const SCRIPT_REL = 'scripts/comprobar-head-desacoplado.sh';

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

/** Los dos sitios donde el repo declara hooks (raíz y nextjs_space). */
function rutasHooks(): string[] {
  const encontrados: string[] = [];
  for (const base of [process.cwd(), join(process.cwd(), '..'), join(process.cwd(), 'nextjs_space')]) {
    const p = join(base, '.husky', 'post-commit');
    if (existsSync(p) && !encontrados.includes(resolve(p))) encontrados.push(resolve(p));
  }
  return encontrados;
}

const SCRIPT = rutaScript();
const HOOKS = rutasHooks();

const ENV_GIT: NodeJS.ProcessEnv = {
  ...process.env,
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_SYSTEM: '/dev/null',
  GIT_AUTHOR_NAME: 'Guardia Huérfano',
  GIT_AUTHOR_EMAIL: 'guardia@test',
  GIT_COMMITTER_NAME: 'Guardia Huérfano',
  GIT_COMMITTER_EMAIL: 'guardia@test',
  GIT_TERMINAL_PROMPT: '0',
};

function ejecutar(
  bin: string,
  args: string[],
  cwd: string
): { codigo: number; salida: string } {
  const r = spawnSync(bin, args, { cwd, env: ENV_GIT, encoding: 'utf8' });
  if (r.error) throw r.error;
  return { codigo: r.status ?? -1, salida: `${r.stdout ?? ''}${r.stderr ?? ''}` };
}

function git(cwd: string, args: string[]): string {
  const r = ejecutar('git', args, cwd);
  if (r.codigo !== 0) throw new Error(`git ${args.join(' ')} falló:\n${r.salida}`);
  return r.salida;
}

interface Repo {
  dir: string;
  comprobar: (...args: string[]) => { codigo: number; salida: string };
  git: (...args: string[]) => string;
  commit(mensaje: string): void;
}

function crearRepo(dir: string, conHook: string | null = null): Repo {
  const sub = join(dir, 'nextjs_space');
  mkdirSync(join(sub, 'scripts'), { recursive: true });
  copyFileSync(SCRIPT, join(sub, SCRIPT_REL));

  git(dir, ['init', '-q', '-b', 'main', '.']);
  if (conHook) {
    mkdirSync(join(dir, '.husky'), { recursive: true });
    copyFileSync(conHook, join(dir, '.husky', 'post-commit'));
    // git ignora un hook que no sea ejecutable: el fixture reproduce el modo real.
    chmodSync(join(dir, '.husky', 'post-commit'), 0o755);
    git(dir, ['config', 'core.hooksPath', '.husky']);
  }

  writeFileSync(join(dir, 'f.txt'), 'x\n');
  git(dir, ['add', '-A']);
  git(dir, ['commit', '-qm', 'base']);

  return {
    dir,
    comprobar: (...args) => ejecutar('bash', [join(sub, SCRIPT_REL), ...args], dir),
    git: (...args) => git(dir, args),
    commit: (mensaje) => {
      writeFileSync(join(dir, 'f.txt'), `${mensaje}\n`, { flag: 'a' });
      git(dir, ['add', '-A']);
      git(dir, ['commit', '-qm', mensaje]);
    },
  };
}

function conRepo<T>(fn: (r: Repo) => T, conHook: string | null = null): T {
  const dir = mkdtempSync(join(tmpdir(), 'volkern-huerfano-'));
  try {
    return fn(crearRepo(dir, conHook));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Deja tres commits huérfanos por las tres vías reales: uno creado en HEAD
 * desacoplado, uno que un `reset --hard` deja atrás, y uno de una rama borrada.
 */
function crearHuerfanos(r: Repo): { detached: string; reset: string; rama: string } {
  r.git('checkout', '-q', '--detach');
  r.commit('detached huerfano');
  const detached = r.git('rev-parse', 'HEAD').trim();
  r.git('checkout', '-q', 'main');

  r.commit('c2');
  r.commit('reset huerfano');
  const reset = r.git('rev-parse', 'HEAD').trim();
  r.git('reset', '-q', '--hard', 'HEAD~1');

  r.git('checkout', '-q', '-b', 'temporal');
  r.commit('rama borrada huerfano');
  const rama = r.git('rev-parse', 'HEAD').trim();
  r.git('checkout', '-q', 'main');
  r.git('branch', '-qD', 'temporal');

  return { detached, reset, rama };
}

// ─── Guardia ─────────────────────────────────────────────────────────────────

describe('Aviso de commit huérfano (HEAD desacoplado sin rama)', () => {
  it('el script existe y los hooks declarados son ejecutables', () => {
    expect(existsSync(SCRIPT), `No se encontró ${SCRIPT}`).toBe(true);
    expect(statSync(SCRIPT).size).toBeGreaterThan(1000);

    expect(HOOKS.length, 'Debería existir al menos un hook post-commit').toBeGreaterThan(0);
    for (const hook of HOOKS) {
      // git ignora en silencio un hook sin bit de ejecución: el aviso
      // desaparecería sin que nada fallara.
      const modo = statSync(hook).mode & 0o111;
      expect(modo, `${hook} no es ejecutable: git lo ignoraría`).toBeGreaterThan(0);
      expect(readFileSync(hook, 'utf8'), `${hook} debería invocar la comprobación`).toContain(
        'comprobar-head-desacoplado.sh'
      );
    }
  });

  it('HEAD en una rama: sano (0) y sin aviso', () => {
    conRepo((r) => {
      const d = r.comprobar();
      expect(d.codigo, d.salida).toBe(0);
      expect(d.salida).toContain('está en la rama');
      expect(d.salida, 'No debe avisar de un commit que está en una rama').not.toContain('HUÉRFANO');
    });
  });

  it('--quiet: silencio cuando todo va bien (el hook no debe ensuciar la salida)', () => {
    conRepo((r) => {
      const d = r.comprobar('--quiet');
      expect(d.codigo).toBe(0);
      expect(d.salida.trim(), 'Con --quiet no debe imprimir nada').toBe('');
    });
  });

  it('HEAD desacoplado pero contenido en una rama: sano (0), sin falso aviso', () => {
    conRepo((r) => {
      r.git('checkout', '-q', '--detach', 'main');
      const d = r.comprobar('--quiet');
      expect(d.codigo, `Un desacople sobre un commit ya referenciado no es un problema:\n${d.salida}`).toBe(
        0
      );
      expect(d.salida).not.toContain('HUÉRFANO');
    });
  });

  it('HEAD desacoplado con un commit nuevo: AVISA (1) y dice cómo salvarlo', () => {
    conRepo((r) => {
      r.git('checkout', '-q', '--detach', 'main');
      r.commit('commit en detached');

      const d = r.comprobar('--quiet');
      expect(d.codigo, `Este es el caso que hay que cazar:\n${d.salida}`).toBe(1);
      expect(d.salida).toContain('HUÉRFANO');
      expect(d.salida).toContain('(ninguna)');
      // El aviso tiene que traer la salida, no solo el diagnóstico.
      expect(d.salida).toContain('git branch');
      expect(d.salida).toContain('--rescatar');
      expect(d.salida, 'Debe nombrar el commit concreto').toContain(r.git('rev-parse', 'HEAD').trim().slice(0, 12));
    });
  });

  it('si un tag contiene el commit, avisa igual pero dice que lo mantiene vivo', () => {
    conRepo((r) => {
      r.git('checkout', '-q', '--detach', 'main');
      r.commit('commit en detached');
      r.git('tag', 'etiqueta-de-prueba');

      const d = r.comprobar('--quiet');
      expect(d.codigo, 'Un tag no es una rama: el commit sigue fuera de toda rama').toBe(1);
      expect(d.salida).toContain('etiqueta-de-prueba');
      expect(d.salida).toContain('pero no está en ninguna rama');
    });
  });

  it('callar durante un rebase: el desacople es deliberado, no ruido', () => {
    for (const estado of ['rebase-merge', 'rebase-apply', 'CHERRY_PICK_HEAD', 'BISECT_LOG']) {
      conRepo((r) => {
        r.git('checkout', '-q', '--detach', 'main');
        r.commit('commit en detached');
        writeFileSync(join(r.dir, '.git', estado), '');
        expect(r.comprobar('--quiet').codigo, `Con ${estado} en curso no debe avisar`).toBe(0);
        rmSync(join(r.dir, '.git', estado), { recursive: true, force: true });
      });
    }
  });

  it('--rescatar crea una rama y el commit deja de estar huérfano', () => {
    conRepo((r) => {
      r.git('checkout', '-q', '--detach', 'main');
      r.commit('commit en detached');
      const sha = r.git('rev-parse', 'HEAD').trim();

      const d = r.comprobar('--rescatar', '--quiet');
      expect(d.codigo, d.salida).toBe(0);
      expect(d.salida).toContain(`rescate/${sha.slice(0, 7)}`);

      const ramas = r.git('branch', '--format=%(refname:short)');
      expect(ramas).toContain(`rescate/${sha.slice(0, 7)}`);

      // Y ahora la comprobación debe dar por sano el mismo commit.
      expect(r.comprobar('--quiet').codigo, 'Tras rescatarlo ya no es huérfano').toBe(0);
    });
  });

  it('fuera de un repositorio sale 2 (no puede afirmar nada)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'volkern-sin-repo-'));
    try {
      const d = ejecutar('bash', [SCRIPT], dir);
      expect(d.codigo, `Sin repositorio no se puede comprobar:\n${d.salida}`).toBe(2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('el hook cableado avisa en el commit desacoplado y calla en el commit normal', () => {
    for (const hook of HOOKS) {
      conRepo((r) => {
        // Commit con HEAD en rama: el hook no puede ensuciar la salida.
        const enRama = ejecutar('git', ['commit', '-qm', 'en-rama', '--allow-empty'], r.dir);
        expect(enRama.codigo, enRama.salida).toBe(0);
        expect(enRama.salida, `El hook ${hook} no debe avisar con HEAD en rama`).not.toContain('HUÉRFANO');

        // Commit con HEAD desacoplado: aviso, y el commit NO falla.
        git(r.dir, ['checkout', '-q', '--detach', 'main']);
        writeFileSync(join(r.dir, 'f.txt'), 'y\n', { flag: 'a' });
        git(r.dir, ['add', '-A']);
        const desacoplado = ejecutar('git', ['commit', '-qm', 'detached'], r.dir);

        expect(desacoplado.codigo, `El aviso no puede tumbar el commit:\n${desacoplado.salida}`).toBe(0);
        expect(desacoplado.salida, `El hook ${hook} no avisó del commit huérfano`).toContain('HUÉRFANO');
        expect(desacoplado.salida).toContain('git branch');
        // El commit existe: el aviso informa, no revierte.
        expect(git(r.dir, ['log', '-1', '--format=%s']).trim()).toBe('detached');
      }, hook);
    }
  });
});

describe('Barrido de huérfanos antiguos (--historial)', () => {
  it('repositorio limpio: no hay nada que rescatar (0)', () => {
    conRepo((r) => {
      const d = r.comprobar('--historial');
      expect(d.codigo, d.salida).toBe(0);
      expect(d.salida).toContain('no hay ningún objeto inalcanzable');
    });
  });

  it('detecta los huérfanos de las tres vías y dice qué los sostiene', () => {
    conRepo((r) => {
      const { detached, reset, rama } = crearHuerfanos(r);

      const d = r.comprobar('--historial', '--quiet');
      expect(d.codigo, `Debería avisar de los huérfanos:
${d.salida}`).toBe(1);
      expect(d.salida).toContain('COMMITS HUÉRFANOS en este repositorio: 3');
      for (const sha of [detached, reset, rama]) {
        expect(d.salida, `Debería listar ${sha.slice(0, 12)}`).toContain(sha.slice(0, 12));
      }
      // Los tres están en algún reflog: protegidos de momento, no urgentes.
      expect(d.salida).toContain('Solo en el reflog (3)');
      expect(d.salida).not.toContain('SIN reflog');
      expect(d.salida).toContain('gc.reflogExpireUnreachable');
      // Y trae la salida, no solo el diagnóstico.
      expect(d.salida).toContain('--historial --rescatar');
    });
  });

  it('CLAVE: si el reflog ya se expiró, los sigue encontrando (y los marca urgentes)', () => {
    conRepo((r) => {
      const { detached, reset, rama } = crearHuerfanos(r);

      // El reflog deja de recordarlos: cualquier barrido que solo mire el reflog
      // diría «no hay nada», y los objetos siguen ahí, a merced de 'git gc'.
      r.git('reflog', 'expire', '--expire=now', '--all');
      expect(
        r.git('reflog', 'show', '--all', '--format=%H').trim(),
        'El reflog debería haber quedado vacío'
      ).toBe('');

      const d = r.comprobar('--historial', '--quiet');
      expect(d.codigo, `Los huérfanos deben seguir detectándose sin reflog:
${d.salida}`).toBe(1);
      expect(d.salida).toContain('COMMITS HUÉRFANOS en este repositorio: 3');
      expect(d.salida).toContain('SIN reflog (3)');
      expect(d.salida).toContain('gc.pruneExpire');
      for (const sha of [detached, reset, rama]) {
        expect(d.salida).toContain(sha.slice(0, 12));
      }
    });
  });

  it('solo cuenta commits: los trees y blobs inalcanzables no son huérfanos', () => {
    conRepo((r) => {
      crearHuerfanos(r);

      // fsck ve además los trees/blobs de esos commits: si el filtro de tipo no
      // existiera, el listado se llenaría de objetos que no se rescatan.
      const crudo = ejecutar(
        'git',
        ['fsck', '--unreachable', '--no-reflogs', '--connectivity-only'],
        r.dir
      ).salida;
      const objetos = (crudo.match(/^\S+ \S+ [0-9a-f]{40}$/gm) ?? []).length;
      expect(objetos, `fsck debería ver también trees/blobs:
${crudo}`).toBeGreaterThan(3);

      const d = r.comprobar('--historial', '--quiet');
      expect(d.salida).toContain('COMMITS HUÉRFANOS en este repositorio: 3');
    });
  });

  it('sin ningún commit inalcanzable, un blob suelto no dispara el aviso (0)', () => {
    conRepo((r) => {
      const basura = join(r.dir, 'basura-suelta.txt');
      writeFileSync(basura, 'contenido que no referencia nadie\n');
      r.git('hash-object', '-w', basura);

      const d = r.comprobar('--historial');
      expect(d.codigo, `Un blob inalcanzable no es un commit huérfano:
${d.salida}`).toBe(0);
      expect(d.salida).toContain('ninguno es un commit');
    });
  });

  it('--historial --rescatar salva todos y la segunda pasada ya no encuentra nada', () => {
    conRepo((r) => {
      const { detached, reset, rama } = crearHuerfanos(r);

      const d = r.comprobar('--historial', '--rescatar', '--quiet');
      expect(d.codigo, `Rescatar no puede salir con aviso pendiente:
${d.salida}`).toBe(0);
      expect(d.salida).toContain('3 rama(s)');

      const ramas = r.git('branch', '--format=%(refname:short)');
      for (const sha of [detached, reset, rama]) {
        expect(ramas, `Debería haber rescatado ${sha.slice(0, 7)}`).toContain(
          `rescate/${sha.slice(0, 7)}`
        );
      }

      const segunda = r.comprobar('--historial');
      expect(segunda.codigo, `Tras rescatarlos no debe quedar aviso:
${segunda.salida}`).toBe(0);
    });
  });
});
