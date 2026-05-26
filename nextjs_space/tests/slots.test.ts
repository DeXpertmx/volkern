import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Dynamic auth config ──────────────────────────────────────────────────
const currentAccountType = vi.hoisted(() => ({ value: 'AGENCY' }));

vi.mock('@/lib/db', () => ({
  prisma: {
    tenant: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
    },
  },
}));

vi.mock('@/lib/api-key-auth', () => ({
  withTenantAuth: (handler: any) => {
    return async (request: Request, _context?: any) => {
      const isSuperadmin = currentAccountType.value === 'SUPERADMIN';
      return handler(request, {
        valid: true,
        tenant: { id: 'test-agency-id', nombre: 'Test Agency', slug: 'test-agency', plan: 'growth' },
        user: {
          id: 'test-user-id',
          name: 'Test User',
          email: 'test@test.com',
          role: { nombre: isSuperadmin ? 'Superadmin' : 'Agency Admin', permisos: {} },
          accountType: currentAccountType.value,
        },
      });
    };
  },
}));

// ─── Imports ───────────────────────────────────────────────────────────────

import { GET, POST } from '@/app/api/agency/slots/route';
import { prisma } from '@/lib/db';

// ─── Helpers ──────────────────────────────────────────────────────────────

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

const MOCK_SLOTS = [
  {
    id: 'slot-1',
    nombre: 'Cliente Alpha',
    slug: 'cliente-alpha',
    plan: 'agency-slot',
    estado: 'activo',
    fechaCreacion: '2026-05-01T00:00:00.000Z',
    dbUrl: null,
    _count: { leads: 5, users: 2 },
  },
  {
    id: 'slot-2',
    nombre: 'Cliente Beta',
    slug: 'cliente-beta',
    plan: 'agency-slot',
    estado: 'activo',
    fechaCreacion: '2026-05-15T00:00:00.000Z',
    dbUrl: null,
    _count: { leads: 0, users: 1 },
  },
];

// ─── GET Tests ─────────────────────────────────────────────────────────────

describe('GET /api/agency/slots', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentAccountType.value = 'AGENCY';
  });

  it('debe devolver 403 si el usuario no es AGENCY ni Superadmin', async () => {
    currentAccountType.value = 'BUSINESS';

    const response = await GET(mockRequest('https://volkern.app/api/agency/slots'));
    currentAccountType.value = 'AGENCY';

    expect(response.status).toBe(403);
    const json = await response.json();
    expect(json.error).toContain('Solo disponible para cuentas de Agencia');
    expect(prisma.tenant.findMany).not.toHaveBeenCalled();
  });

  it('debe permitir a Superadmin acceder', async () => {
    currentAccountType.value = 'SUPERADMIN';
    (prisma.tenant.findMany as any).mockResolvedValue(MOCK_SLOTS);

    const response = await GET(mockRequest('https://volkern.app/api/agency/slots'));

    expect(response.status).toBe(200);
    expect(prisma.tenant.findMany).toHaveBeenCalled();
  });

  it('debe devolver lista de slots cuando existen', async () => {
    (prisma.tenant.findMany as any).mockResolvedValue(MOCK_SLOTS);

    const response = await GET(mockRequest('https://volkern.app/api/agency/slots'));

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json).toHaveLength(2);
    expect(json[0].nombre).toBe('Cliente Alpha');
    expect(json[0]._count.leads).toBe(5);
    expect(json[1].nombre).toBe('Cliente Beta');
  });

  it('debe devolver array vacío cuando no hay slots', async () => {
    (prisma.tenant.findMany as any).mockResolvedValue([]);

    const response = await GET(mockRequest('https://volkern.app/api/agency/slots'));

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json).toEqual([]);
  });

  it('debe hacer query con parentId del auth tenant (aislamiento)', async () => {
    (prisma.tenant.findMany as any).mockResolvedValue([]);

    await GET(mockRequest('https://volkern.app/api/agency/slots'));

    expect(prisma.tenant.findMany).toHaveBeenCalledWith({
      where: { parentId: 'test-agency-id' },
      select: {
        id: true,
        nombre: true,
        slug: true,
        plan: true,
        estado: true,
        fechaCreacion: true,
        dbUrl: true,
        enabledModules: true,
        _count: {
          select: {
            leads: true,
            users: true,
          },
        },
      },
    });
  });
});

// ─── POST Tests ────────────────────────────────────────────────────────────

