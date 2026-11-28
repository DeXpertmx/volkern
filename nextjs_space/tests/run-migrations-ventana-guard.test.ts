import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Guardia del orden en `run-migrations.sh`.
 *
 * La migración 20261127160000 borra `whatsapp_send_receipts`. Un recibo
 * `en_curso` es la única traza de un envío que pudo salir, y la app vieja puede
 * insertarlo entre la comprobación y el DROP. Por eso el script para el servicio
 * antes de comprobar y lo restaura pase lo que pase.
 *
 * Ese orden no se ve en el resultado: si una edición futura mueve el bloque, el
 * despliegue sigue funcionando igual y la ventana se reabre en silencio. Esta
 * guardia ejecuta el script REAL contra un `docker` simulado y fija:
 *
 *   1. sin `--permitir-destructivas` no se toca el servicio (la puerta aborta
 *      antes de pararlo),
 *   2. `--replicas 0` va antes del conteo de recibos, y el `migrate deploy`
 *      después del conteo,
 *   3. las réplicas se restauran al salir: también cuando el conteo bloquea y
 *      cuando la migración falla.
 *
 * Todos los escenarios usan `--sin-backup`: el backup va antes de parar y no
 * interviene en este orden, así que no hace falta escribir en `/root/backups`.
 */

/** La guardia ejecuta el script real, no una copia: sin él no hay nada que fijar. */
function raizDeLaApp(): string {
  const raiz = [process.cwd(), join(process.cwd(), 'nextjs_space')].find((base) =>
    existsSync(join(base, 'deploy-vps', 'run-migrations.sh'))
  );
  if (!raiz) {
    throw new Error('No se encontró deploy-vps/run-migrations.sh: la guardia ejecuta el script real.');
  }
  return raiz;
}

const RAIZ = raizDeLaApp();
const SCRIPT = join(RAIZ, 'deploy-vps', 'run-migrations.sh');

/**
 * `docker` simulado: registra cada llamada en `$ESTADO/log` y responde lo justo
 * para que el script real recorra el camino completo. La base declara aplicadas
 * las tres migraciones anteriores a la serie nueva, así que las pendientes son
 * exactamente las cuatro que traen el DROP (escenario pequeño y determinista).
 */
const DOCKER_FALSO = `#!/bin/bash
APLICADAS="20261127090000_whatsapp_send_receipt_incierto
  20261127120000_mcp_aprobacion_operation_id
  20261127140000_whatsapp_send_receipt_arguments_hash"
NUEVAS="20261127160000_mcp_aprobacion_operation_id_unico
  20261127200000_mcp_aprobacion_entrega
  20261127210000_mcp_aprobacion_reserva_por_usuario
  20261127220000_mcp_aprobacion_ambito_operation_id"

echo "docker $*" >> "$ESTADO/log"

case "$1" in
  ps)
    case "$*" in
      *volkern-erp_postgres*) echo pgcid ;;
      *volkern-erp_app*) [ "$(cat "$ESTADO/replicas")" = 0 ] || echo appcid ;;
    esac ;;
  exec)
    case "$*" in
      *to_regclass*) echo t ;;
      *migration_name*) printf '%s\\n' $APLICADAS ;;
      *COPY*) echo "envio,estado" ;;
      *"status = 'en_curso'"*) echo "$EN_CURSO" ;;
      *"status = 'incierto'"*) echo 0 ;;
    esac ;;
  run)
    case "$*" in
      *"find /app/prisma/migrations"*) printf '%s\\n' $APLICADAS $NUEVAS ;;
      *entrypoint\\ cat*)
        # El SQL real de cada pendiente: lo lee la puerta destructiva.
        for a in "$@"; do p="$a"; done
        cat "$PWD\${p#/app}" ;;
    esac ;;
  service)
    case "$2" in
      inspect)
        case "$*" in
          *ContainerSpec.Env*) echo "DATABASE_URL=postgresql://volkern_erp:x@postgres:5432/volkern_erp" ;;
          *Replicas*) cat "$ESTADO/replicas" ;;
        esac ;;
      update)
        echo "$*" | sed -n 's/.*--replicas \\([0-9]*\\).*/\\1/p' > "$ESTADO/replicas" ;;
      ps) echo "$JOB" ;;
    esac ;;
esac
exit 0
`;

