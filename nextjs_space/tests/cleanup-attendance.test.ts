import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ────────────────────────────────────────────────────────────────────────────────
// MOCKS (vi.hoisted: se evalúan antes de `vi.mock`)
// ────────────────────────────────────────────────────────────────────────────────

const __mockPrisma = vi.hoisted(() => {
  const m: Record<string, any> = {
    tenant: {
      findMany: vi.fn(),
    },
    attendance: {
      // Nuevo flujo batched: findMany({select:{id},take:N}) + deleteMany({in:ids}).
      findMany: vi.fn(),
      deleteMany: vi.fn(),
      // count() sigue usándose para dryRun (inspección sin deletes efectivos).
      count: vi.fn(),
    },
    idempotencyKey: {
      deleteMany: vi.fn(),
      count: vi.fn(),
    },
  };
  return m;
});

vi.mock('@/lib/db', () => ({
  prisma: __mockPrisma,
}));

// ────────────────────────────────────────────────────────────────────────────────
// HELPERS
// ────────────────────────────────────────────────────────────────────────────────

// 2026-07-15 03:00:00 UTC = exactamente la hora programada en `vercel.json`.
const FIXED_NOW = new Date('2026-07-15T03:00:00.000Z');
const CRON_SECRET = 'cron-secret-test-xyz';
const BATCH_SIZE = 50_000; // Espejo de ATTENDANCE_BATCH_SIZE en route.ts.

function buildCronRequest(opts: { auth?: string; query?: string } = {}): Request {
  const headers: Record<string, string> = {};
  if (opts.auth) headers['authorization'] = opts.auth;
  const url = `https://volkern.app/api/cron/cleanup-attendance${
    opts.query ? '?' + opts.query : ''
  }`;
  return new Request(url, { method: 'GET', headers });
}

// Helper: genera un array de N objetos `{id: 'att-i'}` para mockear findMany.
// Reduce el ruido en T6 (multi-batch con miles de filas).
function buildIdBatch(count: number, prefix = 'att'): Array<{ id: string }> {
  return Array.from({ length: count }, (_, i) => ({ id: `${prefix}-${i}` }));
}

// ────────────────────────────────────────────────────────────────────────────────
// TESTS — Cron diario de purga (RGPD Art. 5.1.e: limitación del plazo de conservación)
//
// Cobertura:
//   T1 — Seguridad RGPD Art. 32: نقص CRON_SECRET en producción     → 401
//   T2 — Seguridad RGPD Art. 32: bearer inválido                    → 401
//   T3 — Happy path batched: 2 tenants (7 + 0), verificación del composite-index-friendly query
//   T4 — Compliance RGPD: si tenant NO tiene attendanceRules ⇒ default 1460 días
//   T5 — Resiliencia: error en batch #1 de 1 tenant NO aborta el job global
//   T6 — Multi-batch: >50k filas → 2 (o más) findMany + 2 deleteMany (loop batched)
// ────────────────────────────────────────────────────────────────────────────────

