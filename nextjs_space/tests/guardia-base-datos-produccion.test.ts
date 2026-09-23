import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  interpretarUrl,
  motivoBloqueo,
  exigirBaseDeDatosDePruebas,
  HOSTS_PRODUCCION,
  NOMBRES_BASE_PRODUCCION,
} from './guardia-base-datos-produccion';

/**
 * Guardia de la guardia.
 *
 * Comprueba que la suite se detiene cuando `DATABASE_URL` apunta a producción,
 * que NO se detiene contra una base desechable —una guardia que bloquea todo es
 * tan inútil como una que no bloquea nada— y que sigue cableada al arranque de
 * vitest, para que nadie la desenchufe sin que salte una prueba.
 */

const RAIZ = process.cwd();
const CONFIG_VITEST = join(RAIZ, 'vitest.config.ts');
const GLOBAL_SETUP = join(RAIZ, 'tests', 'global-setup.ts');
const MODULO_GUARDIA = join(RAIZ, 'tests', 'guardia-base-datos-produccion.ts');

const entornoOriginal = { ...process.env };

afterEach(() => {
  process.env.DATABASE_URL = entornoOriginal.DATABASE_URL;
  delete process.env.TEST_DB_HOSTS_PROHIBIDOS;
  delete process.env.TEST_DB_NOMBRES_PROHIBIDOS;
});

describe('reconocer la base de datos de producción', () => {
  it('bloquea el servicio Postgres del stack, incluso como DNS de tarea', () => {
    for (const host of ['volkern-erp_postgres', 'tasks.volkern-erp_postgres']) {
      const bloqueo = motivoBloqueo(`postgresql://volkern_erp:secreto@${host}:5432/volkern_erp`);
      expect(bloqueo?.motivo, `debería bloquear ${host}`).toBe('host');
    }
  });

  it('bloquea el VPS y todo host bajo el dominio de producción', () => {
    for (const url of [
      'postgresql://u:p@62.171.134.195:5432/volkern_erp',
      'postgresql://u:p@volkern.app:5432/volkern_erp',
      'postgresql://u:p@api.volkern.app:5432/volkern_db',
    ]) {
      expect(motivoBloqueo(url), `debería bloquear ${url}`).not.toBeNull();
    }
  });

  it('reconoce el host aunque venga en mayúsculas o con punto final', () => {
    expect(motivoBloqueo('postgresql://u:p@VOLKERN-ERP_POSTGRES:5432/volkern_erp')).not.toBeNull();
    expect(motivoBloqueo('postgresql://u:p@volkern.app.:5432/x')).not.toBeNull();
  });

  it('bloquea por nombre de base aunque el host sea local (túnel al puerto 5432)', () => {
    const bloqueo = motivoBloqueo('postgresql://volkern_erp:secreto@localhost:5432/volkern_erp');
    expect(bloqueo?.motivo).toBe('nombre');
    expect(bloqueo?.valor).toBe('volkern_erp');
    expect(motivoBloqueo('postgresql://u:p@127.0.0.1:5433/volkern_erp')).not.toBeNull();
  });

  it('acepta una base desechable local, la de CI y la que no es de producción', () => {
    for (const url of [
      'postgresql://postgres:postgres@localhost:5432/volkern_test',
      'postgresql://postgres:postgres@127.0.0.1:5432/volkern_test',
      'postgresql://user:pass@ep-algo-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require',
      'postgresql://u:p@db:5432/volkern_test',
    ]) {
      expect(motivoBloqueo(url), `no debería bloquear ${url}`).toBeNull();
    }
  });

  it('no inventa un bloqueo cuando no hay URL o no es interpretable', () => {
    for (const url of [undefined, null, '', '   ', 'mysql://u:p@localhost:3306/x', 'no-es-una-url']) {
      expect(motivoBloqueo(url as string | undefined)).toBeNull();
    }
  });

  it('permite añadir hosts y nombres prohibidos por entorno, sin tocar el código', () => {
    process.env.TEST_DB_HOSTS_PROHIBIDOS = 'base-de-otro-cliente.example, 10.0.0.7';
    expect(motivoBloqueo('postgresql://u:p@base-de-otro-cliente.example:5432/x')).not.toBeNull();
    expect(motivoBloqueo('postgresql://u:p@10.0.0.7:5432/x')).not.toBeNull();

    process.env.TEST_DB_NOMBRES_PROHIBIDOS = 'volkern_erp_staging';
    expect(motivoBloqueo('postgresql://u:p@localhost:5432/volkern_erp_staging')).not.toBeNull();
  });

  it('descompone la URL en host, puerto y base', () => {
    expect(interpretarUrl('postgresql://u:p@localhost:5433/volkern_test?sslmode=disable')).toEqual({
      host: 'localhost',
      puerto: '5433',
      baseDatos: 'volkern_test',
    });
    expect(interpretarUrl('postgresql://u:p@localhost/volkern_test')?.puerto).toBe('5432');
  });
});

