// @vitest-environment node

import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * El alta de un acceso de huésped desde la interfaz (§20 y §27).
 *
 * `POST /api/users` es la puerta que el Anfitrión usa para dar de alta a un
 * huésped: crea la cuenta con el rol Huésped y la deja vinculada a su contacto
 * del CRM. Es la única forma de que el rol Huésped sirva para algo sin tocar la
 * base de datos.
 *
 * Lo que estas pruebas fijan es la frontera: dar acceso a un huésped **no** es
 * invitar al equipo —pide otra llave— y la llave de Hospitality **no** puede
 * usarse para fabricar un administrador de la cuenta.
 */

const mocks = vi.hoisted(() => ({
  contact: { findFirst: vi.fn() },
  role: { findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn() },
  user: { findUnique: vi.fn(), create: vi.fn(), role: { id: 'role_test', nombre: 'Superadmin', permisos: { all: true } } },
  validateLimit: vi.fn(),
  incrementUsage: vi.fn(),
  logAuditAction: vi.fn(),
  notifyByTelegram: vi.fn(),
  auth: { current: null as any },
}));

vi.mock('@/lib/db', () => ({
  prisma: { contact: mocks.contact, role: mocks.role, user: mocks.user },
  getTenantDb: () => ({}),
  dbContext: {},
}));

vi.mock('@/lib/api-key-auth', () => ({
  withTenantAuth:
    (handler: any) =>
    async (req: any) =>
      handler(req, mocks.auth.current),
}));

// La comprobación de permisos es la real: lo único sustituido es la auditoría.
vi.mock('@/lib/permissions', async () => ({
  ...(await vi.importActual<typeof import('@/lib/permissions')>('@/lib/permissions')),
  logAuditAction: mocks.logAuditAction,
}));

vi.mock('@/lib/limits', () => ({ validateLimit: mocks.validateLimit }));
vi.mock('@/lib/subscription', () => ({ incrementUsage: mocks.incrementUsage }));
vi.mock('@/lib/skills/context', () => ({ createSystemContext: () => ({}) }));
vi.mock('@/lib/skills/notification-layer', () => ({
  notifyByTelegram: mocks.notifyByTelegram,
}));

const { POST } = await import('@/app/api/users/route');

const ROL_HUESPED = { id: 'r-huesped', nombre: 'Huésped', tenantId: 't1' };

/**
 * El Anfitrión: administra el alojamiento y quién entra al módulo, pero no
 * tiene la llave de invitar a la plantilla (`equipo.invitar`).
 */
const ANFITRION = { equipo: { ver: true, crear: true, editar: true, eliminar: true, gestionar: true, roles: true } };
/** Quien invita al equipo, pero no reparte accesos del alojamiento. */
const JEFE_DE_EQUIPO = { equipo: { ver: true, invitar: true } };

function sesion(permisos: Record<string, unknown>, nombre = 'Admin') {
  mocks.auth.current = {
    valid: true,
    user: { id: 'u-anfitrion', name: 'Marta', email: 'marta@casa.com', roleId: 'r-a', role: { id: 'r-a', nombre, permisos } },
    tenant: { id: 't1' },
  };
}

function alta(body: unknown) {
  return new Request('https://volkern.app/api/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as any;
}

const ACCESO = {
  name: 'María García',
  email: 'maria@example.com',
  roleId: 'r-huesped',
  contactId: 'c-maria',
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.validateLimit.mockResolvedValue({ allowed: true });
  mocks.role.findFirst.mockResolvedValue(ROL_HUESPED);
  // El guard de tenencia del rol (POST /api/users) consulta con findUnique.
  mocks.role.findUnique.mockResolvedValue(ROL_HUESPED);
  mocks.contact.findFirst.mockResolvedValue({ id: 'c-maria' });
  mocks.user.findUnique.mockResolvedValue(null);
  mocks.logAuditAction.mockResolvedValue(undefined);
  mocks.incrementUsage.mockResolvedValue(undefined);
  mocks.notifyByTelegram.mockResolvedValue(undefined);
  mocks.user.create.mockResolvedValue({
    id: 'u-huesped',
    name: ACCESO.name,
    email: ACCESO.email,
    password: 'hash',
    contactId: 'c-maria',
    role: ROL_HUESPED,
  });
});

