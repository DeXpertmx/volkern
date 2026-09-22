/**
 * db-setup — deja la base local lista de una sola vez.
 *
 *   npm run db:setup            # prepara la base (idempotente)
 *   npm run db:verify           # solo verificación, no escribe (para CI)
 *   npm run db:reset            # DESTRUYE y reconstruye desde cero (pide confirmación)
 *
 * `db:setup` sustituye la memoria tribal "ejecuta el seed, pero antes
 * migrate-multi-tenancy, pero primero db push, y si sale P3005 pregunta a
 * Bruno" por un único comando. El detalle técnico de cada paso vive en
 * docs/PRISMA-BASELINE.md.
 *
 * Modo ensure (db:setup):
 *   1. Verifica conectividad con la base (mensaje útil si no hay .env o red).
 *   2. Aplica migraciones (`prisma migrate deploy`). Si la base nunca se
 *      baselinó (P3005, era `db push`), guía al baseline de docs/PRISMA-BASELINE.md
 *      en vez de intentarlo a ciegas.
 *   3. Asegura el tenant `volkern-default` y sus roles (`migrate-multi-tenancy.ts`),
 *      que el seed exige y que en una base vacía no existen.
 *   4. Seed idempotente (`prisma db seed`).
 *   5. Verificación: consultas de humo (users/tenants/tablas del esquema) y
 *      `prisma migrate status` limpio.
 *
 * Modo check (db:verify) — no escribe nada:
 *   - Estado de migraciones y humo (tenants/users/tablas).
 *   - Detección de DRIFT: `prisma migrate diff --from-migrations
 *     --shadow-database-url … --to-schema-datamodel --exit-code` — la historia
 *     de migraciones debe reproducir schema.prisma EXACTO (0_init). Requiere
 *     SHADOW_DATABASE_URL apuntando a una base VACÍA. Es lo que ejecuta el
 *     workflow .github/workflows/db-drift.yml en cada PR.
 *
 * Modo reset (db:reset) — destrucción y reconstrucción desde cero:
 *   - Muestra QUÉ va a destruir (host/base de DATABASE_URL + recuentos) y
 *     pide confirmación escribiendo RECONSTRUIR (o `--force` para CI/scripts).
 *   - DROP SCHEMA public CASCADE + CREATE SCHEMA public, y después el mismo
 *     flujo que ensure: migrate deploy (aplica 0_init y las que vengan),
 *     tenant, seed y humo. La base queda como un despliegue fresco.
 */