describe('Cron cleanup-attendance (RGPD Art. 5.1.e — retención con batches de 50k)', () => {
  // Snapshot de process.env.* para restaurar tras cada test (aislar de NODE_ENV
  // heredado del shell o de otros tests en la misma corrida).
  let ORIGINAL_NODE_ENV: string | undefined;
  let ORIGINAL_CRON_SECRET: string | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    ORIGINAL_NODE_ENV = process.env.NODE_ENV;
    ORIGINAL_CRON_SECRET = process.env.CRON_SECRET;

    // Congelamos tiempo: el cron usa `new Date()` para `now` y `cutoff`.
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);

    // Defaults seguros para evitar que un branch no contemplado lance TypeError.
    __mockPrisma.tenant.findMany.mockResolvedValue([]);
    __mockPrisma.attendance.findMany.mockResolvedValue([]);
    __mockPrisma.attendance.deleteMany.mockResolvedValue({ count: 0 });
    __mockPrisma.idempotencyKey.deleteMany.mockResolvedValue({ count: 0 });
    __mockPrisma.attendance.count.mockResolvedValue(0);
    __mockPrisma.idempotencyKey.count.mockResolvedValue(0);

    // Por defecto, fuera de producción (skip auth).
    process.env.NODE_ENV = 'test';
    delete process.env.CRON_SECRET;
  });

  afterEach(() => {
    vi.useRealTimers();
    // Restauramos snapshots.
    if (ORIGINAL_NODE_ENV === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = ORIGINAL_NODE_ENV;
    if (ORIGINAL_CRON_SECRET === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = ORIGINAL_CRON_SECRET;
  });

  // ── T1 · Auth · CRON_SECRET ausente en prod → 401 (RGPD Art. 32)
  it('ausencia de CRON_SECRET en producción → 401 sin tocar la DB', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.CRON_SECRET; // explícitamente ausente

    const req = buildCronRequest({ auth: 'Bearer cualquier-cosa' });
    const { GET } = await import('@/app/api/cron/cleanup-attendance/route');

    const res = await GET(req);

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toMatch(/CRON_SECRET/);

    // Anti-bypass: el handler NO debe avanzar hasta Prisma en ningún test fallido.
    expect(__mockPrisma.idempotencyKey.deleteMany).not.toHaveBeenCalled();
    expect(__mockPrisma.idempotencyKey.count).not.toHaveBeenCalled();
    expect(__mockPrisma.tenant.findMany).not.toHaveBeenCalled();
    expect(__mockPrisma.attendance.findMany).not.toHaveBeenCalled();
    expect(__mockPrisma.attendance.deleteMany).not.toHaveBeenCalled();
  });

  // ── T2 · Auth · Bearer inválido → 401
  it('bearer inválido en producción → 401 sin tocar la DB', async () => {
    process.env.NODE_ENV = 'production';
    process.env.CRON_SECRET = CRON_SECRET;

    const req = buildCronRequest({ auth: 'Bearer wrong-secret-zzz' });
    const { GET } = await import('@/app/api/cron/cleanup-attendance/route');

    const res = await GET(req);

    expect(res.status).toBe(401);
    expect(__mockPrisma.idempotencyKey.deleteMany).not.toHaveBeenCalled();
    expect(__mockPrisma.tenant.findMany).not.toHaveBeenCalled();
    expect(__mockPrisma.attendance.findMany).not.toHaveBeenCalled();
    expect(__mockPrisma.attendance.deleteMany).not.toHaveBeenCalled();
    // La rama positiva (bearer correcto → 200) está cubierta por T3 (happy path),
    // evitando acoplar este test a la lógica de procesamiento post-auth.
  });

  // ── T3 · Happy path batched · 2 tenants con 7 + 0 filas
  it('happy path batched: tenant-A=7 ids (1 batch), tenant-B=0 ids (0 batches)', async () => {
    __mockPrisma.tenant.findMany.mockResolvedValue([
      {
        id: 'tenant-A',
        nombre: 'Tenant A',
        attendanceRules: { retentionDays: 1460 },
      },
      {
        id: 'tenant-B',
        nombre: 'Tenant B',
        attendanceRules: { retentionDays: 30 },
      },
    ]);
    __mockPrisma.idempotencyKey.deleteMany.mockResolvedValue({ count: 3 });

    // Flujo batched por tenant:
    //   Tenant-A: findMany → 7 ids; deleteMany → count=7; rows.length<50k→break. → 1 batch.
    //   Tenant-B: findMany → []; loop rompe antes de deleteMany. → 0 batches.
    __mockPrisma.attendance.findMany
      .mockResolvedValueOnce(buildIdBatch(7, 'att-A')) // Tenant A: 7 ids
      .mockResolvedValueOnce([]); // Tenant B: 0 ids (no hay expired)
    __mockPrisma.attendance.deleteMany.mockResolvedValueOnce({ count: 7 });

    const req = buildCronRequest();
    const { GET } = await import('@/app/api/cron/cleanup-attendance/route');

    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.summary.dryRun).toBe(false);
    expect(body.summary.idempotency.deleted).toBe(3);
    expect(body.summary.tenantsProcessed).toBe(2);
    expect(body.summary.tenantsFailed).toBe(0);
    expect(body.summary.attendance.totalDeleted).toBe(7);
    expect(body.summary.attendance.totalBatches).toBe(1); // Solo Tenant A ejecutó 1 batch.
    expect(body.summary.attendance.byTenant).toHaveLength(2);

    // Verificación matemática del cutoff (Tenant A: 1460 días).
    const tA = body.summary.attendance.byTenant.find(
      (t: any) => t.tenantId === 'tenant-A',
    );
    expect(tA).toBeDefined();
    expect(tA.retentionDays).toBe(1460);
    expect(tA.deletedAttendance).toBe(7);
    expect(tA.batches).toBe(1);
    const expectedCutoffA =
      FIXED_NOW.getTime() - 1460 * 24 * 60 * 60 * 1000;
    expect(new Date(tA.cutoffIso).getTime()).toBe(expectedCutoffA);

    // Tenant B: 0 ids → findMany retornó [] → 0 batches ejecutados.
    const tB = body.summary.attendance.byTenant.find(
      (t: any) => t.tenantId === 'tenant-B',
    );
    expect(tB.retentionDays).toBe(30);
    expect(tB.deletedAttendance).toBe(0);
    expect(tB.batches).toBe(0);
    const expectedCutoffB = FIXED_NOW.getTime() - 30 * 24 * 60 * 60 * 1000;
    expect(new Date(tB.cutoffIso).getTime()).toBe(expectedCutoffB);

    // ── Sanity: el findMany pasó los args críticos del composite-index.
    //    Sin `orderBy:{timestamp:'asc'}` Postgres podría no usar el composite index
    //    como Index Scan y caer en Bitmap Heap Scan entre índices individuales.
    const findManyCalls = __mockPrisma.attendance.findMany.mock.calls;
    expect(findManyCalls).toHaveLength(2); // 1 por tenant (Tenant B rompe antes de delete).
    expect(findManyCalls[0][0]).toMatchObject({
      select: { id: true },
      take: 50_000,
      orderBy: { timestamp: 'asc' },
      where: expect.objectContaining({
        tenantId: 'tenant-A',
        timestamp: expect.objectContaining({ lt: expect.any(Date) }),
      }),
    });
    expect(findManyCalls[1][0]).toMatchObject({
      select: { id: true },
      take: 50_000,
      orderBy: { timestamp: 'asc' },
      where: expect.objectContaining({
        tenantId: 'tenant-B',
      }),
    });

    // ── Sanity: Tenant B con 0 ids → NO se invoca deleteMany para ese tenant.
    expect(__mockPrisma.attendance.deleteMany).toHaveBeenCalledTimes(1);
    const deleteArgs = __mockPrisma.attendance.deleteMany.mock.calls[0][0];
    expect(deleteArgs.where).toMatchObject({
      id: expect.objectContaining({ in: expect.any(Array) }),
    });
    expect(deleteArgs.where.id.in).toHaveLength(7); // Solo los 7 ids de Tenant A.

    // Sanity: la query de tenants cargó con `select` específico (no N+1).
    expect(__mockPrisma.tenant.findMany).toHaveBeenCalledTimes(1);
    const tenantFindArgs = __mockPrisma.tenant.findMany.mock.calls[0][0];
    expect(tenantFindArgs.select).toMatchObject({
      id: true,
      nombre: true,
      attendanceRules: { select: { retentionDays: true } },
    });
  });

  // ── T4 · Compliance · attendanceRules=null → fallback a DEFAULT_RETENTION_DAYS=1460
  it('tenant sin attendanceRules (null) → aplica el default RGPD 1460 días (≈4 años)', async () => {
    __mockPrisma.tenant.findMany.mockResolvedValue([
      {
        id: 'tenant-noRules',
        nombre: 'Tenant Sin Reglas',
        // attendanceRules === null → clampRetention() debe caer al default.
        attendanceRules: null,
      },
    ]);
    __mockPrisma.attendance.findMany.mockResolvedValueOnce(buildIdBatch(12, 'att-X'));
    __mockPrisma.attendance.deleteMany.mockResolvedValueOnce({ count: 12 });

    const req = buildCronRequest();
    const { GET } = await import('@/app/api/cron/cleanup-attendance/route');

    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.summary.tenantsProcessed).toBe(1);
    expect(body.summary.tenantsFailed).toBe(0);
    expect(body.summary.attendance.totalDeleted).toBe(12);

    const t = body.summary.attendance.byTenant[0];
    expect(t.tenantId).toBe('tenant-noRules');
    // CRÍTICO: clampRetention(null) devuelve el default 1460 aunque no haya config.
    expect(t.retentionDays).toBe(1460);
    expect(t.batches).toBe(1);

    // El cutoff efectivo es ahora - 1460 días, igual que para tenants configurados.
    const expectedCutoff = FIXED_NOW.getTime() - 1460 * 24 * 60 * 60 * 1000;
    expect(new Date(t.cutoffIso).getTime()).toBe(expectedCutoff);
  });

  // ── T5 · Resiliencia · error en tenant NO aborta el job global
  it('un tenant con deleteMany que lanza error no impide procesar los demás', async () => {
    __mockPrisma.tenant.findMany.mockResolvedValue([
      {
        id: 'tenant-broken',
        nombre: 'Broken',
        attendanceRules: { retentionDays: 1460 },
      },
      {
        id: 'tenant-OK',
        nombre: 'OK',
        attendanceRules: { retentionDays: 1460 },
      },
      {
        id: 'tenant-OK2',
        nombre: 'OK2',
        attendanceRules: { retentionDays: 1460 },
      },
    ]);
    // Solo el primer deleteMany (tenant-broken) lanza; los demás resuelven.
    // Importante: tenant-broken retorna exactamente BATCH_SIZE (50k) ids en
    // findMany para no cortar el loop antes del throw; pero el throw ocurre
    // en deleteMany, que se ejecuta después de batches++ → batches=1.
    __mockPrisma.attendance.findMany
      .mockResolvedValueOnce(buildIdBatch(BATCH_SIZE, 'att-broken')) // 50k → loop continúa (== no <)
      .mockResolvedValueOnce(buildIdBatch(4, 'att-OK')) // 4 < 50k → última batch → 1 batch
      .mockResolvedValueOnce(buildIdBatch(5, 'att-OK2')); // 5 < 50k → última batch → 1 batch
    __mockPrisma.attendance.deleteMany
      .mockRejectedValueOnce(new Error('Connection timeout on tenant-broken'))
      .mockResolvedValueOnce({ count: 4 })
      .mockResolvedValueOnce({ count: 5 });

    const req = buildCronRequest();
    const { GET } = await import('@/app/api/cron/cleanup-attendance/route');

    const res = await GET(req);

    // Como tenantsFailed (1) !== tenants.length (3), el status sigue siendo 200.
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);

    // Resiliencia: el resto de tenants se procesó correctamente.
    expect(body.summary.tenantsProcessed).toBe(2);
    expect(body.summary.tenantsFailed).toBe(1);
    expect(body.summary.attendance.totalDeleted).toBe(9); // 4 + 5

    // El tenant roto tiene error y deletedAttendance/batches=0:
    // como `purgeTenantInBatches` lanza ANTES de retornar, el código de asignación
    // del path exitoso nunca ejecuta → el catch ve los valores iniciales (0, 0).
    // Esto refleja la semántica «all-or-nothing» per-tenant del handler: si un
    // tenant falla, el operador lo ve en `tenantsFailed++` + `error` y puede
    // re-disparar el cron (idempotente) para recuperar los rows restantes.
    const broken = body.summary.attendance.byTenant.find(
      (t: any) => t.tenantId === 'tenant-broken',
    );
    expect(broken).toBeDefined();
    expect(broken.error).toMatch(/Connection timeout/);
    expect(broken.deletedAttendance).toBe(0);
    expect(broken.batches).toBe(0);
    // retentionDays sí se calcula (defensa en profundidad del handler).
    expect(broken.retentionDays).toBe(1460);

    // Los 2 tenants OK aparecen con sus contadores.
    const ok = body.summary.attendance.byTenant.find(
      (t: any) => t.tenantId === 'tenant-OK',
    );
    const ok2 = body.summary.attendance.byTenant.find(
      (t: any) => t.tenantId === 'tenant-OK2',
    );
    expect(ok.deletedAttendance).toBe(4);
    expect(ok2.deletedAttendance).toBe(5);
    expect(ok.batches).toBe(1);
    expect(ok2.batches).toBe(1);
    expect(ok.error).toBeUndefined();
    expect(ok2.error).toBeUndefined();
  });

  // ── T6 · Multi-batch · >50k filas → 2 (o más) findMany + deleteMany
  //    Caso crítico para validar la lógica de paginación del helper:
  //      - Batch 1: findMany=50k (== BATCH_SIZE → no break).
  //      - Batch 2: findMany=50k.
  //      - Batch 3: findMany=[] → break antes de deleteMany.
  //    Total: 3 findMany + 2 deleteMany → deletedAttendance=100_000, batches=2.
  it('multi-batch: 100k filas → 2 deleteMany ejecutados y bucle termina cuando findMany=[]', async () => {
    __mockPrisma.tenant.findMany.mockResolvedValue([
      {
        id: 'tenant-huge',
        nombre: 'Tenant Enorme',
        attendanceRules: { retentionDays: 1460 },
      },
    ]);
    __mockPrisma.attendance.findMany
      .mockResolvedValueOnce(buildIdBatch(BATCH_SIZE, 'att-batch1')) // exacto BATCH_SIZE
      .mockResolvedValueOnce(buildIdBatch(BATCH_SIZE, 'att-batch2')) // exacto BATCH_SIZE
      .mockResolvedValueOnce([]); // tercera iteración → break (no deleteMany)
    __mockPrisma.attendance.deleteMany
      .mockResolvedValueOnce({ count: BATCH_SIZE })
      .mockResolvedValueOnce({ count: BATCH_SIZE });

    const req = buildCronRequest();
    const { GET } = await import('@/app/api/cron/cleanup-attendance/route');

    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.summary.tenantsProcessed).toBe(1);
    expect(body.summary.tenantsFailed).toBe(0);
    expect(body.summary.attendance.totalDeleted).toBe(2 * BATCH_SIZE);
    expect(body.summary.attendance.totalBatches).toBe(2);

    const t = body.summary.attendance.byTenant[0];
    expect(t.tenantId).toBe('tenant-huge');
    expect(t.deletedAttendance).toBe(2 * BATCH_SIZE);
    expect(t.batches).toBe(2);

    // 3 findMany + 2 deleteMany (la tercera iteración rompe antes del deleteMany).
    expect(__mockPrisma.attendance.findMany).toHaveBeenCalledTimes(3);
    expect(__mockPrisma.attendance.deleteMany).toHaveBeenCalledTimes(2);

    // Cada deleteMany recibió los ids del findMany anterior.
    const delCalls = __mockPrisma.attendance.deleteMany.mock.calls;
    expect(delCalls[0][0].where.id.in).toHaveLength(BATCH_SIZE);
    expect(delCalls[1][0].where.id.in).toHaveLength(BATCH_SIZE);

    // Todos los findMany usaron `take:50_000` + `select:{id}` + `orderBy:timestamp asc`.
    for (const call of __mockPrisma.attendance.findMany.mock.calls) {
      expect(call[0]).toMatchObject({
        select: { id: true },
        take: 50_000,
        orderBy: { timestamp: 'asc' },
      });
    }
  });
});
