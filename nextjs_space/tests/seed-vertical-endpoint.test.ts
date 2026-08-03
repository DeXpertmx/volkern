import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks (vi.hoisted()) ────────────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  userFindUnique: vi.fn(),
  // runSeedVerticalBulk es la única dependencia server-side.
  runSeedVerticalBulk: vi.fn(),
}));

vi.mock('next-auth', () => ({ getServerSession: mocks.getServerSession }));

vi.mock('@/lib/auth', () => ({ authOptions: {} }));

vi.mock('@/lib/db', () => ({
  prisma: { user: { findUnique: mocks.userFindUnique } },
}));

vi.mock('@/lib/provisioning/seed-vertical-bulk', () => ({
  runSeedVerticalBulk: mocks.runSeedVerticalBulk,
}));

import { POST as routePOST } from '@/app/api/admin/partner-bulk/seed-vertical/route';
import type { NextRequest } from 'next/server';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeRequest(opts: {
  headers?: Record<string, string>;
  body?: unknown;
  contentType?: string;
} = {}): Request {
  const headers = new Headers(opts.headers ?? {});
  if (opts.contentType) headers.set('content-type', opts.contentType);
  return new Request('http://localhost:3000/api/admin/partner-bulk/seed-vertical', {
    method: 'POST',
    headers,
    body: typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body ?? {}),
  });
}

async function callRoute(req: Request): Promise<Response> {
  return routePOST(req as unknown as NextRequest);
}

const BODY_OK = {
  tenantIds: ['t1', 't2', 't3'],
  vertical: 'insurance',
};

beforeEach(() => {
  mocks.getServerSession.mockReset();
  mocks.userFindUnique.mockReset();
  mocks.runSeedVerticalBulk.mockReset();
  mocks.getServerSession.mockResolvedValue(null);
  // Default: orchestrator exitoso (para tests que no validan partial/failed).
  mocks.runSeedVerticalBulk.mockResolvedValue({
    ok: true, dryRun: false, vertical: 'insurance',
    modulesPlanned: ['leads', 'contactos', 'insurance'],
    total: 3, succeeded: 3, partial: 0, failed: 0,
    totalSeeded: 9, totalSkipped: 0,
    tenants: [],
  });
});

// ════════════════════════════════════════════════════════════════════════════
// AUTH
// ════════════════════════════════════════════════════════════════════════════

