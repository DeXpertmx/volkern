import { describe, it, expect, vi, beforeEach } from 'vitest';

const hoisted = vi.hoisted(() => ({
  hospitalityProperty: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  hospitalityUnit: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    hospitalityProperty: hoisted.hospitalityProperty,
    hospitalityUnit: hoisted.hospitalityUnit,
  },
}));

vi.mock('@/lib/permissions', () => ({
  logAuditAction: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/api-key-auth', () => ({
  authenticateRequest: vi.fn().mockResolvedValue({
    valid: true,
    tenant: { id: 'tenant_a' },
    user: { id: 'user_1', role: { id: 'role_test', nombre: 'Superadmin', permisos: { all: true } } },
  }),
}));

import { GET as getProperties, POST as postProperty } from '@/app/api/hospitality/properties/route';
import { GET as getPropertyById, PATCH as patchProperty, DELETE as deleteProperty } from '@/app/api/hospitality/properties/[id]/route';
import { GET as getUnits, POST as postUnit } from '@/app/api/hospitality/units/route';
import { GET as getUnitById, PATCH as patchUnit, DELETE as deleteUnit } from '@/app/api/hospitality/units/[id]/route';

const REQ = (query = '') => new Request(`http://test.local/api/hospitality/properties${query}`, { method: 'GET' });

