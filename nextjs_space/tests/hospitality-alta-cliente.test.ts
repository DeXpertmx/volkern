// @vitest-environment node

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  tenant: { findUnique: vi.fn() },
  role: { count: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
  hospitalityProperty: { findFirst: vi.fn(), create: vi.fn() },
  logAuditAction: vi.fn(),
  getServerSession: vi.fn(),
  user: { findUnique: vi.fn() },
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
  prepararTenantHospitality,
  asegurarRolesHospitality,
  zonaHorariaValida,
} from '@/lib/provisioning/hospitality-alta';
import { POST } from '@/app/api/admin/hospitality/alta/route';
import { ROLES_HOSPITALITY } from '@/lib/hospitality/roles';

const TENANT = 'tenant_nuevo';
const PROPIEDAD = 'Villa Mar Azul';

function req(body: unknown): any {
  return { json: async () => body };
}

function tenantExiste() {
  mocks.tenant.findUnique.mockResolvedValue({ id: TENANT, nombre: 'Cliente Nuevo' });
}

beforeEach(() => {
  vi.clearAllMocks();
  tenantExiste();
  mocks.role.count.mockResolvedValue(0);
  mocks.role.findFirst.mockResolvedValue(null);
  mocks.role.create.mockResolvedValue({});
  mocks.hospitalityProperty.findFirst.mockResolvedValue(null);
  mocks.hospitalityProperty.create.mockResolvedValue({
    id: 'prop_1',
    nombre: PROPIEDAD,
    estado: 'activa',
  });
  mocks.logAuditAction.mockResolvedValue(undefined);
});

describe('zonaHorariaValida', () => {
  it('acepta identificadores IANA y rechaza inventados', () => {
    expect(zonaHorariaValida('Europe/Madrid')).toBe(true);
    expect(zonaHorariaValida('America/Mexico_City')).toBe(true);
    expect(zonaHorariaValida('Marte/Olympus')).toBe(false);
    expect(zonaHorariaValida('')).toBe(false);
  });
});

