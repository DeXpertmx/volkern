import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ─── Auth mock (dynamic per test) ──────────────────────────────────
const currentAccountType = vi.hoisted(() => ({ value: 'AGENCY' }));
const currentRoleName = vi.hoisted(() => ({ value: 'User' }));
const isSuperadmin = vi.hoisted(() => ({ value: false }));

vi.mock('@/lib/api-key-auth', () => ({
  withTenantAuth: (handler: any) => {
    return async (req: Request, params?: any) => {
      const auth = {
        valid: true,
        tenant: { id: 'agency-1', nombre: 'Test Agency', slug: 'test-agency', plan: 'pro-accounting', accountType: currentAccountType.value },
        user: { id: 'u1', name: 'Admin', email: 'admin@test.com', tenantId: 'agency-1', roleId: 'r1', role: { id: 'r1', nombre: currentRoleName.value }, accountType: currentAccountType.value },
      };
      return handler(req, auth, params);
    };
  },
}));

// ─── Prisma mock ──────────────────────────────────────────────────

const mockFindMany = vi.hoisted(() => vi.fn());
const mockFindUnique = vi.hoisted(() => vi.fn());
const mockCount = vi.hoisted(() => vi.fn());
const mockCreate = vi.hoisted(() => vi.fn());

vi.mock('@/lib/accounting/initializer', () => ({
  AccountingInitializer: {
    initializeTenant: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    tenant: {
      findMany: mockFindMany,
      findUnique: mockFindUnique,
      count: mockCount,
      create: mockCreate,
    },
    // El alta del slot PROVISIONA el acceso del administrador del cliente
    // (catálogo básico de roles + owner invitado): sin estos modelos el camino
    // feliz reventaba en 500 y los tests solo ejercitaban los rechazos.
    role: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue({ id: 'role_admin', nombre: 'Admin' }),
      create: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
    },
    user: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({ id: 'user_invitado' }),
      update: vi.fn().mockResolvedValue({}),
    },
  },
  // El catálogo del slot se lee de la base «global» (sin contexto de tenant).
  globalPrisma: {
    tenant: { findUnique: vi.fn().mockResolvedValue({ nombre: 'Test Agency' }) },
  },
  dbContext: {
    run: (_opts: any, fn: () => any) => fn(),
  },
}));

// El email de aceptación no es lo que se mide aquí (y no debe salir de verdad).
vi.mock('@/lib/emails/invitacion', () => ({
  enviarEmailInvitacion: vi.fn().mockResolvedValue({ success: true }),
}));

// ─── Dynamic imports ──────────────────────────────────────────────

async function getHandler(method: 'GET' | 'POST') {
  const mod = await import('@/app/api/accounting/slots/route');
  return method === 'GET' ? mod.GET : mod.POST;
}

// ─── Helpers ──────────────────────────────────────────────────────

function createRequest(method: string, body?: any): NextRequest {
  const url = new URL('http://localhost:3000/api/accounting/slots');
  return {
    url: url.toString(),
    method,
    json: async () => body,
    headers: new Headers({ 'content-type': 'application/json' }),
  } as unknown as NextRequest;
}

// ─── Tests ────────────────────────────────────────────────────────

