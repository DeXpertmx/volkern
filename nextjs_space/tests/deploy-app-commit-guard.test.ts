// @vitest-environment node
/**
 * Guardia de la atadura imagen↔commit en `deploy-vps/deploy-app.sh`.
 *
 * Por qué existe
 * --------------
 * El deploy fía el servicio a una referencia por digest y comprueba que la
 * label `org.opencontainers.image.revision` de la imagen es el commit que
 * anunció el pipeline. Si esa comprobación se rompiera (o dejara de ejecutarse
 * antes del `service update`), se desplegaría un tarball de otro commit con el
 * servicio apuntando a él: en verde y en silencio.
 *
 * El script habla con Docker, así que la prueba monta un doble de `docker`
 * (y de `curl`) en un directorio temporal y lo pone primero en `PATH`. El
 * doble registra cada invocación, lo que permite afirmar no solo el código de
 * salida, sino que en los casos negativos NO se llegó a `docker tag` ni a
 * `docker service update` (el servicio queda intacto).
 *
 * Casos:
 *   · label de la imagen ≠ commit de la metadata → aborta.
 *   · imagen sin label con metadata presente      → aborta.
 *   · app sin contenedor (Telegram no resoluble)  → no muere antes de comprobar.
 *   · camino feliz → un tag, un update a la referencia por digest y la
 *     referencia anterior conservada para el rollback (la obsoleta se poda).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const RAIZ = join(__dirname, '..');
const SCRIPT = join(RAIZ, 'deploy-vps', 'deploy-app.sh');

const DIGEST = '1'.repeat(64);
const DIGEST_ANTERIOR = '2'.repeat(64);
const DIGEST_OBSOLETO = '3'.repeat(64);
const COMMIT = 'a'.repeat(40);
const OTRO_COMMIT = 'c'.repeat(40);

/**
 * Doble de docker. Responde solo a lo que `deploy-app.sh` consulta antes y
 * después de actualizar el servicio, y anota cada llamada en `$DEPLOY_TEST_LOG`.
 * La imagen del servicio se guarda en `$DEPLOY_TEST_SPEC` para que el paso 4c
 * lea lo que el `service update` acaba de fijar.
 */
const DOBLE_DOCKER = `#!/bin/bash
echo "$*" >> "$DEPLOY_TEST_LOG"
SPEC="$DEPLOY_TEST_SPEC"
NUEVA_REF="volkern-erp:sha256-\${DEPLOY_TEST_DIGEST}"
cmd="$1"; shift || true
case "$cmd" in
  node)  echo "ID HOSTNAME STATUS"; exit 0 ;;
  load)  echo "Loaded image: volkern-erp:latest"; exit 0 ;;
  tag)   exit 0 ;;
  image)
    case "$1" in
      inspect)
        case "$*" in
          *'{{.Id}}'*) echo "sha256:\${DEPLOY_TEST_DIGEST}" ;;
          *'org.opencontainers.image.revision'*) echo "\${DEPLOY_TEST_COMMIT:-<no value>}" ;;
          *'org.volkern.tree'*) echo "limpio" ;;
        esac ;;
      ls)
        printf '%s\\n' "$NUEVA_REF" \\
          "volkern-erp:sha256-\${DEPLOY_TEST_OLD_DIGEST}" \\
          "volkern-erp:sha256-\${DEPLOY_TEST_STALE_DIGEST}" ;;
      prune) echo "Total reclaimed space: 0B" ;;
    esac
    exit 0 ;;
  service)
    case "$1" in
      inspect)
        case "$*" in
          *'ContainerSpec.Image'*) cat "$SPEC" ;;
          *'org.volkern.commit'*) echo "\${DEPLOY_TEST_COMMIT:-<no value>}" ;;
          *'org.volkern.tree'*) echo "limpio" ;;
        esac ;;
      update) echo "overall progress: 1 out of 1"; echo "$NUEVA_REF" > "$SPEC" ;;
      ps) echo "Running 1/1 volkern-erp:latest" ;;
    esac
    exit 0 ;;
  ps)
    [ "\${DEPLOY_TEST_NO_CONTAINERS:-0}" = "1" ] && exit 0
    case "$*" in *status=exited*) exit 0 ;; *) echo "abc123def456" ;; esac
    exit 0 ;;
  inspect)
    case "$*" in *'{{.Image}}'*) echo "sha256:\${DEPLOY_TEST_DIGEST}" ;; esac
    exit 0 ;;
  exec) exit 0 ;;
  *) exit 0 ;;
esac
`;

const DOBLE_CURL = `#!/bin/bash
case "$*" in *'%{http_code}'*) printf '200' ;; esac
exit 0
`;

const BASE = mkdtempSync(join(tmpdir(), 'volkern-deploy-guard-'));
const BIN = join(BASE, 'bin');

beforeAll(() => {
  mkdirSync(BIN);
  writeFileSync(join(BIN, 'docker'), DOBLE_DOCKER);
  writeFileSync(join(BIN, 'curl'), DOBLE_CURL);
  chmodSync(join(BIN, 'docker'), 0o755);
  chmodSync(join(BIN, 'curl'), 0o755);
});

