import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ─────────────────────────────────────────────────────────────────

vi.mock('@/lib/db', () => ({
  prisma: {
    siniestro: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
    },
    poliza: {
      findFirst: vi.fn(),
    },
    contact: {
      findFirst: vi.fn(),
    },
    aseguradora: {
      findFirst: vi.fn(),
    },
    user: {
      findFirst: vi.fn(),
    },
  },
  getTenantDb: vi.fn(),
  dbContext: { tenantId: 'test-tenant-id' },
}));

const { prisma } = await import('@/lib/db');
const {
  createSiniestro,
  updateEstadoSiniestro,
  listSiniestros,
  getSiniestroById,
} = await import('@/lib/skills/siniestros-skills');

// ─── Fixtures ──────────────────────────────────────────────────────────────

const TENANT = 'tenant-1';
const POLIZA_ID = 'poliza-1';
const CLIENTE_ID = 'cliente-1';
const ASEGURADORA_ID = 'aseguradora-1';
const USER_ID = 'user-1';

const POLIZA_FIXTURE = {
  id: POLIZA_ID,
  clienteId: CLIENTE_ID,
  aseguradoraId: ASEGURADORA_ID,
  moneda: 'EUR',
};

// Default fixture id used for most tests; specific tests override `id`.
function mockSiniestro(overrides: Record<string, unknown> = {}): any {
  return {
    id: 's-1',
    tenantId: TENANT,
    polizaId: POLIZA_ID,
    clienteId: CLIENTE_ID,
    aseguradoraId: ASEGURADORA_ID,
    descripcion: 'Choque lateral contra columna',
    fechaSuceso: new Date('2026-07-01'),
    fechaReporte: new Date('2026-07-02'),
    montoReclamado: 1500,
    estado: 'REPORTADO',
    moneda: 'EUR',
    createdAt: new Date('2026-07-02'),
    updatedAt: new Date('2026-07-02'),
    ...overrides,
  };
}

// ─── Reset mocks ───────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.poliza.findFirst).mockResolvedValue(POLIZA_FIXTURE as any);
  vi.mocked(prisma.user.findFirst).mockResolvedValue({ id: USER_ID } as any);
});

// ─── createSiniestro ───────────────────────────────────────────────────────

describe('createSiniestro', () => {
  it('happy path: poliza existe → crea siniestro con defaults sensatos', async () => {
    const created = mockSiniestro();
    vi.mocked(prisma.siniestro.create).mockResolvedValue(created as any);

    const result = await createSiniestro({
      tenantId: TENANT,
      polizaId: POLIZA_ID,
      descripcion: 'Choque lateral contra columna',
      montoReclamado: '1.500,00', // formato español
      createdById: USER_ID,
    });

    expect(result.siniestro).toEqual(created);
    expect(result.message).toContain('REPORTADO');
    // FKs heredadas de la póliza
    const callArgs = vi.mocked(prisma.siniestro.create).mock.calls[0][0];
    expect(callArgs.data.clienteId).toBe(CLIENTE_ID);
    expect(callArgs.data.aseguradoraId).toBe(ASEGURADORA_ID);
    expect(callArgs.data.moneda).toBe('EUR');
    expect(callArgs.data.estado).toBe('REPORTADO');
    expect(callArgs.data.montoReclamado).toBe(1500);
  });

  it('rechaza si falta tenantId', async () => {
    await expect(
      createSiniestro({
        tenantId: '',
        polizaId: POLIZA_ID,
        descripcion: 'X',
      }),
    ).rejects.toThrow(/tenantId es obligatorio/);
  });

  it('rechaza si falta polizaId', async () => {
    await expect(
      createSiniestro({
        tenantId: TENANT,
        polizaId: '',
        descripcion: 'X',
      }),
    ).rejects.toThrow(/polizaId es obligatorio/);
  });

  it('rechaza si la póliza no existe en el tenant', async () => {
    vi.mocked(prisma.poliza.findFirst).mockResolvedValue(null);
    await expect(
      createSiniestro({
        tenantId: TENANT,
        polizaId: 'no-existe',
        descripcion: 'X',
      }),
    ).rejects.toThrow(/No se encontró la póliza/);
  });

  it('rechaza si descripción vacía', async () => {
    await expect(
      createSiniestro({
        tenantId: TENANT,
        polizaId: POLIZA_ID,
        descripcion: '   ',
      }),
    ).rejects.toThrow(/descripcion es obligatoria/);
  });

  it('REPORTADO sin reglas extra (no exige montoIndemnizado)', async () => {
    const created = mockSiniestro();
    vi.mocked(prisma.siniestro.create).mockResolvedValue(created as any);
    await expect(
      createSiniestro({
        tenantId: TENANT,
        polizaId: POLIZA_ID,
        descripcion: 'Sin papeles aún',
        createdById: USER_ID,
      }),
    ).resolves.toBeDefined();
  });

  it('rechaza PAGADO si montoReclamado <= 0', async () => {
    await expect(
      createSiniestro({
        tenantId: TENANT,
        polizaId: POLIZA_ID,
        descripcion: 'Directo a PAGADO',
        estado: 'PAGADO',
        montoReclamado: 0,
        createdById: USER_ID,
      }),
    ).rejects.toThrow(/montoIndemnizado debe ser > 0/);
  });
});

