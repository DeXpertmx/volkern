import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ─────────────────────────────────────────────────────────────────

vi.mock('@/lib/db', () => ({
  prisma: {
    contact: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
    },
    lead: {
      findFirst: vi.fn(),
    },
    aseguradora: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    productoSeguro: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    poliza: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
    },
    renovacion: {
      findMany: vi.fn(),
    },
    user: {
      findFirst: vi.fn(),
    },
  },
  getTenantDb: vi.fn(),
  dbContext: { tenantId: 'test-tenant-id' },
}));

// create_poliza importa convertLead desde './contact-skills' para resolver
// el cliente asegurado cuando viene de un lead → lo aislamos en el test.
vi.mock('@/lib/skills/contact-skills', () => ({
  convertLead: vi.fn(),
}));

// ─── Imports ───────────────────────────────────────────────────────────────

import {
  create_poliza,
  list_polizas,
  polizas_por_vencer,
  renovaciones_pendientes,
  clientes_sin_contacto,
} from '@/lib/skills/insurance-skills';
import { prisma } from '@/lib/db';
import { convertLead } from '@/lib/skills/contact-skills';

// ─── Fixtures ──────────────────────────────────────────────────────────────

const TENANT_ID = 'tenant-1';
const USER_ID = 'user-1';

const clienteJuan = { id: 'contact-1', nombre: 'Juan Pérez', email: 'juan@mail.com' };
const aseguradoraAXA = { id: 'ase-1', nombre: 'AXA' };
const productoVida = { id: 'prod-1', nombre: 'Seguro Vida', ramo: 'VIDA' };

const polizaCreada = {
  id: 'pol-1',
  numeroPoliza: 'AXA-1234',
  cliente: { id: 'contact-1', nombre: 'Juan Pérez', email: 'juan@mail.com' },
  aseguradora: { id: 'ase-1', nombre: 'AXA' },
  productoSeguro: { id: 'prod-1', nombre: 'Seguro Vida', ramo: 'VIDA' },
};

// ─── create_poliza ─────────────────────────────────────────────────────────

