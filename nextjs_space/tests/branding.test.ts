import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Dynamic auth config ──────────────────────────────────────────────────
// Permite cambiar el accountType/role por test (403 vs éxito)
// Usamos vi.hoisted() para evitar TDZ con el hoisting de vi.mock()
const currentAccountType = vi.hoisted(() => ({ value: 'AGENCY' }));

vi.mock('@/lib/db', () => ({
  prisma: {
    tenant: {
      update: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}));

vi.mock('@/lib/api-key-auth', () => ({
  withTenantAuth: (handler: any) => {
    return async (request: Request, _context?: any) => {
      const isSuperadmin = currentAccountType.value === 'SUPERADMIN';
      return handler(request, {
        valid: true,
        tenant: { id: 'test-tenant-id', nombre: 'Test Agency', slug: 'test-agency', plan: 'growth' },
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

import { PATCH, GET } from '@/app/api/agency/settings/branding/route';
import { prisma } from '@/lib/db';

// ─── Helpers ──────────────────────────────────────────────────────────────

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

const UPDATED_BRANDING = {
  logoUrl: 'https://cdn.volkern.com/logos/agency.png',
  primaryColor: '#7C3AED',
  showPoweredBy: true,
  customFooterText: 'Hecho por Agencia Alfa',
};

// ─── PATCH Tests ──────────────────────────────────────────────────────────

describe('PATCH /api/agency/settings/branding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentAccountType.value = 'AGENCY';
  });

  // ── Autorización ──────────────────────────────────────────────────────

  it('debe devolver 403 si el usuario no es AGENCY ni Superadmin', async () => {
    currentAccountType.value = 'BUSINESS';

    const response = await PATCH(
      mockRequest('https://volkern.app/api/agency/settings/branding', {
        logo_url: 'https://example.com/logo.png',
      }),
    );

    currentAccountType.value = 'AGENCY'; // restore

    expect(response.status).toBe(403);
    const json = await response.json();
    expect(json.error).toContain('Solo disponible para cuentas de Agencia');
    expect(prisma.tenant.update).not.toHaveBeenCalled();
  });

  it('debe permitir a Superadmin aunque no sea AGENCY', async () => {
    currentAccountType.value = 'SUPERADMIN';
    (prisma.tenant.update as any).mockResolvedValue({
      id: 'test-tenant-id',
      brandingConfig: UPDATED_BRANDING,
    });

    const response = await PATCH(
      mockRequest('https://volkern.app/api/agency/settings/branding', {
        logo_url: 'https://example.com/logo.png',
      }),
    );

    expect(response.status).toBe(200);
    expect(prisma.tenant.update).toHaveBeenCalled();
  });

  // ── Validación Zod ─────────────────────────────────────────────────────

  it('debe devolver 400 si el body incluye campos con tipo incorrecto', async () => {
    const response = await PATCH(
      mockRequest('https://volkern.app/api/agency/settings/branding', {
        show_powered_by: 'no-boolean',
      }),
    );

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error).toBe('Datos de branding inválidos');
    expect(json.details).toBeDefined();
    expect(prisma.tenant.update).not.toHaveBeenCalled();
  });

  it('debe aceptar body vacío {} y usar valores por defecto', async () => {
    (prisma.tenant.update as any).mockResolvedValue({
      id: 'test-tenant-id',
      brandingConfig: { showPoweredBy: true },
    });

    const response = await PATCH(
      mockRequest('https://volkern.app/api/agency/settings/branding', {}),
    );

    expect(response.status).toBe(200);
    const callData = (prisma.tenant.update as any).mock.calls[0][0].data;
    expect(callData.brandingConfig.showPoweredBy).toBe(true);
  });

  // ── Actualización exitosa ─────────────────────────────────────────────

  it('debe actualizar branding con todos los campos y devolver success + branding', async () => {
    (prisma.tenant.update as any).mockResolvedValue({
      id: 'test-tenant-id',
      brandingConfig: UPDATED_BRANDING,
    });

    const response = await PATCH(
      mockRequest('https://volkern.app/api/agency/settings/branding', {
        logo_url: 'https://cdn.volkern.com/logos/agency.png',
        primary_color: '#7C3AED',
        show_powered_by: true,
        custom_footer_text: 'Hecho por Agencia Alfa',
      }),
    );

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.success).toBe(true);
    expect(json.branding).toEqual(UPDATED_BRANDING);
  });

  it('debe construir brandingConfig correctamente en prisma.tenant.update', async () => {
    (prisma.tenant.update as any).mockResolvedValue({
      id: 'test-tenant-id',
      brandingConfig: UPDATED_BRANDING,
    });

    await PATCH(
      mockRequest('https://volkern.app/api/agency/settings/branding', {
        logo_url: 'https://cdn.volkern.com/logos/agency.png',
        primary_color: '#7C3AED',
        show_powered_by: true,
        custom_footer_text: 'Hecho por Agencia Alfa',
      }),
    );

    expect(prisma.tenant.update).toHaveBeenCalledWith({
      where: { id: 'test-tenant-id' },
      data: {
        brandingConfig: {
          logoUrl: 'https://cdn.volkern.com/logos/agency.png',
          primaryColor: '#7C3AED',
          showPoweredBy: true,
          customFooterText: 'Hecho por Agencia Alfa',
        },
      },
    });
  });

  it('debe actualizar solo los campos enviados (parcial)', async () => {
    (prisma.tenant.update as any).mockResolvedValue({
      id: 'test-tenant-id',
      brandingConfig: { logoUrl: 'https://example.com/new-logo.png' },
    });

    await PATCH(
      mockRequest('https://volkern.app/api/agency/settings/branding', {
        logo_url: 'https://example.com/new-logo.png',
      }),
    );

    expect(prisma.tenant.update).toHaveBeenCalledWith({
      where: { id: 'test-tenant-id' },
      data: {
        brandingConfig: {
          logoUrl: 'https://example.com/new-logo.png',
          primaryColor: undefined,
          showPoweredBy: true,
          customFooterText: undefined,
        },
      },
    });
  });

  it('debe usar showPoweredBy: true por defecto si no se envía show_powered_by', async () => {
    (prisma.tenant.update as any).mockResolvedValue({
      id: 'test-tenant-id',
      brandingConfig: {},
    });

    await PATCH(
      mockRequest('https://volkern.app/api/agency/settings/branding', {
        primary_color: '#FF0000',
      }),
    );

    const callData = (prisma.tenant.update as any).mock.calls[0][0].data;
    expect(callData.brandingConfig.showPoweredBy).toBe(true);
  });

  it('debe respetar show_powered_by: false cuando se envía explícitamente', async () => {
    (prisma.tenant.update as any).mockResolvedValue({
      id: 'test-tenant-id',
      brandingConfig: { showPoweredBy: false },
    });

    await PATCH(
      mockRequest('https://volkern.app/api/agency/settings/branding', {
        show_powered_by: false,
      }),
    );

    const callData = (prisma.tenant.update as any).mock.calls[0][0].data;
    expect(callData.brandingConfig.showPoweredBy).toBe(false);
  });

  it('debe actualizar usando el tenant.id del auth (aislamiento)', async () => {
    (prisma.tenant.update as any).mockResolvedValue({
      id: 'test-tenant-id',
      brandingConfig: {},
    });

    await PATCH(
      mockRequest('https://volkern.app/api/agency/settings/branding', {
        logo_url: 'https://example.com/logo.png',
      }),
    );

    expect(prisma.tenant.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'test-tenant-id' },
      }),
    );
  });

  // ── Errores ───────────────────────────────────────────────────────────

  it('debe devolver 500 si Prisma falla', async () => {
    (prisma.tenant.update as any).mockRejectedValue(new Error('DB connection error'));

    const response = await PATCH(
      mockRequest('https://volkern.app/api/agency/settings/branding', {
        logo_url: 'https://example.com/logo.png',
      }),
    );

    expect(response.status).toBe(500);
    const json = await response.json();
    expect(json.error).toBe('Error al actualizar configuración de marca');
  });

  it('debe devolver 500 si request.json() falla (body inválido)', async () => {
    const req = new Request('https://volkern.app/api/agency/settings/branding', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: '{ broken json',
    });

    const response = await PATCH(req);

    expect(response.status).toBe(500);
    const json = await response.json();
    expect(json.error).toBe('Error al actualizar configuración de marca');
  });
});