interface Escenario {
  /** Flags del script (se añade siempre --sin-backup). */
  flags?: string[];
  /** ¿Hay un recibo en_curso? Bloquea el despliegue. */
  enCurso?: boolean;
  /** Estado que `docker service ps` da al job de migración. */
  job?: string;
}

/** Ejecuta el script real y devuelve su salida y las llamadas a `docker`, en orden. */
function ejecutar(escenario: Escenario = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'volkern-ventana-'));
  const bin = join(dir, 'bin');
  try {
    mkdirSync(bin);
    writeFileSync(join(dir, 'replicas'), '1');
    const docker = join(bin, 'docker');
    writeFileSync(docker, DOCKER_FALSO);
    chmodSync(docker, 0o755);

    const r = spawnSync(
      'bash',
      [SCRIPT, ...(escenario.flags ?? []), '--sin-backup'],
      {
        cwd: RAIZ,
        encoding: 'utf8',
        env: {
          ...process.env,
          PATH: `${bin}:${process.env.PATH ?? ''}`,
          ESTADO: dir,
          EN_CURSO: escenario.enCurso ? '1' : '0',
          JOB: escenario.job ?? 'Complete',
          // La comprobación de recibos exporta CSV de verdad: que caigan aquí.
          BACKUP_DIR: join(dir, 'backups'),
        },
      }
    );

    const log = readFileSync(join(dir, 'log'), 'utf8')
      .split('\n')
      .filter(Boolean);

    return { status: r.status, salida: `${r.stdout ?? ''}${r.stderr ?? ''}`, log };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Índice de la primera llamada que casa con el patrón, o -1. */
function indice(log: string[], patron: RegExp): number {
  return log.findIndex((linea) => patron.test(linea));
}

const PARADA = /service update --replicas 0 volkern-erp_app/;
const RESTAURACION = /service update --replicas 1 volkern-erp_app/;

describe('run-migrations.sh no reabre la ventana del DROP', () => {
  it('sin --permitir-destructivas no se toca el servicio', () => {
    const { status, salida, log } = ejecutar();

    // La puerta destructiva aborta: ni parada, ni réplicas, ni migración.
    expect(status).toBe(1);
    expect(salida).toContain('SQL destructivo');
    expect(
      log.filter((linea) => /service update/.test(linea)),
      'sin --permitir-destructivas el script no puede tocar el servicio'
    ).toEqual([]);
    expect(indice(log, /service create/)).toBe(-1);
  });

  it('para las réplicas antes de comprobar los recibos y las restaura después de migrar', () => {
    const { status, log } = ejecutar({ flags: ['--permitir-destructivas'] });

    expect(status).toBe(0);
    const parada = indice(log, PARADA);
    const conteo = indice(log, /status = 'en_curso'/);
    const migracion = indice(log, /service create/);
    const restauracion = indice(log, RESTAURACION);

    expect(parada, 'no se paró el servicio').toBeGreaterThan(-1);
    expect(conteo, 'no se comprobaron los recibos').toBeGreaterThan(-1);
    expect(migracion, 'no se lanzó la migración').toBeGreaterThan(-1);
    expect(
      conteo,
      'el conteo de recibos tiene que ir DESPUÉS de parar la app: si va antes, ' +
        'la app puede insertar un en_curso entre el conteo y el DROP'
    ).toBeGreaterThan(parada);
    expect(migracion, 'la migración tiene que ir después del conteo').toBeGreaterThan(conteo);
    expect(restauracion, 'las réplicas tienen que restaurarse al salir').toBeGreaterThan(migracion);
  });

  it('si hay un envío en_curso aborta sin migrar y restaura las réplicas', () => {
    const { status, log, salida } = ejecutar({
      flags: ['--permitir-destructivas'],
      enCurso: true,
    });

    expect(status).toBe(1);
    expect(salida).toContain('recibo(s) en_curso');
    expect(indice(log, /service create/), 'no se puede migrar con un en_curso').toBe(-1);
    expect(indice(log, RESTAURACION)).toBeGreaterThan(-1);
  });

  it('si la migración falla restaura las réplicas igualmente', () => {
    const { status, log, salida } = ejecutar({
      flags: ['--permitir-destructivas'],
      job: 'Failed "migrate deploy"',
    });

    expect(status).toBe(1);
    expect(salida).toContain('migrate deploy falló');
    expect(
      indice(log, RESTAURACION),
      'un fallo de migración no puede dejar producción caída'
    ).toBeGreaterThan(-1);
  });
});
