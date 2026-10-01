import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Guardia de servidor de los hubs (`lib/module-guard.ts`).
 *
 * Caso real (29 sep 2026): el menú escondía Agencia y Contabilidad, pero la URL
 * directa las seguía abriendo. Oculta en el menú no es prohibida: con la feature
 * apagada, o siendo un tenant BUSINESS, bastaba escribir `/dashboard/agencia`.
 *
 * Estas pruebas fijan las dos direcciones:
 *
 *   · BUSINESS (incluido un Superadmin suplantándolo) → redirección a /dashboard
 *   · AGENCY con la feature «Agencia» activa → pasa
 *   · AGENCY con la feature apagada en admin → redirección
 *
 * La comprobación de visibilidad es la MISMA que la del menú (`hubEsVisible`),
 * así que el enlace del menú y la pantalla no pueden discrepar.
 */

// ─── Mocks ────────────────────────────────────────────────────────────────

class Redireccion extends Error {
  constructor(public destino: string) {
    super(`redirect:${destino}`);
  }
}

const mocks = vi.hoisted(() => ({
  userFindUnique: vi.fn(),
  tenantFindUnique: vi.fn(),
  tenantFeatureFindMany: vi.fn(),
  subscriptionPlanFindUnique: vi.fn(),
  getServerSession: vi.fn(),
  resolveHierarchicalContext: vi.fn(),
  redirect: vi.fn(),
  cookieGet: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    user: { findUnique: mocks.userFindUnique },
    tenant: { findUnique: mocks.tenantFindUnique },
    tenantFeature: { findMany: mocks.tenantFeatureFindMany },
    subscriptionPlan: { findUnique: mocks.subscriptionPlanFindUnique },
  },
}));

