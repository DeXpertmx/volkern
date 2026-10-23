// @vitest-environment node

import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Guardado de la configuración del Booking Engine: ausente = SIN CAMBIO.
 *
 * La regla nace de un fallo real: el panel guarda el aspecto (plantilla, colores
 * y dominio) y no manda el resto de campos. Cuando lo ausente se escribía como su
 * valor por defecto, cada guardado de los colores borraba el título, las
 * políticas y —lo peor— la lista de propiedades publicadas, dejando la página
 * pública vacía: sin unidades que reservar y sin una sola foto que enseñar.
 */

const mocks = vi.hoisted(() => ({
  hospitalityProperty: { findMany: vi.fn() },
  hospitalityBookingConfig: { upsert: vi.fn() },
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    hospitalityProperty: mocks.hospitalityProperty,
    hospitalityBookingConfig: mocks.hospitalityBookingConfig,
  },
}));

import { guardarConfigBooking } from '@/lib/hospitality/booking-config';

/** El `update` que se envió a Prisma en la última llamada. */
function updateEnviado(): Record<string, unknown> {
  return mocks.hospitalityBookingConfig.upsert.mock.calls[0][0].update;
}

function createEnviado(): Record<string, unknown> {
  return mocks.hospitalityBookingConfig.upsert.mock.calls[0][0].create;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.hospitalityProperty.findMany.mockResolvedValue([
    { id: 'prop_a', units: [{ id: 'unit_a1' }, { id: 'unit_a2' }] },
    { id: 'prop_b', units: [{ id: 'unit_b1' }] },
  ]);
  mocks.hospitalityBookingConfig.upsert.mockResolvedValue({ id: 'cfg_1', slug: 'mi-hotel' });
});

describe('guardarConfigBooking — lo que no viene, no se toca', () => {
  it('guardar el aspecto no despublica la página ni borra el título', async () => {
    const res = await guardarConfigBooking('tenant_a', 'MXN', {
      slug: 'mi-hotel',
      plantilla: 'moderna',
      personalizacion: { colorPrimario: '#0f766e' },
    });

    expect(res.ok).toBe(true);
    const update = updateEnviado();
    expect(update.plantilla).toBe('moderna');
    // Ni la lista de publicadas ni el texto de la página viajan: se conservan.
    expect(update).not.toHaveProperty('propiedadesPublicadas');
    expect(update).not.toHaveProperty('titulo');
    expect(update).not.toHaveProperty('descripcion');
    expect(update).not.toHaveProperty('politicaCancelacion');
    expect(update).not.toHaveProperty('anticipoPorcentaje');
    // Y el interruptor de la página tampoco se reenciende solo.
    expect(update).not.toHaveProperty('activo');
    expect(update).not.toHaveProperty('requierePagoOnline');
  });

  it('en el alta los campos omitidos los pone el esquema (sin publicadas, página activa)', async () => {
    await guardarConfigBooking('tenant_a', 'MXN', { slug: 'mi-hotel' });

    const create = createEnviado();
    expect(create.tenantId).toBe('tenant_a');
    expect(create).not.toHaveProperty('propiedadesPublicadas');
    expect(create).not.toHaveProperty('activo');
    expect(create).not.toHaveProperty('titulo');
  });

  it('la lista presente se sanea contra las propiedades del tenant', async () => {
    await guardarConfigBooking('tenant_a', 'MXN', {
      slug: 'mi-hotel',
      propiedadesPublicadas: ['prop_b', 'prop_ajena', 'prop_a', 'prop_b'],
    });

    // Solo las suyas, sin repetidos y en el orden pedido.
    expect(updateEnviado().propiedadesPublicadas).toEqual(['prop_b', 'prop_a']);
  });

  it('una lista vacía presente sí despublica todo (es una decisión del hotel)', async () => {
    await guardarConfigBooking('tenant_a', 'MXN', { slug: 'mi-hotel', propiedadesPublicadas: [] });

    expect(updateEnviado().propiedadesPublicadas).toEqual([]);
  });

  it('las unidades excluidas se sanean contra las unidades del tenant', async () => {
    await guardarConfigBooking('tenant_a', 'MXN', {
      slug: 'mi-hotel',
      unidadesExcluidas: ['unit_a2', 'unit_ajena', 'unit_a2', 'unit_b1'],
    });

    // Solo las suyas, sin repetidos y en el orden pedido.
    expect(updateEnviado().unidadesExcluidas).toEqual(['unit_a2', 'unit_b1']);
  });

  it('sin unidadesExcluidas en el cuerpo no se toca la visibilidad guardada', async () => {
    await guardarConfigBooking('tenant_a', 'MXN', { slug: 'mi-hotel', plantilla: 'moderna' });

    expect(updateEnviado()).not.toHaveProperty('unidadesExcluidas');
  });

  it('una lista vacía de excluidas vuelve a enseñar todas las unidades', async () => {
    await guardarConfigBooking('tenant_a', 'MXN', { slug: 'mi-hotel', unidadesExcluidas: [] });

    expect(updateEnviado().unidadesExcluidas).toEqual([]);
  });

  it('los campos presentes se escriben, incluido desactivar la página', async () => {
    await guardarConfigBooking('tenant_a', 'MXN', {
      slug: 'mi-hotel',
      titulo: 'Reserva en el centro',
      activo: false,
      requierePagoOnline: true,
      anticipoPorcentaje: 25,
    });

    const update = updateEnviado();
    expect(update.titulo).toBe('Reserva en el centro');
    expect(update.activo).toBe(false);
    expect(update.requierePagoOnline).toBe(true);
    expect(update.anticipoPorcentaje).toBe(25);
  });
});
