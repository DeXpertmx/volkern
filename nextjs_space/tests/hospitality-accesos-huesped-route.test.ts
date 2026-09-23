// @vitest-environment node

import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * El vínculo entre un acceso de huésped y su contacto del CRM.
 *
 * Es la pieza que hace que el rol Huésped sirva para algo: sin vínculo el acceso
 * no ve ninguna reserva. Y es una pieza con dos formas de hacer daño —vincular el
 * contacto de otro tenant, o vincular a alguien que no es huésped— así que las
 * dos se prueban aquí.
 */

const mocks = vi.hoisted(() => ({
  authenticateRequest: vi.fn(),
  role: { findFirst: vi.fn() },
  user: { findMany: vi.fn(), findFirst: vi.fn(), update: vi.fn(), role: { id: 'role_test', nombre: 'Superadmin', permisos: { all: true } } },
  contact: { findFirst: vi.fn() },
  logAuditAction: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ default: mocks, prisma: mocks }));
vi.mock('@/lib/api-key-auth', () => ({ authenticateRequest: mocks.authenticateRequest }));
vi.mock('@/lib/permissions', async () => ({
  // La comprobación de permisos es la real: se sustituye solo la auditoría.
  ...(await vi.importActual<typeof import('@/lib/permissions')>('@/lib/permissions')),
  logAuditAction: mocks.logAuditAction,
}));

const { GET, POST } = await import('@/app/api/hospitality/accesos-huesped/route');

const ROL_HUESPED = { id: 'r-huesped', nombre: 'Huésped' };

/** Un rol que administra los roles de Hospitality. */
const ADMIN = { equipo: { ver: true, roles: true } };
/** Un rol que puede invitar gente pero no repartir permisos del alojamiento. */
const JEFE_DE_EQUIPO = { equipo: { ver: true, invitar: true } };

function sesion(permisos: Record<string, unknown> | null, tenantId = 't1') {
  if (permisos === null) return { valid: false, error: 'No autorizado' };
  return {
    valid: true,
    user: {
      id: 'u-admin',
      tenantId,
      roleId: 'r-admin',
      role: { id: 'r-admin', nombre: 'Admin', permisos },
    },
    tenant: { id: tenantId },
  };
}

function peticion(metodo: 'GET' | 'POST', body?: unknown) {
  return new Request('https://volkern.app/api/hospitality/accesos-huesped', {
    method: metodo,
    headers: { 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  }) as any;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.logAuditAction.mockResolvedValue(undefined);
  mocks.role.findFirst.mockResolvedValue(ROL_HUESPED);
});

describe('GET /api/hospitality/accesos-huesped', () => {
  it('exige la capacidad de administrar los roles, no cualquier permiso de equipo', async () => {
    mocks.authenticateRequest.mockResolvedValue(sesion(JEFE_DE_EQUIPO));

    const res = await GET(peticion('GET'));

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toMatchObject({ permisoRequerido: 'equipo.roles' });
    // Y no se toca la base para un permiso que ya sabemos que falta.
    expect(mocks.user.findMany).not.toHaveBeenCalled();
  });

  it('sin sesión, 401', async () => {
    mocks.authenticateRequest.mockResolvedValue(sesion(null));
    const res = await GET(peticion('GET'));
    expect(res.status).toBe(401);
  });

  it('cuando el rol Huésped no existe lo dice, en lugar de ofrecer un botón inútil', async () => {
    mocks.authenticateRequest.mockResolvedValue(sesion(ADMIN));
    mocks.role.findFirst.mockResolvedValue(null);

    const res = await GET(peticion('GET'));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ rol: null, accesos: [] });
    expect(mocks.user.findMany).not.toHaveBeenCalled();
  });

  it('lista quién tiene el rol Huésped y si está vinculado', async () => {
    mocks.authenticateRequest.mockResolvedValue(sesion(ADMIN));
    mocks.user.findMany.mockResolvedValue([
      {
        id: 'u1',
        name: 'María García',
        email: 'maria@example.com',
        estado: 'activo',
        contactId: 'c1',
        contacto: { id: 'c1', nombre: 'María García', email: 'maria@example.com' },
      },
      {
        id: 'u2',
        name: 'Sin vínculo',
        email: 'solo@example.com',
        estado: 'invitado',
        contactId: null,
        contacto: null,
      },
    ]);

    const res = await GET(peticion('GET'));
    const data = await res.json();

    expect(data.rol).toEqual(ROL_HUESPED);
    expect(data.accesos).toEqual([
      {
        id: 'u1',
        nombre: 'María García',
        email: 'maria@example.com',
        estado: 'activo',
        vinculado: true,
        contacto: { id: 'c1', nombre: 'María García', email: 'maria@example.com' },
      },
      {
        id: 'u2',
        nombre: 'Sin vínculo',
        email: 'solo@example.com',
        estado: 'invitado',
        vinculado: false,
        contacto: null,
      },
    ]);
    // La consulta se filtra por el rol Huésped y por el tenant: nunca se listan
    // los accesos de otra cuenta.
    expect(mocks.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: 't1', roleId: 'r-huesped' } })
    );
  });
});