describe('alta de un acceso de huésped (POST /api/users)', () => {
  it('el Anfitrión puede darla sin tener la llave de invitar al equipo', async () => {
    sesion(ANFITRION, 'Anfitrión');

    const res = await POST(alta(ACCESO));

    expect(res.status).toBe(201);
    expect(mocks.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ contactId: 'c-maria', roleId: 'r-huesped', tenantId: 't1' }),
      })
    );
  });

  it('aunque el Anfitrión no envíe el rol, la cuenta nace con el rol Huésped', async () => {
    sesion(ANFITRION, 'Anfitrión');

    const res = await POST(alta({ name: ACCESO.name, email: ACCESO.email, contactId: 'c-maria' }));

    expect(res.status).toBe(201);
    expect(mocks.user.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ roleId: 'r-huesped' }) })
    );
  });

  it('el vínculo se busca en la cuenta, nunca en otra', async () => {
    sesion(ANFITRION, 'Anfitrión');

    await POST(alta(ACCESO));

    expect(mocks.contact.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'c-maria', tenantId: 't1' } })
    );
  });

  it('queda auditado, como cualquier alta', async () => {
    sesion(ANFITRION, 'Anfitrión');

    await POST(alta(ACCESO));

    expect(mocks.logAuditAction).toHaveBeenCalled();
  });

  it('el Anfitrión no puede usar esta puerta para invitar a un miembro del equipo', async () => {
    sesion(ANFITRION, 'Anfitrión');

    const res = await POST(alta({ name: 'Otro', email: 'otro@casa.com', roleId: 'r-mantenimiento' }));

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toMatchObject({ error: expect.stringContaining('invitar usuarios') });
    expect(mocks.user.create).not.toHaveBeenCalled();
  });

  it('quien solo invita al equipo tampoco puede repartir accesos de huésped', async () => {
    sesion(JEFE_DE_EQUIPO);

    const res = await POST(alta(ACCESO));

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toMatchObject({ permisoRequerido: 'equipo.roles' });
    expect(mocks.user.create).not.toHaveBeenCalled();
  });

  it('la llave de Hospitality no sirve para fabricar un administrador de la cuenta', async () => {
    sesion(ANFITRION, 'Anfitrión');

    const res = await POST(alta({ ...ACCESO, roleId: 'r-admin' }));

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: expect.stringContaining('solo puede tener el rol Huésped'),
    });
    expect(mocks.user.create).not.toHaveBeenCalled();
  });

  it('sin el rol Huésped en la cuenta lo dice, en lugar de inventarse un rol', async () => {
    sesion(ANFITRION, 'Anfitrión');
    mocks.role.findFirst.mockResolvedValue(null);

    const res = await POST(alta(ACCESO));

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toMatchObject({ error: expect.stringContaining('catálogo de roles') });
    expect(mocks.user.create).not.toHaveBeenCalled();
  });

  it('no vincula el contacto de otra cuenta', async () => {
    sesion(ANFITRION, 'Anfitrión');
    mocks.contact.findFirst.mockResolvedValue(null);

    const res = await POST(alta(ACCESO));

    expect(res.status).toBe(404);
    expect(mocks.user.create).not.toHaveBeenCalled();
  });

  it('un alta normal de equipo sigue pidiendo el rol o el departamento', async () => {
    sesion(JEFE_DE_EQUIPO);

    const res = await POST(alta({ name: 'Sin rol', email: 'sinrol@casa.com' }));

    expect(res.status).toBe(400);
    expect(mocks.user.create).not.toHaveBeenCalled();
  });

  it('quien tiene las dos llaves puede hacer las dos cosas', async () => {
    sesion({ equipo: { ver: true, invitar: true, roles: true } }, 'Admin');

    const invitado = await POST(alta({ name: 'Ana', email: 'ana@casa.com', roleId: 'r-limpieza' }));
    const huesped = await POST(alta({ ...ACCESO, email: 'maria2@example.com' }));

    expect(invitado.status).toBe(201);
    expect(huesped.status).toBe(201);
    expect(mocks.user.create).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ roleId: 'r-huesped', contactId: 'c-maria' }) })
    );
  });
});
