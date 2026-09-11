import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  hospitalityUnitBlock: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  hospitalityUnit: {
    findFirst: vi.fn(),
  },
  authenticateRequest: vi.fn(),
  dispatchConnectivityPush: vi.fn(),
  logAuditAction: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    hospitalityUnitBlock: mocks.hospitalityUnitBlock,
    hospitalityUnit: mocks.hospitalityUnit,
  },
}));
vi.mock('@/lib/api-key-auth', () => ({
  authenticateRequest: mocks.authenticateRequest,
}));
vi.mock('@/lib/hospitality/sync', () => ({
  dispatchConnectivityPush: mocks.dispatchConnectivityPush,
}));
vi.mock('@/lib/permissions', () => ({
  logAuditAction: mocks.logAuditAction,
}));

import { GET, POST } from '@/app/api/hospitality/blocks/route';
import { DELETE, PATCH } from '@/app/api/hospitality/blocks/[id]/route';

const auth = {
  valid: true,
  tenant: { id: 'tenant_a' },
  user: { id: 'user_a' },
};

const request = (method: string, body?: unknown, url = 'http://test.local/api/hospitality/blocks') =>
  new Request(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

const unit = {
  id: 'unit_a',
  nombre: 'Suite A',
  propertyId: 'property_a',
  property: { nombre: 'Hotel A' },
};

const block = {
  id: 'block_a',
  tenantId: 'tenant_a',
  unitId: 'unit_a',
  fechaInicio: new Date('2026-09-10T00:00:00.000Z'),
  fechaFin: new Date('2026-09-12T00:00:00.000Z'),
  motivo: 'Mantenimiento',
  estado: 'activo',
  unit: { id: 'unit_a', nombre: 'Suite A', codigo: 'A', propertyId: 'property_a' },
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authenticateRequest.mockResolvedValue(auth);
  mocks.logAuditAction.mockResolvedValue(undefined);
  mocks.dispatchConnectivityPush.mockResolvedValue({ ok: true });
});

describe('API de bloqueos manuales — aislamiento y validación', () => {
  it('GET filtra por tenantId y por intervalo', async () => {
    mocks.hospitalityUnitBlock.findMany.mockResolvedValue([]);

    await GET(request('GET', undefined, 'http://test.local/api/hospitality/blocks?from=2026-09-10&to=2026-09-20'));

    const args = mocks.hospitalityUnitBlock.findMany.mock.calls[0][0];
    expect(args.where.tenantId).toBe('tenant_a');
    const localDate = (value: string) => new Date(`${value}T00:00:00`);
    expect(args.where.fechaFin).toEqual({ gt: localDate('2026-09-10') });
    expect(args.where.fechaInicio).toEqual({ lt: localDate('2026-09-20') });
  });

  it('POST rechaza una unidad de otro tenant sin crear ni sincronizar', async () => {
    mocks.hospitalityUnit.findFirst.mockResolvedValue(null);

    const response = await POST(request('POST', {
      unitId: 'unit_foreign',
      fechaInicio: '2026-09-10',
      fechaFin: '2026-09-12',
    }));

    expect(response.status).toBe(404);
    expect(mocks.hospitalityUnit.findFirst.mock.calls[0][0].where).toEqual({
      id: 'unit_foreign',
      tenantId: 'tenant_a',
    });
    expect(mocks.hospitalityUnitBlock.create).not.toHaveBeenCalled();
    expect(mocks.dispatchConnectivityPush).not.toHaveBeenCalled();
  });

  it('POST rechaza intervalos que se solapan en la misma unidad', async () => {
    mocks.hospitalityUnit.findFirst.mockResolvedValue(unit);
    mocks.hospitalityUnitBlock.findFirst.mockResolvedValue({ id: 'existing' });

    const response = await POST(request('POST', {
      unitId: 'unit_a',
      fechaInicio: '2026-09-11',
      fechaFin: '2026-09-13',
    }));

    expect(response.status).toBe(409);
    expect(mocks.hospitalityUnitBlock.create).not.toHaveBeenCalled();
    expect(mocks.dispatchConnectivityPush).not.toHaveBeenCalled();
  });

  it('POST crea el bloqueo del tenant y sincroniza la propiedad correcta', async () => {
    mocks.hospitalityUnit.findFirst.mockResolvedValue(unit);
    mocks.hospitalityUnitBlock.findFirst.mockResolvedValue(null);
    mocks.hospitalityUnitBlock.create.mockResolvedValue(block);

    const response = await POST(request('POST', {
      unitId: 'unit_a',
      fechaInicio: '2026-09-10',
      fechaFin: '2026-09-12',
      motivo: 'Mantenimiento',
    }));

    expect(response.status).toBe(201);
    expect(mocks.hospitalityUnitBlock.create.mock.calls[0][0].data).toMatchObject({
      tenantId: 'tenant_a',
      unitId: 'unit_a',
      motivo: 'Mantenimiento',
    });
    expect(mocks.dispatchConnectivityPush).toHaveBeenCalledWith(
      'tenant_a',
      'property_a',
      'unidad_cambiada',
      { skipRates: true }
    );
  });

  it('PATCH y DELETE no pueden operar sobre un bloqueo de otro tenant', async () => {
    mocks.hospitalityUnitBlock.findFirst.mockResolvedValue(null);

    const patch = await PATCH(request('PATCH', { motivo: 'Cambio' }), ctx('foreign_block'));
    const deletion = await DELETE(request('DELETE'), ctx('foreign_block'));

    expect(patch.status).toBe(404);
    expect(deletion.status).toBe(404);
    expect(mocks.hospitalityUnitBlock.update).not.toHaveBeenCalled();
    expect(mocks.hospitalityUnitBlock.delete).not.toHaveBeenCalled();
  });
});

