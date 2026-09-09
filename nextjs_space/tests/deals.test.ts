import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ─────────────────────────────────────────────────────────────────

vi.mock('@/lib/db', () => ({
  prisma: {
    deal: {
      findMany: vi.fn(),
      create: vi.fn(),
    },
    pipeline: {
      findFirst: vi.fn().mockResolvedValue(undefined),
    },
    dealActivity: {
      create: vi.fn(),
    },
    contact: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    lead: {
      findFirst: vi.fn(),
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
          role: { id: 'role-1', nombre: 'Admin', permisos: { leads: { ver: true, crear: true } } },
        },
      };
      return handler(request, mockAuth);
    };
  };
  return { withTenantAuth: mockWithTenantAuth };
});

vi.mock('@/lib/permissions', () => ({
  hasPermission: vi.fn().mockReturnValue(true),
  canOnlySeeOwnLeads: vi.fn().mockReturnValue(false),
}));

vi.mock('@/lib/telemetry/adoption-kpis', () => ({
  AdoptionTelemetry: {
    trackHubView: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('@/lib/audit-service', () => ({
  AuditService: {
    log: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('@/lib/skills/notification-layer', () => ({
  notifyByTelegram: vi.fn().mockResolvedValue({ success: true, channel: 'telegram', status: 'sent' }),
}));

vi.mock('@/lib/skills/context', () => ({
  createSystemContext: vi.fn().mockReturnValue({}),
}));

// ─── Imports ───────────────────────────────────────────────────────────────

import { GET, POST } from '@/app/api/deals/route';
import { prisma } from '@/lib/db';
import { hasPermission, canOnlySeeOwnLeads } from '@/lib/permissions';
import { AdoptionTelemetry } from '@/lib/telemetry/adoption-kpis';

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

const mockDeals = [
  {
    id: 'deal-1',
    tenantId: 'test-tenant-id',
    titulo: 'Proyecto IoT TechCorp',
    descripcion: 'Implementación de sensores IoT',
    valor: 50000,
    moneda: 'EUR',
    etapa: 'negociacion',
    estado: 'activo',
    probabilidad: 60,
    prioridad: 'alta',
    leadId: null,
    contactId: 'contact-1',
    companyId: null,
    usuarioAsignadoId: 'test-user-id',
    fechaCreacion: new Date('2025-05-20T10:00:00Z'),
    fechaActualizacion: new Date('2025-05-22T14:00:00Z'),
    lead: null,
    contact: {
      id: 'contact-1',
      nombre: 'Carlos Ruiz',
      email: 'carlos@techcorp.com',
      telefono: '+34 600 111 222',
      tipo: 'person',
      cargo: 'CTO',
      ubicacion: 'Madrid',
    },
    company: null,
    usuarioAsignado: {
      id: 'test-user-id',
      name: 'Test User',
      email: 'test@test.com',
    },
    _count: { cotizaciones: 2, actividades: 5 },
  },
  {
    id: 'deal-2',
    tenantId: 'test-tenant-id',
    titulo: 'Consultoría EcoGreen',
    descripcion: 'Asesoría en eficiencia energética',
    valor: 15000,
    moneda: 'EUR',
    etapa: 'calificacion',
    estado: 'activo',
    probabilidad: 25,
    prioridad: 'media',
    leadId: 'lead-1',
    contactId: null,
    companyId: null,
    usuarioAsignadoId: 'test-user-id',
    fechaCreacion: new Date('2025-05-21T08:00:00Z'),
    fechaActualizacion: new Date('2025-05-21T08:00:00Z'),
    lead: {
      id: 'lead-1',
      nombre: 'Ana García',
      email: 'ana@ecogreen.com',
      telefono: '+34 600 222 333',
      empresa: 'EcoGreen SL',
    },
    contact: null,
    company: null,
    usuarioAsignado: {
      id: 'test-user-id',
      name: 'Test User',
      email: 'test@test.com',
    },
    _count: { cotizaciones: 0, actividades: 1 },
  },
];

// ─── GET Tests ─────────────────────────────────────────────────────────────

describe('GET /api/deals', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('debe devolver deals y metrics', async () => {
    (prisma.deal.findMany as any).mockResolvedValue(mockDeals);

    const response = await GET(mockRequest('https://volkern.app/api/deals'));

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.deals).toHaveLength(2);
    expect(json.deals[0].titulo).toBe('Proyecto IoT TechCorp');
    expect(json.metrics).toBeDefined();
    expect(json.metrics.totalDeals).toBe(2);
  });

  it('debe incluir lead, contact, company, usuarioAsignado y _count', async () => {
    (prisma.deal.findMany as any).mockResolvedValue(mockDeals);

    const response = await GET(mockRequest('https://volkern.app/api/deals'));
    const json = await response.json();

    // deal-1 tiene contact pero no lead
    expect(json.deals[0].contact).toEqual(expect.objectContaining({ nombre: 'Carlos Ruiz' }));
    expect(json.deals[0].lead).toBeNull();
    expect(json.deals[0].usuarioAsignado).toEqual(expect.objectContaining({ name: 'Test User' }));
    expect(json.deals[0]._count).toEqual({ cotizaciones: 2, actividades: 5 });

    // deal-2 tiene lead pero no contact
    expect(json.deals[1].lead).toEqual(expect.objectContaining({ nombre: 'Ana García' }));
    expect(json.deals[1].contact).toBeNull();
  });

  it('debe filtrar por tenantId para aislamiento', async () => {
    (prisma.deal.findMany as any).mockResolvedValue([]);

    await GET(mockRequest('https://volkern.app/api/deals'));

    expect(prisma.deal.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: 'test-tenant-id' }),
      }),
    );
  });

  it('debe ordenar por fechaActualizacion descendente', async () => {
    (prisma.deal.findMany as any).mockResolvedValue([]);

    await GET(mockRequest('https://volkern.app/api/deals'));

    expect(prisma.deal.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { fechaActualizacion: 'desc' } }),
    );
  });

  it('debe llamar a AdoptionTelemetry.trackHubView', async () => {
    (prisma.deal.findMany as any).mockResolvedValue([]);

    await GET(mockRequest('https://volkern.app/api/deals'));

    expect(AdoptionTelemetry.trackHubView).toHaveBeenCalledWith(
      'test-tenant-id',
      expect.any(String),
      'SALES',
    );
  });

  it('debe devolver 403 si hasPermission("leads", "ver") es false', async () => {
    (hasPermission as any).mockReturnValueOnce(false);
    (prisma.deal.findMany as any).mockResolvedValue(mockDeals);

    const response = await GET(mockRequest('https://volkern.app/api/deals'));

    expect(response.status).toBe(403);
    const json = await response.json();
    expect(json.error).toBe('Sin permiso para ver el pipeline');
  });

  it('debe filtrar por usuarioAsignadoId si canOnlySeeOwnLeads es true', async () => {
    (canOnlySeeOwnLeads as any).mockReturnValueOnce(true);
    (prisma.deal.findMany as any).mockResolvedValue(mockDeals);

    await GET(mockRequest('https://volkern.app/api/deals'));

    expect(prisma.deal.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ usuarioAsignadoId: 'test-user-id' }),
      }),
    );
  });

  it('debe usar query param usuarioAsignadoId si canOnlySeeOwnLeads es false', async () => {
    (prisma.deal.findMany as any).mockResolvedValue([mockDeals[0]]);

    await GET(mockRequest('https://volkern.app/api/deals?usuarioAsignadoId=other-user'));

    expect(prisma.deal.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ usuarioAsignadoId: 'other-user' }),
      }),
    );
  });

  it('debe filtrar por etapa', async () => {
    (prisma.deal.findMany as any).mockResolvedValue([mockDeals[0]]);

    await GET(mockRequest('https://volkern.app/api/deals?etapa=negociacion'));

    expect(prisma.deal.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ etapa: 'negociacion' }),
      }),
    );
  });

  it('debe filtrar por estado', async () => {
    (prisma.deal.findMany as any).mockResolvedValue([mockDeals[0]]);

    await GET(mockRequest('https://volkern.app/api/deals?estado=activo'));

    expect(prisma.deal.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ estado: 'activo' }),
      }),
    );
  });

  it('debe filtrar por leadId', async () => {
    (prisma.deal.findMany as any).mockResolvedValue([mockDeals[1]]);

    await GET(mockRequest('https://volkern.app/api/deals?leadId=lead-1'));

    expect(prisma.deal.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ leadId: 'lead-1' }),
      }),
    );
  });

  it('debe filtrar por contactId', async () => {
    (prisma.deal.findMany as any).mockResolvedValue([mockDeals[0]]);

    await GET(mockRequest('https://volkern.app/api/deals?contactId=contact-1'));

    expect(prisma.deal.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ contactId: 'contact-1' }),
      }),
    );
  });

  it('debe buscar por search con OR sobre titulo y descripcion', async () => {
    (prisma.deal.findMany as any).mockResolvedValue([mockDeals[0]]);

    await GET(mockRequest('https://volkern.app/api/deals?search=IoT'));

    expect(prisma.deal.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [
            { titulo: { contains: 'IoT', mode: 'insensitive' } },
            { descripcion: { contains: 'IoT', mode: 'insensitive' } },
          ],
        }),
      }),
    );
  });

  it('debe calcular metrics correctamente', async () => {
    (prisma.deal.findMany as any).mockResolvedValue(mockDeals);

    const response = await GET(mockRequest('https://volkern.app/api/deals'));
    const json = await response.json();

    // totalValor = 50000 + 15000 = 65000
    expect(json.metrics.totalValor).toBe(65000);
    // valorPonderado = 50000*0.6 + 15000*0.25 = 30000 + 3750 = 33750
    expect(json.metrics.valorPonderado).toBe(33750);
    // porEtapa: negociacion: 1, calificacion: 1
    expect(json.metrics.porEtapa).toEqual({ negociacion: 1, calificacion: 1 });
    // porEstado: activo: 2
    expect(json.metrics.porEstado).toEqual({ activo: 2 });
    expect(json.metrics.gapAnalysis).toBe(66250);
  });

  it('debe devolver array vacío con fallback si Prisma falla', async () => {
    (prisma.deal.findMany as any).mockRejectedValue(new Error('DB error'));

    const response = await GET(mockRequest('https://volkern.app/api/deals'));

    // No es 500 — devuelve deals: [], metrics con valores por defecto
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.deals).toEqual([]);
    expect(json.fallback).toBe(true);
    expect(json.error).toBe('DB error');
    expect(json.metrics.totalDeals).toBe(0);
    expect(json.metrics.totalValor).toBe(0);
  });
});

