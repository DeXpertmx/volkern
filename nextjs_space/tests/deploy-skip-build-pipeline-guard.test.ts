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
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

/**
 * Guardia de INTEGRACIÓN del gate de build dentro del pipeline.
 *
 * Por qué existe
 * --------------
 * `deploy-skip-build-guard.test.ts` comprueba el veredicto del gate
 * (`decidir-build.sh`). Pero el veredicto no despliega nada: lo que el usuario
 * ejecuta es `deploy-local.sh`, y lo que hay que garantizar es que ESE script
 * actúe en las dos direcciones:
 *
 *   · solo documentación/workflows → **no construye y no toca el VPS**;
 *   · un cambio real               → construye y sigue con scp + deploy-app.sh.
 *
 * Una verificación que solo mire el veredicto dejaría el cableado entre ambos
 * scripts sin cubrir, que es justo donde un `rc` mal interpretado dejaría de
 * desplegar en silencio.
 *
 * Cómo corre el pipeline real sin tocar nada
 * ------------------------------------------
 *   · Se copia `deploy-local.sh` REAL a un repositorio temporal. La única
 *     modificación es redirigir los dos tarballs de `/tmp/volkern-erp-*.tar` a
 *     ese directorio temporal (el test lo comprueba: exactamente 2 líneas
 *     cambiadas), para no escribir ni borrar rutas compartidas con un deploy de
 *     verdad en marcha.
 *   · `docker`, `ssh` y `scp` se sustituyen por stubs en un `bin/` propio que se
 *     antepone al PATH, y registran cada llamada. El stub de `ssh` responde a
 *     los `sha256sum /root/<centinela>` con el hash local del mismo fichero, para
 *     que la verificación repo↔VPS del pipeline se ejerza de verdad.
 *   · `build-imagen.sh` también se stubbea: el real haría `docker build` (10-20
 *     minutos). Lo que se verifica aquí es que el pipeline LLEGA a construirlo.
 *   · `--skip-smoke --skip-smoke-mcp` dejan fuera todo lo que apuntaría a
 *     producción (`https://volkern.app`).
 *
 * Límite declarado: esto prueba la lógica y el cableado del pipeline, no que
 * Docker produzca la imagen ni que el VPS acepte el despliegue. Eso exige un
 * despliegue real.
 */

const SCRIPT_REL = 'deploy-vps/decidir-build.sh';

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

const SCRIPT_GATE = rutaScript();
const CTX_REAL = resolve(dirname(SCRIPT_GATE), '..');
const DEPLOY_LOCAL_REAL = join(CTX_REAL, 'deploy-vps/deploy-local.sh');

const ENV_GIT: NodeJS.ProcessEnv = {
  ...process.env,
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_SYSTEM: '/dev/null',
  GIT_AUTHOR_NAME: 'Guardia Pipeline',
  GIT_AUTHOR_EMAIL: 'guardia@test',
  GIT_COMMITTER_NAME: 'Guardia Pipeline',
  GIT_COMMITTER_EMAIL: 'guardia@test',
  GIT_TERMINAL_PROMPT: '0',
};

function ejecutar(bin: string, args: string[], cwd: string, env: NodeJS.ProcessEnv = ENV_GIT): string {
  const r = spawnSync(bin, args, { cwd, env, encoding: 'utf8' });
  if (r.error) throw r.error;
  if (r.status !== 0) {
    throw new Error(`${bin} ${args.join(' ')} falló (${r.status}):\n${r.stderr}`);
  }
  return r.stdout ?? '';
}

/** Scripts que el pipeline copia al VPS o cuyo hash verifica localmente. */
const SENTINELAS = ['auditar-superficie.sh', 'vigilar-crons-heredados.sh', 'vigilar-mcp.sh'];
const COPIADOS_AL_VPS = ['deploy-app.sh', 'run-migrations.sh'];

interface Fixture {
  dir: string;
  ctx: string;
  log: () => string;
  deployLocal: (extra?: string[]) => { codigo: number; salida: string };
  commit: (mensaje: string) => string;
  escribirCtx(rel: string, contenido: string): void;
  git(...args: string[]): string;
  head: () => string;
}

