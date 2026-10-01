import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * `/api/tenant/modules` — el admin manda.
 *
 * Caso real (29 sep 2026): en el panel de admin se apagó el Feature «Agencia»
 * al tenant demo y, al entrar con «Inyectar Sesión», seguía apareciendo todo lo
 * de agencia. La causa estaba en esta ruta: el bypass de Admin/Demo
 * (`subdomain === 'admin' || subdomain.startsWith('demo')`) añadía TODOS los
 * módulos después de que `getActiveModules` hubiera aplicado los overrides, así
 * que volvía a encender lo que el admin acababa de apagar.
 *
 * Estas pruebas fijan que un `TenantFeature.habilitado = false` explícito gana
 * sobre el plan, sobre `enabledModules`, sobre el mapeo legacy de `crm` y sobre
 * el bypass de demo, sin tocar el resto del comportamiento (core de perfil
 * siempre presente, bypass intacto para lo que no está apagado).
 */

// ─── Mocks ────────────────────────────────────────────────────────────────

const prismaMock = vi.hoisted(() => ({
  tenant: { findUnique: vi.fn() },
  tenantFeature: { findMany: vi.fn() },
  subscriptionPlan: { findUnique: vi.fn() },
}));

vi.mock('@/lib/db', () => ({ prisma: prismaMock }));

// withTenantAuth como wrapper transparente: el handler recibe un auth ya listo.
vi.mock('@/lib/api-key-auth', () => ({
  withTenantAuth: (handler: any) => handler,
}));

// ─── Imports (después de los mocks) ───────────────────────────────────────

import { GET } from '@/app/api/tenant/modules/route';

const TENANT_DEMO = {
  id: 'tenant-demo',
  plan: 'profesional',
  enabledModules: ['crm', 'real-estate', 'leads', 'calendario'],
  accountType: 'BUSINESS',
  moneda: 'EUR',
  subdomain: 'demo-real-estate',
  configuracion: null,
};

const AUTH = { tenant: { id: TENANT_DEMO.id }, user: { id: 'u1' } } as any;

async function getModulos(): Promise<string[]> {
  const res = await GET(new Request('https://volkern.app/api/tenant/modules'), AUTH);
  expect(res.status).toBe(200);
  const body = await res.json();
  return body.modules as string[];
}

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.tenant.findUnique.mockResolvedValue(TENANT_DEMO);
  prismaMock.tenantFeature.findMany.mockResolvedValue([]);
  // Sin fila en BD: `getPlanConfig` cae a PLAN_MODULES del plan suscrito.
  prismaMock.subscriptionPlan.findUnique.mockResolvedValue(null);
});

// ─── Casos ────────────────────────────────────────────────────────────────

describe('GET /api/tenant/modules', () => {
  it('sin overrides, el bypass de demo sigue encendiendo todos los módulos', async () => {
    const modules = await getModulos();

    expect(modules).toContain('agency');
    expect(modules).toContain('telefonia');
    expect(modules).toContain('real-estate');
    expect(modules).toContain('mi_tarjeta');
    expect(modules).toContain('configuracion');
  });

  it('un Feature apagado en admin no vuelve por el bypass de demo', async () => {
    prismaMock.tenantFeature.findMany.mockResolvedValue([
      { feature: 'agency', habilitado: false },
      { feature: 'calidad', habilitado: false },
    ]);

    const modules = await getModulos();

    expect(modules).not.toContain('agency');
    expect(modules).not.toContain('calidad');
    // Lo que no se apagó sigue disponible.
    expect(modules).toContain('real-estate');
    expect(modules).toContain('telefonia');
  });

  it('lo apagado tampoco vuelve por el mapeo legacy de `crm`', async () => {
    prismaMock.tenantFeature.findMany.mockResolvedValue([
      { feature: 'citas', habilitado: false },
      { feature: 'catalogo', habilitado: false },
    ]);

    const modules = await getModulos();

    expect(modules).not.toContain('citas');
    expect(modules).not.toContain('catalogo');
    expect(modules).toContain('leads');
  });

  it('los módulos core de perfil se mantienen aunque el admin los apague', async () => {
    prismaMock.tenantFeature.findMany.mockResolvedValue([
      { feature: 'mi_tarjeta', habilitado: false },
      { feature: 'configuracion', habilitado: false },
    ]);

    const modules = await getModulos();

    expect(modules).toContain('mi_tarjeta');
    expect(modules).toContain('configuracion');
  });

  it('un Feature encendido a mano en admin se respeta', async () => {
    prismaMock.tenantFeature.findMany.mockResolvedValue([
      { feature: 'hospitality', habilitado: true },
    ]);

    const modules = await getModulos();

    expect(modules).toContain('hospitality');
  });

  it('un tenant normal (sin bypass) solo recibe lo suyo', async () => {
    prismaMock.tenant.findUnique.mockResolvedValue({
      ...TENANT_DEMO,
      id: 'tenant-comun',
      subdomain: null,
      plan: 'basico',
      enabledModules: ['crm'],
    });

    const modules = await getModulos();

    expect(modules).not.toContain('agency');
    expect(modules).not.toContain('logistica');
    expect(modules).toContain('leads');
  });
});