describe('create_poliza', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('crea la póliza resolviendo cliente por email y aseguradora por nombre', async () => {
    (prisma.contact.findFirst as any).mockResolvedValue(clienteJuan);
    (prisma.aseguradora.findFirst as any).mockResolvedValue(aseguradoraAXA);
    (prisma.productoSeguro.findFirst as any).mockResolvedValue(productoVida);
    (prisma.poliza.findFirst as any).mockResolvedValue(null);
    (prisma.poliza.create as any).mockResolvedValue(polizaCreada);

    const result = await create_poliza({
      tenantId: TENANT_ID,
      numeroPoliza: 'AXA-1234',
      cliente: 'juan@mail.com',
      aseguradora: 'AXA',
      producto: 'Vida',
      fechaInicio: '2026-01-01',
      fechaVencimiento: '2026-12-31',
      primaAnual: '850',
      formaPago: 'anual',
      userId: USER_ID,
    });

    expect(prisma.contact.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: TENANT_ID,
          email: { equals: 'juan@mail.com', mode: 'insensitive' },
          tipo: { not: 'company' },
        }),
      }),
    );
    expect(prisma.aseguradora.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: TENANT_ID, nombre: { contains: 'AXA', mode: 'insensitive' } },
      }),
    );
    expect(prisma.poliza.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: TENANT_ID,
          numeroPoliza: 'AXA-1234',
          clienteId: 'contact-1',
          aseguradoraId: 'ase-1',
          productoSeguroId: 'prod-1',
          fechaInicio: new Date('2026-01-01'),
          fechaVencimiento: new Date('2026-12-31'),
          primaAnual: 850,
          formaPago: 'ANUAL',
          estado: 'ACTIVA',
          moneda: 'EUR',
          createdById: USER_ID,
        }),
      }),
    );
    expect(result.message).toBe('Póliza AXA-1234 creada para Juan Pérez');
    expect(result.poliza.id).toBe('pol-1');
  });

  it('crea un producto genérico si no se especifica producto ni ramo', async () => {
    (prisma.contact.findFirst as any).mockResolvedValue(clienteJuan);
    (prisma.aseguradora.findFirst as any).mockResolvedValue(aseguradoraAXA);
    // findProducto no llama (sin producto/ramo); ensureProducto consulta y crea
    (prisma.productoSeguro.findFirst as any).mockResolvedValue(null);
    (prisma.productoSeguro.create as any).mockResolvedValue({ id: 'prod-generic' });
    (prisma.poliza.findFirst as any).mockResolvedValue(null);
    (prisma.poliza.create as any).mockResolvedValue(polizaCreada);

    await create_poliza({
      tenantId: TENANT_ID,
      numeroPoliza: 'AXA-9999',
      email: 'juan@mail.com',
      aseguradora: 'AXA',
      fechaVencimiento: '2026-12-31',
      userId: USER_ID,
    });

    expect(prisma.productoSeguro.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: TENANT_ID,
          aseguradoraId: 'ase-1',
          nombre: 'Seguro General',
          ramo: 'OTROS',
        }),
      }),
    );
    expect(prisma.poliza.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ productoSeguroId: 'prod-generic' }),
      }),
    );
  });

  it('convierte el lead a contacto cuando el cliente es un lead sin convertir', async () => {
    (prisma.contact.findFirst as any).mockResolvedValue(null);
    (prisma.lead.findFirst as any).mockResolvedValue({ id: 'lead-1', estado: 'nuevo' });
    (convertLead as any).mockResolvedValue({
      lead: { id: 'lead-1' },
      contact: { id: 'contact-lead', nombre: 'Juan Convertido', email: 'juan@mail.com' },
      deal: null,
    });
    (prisma.aseguradora.findFirst as any).mockResolvedValue(aseguradoraAXA);
    (prisma.productoSeguro.findFirst as any).mockResolvedValue(productoVida);
    (prisma.poliza.findFirst as any).mockResolvedValue(null);
    (prisma.poliza.create as any).mockResolvedValue(polizaCreada);

    await create_poliza({
      tenantId: TENANT_ID,
      numeroPoliza: 'AXA-7777',
      email: 'juan@mail.com',
      aseguradora: 'AXA',
      fechaVencimiento: '2026-12-31',
      userId: USER_ID,
    });

    expect(convertLead).toHaveBeenCalledWith({ leadId: 'lead-1', tenantId: TENANT_ID });
    expect(prisma.poliza.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ clienteId: 'contact-lead' }),
      }),
    );
  });

  it('reutiliza el contacto ya convertido (idempotencia del lead)', async () => {
    (prisma.contact.findFirst as any)
      .mockResolvedValueOnce(null) // por email no existe
      .mockResolvedValueOnce({ id: 'contact-conv', nombre: 'Juan Convertido', email: 'juan@mail.com' }); // por convertedToContactId
    (prisma.lead.findFirst as any).mockResolvedValue({ id: 'lead-1', estado: 'convertido', convertedToContactId: 'contact-conv' });
    (prisma.aseguradora.findFirst as any).mockResolvedValue(aseguradoraAXA);
    (prisma.productoSeguro.findFirst as any).mockResolvedValue(productoVida);
    (prisma.poliza.findFirst as any).mockResolvedValue(null);
    (prisma.poliza.create as any).mockResolvedValue(polizaCreada);

    await create_poliza({
      tenantId: TENANT_ID,
      numeroPoliza: 'AXA-6666',
      email: 'juan@mail.com',
      aseguradora: 'AXA',
      fechaVencimiento: '2026-12-31',
      userId: USER_ID,
    });

    expect(convertLead).not.toHaveBeenCalled();
    expect(prisma.poliza.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ clienteId: 'contact-conv' }),
      }),
    );
  });

  it('lanza error si falta el número de póliza', async () => {
    await expect(
      create_poliza({ tenantId: TENANT_ID, numeroPoliza: '' } as any),
    ).rejects.toThrow('El número de póliza es requerido');
  });

  it('lanza error si falta la fecha de vencimiento', async () => {
    await expect(
      create_poliza({ tenantId: TENANT_ID, numeroPoliza: 'P-1' } as any),
    ).rejects.toThrow('La fecha de vencimiento es requerida');
  });

  it('lanza error si no encuentra el cliente', async () => {
    (prisma.contact.findFirst as any).mockResolvedValue(null);
    (prisma.lead.findFirst as any).mockResolvedValue(null);

    await expect(
      create_poliza({
        tenantId: TENANT_ID,
        numeroPoliza: 'P-2',
        email: 'noexiste@mail.com',
        aseguradora: 'AXA',
        fechaVencimiento: '2026-12-31',
        userId: USER_ID,
      }),
    ).rejects.toThrow('No encontré el cliente');
  });

  it('lanza error si no encuentra la aseguradora', async () => {
    (prisma.contact.findFirst as any).mockResolvedValue(clienteJuan);
    (prisma.aseguradora.findFirst as any).mockResolvedValue(null);

    await expect(
      create_poliza({
        tenantId: TENANT_ID,
        numeroPoliza: 'P-3',
        email: 'juan@mail.com',
        aseguradora: 'NoExiste',
        fechaVencimiento: '2026-12-31',
        userId: USER_ID,
      }),
    ).rejects.toThrow('No encontré la aseguradora');
  });

  it('lanza error si ya existe una póliza con el mismo número', async () => {
    (prisma.contact.findFirst as any).mockResolvedValue(clienteJuan);
    (prisma.aseguradora.findFirst as any).mockResolvedValue(aseguradoraAXA);
    (prisma.productoSeguro.findFirst as any).mockResolvedValue(productoVida);
    (prisma.poliza.findFirst as any).mockResolvedValue({ id: 'existing' });

    await expect(
      create_poliza({
        tenantId: TENANT_ID,
        numeroPoliza: 'AXA-1234',
        email: 'juan@mail.com',
        aseguradora: 'AXA',
        fechaVencimiento: '2026-12-31',
        userId: USER_ID,
      }),
    ).rejects.toThrow('Ya existe una póliza con el número AXA-1234');
  });

  it('normaliza la prima en formato europeo "1.500,50" → 1500.5', async () => {
    (prisma.contact.findFirst as any).mockResolvedValue(clienteJuan);
    (prisma.aseguradora.findFirst as any).mockResolvedValue(aseguradoraAXA);
    (prisma.productoSeguro.findFirst as any).mockResolvedValue(productoVida);
    (prisma.poliza.findFirst as any).mockResolvedValue(null);
    (prisma.poliza.create as any).mockResolvedValue(polizaCreada);

    await create_poliza({
      tenantId: TENANT_ID,
      numeroPoliza: 'AXA-5555',
      email: 'juan@mail.com',
      aseguradora: 'AXA',
      fechaVencimiento: '2026-12-31',
      primaAnual: '1.500,50',
      userId: USER_ID,
    });

    expect(prisma.poliza.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ primaAnual: 1500.5 }),
      }),
    );
  });

  it('usa la fecha de inicio de hoy si no se proporciona', async () => {
    (prisma.contact.findFirst as any).mockResolvedValue(clienteJuan);
    (prisma.aseguradora.findFirst as any).mockResolvedValue(aseguradoraAXA);
    (prisma.productoSeguro.findFirst as any).mockResolvedValue(productoVida);
    (prisma.poliza.findFirst as any).mockResolvedValue(null);
    (prisma.poliza.create as any).mockResolvedValue(polizaCreada);

    await create_poliza({
      tenantId: TENANT_ID,
      numeroPoliza: 'AXA-4444',
      email: 'juan@mail.com',
      aseguradora: 'AXA',
      fechaVencimiento: '2026-12-31',
      userId: USER_ID,
    });

    const now = Date.now();
    const createCall = (prisma.poliza.create as any).mock.calls[0][0].data;
    expect(createCall.fechaInicio.getTime()).toBeGreaterThanOrEqual(now - 60_000);
  });

  it('resuelve el usuario creador con user.findFirst cuando no llega userId', async () => {
    (prisma.contact.findFirst as any).mockResolvedValue(clienteJuan);
    (prisma.aseguradora.findFirst as any).mockResolvedValue(aseguradoraAXA);
    (prisma.productoSeguro.findFirst as any).mockResolvedValue(productoVida);
    (prisma.poliza.findFirst as any).mockResolvedValue(null);
    (prisma.user.findFirst as any).mockResolvedValue({ id: 'first-user' });
    (prisma.poliza.create as any).mockResolvedValue(polizaCreada);

    await create_poliza({
      tenantId: TENANT_ID,
      numeroPoliza: 'AXA-3333',
      email: 'juan@mail.com',
      aseguradora: 'AXA',
      fechaVencimiento: '2026-12-31',
      // sin userId → resolveCreator consulta el primer usuario del tenant
    });

    expect(prisma.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: TENANT_ID },
        orderBy: { createdAt: 'asc' },
      }),
    );
    expect(prisma.poliza.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ createdById: 'first-user' }),
      }),
    );
  });
});

