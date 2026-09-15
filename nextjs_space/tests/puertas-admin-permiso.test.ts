import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Las dos puertas que concedían administración por el nombre del rol.
 *
 * Cambiar el modo de compliance de la cuenta y escribir su marca se otorgaban a
 * quien se llamara «Admin» o «Administrador». Ahora lo decide
 * `configuracion.gestionar`, y estas pruebas fijan las dos direcciones: un rol
 * llamado igual pero sin la llave recibe 403, y un rol con la llave —aunque se
 * llame distinto— pasa.
 */

// ─── Mocks ────────────────────────────────────────────────────────────────

const prismaMock = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
  tenant: { findUnique: vi.fn(), update: vi.fn() },
  tenantFeature: { upsert: vi.fn() },
  whitelabelConfig: { findFirst: vi.fn() },
}));

vi.mock('@/lib/db', () => ({ prisma: prismaMock }));

vi.mock('@/lib/s3', () => ({ uploadPublicFile: vi.fn() }));

vi.mock('@/lib/plans', () => ({
  getPlanConfig: vi.fn().mockResolvedValue({ branding: { whitelabel: true } }),
}));

vi.mock('@/lib/branding', () => ({
  getEffectiveBranding: vi.fn().mockResolvedValue({
    companyName: 'Demo',
    logoUrl: '/logo.png',
    primaryColor: '#000',
    showPoweredBy: true,
  }),
  clearBrandingCache: vi.fn(),
}));

vi.mock('next-auth', () => ({ getServerSession: vi.fn() }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));

vi.mock('@/lib/compliance-gate', () => ({
  ComplianceGate: {
    getMode: vi.fn().mockResolvedValue('normal'),
    setMode: vi.fn().mockResolvedValue({ mode: 'compliance' }),
  },
}));

/**
 * La puerta de la marca blanca entra por `withTenantAuth`. El usuario de la
 * petición se ajusta en cada prueba, para poder cambiar el rol sin tocar código.
 */
const usuarioDeLaPeticion = vi.hoisted(() => ({ actual: null as unknown }));

vi.mock('@/lib/api-key-auth', () => ({
  withTenantAuth: (handler: any) => async (request: Request) =>
    handler(request, {
      valid: true,
      tenant: { id: 't1', nombre: 'Demo', slug: 'demo', plan: 'pro', moneda: 'EUR' },
      user: usuarioDeLaPeticion.actual,
    }),
}));

// ─── Imports ──────────────────────────────────────────────────────────────

import { getServerSession } from 'next-auth';
import { ComplianceGate } from '@/lib/compliance-gate';
import { clearBrandingCache } from '@/lib/branding';
import { PUT as PUT_MARCA } from '@/app/api/whitelabel/route';
import { PATCH as PATCH_COMPLIANCE } from '@/app/api/tenant/compliance-mode/route';

const USUARIO_BASE = { id: 'u1', name: 'Quien sea', email: 'quien@cuenta.test' };

function peticionMarca() {
  return new Request('https://volkern.app/api/whitelabel', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nombreEmpresa: 'Nueva marca' }),
  });
}

function peticionCompliance() {
  return new Request('https://volkern.app/api/tenant/compliance-mode', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode: 'compliance', justification: 'Auditoría interna solicitada' }),
  }) as never;
}

describe('PUERTAS ADMINISTRATIVAS: decide el permiso, no el nombre', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.tenant.findUnique.mockResolvedValue({ plan: 'pro', tenantFeatures: [{ habilitado: true }] });
    prismaMock.tenant.update.mockResolvedValue({});
    prismaMock.tenantFeature.upsert.mockResolvedValue({});
    prismaMock.whitelabelConfig.findFirst.mockResolvedValue(null);
  });

  // ── Marca de la cuenta (PUT /api/whitelabel) ────────────────────────────

  it('un rol llamado «Admin» sin la llave recibe 403 al escribir la marca', async () => {
    usuarioDeLaPeticion.actual = { ...USUARIO_BASE, role: { nombre: 'Admin', permisos: { equipo: { ver: true } } } };

    const respuesta = await PUT_MARCA(peticionMarca(), undefined as never);
    const cuerpo = await respuesta.json();

    expect(respuesta.status).toBe(403);
    expect(cuerpo.permisoRequerido).toBe('configuracion.gestionar');
    expect(prismaMock.tenantFeature.upsert).not.toHaveBeenCalled();
    expect(clearBrandingCache).not.toHaveBeenCalled();
  });

  it('un rol con la llave pasa aunque se llame «Anfitrión»', async () => {
    usuarioDeLaPeticion.actual = {
      ...USUARIO_BASE,
      role: { nombre: 'Anfitrión', permisos: { configuracion: { gestionar: true } } },
    };

    const respuesta = await PUT_MARCA(peticionMarca(), undefined as never);

    expect(respuesta.status).toBe(200);
    expect(prismaMock.tenantFeature.upsert).toHaveBeenCalledTimes(1);
    // La caché se invalida para que la marca nueva se vea de inmediato.
    expect(clearBrandingCache).toHaveBeenCalledTimes(1);
  });

  it('el wildcard de los administradores existentes sigue sirviendo', async () => {
    usuarioDeLaPeticion.actual = { ...USUARIO_BASE, role: { nombre: 'Administrador', permisos: { all: true } } };

    const respuesta = await PUT_MARCA(peticionMarca(), undefined as never);

    expect(respuesta.status).toBe(200);
  });

  // ── Modo de compliance (PATCH /api/tenant/compliance-mode) ──────────────

  it('un rol llamado «Admin» sin la llave recibe 403 al cambiar el modo', async () => {
    vi.mocked(getServerSession).mockResolvedValue({ user: { email: 'admin@cuenta.test' } } as never);
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'u1',
      tenantId: 't1',
      role: { nombre: 'Admin', permisos: { configuracion: { ver: true } } },
    });

    const respuesta = await PATCH_COMPLIANCE(peticionCompliance());
    const cuerpo = await respuesta.json();

    expect(respuesta.status).toBe(403);
    expect(cuerpo.permisoRequerido).toBe('configuracion.gestionar');
    expect(ComplianceGate.setMode).not.toHaveBeenCalled();
  });

  it('un rol con la llave cambia el modo', async () => {
    vi.mocked(getServerSession).mockResolvedValue({ user: { email: 'anfitrion@cuenta.test' } } as never);
    prismaMock.user.findUnique.mockResolvedValue({
      id: 'u1',
      tenantId: 't1',
      role: { nombre: 'Anfitrión', permisos: { configuracion: { gestionar: true } } },
    });

    const respuesta = await PATCH_COMPLIANCE(peticionCompliance());
    const cuerpo = await respuesta.json();

    expect(respuesta.status).toBe(200);
    expect(cuerpo.success).toBe(true);
    expect(ComplianceGate.setMode).toHaveBeenCalledWith(
      't1',
      'u1',
      'compliance',
      'Auditoría interna solicitada'
    );
  });
});