function crearFixture(dir: string): Fixture {
  const ctx = join(dir, 'nextjs_space');
  const dv = join(ctx, 'deploy-vps');
  const bin = join(ctx, 'bin');
  const LOG = join(dir, 'llamadas.log');
  for (const d of ['app', 'docs', '.github/workflows', 'deploy-vps', 'bin']) {
    mkdirSync(join(ctx, d), { recursive: true });
  }
  writeFileSync(LOG, '');

  // ── Stubs de docker/ssh/scp (registran cada llamada) ──
  const stubs: Record<string, string> = {
    docker: `#!/bin/bash
echo "docker $*" >> "${LOG}"
if [ "\${1:-}" = "save" ]; then
  while [ \$# -gt 0 ]; do
    if [ "\$1" = "-o" ]; then shift; : > "\$1"; fi
    shift
  done
fi
exit 0
`,
    scp: `#!/bin/bash
echo "scp $*" >> "${LOG}"
exit 0
`,
    ssh: `#!/bin/bash
echo "ssh $*" >> "${LOG}"
case "$*" in
  *sha256sum*)
    # El pipeline compara el hash local de cada centinela con el del VPS.
    f="$(printf '%s' "$*" | grep -oE '/root/[^ ]+' | head -1)"
    b="$(basename "\${f:-x}")"
    sha256sum "${ctx}/deploy-vps/\$b" 2>/dev/null | cut -d' ' -f1
    exit 0
    ;;
esac
exit 0
`,
    // El build real haría `docker build` durante 10-20 minutos: aquí solo se
    // registra que el pipeline llegó a pedirlo.
    'build-imagen.sh': `#!/bin/bash
echo "build-imagen $*" >> "${LOG}"
exit 0
`,
  };
  for (const [nombre, cuerpo] of Object.entries(stubs)) {
    const p = join(bin, nombre);
    writeFileSync(p, cuerpo);
    chmodSync(p, 0o755);
  }
  // build-imagen.sh se invoca como `bash deploy-vps/build-imagen.sh`, así que su
  // stub vive en el árbol (no en bin/).
  writeFileSync(join(dv, 'build-imagen.sh'), stubs['build-imagen.sh']);

  // ── Piezas reales del repo ──
  copyFileSync(SCRIPT_GATE, join(dv, 'decidir-build.sh'));
  copyFileSync(join(CTX_REAL, 'deploy-vps/.gitignore'), join(dv, '.gitignore'));
  copyFileSync(join(CTX_REAL, '.gitignore'), join(ctx, '.gitignore'));
  for (const s of [...SENTINELAS, ...COPIADOS_AL_VPS]) {
    const origen = join(CTX_REAL, 'deploy-vps', s);
    if (existsSync(origen)) copyFileSync(origen, join(dv, s));
    else writeFileSync(join(dv, s), `# fixture: ${s}\n`);
  }

  // ── deploy-local.sh real, con los tarballs redirigidos fuera de /tmp ──
  // Solo se mueve el DIRECTORIO, no el nombre: el pipeline sube el tarball con
  // `scp ... :/tmp/` y luego le dice a deploy-app.sh la ruta `/tmp/<mismo
  // nombre>`, así que renombrarlo rompería esa correspondencia.
  const original = readFileSync(DEPLOY_LOCAL_REAL, 'utf8');
  const parcheado = original
    .replace(/^LATEST_TAR=\/tmp\//m, `LATEST_TAR=${dir}/`)
    .replace(/^MIGRATOR_TAR=\/tmp\//m, `MIGRATOR_TAR=${dir}/`);
  const lineasCambiadas = original
    .split('\n')
    .filter((l, i) => l !== parcheado.split('\n')[i]).length;
  if (lineasCambiadas !== 2) {
    throw new Error(
      `El parche de los tarballs debía tocar 2 líneas y tocó ${lineasCambiadas}: ` +
        'revisa deploy-local.sh (¿cambiaron los nombres de las variables?)'
    );
  }
  writeFileSync(join(dv, 'deploy-local.sh'), parcheado);

  // ── Contenido mínimo del proyecto + git ──
  writeFileSync(join(ctx, 'Dockerfile'), 'FROM node:20-slim\n');
  writeFileSync(join(ctx, 'package.json'), '{ "name": "volkern-fake" }\n');
  writeFileSync(join(ctx, 'app/page.tsx'), 'export default function P() { return null }\n');
  writeFileSync(join(ctx, 'docs/guia.md'), '# guía\n');
  writeFileSync(join(ctx, '.github/workflows/ci.yml'), 'name: ci\n');
  writeFileSync(join(dir, 'clave-falsa'), 'no es una clave real\n');

  const git = (...args: string[]): string => ejecutar('git', args, dir);
  ejecutar('git', ['init', '-q', '-b', 'main', '.'], dir);
  git('add', '-A');
  git('commit', '-qm', 'base');

  const escribirCtx = (rel: string, contenido: string): void => {
    const p = join(ctx, rel);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, contenido);
  };

  return {
    dir,
    ctx,
    log: () => readFileSync(LOG, 'utf8'),
    git,
    commit: (mensaje) => {
      git('add', '-A');
      git('commit', '-qm', mensaje);
      return git('rev-parse', 'HEAD').trim();
    },
    head: () => git('rev-parse', 'HEAD').trim(),
    escribirCtx,
    deployLocal: (extra = []) => {
      const args = [
        join(dv, 'deploy-local.sh'),
        '--skip-migrator',
        '--skip-smoke',
        '--skip-smoke-mcp',
        ...extra,
      ];
      const r = spawnSync('bash', args, {
        cwd: ctx,
        encoding: 'utf8',
        env: {
          ...ENV_GIT,
          // El stub de ssh ignora la clave; se fija para no escanear /home/*/.ssh.
          VOLKERN_SSH_KEY: join(dir, 'clave-falsa'),
          PATH: `${bin}:${process.env.PATH ?? ''}`,
        },
      });
      if (r.error) throw r.error;
      return { codigo: r.status ?? -1, salida: `${r.stdout ?? ''}${r.stderr ?? ''}` };
    },
  };
}

function conFixture<T>(fn: (f: Fixture) => T): T {
  const dir = mkdtempSync(join(tmpdir(), 'volkern-gate-pipeline-'));
  try {
    return fn(crearFixture(dir));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ─── Guardia ─────────────────────────────────────────────────────────────────

describe('Integración del gate de build en el pipeline (deploy-local.sh)', () => {
  it('solo documentación: el pipeline PARA y no construye ni toca el VPS', () => {
    conFixture((f) => {
      // Marcador del despliegue anterior (lo que dejaría un deploy que construyó).
      ejecutar('bash', [join(f.ctx, SCRIPT_REL), '--marcar'], f.ctx, ENV_GIT);
      f.escribirCtx('docs/guia.md', '# guía v2\n');
      f.escribirCtx('.github/workflows/ci.yml', 'name: ci-v2\n');
      const head = f.commit('solo docs/workflows');

      const r = f.deployLocal();
      expect(r.codigo, `Un commit de docs no debe fallar:\n${r.salida}`).toBe(0);
      expect(r.salida, 'Debe decir que para y por qué').toContain('Nada que desplegar');
      expect(r.salida, 'No debe llegar a construir').not.toContain('Build de volkern-erp:latest');
      expect(r.salida, 'No debe anunciar un deploy que no ocurrió').not.toContain('Deploy completado');

      const log = f.log();
      expect(log, 'No debe construir').not.toContain('build-imagen');
      expect(log, 'No debe hacer docker save').not.toContain('docker save');
      expect(log, 'No debe subir nada al VPS').not.toContain('scp ');

      // El marcador no se toca: no hubo build, así que no hay nada que firmar.
      const marcador = readFileSync(join(f.ctx, 'deploy-vps/.ultimo-deploy'), 'utf8');
      expect(marcador, 'El marcador no debe avanzar a un commit que no se construyó').not.toContain(
        head
      );
    });
  });

  it('un cambio real: construye, sube y despliega (y firma el marcador)', () => {
    conFixture((f) => {
      ejecutar('bash', [join(f.ctx, SCRIPT_REL), '--marcar'], f.ctx, ENV_GIT);
      f.escribirCtx('app/page.tsx', 'export default function P() { return 42 }\n');
      const head = f.commit('feat: cambio real');

      const r = f.deployLocal();
      expect(r.codigo, `Un cambio real debe desplegar sin fallar:\n${r.salida}`).toBe(0);
      expect(r.salida, 'Debe construir').toContain('Build de volkern-erp:latest');
      expect(r.salida, 'Debe completar el pipeline').toContain('Deploy completado');
      expect(r.salida, 'Debe decir que la imagen se construyó').toContain('Marcador actualizado');
      expect(r.salida, 'No debe saltarse el despliegue').not.toContain('Nada que desplegar');

      const log = f.log();
      expect(log, 'Debe construir').toContain('build-imagen');
      expect(log, 'Debe hacer docker save').toContain('docker save');
      expect(log, 'Debe subir los tarballs').toContain('scp ');
      expect(log, 'Debe ejecutar el deploy remoto').toContain('deploy-app.sh');

      // El marcador queda firmado con el commit que se acaba de construir.
      const marcador = readFileSync(join(f.ctx, 'deploy-vps/.ultimo-deploy'), 'utf8');
      expect(marcador).toContain(`commit=${head}`);
      expect(marcador).toMatch(/^arbol=limpio$/m);
    });
  });

  it('el tarball se escribe fuera de /tmp (el fixture no comparte rutas del deploy real)', () => {
    conFixture((f) => {
      f.escribirCtx('app/page.tsx', 'export default function P() { return 7 }\n');
      f.commit('feat');
      f.deployLocal();

      const log = f.log();
      const lineaSave = log.split('\n').find((l) => l.startsWith('docker save')) ?? '';
      expect(lineaSave, `Debería haber un docker save redirigido:
${log}`).toContain(
        `${f.dir}/volkern-erp-latest.tar`
      );
      expect(
        lineaSave,
        'El docker save local nunca debe escribir el tarball compartido de /tmp'
      ).not.toContain('/tmp/volkern-erp-latest.tar');
    });
  });

  it('--force-build ignora el gate: construye aunque solo haya cambiado documentación', () => {
    conFixture((f) => {
      ejecutar('bash', [join(f.ctx, SCRIPT_REL), '--marcar'], f.ctx, ENV_GIT);
      f.escribirCtx('docs/guia.md', '# guía v3\n');
      f.commit('solo docs');

      const r = f.deployLocal(['--force-build']);
      expect(r.codigo, r.salida).toBe(0);
      expect(r.salida).toContain('Build de volkern-erp:latest');
      expect(f.log(), 'Con --force-build debe construirse').toContain('build-imagen');
    });
  });

  it('--force-deploy re-sube la imagen existente sin construir', () => {
    conFixture((f) => {
      ejecutar('bash', [join(f.ctx, SCRIPT_REL), '--marcar'], f.ctx, ENV_GIT);
      f.escribirCtx('docs/guia.md', '# guía v4\n');
      f.commit('solo docs');

      const r = f.deployLocal(['--force-deploy']);
      expect(r.codigo, r.salida).toBe(0);
      expect(r.salida).toContain('--force-deploy');
      expect(r.salida).toContain('Deploy completado');

      const log = f.log();
      expect(log, 'Con --force-deploy no se construye').not.toContain('build-imagen');
      expect(log, 'Pero sí se re-sube la imagen').toContain('docker save');
      expect(log, 'Y sí se despliega').toContain('deploy-app.sh');
      expect(
        r.salida,
        'Sin build no se firma el marcador (firmarlo sería afirmar algo falso)'
      ).toContain('Marcador de build: sin cambios');
    });
  });

  it('solo cambios en prisma/: el pipeline construye SOLO el migrator y no reconstruye la app', () => {
    conFixture((f) => {
      ejecutar('bash', [join(f.ctx, SCRIPT_REL), '--marcar'], f.ctx, ENV_GIT);
      f.escribirCtx('prisma/migrations/20261012000000_nueva/migration.sql', '-- sql aditivo\n');
      f.commit('feat(hospitality): migración nueva (solo prisma)');

      const r = f.deployLocal();
      expect(r.codigo, `El flujo solo-migrator debe desplegar sin fallar:\n${r.salida}`).toBe(0);
      expect(r.salida, 'Debe anunciar el flujo exclusivo de migrator').toContain('SOLO_MIGRATOR');
      expect(r.salida, 'Debe decir que construye el migrator').toContain(
        'build EXCLUSIVO del migrator'
      );
      expect(r.salida, 'Y completar el despliegue').toContain('Deploy completado');

      const log = f.log();
      // El runner NO se reconstruye: ni build-imagen.sh ni docker build. Lo que
      // hay es un re-export de la imagen existente (docker save) que sí viaja
      // al VPS — el service update no cambia nada, pero el flujo es uniforme.
      expect(log, 'No debe pedir el build completo de la app').not.toContain('build-imagen');
      expect(log, 'Debe re-exportar la imagen runner existente').toContain('save -o ');
      expect(r.salida, 'Debe construir el migrator pero no la app').not.toContain(
        'Build de volkern-erp:latest'
      );
    });
  });

  it('--skip-build sigue funcionando y tampoco firma el marcador', () => {
    conFixture((f) => {
      f.escribirCtx('app/page.tsx', 'export default function P() { return 9 }\n');
      f.commit('feat');

      const r = f.deployLocal(['--skip-build']);
      expect(r.codigo, r.salida).toBe(0);
      expect(r.salida).toContain('omitido (--skip-build)');
      expect(f.log(), 'No debe construir').not.toContain('build-imagen');
      expect(r.salida).toContain('Marcador de build: sin cambios');
    });
  });
});