// ─── GET Tests ────────────────────────────────────────────────────────────

describe('GET /api/agency/settings/branding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentAccountType.value = 'AGENCY';
  });

  it('debe devolver brandingConfig cuando existe', async () => {
    (prisma.tenant.findUnique as any).mockResolvedValue({
      brandingConfig: UPDATED_BRANDING,
    });

    const response = await GET(mockRequest('https://volkern.app/api/agency/settings/branding'));

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json).toEqual(UPDATED_BRANDING);
  });

  it('debe devolver objeto vacío cuando no hay brandingConfig', async () => {
    (prisma.tenant.findUnique as any).mockResolvedValue({ brandingConfig: null });

    const response = await GET(mockRequest('https://volkern.app/api/agency/settings/branding'));

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json).toEqual({});
  });

  it('debe devolver objeto vacío cuando el tenant no existe', async () => {
    (prisma.tenant.findUnique as any).mockResolvedValue(null);

    const response = await GET(mockRequest('https://volkern.app/api/agency/settings/branding'));

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json).toEqual({});
  });

  it('debe hacer query con tenant.id del auth (aislamiento)', async () => {
    (prisma.tenant.findUnique as any).mockResolvedValue({ brandingConfig: null });

    await GET(mockRequest('https://volkern.app/api/agency/settings/branding'));

    expect(prisma.tenant.findUnique).toHaveBeenCalledWith({
      where: { id: 'test-tenant-id' },
      select: { brandingConfig: true },
    });
  });
});
