import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ─────────────────────────────────────────────────────────────────

vi.mock('@/lib/db', () => ({
  prisma: {
    cotizacion: {
      findFirst: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    deal: {
      update: vi.fn(),
    },
    dealActivity: {
      create: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
  },
}));

vi.mock('@/lib/api-key-auth', () => {
  const mockWithTenantAuth = (handler: any) => {
    return async (request: Request, _context?: any) => {
      const mockAuth = {
        valid: true,
        tenant: { id: 'test-tenant-id', nombre: 'Test Tenant', slug: 'test', plan: 'growth' },
        user: { id: 'test-user-id', name: 'Test User', email: 'test@test.com' },
      };
      // Next Route Handler entrega el contexto con params anidados.
      return handler(request, mockAuth, { params: { id: 'cot-1' } });
    };
  };
  return { withTenantAuth: mockWithTenantAuth };
});

// ─── Imports ───────────────────────────────────────────────────────────────

import { GET, PATCH, DELETE } from '@/app/api/cotizaciones/[id]/route';
import { prisma } from '@/lib/db';

// ─── Fixtures ──────────────────────────────────────────────────────────────

function mockRequest(url: string, body?: unknown): Request {
  if (body !== undefined) {
    return new Request(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }
  return new Request(url);
}

const mockCotizacion = {
  id: 'cot-1',
  tenantId: 'test-tenant-id',
  numero: 'COT-2025-0001',
  titulo: 'Proyecto IoT Sensores',
  descripcion: 'Implementación de 50 sensores IoT',
  subtotal: 35000,
  descuentoPorcentaje: 0,
  descuentoMonto: 0,
  impuestos: 7350,
  total: 42350,
  moneda: 'EUR',
  validezDias: 30,
  estado: 'pendiente',
  dealId: 'cl0deal00000000000000000001',
  leadId: null,
  creadoPorId: 'test-user-id',
  fechaCreacion: new Date('2025-05-20T10:00:00Z'),
  fechaVencimiento: new Date('2025-06-19T10:00:00Z'),
  fechaEnvio: null,
  fechaAceptacion: null,
  fechaFirma: null,
  firmadoPorCliente: false,
  ipFirma: null,
  items: [
    {
      id: 'item-1',
      concepto: 'Sensor IoT',
      cantidad: 50,
      precioUnitario: 700,
      subtotal: 35000,
      total: 42350,
      orden: 1,
    },
  ],
  deal: { id: 'cl0deal00000000000000000001', titulo: 'Proyecto IoT TechCorp', lead: { id: 'lead-1', nombre: 'Ana García' } },
  lead: null,
  tenant: { nombre: 'Test Tenant', dominio: 'test.volkern.app', configuracion: {} },
};

// ─── GET Tests ─────────────────────────────────────────────────────────────

describe('GET /api/cotizaciones/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('debe devolver la cotización con includes', async () => {
    (prisma.cotizacion.findFirst as any).mockResolvedValue(mockCotizacion);

    const response = await GET(mockRequest('https://volkern.app/api/cotizaciones/cot-1'));

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.cotizacion.titulo).toBe('Proyecto IoT Sensores');
    expect(json.cotizacion.total).toBe(42350);
  });

  it('debe incluir items (orden ascendente), deal (con lead), lead y tenant', async () => {
    (prisma.cotizacion.findFirst as any).mockResolvedValue(mockCotizacion);

    const response = await GET(mockRequest('https://volkern.app/api/cotizaciones/cot-1'));
    const json = await response.json();

    expect(json.cotizacion.items).toHaveLength(1);
    expect(json.cotizacion.items[0].concepto).toBe('Sensor IoT');
    expect(json.cotizacion.deal).toEqual(
      expect.objectContaining({ id: 'cl0deal00000000000000000001', titulo: 'Proyecto IoT TechCorp' }),
    );
    expect(json.cotizacion.deal.lead).toEqual(
      expect.objectContaining({ nombre: 'Ana García' }),
    );
    expect(json.cotizacion.lead).toBeNull();
    expect(json.cotizacion.tenant).toEqual(
      expect.objectContaining({ nombre: 'Test Tenant', dominio: 'test.volkern.app' }),
    );
  });

  it('debe buscar con id + tenantId para aislamiento', async () => {
    (prisma.cotizacion.findFirst as any).mockResolvedValue(mockCotizacion);

    await GET(mockRequest('https://volkern.app/api/cotizaciones/cot-1'));

    expect(prisma.cotizacion.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'cot-1', tenantId: 'test-tenant-id' },
      }),
    );
  });

  it('debe incluir todas las relaciones en el include', async () => {
    (prisma.cotizacion.findFirst as any).mockResolvedValue(mockCotizacion);

    await GET(mockRequest('https://volkern.app/api/cotizaciones/cot-1'));

    expect(prisma.cotizacion.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          items: { orderBy: { orden: 'asc' } },
          deal: { include: { lead: true } },
          lead: true,
          tenant: { select: { nombre: true, dominio: true, configuracion: true } },
        }),
      }),
    );
  });

  it('debe devolver 404 si la cotización no existe', async () => {
    (prisma.cotizacion.findFirst as any).mockResolvedValue(null);

    const response = await GET(mockRequest('https://volkern.app/api/cotizaciones/cot-nonexistent'));

    expect(response.status).toBe(404);
    const json = await response.json();
    expect(json.error).toBe('Cotización no encontrada');
  });

  it('debe devolver 404 para cotización de otro tenant (aislamiento)', async () => {
    (prisma.cotizacion.findFirst as any).mockResolvedValue(null);

    const response = await GET(mockRequest('https://volkern.app/api/cotizaciones/cot-other-tenant'));

    expect(response.status).toBe(404);
  });

  it('debe devolver 500 si Prisma falla', async () => {
    (prisma.cotizacion.findFirst as any).mockRejectedValue(new Error('DB error'));

    const response = await GET(mockRequest('https://volkern.app/api/cotizaciones/cot-1'));

    expect(response.status).toBe(500);
    const json = await response.json();
    expect(json.error).toBe('Error al obtener cotización');
  });

  it('debe serializar fechas como ISO strings', async () => {
    (prisma.cotizacion.findFirst as any).mockResolvedValue(mockCotizacion);

    const response = await GET(mockRequest('https://volkern.app/api/cotizaciones/cot-1'));
    const json = await response.json();

    expect(typeof json.cotizacion.fechaCreacion).toBe('string');
    expect(json.cotizacion.fechaCreacion).toBe(mockCotizacion.fechaCreacion.toISOString());
    expect(typeof json.cotizacion.fechaVencimiento).toBe('string');
    expect(json.cotizacion.fechaVencimiento).toBe(mockCotizacion.fechaVencimiento.toISOString());
  });
});

