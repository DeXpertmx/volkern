// @vitest-environment node

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  authenticateRequest: vi.fn(),
  hospitalityUnit: { findFirst: vi.fn() },
  hospitalityReservation: { count: vi.fn(), findMany: vi.fn() },
  connectivityMapping: { findFirst: vi.fn(), update: vi.fn() },
  logAuditAction: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ default: mocks, prisma: mocks }));
vi.mock('@/lib/api-key-auth', () => ({ authenticateRequest: mocks.authenticateRequest }));
vi.mock('@/lib/permissions', () => ({ logAuditAction: mocks.logAuditAction }));

const { GET, POST } = await import('@/app/api/hospitality/onboarding/mapping/deshacer/route');

const UNIDAD = { id: 'unit_free', nombre: 'Penthouse', property: { nombre: 'Villa Mar Azul' } };

function vinculoAutomatico() {
  return {
    id: 'map_auto',
    externalPropertyId: 'sandbox-pms',
    externalUnitCode: 'penthouse',
    externalRatePlanCode: 'penthouse-ep',
    metadata: {
      origen: 'vinculacion_automatica_webhook',
      motivo: 'codigo_de_unidad',
      bookingId: 'BKG-999',
    },
  };
}

function reqConBody(body: unknown) {
  return new Request('https://volkern.app/api/hospitality/onboarding/mapping/deshacer', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as any;
}

function reqGet(query = 'propertyId=p1&unitId=unit_free') {
  return new Request(`https://volkern.app/api/hospitality/onboarding/mapping/deshacer?${query}`) as any;
}

/** Reserva viva tal como la devuelve findMany (fechas Date, guestData Json). */
function reservaDb(overrides: Record<string, unknown> = {}) {
  return {
    id: 'res_1',
    externalBookingId: 'BKG-1',
    channel: 'Airbnb',
    estado: 'confirmed',
    checkIn: new Date('2026-10-10T15:00:00.000Z'),
    checkOut: new Date('2026-10-15T11:00:00.000Z'),
    guestData: { firstName: 'Ana', lastName: 'García' },
    occupancyAdults: 2,
    occupancyChildren: 1,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authenticateRequest.mockResolvedValue({ valid: true, tenant: { id: 't1' }, user: { id: 'u1', role: { id: 'role_test', nombre: 'Superadmin', permisos: { all: true } } } });
  mocks.hospitalityUnit.findFirst.mockResolvedValue(UNIDAD);
  mocks.connectivityMapping.findFirst.mockResolvedValue(vinculoAutomatico());
  mocks.connectivityMapping.update.mockResolvedValue({ id: 'map_auto' });
  mocks.hospitalityReservation.count.mockResolvedValue(0);
  mocks.hospitalityReservation.findMany.mockResolvedValue([]);
  mocks.logAuditAction.mockResolvedValue(undefined);
});

describe('POST /api/hospitality/onboarding/mapping/deshacer', () => {
  it('sin autenticación → 401', async () => {
    mocks.authenticateRequest.mockResolvedValue({ valid: false, error: 'API key no proporcionada' });
    const res = await POST(reqConBody({ propertyId: 'p1', unitId: 'unit_free' }));
    expect(res.status).toBe(401);
  });

  it('apaga el vínculo y deja la unidad libre', async () => {
    const res = await POST(reqConBody({ propertyId: 'p1', unitId: 'unit_free' }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body).toMatchObject({
      unitId: 'unit_free',
      hotelCode: 'sandbox-pms',
      roomCode: 'penthouse',
      eraAutomatico: true,
      reservasEnLaUnidad: 0,
    });

    const update = mocks.connectivityMapping.update.mock.calls[0][0];
    expect(update.where).toEqual({ id: 'map_auto' });
    expect(update.data.estado).toBe('inactivo');
    // Y no se volverá a crear solo para esa habitación.
    expect(update.data.metadata).toMatchObject({
      bloqueaAutoVinculacion: true,
      origen: 'deshecho_por_operador',
      deshechoPor: 'u1',
      motivo: 'codigo_de_unidad',
    });
    expect(mocks.logAuditAction).toHaveBeenCalled();
  });

  it('avisa de las reservas que siguen en la unidad', async () => {
    mocks.hospitalityReservation.findMany.mockResolvedValue([
      reservaDb(),
      reservaDb({ id: 'res_2', externalBookingId: 'BKG-2' }),
    ]);

    const res = await POST(reqConBody({ propertyId: 'p1', unitId: 'unit_free' }));
    const body = await res.json();

    expect(body.reservasEnLaUnidad).toBe(2);
    // Solo las que ocupan la unidad: las canceladas o no-show no cuentan.
    const where = mocks.hospitalityReservation.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({
      tenantId: 't1',
      unitId: 'unit_free',
      estado: { in: ['pending', 'confirmed', 'checked_in'] },
    });
  });

  it('si no se puede listar, el deshacer no falla', async () => {
    mocks.hospitalityReservation.findMany.mockRejectedValue(new Error('boom'));

    const res = await POST(reqConBody({ propertyId: 'p1', unitId: 'unit_free' }));
    const body = await res.json();

    expect(body.ok).toBe(true);
    expect(body.reservasEnLaUnidad).toBe(0);
    expect(mocks.connectivityMapping.update).toHaveBeenCalled();
  });

  it('solo mira los vínculos del tenant y de esa unidad', async () => {
    await POST(reqConBody({ propertyId: 'p1', unitId: 'unit_free' }));

    const where = mocks.connectivityMapping.findFirst.mock.calls[0][0].where;
    expect(where).toMatchObject({
      tenantId: 't1',
      unitId: 'unit_free',
      provider: 'channel_connectivity',
      estado: 'activo',
    });
    expect(mocks.hospitalityUnit.findFirst.mock.calls[0][0].where).toMatchObject({
      id: 'unit_free',
      tenantId: 't1',
      propertyId: 'p1',
    });
  });

  it('rechaza una unidad que no es de la propiedad', async () => {
    mocks.hospitalityUnit.findFirst.mockResolvedValue(null);

    const res = await POST(reqConBody({ propertyId: 'p1', unitId: 'unit_ajena' }));
    const body = await res.json();

    expect(body.ok).toBe(false);
    expect(body.error).toContain('no pertenece a esta propiedad');
    expect(mocks.connectivityMapping.update).not.toHaveBeenCalled();
  });

  it('sin vínculo activo no hay nada que deshacer', async () => {
    mocks.connectivityMapping.findFirst.mockResolvedValue(null);

    const res = await POST(reqConBody({ propertyId: 'p1', unitId: 'unit_free' }));
    const body = await res.json();

    expect(body.ok).toBe(false);
    expect(body.error).toContain('no tiene ningún vínculo activo');
    expect(mocks.connectivityMapping.update).not.toHaveBeenCalled();
  });

  it('avisa de las reservas que siguen en la unidad y las lista', async () => {
    mocks.hospitalityReservation.count.mockResolvedValue(2);
    mocks.hospitalityReservation.findMany.mockResolvedValue([
      reservaDb(),
      reservaDb({ id: 'res_2', externalBookingId: 'BKG-2', guestData: null }),
    ]);

    const res = await POST(reqConBody({ propertyId: 'p1', unitId: 'unit_free' }));
    const body = await res.json();

    expect(body.reservasEnLaUnidad).toBe(2);
    // La lista acompaña al count: es la que pinta el panel para reasignar.
    expect(body.reservas).toHaveLength(2);
    expect(body.reservas[0]).toMatchObject({
      id: 'res_1',
      externalBookingId: 'BKG-1',
      channel: 'Airbnb',
      estado: 'confirmed',
      checkIn: '2026-10-10',
      checkOut: '2026-10-15',
      huesped: 'Ana García',
      huéspedes: 3,
    });
    // Sin guestData no hay nombre, pero la reserva sí viaja.
    expect(body.reservas[1].huesped).toBeNull();
    // Solo las que ocupan la unidad: las canceladas o no-show no cuentan.
    const where = mocks.hospitalityReservation.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({
      tenantId: 't1',
      unitId: 'unit_free',
      estado: { in: ['pending', 'confirmed', 'checked_in'] },
    });
  });

  it('si no se puede listar, el deshacer no falla y degrada a lista vacía', async () => {
    mocks.hospitalityReservation.findMany.mockRejectedValue(new Error('boom'));

    const res = await POST(reqConBody({ propertyId: 'p1', unitId: 'unit_free' }));
    const body = await res.json();

    expect(body.ok).toBe(true);
    expect(body.reservas).toEqual([]);
    expect(body.reservasEnLaUnidad).toBe(0);
    expect(mocks.connectivityMapping.update).toHaveBeenCalled();
  });

  describe('GET preview de reservas en la unidad', () => {
    it('sin autenticación → 401', async () => {
      mocks.authenticateRequest.mockResolvedValue({ valid: false, error: 'no auth' });
      const res = await GET(reqGet());
      expect(res.status).toBe(401);
    });

    it('lista las reservas vivas de la unidad sin tocar nada', async () => {
      mocks.hospitalityReservation.findMany.mockResolvedValue([reservaDb()]);

      const res = await GET(reqGet());
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.ok).toBe(true);
      expect(body.unit).toBe('Penthouse');
      expect(body.total).toBe(1);
      expect(body.reservas[0]).toMatchObject({
        externalBookingId: 'BKG-1',
        huesped: 'Ana García',
        huéspedes: 3,
        checkIn: '2026-10-10',
      });
      // Solo lectura: ni mappings ni auditoría.
      expect(mocks.connectivityMapping.update).not.toHaveBeenCalled();
      expect(mocks.logAuditAction).not.toHaveBeenCalled();
    });

    it('rechaza una unidad que no es de la propiedad', async () => {
      mocks.hospitalityUnit.findFirst.mockResolvedValue(null);

      const res = await GET(reqGet('propertyId=p1&unitId=otra'));
      const body = await res.json();

      expect(body.ok).toBe(false);
      expect(body.error).toContain('no pertenece');
      expect(mocks.hospitalityReservation.findMany).not.toHaveBeenCalled();
    });

    it('exige propiedad y unidad', async () => {
      const res = await GET(reqGet('propertyId=p1'));
      const body = await res.json();

      expect(body.ok).toBe(false);
      expect(body.error).toContain('Indica la propiedad y la unidad');
    });
  });

  it('exige propiedad y unidad', async () => {
    const res = await POST(reqConBody({ propertyId: 'p1' }));
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toContain('Indica la propiedad y la unidad');
  });
});
