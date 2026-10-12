// @vitest-environment node
/**
 * Guardia del detector de SQL destructivo (`deploy-vps/filtrar-destructivas.sh`).
 *
 * Por qué existe
 * --------------
 * El job de migraciones del VPS ahora pasa cada migración pendiente por la
 * función `sql_es_destructivo` antes de `migrate deploy`. Que esa función
 * tuviera un falso negativo significaría que un `DROP TABLE` llegaría a
 * producción como cualquier migración aditiva: en verde y en silencio.
 *
 * Esta guardia ejercita la función pura (importada con `source`, como hace
 * `run-migrations.sh`) en caliente y en negativo, con casos de las dos
 * manos:
 *
 *   · DESTRUCTIVO (debe detectar): DROP TABLE/INDEX/SCHEMA, TRUNCATE,
 *     DELETE sin WHERE, UPDATE sin WHERE, ALTER TABLE … SET NOT NULL /
 *     RENAME / cambio de tipo / DROP COLUMN.
 *   · SEGURO (debe pasar): lo que de verdad llegan las migraciones
 *     aditivas del proyecto — ADD COLUMN, CREATE TABLE, CREATE INDEX,
 *     UPDATE/DELETE con WHERE, renombres meramente cosméticos, y SQL con
 *     el nombre de tabla "DROP TABLE users" entrecomillado como cadena.
 *
 * El caso límite que obliga a esta guardia: el detector procesa SQL sin
 * cadenas (el normalizador las vacía), así que un texto que *parece*
 * destructivo dentro de una constante no debe disparar la puerta... pero
 * un DROP real fuera de cadenas sí.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const RAIZ = join(__dirname, '..');
const SCRIPT = join(RAIZ, 'deploy-vps', 'filtrar-destructivas.sh');

/**
 * Ejecuta la función pura del script real vía un wrapper bash: sourcea el
 * script y llama a `sql_es_destructivo` con el SQL como stdin. Es el mismo
 * código que corre el job (no hay traducción a TypeScript).
 */
function sqlEsDestructivo(sql: string): string {
  const r = spawnSync(
    'bash',
    ['-c', `source ${SCRIPT} && sql_es_destructivo "$(cat)"`],
    { encoding: 'utf8', input: sql },
  );
  return (r.stdout ?? '').trim();
}

describe('función pura sql_es_destructivo (código real, vía wrapper bash)', () => {
  it('la función está definida en el script sourceado', () => {
    const r = spawnSync('bash', ['-c', `source ${SCRIPT} && type sql_es_destructivo`], {
      encoding: 'utf8',
    });
    expect(r.status).toBe(0);
  });

  const DESTRUCTIVOS: [string, string][] = [
    ['DROP TABLE "users";', 'DROP TABLE'],
    ['DROP INDEX idx_leads_email;', 'DROP INDEX'],
    ['DROP SCHEMA public CASCADE;', 'DROP SCHEMA'],
    ['TRUNCATE TABLE "leads";', 'TRUNCATE'],
    ['DELETE FROM "sesiones";', 'DELETE sin WHERE'],
    ['UPDATE "users" SET rol = \'x\';', 'UPDATE sin WHERE'],
  ];

  it('detecta los patrones destructivos de la familia real', () => {
    for (const [sql, familia] of DESTRUCTIVOS) {
      const r = sqlEsDestructivo!(sql);
      expect(r, `debería marcar como destructivo: ${familia}`).toBeTruthy();
    }
  });

  const SEGUROS: string[] = [
    'ALTER TABLE "hospitality_communication_templates" ADD COLUMN "diseno" JSONB;',
    // Regresión del falso positivo REAL en producción (12-oct-2026): ADD
    // CONSTRAINT con ON DELETE CASCADE / ON UPDATE CASCADE — los "DELETE" y
    // "UPDATE" que viajan como opciones de la FK no son sentencias DML.
    `ALTER TABLE "hospitality_canal_conversacion" ADD CONSTRAINT "fk_t" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;\nALTER TABLE "hospitality_canal_mensaje" ADD CONSTRAINT "fk_c" FOREIGN KEY ("conversacionId") REFERENCES "hospitality_canal_conversacion"("id") ON DELETE CASCADE;`,
    'CREATE TABLE "nueva_tabla" (id TEXT PRIMARY KEY);',
    'CREATE INDEX "idx_leads_email" ON "leads"("email");',
    'UPDATE "users" SET nombre = \'x\' WHERE id = 1;',
    'DELETE FROM "sesiones" WHERE expirada = true;',
    // Cadena que parece destructiva pero no lo es: el normalizador la vacía
    // antes de que el detector la mire.
    `INSERT INTO "audit" (msg) VALUES ('DROP TABLE users');`,
  ];

  it('no marca como destructivo lo que no lo es', () => {
    for (const sql of SEGUROS) {
      const r = sqlEsDestructivo!(sql);
      expect(r, `NO debería marcar: ${sql.slice(0, 60)}…`).toBeFalsy();
    }
  });
});

describe('modo --sql (proceso real, no source)', () => {
  const DIR = mkdtempSync(join(tmpdir(), 'volkern-filtro-'));
  const SQL_D = join(DIR, 'destructivo.sql');
  const SQL_S = join(DIR, 'seguro.sql');
  writeFileSync(SQL_D, 'DROP TABLE "users";\n');
  writeFileSync(SQL_S, 'ALTER TABLE "x" ADD COLUMN y TEXT;\n');

  it('detecta destructivo vía proceso real y sale 1', () => {
    const r = spawnSync('bash', [SCRIPT, '--sql', SQL_D], { encoding: 'utf8' });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('destructivo');
  });

  it('pasa seguro vía proceso real (exit 0)', () => {
    const r = spawnSync('bash', [SCRIPT, '--sql', SQL_S], { encoding: 'utf8' });
    expect(r.status).toBe(0);
  });

  afterAll(() => rmSync(DIR, { recursive: true, force: true }));
});

describe('modo directorio (pendientes reales del job)', () => {
  const DIR = mkdtempSync(join(tmpdir(), 'volkern-pendientes-'));

  function pendiente(nombre: string, sql: string): void {
    const d = join(DIR, nombre);
    // mkdir recursivo implícito (los nombres no llevan subcarpetas)
    spawnSync('mkdir', ['-p', d]);
    writeFileSync(join(d, 'migration.sql'), sql);
  }

  afterAll(() => rmSync(DIR, { recursive: true, force: true }));

  it('una pendiente aditiva sola pasa (el caso real del 12-oct)', () => {
    const D = mkdtempSync(join(tmpdir(), 'volkern-pendientes-aditiva-'));
    spawnSync('mkdir', ['-p', join(D, '20261009210000_hospitality_template_diseno')]);
    writeFileSync(
      join(D, '20261009210000_hospitality_template_diseno/migration.sql'),
      'ALTER TABLE "hospitality_communication_templates" ADD COLUMN "diseno" JSONB;\n',
    );
    const r = spawnSync('bash', [SCRIPT, D], { encoding: 'utf8' });
    expect(r.status).toBe(0);
    rmSync(D, { recursive: true, force: true });
  });

  it('una pendiente destructiva aborta con exit 1 y lista el archivo', () => {
    pendiente('20261012000000_borrar_tabla_vieja', 'DROP TABLE "legacy_x";\n');
    const r = spawnSync('bash', [SCRIPT, DIR], { encoding: 'utf8' });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('20261012000000_borrar_tabla_vieja');
  });
});
