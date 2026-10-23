// @vitest-environment node

import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Visibilidad por unidad en el motor directo.
 *
 * El hotel puede publicar una propiedad y, aun así, retirar de su web algunas
 * unidades (venta solo por canal, uso interno, obras...). La exclusión es solo
 * del canal directo: no cambia el estado de la unidad, ni su disponibilidad, ni
 * lo que se empuja a Booking.com. Lo que se vigila aquí es que el catálogo y la
 * cotización la respeten —una unidad retirada no puede volver por la puerta de
 * atrás de la API con su id— y que sin exclusiones todo siga como antes.
 */

const mocks = vi.hoisted(() => ({
  propertyFindMany: vi.fn(),
  unitFindMany: vi.fn(),
  reservationFindMany: vi.fn(),
  blockFindMany: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    hospitalityProperty: { findMany: mocks.propertyFindMany },
    hospitalityUnit: { findMany: mocks.unitFindMany },
    hospitalityReservation: { findMany: mocks.reservationFindMany },
    hospitalityUnitBlock: { findMany: mocks.blockFindMany },
  },
}));

import { cotizarDisponibilidad, listarPropiedadesPublicables } from '@/lib/hospitality/booking-engine';

const config = {
  tenantId: 'tenant_a',
  slug: 'mi-hotel',
  propiedadesPublicadas: ['prop_a'],
  unidadesExcluidas: ['unit_hidden'],
  tarifaLimpieza: null,
  anticipoPorcentaje: 0,
  requierePagoOnline: false,
};

const rango = {
  checkIn: new Date('2027-05-10T00:00:00'),
  checkOut: new Date('2027-05-12T00:00:00'),
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.propertyFindMany.mockResolvedValue([]);
  mocks.unitFindMany.mockResolvedValue([]);
  mocks.reservationFindMany.mockResolvedValue([]);
  mocks.blockFindMany.mockResolvedValue([]);
});

describe('listarPropiedadesPublicables — unidades retiradas de la web', () => {
  it('pide solo las unidades no excluidas', async () => {
    await listarPropiedadesPublicables('tenant_a', config);

    const where = mocks.propertyFindMany.mock.calls[0][0].include.units.where;
    expect(where.id).toEqual({ notIn: ['unit_hidden'] });
    // La regla de venta sigue en pie: mantenimiento y fuera de servicio no salen.
    expect(where.estado).toEqual({ notIn: ['maintenance', 'out_of_service'] });
  });

  it('sin exclusiones no añade filtro: salen todas las unidades', async () => {
    await listarPropiedadesPublicables('tenant_a', { ...config, unidadesExcluidas: [] });

    const where = mocks.propertyFindMany.mock.calls[0][0].include.units.where;
    expect(where).not.toHaveProperty('id');
  });
});

describe('cotizarDisponibilidad — la exclusión también es guarda del servidor', () => {
  it('una unidad retirada no se cotiza aunque su id viaje en la petición', async () => {
    const resultado = await cotizarDisponibilidad({
      tenantId: 'tenant_a',
      config,
      monedaTenant: 'EUR',
      propertyId: 'prop_a',
      unitId: 'unit_hidden',
      ...rango,
      adultos: 2,
      ninos: 0,
      moneda: 'EUR',
    });

    // Segunda consulta del motor: la del catálogo de unidades a cotizar.
    const where = mocks.unitFindMany.mock.calls[1][0].where;
    expect(where.id).toEqual({ equals: 'unit_hidden', notIn: ['unit_hidden'] });
    expect(resultado.ok).toBe(false);
  });

  it('al cotizar la propiedad entera deja fuera las unidades retiradas', async () => {
    await cotizarDisponibilidad({
      tenantId: 'tenant_a',
      config,
      monedaTenant: 'EUR',
      propertyId: 'prop_a',
      unitId: null,
      ...rango,
      adultos: 2,
      ninos: 0,
      moneda: 'EUR',
    });

    expect(mocks.unitFindMany.mock.calls[1][0].where.id).toEqual({ notIn: ['unit_hidden'] });
  });

  it('sin exclusiones consulta todas las unidades vendibles', async () => {
    await cotizarDisponibilidad({
      tenantId: 'tenant_a',
      config: { ...config, unidadesExcluidas: [] },
      monedaTenant: 'EUR',
      propertyId: 'prop_a',
      unitId: 'unit_a',
      ...rango,
      adultos: 2,
      ninos: 0,
      moneda: 'EUR',
    });

    expect(mocks.unitFindMany.mock.calls[1][0].where.id).toBe('unit_a');
  });
});