import { PrismaClient } from '@prisma/client';
import { execSync, spawnSync } from 'node:child_process';
import { mkdirSync, statSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { Client } from 'pg';

const prisma = new PrismaClient();

/** Ejecuta un comando CLI heredando stdio; corta con mensaje claro si falla. */
function run(cmd: string, paso: string): void {
  console.log(`\n▶ ${paso}`);
  try {
    execSync(cmd, { stdio: 'inherit' });
  } catch {
    console.error(`\n❌ Falló: ${paso}`);
    console.error(`   Comando: ${cmd}`);
    process.exit(1);
  }
}

/** Ejecuta un comando capturando salida; devuelve { ok, salida }. */
function runCaptura(cmd: string): { ok: boolean; salida: string } {
  try {
    const salida = execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { ok: true, salida };
  } catch (err) {
    const e = err as { stdout?: string | Buffer; stderr?: string | Buffer };
    const salida = [e.stdout, e.stderr].map((s) => (s ? s.toString() : '')).join('\n');
    return { ok: false, salida };
  }
}

/** P3005: base con esquema pero sin historial de migraciones (era db push). */
function esP3005(err: unknown): boolean {
  const texto = err instanceof Error ? `${err.message}\n${(err as { stdout?: Buffer }).stdout ?? ''}` : String(err);
  return texto.includes('P3005');
}

/**
 * Mata TODOS los demás backends de ESTA base (cualquier estado): retienen el
 * advisory lock de Prisma (SELECT pg_advisory_lock(72707369)) o dejan el
 * pooler con cachés del esquema viejo ('no schema has been selected'), y
 * pueden estar idle, idle in transaction o esperando el lock.
 *
 * Se hace por una conexión DIRECTA (sin '-pooler', convención Neon): a través
 * del pooler solo se ven los backends asignados al cliente actual — los que
 * quedaron en el pool sin asignar son invisibles en pg_stat_activity y son
 * justo los que retienen locks huérfanos de CLI de Prisma anteriores. En
 * Postgres local o el postgres efímero de CI no hay nada que matar y esta
 * función no encuentra nada.
 */
async function terminarBackendsDeLaBase(dsn: string): Promise<number> {
  const directa = dsn.replace('-pooler', '');
  const conSsl = /sslmode=/.test(directa) ? directa : `${directa}${directa.includes('?') ? '&' : '?'}sslmode=require`;
  const cliente = new Client({ connectionString: conSsl });
  try {
    await cliente.connect();
    const r = await cliente.query<{ pid: number }>(
      'SELECT pid FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid()'
    );
    let muertas = 0;
    for (const fila of r.rows) {
      try {
        await cliente.query('SELECT pg_terminate_backend($1)', [fila.pid]);
        muertas += 1;
      } catch {
        // La sesión pudo morir sola entre la consulta y el terminate.
      }
    }
    return muertas;
  } catch {
    // Sin conexión directa posible (host sin variante directa, red, etc.):
    // mejor esfuerzo por la conexión de Prisma, que al menos ve los suyos.
    try {
      const r = await prisma.$queryRawUnsafe<{ pid: number }>(
        'SELECT pid FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid()'
      );
      let muertas = 0;
      for (const { pid } of r) {
        try {
          await prisma.$executeRawUnsafe(`SELECT pg_terminate_backend(${Number(pid)})`);
          muertas += 1;
        } catch {
          // Murió sola.
        }
      }
      return muertas;
    } catch {
      return 0;
    }
  } finally {
    try {
      await cliente.end();
    } catch {
      // Ya estaba cerrado.
    }
  }
}

/** Pregunta por terminal y devuelve la respuesta recortada (vacía si no hay TTY). */
async function preguntar(pregunta: string): Promise<string> {
  if (!process.stdin.isTTY) return '';
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (await rl.question(pregunta)).trim();
  } finally {
    rl.close();
  }
}

/** Host/base/usuario de DATABASE_URL sin volcar la contraseña. */
function describirDsn(dsn: string): string {
  try {
    const u = new URL(dsn);
    return `${u.username ? `${u.username}@` : ''}${u.hostname}${u.port ? `:${u.port}` : ''}${u.pathname}`;
  } catch {
    return '(DATABASE_URL no es una URL interpretable)';
  }
}

/** Nombre del volcado: backup-db-<fecha UTC>-<base>.sql, en el directorio actual. */
function nombreVolcado(dsn: string): string {
  const sello = new Date().toISOString().replace(/[T:]/g, '-').slice(0, 19);
  let base = 'db';
  try {
    base = new URL(dsn).pathname.split('/').filter(Boolean).pop() ?? 'db';
  } catch {
    // DSN raro: nos quedamos con el genérico.
  }
  return `backup-db-${sello}-${base}.sql`;
}

/**
 * Volcado de seguridad previo al drop, con pg_dump (esquema + datos, en SQL
 * plano para restaurarlo con psql contra cualquier base; --no-owner
 * --no-privileges para que no choque con roles distintos al volcar).
 */
function crearVolcadoPg(dsn: string, destino: string): { ok: true } | { ok: false; detalle: string } {
  mkdirSync('.', { recursive: true });
  const r = spawnSync('pg_dump', ['--no-owner', '--no-privileges', '--file', destino, dsn], {
    stdio: ['ignore', 'ignore', 'pipe'],
    encoding: 'utf8',
  });
  if (r.error) {
    const noInstalado = (r.error as NodeJS.ErrnoException).code === 'ENOENT';
    return { ok: false, detalle: noInstalado ? 'pg_dump no está instalado o no está en el PATH.' : r.error.message };
  }
  if (r.status !== 0) {
    return { ok: false, detalle: (r.stderr ?? '').split('\n').filter(Boolean).slice(0, 3).join('\n   ') || `exit code ${r.status}` };
  }
  const kb = (statSync(destino).size / 1024).toFixed(1);
  console.log(`   ✓ Volcado creado: ${destino} (${kb} KB)`);
  return { ok: true };
}

