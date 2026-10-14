// @vitest-environment node

import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Fotos del catálogo público del Booking Engine (la portada incluida).
 *
 * `fotos` es un Json libre y el editor de propiedades guarda la forma RICA
 * (`{ url, titulo?, portada? }`), no URLs sueltas. Mientras el listado público
 * solo entendía strings, la página de reservas se quedaba sin portada y sus
 * tarjetas de unidad sin foto —con las fotos del hotel dentro—: por eso lo que
 * se vigila aquí es que las dos formas entren y que la portada vaya delante.
 */

const mocks = vi.hoisted(() => ({
  hospitalityProperty: { findMany: vi.fn() },
}));

vi.mock('@/lib/db', () => ({
  prisma: { hospitalityProperty: mocks.hospitalityProperty },
}));

import { listarPropiedadesPublicables } from '@/lib/hospitality/booking-engine';

/** Unidad vendible: sin tarifa no se publica, así que el plan la trae. */
function unidad(datos: Record<string, unknown> = {}) {
  return {
    id: 'unit_a',
    propertyId: 'prop_a',
    nombre: 'Apartamento 1A',
    codigo: null,
    tipo: 'apartamento',
    capacidad: 4,
    descripcion: null,
    fotos: [],
    amenidades: [],
    detalleAlojamiento: null,
    estado: 'available',
    tarifaBase: null,
    ratePlans: [{ tarifa: 100, temporadas: null, finDeSemana: null }],
    ...datos,
  };
}

function propiedad(datos: Record<string, unknown> = {}) {
  return {
    id: 'prop_a',
    tenantId: 'tenant_a',
    nombre: 'Ciudad Patio Cuarenta',
    ciudad: 'Madrid',
    direccion: null,
    descripcion: null,
    fotos: [],
    units: [unidad()],
    ...datos,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.hospitalityProperty.findMany.mockResolvedValue([propiedad()]);
});

describe('listarPropiedadesPublicables — fotos de la ficha', () => {
  it('lee las fotos del editor (forma rica) y no las descarta', async () => {
    mocks.hospitalityProperty.findMany.mockResolvedValue([
      propiedad({
        fotos: [{ url: 'https://cdn/fachada.jpg', titulo: 'Fachada' }],
      }),
    ]);

    const [listada] = await listarPropiedadesPublicables('tenant_a', {
      propiedadesPublicadas: ['prop_a'],
    });

    expect(listada.unidades[0].fotos).toEqual(['https://cdn/fachada.jpg']);
  });

  it('una unidad sin fotos propias enseña las del alojamiento, con su portada delante', async () => {
    mocks.hospitalityProperty.findMany.mockResolvedValue([
      propiedad({
        // El editor marca la portada con `Hacer portada` (va al frente) y los
        // registros antiguos la llevan marcada: `fotos[0]` es la portada.
        fotos: [
          { url: 'https://cdn/salon.jpg' },
          { url: 'https://cdn/fachada.jpg', portada: true },
        ],
      }),
    ]);

    const [listada] = await listarPropiedadesPublicables('tenant_a', {
      propiedadesPublicadas: ['prop_a'],
    });

    expect(listada.unidades[0].fotos).toEqual([
      'https://cdn/fachada.jpg',
      'https://cdn/salon.jpg',
    ]);
    // La portada va delante: es la que la página pública pone de cabecera.
    expect(listada.unidades[0].fotos[0]).toBe('https://cdn/fachada.jpg');
  });

  it('la unidad con fotos propias conserva las suyas', async () => {
    mocks.hospitalityProperty.findMany.mockResolvedValue([
      propiedad({
        fotos: ['https://cdn/propiedad.jpg'],
        units: [
          unidad({
            fotos: [
              'https://cdn/suite-1.jpg',
              { url: 'https://cdn/suite-2.jpg', titulo: 'Dormitorio' },
            ],
          }),
        ],
      }),
    ]);

    const [listada] = await listarPropiedadesPublicables('tenant_a', {
      propiedadesPublicadas: ['prop_a'],
    });

    expect(listada.unidades[0].fotos).toEqual([
      'https://cdn/suite-1.jpg',
      'https://cdn/suite-2.jpg',
    ]);
  });

  it('sin fotos publicadas no inventa ninguna', async () => {
    const [listada] = await listarPropiedadesPublicables('tenant_a', {
      propiedadesPublicadas: ['prop_a'],
    });

    expect(listada.unidades[0].fotos).toEqual([]);
  });
});