describe('POST /api/hospitality/accesos-huesped', () => {
  it('rechaza una acción que no existe', async () => {
    mocks.authenticateRequest.mockResolvedValue(sesion(ADMIN));
    const res = await POST(peticion('POST', { accion: 'borrar_todo', userId: 'u1' }));
    expect(res.status).toBe(400);
  });

  it('no vincula si el rol Huésped no existe todavía', async () => {
    mocks.authenticateRequest.mockResolvedValue(sesion(ADMIN));
    mocks.role.findFirst.mockResolvedValue(null);

    const res = await POST(peticion('POST', { accion: 'vincular', userId: 'u1', contactId: 'c1' }));

    expect(res.status).toBe(409);
    expect(mocks.user.update).not.toHaveBeenCalled();
  });

  it('no vincula el usuario de otra cuenta', async () => {
    mocks.authenticateRequest.mockResolvedValue(sesion(ADMIN));
    mocks.user.findFirst.mockResolvedValue(null);

    const res = await POST(peticion('POST', { accion: 'vincular', userId: 'ajeno', contactId: 'c1' }));

    expect(res.status).toBe(404);
    expect(mocks.user.update).not.toHaveBeenCalled();
  });

  it('no vincula a quien no es huésped: el vínculo no cambiaría nada para él', async () => {
    mocks.authenticateRequest.mockResolvedValue(sesion(ADMIN));
    mocks.user.findFirst.mockResolvedValue({
      id: 'u1',
      name: 'Recepcionista',
      email: 'recepcion@example.com',
      roleId: 'r-admin',
    });

    const res = await POST(peticion('POST', { accion: 'vincular', userId: 'u1', contactId: 'c1' }));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: expect.stringContaining('rol Huésped') });
    expect(mocks.contact.findFirst).not.toHaveBeenCalled();
  });

  it('no vincular el contacto de otra cuenta: sería abrir reservas ajenas', async () => {
    mocks.authenticateRequest.mockResolvedValue(sesion(ADMIN));
    mocks.user.findFirst.mockResolvedValue({
      id: 'u1',
      name: 'María',
      email: 'maria@example.com',
      roleId: 'r-huesped',
    });
    mocks.contact.findFirst.mockResolvedValue(null);

    const res = await POST(peticion('POST', { accion: 'vincular', userId: 'u1', contactId: 'c-otro' }));

    expect(res.status).toBe(404);
    expect(mocks.contact.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'c-otro', tenantId: 't1' } })
    );
    expect(mocks.user.update).not.toHaveBeenCalled();
  });

  it('vincula el contacto y lo deja auditado', async () => {
    mocks.authenticateRequest.mockResolvedValue(sesion(ADMIN));
    mocks.user.findFirst.mockResolvedValue({
      id: 'u1',
      name: 'María',
      email: 'maria@example.com',
      roleId: 'r-huesped',
    });
    mocks.contact.findFirst.mockResolvedValue({
      id: 'c1',
      nombre: 'María García',
      email: 'maria@example.com',
    });
    mocks.user.update.mockResolvedValue({ id: 'u1' });

    const res = await POST(peticion('POST', { accion: 'vincular', userId: 'u1', contactId: 'c1' }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.acceso).toEqual({
      id: 'u1',
      vinculado: true,
      contacto: { id: 'c1', nombre: 'María García', email: 'maria@example.com' },
    });
    expect(mocks.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { contactId: 'c1' },
    });
    expect(mocks.logAuditAction).toHaveBeenCalled();
  });

  it('desvincula: el acceso vuelve a no ver ninguna reserva', async () => {
    mocks.authenticateRequest.mockResolvedValue(sesion(ADMIN));
    mocks.user.findFirst.mockResolvedValue({
      id: 'u1',
      name: 'María',
      email: 'maria@example.com',
      roleId: 'r-huesped',
    });
    mocks.user.update.mockResolvedValue({ id: 'u1' });

    const res = await POST(peticion('POST', { accion: 'desvincular', userId: 'u1' }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.acceso).toEqual({ id: 'u1', vinculado: false, contacto: null });
    expect(mocks.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { contactId: null },
    });
  });

  it('tampoco deja vincular sin la capacidad de administrar los roles', async () => {
    mocks.authenticateRequest.mockResolvedValue(sesion(JEFE_DE_EQUIPO));

    const res = await POST(peticion('POST', { accion: 'vincular', userId: 'u1', contactId: 'c1' }));

    expect(res.status).toBe(403);
    expect(mocks.user.update).not.toHaveBeenCalled();
  });
});