/**
 * Volcado alternativo cuando pg_dump no está disponible o su versión es
 * anterior a la del servidor (p. ej. pg_dump 16 contra Neon 17): vuelca TODAS
 * las tablas públicas a JSON vía Prisma. No es restaurable con psql, pero
 * preserva los datos — su único trabajo es que el drop no deje sin salida.
 */
async function exportarConPrisma(destino: string): Promise<void> {
  console.log('   Exportando todas las tablas públicas a JSON vía Prisma (puede tardar)...');
  const tablas = (
    await prisma.$queryRawUnsafe<{ table_name: string }[]>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name`
    )
  ).map((r) => r.table_name);
  const datos: Record<string, unknown[]> = {};
  for (const tabla of tablas) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(tabla)) continue; // nombre raro: no va interpolado a SQL
    const filas: unknown[] = [];
    for (let offset = 0; ; offset += 1000) {
      const lote = await prisma.$queryRawUnsafe<unknown[]>(`SELECT * FROM "public"."${tabla}" LIMIT 1000 OFFSET ${offset}`);
      filas.push(...lote);
      if (lote.length < 1000) break;
    }
    datos[tabla] = filas;
  }
  writeFileSync(
    destino,
    JSON.stringify({ generado: new Date().toISOString(), motor: 'prisma-json', tablas: datos }, (_k, v) => (typeof v === 'bigint' ? v.toString() : v), 2)
  );
  const mb = (statSync(destino).size / (1024 * 1024)).toFixed(1);
  console.log(`   ✓ Volcado alternativo (JSON, ${tablas.length} tablas): ${destino} (${mb} MB)`);
}

/**
 * Garantiza el respaldo antes del drop: pg_dump primero; si falla, ofrece el
 * export alternativo (automático con --force, preguntado en interactivo). Si
 * no hay volcado de ningún tipo, ABORTA sin drop: la base queda intacta.
 */
async function asegurarVolcado(dsn: string, destino: string, force: boolean): Promise<void> {
  const r = crearVolcadoPg(dsn, destino);
  if (r.ok) return;
  console.error('\n❌ pg_dump no pudo crear el volcado (no se ha borrado nada).');
  if (r.detalle) console.error(`   Detalle: ${r.detalle}`);
  if (/version mismatch/i.test(r.detalle)) {
    console.error('   Causa típica: pg_dump es más antiguo que el servidor (p. ej. pg_dump 16 contra');
    console.error('   Neon 17). Instala el cliente que iguala la versión del servidor para volcar SQL nativo.');
  }
  console.error('   El drop NO se ha ejecutado: la base está intacta.');
  const destinoJson = destino.replace(/\.sql$/, '.json');
  if (force) {
    console.log('   --force: se crea volcado alternativo con Prisma (JSON) y se continúa.');
    await exportarConPrisma(destinoJson);
    return;
  }
  const resp = await preguntar(`\n¿Crear volcado alternativo con Prisma (JSON: ${destinoJson}) y continuar? [S/n]: `);
  if (/^(n|no)$/i.test(resp)) {
    console.error('   Sin volcado no se continúa. Relanza con --sin-volcado para saltarlo a conciencia.');
    process.exit(1);
  }
  await exportarConPrisma(destinoJson);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const soloCheck = argv.includes('--check');
  const reset = argv.includes('--reset');
  const force = argv.includes('--force');
  // Volcado de seguridad previo al drop: en interactivo se pregunta, con
  // --force se hace siempre (CI lo omite con --sin-volcado) y con
  // --sin-volcado se salta a conciencia.
  const sinVolcado = argv.includes('--sin-volcado');
  const dsn = process.env.DATABASE_URL ?? '';

  // ── 1. Conectividad ──────────────────────────────────────────────────────
  if (reset) {
    console.log('💥 db-setup — RECONSTRUCCIÓN de la base desde cero\n');
  } else if (soloCheck) {
    console.log('🛠  db-setup — verificación (solo lectura)\n');
  } else {
    console.log('🛠  db-setup — preparación de la base local\n');
  }

  console.log('▶ Verificando conectividad...');
  try {
    await prisma.$queryRawUnsafe('SELECT 1');
    console.log('   ✓ Base accesible');
  } catch (e) {
    console.error('❌ No se pudo conectar a DATABASE_URL.');
    console.error('   Revisa que .env exista (copiar de .env.example) y que la base acepte conexiones.');
    console.error(`   Detalle: ${e instanceof Error ? e.message.split('\n')[0] : e}`);
    process.exit(1);
  }

  // ── 2. Solo reset: resumen, confirmación y DROP ──────────────────────────
  // El drop va DESPUÉS de la confirmación y se hace contra el DSN real de
  // DATABASE_URL: nada de "casi seguro es la base de test".
  if (reset && !force) {
    const [tenants, users, tablas] = await Promise.all([
      prisma.tenant.count(),
      prisma.user.count(),
      prisma.$queryRawUnsafe<{ n: number }>(
        `SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public'`
      ).then((r) => r[0].n),
    ]);

    console.log('\nEsto va a BORRAR TODO el esquema y los datos de:');
    console.log(`   ${describirDsn(dsn)}`);
    console.log(`   (${tenants} tenant(s) · ${users} usuario(s) · ${tablas} tabla(s))`);
    console.log('y a reconstruirlo desde cero: migraciones + tenant + seed.');

    const texto = await preguntar('\nEscribe RECONSTRUIR para confirmar (cualquier otra cosa cancela): ');
    if (texto !== 'RECONSTRUIR') {
      console.log(texto === '' ? 'Cancelado (sin confirmación): no se tocó nada.' : 'Cancelado: no se tocó nada.');
      process.exit(0);
    }
  }

  if (reset) {
    // Respaldo ANTES de tocar nada. Si el volcado falla, se aborta sin drop:
    // la base queda intacta y el operador decide (reintentar o --sin-volcado).
    if (sinVolcado) {
      console.log('\n▶ Volcado de seguridad omitido (--sin-volcado)');
    } else if (force) {
      console.log('\n▶ Volcado de seguridad (pg_dump) antes del drop...');
      await asegurarVolcado(dsn, nombreVolcado(dsn), true);
    } else {
      const quiere = await preguntar('\n¿Crear volcado de seguridad (pg_dump) antes de borrar? [S/n]: ');
      if (/^(n|no)$/i.test(quiere)) {
        console.log('   Continúas sin volcado, bajo tu responsabilidad.');
      } else {
        console.log('\n▶ Volcado de seguridad (pg_dump) antes del drop...');
        await asegurarVolcado(dsn, nombreVolcado(dsn), false);
      }
    }

    console.log('\n▶ Drop del esquema público (DROP SCHEMA public CASCADE)...');
    try {
      await prisma.$executeRawUnsafe('DROP SCHEMA public CASCADE');
      await prisma.$executeRawUnsafe('CREATE SCHEMA public');
    } catch (e) {
      console.error('❌ No se pudo vaciar el esquema.');
      console.error(`   Detalle: ${e instanceof Error ? e.message.split('\n')[0] : e}`);
      process.exit(1);
    }
    // El pool de ESTE proceso queda con prepared statements huérfanos tras el
    // drop: se cierra para que todo lo que sigue use conexiones nuevas.
    await prisma.$disconnect();
    // Los backends IDLE que el pooler mantenía abiertos conservan cachés del
    // esquema viejo (el public recreado tiene otro OID) y revientan el deploy
    // con 'no schema has been selected to create in'. Se terminan ANTES de
    // que prisma toque la base de nuevo.
    const muertas = await terminarBackendsDeLaBase(dsn);
    if (muertas > 0) console.log(`   ✓ ${muertas} sesión(es) idle del pooler terminada(s) (cachés del esquema viejo)`);
    console.log('   ✓ Esquema eliminado y recreado vacío');
  }

  // ── 3. Migraciones ───────────────────────────────────────────────────────
  // `deploy` aplica las pendientes; si la historia está al día no hace nada.
  // `dev` NO se usa aquí: puede generar migraciones y pedir confirmación.
  // En modo --check solo se LEE el estado (deploy toma un advisory lock).
  let necesitaBaseline = false;
  if (soloCheck) {
    run('npx prisma migrate status', 'Estado de migraciones (--check: solo lectura)');
  } else {
    console.log(reset ? '\n▶ Aplicando migraciones desde cero (prisma migrate deploy)...' : '\n▶ Aplicando migraciones (prisma migrate deploy)...');
    try {
      // Con 'pipe' la salida queda capturada para diagnosticar el fallo; en
      // éxito y en error se re-emitte aquí para que el operador la vea igual.
      process.stdout.write(execSync('npx prisma migrate deploy', { stdio: ['inherit', 'pipe', 'pipe'] }).toString());
    } catch (err) {
      const e = err as { stdout?: Buffer | string; stderr?: Buffer | string };
      if (e?.stdout) process.stdout.write(e.stdout.toString());
      if (e?.stderr) process.stderr.write(e.stderr.toString());
      const texto = [e?.message, e?.stdout?.toString(), e?.stderr?.toString()].filter(Boolean).join('\n');
      if (esP3005(err)) {
        necesitaBaseline = true;
        console.error('\n❌ La base tiene esquema pero NUNCA se baselinó (P3005, era `db push`).');
        console.error('   Sigue la guía docs/PRISMA-BASELINE.md (sección "Lo que se hizo"):');
        console.error('     1) crea la shadow DB y configura SHADOW_DATABASE_URL;');
        console.error('     2) archiva prisma/migrations y genera 0_init con `migrate diff --from-empty --to-schema-datamodel --script`;');
        console.error('     3) `prisma migrate resolve --applied 0_init`.');
        console.error('   Es una operación de una sola vez por base; este script no la automatiza');
        console.error('   a propósito: toca decidir sobre la base que sea (dev/staging/prod).');
        process.exit(1);
      }
      if (texto.includes('advisory lock') || texto.includes('no schema has been selected')) {
        // Servidores remotos con pooler (Neon): sesiones idle de procesos
        // anteriores retienen el lock o cachés del esquema viejo. Se matan
        // y se reintenta UNA vez.
        console.log('\n⚠  Sesiones idle del pooler reteniendo lock o estado viejo (servidor remoto).');
        const muertas = await terminarBackendsDeLaBase(dsn);
        if (muertas > 0) {
          console.log(`   ${muertas} sesión(es) idle terminada(s); reintentando...`);
          try {
            process.stdout.write(execSync('npx prisma migrate deploy', { stdio: ['inherit', 'pipe', 'pipe'] }).toString());
          } catch (err2) {
            const e2 = err2 as { stdout?: Buffer | string; stderr?: Buffer | string };
            if (e2?.stdout) process.stdout.write(e2.stdout.toString());
            if (e2?.stderr) process.stderr.write(e2.stderr.toString());
            console.error('\n❌ El reintento volvió a fallar. Cierra otras terminales con comandos prisma y vuelve a lanzar db:setup.');
            process.exit(1);
          }
        } else {
          console.error('\n❌ Otro proceso de Prisma ACTIVO tiene el lock de migraciones (timeout de 10s).');
          console.error('   Cierra otras terminales con comandos prisma corriendo y reintenta.');
          process.exit(1);
        }
      } else {
        throw err;
      }
    }
  }

  // ── 4. Tenant + roles que el seed exige ──────────────────────────────────
  // En una base recién migrada el seed falla sin este paso previo.
  if (!soloCheck) {
    const volkernDefault = await prisma.tenant.findUnique({ where: { slug: 'volkern-default' }, select: { id: true } });
    if (volkernDefault) {
      console.log('\n▶ Tenant volkern-default ya existe (seed podrá correr)');
    } else {
      run('npx tsx scripts/migrate-multi-tenancy.ts', 'Creando tenant volkern-default y roles (migrate-multi-tenancy.ts)');
    }

    run('npx prisma db seed', 'Seed idempotente (prisma db seed)');
  }

  // ── 5. Verificación de humo ──────────────────────────────────────────────
  // Tras un reset el pool se cerró: se reconecta aquí.
  await prisma.$connect();
  console.log('\n▶ Verificación de humo...');
  const tenants = await prisma.tenant.count();
  const users = await prisma.user.count();
  const tablas = await prisma.$queryRawUnsafe<{ n: number }>(
    `SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public'`
  );
  console.log(`   tenants: ${tenants} · users: ${users} · tablas públicas: ${tablas[0].n}`);

  if (tenants === 0 || users === 0) {
    console.error('❌ La base quedó sin tenant o sin users: algo falló en el seed. Revisa la salida de arriba.');
    process.exit(1);
  }
  if (tablas[0].n < 100) {
    console.error(`❌ Solo ${tablas[0].n} tablas públicas: el esquema no se aplicó completo.`);
    process.exit(1);
  }

  if (!soloCheck) {
    run('npx prisma migrate status', 'Estado de migraciones');
  }

  // ── 6. Chequeo de drift (solo --check) ───────────────────────────────────
  // La historia de migraciones debe reproducir schema.prisma EXACTO: si un
  // PR cambia el esquema sin generar su migración (o la genera a mano mal),
  // esto falla. Requiere SHADOW_DATABASE_URL (base VACÍA); si falta, avisa
  // sin fallar — el humo ya corrió.
  if (soloCheck && !necesitaBaseline) {
    const shadow = process.env.SHADOW_DATABASE_URL?.trim();
    if (!shadow) {
      console.log('\n⚠  SHADOW_DATABASE_URL no definida: se omite el chequeo de drift de migraciones.');
      console.log('   Configúrala (docs/PRISMA-BASELINE.md) para validarlo también.');
    } else {
      console.log('\n▶ Chequeo de drift: migraciones vs schema.prisma...');
      const diff = runCaptura(
        'npx prisma migrate diff --from-migrations prisma/migrations ' +
          `--shadow-database-url ${JSON.stringify(shadow)} ` +
          '--to-schema-datamodel prisma/schema.prisma --exit-code'
      );
      if (diff.ok) {
        console.log('   ✓ Sin drift: la historia de migraciones reproduce el esquema exacto.');
      } else if (/already exists/i.test(diff.salida)) {
        console.error('❌ La shadow database no está vacía, no se pudo calcular el diff.');
        console.error('   Vacíala con: DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
        console.error(`   Detalle: ${diff.salida.trim().split('\n').slice(-3).join(' | ')}`);
        process.exit(1);
      } else {
        console.error('❌ DRIFT detectado: las migraciones NO reproducen schema.prisma.');
        console.error('   Suele significar que un PR cambió el esquema sin generar su migración');
        console.error('   (`npx prisma migrate dev --name ...`) o editó una migración ya aplicada.');
        console.error('   Diff:');
        console.error(diff.salida.trim() || '(vacío)');
        process.exit(1);
      }
    }
  }

  if (necesitaBaseline) {
    console.log('\n⚠  Terminó, pero recuerda baselinar (ver arriba) para poder migrar en el futuro.');
  } else if (reset) {
    console.log('\n✅ Base reconstruida desde cero y lista. Arranca con `npm run dev`.');
  } else {
    console.log(soloCheck ? '\n✅ Verificación completa: base y migraciones en orden.' : '\n✅ Base local lista. Arranca con `npm run dev`.');
  }
}

main()
  .catch((e) => {
    console.error('\n❌ db-setup falló:', e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
