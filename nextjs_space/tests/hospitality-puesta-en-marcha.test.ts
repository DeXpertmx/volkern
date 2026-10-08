// @vitest-environment node
//
// Puesta en marcha de Hospitality para un cliente YA registrado.
//
// El alta guiada del wizard de partner solo cubre el tenant recién creado. Para
// el que lleva meses registrado (o al que se le enciende la vertical ahora) el
// operador necesita saber qué falta y por dónde sigue el cliente; eso es lo que
// se prueba aquí: el estado derivado de datos reales y su lectura por la ruta.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  tenant: { findUnique: vi.fn() },
  role: { findMany: vi.fn() },
  hospitalityProperty: { findMany: vi.fn() },
  getServerSession: vi.fn(),
  user: { findUnique: vi.fn() },
  logAuditAction: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  prisma: mocks,
  default: mocks,
}));

vi.mock('@/lib/permissions', () => ({
  logAuditAction: mocks.logAuditAction,
}));

vi.mock('next-auth', () => ({
  getServerSession: mocks.getServerSession,
}));

vi.mock('@/lib/auth', () => ({ authOptions: {} }));

import {
  enlaceWizardHospitality,
  estadoPuestaEnMarchaHospitality,
} from '@/lib/provisioning/hospitality-alta';
import { GET } from '@/app/api/admin/hospitality/alta/route';
import { ROLES_HOSPITALITY, permisosDeRol } from '@/lib/hospitality/roles';

const TENANT = 'tenant_viejo';

/** Los cinco roles del catálogo, tal y como quedan tras aplicar el alta. */
function rolesAlDia() {
  return ROLES_HOSPITALITY.map((def) => ({
    nombre: def.nombre,
    permisos: permisosDeRol(def.id) as Record<string, unknown>,
  }));
}

function propiedad(overrides: Record<string, unknown> = {}) {
  return {
    id: 'prop_1',
    nombre: 'Villa Mar Azul',
    ciudad: 'Algeciras',
    pais: 'España',
    estado: 'activa',
    _count: { units: 4 },
    ...overrides,
  };
}

function soySuperadmin() {
  mocks.getServerSession.mockResolvedValue({ user: { id: 'u1' } });
  mocks.user.findUnique.mockResolvedValue({ id: 'u1', role: { nombre: 'Superadmin' } });
}

function peticion(tenantId?: string) {
  const url = tenantId
    ? `http://localhost/api/admin/hospitality/alta?tenantId=${encodeURIComponent(tenantId)}`
    : 'http://localhost/api/admin/hospitality/alta';
  return new NextRequest(url);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.tenant.findUnique.mockResolvedValue({ id: TENANT, nombre: 'Cliente Antiguo' });
  mocks.role.findMany.mockResolvedValue([]);
  mocks.hospitalityProperty.findMany.mockResolvedValue([]);
  mocks.getServerSession.mockResolvedValue(null);
  mocks.user.findUnique.mockResolvedValue(null);
});

describe('enlaceWizardHospitality', () => {
  it('sin propiedad apunta a la raíz y con propiedad la codifica', () => {
    expect(enlaceWizardHospitality()).toBe('/dashboard/hospitality/onboarding');
    expect(enlaceWizardHospitality(null)).toBe('/dashboard/hospitality/onboarding');
    expect(enlaceWizardHospitality('prop 1')).toBe(
      '/dashboard/hospitality/onboarding?propertyId=prop%201'
    );
  });
});

describe('estadoPuestaEnMarchaHospitality — validación', () => {
  it('sin tenantId → 400 y no consulta nada del cliente', async () => {
    const res = await estadoPuestaEnMarchaHospitality('   ');

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(400);
    expect(mocks.tenant.findUnique).not.toHaveBeenCalled();
    expect(mocks.role.findMany).not.toHaveBeenCalled();
    expect(mocks.hospitalityProperty.findMany).not.toHaveBeenCalled();
  });

  it('cliente inexistente → 404 sin leer roles ni propiedades', async () => {
    mocks.tenant.findUnique.mockResolvedValue(null);

    const res = await estadoPuestaEnMarchaHospitality('no_existe');

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(404);
    expect(mocks.role.findMany).not.toHaveBeenCalled();
  });
});