vi.mock('next-auth', () => ({ getServerSession: mocks.getServerSession }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('next/headers', () => ({ cookies: () => ({ get: mocks.cookieGet }) }));
vi.mock('@/lib/api-key-auth', () => ({ resolveHierarchicalContext: mocks.resolveHierarchicalContext }));

// `redirect()` lanza en la app real (NEXT_REDIRECT): el mock hace lo mismo para
// poder afirmar a dónde iba la petición.
vi.mock('next/navigation', () => ({
  redirect: (destino: string) => {
    mocks.redirect(destino);
    throw new Redireccion(destino);
  },
}));

// ─── Imports (después de los mocks) ───────────────────────────────────────

import { exigirHub, tenantActivo } from '@/lib/module-guard';

// ─── Datos ────────────────────────────────────────────────────────────────

/** Tenant de plataforma del Superadmin: es AGENCY. */
const PLATAFORMA = {
  id: 'tenant-plataforma',
  nombre: 'Volkern Admin HQ',
  slug: 'volkern-admin',
  subdomain: 'volkern-admin',
  plan: 'enterprise',
  accountType: 'AGENCY',
  moneda: 'EUR',
};

const DEMO = {
  id: 'tenant-demo',
  nombre: 'Demo Real Estate',
  slug: 'demo-real-estate',
  subdomain: 'demo-real-estate',
  plan: 'profesional',
  enabledModules: ['crm', 'real-estate', 'leads', 'calendario'],
  accountType: 'BUSINESS',
  moneda: 'EUR',
};

/** Despacho contable real: AGENCY con plan de la vertical contable. */
const DESPACHO = { ...DEMO, id: 'tenant-despacho', accountType: 'AGENCY', plan: 'pro-accounting', nombre: 'Asesoría' };

/** Agencia de marketing: AGENCY con plan de la vertical de agencia. */
const AGENCIA_MARKETING = { ...DEMO, id: 'tenant-agencia', accountType: 'AGENCY', plan: 'pro-agency', nombre: 'Agencia Creativa' };

function sesion(roleName: string) {
  return { user: { id: 'u1', email: 'admin@volkern.app', roleName } };
}

function usuario(roleName: string, tenant: typeof PLATAFORMA) {
  return { id: 'u1', email: 'admin@volkern.app', role: { nombre: roleName }, tenant };
}

/** Deja al usuario en su tenant, sin suplantación. */
function sinSuplantar(roleName = 'Admin', tenant = PLATAFORMA) {
  mocks.getServerSession.mockResolvedValue(sesion(roleName));
  mocks.userFindUnique.mockResolvedValue(usuario(roleName, tenant));
  mocks.cookieGet.mockReturnValue(undefined);
  mocks.resolveHierarchicalContext.mockImplementation(async (_u: any, propio: any, targetId: string | null) => ({
    activeTenantId: targetId || propio.id,
    targetTenant: targetId ? { ...propio, id: targetId } : propio,
    agencyContext: false,
  }));
}

/** Simula «Inyectar Sesión» del Superadmin sobre otro tenant. */
function suplantando(tenantDestino: typeof DEMO, roleName = 'Superadmin') {
  mocks.getServerSession.mockResolvedValue(sesion(roleName));
  mocks.userFindUnique.mockResolvedValue(usuario(roleName, PLATAFORMA));
  mocks.cookieGet.mockReturnValue(tenantDestino.id);
  mocks.resolveHierarchicalContext.mockResolvedValue({
    activeTenantId: tenantDestino.id,
    targetTenant: { ...tenantDestino, parentId: null },
    agencyContext: true,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  sinSuplantar();
  mocks.tenantFindUnique.mockResolvedValue(DEMO);
  mocks.tenantFeatureFindMany.mockResolvedValue([]);
  // Sin fila en BD: `getPlanConfig` cae a PLAN_MODULES del plan suscrito.
  mocks.subscriptionPlanFindUnique.mockResolvedValue(null);
});

// ─── Agencia ──────────────────────────────────────────────────────────────

describe('exigirHub("agencia")', () => {
  it('un Superadmin suplantando un BUSINESS no entra (era el agujero reportado)', async () => {
    suplantando(DEMO);
    mocks.tenantFindUnique.mockResolvedValue(DEMO);

    await expect(exigirHub('agencia')).rejects.toThrow('/dashboard');
    expect(mocks.redirect).toHaveBeenCalledWith('/dashboard');
  });

  it('el bloqueo del BUSINESS no es por falta del módulo: el plan lo trae', async () => {
    suplantando(DEMO);
    mocks.tenantFindUnique.mockResolvedValue(DEMO);

    const resultado = await tenantActivo();

    expect(resultado.ok && resultado.activo.modulos).toContain('agency');
    expect(resultado.ok && resultado.activo.isImpersonating).toBe(true);
    expect(resultado.ok && resultado.activo.tenant.accountType).toBe('BUSINESS');
  });

  it('una agencia con la feature apagada en admin no entra', async () => {
    suplantando(AGENCIA_MARKETING as any);
    mocks.tenantFindUnique.mockResolvedValue(AGENCIA_MARKETING);
    mocks.tenantFeatureFindMany.mockResolvedValue([{ feature: 'agency', habilitado: false }]);

    await expect(exigirHub('agencia')).rejects.toThrow('/dashboard');
  });

  it('una agencia con la feature activa entra y recibe el contexto activo', async () => {
    suplantando(AGENCIA_MARKETING as any);
    mocks.tenantFindUnique.mockResolvedValue(AGENCIA_MARKETING);
    mocks.tenantFeatureFindMany.mockResolvedValue([{ feature: 'agency', habilitado: true }]);

    const activo = await exigirHub('agencia');

    expect(activo.tenant.id).toBe(AGENCIA_MARKETING.id);
    expect(activo.modulos).toContain('agency');
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it('un tenant BUSINESS sin suplantación tampoco entra', async () => {
    sinSuplantar('Admin', { ...DEMO } as any);
    mocks.tenantFindUnique.mockResolvedValue(DEMO);

    await expect(exigirHub('agencia')).rejects.toThrow('/dashboard');
  });

  it('el Superadmin sin suplantar conserva su hub (su tenant de plataforma es agencia)', async () => {
    sinSuplantar('Superadmin', PLATAFORMA);
    mocks.tenantFindUnique.mockResolvedValue(PLATAFORMA);
    mocks.tenantFeatureFindMany.mockResolvedValue([{ feature: 'agency', habilitado: true }]);

    const activo = await exigirHub('agencia');

    expect(activo.isImpersonating).toBe(false);
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});

// ─── Contabilidad ─────────────────────────────────────────────────────────

describe('exigirHub("contabilidad")', () => {
  it('un BUSINESS no entra por URL directa', async () => {
    suplantando(DEMO);
    mocks.tenantFindUnique.mockResolvedValue(DEMO);

    await expect(exigirHub('contabilidad')).rejects.toThrow('/dashboard');
  });

  it('un despacho (cuenta AGENCY, plan pro-accounting) entra', async () => {
    sinSuplantar('Admin', DESPACHO as any);
    mocks.tenantFindUnique.mockResolvedValue(DESPACHO);

    const activo = await exigirHub('contabilidad');

    expect(activo.tenant.accountType).toBe('AGENCY');
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it('una agencia de marketing (pro-agency) no entra al hub de Contabilidad', async () => {
    sinSuplantar('Admin', AGENCIA_MARKETING as any);
    mocks.tenantFindUnique.mockResolvedValue(AGENCIA_MARKETING);

    await expect(exigirHub('contabilidad')).rejects.toThrow('/dashboard');
  });
});

// ─── Sesión y contexto ────────────────────────────────────────────────────

describe('sesión y contexto', () => {
  it('sin sesión manda al login', async () => {
    mocks.getServerSession.mockResolvedValue(null);

    await expect(exigirHub('agencia')).rejects.toThrow('/auth/login');
  });

  it('una suplantación no autorizada no abre la pantalla', async () => {
    mocks.getServerSession.mockResolvedValue(sesion('Admin'));
    mocks.userFindUnique.mockResolvedValue(usuario('Admin', PLATAFORMA));
    mocks.cookieGet.mockReturnValue('tenant-ajeno');
    mocks.resolveHierarchicalContext.mockResolvedValue({
      activeTenantId: PLATAFORMA.id,
      targetTenant: PLATAFORMA,
      agencyContext: false,
      error: 'Violación de jerarquía: No tienes permiso para acceder a este tenant',
    });

    await expect(exigirHub('agencia')).rejects.toThrow('/dashboard');
  });

  it('un hub desconocido no abre nada', async () => {
    await expect(exigirHub('no-existe')).rejects.toThrow('/dashboard');
  });
});
