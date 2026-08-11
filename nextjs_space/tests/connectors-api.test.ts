// @vitest-environment node

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Mocks (hoisted por vitest antes de cualquier import) ──────────────────

vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
  },
}));

vi.mock('next-auth', () => ({
  getServerSession: vi.fn(),
}));

vi.mock('@/lib/insurance/connectors/InsurerConnector', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/insurance/connectors/InsurerConnector')>();
  return {
    ...actual, // conserva ConnectorError, VALID_INSURER_SLUGS, tipos...
    getInsurerConnector: vi.fn(),
  };
});

vi.mock('@/lib/insurance/connectors-skills', () => ({
  sync_cartera_desde_aseguradora: vi.fn(),
  emitir_poliza_en_aseguradora: vi.fn(),
}));

const { prisma } = await import('@/lib/db');
const { getServerSession } = await import('next-auth');
const { getInsurerConnector, ConnectorError, VALID_INSURER_SLUGS } = await import(
  '@/lib/insurance/connectors/InsurerConnector'
);
const { sync_cartera_desde_aseguradora, emitir_poliza_en_aseguradora } = await import(
  '@/lib/insurance/connectors-skills'
);

const { GET: GET_LIST } = await import('@/app/api/insurance/connectors/route');
const { POST: POST_SYNC } = await import('@/app/api/insurance/connectors/[slug]/sync/route');
const { POST: POST_EMITIR } = await import('@/app/api/insurance/connectors/[slug]/emitir/route');

// ─── Fixtures ──────────────────────────────────────────────────────────────

const TENANT = 'tenant-1';
const USER_ID = 'user-1';

const QUALITAS_METADATA = {
  slug: 'qualitas',
  nombre: 'Quálitas Compañía de Seguros, S.A. de C.V.',
  country: 'MX',
  regulatoryId: 'CNSF-S0098-0314-2000',
  website: 'https://www.qualitas.com.mx',
  monedaBase: 'MXN',
  supportedRamos: ['AUTO'],
  capabilities: ['AUTH_API_KEY', 'POLICIES_LIST', 'POLICIES_ISSUE', 'CLAIMS_SUBMIT', 'CLAIMS_STATUS'],
  isMock: true,
};

const SYNC_FIXTURE = {
  slug: 'qualitas',
  totalEnPartner: 1,
  pagina: 1,
  totalPaginas: 1,
  summary: { created: 1, updated: 0, skipped: 0, errors: 0, dryRun: false },
  processed: [{ numeroPoliza: 'Q-2026-001', accion: 'created', estado: 'ACTIVA', polizaId: 'poliza-1' }],
  errors: [],
  mensaje: '✅ Importada 1 póliza nueva desde qualitas.',
};

function mockReq(opts: {
  url?: string;
  body?: any;
  headers?: Record<string, string>;
  method?: string;
}): Request {
  const url = opts.url ?? 'http://test/api/insurance/connectors/qualitas/sync';
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

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = 'test-cron-secret-fake';
  vi.mocked(getServerSession).mockResolvedValue({ user: { id: USER_ID, email: 'a@volkern.app' } } as any);
  vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: USER_ID, tenantId: TENANT } as any);
});

afterEach(() => {
  delete process.env.CRON_SECRET;
});

// ─── GET /api/insurance/connectors ─────────────────────────────────────────

describe('GET /api/insurance/connectors (listado)', () => {
  it('200 lista conectores disponibles y marca como pendiente los no implementados', async () => {
    vi.mocked(getInsurerConnector).mockImplementation(async (slug: string) => {
      if (slug === 'qualitas') return { metadata: QUALITAS_METADATA } as any;
      throw new ConnectorError('INTERNAL', `Connector '${slug}' pendiente de implementación.`);
    });

    const res = await GET_LIST();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.connectors).toHaveLength(VALID_INSURER_SLUGS.length);

    const qualitas = json.connectors.find((c: any) => c.slug === 'qualitas');
    expect(qualitas.status).toBe('disponible');
    expect(qualitas.isMock).toBe(true);
    expect(qualitas.supportedRamos).toEqual(['AUTO']);

    const tirea = json.connectors.find((c: any) => c.slug === 'tirea');
    expect(tirea.status).toBe('pendiente');
  });

  it('401 sin sesión', async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);
    const res = await GET_LIST();
    expect(res.status).toBe(401);
  });
});

// ─── POST /api/insurance/connectors/[slug]/sync ────────────────────────────