describe('estadoPuestaEnMarchaHospitality — qué falta', () => {
  it('cuenta los roles al día y distingue ausentes de incompletos', async () => {
    const alDia = rolesAlDia();
    // El Anfitrión existe pero le han recortado una capacidad: es «incompleto»,
    // no «ausente», y el estado tiene que poder decir cuál de las dos cosas es.
    const anfitrion = { ...alDia[0] };
    const permisos = JSON.parse(JSON.stringify(anfitrion.permisos)) as Record<
      string,
      Record<string, boolean>
    >;
    // Los módulos del catálogo van prefijados (`hospitality_reservas`), igual
    // que los guarda el rol en la base.
    permisos.hospitality_reservas.cancelar = false;
    anfitrion.permisos = permisos;
    mocks.role.findMany.mockResolvedValue([anfitrion]);

    const res = await estadoPuestaEnMarchaHospitality(TENANT);

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const { estado } = res;

    expect(estado.roles.catalogo).toBe(ROLES_HOSPITALITY.length);
    expect(estado.roles.alDia).toBe(0);
    expect(estado.roles.completos).toBe(false);

    const porNombre = new Map(estado.roles.detalle.map((r) => [r.nombre, r]));
    expect(porNombre.get('Anfitrión')?.estado).toBe('incompleto');
    expect(porNombre.get('Anfitrión')?.faltantes).toContain(
      'hospitality_reservas.cancelar'
    );
    expect(porNombre.get('Limpieza')?.estado).toBe('ausente');
    expect(porNombre.get('Limpieza')?.faltantes).toEqual([]);
  });

  it('sin propiedades no está listo, aunque los roles estén al día', async () => {
    mocks.role.findMany.mockResolvedValue(rolesAlDia());

    const res = await estadoPuestaEnMarchaHospitality(TENANT);

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.estado.roles.completos).toBe(true);
    expect(res.estado.propiedades).toEqual([]);
    expect(res.estado.listo).toBe(false);
    // Sin propiedad, el enlace es el de la raíz: el wizard le pide elegir.
    expect(res.estado.enlaceWizard).toBe('/dashboard/hospitality/onboarding');
  });

  it('roles al día y una propiedad → listo, con unidades y enlace por propiedad', async () => {
    mocks.role.findMany.mockResolvedValue(rolesAlDia());
    mocks.hospitalityProperty.findMany.mockResolvedValue([propiedad()]);

    const res = await estadoPuestaEnMarchaHospitality(TENANT);

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.estado.listo).toBe(true);
    expect(res.estado.propiedades).toEqual([
      {
        id: 'prop_1',
        nombre: 'Villa Mar Azul',
        ciudad: 'Algeciras',
        pais: 'España',
        estado: 'activa',
        unidades: 4,
        enlaceWizard: '/dashboard/hospitality/onboarding?propertyId=prop_1',
      },
    ]);
    expect(res.estado.enlaceWizard).toBe(
      '/dashboard/hospitality/onboarding?propertyId=prop_1'
    );
  });

  it('una propiedad sin unidades sigue contando: las pone el cliente en su wizard', async () => {
    mocks.role.findMany.mockResolvedValue(rolesAlDia());
    mocks.hospitalityProperty.findMany.mockResolvedValue([
      propiedad({ _count: { units: 0 } }),
    ]);

    const res = await estadoPuestaEnMarchaHospitality(TENANT);

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.estado.propiedades[0].unidades).toBe(0);
    expect(res.estado.listo).toBe(true);
  });

  it('lee siempre con el tenantId pedido (aislamiento multi-tenant)', async () => {
    await estadoPuestaEnMarchaHospitality(TENANT);

    expect(mocks.role.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: TENANT } })
    );
    expect(mocks.hospitalityProperty.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: TENANT } })
    );
  });
});

describe('GET /api/admin/hospitality/alta', () => {
  it('sin sesión → 401 y no toca la base de datos', async () => {
    const res = await GET(peticion(TENANT));

    expect(res.status).toBe(401);
    expect(mocks.tenant.findUnique).not.toHaveBeenCalled();
  });

  it('sesión sin rol Superadmin → 403', async () => {
    mocks.getServerSession.mockResolvedValue({ user: { id: 'u2' } });
    mocks.user.findUnique.mockResolvedValue({ id: 'u2', role: { nombre: 'Admin' } });

    const res = await GET(peticion(TENANT));

    expect(res.status).toBe(403);
    expect(mocks.tenant.findUnique).not.toHaveBeenCalled();
  });

  it('superadmin → 200 con el estado de la puesta en marcha', async () => {
    soySuperadmin();
    mocks.role.findMany.mockResolvedValue(rolesAlDia());
    mocks.hospitalityProperty.findMany.mockResolvedValue([propiedad({ _count: { units: 0 } })]);

    const res = await GET(peticion(TENANT));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.tenant).toEqual({ id: TENANT, nombre: 'Cliente Antiguo' });
    expect(body.roles.alDia).toBe(ROLES_HOSPITALITY.length);
    expect(body.propiedades).toHaveLength(1);
    expect(body.listo).toBe(true);
  });

  it('superadmin sin tenantId → 400 con el motivo', async () => {
    soySuperadmin();

    const res = await GET(peticion());
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/cliente/i);
  });

  it('cliente inexistente → 404', async () => {
    soySuperadmin();
    mocks.tenant.findUnique.mockResolvedValue(null);

    const res = await GET(peticion('no_existe'));

    expect(res.status).toBe(404);
  });
});
