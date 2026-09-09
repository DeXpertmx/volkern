import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ────────────────────────────────────────────────────────────────────────────
// MOCKS (vi.hoisted)
// ────────────────────────────────────────────────────────────────────────────
const __mockPrisma = vi.hoisted(() => ({
  hospitalityProperty: {
    findMany: vi.fn(),
  },
}));

const __mockRunReconciliation = vi.hoisted(() => vi.fn());

vi.mock('@/lib/db', () => ({
  prisma: __mockPrisma,
}));

vi.mock('@/lib/hospitality/reconciliation', () => ({
  runReconciliation: (...a: any[]) => __mockRunReconciliation(...a),
}));

const CRON_SECRET = 'cron-secret-test-xyz';

function buildCronRequest(opts: { auth?: string } = {}): Request {
  const headers: Record<string, string> = {};
  if (opts.auth) headers['authorization'] = opts.auth;
  return new Request('https://volkern.app/api/cron/hospitality-reconcile', {
    method: 'GET',
    headers,
  });
}

describe('Cron hospitality-reconcile (reconciliación diaria §14)', () => {
  let ORIGINAL_NODE_ENV: string | undefined;
  let ORIGINAL_CRON_SECRET: string | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    ORIGINAL_NODE_ENV = process.env.NODE_ENV;
    ORIGINAL_CRON_SECRET = process.env.CRON_SECRET;
    process.env.NODE_ENV = 'test';
    delete process.env.CRON_SECRET;
    __mockPrisma.hospitalityProperty.findMany.mockResolvedValue([]);
    __mockRunReconciliation.mockResolvedValue({
      ok: true,
      propiedades: 1,
      fetchFallidos: 0,
      totalFetch: 0,
      creadas: 0,
      actualizadas: 0,
      canceladas: 0,
      sinCambios: 0,
      divergencias: 0,
      errores: [],
    });
  });

  afterEach(() => {
    if (ORIGINAL_NODE_ENV === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = ORIGINAL_NODE_ENV;
    if (ORIGINAL_CRON_SECRET === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = ORIGINAL_CRON_SECRET;
  });

  it('CRON_SECRET ausente en producción → 401 sin tocar la DB', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.CRON_SECRET;

    const { GET } = await import('@/app/api/cron/hospitality-reconcile/route');
    const res = await GET(buildCronRequest({ auth: 'Bearer cualquier-cosa' }));

    expect(res.status).toBe(401);
    expect(__mockPrisma.hospitalityProperty.findMany).not.toHaveBeenCalled();
    expect(__mockRunReconciliation).not.toHaveBeenCalled();
  });

  it('bearer inválido en producción → 401', async () => {
    process.env.NODE_ENV = 'production';
    process.env.CRON_SECRET = CRON_SECRET;

    const { GET } = await import('@/app/api/cron/hospitality-reconcile/route');
    const res = await GET(buildCronRequest({ auth: 'Bearer wrong-secret' }));

    expect(res.status).toBe(401);
    expect(__mockPrisma.hospitalityProperty.findMany).not.toHaveBeenCalled();
  });

  it('sin tenants con mappings activos → éxito con tenants=0', async () => {
    __mockPrisma.hospitalityProperty.findMany.mockResolvedValue([]);

    const { GET } = await import('@/app/api/cron/hospitality-reconcile/route');
    const res = await GET(buildCronRequest());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.tenants).toBe(0);
    expect(__mockRunReconciliation).not.toHaveBeenCalled();
  });

  it('reconcilia todos los tenants con mappings (distinct tenantId)', async () => {
    // El endpoint pide distinct:['tenantId']; el mock devuelve ya deduplicado.
    __mockPrisma.hospitalityProperty.findMany.mockResolvedValue([
      { tenantId: 't1' },
      { tenantId: 't2' },
    ]);

    const { GET } = await import('@/app/api/cron/hospitality-reconcile/route');
    const res = await GET(buildCronRequest());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.tenants).toBe(2);
    expect(__mockRunReconciliation).toHaveBeenCalledTimes(2);
    expect(__mockRunReconciliation).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 't1',
        dias: 30,
        cancelarAusentes: false, // siempre conservador en el cron
      })
    );
    expect(__mockRunReconciliation).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 't2' })
    );
  });

  it('acumula contadores de todos los tenants y reporta errores', async () => {
    __mockPrisma.hospitalityProperty.findMany.mockResolvedValue([
      { tenantId: 't1' },
      { tenantId: 't2' },
    ]);
    __mockRunReconciliation
      .mockResolvedValueOnce({
        ok: true,
        propiedades: 1,
        creadas: 2,
        actualizadas: 1,
        canceladas: 0,
        divergencias: 3,
        errores: [],
      })
      .mockResolvedValueOnce({
        ok: false,
        propiedades: 1,
        fetchFallidos: 1,
        creadas: 0,
        actualizadas: 0,
        canceladas: 0,
        divergencias: 0,
        errores: ['[Prop A] HTTP 404'],
      });

    const { GET } = await import('@/app/api/cron/hospitality-reconcile/route');
    const res = await GET(buildCronRequest());

    expect(res.status).toBe(200); // algunos fallos no rompen el job
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.totalCreadas).toBe(2);
    expect(body.totalActualizadas).toBe(1);
    expect(body.totalDivergencias).toBe(3);
    expect(body.errores).toEqual(['[Prop A] HTTP 404']);
  });

  it('un tenant que lanza no impide reconciliar los demás', async () => {
    __mockPrisma.hospitalityProperty.findMany.mockResolvedValue([
      { tenantId: 't1' },
      { tenantId: 't2' },
    ]);
    __mockRunReconciliation
      .mockRejectedValueOnce(new Error('DB timeout'))
      .mockResolvedValueOnce({
        ok: true,
        propiedades: 1,
        creadas: 1,
        actualizadas: 0,
        canceladas: 0,
        divergencias: 0,
        errores: [],
      });

    const { GET } = await import('@/app/api/cron/hospitality-reconcile/route');
    const res = await GET(buildCronRequest());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tenants).toBe(2);
    expect(body.success).toBe(false);
    expect(body.errores).toEqual(['DB timeout']);
    expect(body.totalCreadas).toBe(1);
  });
});