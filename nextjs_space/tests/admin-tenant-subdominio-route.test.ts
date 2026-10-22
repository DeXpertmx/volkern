// @vitest-environment node

/**
 * Guardia del subdominio editable desde el panel de admin.
 *
 * El alta normal (`/api/signup`) crea el tenant con `slug` y deja el subdominio
 * en NULL, y hasta ahora no había forma de corregirlo después: el PATCH del
 * tenant aceptaba nombre/slug/plan/estado/dominio… pero no `subdomain`. Como de
 * la dirección cuelgan el acceso del tenant y su dominio de email, lo que NO
 * puede pasar es que entre un valor inválido, o que se pise el de otro tenant.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  getServerSession: vi.fn(),
  userFindUnique: vi.fn(),
  tenantFindUnique: vi.fn(),
  tenantFindFirst: vi.fn(),
  tenantUpdate: vi.fn(),
  auditCreate: vi.fn(),
}));

vi.mock('next-auth', () => ({ getServerSession: mocks.getServerSession }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));
vi.mock('@/lib/db', () => {
  const prisma = {
    user: { findUnique: mocks.userFindUnique },
    tenant: {
      findUnique: mocks.tenantFindUnique,
      findFirst: mocks.tenantFindFirst,
      update: mocks.tenantUpdate,
    },
    auditLog: { create: mocks.auditCreate },
  };
  return { default: prisma, prisma };
});

import { PATCH } from '@/app/api/admin/tenants/[id]/route';

const params = { params: { id: 'tenant-1' } };
const patch = (body: unknown) =>
  PATCH({ json: async () => body } as any, params as any);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getServerSession.mockResolvedValue({ user: { id: 'u-admin' } });
  mocks.userFindUnique.mockResolvedValue({ id: 'u-admin', role: { nombre: 'Superadmin' } });
  mocks.tenantFindUnique.mockResolvedValue({
    id: 'tenant-1',
    nombre: 'Hotel Prueba',
    subdomain: null,
  });
  mocks.tenantFindFirst.mockResolvedValue(null);
  mocks.tenantUpdate.mockImplementation(async ({ data }: any) => ({
    id: 'tenant-1',
    nombre: 'Hotel Prueba',
    ...data,
  }));
  mocks.auditCreate.mockResolvedValue({});
});

describe('PATCH /api/admin/tenants/[id] — subdominio', () => {
  it('asigna el subdominio normalizado (minúsculas, sin espacios)', async () => {
    const res = await patch({ subdomain: '  Mi-Hotel ' });

    expect(res.status).toBe(200);
    expect(mocks.tenantUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'tenant-1' },
        data: expect.objectContaining({ subdomain: 'mi-hotel' }),
      })
    );
    expect(await res.json()).toMatchObject({ subdomain: 'mi-hotel' });
  });

  it('rechaza un dominio completo en vez de guardarlo como subdominio', async () => {
    const res = await patch({ subdomain: 'hotel.volkern.app' });

    expect(res.status).toBe(400);
    expect(mocks.tenantUpdate).not.toHaveBeenCalled();
  });

  it('rechaza un nombre reservado de la plataforma', async () => {
    const res = await patch({ subdomain: 'admin' });

    expect(res.status).toBe(400);
    expect(mocks.tenantUpdate).not.toHaveBeenCalled();
  });

  it('no pisa el subdominio de otro tenant y dice quién lo tiene', async () => {
    mocks.tenantFindFirst.mockResolvedValue({ nombre: 'Hotel Vecino', estado: 'activo' });

    const res = await patch({ subdomain: 'en-uso' });

    expect(res.status).toBe(409);
    expect((await res.json()).error).toContain('Hotel Vecino');
    expect(mocks.tenantUpdate).not.toHaveBeenCalled();
  });

  it('permite quitar el subdominio con una cadena vacía', async () => {
    mocks.tenantFindUnique.mockResolvedValue({
      id: 'tenant-1',
      nombre: 'Hotel Prueba',
      subdomain: 'hotel-prueba',
    });

    const res = await patch({ subdomain: '' });

    expect(res.status).toBe(200);
    expect(mocks.tenantUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ subdomain: null }) })
    );
    expect(mocks.tenantFindFirst).not.toHaveBeenCalled();
  });

  it('sin `subdomain` en el body no toca el valor actual', async () => {
    const res = await patch({ nombre: 'Hotel Renombrado' });

    expect(res.status).toBe(200);
    const data = mocks.tenantUpdate.mock.calls[0][0].data;
    expect(data).not.toHaveProperty('subdomain');
  });

  it('deja el cambio en el audit log con el valor anterior y el nuevo', async () => {
    mocks.tenantFindUnique.mockResolvedValue({
      id: 'tenant-1',
      nombre: 'Hotel Prueba',
      subdomain: 'viejo',
    });

    await patch({ subdomain: 'nuevo' });

    expect(mocks.auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          descripcion: expect.stringContaining('viejo → nuevo'),
        }),
      })
    );
  });

  it('un usuario que no es Superadmin no puede cambiarlo', async () => {
    mocks.userFindUnique.mockResolvedValue({ id: 'u-1', role: { nombre: 'Admin' } });

    const res = await patch({ subdomain: 'mi-hotel' });

    expect(res.status).toBe(403);
    expect(mocks.tenantUpdate).not.toHaveBeenCalled();
  });
});
