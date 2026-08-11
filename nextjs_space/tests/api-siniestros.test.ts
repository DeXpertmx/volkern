// @vitest-environment node

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Mocks (hoisted por vitest antes de cualquier import) ──────────────────

vi.mock('@/lib/db', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
    },
    poliza: { findFirst: vi.fn() },
    contact: { findFirst: vi.fn() },
    aseguradora: { findFirst: vi.fn() },
    siniestro: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock('next-auth', () => ({
  getServerSession: vi.fn(),
}));

const { prisma } = await import('@/lib/db');
const { getServerSession } = await import('next-auth');

// Routes importadas DESPUÉS de los mocks
const { POST: POST_LIST, GET: GET_LIST } = await import('@/app/api/insurance/siniestros/route');
const {
  GET: GET_BY_ID,
  PATCH: PATCH_BY_ID,
} = await import('@/app/api/insurance/siniestros/[id]/route');

// ─── Fixtures ──────────────────────────────────────────────────────────────

const TENANT = 'tenant-1';
const USER_ID = 'user-1';
const POLIZA_ID = 'poliza-1';
const SINIESTRO_ID = 'siniestro-1';

const POLIZA_FIXTURE = {
  id: POLIZA_ID,
  clienteId: 'cliente-1',
  aseguradoraId: 'aseguradora-1',
  moneda: 'EUR',
};

const SINIESTRO_FIXTURE = {
  id: SINIESTRO_ID,
  tenantId: TENANT,
  polizaId: POLIZA_ID,
  clienteId: 'cliente-1',
  aseguradoraId: 'aseguradora-1',
  descripcion: 'Choque contra columna',
  fechaSuceso: new Date('2026-07-01'),
  fechaReporte: new Date('2026-07-02'),
  montoReclamado: 1500,
  estado: 'REPORTADO',
  moneda: 'EUR',
  createdAt: new Date(),
  updatedAt: new Date(),
};

function mockReq(opts: {
  url?: string;
  body?: any;
  headers?: Record<string, string>;
  method?: string;
}): Request {
  const url = opts.url ?? 'http://test/api/insurance/siniestros';
  const init: RequestInit = { method: opts.method ?? 'POST' };
  if (opts.headers) {
    const flat: Record<string, string> = {};
    for (const [k, v] of Object.entries(opts.headers)) flat[k] = v;
    init.headers = flat;
  }
  if (opts.body !== undefined) {
    init.body = JSON.stringify(opts.body);
    if (!init.headers) init.headers = {};
    (init.headers as Record<string, string>)['content-type'] = 'application/json';
  }
  return new Request(url, init);
}

// ─── Reset + session poliza mocks ───────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = 'test-cron-secret-fake';
  // Defaults que la mayoría de tests asume: session válida del user-1 en tenant-1.
  vi.mocked(getServerSession).mockResolvedValue({
    user: { id: USER_ID, email: 'b@volkern.app' },
  } as any);
  vi.mocked(prisma.user.findUnique).mockResolvedValue({
    id: USER_ID,
    tenantId: TENANT,
    role: null,
  } as any);
  vi.mocked(prisma.poliza.findFirst).mockResolvedValue(POLIZA_FIXTURE as any);
  vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: USER_ID } as any);
});

afterEach(() => {
  delete process.env.CRON_SECRET;
});

// ─── POST /api/insurance/siniestros ────────────────────────────────────────