// ─── list_polizas ──────────────────────────────────────────────────────────

describe('list_polizas', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('devuelve pólizas con paginación y total', async () => {
    const polizas = [
      { id: 'pol-1', numeroPoliza: 'AXA-1', cliente: { nombre: 'A' }, aseguradora: { nombre: 'AXA' } },
      { id: 'pol-2', numeroPoliza: 'MAPFRE-1', cliente: { nombre: 'B' }, aseguradora: { nombre: 'MAPFRE' } },
    ];
    (prisma.poliza.findMany as any).mockResolvedValue(polizas);
    (prisma.poliza.count as any).mockResolvedValue(22);

    const result = await list_polizas({ tenantId: TENANT_ID });

    expect(result.polizas).toHaveLength(2);
    expect(result.total).toBe(22);
    expect(result.page).toBe(1);
    expect(result.totalPages).toBe(2); // 22 / 20 (default limit)
    expect(prisma.poliza.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: TENANT_ID },
        orderBy: { fechaVencimiento: 'asc' },
      }),
    );
  });

  it('aplica filtros de estado, ramo, aseguradora y cliente', async () => {
    (prisma.poliza.findMany as any).mockResolvedValue([]);
    (prisma.poliza.count as any).mockResolvedValue(0);

    await list_polizas({
      tenantId: TENANT_ID,
      estado: 'activa',
      ramo: 'auto',
      aseguradora: 'AXA',
      nombre: 'Juan',
    });

    const where = (prisma.poliza.findMany as any).mock.calls[0][0].where;
    expect(where.estado).toBe('ACTIVA');
    expect(where.productoSeguro).toEqual({ ramo: 'AUTO' });
    expect(where.aseguradora).toEqual({ nombre: { contains: 'AXA', mode: 'insensitive' } });
    expect(where.cliente).toEqual({ nombre: { contains: 'Juan', mode: 'insensitive' } });
  });

  it('filtra por email del cliente (rama alternativa de where.cliente)', async () => {
    (prisma.poliza.findMany as any).mockResolvedValue([]);
    (prisma.poliza.count as any).mockResolvedValue(0);

    await list_polizas({ tenantId: TENANT_ID, email: 'juan@mail.com' });

    const where = (prisma.poliza.findMany as any).mock.calls[0][0].where;
    expect(where.cliente).toEqual({ email: { equals: 'juan@mail.com', mode: 'insensitive' } });
  });

  it('devuelve lista vacía cuando no hay pólizas', async () => {
    (prisma.poliza.findMany as any).mockResolvedValue([]);
    (prisma.poliza.count as any).mockResolvedValue(0);

    const result = await list_polizas({ tenantId: TENANT_ID });
    expect(result.polizas).toEqual([]);
    expect(result.total).toBe(0);
  });
});

