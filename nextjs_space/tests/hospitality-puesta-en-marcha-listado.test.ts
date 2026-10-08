// @vitest-environment node
//
// Listado cross-tenant de puestas en marcha de Hospitality (vista de triaje del
// panel de plataforma).
//
// Lo que se prueba aquí es la decisión que hace útil la lista: quién entra, con
// qué reglas y sin mezclar datos de un cliente con los de otro. Y el listado se
// resuelve con cuatro consultas fijas, no una por cliente: si alguien lo
// convirtiera en un bucle, los asertos de llamadas lo cazan.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  tenant: { findMany: vi.fn() },
  role: { findMany: vi.fn() },
  hospitalityProperty: { findMany: vi.fn() },
  tenantFeature: { findMany: vi.fn() },
  user: { findUnique: vi.fn() },
  getServerSession: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  prisma: mocks,
  default: mocks,
}));

vi.mock('@/lib/permissions', () => ({
  logAuditAction: vi.fn(),
}));

vi.mock('next-auth', () => ({
  getServerSession: mocks.getServerSession,
}));

vi.mock('@/lib/auth', () => ({ authOptions: {} }));

import {
  TOPE_LISTADO_PUESTA_EN_MARCHA,
  evaluarPuestaEnMarcha,
  listarPuestasEnMarchaHospitality,
} from '@/lib/provisioning/hospitality-alta';
import { GET } from '@/app/api/admin/hospitality/puesta-en-marcha/route';
import { ROLES_HOSPITALITY, permisosDeRol } from '@/lib/hospitality/roles';

const A = { id: 'tenant_a', nombre: 'Hotel Volcán', plan: 'profesional' };
const B = { id: 'tenant_b', nombre: 'Casa del Mar', plan: 'esencial' };

function tenantFila(t: { id: string; nombre: string; plan: string }, meses = 0) {
  return { ...t, fechaCreacion: new Date(Date.UTC(2026, 0 + meses, 1)) };
}

function rolesAlDia(tenantId: string, nombres = ROLES_HOSPITALITY.map((r) => r.nombre)) {
  return nombres.map((nombre) => {
    const def = ROLES_HOSPITALITY.find((r) => r.nombre === nombre)!;
    // `fechaCreacion` va en el select real (es la señal de actividad): el mock lo
    // imita para no probar una forma de fila que Prisma no devuelve.
    return {
      tenantId,
      nombre,
      permisos: permisosDeRol(def.id),
      fechaCreacion: new Date(Date.UTC(2026, 0, 20)),
    };
  });
}

function propiedad(tenantId: string, unidades = 3, nombre = 'Villa Mar Azul') {
  return {
    tenantId,
    id: `prop_${tenantId}`,
    nombre,
    ciudad: 'Algeciras',
    pais: 'España',
    estado: 'activa',
    fechaCreacion: new Date(Date.UTC(2026, 0, 15)),
    _count: { units: unidades },
  };
}

function soySuperadmin() {
  mocks.getServerSession.mockResolvedValue({ user: { id: 'u1' } });
  mocks.user.findUnique.mockResolvedValue({ id: 'u1', role: { nombre: 'Superadmin' } });
}

