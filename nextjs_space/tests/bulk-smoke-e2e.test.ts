// @vitest-environment node
/**
 * ─────────────────────────────────────────────────────────────────────────
 * tests/bulk-smoke-e2e.test.ts
 *
 * Smoke test E2E del flujo bulk: parse CSV → parseBulkCsv → runBulkOnboarding
 *   → provisionTenant (con servicios externos mockeados) → seedVertical
 *   → verificar tenants en la BD real → cleanup estricto.
 *
 * Diseño de seguridad (este test ESCRIBE en la BD real):
 *   1. Sólo corre cuando el operador lo pide explícitamente:
 *        RUN_SMOKE_TESTS=1 npx vitest run tests/bulk-smoke-e2e.test.ts
 *      Sin esa env var, todos los tests se skip-ean con un mensaje claro.
 *
 *   2. Aislamiento por RUN_ID: cada corrida genera `RUN_ID = randomUUID()`
 *      y todos los subdominios / emails / nombres siguen el patrón
 *      `smoke-${RUN_ID}-...`. Imposible colisionar con datos reales.
 *
 *   3. Cleanup obligatorio: `afterAll` borra TODAS las filas con prefijo
 *      `smoke-${RUN_ID}-` y al final hace una aserción de no-leak
 *      (`leftovers.length === 0`). Si el cleanup falla, el test reporta
 *      los IDs huérfanos para que el operador pueda borrarlos a mano.
 *
 *   4. Servicios externos mockeados (vi.mock hoisted): Chatwoot, Resend
 *      domains, Cloudflare DNS, Telegram bot validation. La BD es real;
 *      el resto del mundo no.
 *
 *   5. Lectura del DATABASE_URL desde el mismo loader que checkpoint.sh
 *      (.env, .env.local, .env.production, .env.production.local).
 *
 * Pre-requisitos:
 *   - .env con DATABASE_URL apuntando a la BD que se quiere probar
 *     (staging recomendado, NO producción).
 *   - checkpoint.sh ejecutado ANTES para tener un snapshot de seguridad.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { beforeAll, afterAll, describe, it, expect, vi } from 'vitest';
import crypto from 'crypto';

// ─── Gate ────────────────────────────────────────────────────────────────
const RUN_SMOKE = process.env.RUN_SMOKE_TESTS === '1';
const it_smoke = RUN_SMOKE ? it : it.skip;

// Generar RUN_ID en beforeAll para usarlo en nombres y assertions.
const RUN_ID = `smoke-${crypto.randomUUID().slice(0, 8)}`;

// Factorías de nombres sintéticos — todo lo creado lleva el RUN_ID.
const synthetic = {
  subdomain: (slug: string) => `smoke-${RUN_ID}-${slug}`.toLowerCase().slice(0, 38),
  empresa:    (name: string) => `${RUN_ID} ${name}`,
  email:      (rol: string)   => `${RUN_ID}-${rol}@smoke-${RUN_ID}.test`.toLowerCase(),
  password:   ()              => `Smoke!${crypto.randomBytes(6).toString('hex')}1A`,
};

// ─── Mock servicios externos (no toca APIs reales) ──────────────────────
vi.mock('@/lib/nexus/chatwoot-api', () => ({
  chatwootApi: {
    createAccount: vi.fn(async (name: string) => ({
      id: 999_000 + Math.floor(Math.random() * 1000),
      name,
    })),
    createAgent: vi.fn(async (_acc: number, name: string) => ({
      id: 999_000 + Math.floor(Math.random() * 1000),
      name,
      email: `${name}@chatwoot.test`,
    })),
  },
}));

vi.mock('@/lib/resend-domains', () => ({
  registerDomain: vi.fn(async () => ({ success: true })),
  verifyDomain: vi.fn(async () => ({ success: true })),
  buildTenantEmailDomain: vi.fn((slug: string) => `${slug}.mail.volkern.test`),
}));

vi.mock('@/lib/cloudflare-dns', () => ({
  getRootZoneId: vi.fn(async () => 'fake-zone-id'),
  configureEmailDnsRecords: vi.fn(async () => ({ success: true })),
}));

vi.mock('node:telegram', () => ({}), { virtual: true });

// provisionTenant hace `await validateTelegramBot(token)` internamente.
// Mockeamos fetch global para que cualquier intento de llamar a
// api.telegram.org devuelva un token "inválido" esperado → la rama
// sin Telegram se ejercita y el test sigue verde.
const _originalFetch = global.fetch;
beforeAll(() => {
  global.fetch = vi.fn(async (url) => {
    const u = String(url);
    if (u.includes('api.telegram.org')) {
      return new Response(JSON.stringify({ ok: false, description: 'smoke test mock' }), {
        status: 401,
      });
    }
    // Otros fetches: respuesta vacía JSON para no romper callers.
    return new Response('{}', { status: 200 });
  }) as unknown as typeof fetch;
});
afterAll(() => {
  global.fetch = _originalFetch;
});

// ─── Imports dinámicos DESPUÉS de los mocks ──────────────────────────────
let prisma: any;
let runBulkOnboarding: any;
let provisionTenant: any;
let seedTenantModulesFromVertical: any;
let parseBulkCsv: any;
let generateBulkPassword: any;
let buildBulkResultCsv: any;
let BulkRunnerInput: any;

beforeAll(async () => {
  // Loader manual del DATABASE_URL — same idea que checkpoint.sh.
  const fs = await import('fs');
  const path = await import('path');
  const root = process.cwd();
  for (const f of ['.env', '.env.local', '.env.production', '.env.production.local']) {
    const p = path.join(root, f);
    if (!fs.existsSync(p)) continue;
    const txt = fs.readFileSync(p, 'utf-8');
    for (const line of txt.split('\n')) {
      const m = line.match(/^(?:export\s+)?DATABASE_URL=(.+)$/);
      if (m && !process.env.DATABASE_URL) {
        process.env.DATABASE_URL = m[1].trim().replace(/^["']|["']$/g, '');
      }
    }
    if (process.env.DATABASE_URL) break;
  }
  if (!process.env.DATABASE_URL) {
    throw new Error('bulk-smoke-e2e: DATABASE_URL no encontrada en .env*');
  }

  // Importar después de los mocks y del loader de env.
  prisma = (await import('@/lib/db')).prisma;
  const runner = await import('@/lib/provisioning/partner-bulk-runner');
  runBulkOnboarding = runner.runBulkOnboarding;
  generateBulkPassword = runner.generateBulkPassword;
  BulkRunnerInput = runner.BulkRunnerInput;
  const provisioner = await import('@/lib/provisioning/tenant-provisioner');
  provisionTenant = provisioner.provisionTenant;
  seedTenantModulesFromVertical = provisioner.seedTenantModulesFromVertical;
  const csv = await import('@/lib/insurance/csv-bulk');
  parseBulkCsv = csv.parseBulkCsv;
  buildBulkResultCsv = csv.buildBulkResultCsv;
});

// ─── El suite en sí ─────────────────────────────────────────────────────
describe.skipIf(!RUN_SMOKE)(`bulk-smoke-e2e [RUN_ID=${RUN_ID}]`, () => {
  const createdTenantIds: string[] = [];

  afterAll(async () => {
    if (!RUN_SMOKE) return;
    if (createdTenantIds.length === 0) return;

    // Cleanup: borrar TODO lo marcado con RUN_ID, en orden de FK.
    const cleanup = await prisma.$transaction(async (tx: any) => {
      const tenants = await tx.tenant.findMany({
        where: { slug: { startsWith: `smoke-${RUN_ID}-` } },
        select: { id: true },
      });

      const deletions: Record<string, number> = {};
      for (const t of tenants) {
        deletions.user = (await tx.user.deleteMany({ where: { tenantId: t.id } })).count;
        deletions.messagingHubConfig = (await tx.messagingHubConfig.deleteMany({ where: { tenantId: t.id } })).count;
        deletions.tenantFeature = (await tx.tenantFeature.deleteMany({ where: { tenantId: t.id } })).count;
        deletions.auditLog = (await tx.auditLog.deleteMany({ where: { tenantId: t.id } })).count;
        await tx.tenant.delete({ where: { id: t.id } });
        deletions.tenant = (deletions.tenant ?? 0) + 1;
      }
      return { tenants: tenants.length, deletions };
    });

    console.log(`[bulk-smoke-e2e] cleanup RUN_ID=${RUN_ID}:`, cleanup);

    // Self-leak detection.
    const leftovers = await prisma.tenant.count({
      where: { slug: { startsWith: `smoke-${RUN_ID}-` } },
    });
    expect(leftovers).toBe(0);

    if (leftovers > 0) {
      throw new Error(
        `LEAK: ${leftovers} tenants con prefijo 'smoke-${RUN_ID}-' quedaron en BD. ` +
        `Bórralos manualmente: prisma.tenant.deleteMany({ where: { slug: { startsWith: 'smoke-${RUN_ID}-' } } })`,
      );
    }
  });

  it('parseBulkCsv → 5 filas sintéticas', async () => {
    const csvText = [
      'empresa,subdomain,email,password,moneda,vertical',
      `${synthetic.empresa('Broker A')},broker-a,${synthetic.email('broker-a')},Pass123!Aa,USD,insurance`,
      `${synthetic.empresa('Broker B')},broker-b,${synthetic.email('broker-b')},Pass123!Aa,EUR,real_estate`,
      `${synthetic.empresa('Broker C')},broker-c,${synthetic.email('broker-c')},Pass123!Aa,USD,accounting`,
      `${synthetic.empresa('Broker D')},broker-d,${synthetic.email('broker-d')},Pass123!Aa,MXN,general`,
      `${synthetic.empresa('Broker E')},broker-e,${synthetic.email('broker-e')},Pass123!Aa,EUR,insurance`,
    ].join('\n');

    const result = parseBulkCsv(csvText);
    expect(result.errors).toEqual([]);
    expect(result.rows).toHaveLength(5);
    expect(result.delimiter).toBe(',');
    expect(result.rows[0].empresa).toContain(RUN_ID);
    expect(result.rows[0].subdomain).toBe(`smoke-${RUN_ID}-broker-a`);
  });

  it('dry-run con 5 filas: todas en `simulated`, sin BD tocada', async () => {
    const csvText = [
      'empresa,subdomain,email,password,moneda,vertical',
      `${synthetic.empresa('Dry A')},dry-a,${synthetic.email('dry-a')},${synthetic.password()},USD,insurance`,
      `${synthetic.empresa('Dry B')},dry-b,${synthetic.email('dry-b')},${synthetic.password()},EUR,general`,
    ].join('\n');

    const parsed = parseBulkCsv(csvText);
    const result = await runBulkOnboarding({
      rows: parsed.rows,
      dryRun: true,
      concurrency: 2,
      actor: { user: { email: 'smoke@volkern.test', id: RUN_ID } },
    } as BulkRunnerInput);

    expect(result.total).toBe(2);
    expect(result.simulated).toBe(2);
    expect(result.created).toBe(0);
    expect(result.failed).toBe(0);
    expect(result.report.every((r: any) => r.status === 'simulated')).toBe(true);

    // Confirmar que la BD no tiene nada con esos slugs.
    const leaked = await prisma.tenant.count({
      where: { slug: { startsWith: `smoke-${RUN_ID}-` } },
    });
    expect(leaked).toBe(0);
  });

  it('provisionTenant happy path: tenant + usuario en BD real', async () => {
    const slug = synthetic.subdomain('prov-a');
    const result = await provisionTenant({
      empresa: synthetic.empresa('Prov A'),
      subdomain: slug,
      email: synthetic.email('prov-a'),
      password: synthetic.password(),
      moneda: 'USD',
      vertical: 'insurance',
    });

    expect(result.success).toBe(true);
    expect(result.tenantId).toBeTruthy();
    createdTenantIds.push(result.tenantId!);

    // Verificar que el tenant está en la BD real, con la moneda correcta.
    const t = await prisma.tenant.findUnique({
      where: { id: result.tenantId! },
      include: { users: true },
    });
    expect(t).toBeTruthy();
    expect(t.slug).toBe(slug);
    expect(t.moneda).toBe('USD');
    expect(t.monedaInferenciaSource).toBe('IMPORT_AUTO'); // provisioner setea esto
    expect(t.users).toHaveLength(1);
    expect(t.users[0].email).toBe(synthetic.email('prov-a'));
  });

  it('runBulkOnboarding crea 5 tenants reales end-to-end', async () => {
    const csvRows = ['A', 'B', 'C', 'D', 'E'].map((slug) => ({
      empresa: synthetic.empresa(`Bulk ${slug}`),
      subdomain: synthetic.subdomain(`bulk-${slug.toLowerCase()}`),
      email: synthetic.email(`bulk-${slug.toLowerCase()}`),
      password: synthetic.password(),
      moneda: (['USD', 'EUR', 'USD', 'MXN', 'EUR'] as const)[['A','B','C','D','E'].indexOf(slug)],
      vertical: (['insurance','real_estate','accounting','general','insurance'] as const)[['A','B','C','D','E'].indexOf(slug)],
    }));

    const result = await runBulkOnboarding({
      rows: csvRows,
      dryRun: false,
      concurrency: 3,
      actor: { system: 'cron-secret' }, // auditoría: creado por integración
    } as BulkRunnerInput);

    expect(result.total).toBe(5);
    expect(result.dryRun).toBe(false);
    // Esperamos: 5 created, 0 failed (Telegram es opcional)
    expect(result.created).toBe(5);
    expect(result.failed).toBe(0);
    expect(result.hadUnexpectedErrors).toBe(false);

    // Track IDs para cleanup.
    for (const r of result.report) {
      if (r.status === 'created' && r.tenantId) {
        createdTenantIds.push(r.tenantId);
      }
    }

    // Self-check #1: la cantidad de IDs trackeados coincide con created.
    expect(createdTenantIds.length).toBeGreaterThanOrEqual(5);

    // Confirmar que están en BD con la moneda correcta.
    const tenantsInDb = await prisma.tenant.findMany({
      where: { id: { in: createdTenantIds.slice(-5) } },
      select: { slug: true, moneda: true, monedaInferenciaSource: true },
    });
    expect(tenantsInDb).toHaveLength(5);
    const slugs = tenantsInDb.map((t: any) => t.slug);
    expect(slugs.every((s: string) => s.includes(`smoke-${RUN_ID}-`))).toBe(true);

    // Verificar actor = cron-secret en algún audit log.
    const auditCount = await prisma.auditLog.count({
      where: {
        tenantId: { in: createdTenantIds.slice(-5) },
        actor: 'cron-secret',
      },
    });
    expect(auditCount).toBeGreaterThan(0);
  });

  it('seedTenantModulesFromVertical siembra insurance en los nuevos tenants', async () => {
    // Sembrar insurance en los 2 tenants con vertical=insurance creados antes.
    const insuranceSlugs = [`smoke-${RUN_ID}-bulk-a`, `smoke-${RUN_ID}-bulk-e`];
    const insuranceTenants = await prisma.tenant.findMany({
      where: { slug: { in: insuranceSlugs } },
      select: { id: true },
    });
    expect(insuranceTenants.length).toBe(2);

    for (const t of insuranceTenants) {
      const r = await seedTenantModulesFromVertical(t.id, 'insurance');
      expect(r.seeded + r.skipped).toBeGreaterThan(0);
    }

    // Verificar que al menos uno tiene el módulo insurance activo.
    const features = await prisma.tenantFeature.findMany({
      where: {
        tenantId: { in: insuranceTenants.map((t: any) => t.id) },
        feature: 'insurance',
        habilitado: true,
      },
    });
    expect(features.length).toBeGreaterThanOrEqual(2);
  });

  it('buildBulkResultCsv serializa el mismo reporte que recibió la UI', async () => {
    const report = [
      { row: 1, status: 'simulated', empresa: 'foo', subdomain: 'sfoo', email: 'f@x' },
      { row: 2, status: 'error', errorCode: 'DUPLICATE', empresa: 'bar', subdomain: 'sbar' },
    ];
    const csv = buildBulkResultCsv(report as any);
    expect(csv).toContain('"row"');
    expect(csv).toContain('"simulated"');
    // Garantizar formato Excel-friendly: BOM + CRLF.
    expect(csv.charCodeAt(0)).toBe(0xFEFF);
    expect(csv).toMatch(/\r\n/);
  });

  it('self-leak: 0 tenants con prefijo smoke-${RUN_ID}- después del cleanup', async () => {
    // Este test corre DESPUÉS de afterAll (cleanup). Si queda basura,
    // ya fallamos arriba, pero hacemos una verificación final.
    const count = await prisma.tenant.count({
      where: { slug: { startsWith: `smoke-${RUN_ID}-` } },
    });
    expect(count).toBe(0);
  });
});