describe('la suite aborta de verdad, con un mensaje que sirve', () => {
  it('lanza contra producción', () => {
    process.env.DATABASE_URL = 'postgresql://volkern_erp:secreto@volkern-erp_postgres:5432/volkern_erp';
    expect(() => exigirBaseDeDatosDePruebas()).toThrow(/producción/i);
    expect(() => exigirBaseDeDatosDePruebas()).toThrow(/volkern-erp_postgres/);
  });

  it('el mensaje explica el incidente y cómo levantar una base de pruebas', () => {
    process.env.DATABASE_URL = 'postgresql://u:p@62.171.134.195:5432/volkern_erp';
    let mensaje = '';
    try {
      exigirBaseDeDatosDePruebas();
    } catch (e) {
      mensaje = (e as Error).message;
    }
    expect(mensaje).toContain('62.171.134.195');
    expect(mensaje).toContain('11-ago-2026');
    expect(mensaje).toContain('volkern_test');
    expect(mensaje).toMatch(/no hay variable para saltarse/i);
  });

  it('no lanza contra una base desechable, y tampoco si no hay DATABASE_URL', () => {
    expect(() => exigirBaseDeDatosDePruebas('postgresql://postgres:postgres@localhost:5432/volkern_test')).not.toThrow();
    expect(() => exigirBaseDeDatosDePruebas(undefined)).not.toThrow();
  });

  it('el arranque real de vitest aborta con una URL de producción (no solo la función pura)', async () => {
    // Se ejecuta el globalSetup de verdad, el que vitest usa, para que no baste
    // con dejar la función correcta: el cableado tiene que estar vivo.
    const { default: globalSetup } = await import('./global-setup');
    process.env.DATABASE_URL = 'postgresql://volkern_erp:secreto@volkern-erp_postgres:5432/volkern_erp';
    expect(() => globalSetup()).toThrow(/producción/i);

    process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/volkern_test';
    expect(() => globalSetup()).not.toThrow();
  });
});

describe('la guardia sigue cableada y sin puerta trasera', () => {
  it('vitest la declara en globalSetup', () => {
    const config = readFileSync(CONFIG_VITEST, 'utf8');
    expect(config).toMatch(/globalSetup:\s*\[[^\]]*tests\/global-setup\.ts/);
  });

  it('el globalSetup exige la base de pruebas antes de cualquier test', () => {
    const setup = readFileSync(GLOBAL_SETUP, 'utf8');
    expect(setup).toMatch(/exigirBaseDeDatosDePruebas\s*\(/);
    expect(setup).toMatch(/dotenv|\.env/);
  });

  it('no existe ninguna variable para saltarse la guardia', () => {
    const modulo = readFileSync(MODULO_GUARDIA, 'utf8');
    for (const escapatoria of ['TEST_DB_PERMITIR', 'SKIP_DB_GUARD', 'ALLOW_PRODUCTION', 'IGNORAR_GUARDIA']) {
      expect(modulo).not.toContain(escapatoria);
    }
    // Las dos únicas variables que lee el módulo son para AMPLIAR la lista de
    // lo prohibido, nunca para reducirla.
    const declaradas = new Set(modulo.match(/'TEST_DB_[A-Z_]+'/g) ?? []);
    expect([...declaradas].sort()).toEqual(["'TEST_DB_HOSTS_PROHIBIDOS'", "'TEST_DB_NOMBRES_PROHIBIDOS'"]);
  });

  it('la lista de producción sigue incluyendo el servicio, el VPS y el dominio', () => {
    expect([...HOSTS_PRODUCCION]).toEqual(
      expect.arrayContaining(['volkern-erp_postgres', '62.171.134.195', 'volkern.app']),
    );
    expect([...NOMBRES_BASE_PRODUCCION]).toContain('volkern_erp');
  });
});