describe('prepararTenantHospitality — validación', () => {
  it('sin tenantId → 400 y no toca la base de datos', async () => {
    const res = await prepararTenantHospitality({
      tenantId: '',
      propiedad: { nombre: PROPIEDAD },
      actorUserId: 'u1',
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(400);
    expect(mocks.tenant.findUnique).not.toHaveBeenCalled();
    expect(mocks.role.create).not.toHaveBeenCalled();
  });

  it('sin nombre de propiedad → 400 (es el paso 1 del wizard del cliente)', async () => {
    const res = await prepararTenantHospitality({
      tenantId: TENANT,
      propiedad: { nombre: '   ' },
      actorUserId: 'u1',
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.status).toBe(400);
      expect(res.error).toContain('primera propiedad');
    }
    expect(mocks.hospitalityProperty.create).not.toHaveBeenCalled();
  });

  it('zona horaria inventada → 400 antes de escribir nada', async () => {
    const res = await prepararTenantHospitality({
      tenantId: TENANT,
      propiedad: { nombre: PROPIEDAD, timezone: 'Marte/Olympus' },
      actorUserId: 'u1',
    });
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.status).toBe(400);
      expect(res.error).toContain('zona horaria');
    }
    expect(mocks.role.create).not.toHaveBeenCalled();
    expect(mocks.hospitalityProperty.create).not.toHaveBeenCalled();
  });

  it('cliente inexistente → 404 sin crear roles ni propiedad', async () => {
    mocks.tenant.findUnique.mockResolvedValue(null);
    const res = await prepararTenantHospitality({
      tenantId: 'no_existe',
      propiedad: { nombre: PROPIEDAD },
      actorUserId: 'u1',
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(404);
    expect(mocks.role.create).not.toHaveBeenCalled();
    expect(mocks.hospitalityProperty.create).not.toHaveBeenCalled();
  });
});

describe('prepararTenantHospitality — alta', () => {
  it('crea los 5 roles del catálogo con sus permisos y la propiedad vacía del cliente', async () => {
    const res = await prepararTenantHospitality({
      tenantId: TENANT,
      propiedad: { nombre: PROPIEDAD, ciudad: 'Algeciras', pais: 'España', timezone: 'Europe/Madrid' },
      actorUserId: 'u1',
    });

    expect(res.ok).toBe(true);
    if (!res.ok) return;

    expect(res.roles.creados).toEqual(ROLES_HOSPITALITY.map((r) => r.nombre));
    expect(res.roles.creados).toHaveLength(5);
    expect(res.propiedad).toEqual({ id: 'prop_1', nombre: PROPIEDAD, estado: 'activa', creada: true });

    // Cada rol nace con los permisos de su definición, no vacío.
    for (const llamada of mocks.role.create.mock.calls) {
      expect(Object.keys(llamada[0].data.permisos).length).toBeGreaterThan(0);
      expect(llamada[0].data.tenantId).toBe(TENANT);
    }

    const data = mocks.hospitalityProperty.create.mock.calls[0][0].data;
    expect(data.tenantId).toBe(TENANT);
    expect(data.nombre).toBe(PROPIEDAD);
    expect(data.timezone).toBe('Europe/Madrid');
    // Nace sin conectar: el wizard del cliente deriva sus pasos de la realidad.
    expect(data.estado).toBe('activa');
    // Nada de moneda en la propiedad: la moneda es la de la cuenta.
    expect(data.moneda).toBeUndefined();

    expect(mocks.logAuditAction).toHaveBeenCalledTimes(1);
    expect(mocks.logAuditAction.mock.calls[0][1]).toBe(TENANT);
  });

  it('es idempotente: repetir el alta no duplica la propiedad ni los roles', async () => {
    mocks.role.findFirst.mockResolvedValue({
      id: 'rol_1',
      permisos: { hospitality_reservas: { ver: true, crear: true, editar: true, cancelar: true } },
    });
    mocks.hospitalityProperty.findFirst.mockResolvedValue({
      id: 'prop_1',
      nombre: PROPIEDAD,
      estado: 'activa',
    });

    const res = await prepararTenantHospitality({
      tenantId: TENANT,
      propiedad: { nombre: PROPIEDAD },
      actorUserId: 'u1',
    });

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.propiedad.creada).toBe(false);
    expect(res.roles.creados).toEqual([]);
    expect(mocks.role.create).not.toHaveBeenCalled();
    expect(mocks.hospitalityProperty.create).not.toHaveBeenCalled();

    // La búsqueda de la propiedad es por nombre sin distinguir mayúsculas.
    const where = mocks.hospitalityProperty.findFirst.mock.calls[0][0].where;
    expect(where.tenantId).toBe(TENANT);
    expect(where.nombre).toEqual({ equals: PROPIEDAD, mode: 'insensitive' });
  });

  it('un rol que ya existe se completa, nunca se recrea', async () => {
    mocks.role.findFirst.mockImplementation(async ({ where }: any) =>
      where.nombre === 'Anfitrión'
        ? { id: 'rol_anfitrion', permisos: {} }
        : null
    );

    const res = await prepararTenantHospitality({
      tenantId: TENANT,
      propiedad: { nombre: PROPIEDAD },
      actorUserId: 'u1',
    });

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.roles.creados).not.toContain('Anfitrión');
    expect(res.roles.creados).toHaveLength(4);
    expect(res.roles.completados.map((r) => r.nombre)).toEqual(['Anfitrión']);

    const update = mocks.role.update.mock.calls[0][0];
    expect(update.where.id).toBe('rol_anfitrion');
    // Completa lo que falta sin retirar nada.
    expect(Object.keys(update.data.permisos).length).toBeGreaterThan(0);
  });

  it('asegurarRolesHospitality arranca el orden detrás de los roles que la cuenta ya tenga', async () => {
    mocks.role.count.mockResolvedValue(3);
    await asegurarRolesHospitality(TENANT);
    const ordenes = mocks.role.create.mock.calls.map((c) => c[0].data.orden);
    expect(ordenes).toEqual([4, 5, 6, 7, 8]);
  });
});

describe('POST /api/admin/hospitality/alta', () => {
  beforeEach(() => {
    mocks.getServerSession.mockResolvedValue({ user: { id: 'super_1' } });
    mocks.user.findUnique.mockResolvedValue({ id: 'super_1', role: { nombre: 'Superadmin' } });
  });

  it('sin sesión → 401', async () => {
    mocks.getServerSession.mockResolvedValue(null);
    const res = await POST(req({ tenantId: TENANT, propiedad: { nombre: PROPIEDAD } }));
    expect(res.status).toBe(401);
    expect(mocks.hospitalityProperty.create).not.toHaveBeenCalled();
  });

  it('sesión sin rol Superadmin → 403', async () => {
    mocks.user.findUnique.mockResolvedValue({ id: 'u2', role: { nombre: 'Admin' } });
    const res = await POST(req({ tenantId: TENANT, propiedad: { nombre: PROPIEDAD } }));
    expect(res.status).toBe(403);
    expect(mocks.hospitalityProperty.create).not.toHaveBeenCalled();
  });

  it('Superadmin → 200 con el enlace al wizard del cliente', async () => {
    const res = await POST(req({ tenantId: TENANT, propiedad: { nombre: PROPIEDAD } }));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.propiedad.id).toBe('prop_1');
    expect(body.enlaceWizard).toBe('/dashboard/hospitality/onboarding?propertyId=prop_1');
    expect(body.roles.catalogo).toHaveLength(5);
    // El actor del alta es la sesión, no un valor del body.
    expect(mocks.logAuditAction.mock.calls[0][0]).toBe('super_1');
  });

  it('Superadmin con zona horaria inválida → 400 con el motivo', async () => {
    const res = await POST(
      req({ tenantId: TENANT, propiedad: { nombre: PROPIEDAD, timezone: 'Marte/Olympus' } })
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('zona horaria');
  });
});
