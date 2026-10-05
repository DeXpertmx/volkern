import { describe, it, expect } from 'vitest';

import {
  normalizarDetalleUnidad,
  hayDetalleUnidad,
  agregarDetallesUnidades,
  encogerDetalleAServicios,
  DETALLE_UNIDAD_VACIO,
} from '../lib/hospitality/unit-detalle';

describe('detalle de la unidad (habitaciones y camas por unidad)', () => {
  it('normaliza contadores y descarta basura', () => {
    expect(
      normalizarDetalleUnidad({
        habitaciones: { dormitorio: 2, basura: 'x', wc: -1 },
        camas: { cama_doble: 1, sofa_cama: 0, extra: 1.5 },
        servicios: ['wifi'], // ajeno a la unidad: se descarta
      })
    ).toEqual({
      habitaciones: { dormitorio: 2 },
      camas: { cama_doble: 1 }, // el 0 es ruido y el decimal, basura
    });
  });

  it('vacío o inválido = null (sin configurar)', () => {
    expect(normalizarDetalleUnidad(null)).toBeNull();
    expect(normalizarDetalleUnidad('no')).toBeNull();
    expect(normalizarDetalleUnidad({})).toBeNull();
    expect(normalizarDetalleUnidad({ habitaciones: {}, camas: {} })).toBeNull();
    expect(normalizarDetalleUnidad([])).toBeNull();
  });

  it('hayDetalleUnidad refleja si hay algo declarado', () => {
    expect(hayDetalleUnidad(DETALLE_UNIDAD_VACIO)).toBe(false);
    expect(hayDetalleUnidad({ habitaciones: { wc: 1 }, camas: {} })).toBe(true);
    expect(hayDetalleUnidad({ habitaciones: {}, camas: { cama_doble: 2 } })).toBe(true);
  });

  it('agregarDetallesUnidades suma habitaciones y camas de todas las unidades', () => {
    expect(
      agregarDetallesUnidades([
        { habitaciones: { dormitorio: 1 }, camas: { cama_doble: 1 } },
        { habitaciones: { dormitorio: 1, salon: 1 }, camas: { sofa_cama: 1 } },
      ])
    ).toEqual({
      habitaciones: { dormitorio: 2, salon: 1 },
      camas: { cama_doble: 1, sofa_cama: 1 },
    });
  });

  it('agregarDetallesUnidades ignora nulos/unidades sin detalle y devuelve null si nada declara', () => {
    expect(agregarDetallesUnidades([null, {}, { habitaciones: {}, camas: {} }])).toBeNull();
    expect(agregarDetallesUnidades([])).toBeNull();
  });

  it('encogerDetalleAServicios deja solo las áreas comunes del complejo', () => {
    expect(encogerDetalleAServicios({ habitaciones: { dormitorio: 2 }, servicios: ['piscina', 'aparcamiento'] })).toEqual({
      servicios: ['piscina', 'aparcamiento'],
    });
    expect(encogerDetalleAServicios({ servicios: ['wifi', '', 42] })).toEqual({ servicios: ['wifi'] });
    expect(encogerDetalleAServicios({ servicios: [] })).toBeNull();
    expect(encogerDetalleAServicios({ habitaciones: { dormitorio: 1 } })).toBeNull();
    expect(encogerDetalleAServicios(null)).toBeNull();
    expect(encogerDetalleAServicios('no')).toBeNull();
  });
});