afterAll(() => rmSync(BASE, { recursive: true, force: true }));

interface Ejecucion {
  status: number | null;
  stdout: string;
  stderr: string;
  /** Invocaciones registradas por el doble, en orden. */
  llamadas: string[];
  tarball: string;
}

/**
 * Ejecuta el script real con el doble delante en `PATH`.
 * `commitLabel` es la label de la imagen (omitida = imagen sin etiquetar).
 */
function ejecutar(opciones: {
  commitLabel?: string;
  metaCommit: string;
  sinContenedores?: boolean;
}): Ejecucion {
  const dir = mkdtempSync(join(BASE, 'caso-'));
  const log = join(dir, 'docker.log');
  const spec = join(dir, 'spec');
  const tarball = join(dir, 'volkern-erp-latest.tar');
  const meta = join(dir, 'meta.env');
  writeFileSync(tarball, '');
  writeFileSync(spec, `volkern-erp:sha256-${DIGEST_ANTERIOR}\n`);
  writeFileSync(meta, `commit=${opciones.metaCommit}\ntree=limpio\n`);

  const r = spawnSync('bash', [SCRIPT, tarball, '', meta], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${BIN}:${process.env.PATH ?? ''}`,
      DEPLOY_TEST_LOG: log,
      DEPLOY_TEST_SPEC: spec,
      DEPLOY_TEST_DIGEST: DIGEST,
      DEPLOY_TEST_OLD_DIGEST: DIGEST_ANTERIOR,
      DEPLOY_TEST_STALE_DIGEST: DIGEST_OBSOLETO,
      DEPLOY_TEST_COMMIT: opciones.commitLabel ?? '',
      DEPLOY_TEST_NO_CONTAINERS: opciones.sinContenedores ? '1' : '0',
    },
  });

  const llamadas = existsSync(log)
    ? readFileSync(log, 'utf8').split('\n').filter((l) => l.trim().length > 0)
    : [];

  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '', llamadas, tarball };
}

/** ¿El deploy llegó a tocar el servicio? (`tag` o `service update`). */
function tocaServicio(llamadas: string[]): boolean {
  return llamadas.some((l) => l.startsWith('tag ') || l.startsWith('service update'));
}

describe('deploy-app.sh: la imagen debe ser del commit anunciado', () => {
  it('aborta si la label de la imagen no coincide con la metadata', () => {
    const r = ejecutar({ commitLabel: COMMIT, metaCommit: OTRO_COMMIT });

    expect(r.status).toBe(1);
    expect(r.stderr).toContain('El tarball no corresponde al commit anunciado');
    expect(r.stderr).toContain(OTRO_COMMIT);
    expect(r.stderr).toContain(COMMIT);
    // Lo que de verdad importa: el servicio no se toca.
    expect(tocaServicio(r.llamadas)).toBe(false);
    expect(r.llamadas.some((l) => l.startsWith('service inspect'))).toBe(false);
  });

  it('aborta si la imagen no declara commit, aunque la metadata lo traiga', () => {
    const r = ejecutar({ metaCommit: COMMIT });

    expect(r.status).toBe(1);
    expect(r.stderr).toContain('sin label');
    expect(tocaServicio(r.llamadas)).toBe(false);
  });

  it('sin contenedor de la app no muere resolviendo Telegram: llega a comprobar', () => {
    // Regresión: `tg_resolve_credentials` devolvía 1 sin contenedores y, con
    // `set -e`, el deploy abortaba en silencio ANTES de mirar la imagen.
    const r = ejecutar({ commitLabel: COMMIT, metaCommit: OTRO_COMMIT, sinContenedores: true });

    expect(r.status).toBe(1);
    expect(r.stdout).toContain('=== Deploy Volkern ERP');
    expect(r.stderr).toContain('no corresponde al commit anunciado');
    expect(tocaServicio(r.llamadas)).toBe(false);
  });

  it('camino feliz: fija el digest, actualiza una vez y conserva la referencia anterior', () => {
    const r = ejecutar({ commitLabel: COMMIT, metaCommit: COMMIT });

    expect(r.status).toBe(0);
    expect(r.llamadas.filter((l) => l.startsWith('tag ')).length).toBe(1);

    const updates = r.llamadas.filter((l) => l.startsWith('service update'));
    expect(updates.length).toBe(1);
    expect(updates[0]).toContain(`--image volkern-erp:sha256-${DIGEST}`);

    // Poda: la desplegada y la anterior se conservan; la obsoleta se elimina.
    expect(r.stdout).toContain(`conservada volkern-erp:sha256-${DIGEST} (servicio)`);
    expect(r.stdout).toContain(`conservada volkern-erp:sha256-${DIGEST_ANTERIOR} (rollback)`);
    expect(r.stdout).toContain(`eliminada volkern-erp:sha256-${DIGEST_OBSOLETO}`);
    expect(r.stdout).toContain(`commit ${COMMIT}`);

    // 6a: el tarball de este deploy se limpia (solo el suyo).
    expect(existsSync(r.tarball)).toBe(false);
  });
});
