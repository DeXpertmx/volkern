import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ─────────────────────────────────────────────────────────────────

vi.mock('@/lib/db', () => ({
  prisma: {
    cotizacion: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    catalogoItem: {
      findMany: vi.fn(),
    },
    dealActivity: {
      create: vi.fn(),
    },
  },
  getTenantDb: vi.fn(),
  dbContext: { tenantId: 'test-tenant-id' },
}));

vi.mock('@/lib/api-key-auth', () => {
  const mockWithTenantAuth = (handler: any) => {
    return async (request: Request, _context?: any) => {
      const mockAuth = {
        valid: true,
        tenant: { id: 'test-tenant-id', nombre: 'Test Tenant', slug: 'test', plan: 'growth' },
        user: {
          id: 'test-user-id',
          name: 'Test User',
          email: 'test@test.com',
          roleId: 'role-1',
          tenantId: 'test-tenant-id',
          role: { id: 'role-1', nombre: 'Admin', permisos: {} },
        },
      };
      return handler(request, mockAuth);
    };
  };
  return { withTenantAuth: mockWithTenantAuth };
});

vi.mock('@/lib/audit-service', () => ({
  AuditService: {
    log: vi.fn().mockResolvedValue(undefined),
  },
}));

// ─── Imports ───────────────────────────────────────────────────────────────

import { GET, POST } from '@/app/api/cotizaciones/route';
import { prisma } from '@/lib/db';

// ─── Fixtures ──────────────────────────────────────────────────────────────

function mockRequest(url: string, body?: unknown): Request {
  if (body !== undefined) {
    return new Request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }
  return new Request(url);
}

const mockCotizaciones = [
  {
    id: 'cot-1',
    tenantId: 'test-tenant-id',
    numero: 'COT-2025-0001',
    titulo: 'Cotización Proyecto IoT',
    descripcion: 'Implementación de sensores y plataforma',
    subtotal: 50000,
    descuentoPorcentaje: 0,
    descuentoMonto: 0,
    impuestos: 10500,
    total: 60500,
    moneda: 'EUR',
    validezDias: 30,
    estado: 'pendiente',
    dealId: 'cl0deal00000000000000000001',
    leadId: null,
    creadoPorId: 'test-user-id',
    fechaCreacion: new Date('2025-05-20T10:00:00Z'),
    fechaVencimiento: new Date('2025-06-19T10:00:00Z'),
    deal: { id: 'cl0deal00000000000000000001', titulo: 'Proyecto IoT TechCorp' },
    lead: null,
    items: [
      {
        id: 'item-1',
        concepto: 'Sensor IoT',
        cantidad: 10,
        precioUnitario: 3000,
        descuento: 0,
        subtotal: 30000,
        porcentajeImpuesto: 21,
        montoImpuesto: 6300,
        total: 36300,
        orden: 1,
      },
      {
        id: 'item-2',
        concepto: 'Plataforma Cloud',
        cantidad: 1,
        precioUnitario: 20000,
        descuento: 0,
        subtotal: 20000,
        porcentajeImpuesto: 21,
        montoImpuesto: 4200,
        total: 24200,
        orden: 2,
      },
    ],
  },
  {
    id: 'cot-2',
    tenantId: 'test-tenant-id',
    numero: 'COT-2025-0002',
    titulo: 'Cotización Consultoría',
    descripcion: null,
    subtotal: 15000,
    descuentoPorcentaje: 10,
    descuentoMonto: 1500,
    impuestos: 2835,
    total: 16335,
    moneda: 'EUR',
    validezDias: 15,
    estado: 'enviado',
    dealId: null,
    leadId: 'cl0lead00000000000000000001',
    creadoPorId: 'test-user-id',
    fechaCreacion: new Date('2025-05-22T14:00:00Z'),
    fechaVencimiento: new Date('2025-06-06T14:00:00Z'),
    deal: null,
    lead: { id: 'cl0lead00000000000000000001', nombre: 'Ana García', email: 'ana@ecogreen.com', empresa: 'EcoGreen SL' },
    items: [
      {
        id: 'item-3',
        concepto: 'Consultoría',
        cantidad: 40,
        precioUnitario: 375,
        descuento: 0,
        subtotal: 15000,
        porcentajeImpuesto: 21,
        montoImpuesto: 3150,
        total: 18150,
        orden: 1,
      },
    ],
  },
];