// ─── polizas_por_vencer ─────────────────────────────────────────────────────

describe('polizas_por_vencer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('busca pólizas activas/próximas a vencer en los próximos 30 días por defecto', async () => {
    (prisma.poliza.findMany as any).mockResolvedValue([
      { id: 'pol-1', numeroPoliza: 'AXA-1', cliente: { nombre: 'Juan' }, fechaVencimiento: new Date(Date.now() + 10 * 86400000) },
    ]);

    const result = await polizas_por_vencer({ tenantId: TENANT_ID });

    expect(result.dias).toBe(30);
    expect(result.total).toBe(1);
    const where = (prisma.poliza.findMany as any).mock.calls[0][0].where;
    expect(where.tenantId).toBe(TENANT_ID);
    expect(where.estado).toEqual({ in: ['ACTIVA', 'PROXIMA_A_VENCER'] });
    expect(where.fechaVencimiento.gte).toBeInstanceOf(Date);
    // lte ≈ hoy + 30 días
    const lte = where.fechaVencimiento.lte.getTime();
    const expected = Date.now() + 30 * 86400000;
    expect(Math.abs(lte - expected)).toBeLessThan(60_000);
  });

  it('respeta el parámetro dias personalizado', async () => {
    (prisma.poliza.findMany as any).mockResolvedValue([]);

    await polizas_por_vencer({ tenantId: TENANT_ID, dias: 60 });

    const where = (prisma.poliza.findMany as any).mock.calls[0][0].where;
    const expected = Date.now() + 60 * 86400000;
    expect(Math.abs(where.fechaVencimiento.lte.getTime() - expected)).toBeLessThan(60_000);
  });

  it('devuelve lista vacía si no hay vencimientos en la ventana', async () => {
    (prisma.poliza.findMany as any).mockResolvedValue([]);

    const result = await polizas_por_vencer({ tenantId: TENANT_ID });
    expect(result.polizas).toEqual([]);
    expect(result.total).toBe(0);
  });
});