describe('POST /api/insurance/siniestros', () => {
  it('401 cuando no hay auth (ni session ni Bearer)', async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);
    const res = await POST_LIST(
      mockReq({
        body: { polizaId: POLIZA_ID, descripcion: 'X' },
      }) as any,
    );
    expect(res.status).toBe(401);
  });

  it('201 con sesión válida (camino normal UI)', async () => {
    vi.mocked(prisma.siniestro.create).mockResolvedValue(SINIESTRO_FIXTURE as any);

    const res = await POST_LIST(
      mockReq({
        body: { polizaId: POLIZA_ID, descripcion: 'Choque lateral', montoReclamado: 1500 },
      }) as any,
    );
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.siniestro.id).toBe(SINIESTRO_ID);
    expect(json.message).toContain('REPORTADO');
  });

  it('201 con Bearer CRON_SECRET + tenantId en body', async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);
    vi.mocked(prisma.siniestro.create).mockResolvedValue({
      ...SINIESTRO_FIXTURE,
      id: 'siniestro-cron',
    } as any);

    const res = await POST_LIST(
      mockReq({
        headers: { authorization: 'Bearer test-cron-secret-fake' },
        body: {
          tenantId: TENANT,
          polizaId: POLIZA_ID,
          descripcion: 'Auto desde cron',
          montoReclamado: 800,
        },
      }) as any,
    );
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.siniestro.id).toBe('siniestro-cron');
  });

  it('401 cuando Bearer está presente pero el token no coincide', async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);
    const res = await POST_LIST(
      mockReq({
        headers: { authorization: 'Bearer wrong-token' },
        body: {
          tenantId: TENANT,
          polizaId: POLIZA_ID,
          descripcion: 'X',
        },
      }) as any,
    );
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toContain('Bearer token inválido');
  });

  it('400 cuando Bearer está presente pero falta tenantId en body', async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);
    const res = await POST_LIST(
      mockReq({
        headers: { authorization: 'Bearer test-cron-secret-fake' },
        body: { polizaId: POLIZA_ID, descripcion: 'X' }, // sin tenantId
      }) as any,
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain('tenantId');
  });

  it('500 cuando CRON_SECRET no está configurado en el servidor', async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);
    delete process.env.CRON_SECRET;
    const res = await POST_LIST(
      mockReq({
        headers: { authorization: 'Bearer whatever' },
        body: { tenantId: TENANT, polizaId: POLIZA_ID, descripcion: 'X' },
      }) as any,
    );
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toContain('CRON_SECRET');
  });

  it('422 cuando la póliza no existe', async () => {
    vi.mocked(prisma.poliza.findFirst).mockResolvedValue(null);
    const res = await POST_LIST(
      mockReq({
        body: { polizaId: 'no-existe', descripcion: 'X' },
      }) as any,
    );
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.code).toBe('NOT_FOUND');
  });

  it('422 cuando falta descripción', async () => {
    const res = await POST_LIST(
      mockReq({
        body: { polizaId: POLIZA_ID, descripcion: '' },
      }) as any,
    );
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.code).toBe('VALIDATION');
  });
});

// ─── GET /api/insurance/siniestros ─────────────────────────────────────────