// ─── GET Tests ─────────────────────────────────────────────────────────────

describe('GET /api/cotizaciones', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('debe listar todas las cotizaciones del tenant', async () => {
    (prisma.cotizacion.findMany as any).mockResolvedValue(mockCotizaciones);

    const response = await GET(mockRequest('https://volkern.app/api/cotizaciones'));

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.cotizaciones).toHaveLength(2);
    expect(json.cotizaciones[0].titulo).toBe('Cotización Proyecto IoT');
    expect(json.cotizaciones[1].titulo).toBe('Cotización Consultoría');
  });

  it('debe incluir deal (id, titulo), lead (id, nombre, email, empresa) y items ordenados', async () => {
    (prisma.cotizacion.findMany as any).mockResolvedValue(mockCotizaciones);

    const response = await GET(mockRequest('https://volkern.app/api/cotizaciones'));
    const json = await response.json();

    // cot-1 tiene deal pero no lead
    expect(json.cotizaciones[0].deal).toEqual({
      id: 'cl0deal00000000000000000001',
      titulo: 'Proyecto IoT TechCorp',
    });
    expect(json.cotizaciones[0].lead).toBeNull();
    expect(json.cotizaciones[0].items).toHaveLength(2);

    // cot-2 tiene lead pero no deal
    expect(json.cotizaciones[1].lead).toEqual({
      id: 'cl0lead00000000000000000001',
      nombre: 'Ana García',
      email: 'ana@ecogreen.com',
      empresa: 'EcoGreen SL',
    });
    expect(json.cotizaciones[1].deal).toBeNull();
  });

  it('debe filtrar por tenantId para aislamiento', async () => {
    (prisma.cotizacion.findMany as any).mockResolvedValue([]);

    await GET(mockRequest('https://volkern.app/api/cotizaciones'));

    expect(prisma.cotizacion.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: 'test-tenant-id' }),
      }),
    );
  });

  it('debe ordenar por fechaCreacion descendente', async () => {
    (prisma.cotizacion.findMany as any).mockResolvedValue([]);

    await GET(mockRequest('https://volkern.app/api/cotizaciones'));

    expect(prisma.cotizacion.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { fechaCreacion: 'desc' } }),
    );
  });

  it('debe incluir deal, lead e items con orden ascendente en el include', async () => {
    (prisma.cotizacion.findMany as any).mockResolvedValue([]);

    await GET(mockRequest('https://volkern.app/api/cotizaciones'));

    expect(prisma.cotizacion.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          deal: { select: { id: true, titulo: true } },
          lead: { select: { id: true, nombre: true, email: true, empresa: true } },
          items: { orderBy: { orden: 'asc' } },
        }),
      }),
    );
  });

  it('debe filtrar por dealId', async () => {
    (prisma.cotizacion.findMany as any).mockResolvedValue([mockCotizaciones[0]]);

    await GET(
      mockRequest('https://volkern.app/api/cotizaciones?dealId=cl0deal00000000000000000001'),
    );

    expect(prisma.cotizacion.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ dealId: 'cl0deal00000000000000000001' }),
      }),
    );
  });

  it('debe filtrar por leadId', async () => {
    (prisma.cotizacion.findMany as any).mockResolvedValue([mockCotizaciones[1]]);

    await GET(
      mockRequest('https://volkern.app/api/cotizaciones?leadId=cl0lead00000000000000000001'),
    );

    expect(prisma.cotizacion.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ leadId: 'cl0lead00000000000000000001' }),
      }),
    );
  });

  it('debe filtrar por contacto para mostrar cotizaciones en su timeline', async () => {
    (prisma.cotizacion.findMany as any).mockResolvedValue([mockCotizaciones[0]]);

    await GET(
      mockRequest('https://volkern.app/api/cotizaciones?contactId=cl0contact00000000000000001'),
    );

    expect(prisma.cotizacion.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ contactId: 'cl0contact00000000000000001' }),
      }),
    );
  });

  it('debe filtrar por empresa incluyendo cotizaciones ligadas a sus deals', async () => {
    (prisma.cotizacion.findMany as any).mockResolvedValue([]);

    await GET(
      mockRequest('https://volkern.app/api/cotizaciones?companyId=cl0company00000000000000001'),
    );

    expect(prisma.cotizacion.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [
            { contactId: 'cl0company00000000000000001' },
            { deal: { companyId: 'cl0company00000000000000001' } },
          ],
        }),
      }),
    );
  });

  it('debe filtrar por estado', async () => {
    (prisma.cotizacion.findMany as any).mockResolvedValue([mockCotizaciones[1]]);

    await GET(mockRequest('https://volkern.app/api/cotizaciones?estado=enviado'));

    expect(prisma.cotizacion.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ estado: 'enviado' }),
      }),
    );
  });

  it('debe devolver array vacío si no hay cotizaciones', async () => {
    (prisma.cotizacion.findMany as any).mockResolvedValue([]);

    const response = await GET(mockRequest('https://volkern.app/api/cotizaciones'));

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.cotizaciones).toEqual([]);
  });

  it('debe devolver 500 si Prisma falla', async () => {
    (prisma.cotizacion.findMany as any).mockRejectedValue(new Error('DB error'));

    const response = await GET(mockRequest('https://volkern.app/api/cotizaciones'));

    expect(response.status).toBe(500);
    const json = await response.json();
    expect(json.error).toBe('Error al obtener cotizaciones');
  });
});

