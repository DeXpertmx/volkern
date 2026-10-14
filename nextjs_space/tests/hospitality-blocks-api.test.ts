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
  // La guarda de fechas contratadas (`bloqueos-guarda`): por defecto, ninguna
  // reserva en el rango.
  hospitalityReservation: {
    findMany: vi.fn(),
  },
  authenticateRequest: vi.fn(),
  dispatchConnectivityPush: vi.fn(),
  logAuditAction: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    hospitalityUnitBlock: mocks.hospitalityUnitBlock,
    hospitalityUnit: mocks.hospitalityUnit,
    hospitalityReservation: mocks.hospitalityReservation,
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
  user: { id: 'user_a', role: { id: 'role_test', nombre: 'Superadmin', permisos: { all: true } } },
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
  mocks.hospitalityReservation.findMany.mockResolvedValue([]);
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
      motivo: 'Uso del propietario',
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
      motivo: 'Uso del propietario',
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
      motivo: 'Avería del aire',
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
      motivo: 'Uso del propietario',
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
      motivo: 'Uso del propietario',
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

/**
 * Liberar y reactivar son el mismo PATCH con distinto `estado`: liberar deja las
 * fechas a la venta (la fila se conserva, con su motivo) y reactivar las vuelve
 * a cerrar. Lo que se vigila aquí es que liberar no exija comprobar solapes
 * —es el que los resuelve— y que reactivar sí, para no dejar dos bloqueos
 * activos pisándose las mismas noches.
 */
describe('Estado del bloqueo: liberar (cancelado) y reactivar (activo)', () => {
  it('PATCH a cancelado libera las fechas, guarda el estado y empuja la propiedad', async () => {
    mocks.hospitalityUnitBlock.findFirst.mockResolvedValueOnce(block);
    mocks.hospitalityUnitBlock.update.mockResolvedValue({ ...block, estado: 'cancelado' });

    const response = await PATCH(request('PATCH', { estado: 'cancelado' }), ctx('block_a'));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.hospitalityUnitBlock.update.mock.calls[0][0].data).toMatchObject({
      estado: 'cancelado',
    });
    expect(data.block.estado).toBe('cancelado');
    expect(mocks.dispatchConnectivityPush).toHaveBeenCalledWith(
      'tenant_a',
      'property_a',
      'unidad_cambiada',
      { skipRates: true }
    );
  });

  it('liberar NO busca solapes: una sola lectura, la del propio bloqueo', async () => {
    mocks.hospitalityUnitBlock.findFirst.mockResolvedValueOnce(block);
    mocks.hospitalityUnitBlock.update.mockResolvedValue({ ...block, estado: 'cancelado' });

    const response = await PATCH(request('PATCH', { estado: 'cancelado' }), ctx('block_a'));

    expect(response.status).toBe(200);
    expect(mocks.hospitalityUnitBlock.findFirst).toHaveBeenCalledTimes(1);
  });

  it('reactivar rechaza 409 si el intervalo choca con otro bloqueo activo', async () => {
    mocks.hospitalityUnitBlock.findFirst
      .mockResolvedValueOnce({ ...block, estado: 'cancelado' })
      .mockResolvedValueOnce({ id: 'otro_bloqueo' });

    const response = await PATCH(request('PATCH', { estado: 'activo' }), ctx('block_a'));

    expect(response.status).toBe(409);
    expect(mocks.hospitalityUnitBlock.update).not.toHaveBeenCalled();
    expect(mocks.dispatchConnectivityPush).not.toHaveBeenCalled();
  });

  it('reactivar un bloqueo no se cuenta como solape consigo mismo', async () => {
    mocks.hospitalityUnitBlock.findFirst
      .mockResolvedValueOnce({ ...block, estado: 'cancelado' })
      .mockResolvedValueOnce(null);
    mocks.hospitalityUnitBlock.update.mockResolvedValue({ ...block, estado: 'activo' });

    const response = await PATCH(request('PATCH', { estado: 'activo' }), ctx('block_a'));

    expect(response.status).toBe(200);
    const solape = mocks.hospitalityUnitBlock.findFirst.mock.calls[1][0];
    expect(solape.where.id).toEqual({ not: 'block_a' });
    expect(solape.where.estado).toBe('activo');
    expect(mocks.hospitalityUnitBlock.update.mock.calls[0][0].data).toMatchObject({
      estado: 'activo',
    });
  });

  it('un estado que no existe no se guarda', async () => {
    mocks.hospitalityUnitBlock.findFirst.mockResolvedValueOnce(block);

    const response = await PATCH(request('PATCH', { estado: 'suspendido' }), ctx('block_a'));

    expect(response.status).toBe(400);
    expect(mocks.hospitalityUnitBlock.update).not.toHaveBeenCalled();
  });

  it('GET no filtra por estado: los liberados viajan a la UI para poder reactivarlos', async () => {
    mocks.hospitalityUnitBlock.findMany.mockResolvedValue([]);

    await GET(request('GET'));

    const args = mocks.hospitalityUnitBlock.findMany.mock.calls[0][0];
    expect(args.where.estado).toBeUndefined();
  });
});

/**
 * Dos reglas del producto que la API no puede dejar pasar:
 *  - el motivo es OBLIGATORIO: es la razón documentada del cierre (uso del
 *    propietario, visita de un familiar, noches cedidas o vendidas a una empresa
 *    fuera de canal...), y un bloqueo sin razón deja al que mire el calendario
 *    más adelante sin saber por qué esas noches estaban cerradas; y
 *  - las fechas ya CONTRATADAS no se cierran: un bloqueo resta disponibilidad
 *    como una reserva, pero detrás de la reserva hay un huésped confirmado.
 */
