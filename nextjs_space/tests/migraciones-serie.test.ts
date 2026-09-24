// @vitest-environment node
/**
 * Guardia de la serie de migraciones Prisma (infraestructura).
 *
 * Historia: el baseline `0_init` absorbió el estado de producción de sep 2026,
 * pero quedaron en el directorio las 10 migraciones anteriores cuyas tablas ya
 * estaban dentro del baseline. Resultado: `prisma migrate deploy` sobre una
 * base VACÍA moría con `42P07: relation already exists` (las tablas se creaban
 * dos veces). Producción no lo notaba porque está baselinada
 * (`0_init` con applied_steps=0); cualquier entorno nuevo sí.
 *
 * Reglas que esta guardia congela:
 *   1. Ningún objeto (tabla, índice, tipo) puede crearse en dos migraciones.
 *   2. Las 10 carpetas retiradas NO vuelven (su contenido vive en 0_init).
 *   3. El baseline conserva las tablas clave de la absorción.
 *
 * La validación completa (migrate deploy desde cero + diff vacío contra el
 * esquema) se hizo el 24 sep 2026 sobre un PostgreSQL temporal; ver el
 * registro del runbook. Esta guardia impide recaer sin necesidad de una BD.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = join(__dirname, '..');
const DIR = join(RAIZ, 'prisma', 'migrations');

const CARPETAS_RETIRADAS = [
  '20260907_add_platform_whatsapp_instance',
  '20260909_add_connectivity_provider',
  '20260909_add_hospitality_sync_logs',
  '20260909_add_hospitality_tasks',
  '20260909_add_hospitality_webhook',
  '20260910_add_hospitality_communication_templates',
  '20260910_add_hospitality_rate_plans',
  '20260911_add_automation_action_executions',
  '20260911_add_hospitality_finance',
  '20260911_add_hospitality_unit_blocks',
];

const TABLAS_CLAVE_DEL_BASELINE = [
  'platform_whatsapp_instances',
  'connectivity_providers',
  'hospitality_sync_logs',
  'hospitality_units',
  'hospitality_reservations',
  'automation_action_executions',
];

function migraciones(): string[] {
  return readdirSync(DIR).filter((d) => {
    try {
      return statSync(join(DIR, d)).isDirectory();
    } catch {
      return false;
    }
  });
}

function sqlDe(m: string): string {
  return readFileSync(join(DIR, m, 'migration.sql'), 'utf8');
}

function objetos(
  sql: string,
  tipo: 'TABLE' | 'INDEX' | 'TYPE',
): { nombre: string; idempotente: boolean }[] {
  const patrones: Record<string, RegExp> = {
    TABLE: /CREATE TABLE (IF NOT EXISTS )?"([^"]+)"/g,
    INDEX: /CREATE (?:UNIQUE )?INDEX (?:CONCURRENTLY )?(IF NOT EXISTS )?"([^"]+)"/g,
    TYPE: /CREATE TYPE (IF NOT EXISTS )?"([^"]+)"/g,
  };
  return [...sql.matchAll(patrones[tipo])].map((m) => ({
    idempotente: Boolean(m[1]),
    nombre: m[2],
  }));
}

describe('serie de migraciones Prisma', () => {
  it('existe el baseline 0_init y sus tablas clave de la absorción', () => {
    expect(migraciones()).toContain('0_init');
    const init = sqlDe('0_init');
    for (const t of TABLAS_CLAVE_DEL_BASELINE) {
      expect(init, `0_init debe crear "${t}"`).toMatch(
        new RegExp(`CREATE TABLE "${t}" \\(`),
      );
    }
  });

  it('ningún objeto se crea dos veces sin ser idempotente (nada que falle)', () => {
    const vistos = new Map<
      string,
      { primera: string; conIfNotExists: boolean }[]
    >();
    for (const m of migraciones()) {
      const sql = sqlDe(m);
      for (const tipo of ['TABLE', 'INDEX', 'TYPE'] as const) {
        for (const { nombre, idempotente } of objetos(sql, tipo)) {
          const clave = `${tipo}:${nombre}`;
          const previas = vistos.get(clave) ?? [];
          vistos.set(clave, [...previas, { primera: m, conIfNotExists: idempotente }]);
        }
      }
    }
    // Regla: la PRIMERA creación debe ser sin IF NOT EXISTS (contrato de
    // Prisma), y cualquier RE-creación posterior debe ser idempotente
    // (IF NOT EXISTS), que es como conviven los artefactos de merge.
    const rotos = [...vistos.entries()]
      .filter(([, ocurrencias]) => ocurrencias.length > 1)
      .filter(([, ocurrencias]) =>
        ocurrencias.some((o, i) => i > 0 && !o.conIfNotExists),
      )
      .map(
        ([clave, ocurrencias]) =>
          `${clave} en ${ocurrencias.map((o) => o.primera).join(', ')}`,
      );
    expect(
      rotos,
      're-creaciones no idempotentes: morirían con 42P07/42710 en una base nueva',
    ).toEqual([]);
  });

  it('las carpetas de las migraciones absorbidas no vuelven', () => {
    const presentes = migraciones();
    const reaparecidas = CARPETAS_RETIRADAS.filter((c) =>
      presentes.includes(c),
    );
    expect(
      reaparecidas,
      'migraciones cuyo DDL ya vive en 0_init (si necesitas ese DDL, va al baseline o con IF NOT EXISTS justificado en el runbook)',
    ).toEqual([]);
  });
});
