import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks (vi.hoisted() evita el TDZ del factory) ───────────────────────────

const mocks = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  userFindUnique: vi.fn(),
  tenantFindMany: vi.fn(),
  runBulkOnboarding: vi.fn(),
  generateBulkPassword: vi.fn(),
}));

vi.mock('next-auth', () => ({
  getServerSession: mocks.getServerSession,
}));

vi.mock('@/lib/auth', () => ({ authOptions: {} }));

vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: mocks.userFindUnique },
    tenant: { findMany: mocks.tenantFindMany },
  },
}));

vi.mock('@/lib/provisioning/partner-bulk-runner', () => ({
  runBulkOnboarding: mocks.runBulkOnboarding,
  generateBulkPassword: mocks.generateBulkPassword,
}));

vi.mock('@/lib/provisioning/tenant-provisioner', () => ({
  provisionTenant: vi.fn(),
  TenantProvisioningInput: class {},
  addTelegramChannelToTenant: vi.fn(),
}));

import { POST as routePOST } from '@/app/api/admin/partner-bulk/route';
import type { NextRequest } from 'next/server';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeRequest(opts: {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  contentType?: string;
} = {}): Request {
  const headers = new Headers(opts.headers ?? {});
  if (opts.contentType) headers.set('content-type', opts.contentType);
  return new Request('http://localhost:3000/api/admin/partner-bulk', {
    method: opts.method ?? 'POST',
    headers,
    body: opts.body,
  });
}

async function callRoute(req: Request): Promise<Response> {
  return routePOST(req as unknown as NextRequest);
}

const VALID_CSV = 'empresa,subdomain,email\nA,a,a@a.com\n';

// ─── beforeEach ───────────────────────────────────────────────────────────────

beforeEach(() => {
  mocks.getServerSession.mockReset();
  mocks.userFindUnique.mockReset();
  mocks.tenantFindMany.mockReset();
  mocks.runBulkOnboarding.mockReset();
  mocks.generateBulkPassword.mockReset();
  mocks.generateBulkPassword.mockReturnValue('AutoPwd1234');
  // Default tenant.findMany: vacío (no hay subdominios ocupados).
  mocks.tenantFindMany.mockResolvedValue([]);
  // Default runner response (no tests rely on what's returned; only on call counts).
  mocks.runBulkOnboarding.mockResolvedValue({
    ok: true, dryRun: false, total: 1, created: 1, simulated: 0, failed: 0,
    hadUnexpectedErrors: false, report: [],
  });
  mocks.getServerSession.mockResolvedValue(null);
});

// ════════════════════════════════════════════════════════════════════════════════
// AUTH — rechazos rápidos (401/403)
// ════════════════════════════════════════════════════════════════════════════════