// ─── renovaciones_pendientes ────────────────────────────────────────────────

describe('renovaciones_pendientes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('busca renovaciones en estados activos por defecto', async () => {
    (prisma.renovacion.findMany as any).mockResolvedValue([
      { id: 'ren-1', estado: 'PENDIENTE', poliza: { numeroPoliza: 'AXA-1', cliente: { nombre: 'Juan' } } },
    ]);

    const result = await renovaciones_pendientes({ tenantId: TENANT_ID });

    expect(result.renovaciones).toHaveLength(1);
    const where = (prisma.renovacion.findMany as any).mock.calls[0][0].where;
    expect(where.tenantId).toBe(TENANT_ID);
    expect(where.estado).toEqual({ in: ['PENDIENTE', 'CONTACTO_INICIAL', 'REVISION', 'OFERTA_ENVIADA'] });
  });

  it('filtra por estado específico', async () => {
    (prisma.renovacion.findMany as any).mockResolvedValue([]);

    await renovaciones_pendientes({ tenantId: TENANT_ID, estado: 'oferta_enviada' });

    const where = (prisma.renovacion.findMany as any).mock.calls[0][0].where;
    expect(where.estado).toBe('OFERTA_ENVIADA');
  });

  it('filtra por riesgo de pérdida', async () => {
    (prisma.renovacion.findMany as any).mockResolvedValue([]);

    await renovaciones_pendientes({ tenantId: TENANT_ID, riesgo: true });

    const where = (prisma.renovacion.findMany as any).mock.calls[0][0].where;
    expect(where.riesgoPerdida).toBe(true);
  });
});

// ─── clientes_sin_contacto ──────────────────────────────────────────────────

describe('clientes_sin_contacto', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('busca clientes con pólizas activas sin interacciones recientes (180 días por defecto)', async () => {
    (prisma.contact.findMany as any).mockResolvedValue([
      { id: 'contact-1', nombre: 'Juan Pérez', polizasSeguro: [{ numeroPoliza: 'AXA-1' }] },
    ]);

    const result = await clientes_sin_contacto({ tenantId: TENANT_ID });

    expect(result.clientes).toHaveLength(1);
    expect(result.dias).toBe(180);
    const where = (prisma.contact.findMany as any).mock.calls[0][0].where;
    expect(where.tenantId).toBe(TENANT_ID);
    expect(where.tipo).toEqual({ not: 'company' });
    expect(where.polizasSeguro).toEqual({
      some: { estado: { in: ['ACTIVA', 'PROXIMA_A_VENCER'] } },
    });
    expect(where.Interaction).toEqual({ none: { fechaCreacion: { gte: expect.any(Date) } } });
  });

  it('respeta el parámetro dias personalizado', async () => {
    (prisma.contact.findMany as any).mockResolvedValue([]);

    await clientes_sin_contacto({ tenantId: TENANT_ID, dias: 90 });

    const where = (prisma.contact.findMany as any).mock.calls[0][0].where;
    const expected = Date.now() - 90 * 86400000;
    expect(Math.abs(where.Interaction.none.fechaCreacion.gte.getTime() - expected)).toBeLessThan(60_000);
  });

  it('incluye pólizas activas y _count de interacciones en el resultado', async () => {
    (prisma.contact.findMany as any).mockResolvedValue([
      {
        id: 'contact-1',
        nombre: 'Juan Pérez',
        polizasSeguro: [{ id: 'pol-1', numeroPoliza: 'AXA-1', aseguradora: { nombre: 'AXA' }, productoSeguro: { nombre: 'Seguro Vida', ramo: 'VIDA' }, fechaVencimiento: new Date('2026-12-31') }],
        _count: { Interaction: 0 },
      },
    ]);

    const result = await clientes_sin_contacto({ tenantId: TENANT_ID });

    expect(result.clientes[0].polizasSeguro).toHaveLength(1);
    expect(result.clientes[0].polizasSeguro[0].numeroPoliza).toBe('AXA-1');
    expect(result.clientes[0]._count.Interaction).toBe(0);
  });

  it('devuelve lista vacía cuando todos los clientes tienen contacto reciente', async () => {
    (prisma.contact.findMany as any).mockResolvedValue([]);

    const result = await clientes_sin_contacto({ tenantId: TENANT_ID });
    expect(result.clientes).toEqual([]);
    expect(result.total).toBe(0);
  });
});