describe('POST /api/insurance/connectors/[slug]/sync', () => {
  it('200 con sesión: sincroniza con el tenant del usuario', async () => {
    vi.mocked(sync_cartera_desde_aseguradora).mockResolvedValue(SYNC_FIXTURE as any);

    const res = await POST_SYNC(
      mockReq({ body: { dryRun: true, limit: 10 } }) as any,
      { params: { slug: 'qualitas' } },
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.summary.created).toBe(1);

    expect(sync_cartera_desde_aseguradora).toHaveBeenCalledWith(
      expect.objectContaining({
        slug: 'qualitas',
        tenantId: TENANT,
        dryRun: true,
        limit: 10,
      }),
    );
  });

  it('200 con Bearer CRON_SECRET + tenantId en body', async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);
    vi.mocked(sync_cartera_desde_aseguradora).mockResolvedValue({ ...SYNC_FIXTURE, slug: 'gnp' } as any);

    const res = await POST_SYNC(
      mockReq({
        headers: { authorization: 'Bearer test-cron-secret-fake' },
        body: { tenantId: TENANT, actualizarExistentes: true },
      }) as any,
      { params: { slug: 'gnp' } },
    );
    expect(res.status).toBe(200);
    expect(sync_cartera_desde_aseguradora).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: TENANT, actualizarExistentes: true }),
    );
  });

  it('401 sin auth ni Bearer', async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);
    const res = await POST_SYNC(mockReq({ body: {} }) as any, { params: { slug: 'qualitas' } });
    expect(res.status).toBe(401);
  });

  it('502 cuando el partner está caído (ConnectorError PARTNER_DOWN)', async () => {
    vi.mocked(sync_cartera_desde_aseguradora).mockRejectedValue(
      new ConnectorError('PARTNER_DOWN', 'Quálitas sandbox no responde.'),
    );
    const res = await POST_SYNC(mockReq({ body: {} }) as any, { params: { slug: 'qualitas' } });
    expect(res.status).toBe(502);
    const json = await res.json();
    expect(json.code).toBe('PARTNER_DOWN');
  });

  it('501 cuando el conector no soporta la capability', async () => {
    vi.mocked(sync_cartera_desde_aseguradora).mockRejectedValue(
      new ConnectorError('UNSUPPORTED_CAPABILITY', 'TIREA usa ficheros, no REST.'),
    );
    const res = await POST_SYNC(mockReq({ body: {} }) as any, { params: { slug: 'tirea' } });
    expect(res.status).toBe(501);
  });
});

// ─── POST /api/insurance/connectors/[slug]/emitir ──────────────────────────

describe('POST /api/insurance/connectors/[slug]/emitir', () => {
  it('200 con sesión: emite la póliza contra el partner', async () => {
    vi.mocked(emitir_poliza_en_aseguradora).mockResolvedValue({
      slug: 'qualitas',
      polizaId: 'poliza-1',
      nuevoNumeroPolizaInterno: 'P-001',
      externalId: 'ext-1',
      numeroPolizaPartner: 'Q-2026-777',
      documentoUrl: 'https://qualitas.example/polizas/Q-2026-777.pdf',
      primaAnual: 850,
      emision: 1,
      mensajePartner: 'Emitida',
      accion: 'issued',
      mensaje: '✅ Póliza P-001 emitida en Quálitas.',
    } as any);

    const res = await POST_EMITIR(
      mockReq({ body: { polizaId: 'poliza-1', dryRun: false } }) as any,
      { params: { slug: 'qualitas' } },
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.numeroPolizaPartner).toBe('Q-2026-777');
    expect(emitir_poliza_en_aseguradora).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: TENANT, polizaId: 'poliza-1', dryRun: false }),
    );
  });

  it('400 cuando falta polizaId', async () => {
    const res = await POST_EMITIR(mockReq({ body: {} }) as any, { params: { slug: 'qualitas' } });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.code).toBe('VALIDATION');
    expect(emitir_poliza_en_aseguradora).not.toHaveBeenCalled();
  });

  it('401 sin auth ni Bearer', async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);
    const res = await POST_EMITIR(
      mockReq({ body: { polizaId: 'poliza-1' } }) as any,
      { params: { slug: 'qualitas' } },
    );
    expect(res.status).toBe(401);
  });

  it('400 con Bearer pero sin tenantId', async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);
    const res = await POST_EMITIR(
      mockReq({
        headers: { authorization: 'Bearer test-cron-secret-fake' },
        body: { polizaId: 'poliza-1' },
      }) as any,
      { params: { slug: 'qualitas' } },
    );
    expect(res.status).toBe(400);
  });
});