describe('POST /api/agency/slots', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentAccountType.value = 'AGENCY';
  });

  // ── Autorización ──────────────────────────────────────────────────────

  it('debe devolver 403 si el usuario no es AGENCY ni Superadmin', async () => {
    currentAccountType.value = 'BUSINESS';

    const response = await POST(
      mockRequest('https://volkern.app/api/agency/slots', {
        client_name: 'Cliente X',
        admin_email: 'admin@cliente.com',
      }),
    );
    currentAccountType.value = 'AGENCY';

    expect(response.status).toBe(403);
    const json = await response.json();
    expect(json.error).toContain('Solo disponible para cuentas de Agencia');
    expect(prisma.tenant.create).not.toHaveBeenCalled();
  });

  it('debe permitir a Superadmin crear slots', async () => {
    currentAccountType.value = 'SUPERADMIN';
    (prisma.tenant.findUnique as any).mockResolvedValue({ maxSlots: 10, brandingConfig: {} });
    (prisma.tenant.count as any).mockResolvedValue(1);
    (prisma.tenant.create as any).mockResolvedValue({
      id: 'new-slot-id',
      nombre: 'Cliente X',
      slug: 'cliente-x-abc123',
      accountType: 'BUSINESS',
    });

    const response = await POST(
      mockRequest('https://volkern.app/api/agency/slots', {
        client_name: 'Cliente X',
        admin_email: 'admin@cliente.com',
      }),
    );

    expect(response.status).toBe(201);
    expect(prisma.tenant.create).toHaveBeenCalled();
  });

  // ── Validación de campos requeridos ─────────────────────────────────────

  it('debe devolver 400 si falta client_name', async () => {
    const response = await POST(
      mockRequest('https://volkern.app/api/agency/slots', {
        admin_email: 'admin@cliente.com',
      }),
    );

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error).toBe('Datos del slot inválidos');
    expect(json.details).toBeDefined();
    expect(json.details.client_name?._errors).toBeDefined();
    expect(prisma.tenant.create).not.toHaveBeenCalled();
  });

  it('debe devolver 400 si falta admin_email', async () => {
    const response = await POST(
      mockRequest('https://volkern.app/api/agency/slots', {
        client_name: 'Cliente X',
      }),
    );

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error).toBe('Datos del slot inválidos');
    expect(json.details).toBeDefined();
    expect(json.details.admin_email?._errors).toBeDefined();
    expect(prisma.tenant.create).not.toHaveBeenCalled();
  });

  it('debe devolver 400 si ambos campos faltan', async () => {
    const response = await POST(
      mockRequest('https://volkern.app/api/agency/slots', {}),
    );

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error).toBe('Datos del slot inválidos');
    expect(json.details).toBeDefined();
  });

  it('debe devolver 400 si admin_email no es un email válido', async () => {
    const response = await POST(
      mockRequest('https://volkern.app/api/agency/slots', {
        client_name: 'Cliente X',
        admin_email: 'no-es-un-email',
      }),
    );

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error).toBe('Datos del slot inválidos');
    expect(json.details.admin_email?._errors).toBeDefined();
    expect(prisma.tenant.create).not.toHaveBeenCalled();
  });

  // ── Límite de slots ──────────────────────────────────────────────────

  it('debe devolver 403 si se alcanzó el límite de slots', async () => {
    (prisma.tenant.findUnique as any).mockResolvedValue({ maxSlots: 5, brandingConfig: {} });
    (prisma.tenant.count as any).mockResolvedValue(5); // igual al límite

    const response = await POST(
      mockRequest('https://volkern.app/api/agency/slots', {
        client_name: 'Cliente X',
        admin_email: 'admin@cliente.com',
      }),
    );

    expect(response.status).toBe(403);
    const json = await response.json();
    expect(json.error).toContain('Límite de slots alcanzado');
    expect(prisma.tenant.create).not.toHaveBeenCalled();
  });

  it('debe devolver 403 si maxSlots es 0 y ya hay slots', async () => {
    (prisma.tenant.findUnique as any).mockResolvedValue({ maxSlots: 0, brandingConfig: {} });
    (prisma.tenant.count as any).mockResolvedValue(1); // 1 >= 0

    const response = await POST(
      mockRequest('https://volkern.app/api/agency/slots', {
        client_name: 'Cliente X',
        admin_email: 'admin@cliente.com',
      }),
    );

    expect(response.status).toBe(403);
  });

  // ── Creación exitosa ─────────────────────────────────────────────────

  it('debe crear slot correctamente y devolver 201 con los datos', async () => {
    (prisma.tenant.findUnique as any).mockResolvedValue({ maxSlots: 10, brandingConfig: { primaryColor: '#7C3AED' } });
    (prisma.tenant.count as any).mockResolvedValue(1);

    const newSlot = {
      id: 'new-slot-1',
      nombre: 'Nuevo Cliente',
      slug: 'nuevo-cliente-abc123',
      accountType: 'BUSINESS',
      parentId: 'test-agency-id',
      billingEmail: 'admin@cliente.com',
      brandingConfig: { primaryColor: '#7C3AED' },
      enabledModules: ['CRM'],
      plan: 'agency-slot',
      estado: 'activo',
    };
    (prisma.tenant.create as any).mockResolvedValue(newSlot);

    const response = await POST(
      mockRequest('https://volkern.app/api/agency/slots', {
        client_name: 'Nuevo Cliente',
        admin_email: 'admin@cliente.com',
      }),
    );

    expect(response.status).toBe(201);
    const json = await response.json();
    expect(json.id).toBe('new-slot-1');
    expect(json.nombre).toBe('Nuevo Cliente');
    expect(json.accountType).toBe('BUSINESS');
    expect(json.plan).toBe('agency-slot');
  });

  it('debe crear slot con accountType BUSINESS y parentId del auth', async () => {
    (prisma.tenant.findUnique as any).mockResolvedValue({ maxSlots: 10, brandingConfig: {} });
    (prisma.tenant.count as any).mockResolvedValue(0);
    (prisma.tenant.create as any).mockResolvedValue({ id: 'new-slot' });

    await POST(
      mockRequest('https://volkern.app/api/agency/slots', {
        client_name: 'Cliente Test',
        admin_email: 'admin@test.com',
      }),
    );

    expect(prisma.tenant.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          accountType: 'BUSINESS',
          parentId: 'test-agency-id',
          plan: 'agency-slot',
          billingEmail: 'admin@test.com',
        }),
      }),
    );
  });

  it('debe heredar brandingConfig de la agencia', async () => {
    (prisma.tenant.findUnique as any).mockResolvedValue({
      maxSlots: 10,
      brandingConfig: { logoUrl: 'https://agency.com/logo.png', primaryColor: '#000' },
    });
    (prisma.tenant.count as any).mockResolvedValue(0);
    (prisma.tenant.create as any).mockResolvedValue({ id: 'new-slot' });

    await POST(
      mockRequest('https://volkern.app/api/agency/slots', {
        client_name: 'Cliente Test',
        admin_email: 'admin@test.com',
      }),
    );

    expect(prisma.tenant.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          brandingConfig: { logoUrl: 'https://agency.com/logo.png', primaryColor: '#000' },
        }),
      }),
    );
  });

  it('debe usar modules_enabled del body cuando se envía (normalizado a uppercase)', async () => {
    (prisma.tenant.findUnique as any).mockResolvedValue({ maxSlots: 10, brandingConfig: {} });
    (prisma.tenant.count as any).mockResolvedValue(0);
    (prisma.tenant.create as any).mockResolvedValue({ id: 'new-slot' });

    await POST(
      mockRequest('https://volkern.app/api/agency/slots', {
        client_name: 'Cliente Test',
        admin_email: 'admin@test.com',
        modules_enabled: ['crm', 'POS', 'ia_agencia'],
      }),
    );

    expect(prisma.tenant.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          enabledModules: ['CRM', 'POS', 'IA_AGENCIA'],
        }),
      }),
    );
  });

  it('debe usar CRM como default si no se envía modules_enabled', async () => {
    (prisma.tenant.findUnique as any).mockResolvedValue({ maxSlots: 10, brandingConfig: {} });
    (prisma.tenant.count as any).mockResolvedValue(0);
    (prisma.tenant.create as any).mockResolvedValue({ id: 'new-slot' });

    await POST(
      mockRequest('https://volkern.app/api/agency/slots', {
        client_name: 'Cliente Test',
        admin_email: 'admin@test.com',
      }),
    );

    expect(prisma.tenant.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          enabledModules: ['CRM'],
        }),
      }),
    );
  });

  it('debe generar slug único con sufijo aleatorio', async () => {
    (prisma.tenant.findUnique as any).mockResolvedValue({ maxSlots: 10, brandingConfig: {} });
    (prisma.tenant.count as any).mockResolvedValue(0);
    (prisma.tenant.create as any).mockResolvedValue({ id: 'new-slot' });

    await POST(
      mockRequest('https://volkern.app/api/agency/slots', {
        client_name: 'Mi Cliente SAC',
        admin_email: 'admin@cliente.com',
      }),
    );

    const callData = (prisma.tenant.create as any).mock.calls[0][0].data;
    expect(callData.slug).toMatch(/^mi-cliente-sac-/);
    expect(callData.slug.length).toBeGreaterThan('mi-cliente-sac-'.length);
  });

  // ── Errores ───────────────────────────────────────────────────────────

  it('debe devolver 500 si Prisma falla en create', async () => {
    (prisma.tenant.findUnique as any).mockResolvedValue({ maxSlots: 10, brandingConfig: {} });
    (prisma.tenant.count as any).mockResolvedValue(0);
    (prisma.tenant.create as any).mockRejectedValue(new Error('DB error'));

    const response = await POST(
      mockRequest('https://volkern.app/api/agency/slots', {
        client_name: 'Cliente Test',
        admin_email: 'admin@test.com',
      }),
    );

    expect(response.status).toBe(500);
    const json = await response.json();
    expect(json.error).toBe('Error al crear el slot del cliente');
  });

  it('debe devolver 500 si request.json() falla (body inválido)', async () => {
    const req = new Request('https://volkern.app/api/agency/slots', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{ broken json',
    });

    const response = await POST(req);

    expect(response.status).toBe(500);
    const json = await response.json();
    expect(json.error).toBe('Error al crear el slot del cliente');
  });
});