// ─── POST Tests ────────────────────────────────────────────────────────────

describe('POST /api/cotizaciones', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-06-01'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── Validación ──────────────────────────────────────────────────────────

  it('debe devolver 400 si titulo no se envía', async () => {
    const response = await POST(
      mockRequest('https://volkern.app/api/cotizaciones', {
        items: [{ concepto: 'Item 1', cantidad: 1, precioUnitario: 100 }],
      }),
    );

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error).toBe('Datos inválidos');
    expect(prisma.cotizacion.create).not.toHaveBeenCalled();
  });

  it('debe devolver 400 si items está vacío', async () => {
    const response = await POST(
      mockRequest('https://volkern.app/api/cotizaciones', {
        titulo: 'Test',
        items: [],
      }),
    );

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error).toBe('Datos inválidos');
    expect(prisma.cotizacion.create).not.toHaveBeenCalled();
  });

  it('debe devolver 400 si item concepto está vacío', async () => {
    const response = await POST(
      mockRequest('https://volkern.app/api/cotizaciones', {
        titulo: 'Test',
        items: [{ concepto: '', cantidad: 1, precioUnitario: 100 }],
      }),
    );

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error).toBe('Datos inválidos');
  });

  it('debe devolver 400 si precioUnitario es negativo', async () => {
    const response = await POST(
      mockRequest('https://volkern.app/api/cotizaciones', {
        titulo: 'Test',
        items: [{ concepto: 'Item 1', cantidad: 1, precioUnitario: -10 }],
      }),
    );

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error).toBe('Datos inválidos');
  });

  it('debe devolver 400 si moneda no tiene 3 caracteres', async () => {
    const response = await POST(
      mockRequest('https://volkern.app/api/cotizaciones', {
        titulo: 'Test',
        items: [{ concepto: 'Item', cantidad: 1, precioUnitario: 100 }],
        moneda: 'EURO',
      }),
    );

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error).toBe('Datos inválidos');
  });

  // ── Creación básica ────────────────────────────────────────────────────

  it('debe crear cotización con campos requeridos y defaults', async () => {
    (prisma.cotizacion.findFirst as any).mockResolvedValue(null);
    (prisma.cotizacion.create as any).mockResolvedValue({
      id: 'cot-new',
      numero: 'COT-2025-0001',
      titulo: 'Nueva Cotización',
      total: 121,
    });

    const response = await POST(
      mockRequest('https://volkern.app/api/cotizaciones', {
        titulo: 'Nueva Cotización',
        items: [{ concepto: 'Servicio', cantidad: 1, precioUnitario: 100 }],
      }),
    );

    expect(response.status).toBe(201);
    const json = await response.json();
    expect(json.cotizacion.titulo).toBe('Nueva Cotización');
    expect(json.cotizacion.numero).toBe('COT-2025-0001');
  });

  it('debe usar defaults: moneda EUR, validezDias 30, descuentoPorcentaje 0', async () => {
    (prisma.cotizacion.findFirst as any).mockResolvedValue(null);
    (prisma.cotizacion.create as any).mockResolvedValue({ id: 'cot-defaults' });

    await POST(
      mockRequest('https://volkern.app/api/cotizaciones', {
        titulo: 'Defaults Test',
        items: [{ concepto: 'Item', cantidad: 1, precioUnitario: 100 }],
      }),
    );

    // Verificar que los defaults se usan en la creación
    expect(prisma.cotizacion.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          moneda: 'EUR',
          validezDias: 30,
          descuentoPorcentaje: 0,
        }),
      }),
    );
  });

  it('debe crear con todos los campos opcionales', async () => {
    (prisma.cotizacion.findFirst as any).mockResolvedValue(null);
    (prisma.cotizacion.create as any).mockResolvedValue({ id: 'cot-full' });

    await POST(
      mockRequest('https://volkern.app/api/cotizaciones', {
        titulo: 'Cotización Completa',
        descripcion: 'Descripción detallada',
        contactId: 'cl0contact00000000000000001',
        moneda: 'USD',
        validezDias: 60,
        terminosPago: '50% anticipo, 50% contra entrega',
        notasCliente: 'Notas para el cliente',
        notasInternas: 'Notas internas',
        clienteNombre: 'Juan Pérez',
        clienteEmail: 'juan@example.com',
        clienteEmpresa: 'Pérez SA',
        clienteTelefono: '+34 600 123 456',
        descuentoPorcentaje: 5,
        items: [{ concepto: 'Item completo', cantidad: 2, precioUnitario: 500, descripcion: 'Descripción del item', descuento: 10, porcentajeImpuesto: 10 }],
      }),
    );

    expect(prisma.cotizacion.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          titulo: 'Cotización Completa',
          descripcion: 'Descripción detallada',
          contactId: 'cl0contact00000000000000001',
          moneda: 'USD',
          validezDias: 60,
          terminosPago: '50% anticipo, 50% contra entrega',
          notasCliente: 'Notas para el cliente',
          notasInternas: 'Notas internas',
          clienteNombre: 'Juan Pérez',
          clienteEmail: 'juan@example.com',
          clienteEmpresa: 'Pérez SA',
          clienteTelefono: '+34 600 123 456',
          descuentoPorcentaje: 5,
        }),
      }),
    );
  });

  it('debe incluir items (con catalogoItem), deal, lead, emisor en el resultado', async () => {
    (prisma.cotizacion.findFirst as any).mockResolvedValue(null);
    (prisma.cotizacion.create as any).mockResolvedValue({ id: 'cot-include' });

    await POST(
      mockRequest('https://volkern.app/api/cotizaciones', {
        titulo: 'Include Test',
        items: [{ concepto: 'Item', cantidad: 1, precioUnitario: 100 }],
      }),
    );

    expect(prisma.cotizacion.create).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          items: expect.objectContaining({
            include: { catalogoItem: { select: { id: true, nombre: true, sku: true } } },
          }),
          deal: true,
          lead: true,
          emisor: true,
        }),
      }),
    );
  });

  // ── Cálculos de items ──────────────────────────────────────────────────

  it('debe calcular subtotal, impuestos y total correctamente para items', async () => {
    (prisma.cotizacion.findFirst as any).mockResolvedValue(null);
    (prisma.cotizacion.create as any).mockResolvedValue({ id: 'cot-calc' });

    await POST(
      mockRequest('https://volkern.app/api/cotizaciones', {
        titulo: 'Cálculos',
        items: [
          { concepto: 'Item 1', cantidad: 2, precioUnitario: 1000 },
          { concepto: 'Item 2', cantidad: 3, precioUnitario: 500 },
        ],
      }),
    );

    // Sin descuentoPorcentaje global ni descuento por item
    // Item 1: 2 * 1000 = 2000 subtotal, sin impuesto → 0, total = 2000
    // Item 2: 3 * 500 = 1500 subtotal, sin impuesto → 0, total = 1500
    // subtotal = 3500, descuentoMonto = 0, baseImponible = 3500
    // impuestos = 0, total = 3500

    const createData = (prisma.cotizacion.create as any).mock.calls[0][0].data;

    expect(createData.subtotal).toBe(3500);
    expect(createData.descuentoMonto).toBe(0);
    expect(createData.impuestos).toBe(0);
    expect(createData.total).toBe(3500);
  });

  it('debe calcular con descuentoPorcentaje global', async () => {
    (prisma.cotizacion.findFirst as any).mockResolvedValue(null);
    (prisma.cotizacion.create as any).mockResolvedValue({ id: 'cot-desc' });

    await POST(
      mockRequest('https://volkern.app/api/cotizaciones', {
        titulo: 'Con Descuento',
        descuentoPorcentaje: 10,
        items: [{ concepto: 'Item', cantidad: 1, precioUnitario: 1000 }],
      }),
    );

    const createData = (prisma.cotizacion.create as any).mock.calls[0][0].data;

    // subtotal = 1000, descuentoMonto = 1000 * 0.1 = 100
    // baseImponible = 900, impuestos = 0, total = 900
    expect(createData.subtotal).toBe(1000);
    expect(createData.descuentoMonto).toBe(100);
    expect(createData.total).toBe(900);
  });

  it('debe calcular impuestos cuando items tienen porcentajeImpuesto', async () => {
    (prisma.cotizacion.findFirst as any).mockResolvedValue(null);
    (prisma.cotizacion.create as any).mockResolvedValue({ id: 'cot-tax' });

    await POST(
      mockRequest('https://volkern.app/api/cotizaciones', {
        titulo: 'Con Impuestos',
        items: [
          {
            concepto: 'Servicio',
            cantidad: 1,
            precioUnitario: 1000,
            porcentajeImpuesto: 21,
          },
        ],
      }),
    );

    const createData = (prisma.cotizacion.create as any).mock.calls[0][0].data;

    // subtotal = 1000, montoImpuesto = 1000 * 0.21 = 210
    // descuentoMonto = 0, baseImponible = 1000
    // impuestos = 210, total = 1210
    expect(createData.subtotal).toBe(1000);
    expect(createData.impuestos).toBe(210);
    expect(createData.total).toBe(1210);
  });

  it('debe respetar IVA 0% explícito aunque el artículo del catálogo tenga 21%', async () => {
    (prisma.cotizacion.findFirst as any).mockResolvedValue(null);
    (prisma.catalogoItem.findMany as any).mockResolvedValue([{
      id: 'cl0cat00000000000000000021',
      nombre: 'Servicio exento',
      descripcion: null,
      precioBase: 100,
      categoriaFiscal: 'general',
      sku: null,
      tasaImpuestoId: 'tax-21',
      tasaImpuesto: { id: 'tax-21', porcentaje: 21 },
    }]);
    (prisma.cotizacion.create as any).mockResolvedValue({ id: 'cot-exento' });

    await POST(
      mockRequest('https://volkern.app/api/cotizaciones', {
        titulo: 'Servicio exento',
        items: [{
          catalogoItemId: 'cl0cat00000000000000000021',
          concepto: 'Servicio exento',
          cantidad: 1,
          precioUnitario: 100,
          porcentajeImpuesto: 0,
        }],
      }),
    );

    const item = (prisma.cotizacion.create as any).mock.calls[0][0].data.items.create[0];
    expect(item.porcentajeImpuesto).toBe(0);
    expect(item.montoImpuesto).toBe(0);
    expect(item.total).toBe(100);
  });

  it('debe calcular varios tipos de IVA por línea en la misma cotización', async () => {
    (prisma.cotizacion.findFirst as any).mockResolvedValue(null);
    (prisma.catalogoItem.findMany as any).mockResolvedValue([
      {
        id: 'cl0cat00000000000000000010',
        nombre: 'Servicio exento',
        descripcion: null,
        precioBase: 100,
        categoriaFiscal: 'exento',
        sku: null,
        tasaImpuestoId: null,
        tasaImpuesto: null,
      },
      {
        id: 'cl0cat00000000000000000021',
        nombre: 'Servicio general',
        descripcion: null,
        precioBase: 100,
        categoriaFiscal: 'general',
        sku: null,
        tasaImpuestoId: 'tax-21',
        tasaImpuesto: { id: 'tax-21', porcentaje: 21 },
      },
    ]);
    (prisma.cotizacion.create as any).mockResolvedValue({ id: 'cot-multi-iva' });

    await POST(
      mockRequest('https://volkern.app/api/cotizaciones', {
        titulo: 'Varios IVAs',
        impuestos: 10,
        items: [
          { catalogoItemId: 'cl0cat00000000000000000010', concepto: 'Servicio exento', cantidad: 1, precioUnitario: 100, porcentajeImpuesto: 0 },
          { catalogoItemId: 'cl0cat00000000000000000021', concepto: 'Servicio general', cantidad: 1, precioUnitario: 100, porcentajeImpuesto: 21 },
        ],
      }),
    );

    const data = (prisma.cotizacion.create as any).mock.calls[0][0].data;
    expect(data.items.create.map((item: any) => item.porcentajeImpuesto)).toEqual([0, 21]);
    expect(data.items.create.map((item: any) => item.montoImpuesto)).toEqual([0, 21]);
    expect(data.impuestos).toBe(21);
    expect(data.total).toBe(221);
  });

  it('debe calcular items con descuento fijo en la moneda de la cotización', async () => {
    (prisma.cotizacion.findFirst as any).mockResolvedValue(null);
    (prisma.cotizacion.create as any).mockResolvedValue({ id: 'cot-item-desc' });

    await POST(
      mockRequest('https://volkern.app/api/cotizaciones', {
        titulo: 'Item con descuento',
        items: [
          {
            concepto: 'Lote',
            cantidad: 10,
            precioUnitario: 100,
            descuento: 15,
          },
        ],
      }),
    );

    const processedItem = (prisma.cotizacion.create as any).mock.calls[0][0].data.items.create[0];

    // subtotal bruto = 10 * 100 = 1000, descuento fijo de 15 = 985
    expect(processedItem.subtotal).toBe(985);
    expect(processedItem.descuento).toBe(15);
    expect(processedItem.total).toBe(985); // sin impuesto
  });

  it('debe aceptar un descuento fijo igual al importe de la línea sin producir un total negativo', async () => {
    (prisma.cotizacion.findFirst as any).mockResolvedValue(null);
    (prisma.cotizacion.create as any).mockResolvedValue({ id: 'cot-desc-total' });

    await POST(
      mockRequest('https://volkern.app/api/cotizaciones', {
        titulo: 'Descuento total',
        items: [{ concepto: 'Implementación', cantidad: 1, precioUnitario: 500, descuento: 500 }],
      }),
    );

    const data = (prisma.cotizacion.create as any).mock.calls[0][0].data;
    expect(data.items.create[0].descuento).toBe(500);
    expect(data.items.create[0].subtotal).toBe(0);
    expect(data.items.create[0].total).toBe(0);
    expect(data.total).toBe(0);
  });

  it('debe rechazar un descuento fijo superior al importe de la línea', async () => {
    (prisma.cotizacion.findFirst as any).mockResolvedValue(null);

    const response = await POST(
      mockRequest('https://volkern.app/api/cotizaciones', {
        titulo: 'Descuento inválido',
        items: [{ concepto: 'Implementación', cantidad: 1, precioUnitario: 500, descuento: 500.01 }],
      }),
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain('no puede superar');
    expect(prisma.cotizacion.create).not.toHaveBeenCalled();
  });

  // ── Numeración secuencial ──────────────────────────────────────────────

  it('debe generar COT-2025-0001 para la primera cotización del año', async () => {
    (prisma.cotizacion.findFirst as any).mockResolvedValue(null);
    (prisma.cotizacion.create as any).mockResolvedValue({ id: 'cot-seq-1' });

    await POST(
      mockRequest('https://volkern.app/api/cotizaciones', {
        titulo: 'Primera Cotización',
        items: [{ concepto: 'Item', cantidad: 1, precioUnitario: 100 }],
      }),
    );

    // Busca la última cotización con startsWith COT-2025-
    expect(prisma.cotizacion.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: 'test-tenant-id', numero: { startsWith: 'COT-2025-' } },
        orderBy: { numero: 'desc' },
      }),
    );

    const numero = (prisma.cotizacion.create as any).mock.calls[0][0].data.numero;
    expect(numero).toBe('COT-2025-0001');
  });

  it('debe incrementar el número secuencial si ya existe una cotización', async () => {
    (prisma.cotizacion.findFirst as any).mockResolvedValue({
      id: 'cot-existing',
      numero: 'COT-2025-0005',
    });
    (prisma.cotizacion.create as any).mockResolvedValue({ id: 'cot-seq-2' });

    await POST(
      mockRequest('https://volkern.app/api/cotizaciones', {
        titulo: 'Segunda Cotización',
        items: [{ concepto: 'Item', cantidad: 1, precioUnitario: 100 }],
      }),
    );

    const numero = (prisma.cotizacion.create as any).mock.calls[0][0].data.numero;
    expect(numero).toBe('COT-2025-0006');
  });

  // ── DealActivity ───────────────────────────────────────────────────────

  it('debe crear dealActivity si se proporciona dealId', async () => {
    (prisma.cotizacion.findFirst as any).mockResolvedValue(null);
    (prisma.cotizacion.create as any).mockResolvedValue({
      id: 'cot-deal-act',
      numero: 'COT-2025-0001',
      total: 60500,
      moneda: 'EUR',
    });

    await POST(
      mockRequest('https://volkern.app/api/cotizaciones', {
        titulo: 'Cotización con Deal',
        dealId: 'cl0deal00000000000000000001',
        items: [{ concepto: 'Item', cantidad: 1, precioUnitario: 100 }],
      }),
    );

    expect(prisma.dealActivity.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          dealId: 'cl0deal00000000000000000001',
          tenantId: 'test-tenant-id',
          userId: 'test-user-id',
          tipo: 'cotizacion',
          titulo: 'Cotización creada',
          descripcion: expect.stringContaining('COT-2025-0001'),
        }),
      }),
    );
  });

  it('NO debe crear dealActivity si no hay dealId', async () => {
    (prisma.cotizacion.findFirst as any).mockResolvedValue(null);
    (prisma.cotizacion.create as any).mockResolvedValue({
      id: 'cot-no-deal',
      numero: 'COT-2025-0001',
    });

    await POST(
      mockRequest('https://volkern.app/api/cotizaciones', {
        titulo: 'Cotización sin Deal',
        items: [{ concepto: 'Item', cantidad: 1, precioUnitario: 100 }],
      }),
    );

    expect(prisma.dealActivity.create).not.toHaveBeenCalled();
  });

  // ── Catalog items ──────────────────────────────────────────────────────

  it('debe pre-cargar items de catálogo si se proporcionan catalogoItemIds', async () => {
    (prisma.cotizacion.findFirst as any).mockResolvedValue(null);
    (prisma.catalogoItem.findMany as any).mockResolvedValue([]);
    (prisma.cotizacion.create as any).mockResolvedValue({ id: 'cot-cat' });

    await POST(
      mockRequest('https://volkern.app/api/cotizaciones', {
        titulo: 'Catálogo',
        items: [
          {
            concepto: 'Producto Catálogo',
            cantidad: 1,
            precioUnitario: 200,
            catalogoItemId: 'cl0cat00000000000000000001',
          },
        ],
      }),
    );

    expect(prisma.catalogoItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ['cl0cat00000000000000000001'] }, tenantId: 'test-tenant-id' },
        include: { tasaImpuesto: true },
      }),
    );
  });

  // ── Audit ──────────────────────────────────────────────────────────────

  it('debe llamar a AuditService.log tras crear la cotización', async () => {
    (prisma.cotizacion.findFirst as any).mockResolvedValue(null);
    (prisma.cotizacion.create as any).mockResolvedValue({
      id: 'cot-audit',
      numero: 'COT-2025-0001',
      titulo: 'Audit Cotización',
    });

    const { AuditService } = await import('@/lib/audit-service');

    await POST(
      mockRequest('https://volkern.app/api/cotizaciones', {
        titulo: 'Audit Cotización',
        items: [{ concepto: 'Item', cantidad: 1, precioUnitario: 100 }],
      }),
    );

    expect(AuditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'test-tenant-id',
        userId: 'test-user-id',
        action: 'crear',
        entity: 'cotizacion',
        entityId: 'cot-audit',
        description: expect.stringContaining('COT-2025-0001'),
        changesAfter: expect.objectContaining({ titulo: 'Audit Cotización' }),
        ipAddress: undefined,
        userAgent: undefined,
      }),
    );
  });

  // ── Errores ────────────────────────────────────────────────────────────

  it('debe devolver 500 si Prisma falla en findFirst (numeración)', async () => {
    (prisma.cotizacion.findFirst as any).mockRejectedValue(new Error('DB error'));

    const response = await POST(
      mockRequest('https://volkern.app/api/cotizaciones', {
        titulo: 'Error FindFirst',
        items: [{ concepto: 'Item', cantidad: 1, precioUnitario: 100 }],
      }),
    );

    expect(response.status).toBe(500);
    const json = await response.json();
    expect(json.error).toBe('Error al crear cotización');
  });

  it('debe devolver 500 si Prisma falla en create', async () => {
    (prisma.cotizacion.findFirst as any).mockResolvedValue(null);
    (prisma.cotizacion.create as any).mockRejectedValue(new Error('DB error'));

    const response = await POST(
      mockRequest('https://volkern.app/api/cotizaciones', {
        titulo: 'Error Create',
        items: [{ concepto: 'Item', cantidad: 1, precioUnitario: 100 }],
      }),
    );

    expect(response.status).toBe(500);
    const json = await response.json();
    expect(json.error).toBe('Error al crear cotización');
  });

  it('debe devolver 500 si request.json() falla (body inválido)', async () => {
    const req = new Request('https://volkern.app/api/cotizaciones', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{ broken json',
    });

    const response = await POST(req, undefined);

    expect(response.status).toBe(500);
    const json = await response.json();
    expect(json.error).toBe('Error al crear cotización');
  });

  // ── Catch silencioso: audit ────────────────────────────────────────────

  it('debe devolver 500 si AuditService.log falla (no hay catch silencioso)', async () => {
    (prisma.cotizacion.findFirst as any).mockResolvedValue(null);
    (prisma.cotizacion.create as any).mockResolvedValue({
      id: 'cot-audit-fail',
      numero: 'COT-2025-0001',
    });

    const { AuditService } = await import('@/lib/audit-service');
    (AuditService.log as any).mockRejectedValueOnce(new Error('Audit error'));

    const response = await POST(
      mockRequest('https://volkern.app/api/cotizaciones', {
        titulo: 'Audit Fail',
        items: [{ concepto: 'Item', cantidad: 1, precioUnitario: 100 }],
      }),
    );

    expect(response.status).toBe(500);
    const json = await response.json();
    expect(json.error).toBe('Error al crear cotización');
  });

  // ── Aislamiento ────────────────────────────────────────────────────────

  it('debe crear la cotización con tenantId del auth', async () => {
    (prisma.cotizacion.findFirst as any).mockResolvedValue(null);
    (prisma.cotizacion.create as any).mockResolvedValue({ id: 'cot-tenant' });

    await POST(
      mockRequest('https://volkern.app/api/cotizaciones', {
        titulo: 'Tenant Test',
        items: [{ concepto: 'Item', cantidad: 1, precioUnitario: 100 }],
      }),
    );

    expect(prisma.cotizacion.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ tenantId: 'test-tenant-id' }),
      }),
    );
  });
});
