import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ─────────────────────────────────────────────────────────────────

vi.mock('@/lib/db', () => ({
  prisma: {
    contact: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
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
      return handler(request, mockAuth);
    };
  };
  return { withTenantAuth: mockWithTenantAuth };
});

vi.mock('@/lib/subscription', () => ({
  incrementUsage: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/audit-service', () => ({
  AuditService: {
    log: vi.fn().mockResolvedValue(undefined),
  },
}));

// ─── Imports ───────────────────────────────────────────────────────────────

import { GET, POST } from '@/app/api/contacts/route';
import { prisma } from '@/lib/db';

// ─── Fixtures ──────────────────────────────────────────────────────────────

const mockContacts = [
  {
    id: 'contact-1',
    tenantId: 'test-tenant-id',
    nombre: 'Carlos Ruiz',
    email: 'carlos@techcorp.com',
    telefono: '+34 600 111 222',
    tipo: 'person',
    companyId: 'company-1',
    cargo: 'CTO',
    ubicacion: 'Madrid',
    linkedin: 'https://linkedin.com/in/carlosruiz',
    notas: 'Contacto clave para proyecto IoT',
    tags: 'tecnologia,iot',
    fechaCreacion: new Date('2025-05-20T10:00:00Z'),
    company: {
      id: 'company-1',
      nombre: 'TechCorp SL',
    },
    _count: {
      deals: 3,
      persons: 0,
    },
  },
  {
    id: 'contact-2',
    tenantId: 'test-tenant-id',
    nombre: 'Ana García',
    email: 'ana@ecogreen.com',
    telefono: null,
    tipo: 'person',
    companyId: null,
    cargo: 'Directora',
    ubicacion: null,
    linkedin: null,
    notas: null,
    tags: null,
    fechaCreacion: new Date('2025-05-22T14:30:00Z'),
    company: null,
    _count: {
      deals: 0,
      persons: 0,
    },
  },
  {
    id: 'company-1',
    tenantId: 'test-tenant-id',
    nombre: 'EcoGreen Solutions',
    email: 'info@ecogreen.com',
    telefono: '+34 900 123 456',
    tipo: 'company',
    companyId: null,
    cargo: null,
    ubicacion: 'Barcelona',
    linkedin: null,
    notas: 'Empresa de energías renovables',
    tags: 'renovables,solar',
    fechaCreacion: new Date('2025-05-18T08:00:00Z'),
    company: null,
    _count: {
      deals: 5,
      persons: 2,
    },
  },
];

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

// ─── GET Tests ─────────────────────────────────────────────────────────────