// ─── updateEstadoSiniestro ─────────────────────────────────────────────────

describe('updateEstadoSiniestro', () => {
  it('happy path: REPORTADO → EN_TRAMITE sin reglas extra', async () => {
    vi.mocked(prisma.siniestro.findFirst).mockResolvedValue({
      id: 's-1',
      estado: 'REPORTADO',
    } as any);
    const updated = mockSiniestro({ estado: 'EN_TRAMITE' });
    vi.mocked(prisma.siniestro.update).mockResolvedValue(updated as any);

    const result = await updateEstadoSiniestro({
      tenantId: TENANT,
      id: 's-1',
      estado: 'EN_TRAMITE',
      notas: 'Documentación enviada',
    });

    expect(result.siniestro.estado).toBe('EN_TRAMITE');
    expect(result.message).toContain('REPORTADO');
    expect(result.message).toContain('EN_TRAMITE');
  });

  it('rechaza transición ilegal: REPORTADO → PAGADO', async () => {
    vi.mocked(prisma.siniestro.findFirst).mockResolvedValue({
      id: 's-1',
      estado: 'REPORTADO',
    } as any);
    await expect(
      updateEstadoSiniestro({
        tenantId: TENANT,
        id: 's-1',
        estado: 'PAGADO',
        montoIndemnizado: 1000,
      }),
    ).rejects.toThrow(/Transición de estado no permitida/);
  });

  it('rechaza PAGADO sin montoIndemnizado > 0', async () => {
    vi.mocked(prisma.siniestro.findFirst).mockResolvedValue({
      id: 's-1',
      estado: 'ABIERTO',
    } as any);
    await expect(
      updateEstadoSiniestro({
        tenantId: TENANT,
        id: 's-1',
        estado: 'PAGADO',
        montoIndemnizado: 0,
      }),
    ).rejects.toThrow(/montoIndemnizado debe ser > 0/);
  });

  it('rechaza RECHAZADO sin motivoRechazo', async () => {
    vi.mocked(prisma.siniestro.findFirst).mockResolvedValue({
      id: 's-1',
      estado: 'EN_TRAMITE',
    } as any);
    await expect(
      updateEstadoSiniestro({
        tenantId: TENANT,
        id: 's-1',
        estado: 'RECHAZADO',
      }),
    ).rejects.toThrow(/motivoRechazo es obligatorio/);
  });

  it('rechaza CERRADO sin fechaCierre (la completa automáticamente si falta)', async () => {
    vi.mocked(prisma.siniestro.findFirst).mockResolvedValue({
      id: 's-1',
      estado: 'PAGADO',
    } as any);
    const updated = mockSiniestro({ estado: 'CERRADO', fechaCierre: new Date() });
    vi.mocked(prisma.siniestro.update).mockResolvedValue(updated as any);

    const result = await updateEstadoSiniestro({
      tenantId: TENANT,
      id: 's-1',
      estado: 'CERRADO',
    });
    // Implica que se setea fechaCierre implícita al transicionar
    const callArgs = vi.mocked(prisma.siniestro.update).mock.calls[0][0];
    expect(callArgs.data.fechaCierre).toBeInstanceOf(Date);
    expect(result.siniestro.estado).toBe('CERRADO');
  });

  it('rechaza si siniestro no existe en el tenant', async () => {
    vi.mocked(prisma.siniestro.findFirst).mockResolvedValue(null);
    await expect(
      updateEstadoSiniestro({
        tenantId: TENANT,
        id: 'no-existe',
        estado: 'EN_TRAMITE',
      }),
    ).rejects.toThrow(/No se encontró el siniestro/);
  });

  it('estado terminal CERRADO no permite transiciones', async () => {
    vi.mocked(prisma.siniestro.findFirst).mockResolvedValue({
      id: 's-1',
      estado: 'CERRADO',
    } as any);
    await expect(
      updateEstadoSiniestro({
        tenantId: TENANT,
        id: 's-1',
        estado: 'PAGADO',
        montoIndemnizado: 500,
      }),
    ).rejects.toThrow(/Transición de estado no permitida/);
  });
});