describe('GET /api/accounting/slots', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentAccountType.value = 'AGENCY';
    currentRoleName.value = 'User';
  });

  it('debe retornar 403 si el tenant no es AGENCY', async () => {
    currentAccountType.value = 'BUSINESS';
    const handler = await getHandler('GET');
    const res = await handler(createRequest('GET'));
    expect(res.status).toBe(403);
  });

  it('debe permitir acceso a Superadmin', async () => {
    currentRoleName.value = 'Superadmin';
    mockFindMany.mockResolvedValue([]);
    const handler = await getHandler('GET');
    const res = await handler(createRequest('GET'));
    expect(res.status).toBe(200);
  });

  it('debe retornar lista de slots cuando existen', async () => {
    const mockSlots = [
      { id: 's1', nombre: 'Cliente 1', slug: 'cliente-1', plan: 'accounting-slot', estado: 'activo', fechaCreacion: new Date(), enabledModules: ['CRM', 'FINANZAS'], _count: { leads: 5, users: 2 } },
      { id: 's2', nombre: 'Cliente 2', slug: 'cliente-2', plan: 'accounting-slot', estado: 'activo', fechaCreacion: new Date(), enabledModules: ['CRM'], _count: { leads: 0, users: 1 } },
    ];
    mockFindMany.mockResolvedValue(mockSlots);
    const handler = await getHandler('GET');
    const res = await handler(createRequest('GET'));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json).toHaveLength(2);
    expect(json[0].nombre).toBe('Cliente 1');
    expect(json[1].enabledModules).toEqual(['CRM']);
  });

  it('debe retornar array vacío cuando no hay slots', async () => {
    mockFindMany.mockResolvedValue([]);
    const handler = await getHandler('GET');
    const res = await handler(createRequest('GET'));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json).toEqual([]);
  });

  it('debe buscar slots con parentId del tenant autenticado', async () => {
    mockFindMany.mockResolvedValue([]);
    const handler = await getHandler('GET');
    await handler(createRequest('GET'));
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { parentId: 'agency-1' },
      })
    );
  });

  it('debe incluir enabledModules en el select del GET', async () => {
    mockFindMany.mockResolvedValue([]);
    const handler = await getHandler('GET');
    await handler(createRequest('GET'));
    const callArg = mockFindMany.mock.calls[0][0];
    expect(callArg.select).toHaveProperty('enabledModules');
  });
});