describe('GET /api/contacts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('debe listar todos los contactos del tenant', async () => {
    (prisma.contact.findMany as any).mockResolvedValue(mockContacts);

    const response = await GET(mockRequest('https://volkern.app/api/contacts'));

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toHaveLength(3);
    expect(data[0].nombre).toBe('Carlos Ruiz');
    expect(data[1].nombre).toBe('Ana García');
  });

  it('debe incluir company (id, nombre) y _count en cada contacto', async () => {
    (prisma.contact.findMany as any).mockResolvedValue(mockContacts);

    const response = await GET(mockRequest('https://volkern.app/api/contacts'));
    const data = await response.json();

    expect(data[0].company).toEqual({ id: 'company-1', nombre: 'TechCorp SL' });
    expect(data[0]._count).toEqual({ deals: 3, persons: 0 });
    expect(data[1].company).toBeNull();
    expect(data[1]._count).toEqual({ deals: 0, persons: 0 });
  });

  it('debe filtrar por tenantId para aislamiento', async () => {
    (prisma.contact.findMany as any).mockResolvedValue([]);

    await GET(mockRequest('https://volkern.app/api/contacts'));

    expect(prisma.contact.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: 'test-tenant-id' }),
      }),
    );
  });

  it('debe ordenar por fechaCreacion descendente', async () => {
    (prisma.contact.findMany as any).mockResolvedValue([]);

    await GET(mockRequest('https://volkern.app/api/contacts'));

    expect(prisma.contact.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { fechaCreacion: 'desc' } }),
    );
  });

  it('debe filtrar por tipo (person/company)', async () => {
    (prisma.contact.findMany as any).mockResolvedValue([mockContacts[0]]);

    await GET(mockRequest('https://volkern.app/api/contacts?tipo=person'));

    expect(prisma.contact.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tipo: 'person' }),
      }),
    );
  });

  it('debe buscar por search con OR sobre nombre y email', async () => {
    (prisma.contact.findMany as any).mockResolvedValue([mockContacts[0]]);

    await GET(mockRequest('https://volkern.app/api/contacts?search=Carlos'));

    expect(prisma.contact.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [
            { nombre: { contains: 'Carlos', mode: 'insensitive' } },
            { email: { contains: 'Carlos', mode: 'insensitive' } },
          ],
        }),
      }),
    );
  });

  it('debe filtrar sinEmpresa (companyId = null)', async () => {
    (prisma.contact.findMany as any).mockResolvedValue([mockContacts[1]]);

    await GET(mockRequest('https://volkern.app/api/contacts?sinEmpresa=true'));

    expect(prisma.contact.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ companyId: null }),
      }),
    );
  });

  it('debe combinar filtros simultáneamente', async () => {
    (prisma.contact.findMany as any).mockResolvedValue([]);

    await GET(
      mockRequest('https://volkern.app/api/contacts?tipo=person&search=Ana&sinEmpresa=true'),
    );

    expect(prisma.contact.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tipo: 'person',
          companyId: null,
          OR: expect.any(Array),
        }),
      }),
    );
  });

  it('debe devolver array vacío si no hay contactos', async () => {
    (prisma.contact.findMany as any).mockResolvedValue([]);

    const response = await GET(mockRequest('https://volkern.app/api/contacts'));

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toEqual([]);
  });

  it('debe devolver 500 si Prisma falla', async () => {
    (prisma.contact.findMany as any).mockRejectedValue(new Error('DB error'));

    const response = await GET(mockRequest('https://volkern.app/api/contacts'));

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toBe('Error al obtener contactos');
  });

  it('debe serializar fechas como ISO strings', async () => {
    (prisma.contact.findMany as any).mockResolvedValue(mockContacts);

    const response = await GET(mockRequest('https://volkern.app/api/contacts'));
    const data = await response.json();

    expect(typeof data[0].fechaCreacion).toBe('string');
    expect(data[0].fechaCreacion).toBe(mockContacts[0].fechaCreacion.toISOString());
  });

  it('debe ignorar query params desconocidos', async () => {
    (prisma.contact.findMany as any).mockResolvedValue(mockContacts);

    await GET(mockRequest('https://volkern.app/api/contacts?unknown=foo&invalid=bar'));

    // Solo debe filtrar por tenantId
    expect(prisma.contact.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: 'test-tenant-id' },
      }),
    );
  });
});

// ─── POST Tests ────────────────────────────────────────────────────────────