// ─── POST Tests ────────────────────────────────────────────────────────────

describe('POST /api/deals', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Validación ──────────────────────────────────────────────────────────

  it('debe devolver 400 si titulo no se envía', async () => {
    const response = await POST(
      mockRequest('https://volkern.app/api/deals', {
        valor: 1000,
      }),
    );

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error).toBe('Datos inválidos');
    expect(prisma.deal.create).not.toHaveBeenCalled();
  });

  it('debe devolver 400 si valor es negativo', async () => {
    const response = await POST(
      mockRequest('https://volkern.app/api/deals', {
        titulo: 'Test Deal',
        valor: -100,
      }),
    );

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error).toBe('Datos inválidos');
  });

  // ── Creación básica ────────────────────────────────────────────────────

  it('debe crear un nuevo deal con campos requeridos', async () => {
    (prisma.deal.create as any).mockResolvedValue({
      id: 'deal-new',
      titulo: 'Nuevo Deal',
      valor: 10000,
      moneda: 'EUR',
      etapa: 'calificacion',
    });

    const response = await POST(
      mockRequest('https://volkern.app/api/deals', {
        titulo: 'Nuevo Deal',
        valor: 10000,
      }),
    );

    expect(response.status).toBe(201);
    const json = await response.json();
    expect(json.deal.titulo).toBe('Nuevo Deal');
  });

  it('debe usar defaults para etapa, probabilidad, prioridad, moneda, estado', async () => {
    (prisma.deal.create as any).mockResolvedValue({ id: 'deal-defaults' });

    await POST(
      mockRequest('https://volkern.app/api/deals', {
        titulo: 'Default Deal',
        valor: 5000,
      }),
    );

    expect(prisma.deal.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          etapa: 'calificacion',
          probabilidad: 25,
          prioridad: 'media',
          moneda: 'EUR',
          tenantId: 'test-tenant-id',
          usuarioAsignadoId: 'test-user-id',
        }),
      }),
    );
  });

  it('debe crear con todos los campos opcionales', async () => {
    (prisma.deal.create as any).mockResolvedValue({ id: 'deal-full' });

    await POST(
      mockRequest('https://volkern.app/api/deals', {
        titulo: 'Deal Completo',
        descripcion: 'Descripción completa',
        valor: 25000,
        moneda: 'USD',
        etapa: 'propuesta',
        probabilidad: 75,
        prioridad: 'alta',
        fechaEstimadaCierre: '2025-07-15T00:00:00.000Z',
        origen: 'web',
        tags: 'vip,prioritario',
        leadId: null,
        contactId: null,
        usuarioAsignadoId: 'cl0usr00000000000000000001',
      }),
    );

    expect(prisma.deal.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          titulo: 'Deal Completo',
          descripcion: 'Descripción completa',
          valor: 25000,
          moneda: 'USD',
          etapa: 'propuesta',
          probabilidad: 75,
          prioridad: 'alta',
          fechaEstimadaCierre: expect.any(Date),
          origen: 'web',
          tags: 'vip,prioritario',
          tenantId: 'test-tenant-id',
          usuarioAsignadoId: 'cl0usr00000000000000000001',
        }),
      }),
    );
  });

  it('debe incluir lead, contact, company, usuarioAsignado en el create', async () => {
    (prisma.deal.create as any).mockResolvedValue({ id: 'deal-include' });

    await POST(
      mockRequest('https://volkern.app/api/deals', {
        titulo: 'Include Test',
        valor: 1000,
      }),
    );

    expect(prisma.deal.create).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          lead: true,
          contact: true,
          company: true,
          usuarioAsignado: { select: { id: true, name: true, email: true } },
        }),
      }),
    );
  });

  // ── dealActivity ────────────────────────────────────────────────────────

  it('debe crear dealActivity tras crear el deal', async () => {
    (prisma.deal.create as any).mockResolvedValue({
      id: 'deal-activity-test',
      titulo: 'Activity Deal',
    });

    await POST(
      mockRequest('https://volkern.app/api/deals', {
        titulo: 'Activity Deal',
        valor: 1000,
      }),
    );

    expect(prisma.dealActivity.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          dealId: 'deal-activity-test',
          tenantId: 'test-tenant-id',
          userId: 'test-user-id',
          tipo: 'creacion',
          titulo: 'Deal creado',
        }),
      }),
    );
  });

  // ── Audit ───────────────────────────────────────────────────────────────

  it('debe llamar a AuditService.log tras crear el deal', async () => {
    (prisma.deal.create as any).mockResolvedValue({
      id: 'deal-audit',
      titulo: 'Audit Deal',
      valor: 1000,
    });

    const { AuditService } = await import('@/lib/audit-service');

    await POST(
      mockRequest('https://volkern.app/api/deals', {
        titulo: 'Audit Deal',
        valor: 1000,
      }),
    );

    expect(AuditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'test-tenant-id',
        userId: 'test-user-id',
        action: 'crear',
        entity: 'deal',
        entityId: 'deal-audit',
        description: expect.stringContaining('Audit Deal'),
      }),
    );
  });

  // ── Telegram notification ───────────────────────────────────────────────

  it('debe llamar a notifyByTelegram (catch silencioso)', async () => {
    (prisma.deal.create as any).mockResolvedValue({
      id: 'deal-telegram',
      titulo: 'Telegram Deal',
      valor: 1000,
      lead: null,
    });

    const { notifyByTelegram } = await import('@/lib/skills/notification-layer');

    await POST(
      mockRequest('https://volkern.app/api/deals', {
        titulo: 'Telegram Deal',
        valor: 1000,
      }),
    );

    expect(notifyByTelegram).toHaveBeenCalled();
  });

  it('debe continuar aunque notifyByTelegram falle (catch silencioso)', async () => {
    (prisma.deal.create as any).mockResolvedValue({
      id: 'deal-tg-fail',
      titulo: 'TG Fail',
      valor: 1000,
      lead: null,
    });

    const { notifyByTelegram } = await import('@/lib/skills/notification-layer');
    (notifyByTelegram as any).mockRejectedValueOnce(new Error('Telegram error'));

    const response = await POST(
      mockRequest('https://volkern.app/api/deals', {
        titulo: 'TG Fail',
        valor: 1000,
      }),
    );

    // La notificación tiene catch silencioso, el deal se crea igual
    expect(response.status).toBe(201);
  });

  // ── Permisos ────────────────────────────────────────────────────────────

  it('debe devolver 403 si hasPermission("leads", "crear") es false', async () => {
    (hasPermission as any).mockReturnValueOnce(false);

    const response = await POST(
      mockRequest('https://volkern.app/api/deals', {
        titulo: 'No Permiso',
        valor: 1000,
      }),
    );

    expect(response.status).toBe(403);
    const json = await response.json();
    expect(json.error).toBe('Sin permiso para crear deals');
    expect(prisma.deal.create).not.toHaveBeenCalled();
  });

  // ── newContact ──────────────────────────────────────────────────────────

  it('debe devolver 400 si newContact no tiene nombre (Zod lo atrapa antes)', async () => {
    const response = await POST(
      mockRequest('https://volkern.app/api/deals', {
        titulo: 'NewContact Test',
        valor: 1000,
        newContact: { email: 'test@test.com' },
      }),
    );

    expect(response.status).toBe(400);
    const json = await response.json();
    // Zod atrapa el nombre faltante en el sub-schema de newContact
    expect(json.error).toBe('Datos inválidos');
  });

  it('debe devolver 400 si newContact no tiene email (Zod lo atrapa antes)', async () => {
    const response = await POST(
      mockRequest('https://volkern.app/api/deals', {
        titulo: 'NewContact Test',
        valor: 1000,
        newContact: { nombre: 'Test' },
      }),
    );

    expect(response.status).toBe(400);
    const json = await response.json();
    // Zod atrapa el email faltante en el sub-schema de newContact
    expect(json.error).toBe('Datos inválidos');
  });

  it('debe devolver 400 si newContact email ya existe', async () => {
    (prisma.contact.findFirst as any).mockResolvedValue({ id: 'existing-contact' });

    const response = await POST(
      mockRequest('https://volkern.app/api/deals', {
        titulo: 'NewContact Dup',
        valor: 1000,
        newContact: { nombre: 'Test', email: 'existente@test.com' },
      }),
    );

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error).toBe('El email ya está registrado para otro contacto en este tenant.');
    expect(prisma.contact.create).not.toHaveBeenCalled();
  });

  it('debe crear contacto via newContact y vincularlo al deal', async () => {
    (prisma.contact.findFirst as any).mockResolvedValue(null);
    (prisma.contact.create as any).mockResolvedValue({ id: 'new-contact-id', nombre: 'Nuevo Contacto' });
    (prisma.deal.create as any).mockResolvedValue({ id: 'deal-new-contact' });

    await POST(
      mockRequest('https://volkern.app/api/deals', {
        titulo: 'Deal con NewContact',
        valor: 1000,
        newContact: { nombre: 'Nuevo Contacto', email: 'nuevo@test.com' },
      }),
    );

    expect(prisma.contact.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          nombre: 'Nuevo Contacto',
          email: 'nuevo@test.com',
        }),
      }),
    );
    expect(prisma.deal.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          contactId: 'new-contact-id',
        }),
      }),
    );
  });

  it('debe crear newContact con todos los campos opcionales', async () => {
    (prisma.contact.findFirst as any).mockResolvedValue(null);
    (prisma.contact.create as any).mockResolvedValue({ id: 'nc-full' });
    (prisma.deal.create as any).mockResolvedValue({ id: 'deal-nc' });

    await POST(
      mockRequest('https://volkern.app/api/deals', {
        titulo: 'NC Full',
        valor: 1000,
        newContact: {
          nombre: 'Contact Full',
          email: 'full@test.com',
          telefono: '+34 600 123 456',
          tipo: 'person',
          cargo: 'CEO',
          ubicacion: 'Madrid',
          linkedin: 'https://linkedin.com/in/full',
          notas: 'Nota de prueba',
          tags: 'vip',
        },
      }),
    );

    expect(prisma.contact.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          nombre: 'Contact Full',
          email: 'full@test.com',
          telefono: '+34 600 123 456',
          tipo: 'person',
          cargo: 'CEO',
          ubicacion: 'Madrid',
          linkedin: 'https://linkedin.com/in/full',
          notas: 'Nota de prueba',
          tags: 'vip',
          tenantId: 'test-tenant-id',
        }),
      }),
    );
  });

  // ── contactId existente ────────────────────────────────────────────────

  it('debe usar contactId existente si se proporciona', async () => {
    (prisma.contact.findFirst as any).mockResolvedValue({ id: 'cl0cnt00000000000000000001', tipo: 'person', companyId: null });
    (prisma.deal.create as any).mockResolvedValue({ id: 'deal-contact' });

    await POST(
      mockRequest('https://volkern.app/api/deals', {
        titulo: 'Deal con Contact',
        valor: 1000,
        contactId: 'cl0cnt00000000000000000001',
      }),
    );

    expect(prisma.contact.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'cl0cnt00000000000000000001', tenantId: 'test-tenant-id' } }),
    );
    expect(prisma.deal.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ contactId: 'cl0cnt00000000000000000001' }),
      }),
    );
  });

  it('debe devolver 404 si contactId no existe', async () => {
    (prisma.contact.findFirst as any).mockResolvedValue(null);

    const response = await POST(
      mockRequest('https://volkern.app/api/deals', {
        titulo: 'Contact Not Found',
        valor: 1000,
        contactId: 'cl0cnt00000000000000000999',
      }),
    );

    expect(response.status).toBe(404);
    const json = await response.json();
    expect(json.error).toBe('Contacto no encontrado');
    expect(prisma.deal.create).not.toHaveBeenCalled();
  });

  // ── leadId ──────────────────────────────────────────────────────────────

  it('debe usar leadId convertido si se proporciona', async () => {
    (prisma.lead.findFirst as any).mockResolvedValue({
      id: 'cl0lead00000000000000000001',
      convertedToContactId: 'cl0conv00000000000000000001',
    });
    (prisma.deal.create as any).mockResolvedValue({ id: 'deal-lead' });

    await POST(
      mockRequest('https://volkern.app/api/deals', {
        titulo: 'Deal desde Lead',
        valor: 1000,
        leadId: 'cl0lead00000000000000000001',
      }),
    );

    expect(prisma.deal.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ contactId: 'cl0conv00000000000000000001' }),
      }),
    );
  });

  it('debe devolver 404 si leadId no existe', async () => {
    (prisma.lead.findFirst as any).mockResolvedValue(null);

    const response = await POST(
      mockRequest('https://volkern.app/api/deals', {
        titulo: 'Lead Not Found',
        valor: 1000,
        leadId: 'cl0lead00000000000000000999',
      }),
    );

    expect(response.status).toBe(404);
    const json = await response.json();
    expect(json.error).toBe('Lead no encontrado');
    expect(prisma.deal.create).not.toHaveBeenCalled();
  });

  it('debe devolver 400 si lead no está convertido', async () => {
    (prisma.lead.findFirst as any).mockResolvedValue({
      id: 'cl0lead00000000000000000002',
      convertedToContactId: null,
    });

    const response = await POST(
      mockRequest('https://volkern.app/api/deals', {
        titulo: 'Lead Sin Convertir',
        valor: 1000,
        leadId: 'cl0lead00000000000000000002',
      }),
    );

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error).toBe('El lead debe convertirse primero.');
    expect(prisma.deal.create).not.toHaveBeenCalled();
  });

  // ── Errores ─────────────────────────────────────────────────────────────

  it('debe devolver 500 si Prisma falla en create', async () => {
    (prisma.deal.create as any).mockRejectedValue(new Error('DB error'));

    const response = await POST(
      mockRequest('https://volkern.app/api/deals', {
        titulo: 'Error Deal',
        valor: 1000,
      }),
    );

    expect(response.status).toBe(500);
    const json = await response.json();
    expect(json.error).toBe('Error al crear deal');
  });

  it('debe devolver 500 si request.json() falla (body inválido)', async () => {
    const req = new Request('https://volkern.app/api/deals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{ broken json',
    });

    const response = await POST(req, undefined);

    expect(response.status).toBe(500);
    const json = await response.json();
    expect(json.error).toBe('Error al crear deal');
  });

  // ── Aislamiento ─────────────────────────────────────────────────────────

  it('debe crear el deal con tenantId del auth', async () => {
    (prisma.deal.create as any).mockResolvedValue({ id: 'deal-tenant' });

    await POST(
      mockRequest('https://volkern.app/api/deals', {
        titulo: 'Tenant Deal',
        valor: 1000,
      }),
    );

    expect(prisma.deal.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ tenantId: 'test-tenant-id' }),
      }),
    );
  });

  // ── Catch silencioso: audit ─────────────────────────────────────────────

  it('debe devolver 500 si AuditService.log falla (no hay catch silencioso)', async () => {
    (prisma.deal.create as any).mockResolvedValue({ id: 'deal-audit-fail', titulo: 'Audit Fail' });

    const { AuditService } = await import('@/lib/audit-service');
    (AuditService.log as any).mockRejectedValueOnce(new Error('Audit error'));

    const response = await POST(
      mockRequest('https://volkern.app/api/deals', {
        titulo: 'Audit Fail',
        valor: 1000,
      }),
    );

    expect(response.status).toBe(500);
    const json = await response.json();
    expect(json.error).toBe('Error al crear deal');
  });
});