describe('POST /api/accounting/slots', () => {
  const validBody = { client_name: 'Cliente Test', admin_email: 'admin@cliente.com', modules_enabled: ['crm', 'finanzas'] };

  beforeEach(() => {
    vi.clearAllMocks();
    currentAccountType.value = 'AGENCY';
    currentRoleName.value = 'User';
    mockFindUnique.mockResolvedValue({ maxSlots: 5, brandingConfig: { primaryColor: '#059669' } });
    mockCount.mockResolvedValue(0);
    mockCreate.mockResolvedValue({ id: 'new-slot', nombre: 'Cliente Test', accountType: 'BUSINESS', plan: 'accounting-slot', enabledModules: ['CRM', 'FINANZAS'] });
  });

  it('debe retornar 403 si el tenant no es AGENCY', async () => {
    currentAccountType.value = 'BUSINESS';
    const handler = await getHandler('POST');
    const res = await handler(createRequest('POST', validBody));
    expect(res.status).toBe(403);
  });

  it('debe permitir acceso a Superadmin', async () => {
    currentRoleName.value = 'Superadmin';
    const handler = await getHandler('POST');
    const res = await handler(createRequest('POST', validBody));
    expect(res.status).toBe(201);
  });

  it('debe retornar 400 si falta client_name', async () => {
    const handler = await getHandler('POST');
    const res = await handler(createRequest('POST', { admin_email: 'admin@test.com' }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Datos del slot inválidos');
    expect(json.details).toBeDefined();
  });

  it('debe retornar 400 si falta admin_email', async () => {
    const handler = await getHandler('POST');
    const res = await handler(createRequest('POST', { client_name: 'Cliente' }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Datos del slot inválidos');
  });

  it('debe retornar 400 si admin_email no es email válido', async () => {
    const handler = await getHandler('POST');
    const res = await handler(createRequest('POST', { client_name: 'Cliente', admin_email: 'no-es-un-email' }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Datos del slot inválidos');
    expect(json.details.admin_email?._errors).toBeDefined();
  });

  it('debe retornar 400 si ambos campos faltan', async () => {
    const handler = await getHandler('POST');
    const res = await handler(createRequest('POST', {}));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Datos del slot inválidos');
  });

  it('debe retornar 403 si se alcanzó el límite de slots', async () => {
    mockFindUnique.mockResolvedValue({ maxSlots: 3, brandingConfig: {} });
    mockCount.mockResolvedValue(3);
    const handler = await getHandler('POST');
    const res = await handler(createRequest('POST', validBody));
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toContain('Límite de clientes alcanzado');
  });

  it('debe retornar 403 si maxSlots es 0', async () => {
    mockFindUnique.mockResolvedValue({ maxSlots: 0, brandingConfig: {} });
    mockCount.mockResolvedValue(0);
    const handler = await getHandler('POST');
    const res = await handler(createRequest('POST', validBody));
    expect(res.status).toBe(403);
  });

  it('debe crear slot correctamente y devolver 201', async () => {
    const handler = await getHandler('POST');
    const res = await handler(createRequest('POST', validBody));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.id).toBe('new-slot');
    expect(json.nombre).toBe('Cliente Test');
    expect(json.accountType).toBe('BUSINESS');
    expect(json.plan).toBe('accounting-slot');
  });

  it('debe asignar accountType BUSINESS y parentId del auth', async () => {
    const handler = await getHandler('POST');
    await handler(createRequest('POST', validBody));
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          accountType: 'BUSINESS',
          parentId: 'agency-1',
          plan: 'accounting-slot',
        })
      })
    );
  });

  it('debe heredar brandingConfig de la agencia y forzar showPoweredBy=true', async () => {
    mockFindUnique.mockResolvedValue({ maxSlots: 5, brandingConfig: { primaryColor: '#059669', logoUrl: 'https://ejemplo.com/logo.png', showPoweredBy: false } });
    const handler = await getHandler('POST');
    await handler(createRequest('POST', validBody));
    const createData = mockCreate.mock.calls[0][0].data;
    expect(createData.brandingConfig).toEqual({
      primaryColor: '#059669',
      logoUrl: 'https://ejemplo.com/logo.png',
      showPoweredBy: true, // Forzado
    });
  });

  it('debe crear brandingConfig con showPoweredBy=true si la agencia no tiene brandingConfig', async () => {
    mockFindUnique.mockResolvedValue({ maxSlots: 5, brandingConfig: null });
    const handler = await getHandler('POST');
    await handler(createRequest('POST', validBody));
    const createData = mockCreate.mock.calls[0][0].data;
    expect(createData.brandingConfig).toEqual({ showPoweredBy: true });
  });

  it('debe normalizar módulos a uppercase', async () => {
    const handler = await getHandler('POST');
    await handler(createRequest('POST', { client_name: 'Test', admin_email: 'a@b.com', modules_enabled: ['crm', 'finanzas', 'conciliacion'] }));
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          enabledModules: ['CRM', 'FINANZAS', 'CONCILIACION'],
        })
      })
    );
  });

  it('debe usar CRM como default si no se envía modules_enabled', async () => {
    const handler = await getHandler('POST');
    await handler(createRequest('POST', { client_name: 'Test', admin_email: 'a@b.com' }));
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          enabledModules: ['CRM'],
        })
      })
    );
  });

  it('debe generar slug único con sufijo aleatorio', async () => {
    const handler = await getHandler('POST');
    await handler(createRequest('POST', validBody));
    const createData = mockCreate.mock.calls[0][0].data;
    expect(createData.slug).toMatch(/^cliente-test-/);
    expect(createData.slug).not.toBe('cliente-test');
  });

  it('debe retornar 500 si Prisma lanza error', async () => {
    mockCreate.mockRejectedValue(new Error('DB Error'));
    const handler = await getHandler('POST');
    const res = await handler(createRequest('POST', validBody));
    expect(res.status).toBe(500);
  });

  it('debe retornar 500 si el body es JSON inválido', async () => {
    const req = {
      url: 'http://localhost:3000/api/accounting/slots',
      method: 'POST',
      json: async () => { throw new Error('Invalid JSON'); },
      headers: new Headers(),
    } as unknown as NextRequest;
    const handler = await getHandler('POST');
    const res = await handler(req);
    expect(res.status).toBe(500);
  });
});