// ─── listSiniestros ────────────────────────────────────────────────────────

describe('listSiniestros', () => {
  it('devuelve page con joins a poliza/cliente/aseguradora', async () => {
    const fakeRows = [
      mockSiniestro({ id: 's-1' }),
      mockSiniestro({
        id: 's-2',
        estado: 'PAGADO',
        montoIndemnizado: 1200,
      }),
    ];
    vi.mocked(prisma.siniestro.findMany).mockResolvedValue(fakeRows as any);
    vi.mocked(prisma.siniestro.count).mockResolvedValue(2);

    const result = await listSiniestros({ tenantId: TENANT });

    expect(result.total).toBe(2);
    expect(result.page).toBe(1);
    expect(result.totalPages).toBe(1);
    expect(result.siniestros).toHaveLength(2);
    // El include tiene poliza/cliente/aseguradora
    const findManyArgs = vi.mocked(prisma.siniestro.findMany).mock.calls[0][0];
    expect(findManyArgs.include).toMatchObject({
      poliza: expect.any(Object),
      cliente: expect.any(Object),
      aseguradora: expect.any(Object),
    });
  });

  it('pasa filtros (estado, polizaId) al where', async () => {
    vi.mocked(prisma.siniestro.findMany).mockResolvedValue([]);
    vi.mocked(prisma.siniestro.count).mockResolvedValue(0);

    await listSiniestros({
      tenantId: TENANT,
      estado: 'EN_TRAMITE',
      polizaId: POLIZA_ID,
    });

    const findManyArgs = vi.mocked(prisma.siniestro.findMany).mock.calls[0][0];
    expect(findManyArgs.where).toMatchObject({
      tenantId: TENANT,
      estado: 'EN_TRAMITE',
      polizaId: POLIZA_ID,
    });
  });

  it('calcula paginación correctamente con limit', async () => {
    vi.mocked(prisma.siniestro.findMany).mockResolvedValue([]);
    vi.mocked(prisma.siniestro.count).mockResolvedValue(47);

    const result = await listSiniestros({
      tenantId: TENANT,
      page: 3,
      limit: 10,
    });

    expect(result.page).toBe(3);
    expect(result.totalPages).toBe(5); // ceil(47/10)
    const findManyArgs = vi.mocked(prisma.siniestro.findMany).mock.calls[0][0];
    expect(findManyArgs.skip).toBe(20); // (3-1)*10
    expect(findManyArgs.take).toBe(10);
  });

  it('cap limit a 100 para evitar queries enormes', async () => {
    vi.mocked(prisma.siniestro.findMany).mockResolvedValue([]);
    vi.mocked(prisma.siniestro.count).mockResolvedValue(0);

    await listSiniestros({
      tenantId: TENANT,
      limit: 9999,
    });

    const args = vi.mocked(prisma.siniestro.findMany).mock.calls[0][0];
    expect(args.take).toBe(100);
  });
});

// ─── getSiniestroById ──────────────────────────────────────────────────────

describe('getSiniestroById', () => {
  it('devuelve el siniestro con joins completos', async () => {
    const s = mockSiniestro();
    vi.mocked(prisma.siniestro.findFirst).mockResolvedValue({
      ...s,
      poliza: { id: POLIZA_ID, numeroPoliza: 'P-001' },
      cliente: { id: CLIENTE_ID, nombre: 'Juan', email: 'j@x.com' },
      aseguradora: { id: ASEGURADORA_ID, nombre: 'AXA', telefono: '+349000000' },
      createdBy: { id: USER_ID, name: 'Bruno', email: 'b@volkern.app' },
    } as any);

    const result = await getSiniestroById({ tenantId: TENANT, id: 's-1' });
    expect(result.siniestro.id).toBe('s-1');
    expect(result.siniestro.poliza?.numeroPoliza).toBe('P-001');
    expect(result.siniestro.cliente?.nombre).toBe('Juan');
  });

  it('rechaza si no existe', async () => {
    vi.mocked(prisma.siniestro.findFirst).mockResolvedValue(null);
    await expect(
      getSiniestroById({ tenantId: TENANT, id: 'no-existe' }),
    ).rejects.toThrow(/No se encontró el siniestro/);
  });

  it('rechaza si id vacío', async () => {
    await expect(
      getSiniestroById({ tenantId: TENANT, id: '' }),
    ).rejects.toThrow(/id es obligatorio/);
  });
});