describe('GET /api/insurance/siniestros (list)', () => {
  it('200 lista paginada con sesión', async () => {
    vi.mocked(prisma.siniestro.findMany).mockResolvedValue([SINIESTRO_FIXTURE] as any);
    vi.mocked(prisma.siniestro.count).mockResolvedValue(1);

    const url = 'http://test/api/insurance/siniestros?page=1&limit=10';
    const res = await GET_LIST(mockReq({ url, method: 'GET' }) as any);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.siniestros).toHaveLength(1);
    expect(json.total).toBe(1);
    expect(json.totalPages).toBe(1);
  });

  it('200 con filtros (estado, polizaId, clienteId, aseguradoraId)', async () => {
    vi.mocked(prisma.siniestro.findMany).mockResolvedValue([]);
    vi.mocked(prisma.siniestro.count).mockResolvedValue(0);

    const url = new URL('http://test/api/insurance/siniestros');
    url.searchParams.set('estado', 'EN_TRAMITE');
    url.searchParams.set('polizaId', POLIZA_ID);
    url.searchParams.set('clienteId', 'cliente-1');
    url.searchParams.set('aseguradoraId', 'aseguradora-1');
    url.searchParams.set('page', '2');
    url.searchParams.set('limit', '5');

    const res = await GET_LIST(mockReq({ url: url.toString(), method: 'GET' }) as any);
    expect(res.status).toBe(200);

    const findManyArgs = vi.mocked(prisma.siniestro.findMany).mock.calls[0][0];
    expect(findManyArgs.where).toMatchObject({
      tenantId: TENANT,
      estado: 'EN_TRAMITE',
      polizaId: POLIZA_ID,
      clienteId: 'cliente-1',
      aseguradoraId: 'aseguradora-1',
    });
    expect(findManyArgs.skip).toBe(5); // (2-1)*5
    expect(findManyArgs.take).toBe(5);
  });

  it('200 con Bearer CRON_SECRET + tenantId en query', async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);
    vi.mocked(prisma.siniestro.findMany).mockResolvedValue([]);
    vi.mocked(prisma.siniestro.count).mockResolvedValue(0);

    const url = `http://test/api/insurance/siniestros?tenantId=${TENANT}`;
    const res = await GET_LIST(
      mockReq({
        url,
        method: 'GET',
        headers: { authorization: 'Bearer test-cron-secret-fake' },
      }) as any,
    );
    expect(res.status).toBe(200);
  });

  it('401 sin auth ni Bearer', async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);
    const res = await GET_LIST(mockReq({ url: 'http://test/x', method: 'GET' }) as any);
    expect(res.status).toBe(401);
  });

  it('400 con Bearer pero sin tenantId en query', async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);
    const res = await GET_LIST(
      mockReq({
        url: 'http://test/api/insurance/siniestros',
        method: 'GET',
        headers: { authorization: 'Bearer test-cron-secret-fake' },
      }) as any,
    );
    expect(res.status).toBe(400);
  });
});

// ─── GET /api/insurance/siniestros/[id] ─────────────────────────────────────

describe('GET /api/insurance/siniestros/[id]', () => {
  it('200 devuelve siniestro con joins', async () => {
    vi.mocked(prisma.siniestro.findFirst).mockResolvedValue({
      ...SINIESTRO_FIXTURE,
      poliza: { id: POLIZA_ID, numeroPoliza: 'P-001' },
      cliente: { id: 'cliente-1', nombre: 'Juan', email: 'j@x.com' },
      aseguradora: { id: 'aseg-1', nombre: 'AXA' },
      createdBy: { id: USER_ID, name: 'Bruno' },
    } as any);

    const req = mockReq({
      url: `http://test/api/insurance/siniestros/${SINIESTRO_ID}`,
      method: 'GET',
    }) as any;
    const res = await GET_BY_ID(req, { params: { id: SINIESTRO_ID } });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.siniestro.id).toBe(SINIESTRO_ID);
    expect(json.siniestro.poliza.numeroPoliza).toBe('P-001');
  });

  it('404 cuando no existe', async () => {
    vi.mocked(prisma.siniestro.findFirst).mockResolvedValue(null);
    const req = mockReq({
      url: 'http://test/api/insurance/siniestros/no-existe',
      method: 'GET',
    }) as any;
    const res = await GET_BY_ID(req, { params: { id: 'no-existe' } });
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.code).toBe('NOT_FOUND');
  });

  it('401 sin auth', async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);
    const req = mockReq({
      url: 'http://test/api/insurance/siniestros/x',
      method: 'GET',
    }) as any;
    const res = await GET_BY_ID(req, { params: { id: 'x' } });
    expect(res.status).toBe(401);
  });
});

// ─── PATCH /api/insurance/siniestros/[id] ───────────────────────────────────