describe('POST /api/admin/partner-bulk — auth: rechazos rápidos', () => {
  it('1) sin auth (ni session ni Bearer) → 401 UNAUTHORIZED', async () => {
    const req = makeRequest({ contentType: 'text/csv', body: VALID_CSV });
    const res = await callRoute(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.code).toBe('UNAUTHORIZED');
    expect(mocks.runBulkOnboarding).not.toHaveBeenCalled();
  });

  it('2) Bearer inválido con CRON_SECRET seteado → 401', async () => {
    process.env.CRON_SECRET = 'vault-secret-123';
    try {
      const req = makeRequest({
        headers: { authorization: 'Bearer wrong-token' },
        contentType: 'text/csv',
        body: VALID_CSV,
      });
      const res = await callRoute(req);
      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.code).toBe('UNAUTHORIZED');
      expect(mocks.runBulkOnboarding).not.toHaveBeenCalled();
    } finally {
      delete process.env.CRON_SECRET;
    }
  });

  it('3) Bearer presente pero CRON_SECRET no configurado → 401', async () => {
    delete process.env.CRON_SECRET;
    const req = makeRequest({
      headers: { authorization: 'Bearer anything' },
      contentType: 'text/csv',
      body: VALID_CSV,
    });
    const res = await callRoute(req);
    expect(res.status).toBe(401);
    expect(mocks.runBulkOnboarding).not.toHaveBeenCalled();
  });

  it('4) session con rol distinto a Superadmin → 403 FORBIDDEN', async () => {
    mocks.getServerSession.mockResolvedValue({
      user: { id: 'user-123', email: 'regular@user.com' },
    });
    mocks.userFindUnique.mockResolvedValue({
      id: 'user-123', email: 'regular@user.com',
      role: { nombre: 'Admin' },
    });
    const req = makeRequest({ contentType: 'text/csv', body: VALID_CSV });
    const res = await callRoute(req);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe('FORBIDDEN');
    expect(mocks.runBulkOnboarding).not.toHaveBeenCalled();
  });

  it('5) session con user null → 401', async () => {
    mocks.getServerSession.mockResolvedValue({ user: null });
    const req = makeRequest({ contentType: 'text/csv', body: VALID_CSV });
    const res = await callRoute(req);
    expect(res.status).toBe(401);
    expect(mocks.runBulkOnboarding).not.toHaveBeenCalled();
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// CONTENT-TYPE — rechazos 415
// ════════════════════════════════════════════════════════════════════════════════

describe('POST /api/admin/partner-bulk — content-type: rechazos', () => {
  beforeEach(() => {
    process.env.CRON_SECRET = 'vault-secret-123';
  });
  afterEach(() => {
    delete process.env.CRON_SECRET;
  });

  it('6) application/json sin campo "csv" → 415', async () => {
    const req = makeRequest({
      headers: { authorization: 'Bearer vault-secret-123' },
      contentType: 'application/json',
      body: JSON.stringify({ rows: [] }),
    });
    const res = await callRoute(req);
    expect(res.status).toBe(415);
    const body = await res.json();
    expect(body.error).toMatch(/csv/i);
    expect(mocks.runBulkOnboarding).not.toHaveBeenCalled();
  });

  it('7) application/xml → 415 con mensaje accionable', async () => {
    const req = makeRequest({
      headers: { authorization: 'Bearer vault-secret-123' },
      contentType: 'application/xml',
      body: '<xml/>',
    });
    const res = await callRoute(req);
    expect(res.status).toBe(415);
    const body = await res.json();
    expect(body.error).toMatch(/Content-Type.*no soportado/);
    expect(mocks.runBulkOnboarding).not.toHaveBeenCalled();
  });

  it('8) Body demasiado grande (Content-Length > 5MB) → 415 con cap', async () => {
    const req = makeRequest({
      headers: {
        authorization: 'Bearer vault-secret-123',
        'content-length': String(6 * 1024 * 1024),
      },
      contentType: 'text/csv',
      body: VALID_CSV,
    });
    const res = await callRoute(req);
    expect(res.status).toBe(415);
    const body = await res.json();
    expect(body.error).toMatch(/demasiado grande/);
    expect(mocks.runBulkOnboarding).not.toHaveBeenCalled();
  });
});

// ════════════════════════════════════════════════════════════════════════════════
// CSV parsing — rechazos 422
// ════════════════════════════════════════════════════════════════════════════════

describe('POST /api/admin/partner-bulk — csv edges: rechazos', () => {
  beforeEach(() => {
    process.env.CRON_SECRET = 'vault-secret-123';
  });
  afterEach(() => {
    delete process.env.CRON_SECRET;
  });

  it('9) CSV con header válido pero 0 filas válidas → 422 CSV_NO_VALID_ROWS', async () => {
    const csv = 'empresa,subdomain,email\n,,,\n';
    const req = makeRequest({
      headers: { authorization: 'Bearer vault-secret-123' },
      contentType: 'text/csv',
      body: csv,
    });
    const res = await callRoute(req);
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.code).toBe('CSV_NO_VALID_ROWS');
    expect(Array.isArray(body.errors)).toBe(true);
    expect(Array.isArray(body.emptyRows)).toBe(true);
    expect(mocks.runBulkOnboarding).not.toHaveBeenCalled();
  });

  it('10) CSV completamente vacío → 422', async () => {
    const req = makeRequest({
      headers: { authorization: 'Bearer vault-secret-123' },
      contentType: 'text/csv',
      body: '',
    });
    const res = await callRoute(req);
    expect(res.status).toBe(422);
    expect(mocks.runBulkOnboarding).not.toHaveBeenCalled();
  });

  it('11) CSV sin header reconocible → 422', async () => {
    const csv = 'foo,bar,baz\nx,y,z\n';
    const req = makeRequest({
      headers: { authorization: 'Bearer vault-secret-123' },
      contentType: 'text/csv',
      body: csv,
    });
    const res = await callRoute(req);
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.code).toBe('CSV_NO_VALID_ROWS');
    expect(body.errors).toBeDefined();
    expect(mocks.runBulkOnboarding).not.toHaveBeenCalled();
  });
});

// NOTA: el happy-path del endpoint (request válido → runner invocado →
// response 200 con report[]) está exhaustivamente cubierto en
// `tests/partner-bulk-runner.test.ts` (18 tests con mocks granulares).
// Aquí cubrimos sólo el HTTP-layer: rechazo rápido de auth y body parsing.
// Una integración end-to-end real se valida manualmente con curl contra
// el dev server (ver docs/MONEDA_TENANT_Y_PORTFOLIO.md, sección "📡").

// ═════════════════════════════════════════════════════════════════════════════
// DRY-RUN THOROUGHNESS — pre-query de subdominios ya ocupados en BD
// ═════════════════════════════════════════════════════════════════════════════

describe('POST /api/admin/partner-bulk — dry-run thoroughness', () => {
  beforeEach(() => {
    process.env.CRON_SECRET = 'vault-secret-123';
  });
  afterEach(() => {
    delete process.env.CRON_SECRET;
  });

  it('12) dryRun=true (header X-Dry-Run) → tenant.findMany con slug IN (excluyendo archivados)', async () => {
    // Devolvemos un subdominio ocupado para que existingSubdomains lo incluya.
    mocks.tenantFindMany.mockResolvedValue([{ slug: 'taken-sa' }]);

    const csv =
`empresa,subdomain,email
BrokerA,taken-sa,a@a.com
`;
    const req = makeRequest({
      headers: {
        authorization: 'Bearer vault-secret-123',
        'x-dry-run': 'true',
      },
      contentType: 'text/csv',
      body: csv,
    });
    const res = await callRoute(req);

    // El endpoint aceptó el request (200) y consultó Tenant.findMany.
    expect(res.status).toBe(200);
    expect(mocks.tenantFindMany).toHaveBeenCalledTimes(1);
    expect(mocks.tenantFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          slug: { in: ['taken-sa'] },
          estado: { not: 'archived' },
        }),
        select: { slug: true },
      }),
    );
    // Y el response declara dryRun=true en el header.
    expect(res.headers.get('x-bulk-dry-run')).toBe('true');
  });

  it('13) dryRun=true (body dryRun=true) → mismo comportamiento, NO dispara tenant.findMany si header ausente', async () => {
    // Si header ausente y body.dryRun=true, sigue siendo dry-run → findMany SÍ se llama.
    const csv =
`empresa,subdomain,email
BrokerA,sub-a,a@a.com
`;
    const req = makeRequest({
      headers: { authorization: 'Bearer vault-secret-123' },
      contentType: 'application/json',
      body: JSON.stringify({ csv, dryRun: true, concurrency: 3 }),
    });
    const res = await callRoute(req);

    expect(res.status).toBe(200);
    expect(mocks.tenantFindMany).toHaveBeenCalledTimes(1);
    expect(res.headers.get('x-bulk-dry-run')).toBe('true');
  });

  it('14) dryRun=false → tenant.findMany NO se llama (no queremos I/O extra)', async () => {
    const csv =
`empresa,subdomain,email
BrokerA,sub-a,a@a.com
`;
    const req = makeRequest({
      headers: { authorization: 'Bearer vault-secret-123' },
      contentType: 'text/csv',
      body: csv,
    });
    const res = await callRoute(req);

    expect(res.status).toBe(200);
    expect(mocks.tenantFindMany).not.toHaveBeenCalled();
    expect(res.headers.get('x-bulk-dry-run')).toBe('false');
  });

  it('15) X-Dry-Run header tiene prioridad sobre body.dryRun (true gana false)', async () => {
    const csv =
`empresa,subdomain,email
BrokerA,sub-a,a@a.com
`;
    const req = makeRequest({
      headers: {
        authorization: 'Bearer vault-secret-123',
        'x-dry-run': '1', // header dice dry-run
      },
      contentType: 'application/json',
      body: JSON.stringify({ csv, dryRun: false }), // body dice lo contrario
    });
    const res = await callRoute(req);

    expect(res.status).toBe(200);
    expect(res.headers.get('x-bulk-dry-run')).toBe('true');
    expect(mocks.tenantFindMany).toHaveBeenCalledTimes(1);
  });

  it('16) dry-run con 2 subdominios: tenant.findMany recibe AMBOS en el filtro slug IN', async () => {
    const csv =
`empresa,subdomain,email
BrokerA,sub-a,a@a.com
BrokerB,sub-b,b@b.com
`;
    const req = makeRequest({
      headers: {
        authorization: 'Bearer vault-secret-123',
        'x-dry-run': 'true',
      },
      contentType: 'text/csv',
      body: csv,
    });
    const res = await callRoute(req);

    expect(res.status).toBe(200);
    expect(mocks.tenantFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          slug: { in: ['sub-a', 'sub-b'] },
        }),
      }),
    );
  });
});