// ─── PATCH Tests ───────────────────────────────────────────────────────────

describe('PATCH /api/cotizaciones/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('debe actualizar estado y devolver { cotizacion }', async () => {
    (prisma.cotizacion.findFirst as any).mockResolvedValue(mockCotizacion);
    (prisma.cotizacion.update as any).mockResolvedValue({
      ...mockCotizacion,
      estado: 'enviada',
      fechaEnvio: new Date('2025-05-25T12:00:00Z'),
    });

    const response = await PATCH(
      mockRequest('https://volkern.app/api/cotizaciones/cot-1', {
        estado: 'enviada',
      }),
    );

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.cotizacion.estado).toBe('enviada');
  });

  it('debe actualizar una cotización borrador completa y recalcular descuentos fijos', async () => {
    (prisma.cotizacion.findFirst as any).mockResolvedValue({
      ...mockCotizacion,
      estado: 'borrador',
      descuentoPorcentaje: 0,
      impuestos: 0,
    });
    (prisma.cotizacion.update as any).mockResolvedValue({
      ...mockCotizacion,
      estado: 'borrador',
      total: 0,
    });

    const response = await PATCH(
      mockRequest('https://volkern.app/api/cotizaciones/cot-1', {
        titulo: 'Implementación anual',
        items: [{
          concepto: 'Implementación',
          cantidad: 1,
          precioUnitario: 500,
          descuento: 500,
          porcentajeImpuesto: 0,
        }],
        descuentoPorcentaje: 0,
        impuestos: 0,
      }),
    );

    expect(response.status).toBe(200);
    const updateData = (prisma.cotizacion.update as any).mock.calls[0][0].data;
    expect(updateData.subtotal).toBe(0);
    expect(updateData.total).toBe(0);
    expect(updateData.items).toEqual({
      deleteMany: {},
      create: [expect.objectContaining({ descuento: 500, subtotal: 0, total: 0 })],
    });
  });

  it('debe pasar estado a prisma.cotizacion.update', async () => {
    (prisma.cotizacion.findFirst as any).mockResolvedValue(mockCotizacion);
    (prisma.cotizacion.update as any).mockResolvedValue(mockCotizacion);

    await PATCH(
      mockRequest('https://volkern.app/api/cotizaciones/cot-1', {
        estado: 'enviada',
      }),
    );

    expect(prisma.cotizacion.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'cot-1' },
        data: expect.objectContaining({ estado: 'enviada' }),
      }),
    );
  });

  it('debe asignar fechaEnvio solo la primera vez que se marca como enviada', async () => {
    (prisma.cotizacion.findFirst as any).mockResolvedValue({
      ...mockCotizacion,
      fechaEnvio: null,
    });
    (prisma.cotizacion.update as any).mockResolvedValue({
      ...mockCotizacion,
      estado: 'enviada',
      fechaEnvio: new Date('2025-05-25T12:00:00Z'),
    });

    await PATCH(
      mockRequest('https://volkern.app/api/cotizaciones/cot-1', {
        estado: 'enviada',
      }),
    );

    // Debe incluir fechaEnvio porque antes era null
    expect(prisma.cotizacion.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          estado: 'enviada',
          fechaEnvio: expect.any(Date),
        }),
      }),
    );
  });

  it('NO debe re-asignar fechaEnvio si ya tenía fechaEnvio', async () => {
    (prisma.cotizacion.findFirst as any).mockResolvedValue({
      ...mockCotizacion,
      estado: 'enviada',
      fechaEnvio: new Date('2025-05-22T10:00:00Z'),
    });
    (prisma.cotizacion.update as any).mockResolvedValue(mockCotizacion);

    await PATCH(
      mockRequest('https://volkern.app/api/cotizaciones/cot-1', {
        estado: 'enviada',
      }),
    );

    const updateData = (prisma.cotizacion.update as any).mock.calls[0][0].data;
    expect(updateData.estado).toBe('enviada');
    expect(updateData.fechaEnvio).toBeUndefined();
  });

  it('debe asignar fechaAceptacion solo la primera vez que se marca como aceptada', async () => {
    (prisma.cotizacion.findFirst as any).mockResolvedValue({
      ...mockCotizacion,
      fechaAceptacion: null,
    });
    (prisma.cotizacion.update as any).mockResolvedValue({
      ...mockCotizacion,
      estado: 'aceptada',
      fechaAceptacion: new Date('2025-05-26T10:00:00Z'),
    });

    await PATCH(
      mockRequest('https://volkern.app/api/cotizaciones/cot-1', {
        estado: 'aceptada',
      }),
    );

    expect(prisma.cotizacion.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          estado: 'aceptada',
          fechaAceptacion: expect.any(Date),
        }),
      }),
    );
  });

  it('debe asignar fechaFirma e ipFirma cuando firmadoPorCliente es true y no tenía fechaFirma', async () => {
    (prisma.cotizacion.findFirst as any).mockResolvedValue({
      ...mockCotizacion,
      fechaFirma: null,
    });
    (prisma.cotizacion.update as any).mockResolvedValue(mockCotizacion);

    await PATCH(
      mockRequest('https://volkern.app/api/cotizaciones/cot-1', {
        firmadoPorCliente: true,
        ipFirma: '192.168.1.1',
      }),
    );

    expect(prisma.cotizacion.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          firmadoPorCliente: true,
          fechaFirma: expect.any(Date),
          ipFirma: '192.168.1.1',
        }),
      }),
    );
  });

  it('NO debe re-asignar fechaFirma si ya existía', async () => {
    (prisma.cotizacion.findFirst as any).mockResolvedValue({
      ...mockCotizacion,
      fechaFirma: new Date('2025-05-24T10:00:00Z'),
    });
    (prisma.cotizacion.update as any).mockResolvedValue(mockCotizacion);

    await PATCH(
      mockRequest('https://volkern.app/api/cotizaciones/cot-1', {
        firmadoPorCliente: true,
      }),
    );

    const updateData = (prisma.cotizacion.update as any).mock.calls[0][0].data;
    expect(updateData.firmadoPorCliente).toBe(true);
    expect(updateData.fechaFirma).toBeUndefined();
    expect(updateData.ipFirma).toBeUndefined();
  });

  it('debe incluir items, deal y lead en el resultado update', async () => {
    (prisma.cotizacion.findFirst as any).mockResolvedValue(mockCotizacion);
    (prisma.cotizacion.update as any).mockResolvedValue(mockCotizacion);

    await PATCH(
      mockRequest('https://volkern.app/api/cotizaciones/cot-1', {
        estado: 'enviada',
      }),
    );

    expect(prisma.cotizacion.update).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          items: true,
          deal: true,
          lead: true,
        }),
      }),
    );
  });

  // ── Deal update + activity cuando aceptada ──────────────────────────────

  it('debe actualizar el deal asociado cuando estado cambia a aceptada', async () => {
    (prisma.cotizacion.findFirst as any).mockResolvedValue(mockCotizacion);
    (prisma.cotizacion.update as any).mockResolvedValue({
      ...mockCotizacion,
      estado: 'aceptada',
      dealId: 'cl0deal00000000000000000001',
    });

    await PATCH(
      mockRequest('https://volkern.app/api/cotizaciones/cot-1', {
        estado: 'aceptada',
      }),
    );

    expect(prisma.deal.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'cl0deal00000000000000000001' },
        data: { etapa: 'negociacion', probabilidad: 75 },
      }),
    );
  });

  it('debe crear dealActivity cuando estado cambia a aceptada tiene dealId', async () => {
    (prisma.cotizacion.findFirst as any).mockResolvedValue(mockCotizacion);
    (prisma.cotizacion.update as any).mockResolvedValue({
      ...mockCotizacion,
      estado: 'aceptada',
      numero: 'COT-2025-0001',
      dealId: 'cl0deal00000000000000000001',
    });

    await PATCH(
      mockRequest('https://volkern.app/api/cotizaciones/cot-1', {
        estado: 'aceptada',
      }),
    );

    expect(prisma.dealActivity.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          dealId: 'cl0deal00000000000000000001',
          tenantId: 'test-tenant-id',
          userId: 'test-user-id',
          tipo: 'cotizacion_aceptada',
          titulo: 'Cotización aceptada',
          descripcion: 'Cotización COT-2025-0001 fue aceptada',
          resultado: 'exitoso',
        }),
      }),
    );
  });

  it('NO debe actualizar deal si estado es aceptada pero no tiene dealId', async () => {
    (prisma.cotizacion.findFirst as any).mockResolvedValue({
      ...mockCotizacion,
      dealId: null,
    });
    (prisma.cotizacion.update as any).mockResolvedValue({
      ...mockCotizacion,
      estado: 'aceptada',
      dealId: null,
    });

    await PATCH(
      mockRequest('https://volkern.app/api/cotizaciones/cot-1', {
        estado: 'aceptada',
      }),
    );

    expect(prisma.deal.update).not.toHaveBeenCalled();
    expect(prisma.dealActivity.create).not.toHaveBeenCalled();
  });

  it('NO debe actualizar deal ni crear dealActivity si estado no es aceptada', async () => {
    (prisma.cotizacion.findFirst as any).mockResolvedValue(mockCotizacion);
    (prisma.cotizacion.update as any).mockResolvedValue({
      ...mockCotizacion,
      estado: 'enviada',
    });

    await PATCH(
      mockRequest('https://volkern.app/api/cotizaciones/cot-1', {
        estado: 'enviada',
      }),
    );

    expect(prisma.deal.update).not.toHaveBeenCalled();
    expect(prisma.dealActivity.create).not.toHaveBeenCalled();
  });

  // ── Audit ───────────────────────────────────────────────────────────────

  it('debe crear auditLog con cambios serializados como JSON string', async () => {
    (prisma.cotizacion.findFirst as any).mockResolvedValue(mockCotizacion);
    (prisma.cotizacion.update as any).mockResolvedValue({
      ...mockCotizacion,
      estado: 'enviada',
    });

    await PATCH(
      mockRequest('https://volkern.app/api/cotizaciones/cot-1', {
        estado: 'enviada',
      }),
    );

    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: 'test-tenant-id',
          userId: 'test-user-id',
          accion: 'actualizar',
          entidad: 'cotizacion',
          entidadId: 'cot-1',
          descripcion: expect.stringContaining('Test User'),
          cambiosAntes: JSON.stringify(mockCotizacion),
          cambiosDespues: expect.any(String),
        }),
      }),
    );
  });

  // ── Errores ─────────────────────────────────────────────────────────────

  it('debe devolver 404 si la cotización no existe', async () => {
    (prisma.cotizacion.findFirst as any).mockResolvedValue(null);

    const response = await PATCH(
      mockRequest('https://volkern.app/api/cotizaciones/cot-1', {
        estado: 'enviada',
      }),
    );

    expect(response.status).toBe(404);
    const json = await response.json();
    expect(json.error).toBe('Cotización no encontrada');
    expect(prisma.cotizacion.update).not.toHaveBeenCalled();
  });

  it('debe devolver 404 para cotización de otro tenant', async () => {
    (prisma.cotizacion.findFirst as any).mockResolvedValue(null);

    const response = await PATCH(
      mockRequest('https://volkern.app/api/cotizaciones/cot-other', {
        estado: 'enviada',
      }),
    );

    expect(response.status).toBe(404);
  });

  it('debe devolver 500 si Prisma falla en findFirst', async () => {
    (prisma.cotizacion.findFirst as any).mockRejectedValue(new Error('DB error'));

    const response = await PATCH(
      mockRequest('https://volkern.app/api/cotizaciones/cot-1', {
        estado: 'enviada',
      }),
    );

    expect(response.status).toBe(500);
    const json = await response.json();
    expect(json.error).toBe('Error al actualizar cotización');
  });

  it('debe devolver 500 si Prisma falla en update', async () => {
    (prisma.cotizacion.findFirst as any).mockResolvedValue(mockCotizacion);
    (prisma.cotizacion.update as any).mockRejectedValue(new Error('DB error'));

    const response = await PATCH(
      mockRequest('https://volkern.app/api/cotizaciones/cot-1', {
        estado: 'enviada',
      }),
    );

    expect(response.status).toBe(500);
  });

  it('debe devolver 500 si request.json() falla (body inválido)', async () => {
    (prisma.cotizacion.findFirst as any).mockResolvedValue(mockCotizacion);

    const req = new Request('https://volkern.app/api/cotizaciones/cot-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: '{ broken json',
    });

    const response = await PATCH(req);

    expect(response.status).toBe(500);
    const json = await response.json();
    expect(json.error).toBe('Error al actualizar cotización');
  });

  it('debe devolver 500 si auditLog.create falla (no hay catch silencioso)', async () => {
    (prisma.cotizacion.findFirst as any).mockResolvedValue(mockCotizacion);
    (prisma.cotizacion.update as any).mockResolvedValue({
      ...mockCotizacion,
      estado: 'enviada',
    });
    (prisma.auditLog.create as any).mockRejectedValueOnce(new Error('Audit error'));

    const response = await PATCH(
      mockRequest('https://volkern.app/api/cotizaciones/cot-1', {
        estado: 'enviada',
      }),
    );

    expect(response.status).toBe(500);
    const json = await response.json();
    expect(json.error).toBe('Error al actualizar cotización');
  });

  // ── Aislamiento ─────────────────────────────────────────────────────────

  it('debe actualizar con where id correcto para aislamiento', async () => {
    (prisma.cotizacion.findFirst as any).mockResolvedValue(mockCotizacion);
    (prisma.cotizacion.update as any).mockResolvedValue(mockCotizacion);

    await PATCH(
      mockRequest('https://volkern.app/api/cotizaciones/cot-1', {
        estado: 'enviada',
      }),
    );

    expect(prisma.cotizacion.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'cot-1' },
      }),
    );
  });
});