describe('POST /api/admin/partner-bulk/seed-vertical — auth: rechazos rápidos', () => {
  it('1) sin auth → 401 UNAUTHORIZED', async () => {
    const req = makeRequest({ body: BODY_OK });
    const res = await callRoute(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.code).toBe('UNAUTHORIZED');
    expect(mocks.runSeedVerticalBulk).not.toHaveBeenCalled();
  });

  it('2) Bearer inválido con CRON_SECRET → 401', async () => {
    process.env.CRON_SECRET = 'vault-secret-999';
    try {
      const req = makeRequest({
        headers: { authorization: 'Bearer wrong' },
        body: BODY_OK,
      });
      const res = await callRoute(req);
      expect(res.status).toBe(401);
    } finally {
      delete process.env.CRON_SECRET;
    }
  });

  it('3) Session con rol Admin (no Superadmin) → 403 FORBIDDEN', async () => {
    mocks.getServerSession.mockResolvedValue({
      user: { id: 'regular-1', email: 'r@admin.com' },
    });
    mocks.userFindUnique.mockResolvedValue({
      id: 'regular-1', email: 'r@admin.com',
      role: { nombre: 'Admin' },
    });
    const req = makeRequest({ body: BODY_OK });
    const res = await callRoute(req);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe('FORBIDDEN');
    expect(mocks.runSeedVerticalBulk).not.toHaveBeenCalled();
  });

  it('4) Session sin user → 401', async () => {
    mocks.getServerSession.mockResolvedValue({ user: null });
    const req = makeRequest({ body: BODY_OK });
    const res = await callRoute(req);
    expect(res.status).toBe(401);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// VALIDACIÓN DE BODY
// ════════════════════════════════════════════════════════════════════════════

describe('POST /api/admin/partner-bulk/seed-vertical — body validation', () => {
  beforeEach(() => {
    process.env.CRON_SECRET = 'vault-secret-999';
  });
  afterEach(() => {
    delete process.env.CRON_SECRET;
  });

  it('5) body sin vertical → 400', async () => {
    const req = makeRequest({
      headers: { authorization: 'Bearer vault-secret-999' },
      body: { tenantIds: ['t1'] },
    });
    const res = await callRoute(req);
    expect(res.status).toBe(400);
  });

  it('6) vertical inválida → 400 INVALID_VERTICAL', async () => {
    const req = makeRequest({
      headers: { authorization: 'Bearer vault-secret-999' },
      body: { tenantIds: ['t1'], vertical: 'unknown-x' },
    });
    const res = await callRoute(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('INVALID_VERTICAL');
    expect(body.error).toMatch(/insurance|real_estate|accounting|general/);
    expect(mocks.runSeedVerticalBulk).not.toHaveBeenCalled();
  });

  it('7) tenantIds array vacío → 400 INVALID_TENANT_IDS', async () => {
    const req = makeRequest({
      headers: { authorization: 'Bearer vault-secret-999' },
      body: { tenantIds: [], vertical: 'insurance' },
    });
    const res = await callRoute(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('INVALID_TENANT_IDS');
  });

  it('8) tenantIds sin array → 400 INVALID_TENANT_IDS', async () => {
    const req = makeRequest({
      headers: { authorization: 'Bearer vault-secret-999' },
      body: { tenantIds: 't1', vertical: 'insurance' },
    });
    const res = await callRoute(req);
    expect(res.status).toBe(400);
  });

  it('9) > 200 tenantIds → 400 TOO_MANY_TENANT_IDS', async () => {
    const tenantIds = Array.from({ length: 201 }, (_, i) => `t${i}`);
    const req = makeRequest({
      headers: { authorization: 'Bearer vault-secret-999' },
      body: { tenantIds, vertical: 'insurance' },
    });
    const res = await callRoute(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('TOO_MANY_TENANT_IDS');
  });

  it('10) Body no-JSON → 400', async () => {
    const req = makeRequest({
      headers: { authorization: 'Bearer vault-secret-999', 'content-type': 'text/plain' },
      body: 'not json',
    });
    const res = await callRoute(req);
    expect(res.status).toBe(400);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// HAPPY PATH DELEGATION
// ════════════════════════════════════════════════════════════════════════════

describe('POST /api/admin/partner-bulk/seed-vertical — happy path delegation', () => {
  beforeEach(() => {
    process.env.CRON_SECRET = 'vault-secret-999';
  });
  afterEach(() => {
    delete process.env.CRON_SECRET;
  });

  it('11) Bearer auth + body válido → runner invocado una vez', async () => {
    const req = makeRequest({
      headers: { authorization: 'Bearer vault-secret-999' },
      body: BODY_OK,
    });
    await callRoute(req);
    expect(mocks.runSeedVerticalBulk).toHaveBeenCalledTimes(1);
  });

  it('12) llama al runner con tenantIds correctos', async () => {
    const req = makeRequest({
      headers: { authorization: 'Bearer vault-secret-999' },
      body: { tenantIds: ['t1', 't2'], vertical: 'real_estate' },
    });
    await callRoute(req);
    const called = mocks.runSeedVerticalBulk.mock.calls[0][0];
    expect(called.tenantIds).toEqual(['t1', 't2']);
    expect(called.vertical).toBe('real_estate');
  });

  it('13) dryRun del body se respeta sin header X-Dry-Run', async () => {
    const req = makeRequest({
      headers: { authorization: 'Bearer vault-secret-999' },
      body: { ...BODY_OK, dryRun: true },
    });
    await callRoute(req);
    const called = mocks.runSeedVerticalBulk.mock.calls[0][0];
    expect(called.dryRun).toBe(true);
  });

  it('14) X-Dry-Run tiene prioridad sobre body.dryRun=true (anula)', async () => {
    const req = makeRequest({
      headers: {
        authorization: 'Bearer vault-secret-999',
        'x-dry-run': 'false',
      },
      body: { ...BODY_OK, dryRun: true },
    });
    await callRoute(req);
    const called = mocks.runSeedVerticalBulk.mock.calls[0][0];
    expect(called.dryRun).toBe(false);
  });

  it('15) modules custom override (si viene en body)', async () => {
    const req = makeRequest({
      headers: { authorization: 'Bearer vault-secret-999' },
      body: { ...BODY_OK, modules: ['leads', 'contactos'] },
    });
    await callRoute(req);
    const called = mocks.runSeedVerticalBulk.mock.calls[0][0];
    expect(called.modules).toEqual(['leads', 'contactos']);
  });

  it('16) actor=system cuando Bearer', async () => {
    const req = makeRequest({
      headers: { authorization: 'Bearer vault-secret-999' },
      body: BODY_OK,
    });
    await callRoute(req);
    const called = mocks.runSeedVerticalBulk.mock.calls[0][0];
    expect(called.actor).toEqual({ kind: 'system', source: 'cron-secret' });
  });

  it('17) respuesta 200 con body shape estándar del runner', async () => {
    mocks.runSeedVerticalBulk.mockResolvedValue({
      ok: true, dryRun: false, vertical: 'insurance',
      modulesPlanned: ['leads', 'contactos', 'insurance'],
      total: 3, succeeded: 3, partial: 0, failed: 0,
      totalSeeded: 9, totalSkipped: 0,
      tenants: [
        { tenantId: 't1', seeded: ['leads'], skipped: ['contactos'], errors: [], ok: true },
      ],
    });
    const req = makeRequest({
      headers: { authorization: 'Bearer vault-secret-999' },
      body: BODY_OK,
    });
    const res = await callRoute(req);
    expect(res.status).toBe(200);
    expect(res.headers.get('X-Seed-Vertical')).toBe('insurance');
    expect(res.headers.get('X-Seed-Total')).toBe('3');
    expect(res.headers.get('X-Seed-Succeeded')).toBe('3');
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.total).toBe(3);
    expect(body.tenants).toHaveLength(1);
  });

  it('18) NO llama al runner cuando body validation falla antes', async () => {
    const req = makeRequest({
      headers: { authorization: 'Bearer vault-secret-999' },
      body: { tenantIds: [], vertical: 'insurance' },
    });
    await callRoute(req);
    expect(mocks.runSeedVerticalBulk).not.toHaveBeenCalled();
  });
});