describe('tipo de bloqueo (Calendar Blocks)', () => {
  it('POST guarda el tipo indicado', async () => {
    mocks.hospitalityUnit.findFirst.mockResolvedValue(unit);
    mocks.hospitalityUnitBlock.findFirst.mockResolvedValue(null);
    mocks.hospitalityUnitBlock.create.mockResolvedValue({ ...block, tipo: 'mantenimiento' });

    const response = await POST(request('POST', {
      unitId: 'unit_a',
      fechaInicio: '2026-09-10',
      fechaFin: '2026-09-12',
      tipo: 'mantenimiento',
    }));

    expect(response.status).toBe(201);
    expect(mocks.hospitalityUnitBlock.create.mock.calls[0][0].data).toMatchObject({
      tipo: 'mantenimiento',
    });
  });

  it('POST sin tipo usa el valor por defecto del catálogo', async () => {
    mocks.hospitalityUnit.findFirst.mockResolvedValue(unit);
    mocks.hospitalityUnitBlock.findFirst.mockResolvedValue(null);
    mocks.hospitalityUnitBlock.create.mockResolvedValue(block);

    await POST(request('POST', {
      unitId: 'unit_a',
      fechaInicio: '2026-09-10',
      fechaFin: '2026-09-12',
    }));

    expect(mocks.hospitalityUnitBlock.create.mock.calls[0][0].data).toMatchObject({
      tipo: 'propietario',
    });
  });

  it('un tipo desconocido no rompe la creación: cae al valor por defecto', async () => {
    mocks.hospitalityUnit.findFirst.mockResolvedValue(unit);
    mocks.hospitalityUnitBlock.findFirst.mockResolvedValue(null);
    mocks.hospitalityUnitBlock.create.mockResolvedValue(block);

    const response = await POST(request('POST', {
      unitId: 'unit_a',
      fechaInicio: '2026-09-10',
      fechaFin: '2026-09-12',
      tipo: 'inventado',
    }));

    expect(response.status).toBe(201);
    expect(mocks.hospitalityUnitBlock.create.mock.calls[0][0].data).toMatchObject({
      tipo: 'propietario',
    });
  });

  it('PATCH puede cambiar el tipo de un bloqueo existente', async () => {
    // Primera llamada: cargar el bloqueo. Segunda: comprobar solapes (ninguno).
    mocks.hospitalityUnitBlock.findFirst
      .mockResolvedValueOnce(block)
      .mockResolvedValueOnce(null);
    mocks.hospitalityUnitBlock.update.mockResolvedValue({ ...block, tipo: 'administrativo' });

    const response = await PATCH(request('PATCH', { tipo: 'administrativo' }), ctx('block_a'));

    expect(response.status).toBe(200);
    expect(mocks.hospitalityUnitBlock.update.mock.calls[0][0].data).toMatchObject({
      tipo: 'administrativo',
    });
  });
});