function jsonReq(body: unknown) {
  return new Request('http://test.local/api/hospitality', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const CTX = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Hospitality CRUD — aislamiento multi-tenant', () => {
  it('GET properties filtra SIEMPRE por tenantId del usuario autenticado', async () => {
    hoisted.hospitalityProperty.findMany.mockResolvedValue([]);
    await getProperties(REQ());

    const where = hoisted.hospitalityProperty.findMany.mock.calls[0][0].where;
    expect(where.tenantId).toBe('tenant_a');
  });

  it('GET units filtra SIEMPRE por tenantId (aunque llegue propertyId de otro tenant)', async () => {
    hoisted.hospitalityUnit.findMany.mockResolvedValue([]);
    await getUnits(REQ('?propertyId=prop_ajena'));

    const where = hoisted.hospitalityUnit.findMany.mock.calls[0][0].where;
    expect(where.tenantId).toBe('tenant_a');
    expect(where.propertyId).toBe('prop_ajena'); // se filtra, pero tenantId es innegociable
  });

  it('GET property [id] usa findFirst con {id, tenantId} — no puede leer la de otro tenant', async () => {
    hoisted.hospitalityProperty.findFirst.mockResolvedValue(null);
    const res = await getPropertyById(REQ(), CTX('prop_ajena'));

    expect(res.status).toBe(404);
    const where = hoisted.hospitalityProperty.findFirst.mock.calls[0][0].where;
    expect(where.id).toBe('prop_ajena');
    expect(where.tenantId).toBe('tenant_a');
  });

  it('PATCH property [id] rechaza si la propiedad no es del tenant', async () => {
    hoisted.hospitalityProperty.findFirst.mockResolvedValue(null);
    const res = await patchProperty(jsonReq({ nombre: 'Hack' }), CTX('prop_ajena'));

    expect(res.status).toBe(404);
    expect(hoisted.hospitalityProperty.update).not.toHaveBeenCalled();
  });

  it('PATCH property [id] responde la propiedad CON sus unidades (el editor rearma el borrador con esta respuesta)', async () => {
    const conUnidades = {
      id: 'prop_a',
      tenantId: 'tenant_a',
      nombre: 'Viejo',
      units: [{ id: 'u1', nombre: 'Suite 1', capacidad: 4 }],
      _count: { reservations: 0 },
    };
    hoisted.hospitalityProperty.findFirst.mockResolvedValue(conUnidades);
    hoisted.hospitalityProperty.update.mockResolvedValue({ ...conUnidades, nombre: 'Nuevo' });
    const res = await patchProperty(jsonReq({ nombre: 'Nuevo' }), CTX('prop_a'));

    expect(res.status).toBe(200);
    // Guard de regresión: sin `include.units` en el update, la respuesta llega
    // sin unidades y la ficha pasa a «Sin unidades» en cuanto el autosave
    // rearma el borrador del editor guiado.
    const args = hoisted.hospitalityProperty.update.mock.calls[0][0];
    expect(args.include).toEqual({
      units: { orderBy: { nombre: 'asc' } },
      _count: { select: { reservations: true } },
    });
    const body = await res.json();
    expect(body.property.units).toHaveLength(1);
    expect(body.property.units[0].id).toBe('u1');
  });

  it('DELETE property [id] rechaza si la propiedad no es del tenant', async () => {
    hoisted.hospitalityProperty.findFirst.mockResolvedValue(null);
    const res = await deleteProperty(REQ(), CTX('prop_ajena'));

    expect(res.status).toBe(404);
    expect(hoisted.hospitalityProperty.delete).not.toHaveBeenCalled();
  });

  it('POST property crea con tenantId del usuario autenticado', async () => {
    hoisted.hospitalityProperty.create.mockResolvedValue({ id: 'p1', tenantId: 'tenant_a', nombre: 'Residencial X' });
    const res = await postProperty(jsonReq({ nombre: 'Residencial X' }));

    expect(res.status).toBe(201);
    const data = hoisted.hospitalityProperty.create.mock.calls[0][0].data;
    expect(data.tenantId).toBe('tenant_a');
  });

  it('POST unit verifica que la propiedad pertenezca al tenant antes de crear', async () => {
    // Propiedad de OTRO tenant: la unidad NO se crea
    hoisted.hospitalityProperty.findFirst.mockResolvedValue(null);
    const res = await postUnit(jsonReq({ propertyId: 'prop_ajena', nombre: 'Suite 1' }));

    expect(res.status).toBe(404);
    expect(hoisted.hospitalityUnit.create).not.toHaveBeenCalled();
  });

  it('POST unit crea con tenantId del usuario si la propiedad es suya', async () => {
    hoisted.hospitalityProperty.findFirst.mockResolvedValue({ id: 'prop_a', tenantId: 'tenant_a' });
    hoisted.hospitalityUnit.create.mockResolvedValue({ id: 'u1', tenantId: 'tenant_a' });
    const res = await postUnit(jsonReq({ propertyId: 'prop_a', nombre: 'Suite 1', capacidad: 2 }));

    expect(res.status).toBe(201);
    const data = hoisted.hospitalityUnit.create.mock.calls[0][0].data;
    expect(data.tenantId).toBe('tenant_a');
    expect(data.propertyId).toBe('prop_a');
  });

  it('PATCH unit rechaza unidad de otro tenant', async () => {
    hoisted.hospitalityUnit.findFirst.mockResolvedValue(null);
    const res = await patchUnit(jsonReq({ nombre: 'Hack' }), CTX('unit_ajena'));

    expect(res.status).toBe(404);
    expect(hoisted.hospitalityUnit.update).not.toHaveBeenCalled();
  });

  it('DELETE unit rechaza unidad de otro tenant', async () => {
    hoisted.hospitalityUnit.findFirst.mockResolvedValue(null);
    const res = await deleteUnit(REQ(), CTX('unit_ajena'));

    expect(res.status).toBe(404);
    expect(hoisted.hospitalityUnit.delete).not.toHaveBeenCalled();
  });

  it('GET unit [id] usa findFirst con {id, tenantId}', async () => {
    hoisted.hospitalityUnit.findFirst.mockResolvedValue(null);
    const res = await getUnitById(REQ(), CTX('unit_ajena'));

    expect(res.status).toBe(404);
    const where = hoisted.hospitalityUnit.findFirst.mock.calls[0][0].where;
    expect(where.id).toBe('unit_ajena');
    expect(where.tenantId).toBe('tenant_a');
  });
});