describe('PATCH /api/insurance/siniestros/[id]', () => {
  it('200 transición válida: REPORTADO → EN_TRAMITE', async () => {
    vi.mocked(prisma.siniestro.findFirst).mockResolvedValue({
      id: SINIESTRO_ID,
      estado: 'REPORTADO',
    } as any);
    vi.mocked(prisma.siniestro.update).mockResolvedValue({
      ...SINIESTRO_FIXTURE,
      estado: 'EN_TRAMITE',
    } as any);

    const req = mockReq({
      url: `http://test/api/insurance/siniestros/${SINIESTRO_ID}`,
      method: 'PATCH',
      body: { estado: 'EN_TRAMITE', notas: 'Documentación enviada' },
    }) as any;
    const res = await PATCH_BY_ID(req, { params: { id: SINIESTRO_ID } });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.siniestro.estado).toBe('EN_TRAMITE');
    expect(json.message).toContain('REPORTADO');
    expect(json.message).toContain('EN_TRAMITE');
  });

  it('422 transición ilegal (REPORTADO → PAGADO)', async () => {
    vi.mocked(prisma.siniestro.findFirst).mockResolvedValue({
      id: SINIESTRO_ID,
      estado: 'REPORTADO',
    } as any);

    const req = mockReq({
      url: `http://test/api/insurance/siniestros/${SINIESTRO_ID}`,
      method: 'PATCH',
      body: { estado: 'PAGADO', montoIndemnizado: 1000 },
    }) as any;
    const res = await PATCH_BY_ID(req, { params: { id: SINIESTRO_ID } });
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.code).toBe('INVALID_TRANSITION');
  });

  it('422 PAGADO sin montoIndemnizado > 0', async () => {
    vi.mocked(prisma.siniestro.findFirst).mockResolvedValue({
      id: SINIESTRO_ID,
      estado: 'ABIERTO',
    } as any);

    const req = mockReq({
      url: `http://test/api/insurance/siniestros/${SINIESTRO_ID}`,
      method: 'PATCH',
      body: { estado: 'PAGADO' }, // sin montoIndemnizado
    }) as any;
    const res = await PATCH_BY_ID(req, { params: { id: SINIESTRO_ID } });
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.code).toBe('INVALID_RULE');
  });

  it('422 RECHAZADO sin motivoRechazo', async () => {
    vi.mocked(prisma.siniestro.findFirst).mockResolvedValue({
      id: SINIESTRO_ID,
      estado: 'EN_TRAMITE',
    } as any);

    const req = mockReq({
      url: `http://test/api/insurance/siniestros/${SINIESTRO_ID}`,
      method: 'PATCH',
      body: { estado: 'RECHAZADO' },
    }) as any;
    const res = await PATCH_BY_ID(req, { params: { id: SINIESTRO_ID } });
    expect(res.status).toBe(422);
    expect((await res.json()).code).toBe('INVALID_RULE');
  });

  it('404 cuando no existe', async () => {
    vi.mocked(prisma.siniestro.findFirst).mockResolvedValue(null);
    const req = mockReq({
      url: 'http://test/api/insurance/siniestros/no-existe',
      method: 'PATCH',
      body: { estado: 'EN_TRAMITE' },
    }) as any;
    const res = await PATCH_BY_ID(req, { params: { id: 'no-existe' } });
    expect(res.status).toBe(404);
  });

  it('400 cuando falta estado en body', async () => {
    const req = mockReq({
      url: `http://test/api/insurance/siniestros/${SINIESTRO_ID}`,
      method: 'PATCH',
      body: { notas: 'algo' }, // sin estado
    }) as any;
    const res = await PATCH_BY_ID(req, { params: { id: SINIESTRO_ID } });
    expect(res.status).toBe(400);
  });

  it('200 con Bearer CRON_SECRET + tenantId en body', async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);
    vi.mocked(prisma.siniestro.findFirst).mockResolvedValue({
      id: SINIESTRO_ID,
      estado: 'REPORTADO',
    } as any);
    vi.mocked(prisma.siniestro.update).mockResolvedValue({
      ...SINIESTRO_FIXTURE,
      estado: 'EN_TRAMITE',
    } as any);

    const req = mockReq({
      url: `http://test/api/insurance/siniestros/${SINIESTRO_ID}`,
      method: 'PATCH',
      headers: { authorization: 'Bearer test-cron-secret-fake' },
      body: { tenantId: TENANT, estado: 'EN_TRAMITE' },
    }) as any;
    const res = await PATCH_BY_ID(req, { params: { id: SINIESTRO_ID } });
    expect(res.status).toBe(200);
  });
});
