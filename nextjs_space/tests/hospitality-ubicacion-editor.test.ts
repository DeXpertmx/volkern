import { describe, it, expect } from 'vitest';

import {
  DISTANCIAS_CATALOGO,
  DISTANCIAS_VACIAS,
  distanciasDe,
  hayDistancias,
  indicacionesDe,
  borradorDesdeProperty,
  payloadDesdeBorradorHospedaje,
  type PropertyWire,
} from '@/lib/hospitality/property-editor-config';

const PROPERTY_BASE: PropertyWire = {
  id: 'prop-1',
  nombre: 'Villa Test',
};

describe('ubicación enriquecida — distancias', () => {
  it('normaliza el Json crudo al borrador (números a texto, unidad canónica)', () => {
    const d = distanciasDe({ aeropuertoKm: 12.5, puertoKm: '0.4', unidad: 'millas' });
    expect(d.aeropuertoKm).toBe('12.5');
    expect(d.puertoKm).toBe('0.4');
    expect(d.metroKm).toBe('');
    expect(d.unidad).toBe('millas');
  });

  it('unidad inválida cae a km y basura devuelve el vacío', () => {
    expect(distanciasDe({ unidad: 'leguas' }).unidad).toBe('km');
    expect(distanciasDe(null)).toEqual(DISTANCIAS_VACIAS);
    expect(distanciasDe('pepe')).toEqual(DISTANCIAS_VACIAS);
    expect(distanciasDe([1, 2])).toEqual(DISTANCIAS_VACIAS);
  });

  it('hayDistancias distingue vacío de algo y el catálogo tiene las 6 distancias', () => {
    expect(hayDistancias(DISTANCIAS_VACIAS)).toBe(false);
    expect(hayDistancias({ ...DISTANCIAS_VACIAS, trenKm: '3' })).toBe(true);
    expect(DISTANCIAS_CATALOGO.map((x) => x.key)).toEqual([
      'aeropuertoKm',
      'autobusKm',
      'metroKm',
      'trenKm',
      'autopistaKm',
      'puertoKm',
    ]);
  });

  it('el payload serializa números y unidad; vacío envía null (limpia)', () => {
    const borrador = borradorDesdeProperty(PROPERTY_BASE);
    const conDistancias = {
      ...borrador,
      distancias: { ...DISTANCIAS_VACIAS, aeropuertoKm: '12.5' },
    };
    expect(payloadDesdeBorradorHospedaje(conDistancias).distancias).toEqual({
      aeropuertoKm: 12.5,
      unidad: 'km',
    });
    expect(payloadDesdeBorradorHospedaje(borrador).distancias).toBeNull();
  });
});

describe('ubicación enriquecida — indicaciones', () => {
  it('normaliza Record<idioma, texto> y descarta textos vacíos', () => {
    const i = indicacionesDe({ es: 'Gire en la plaza', en: '  ', fr: null, de: 42 });
    expect(i).toEqual({ es: 'Gire en la plaza' });
  });

  it('basura devuelve objeto vacío', () => {
    expect(indicacionesDe(null)).toEqual({});
    expect(indicacionesDe(['x'])).toEqual({});
  });

  it('el payload envía las indicaciones o null para limpiar', () => {
    const borrador = borradorDesdeProperty(PROPERTY_BASE);
    const conIndicaciones = { ...borrador, indicaciones: { es: 'Texto', en: 'Text' } };
    expect(payloadDesdeBorradorHospedaje(conIndicaciones).indicaciones).toEqual({ es: 'Texto', en: 'Text' });
    expect(payloadDesdeBorradorHospedaje(borrador).indicaciones).toBeNull();
  });
});

describe('ubicación enriquecida — mapa personalizado', () => {
  it('borrador lo trae como texto y el payload lo manda o limpia con null', () => {
    const conMapa = borradorDesdeProperty({ ...PROPERTY_BASE, mapaPersonalizadoUrl: 'https://cdn/x.png' });
    expect(conMapa.mapaPersonalizadoUrl).toBe('https://cdn/x.png');
    expect(payloadDesdeBorradorHospedaje(conMapa).mapaPersonalizadoUrl).toBe('https://cdn/x.png');
    expect(payloadDesdeBorradorHospedaje(borradorDesdeProperty(PROPERTY_BASE)).mapaPersonalizadoUrl).toBeNull();
  });
});