function peticion(query = '') {
  return new NextRequest(`http://localhost/api/admin/hospitality/puesta-en-marcha${query}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.tenant.findMany.mockResolvedValue([]);
  mocks.role.findMany.mockResolvedValue([]);
  mocks.hospitalityProperty.findMany.mockResolvedValue([]);
  mocks.tenantFeature.findMany.mockResolvedValue([]);
  mocks.getServerSession.mockResolvedValue(null);
  mocks.user.findUnique.mockResolvedValue(null);
});

describe('evaluarPuestaEnMarcha (pura)', () => {
  it('sin roles ni propiedades: lo dice en frases y no está listo', () => {
    const r = evaluarPuestaEnMarcha([], []);

    expect(r.roles.alDia).toBe(0);
    expect(r.roles.completos).toBe(false);
    expect(r.propiedades).toEqual([]);
    expect(r.listo).toBe(false);
    expect(r.faltantes).toEqual([
      `5 de ${ROLES_HOSPITALITY.length} roles por preparar: ${ROLES_HOSPITALITY.map((x) => x.nombre).join(', ')}`,
      'Sin ninguna propiedad: falta el paso 1 del cliente',
    ]);
    expect(r.enlaceWizard).toBe('/dashboard/hospitality/onboarding');
  });

  it('con roles al día y una propiedad, el operador ya puede pasar la puerta (las unidades las pone el cliente)', () => {
    const r = evaluarPuestaEnMarcha(rolesAlDia('t1'), [
      { id: 'p1', nombre: 'Loft', ciudad: null, pais: null, estado: 'activa', unidades: 0 },
    ]);

    expect(r.roles.completos).toBe(true);
    expect(r.listo).toBe(true);
    expect(r.faltantes).toEqual(['Propiedades sin unidades: el cliente aún no ha empezado']);
    expect(r.enlaceWizard).toBe('/dashboard/hospitality/onboarding?propertyId=p1');
  });

  it('un rol recortado es «incompleto» y se nombra, no se descarta el cliente', () => {
    const conHueco = rolesAlDia('t1', ['Anfitrión', 'Limpieza']).map((r) =>
      r.nombre === 'Anfitrión'
        ? { ...r, permisos: { ...(r.permisos as Record<string, unknown>), hospitality_reservas: { ver: true } } }
        : r
    );
    const r = evaluarPuestaEnMarcha(conHueco, []);

    const anfitrion = r.roles.detalle.find((x) => x.nombre === 'Anfitrión')!;
    expect(anfitrion.estado).toBe('incompleto');
    expect(r.faltantes[0]).toContain('Anfitrión');
  });
});

describe('listarPuestasEnMarchaHospitality', () => {
  it('sin clientes devuelve un listado vacío sin consultar roles ni propiedades', async () => {
    const res = await listarPuestasEnMarchaHospitality();

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.listado.tenants).toEqual([]);
    expect(res.listado.totales).toEqual({ tenants: 0, pendientes: 0, listos: 0, apagados: 0 });
    expect(mocks.role.findMany).not.toHaveBeenCalled();
    expect(mocks.hospitalityProperty.findMany).not.toHaveBeenCalled();
  });

  it('resuelve cada cliente con SUS roles y SUS propiedades, en cuatro consultas fijas', async () => {
    mocks.tenant.findMany.mockResolvedValue([tenantFila(A), tenantFila(B, 1)]);
    mocks.role.findMany.mockResolvedValue([...rolesAlDia(A.id)]);
    mocks.hospitalityProperty.findMany.mockResolvedValue([
      propiedad(A.id, 2, 'Loft A'),
      propiedad(A.id, 3, 'Casa A'),
    ]);

    const res = await listarPuestasEnMarchaHospitality();

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    // El orden de la tabla es «lo pendiente primero»: se busca por id, no por
    // posición, para no confundir contenido con orden.
    const a = res.listado.tenants.find((t) => t.tenantId === A.id)!;
    const b = res.listado.tenants.find((t) => t.tenantId === B.id)!;

    expect(a.tenantId).toBe(A.id);
    expect(a.roles).toEqual({ catalogo: 5, alDia: 5, pendientes: [] });
    expect(a.propiedades).toEqual({
      total: 2,
      unidades: 5,
      primera: { id: `prop_${A.id}`, nombre: 'Loft A' },
    });
    expect(a.enlaceWizard).toBe(`/dashboard/hospitality/onboarding?propertyId=prop_${A.id}`);
    expect(a.listo).toBe(true);

    // El otro cliente no hereda nada del primero.
    expect(b.tenantId).toBe(B.id);
    expect(b.roles.alDia).toBe(0);
    expect(b.roles.pendientes).toHaveLength(ROLES_HOSPITALITY.length);
    expect(b.propiedades).toEqual({ total: 0, unidades: 0, primera: null });
    expect(b.listo).toBe(false);

    // Cuatro consultas y ninguna por cliente.
    expect(mocks.tenant.findMany).toHaveBeenCalledTimes(1);
    expect(mocks.role.findMany).toHaveBeenCalledTimes(1);
    expect(mocks.hospitalityProperty.findMany).toHaveBeenCalledTimes(1);
    expect(mocks.tenantFeature.findMany).toHaveBeenCalledTimes(1);
  });

  it('ordena lo pendiente primero y, dentro, lo que ya está en marcha', async () => {
    mocks.tenant.findMany.mockResolvedValue([tenantFila(B), tenantFila(A, 1)]);
    // B: nada empezado. A: con propiedad y sin roles todavía.
    mocks.hospitalityProperty.findMany.mockResolvedValue([propiedad(A.id, 1)]);

    const res = await listarPuestasEnMarchaHospitality();

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.listado.tenants.map((t) => t.tenantId)).toEqual([A.id, B.id]);
    expect(res.listado.totales.pendientes).toBe(2);
  });

  it('marca al cliente con datos y el módulo apagado, y no lo da por listo', async () => {
    mocks.tenant.findMany.mockResolvedValue([tenantFila(A)]);
    mocks.role.findMany.mockResolvedValue(rolesAlDia(A.id));
    mocks.hospitalityProperty.findMany.mockResolvedValue([propiedad(A.id, 4)]);
    mocks.tenantFeature.findMany.mockResolvedValue([
      { tenantId: A.id, habilitado: false },
    ]);

    const res = await listarPuestasEnMarchaHospitality();

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.listado.tenants[0].moduloApagado).toBe(true);
    expect(res.listado.tenants[0].listo).toBe(false);
    expect(res.listado.totales.apagados).toBe(1);
  });

  it('avisa cuando hay más clientes de los que caben', async () => {
    mocks.tenant.findMany.mockResolvedValue([
      tenantFila(A),
      tenantFila(B, 1),
      tenantFila({ id: 'tenant_c', nombre: 'C', plan: 'basico' }, 2),
    ]);

    const res = await listarPuestasEnMarchaHospitality({ tope: 2 });

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.listado.truncado).toBe(true);
    expect(res.listado.tenants).toHaveLength(2);
    // Pide una fila de más, que es lo que permite saber que sobra gente.
    expect(mocks.tenant.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 3 }));
  });

  it('el filtro de candidatos es evidencia de Hospitality, nunca entitlement del plan', async () => {
    await listarPuestasEnMarchaHospitality();

    const { where } = mocks.tenant.findMany.mock.calls[0][0];
    // Las tres evidencias, y solo esas tres.
    expect(where.OR.map((o: Record<string, unknown>) => Object.keys(o)[0])).toEqual([
      'tenantFeatures',
      'hospitalityProperties',
      'roles',
    ]);
    // Nada de `plan: { in: [...] }`: casi todos los planes llevan la vertical y
    // la lista acabaría listando a todo el mundo.
    expect('plan' in where).toBe(false);
    expect('NOT' in where).toBe(false);
  });

  it('`desde` viaja en ISO para poder decir cuánto lleva esperando', async () => {
    mocks.tenant.findMany.mockResolvedValue([tenantFila(A, 3)]);

    const res = await listarPuestasEnMarchaHospitality();

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.listado.tenants[0].desde).toBe(new Date(Date.UTC(2026, 3, 1)).toISOString());
  });

  it('`senal` es la última actividad de Hospitality, no el alta del cliente', async () => {
    // Cliente viejo (enero) al que le crearon la propiedad en marzo y los roles
    // del catálogo en abril: la señal es abril, que es cuando dejó de avanzar.
    mocks.tenant.findMany.mockResolvedValue([tenantFila(A, 0)]);
    mocks.hospitalityProperty.findMany.mockResolvedValue([
      { ...propiedad(A.id, 0), fechaCreacion: new Date(Date.UTC(2026, 2, 10)) },
    ]);
    mocks.role.findMany.mockResolvedValue([
      {
        tenantId: A.id,
        nombre: 'Anfitrión',
        permisos: permisosDeRol('anfitrion'),
        fechaCreacion: new Date(Date.UTC(2026, 3, 2)),
      },
    ]);

    const res = await listarPuestasEnMarchaHospitality();

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.listado.tenants[0].senal).toBe(new Date(Date.UTC(2026, 3, 2)).toISOString());
  });

  it('un rol que no es del catálogo no cuenta como señal de Hospitality', async () => {
    mocks.tenant.findMany.mockResolvedValue([tenantFila(A, 0)]);
    mocks.role.findMany.mockResolvedValue([
      {
        tenantId: A.id,
        nombre: 'Admin',
        permisos: { all: true },
        fechaCreacion: new Date(Date.UTC(2026, 5, 1)),
      },
    ]);

    const res = await listarPuestasEnMarchaHospitality();

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    // Sin actividad de Hospitality, la señal es el alta del cliente.
    expect(res.listado.tenants[0].senal).toBe(new Date(Date.UTC(2026, 0, 1)).toISOString());
  });
});

describe('GET /api/admin/hospitality/puesta-en-marcha', () => {
  it('sin sesión → 401 y sin tocar la base de datos', async () => {
    const res = await GET(peticion());

    expect(res.status).toBe(401);
    expect(mocks.tenant.findMany).not.toHaveBeenCalled();
  });

  it('sesión sin rol Superadmin → 403', async () => {
    mocks.getServerSession.mockResolvedValue({ user: { id: 'u2' } });
    mocks.user.findUnique.mockResolvedValue({ id: 'u2', role: { nombre: 'Admin' } });

    const res = await GET(peticion());

    expect(res.status).toBe(403);
    expect(mocks.tenant.findMany).not.toHaveBeenCalled();
  });

  it('superadmin → 200 con los totales y las filas', async () => {
    soySuperadmin();
    mocks.tenant.findMany.mockResolvedValue([tenantFila(A)]);
    mocks.role.findMany.mockResolvedValue(rolesAlDia(A.id));

    const res = await GET(peticion());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.totales).toEqual({ tenants: 1, pendientes: 1, listos: 0, apagados: 0 });
    expect(body.tenants[0].tenant).toBe('Hotel Volcán');
    expect(typeof body.generadoEn).toBe('string');
  });

  it('acepta `?tope=` y cae en el default si el valor no es un número', async () => {
    soySuperadmin();

    await GET(peticion('?tope=2'));
    expect(mocks.tenant.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ take: 3 })
    );

    await GET(peticion('?tope=abc'));
    expect(mocks.tenant.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ take: TOPE_LISTADO_PUESTA_EN_MARCHA + 1 })
    );
  });
});