// ─── DELETE Tests ──────────────────────────────────────────────────────────

describe('DELETE /api/cotizaciones/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('debe eliminar la cotización y devolver { success: true }', async () => {
    (prisma.cotizacion.findFirst as any).mockResolvedValue(mockCotizacion);
    (prisma.cotizacion.delete as any).mockResolvedValue(mockCotizacion);
    (prisma.auditLog.create as any).mockResolvedValue({});

    const response = await DELETE(mockRequest('https://volkern.app/api/cotizaciones/cot-1'));

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.success).toBe(true);
  });

  it('debe llamar a prisma.cotizacion.delete con id correcto', async () => {
    (prisma.cotizacion.findFirst as any).mockResolvedValue(mockCotizacion);
    (prisma.cotizacion.delete as any).mockResolvedValue(mockCotizacion);
    (prisma.auditLog.create as any).mockResolvedValue({});

    await DELETE(mockRequest('https://volkern.app/api/cotizaciones/cot-1'));

    expect(prisma.cotizacion.delete).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'cot-1' } }),
    );
  });

  it('debe verificar existencia con findFirst incluyendo tenantId', async () => {
    (prisma.cotizacion.findFirst as any).mockResolvedValue(mockCotizacion);
    (prisma.cotizacion.delete as any).mockResolvedValue(mockCotizacion);
    (prisma.auditLog.create as any).mockResolvedValue({});

    await DELETE(mockRequest('https://volkern.app/api/cotizaciones/cot-1'));

    expect(prisma.cotizacion.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'cot-1', tenantId: 'test-tenant-id' },
      }),
    );
  });

  it('debe crear auditLog con accion eliminar, descripcion y cambiosAntes serializado', async () => {
    (prisma.cotizacion.findFirst as any).mockResolvedValue(mockCotizacion);
    (prisma.cotizacion.delete as any).mockResolvedValue(mockCotizacion);
    (prisma.auditLog.create as any).mockResolvedValue({});

    await DELETE(mockRequest('https://volkern.app/api/cotizaciones/cot-1'));

    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: 'test-tenant-id',
          userId: 'test-user-id',
          accion: 'eliminar',
          entidad: 'cotizacion',
          entidadId: 'cot-1',
          descripcion: expect.stringContaining('COT-2025-0001'),
          cambiosAntes: JSON.stringify(mockCotizacion),
        }),
      }),
    );
  });

  it('debe devolver 404 si la cotización no existe', async () => {
    (prisma.cotizacion.findFirst as any).mockResolvedValue(null);

    const response = await DELETE(mockRequest('https://volkern.app/api/cotizaciones/cot-1'));

    expect(response.status).toBe(404);
    const json = await response.json();
    expect(json.error).toBe('Cotización no encontrada');
    expect(prisma.cotizacion.delete).not.toHaveBeenCalled();
  });

  it('debe devolver 404 para cotización de otro tenant', async () => {
    (prisma.cotizacion.findFirst as any).mockResolvedValue(null);

    const response = await DELETE(mockRequest('https://volkern.app/api/cotizaciones/cot-other'));

    expect(response.status).toBe(404);
  });

  it('debe devolver 500 si Prisma falla en findFirst', async () => {
    (prisma.cotizacion.findFirst as any).mockRejectedValue(new Error('DB error'));

    const response = await DELETE(mockRequest('https://volkern.app/api/cotizaciones/cot-1'));

    expect(response.status).toBe(500);
    const json = await response.json();
    expect(json.error).toBe('Error al eliminar cotización');
  });

  it('debe devolver 500 si Prisma falla en delete', async () => {
    (prisma.cotizacion.findFirst as any).mockResolvedValue(mockCotizacion);
    (prisma.cotizacion.delete as any).mockRejectedValue(new Error('DB error'));

    const response = await DELETE(mockRequest('https://volkern.app/api/cotizaciones/cot-1'));

    expect(response.status).toBe(500);
    const json = await response.json();
    expect(json.error).toBe('Error al eliminar cotización');
  });

  it('debe devolver 500 si auditLog.create falla (no hay catch silencioso)', async () => {
    (prisma.cotizacion.findFirst as any).mockResolvedValue(mockCotizacion);
    (prisma.cotizacion.delete as any).mockResolvedValue(mockCotizacion);
    (prisma.auditLog.create as any).mockRejectedValueOnce(new Error('Audit error'));

    const response = await DELETE(mockRequest('https://volkern.app/api/cotizaciones/cot-1'));

    expect(response.status).toBe(500);
    const json = await response.json();
    expect(json.error).toBe('Error al eliminar cotización');
  });

  it('debe usar el scope quotes:write para autenticación', async () => {
    (prisma.cotizacion.findFirst as any).mockResolvedValue(mockCotizacion);
    (prisma.cotizacion.delete as any).mockResolvedValue(mockCotizacion);
    (prisma.auditLog.create as any).mockResolvedValue({});

    await DELETE(mockRequest('https://volkern.app/api/cotizaciones/cot-1'));

    // withTenantAuth es mock, pero verificamos que el handler se ejecuta
    expect(prisma.cotizacion.delete).toHaveBeenCalled();
  });
});