describe('POST /api/contacts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Validación ──────────────────────────────────────────────────────────

  it('debe devolver 400 si el nombre no se envía', async () => {
    const response = await POST(
      mockRequest('https://volkern.app/api/contacts', {
        email: 'test@test.com',
      }),
    );

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe('Datos inválidos');
    expect(prisma.contact.create).not.toHaveBeenCalled();
  });

  it('debe devolver 400 si el email es inválido', async () => {
    const response = await POST(
      mockRequest('https://volkern.app/api/contacts', {
        nombre: 'Test',
        email: 'email-invalido',
      }),
    );

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe('Datos inválidos');
    expect(data.details).toBeDefined();
  });

  it('debe devolver 400 si linkedin no es URL válida', async () => {
    const response = await POST(
      mockRequest('https://volkern.app/api/contacts', {
        nombre: 'Test',
        email: 'test@test.com',
        linkedin: 'no-es-url',
      }),
    );

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe('Datos inválidos');
  });

  // ── Creación ──────────────────────────────────────────────────────────

  it('debe crear un nuevo contacto con campos requeridos', async () => {
    (prisma.contact.findFirst as any).mockResolvedValue(null);
    (prisma.contact.create as any).mockResolvedValue({
      id: 'contact-new',
      nombre: 'Pedro Martínez',
      email: 'pedro@example.com',
      tipo: 'person',
      company: null,
    });

    const response = await POST(
      mockRequest('https://volkern.app/api/contacts', {
        nombre: 'Pedro Martínez',
        email: 'pedro@example.com',
      }),
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.nombre).toBe('Pedro Martínez');
    expect(data.email).toBe('pedro@example.com');
  });

  it('debe usar tipo person por defecto si no se envía', async () => {
    (prisma.contact.findFirst as any).mockResolvedValue(null);
    (prisma.contact.create as any).mockResolvedValue({ id: 'contact-default' });

    await POST(
      mockRequest('https://volkern.app/api/contacts', {
        nombre: 'Default Test',
        email: 'default@test.com',
      }),
    );

    expect(prisma.contact.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ tipo: 'person' }),
      }),
    );
  });

  it('debe crear contacto con todos los campos opcionales', async () => {
    (prisma.contact.findFirst as any).mockResolvedValue(null);
    (prisma.contact.create as any).mockResolvedValue({ id: 'contact-full' });

    const response = await POST(
      mockRequest('https://volkern.app/api/contacts', {
        nombre: 'Completo Test',
        email: 'completo@test.com',
        telefono: '+34 600 123 456',
        tipo: 'person',
        companyId: 'cl00000000000000000000001',
        cargo: 'CEO',
        ubicacion: 'Valencia',
        linkedin: 'https://linkedin.com/in/completo',
        notas: 'Contacto completo de prueba',
        tags: 'vip,cliente',
      }),
    );

    expect(response.status).toBe(200);
    expect(prisma.contact.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          nombre: 'Completo Test',
          email: 'completo@test.com',
          telefono: '+34 600 123 456',
          tipo: 'person',
          companyId: 'cl00000000000000000000001',
          cargo: 'CEO',
          ubicacion: 'Valencia',
          linkedin: 'https://linkedin.com/in/completo',
          notas: 'Contacto completo de prueba',
          tags: 'vip,cliente',
          tenantId: 'test-tenant-id',
        }),
      }),
    );
  });

  it('debe incluir company en el resultado del create', async () => {
    (prisma.contact.findFirst as any).mockResolvedValue(null);
    (prisma.contact.create as any).mockResolvedValue({ id: 'contact-inc' });

    await POST(
      mockRequest('https://volkern.app/api/contacts', {
        nombre: 'Include Test',
        email: 'include@test.com',
      }),
    );

    expect(prisma.contact.create).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          company: { select: { id: true, nombre: true } },
        }),
      }),
    );
  });

  // ── Dedup por email ────────────────────────────────────────────────────

  it('debe devolver 400 si el email ya existe', async () => {
    (prisma.contact.findFirst as any).mockResolvedValue({
      id: 'contact-exist',
      email: 'existente@test.com',
    });

    const response = await POST(
      mockRequest('https://volkern.app/api/contacts', {
        nombre: 'Duplicado',
        email: 'existente@test.com',
      }),
    );

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.success).toBe(false);
    expect(data.error).toBe('Ya existe un contacto con este email');
    expect(prisma.contact.create).not.toHaveBeenCalled();
  });

  it('debe crear contacto si el email no existe (findFirst null)', async () => {
    (prisma.contact.findFirst as any).mockResolvedValue(null);
    (prisma.contact.create as any).mockResolvedValue({
      id: 'contact-ok',
      nombre: 'Sin Duplicado',
      email: 'nuevo@test.com',
    });

    const response = await POST(
      mockRequest('https://volkern.app/api/contacts', {
        nombre: 'Sin Duplicado',
        email: 'nuevo@test.com',
      }),
    );

    expect(response.status).toBe(200);
    expect(prisma.contact.create).toHaveBeenCalled();
  });

  // ── Audit ──────────────────────────────────────────────────────────────

  it('debe llamar a AuditService.log tras crear contacto', async () => {
    (prisma.contact.findFirst as any).mockResolvedValue(null);
    (prisma.contact.create as any).mockResolvedValue({
      id: 'contact-audit',
      nombre: 'Audit Test',
      email: 'audit@test.com',
      tipo: 'person',
    });

    const { AuditService } = await import('@/lib/audit-service');

    await POST(
      mockRequest('https://volkern.app/api/contacts', {
        nombre: 'Audit Test',
        email: 'audit@test.com',
      }),
    );

    expect(AuditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'test-tenant-id',
        userId: 'test-user-id',
        action: 'crear',
        entity: 'contact',
        entityId: 'contact-audit',
        description: expect.stringContaining('Audit Test'),
      }),
    );
  });

  // ── Usage tracking ─────────────────────────────────────────────────────

  it('debe llamar a incrementUsage tras crear contacto', async () => {
    (prisma.contact.findFirst as any).mockResolvedValue(null);
    (prisma.contact.create as any).mockResolvedValue({ id: 'contact-usage' });

    const { incrementUsage } = await import('@/lib/subscription');

    await POST(
      mockRequest('https://volkern.app/api/contacts', {
        nombre: 'Usage Test',
        email: 'usage@test.com',
      }),
    );

    expect(incrementUsage).toHaveBeenCalledWith('test-tenant-id', 'contacts', 1);
  });

  it('debe continuar aunque incrementUsage falle (catch silencioso)', async () => {
    (prisma.contact.findFirst as any).mockResolvedValue(null);
    (prisma.contact.create as any).mockResolvedValue({
      id: 'contact-usage-fail',
      nombre: 'Usage Fail',
    });

    const { incrementUsage } = await import('@/lib/subscription');
    (incrementUsage as any).mockRejectedValueOnce(new Error('Usage tracking error'));

    const response = await POST(
      mockRequest('https://volkern.app/api/contacts', {
        nombre: 'Usage Fail',
        email: 'usagefail@test.com',
      }),
    );

    // El contacto debe crearse igual aunque usage tracking falle
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.nombre).toBe('Usage Fail');
  });

  // ── Errores ────────────────────────────────────────────────────────────

  it('debe devolver 500 si Prisma falla en create', async () => {
    (prisma.contact.findFirst as any).mockResolvedValue(null);
    (prisma.contact.create as any).mockRejectedValue(new Error('DB error'));

    const response = await POST(
      mockRequest('https://volkern.app/api/contacts', {
        nombre: 'Error Test',
        email: 'error@test.com',
      }),
    );

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toBe('Error al crear contacto');
  });

  it('debe devolver 500 si request.json() falla (body inválido)', async () => {
    const req = new Request('https://volkern.app/api/contacts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{ broken json',
    });

    const response = await POST(req, undefined);

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toBe('Error al crear contacto');
  });

  // ── Aislamiento ────────────────────────────────────────────────────────

  it('debe crear el contacto con tenantId del auth', async () => {
    (prisma.contact.findFirst as any).mockResolvedValue(null);
    (prisma.contact.create as any).mockResolvedValue({ id: 'contact-tenant' });

    await POST(
      mockRequest('https://volkern.app/api/contacts', {
        nombre: 'Tenant Test',
        email: 'tenant@test.com',
      }),
    );

    expect(prisma.contact.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ tenantId: 'test-tenant-id' }),
      }),
    );
  });

  // ── Catch silencioso: audit ────────────────────────────────────────────

  it('debe devolver 500 si AuditService.log falla (no hay catch silencioso)', async () => {
    (prisma.contact.findFirst as any).mockResolvedValue(null);
    (prisma.contact.create as any).mockResolvedValue({
      id: 'contact-audit-fail',
      nombre: 'Audit Fail',
    });

    const { AuditService } = await import('@/lib/audit-service');
    (AuditService.log as any).mockRejectedValueOnce(new Error('Audit error'));

    const response = await POST(
      mockRequest('https://volkern.app/api/contacts', {
        nombre: 'Audit Fail',
        email: 'auditfail@test.com',
      }),
    );

    // AuditService.log está dentro del try principal, no hay catch alrededor
    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toBe('Error al crear contacto');
  });
});