describe('Motivo obligatorio y fechas ya contratadas', () => {
  /** Una estancia vendida que ocupa las noches 10 y 11 de septiembre. */
  const venta = {
    id: 'res_1',
    channel: 'booking.com',
    externalBookingId: '5084548141',
    estado: 'confirmed',
    checkIn: new Date('2026-09-10T15:00:00'),
    checkOut: new Date('2026-09-12T11:00:00'),
    checkOutReal: null,
    guestData: { firstName: 'Mohamed', lastName: 'Bouchama' },
    contact: null,
  };

  it('POST sin motivo: no hay bloqueo (la razón es obligatoria)', async () => {
    const response = await POST(
      request('POST', { unitId: 'unit_a', fechaInicio: '2026-09-10', fechaFin: '2026-09-12' })
    );
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain('motivo');
    expect(mocks.hospitalityUnitBlock.create).not.toHaveBeenCalled();
    expect(mocks.dispatchConnectivityPush).not.toHaveBeenCalled();
  });

  it('POST con el motivo en blanco tampoco cierra fechas', async () => {
    const response = await POST(
      request('POST', {
        unitId: 'unit_a',
        fechaInicio: '2026-09-10',
        fechaFin: '2026-09-12',
        motivo: '   ',
      })
    );

    expect(response.status).toBe(400);
    expect(mocks.hospitalityUnitBlock.create).not.toHaveBeenCalled();
  });

  it('POST guarda el motivo recortado: es la razón documentada', async () => {
    mocks.hospitalityUnit.findFirst.mockResolvedValue(unit);
    mocks.hospitalityUnitBlock.findFirst.mockResolvedValue(null);
    mocks.hospitalityUnitBlock.create.mockResolvedValue({ ...block, motivo: 'Visita de un familiar' });

    await POST(
      request('POST', {
        unitId: 'unit_a',
        fechaInicio: '2026-09-10',
        fechaFin: '2026-09-12',
        motivo: '  Visita de un familiar  ',
      })
    );

    expect(mocks.hospitalityUnitBlock.create.mock.calls[0][0].data).toMatchObject({
      motivo: 'Visita de un familiar',
    });
  });

  it('POST no cierra noches vendidas: 409 con la reserva que está en medio', async () => {
    mocks.hospitalityUnit.findFirst.mockResolvedValue(unit);
    mocks.hospitalityUnitBlock.findFirst.mockResolvedValue(null);
    mocks.hospitalityReservation.findMany.mockResolvedValue([venta]);

    const response = await POST(
      request('POST', {
        unitId: 'unit_a',
        fechaInicio: '2026-09-11',
        fechaFin: '2026-09-13',
        motivo: 'Uso del propietario',
      })
    );
    const data = await response.json();

    expect(response.status).toBe(409);
    expect(data.conflicto).toHaveLength(1);
    // La estancia completa y con lo que la identifica, para poder resolverlo.
    expect(data.conflicto[0]).toMatchObject({
      id: 'res_1',
      referencia: '5084548141',
      desde: '2026-09-10',
      hasta: '2026-09-12',
    });
    // El mensaje dice la noche concreta que está vendida.
    expect(data.error).toContain('2026-09-11');
    expect(mocks.hospitalityUnitBlock.create).not.toHaveBeenCalled();
    expect(mocks.dispatchConnectivityPush).not.toHaveBeenCalled();
  });

  it('una reserva cancelada en el rango no impide cerrar: sus noches están libres', async () => {
    mocks.hospitalityUnit.findFirst.mockResolvedValue(unit);
    mocks.hospitalityUnitBlock.findFirst.mockResolvedValue(null);
    mocks.hospitalityReservation.findMany.mockResolvedValue([{ ...venta, estado: 'cancelled' }]);
    mocks.hospitalityUnitBlock.create.mockResolvedValue(block);

    const response = await POST(
      request('POST', {
        unitId: 'unit_a',
        fechaInicio: '2026-09-11',
        fechaFin: '2026-09-13',
        motivo: 'Uso del propietario',
      })
    );

    expect(response.status).toBe(201);
  });

  it('reactivar tampoco pisa noches vendidas: 409 y sin actualizar', async () => {
    mocks.hospitalityUnitBlock.findFirst
      .mockResolvedValueOnce({ ...block, estado: 'cancelado' })
      .mockResolvedValueOnce(null);
    mocks.hospitalityReservation.findMany.mockResolvedValue([venta]);

    const response = await PATCH(request('PATCH', { estado: 'activo' }), ctx('block_a'));
    const data = await response.json();

    expect(response.status).toBe(409);
    expect(data.conflicto[0].id).toBe('res_1');
    expect(mocks.hospitalityUnitBlock.update).not.toHaveBeenCalled();
  });

  it('liberar no se bloquea por reservas: liberar abre fechas, no las cierra', async () => {
    mocks.hospitalityUnitBlock.findFirst.mockResolvedValueOnce(block);
    mocks.hospitalityReservation.findMany.mockResolvedValue([venta]);
    mocks.hospitalityUnitBlock.update.mockResolvedValue({ ...block, estado: 'cancelado' });

    const response = await PATCH(request('PATCH', { estado: 'cancelado' }), ctx('block_a'));

    expect(response.status).toBe(200);
    // Ni siquiera se consultan las reservas: no se está cerrando nada.
    expect(mocks.hospitalityReservation.findMany).not.toHaveBeenCalled();
  });

  it('el motivo de un bloqueo no se puede vaciar al editarlo', async () => {
    mocks.hospitalityUnitBlock.findFirst.mockResolvedValueOnce(block);

    const response = await PATCH(request('PATCH', { motivo: '   ' }), ctx('block_a'));

    expect(response.status).toBe(400);
    expect(mocks.hospitalityUnitBlock.update).not.toHaveBeenCalled();
  });
});
