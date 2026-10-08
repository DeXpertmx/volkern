import { describe, it, expect } from 'vitest';

import {
  estadoSecciones,
  progresoGlobal,
  sumarDetalle,
  contarFotos,
  infoServicio,
  SECCIONES_EDITOR,
  GRUPOS_EDITOR,
  HABITACIONES_GRUPOS,
  CAMAS_CATALOGO,
  SERVICIOS_GRUPOS,
} from '../lib/real-estate/property-editor-config';
import {
  borradorDesdeInmueble,
  payloadDesdeBorrador,
  estadoDesdeBorrador,
  mediaAFotos,
  hacerPortada,
  dormitoriosEfectivos,
  banosEfectivos,
} from '../lib/real-estate/property-editor-draft';
import type { InmuebleParsed } from '../lib/real-estate/property-helpers';

/** Fixture de inmueble con el mínimo imprescindible. */
function inmueble(overrides: Partial<InmuebleParsed> = {}): InmuebleParsed {
  return {
    id: 'inm-1',
    tenantId: 't1',
    nombre: 'Apartamento centro',
    descripcion: null,
    precioBase: 150000,
    moneda: 'EUR',
    activo: true,
    destacado: false,
    media: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    operationType: null,
    propertyType: null,
    areaM2: null,
    builtM2: null,
    bedrooms: null,
    bathrooms: null,
    parking: null,
    roomsDetail: null,
    bedsDetail: null,
    servicios: null,
    address: null,
    city: null,
    lat: null,
    lng: null,
    yearBuilt: null,
    hasElevator: false,
    hasParking: false,
    hasPool: false,
    hasGarden: false,
    hasStorageRoom: false,
    hasTerrace: false,
    hasBalcony: false,
    hasAirConditioning: false,
    hasHeating: false,
    furnished: false,
    orientation: null,
    energyCert: null,
    energyCertConsumption: null,
    energyCertEmission: null,
    energyCertBody: null,
    energyCertDate: null,
    energyCertExpiry: null,
    energyCertUrl: null,
    status: 'disponible',
    featured: false,
    longDescription: null,
    seoTags: null,
    owner: { name: null, phone: null, email: null, contactId: null },
    ...overrides,
  } as InmuebleParsed;
}

describe('estadoSecciones / progresoGlobal', () => {
  it('propiedad mínima: solo descripción y disponibilidad completas', () => {
    const estado = estadoSecciones({
      nombre: 'Piso',
      descripcion: 'Luminoso y céntrico',
      status: 'disponible',
    });
    expect(estado.descripcion).toBe(true);
    expect(estado.disponibilidad).toBe(true);
    expect(estado.fotos).toBe(false);
    expect(estado.precios).toBe(false);
  });

  it('sin texto de descripción la sección queda pendiente aunque haya nombre', () => {
    expect(estadoSecciones({ nombre: 'Piso' }).descripcion).toBe(false);
  });

  it('fotos cuentan URLs sueltas y objetos { url }', () => {
    expect(contarFotos(['a.jpg', { url: 'b.jpg' }])).toBe(2);
    expect(contarFotos(null)).toBe(0);
    expect(contarFotos([{ url: '' }])).toBe(0);
  });

  it('contacto completa con cualquier dato del propietario', () => {
    expect(estadoSecciones({ owner: { name: 'Ana' } }).contacto).toBe(true);
    expect(estadoSecciones({ owner: { phone: '600' } }).contacto).toBe(true);
    expect(estadoSecciones({ owner: { email: 'a@b.c' } }).contacto).toBe(true);
    expect(estadoSecciones({ owner: {} }).contacto).toBe(false);
  });

  it('habitaciones completa con bedrooms, detalle o camas', () => {
    expect(estadoSecciones({ bedrooms: 2 }).habitaciones).toBe(true);
    expect(
      estadoSecciones({ roomsDetail: { dormitorio: 2 } }).habitaciones
    ).toBe(true);
    expect(
      estadoSecciones({ bedsDetail: { cama_doble: 1 } }).habitaciones
    ).toBe(true);
    expect(estadoSecciones({}).habitaciones).toBe(false);
  });

  it('equipamiento completa con lista o booleanos clásicos', () => {
    expect(estadoSecciones({ servicios: ['wifi'] }).equipamiento).toBe(true);
    expect(estadoSecciones({ hasElevator: true }).equipamiento).toBe(true);
    expect(estadoSecciones({}).equipamiento).toBe(false);
  });

  it('progreso 100% con todo completo y menos con algo pendiente', () => {
    const completo = {
      nombre: 'Piso',
      descripcion: 'Desc',
      media: [{ url: 'a.jpg' }],
      city: 'Madrid',
      owner: { name: 'Ana' },
      bedrooms: 2,
      servicios: ['wifi'],
      precioBase: 100,
      status: 'disponible',
      energyCert: 'A',
    };
    expect(progresoGlobal(completo)).toBe(100);
    expect(progresoGlobal({ nombre: 'Piso' })).toBeLessThan(100);
  });
});

describe('catálogos', () => {
  it('los grupos y secciones están bien formados', () => {
    expect(GRUPOS_EDITOR.map((g) => g.id)).toEqual(['detalles', 'reserva', 'canales']);
    expect(SECCIONES_EDITOR.length).toBe(10);
    expect(HABITACIONES_GRUPOS.map((g) => g.titulo)).toEqual(['Privada', 'Compartida']);
    expect(CAMAS_CATALOGO.length).toBeGreaterThan(5);
    expect(SERVICIOS_GRUPOS[0].titulo).toBe('Popular');
    expect(infoServicio('ascensor')?.boolKey).toBe('hasElevator');
  });

  it('sumarDetalle suma contadores tolerando null', () => {
    expect(sumarDetalle({ a: 1, b: 2 })).toBe(3);
    expect(sumarDetalle(null)).toBe(0);
    expect(sumarDetalle(undefined)).toBe(0);
  });
});

describe('borrador ↔ payload', () => {
  it('borradorDesdeInmueble tolera media en ambas formas', () => {
    const d = borradorDesdeInmueble(
      inmueble({ media: ['a.jpg', { url: 'b.jpg', titulo: 'Salón' }] })
    );
    expect(d.media).toEqual([{ url: 'a.jpg' }, { url: 'b.jpg', titulo: 'Salón' }]);
    expect(d.precioBase).toBe('150000');
  });

  it('dormitorios efectivos: el detalle manda sobre el campo clásico', () => {
    const d = borradorDesdeInmueble(inmueble({ bedrooms: 5 }));
    d.roomsDetail = { dormitorio: 3 };
    expect(dormitoriosEfectivos(d)).toBe(3);
    d.roomsDetail = {};
    expect(dormitoriosEfectivos(d)).toBe(5);
  });

  it('baños efectivos con el contador de baño', () => {
    const d = borradorDesdeInmueble(inmueble({ bathrooms: 2 }));
    d.roomsDetail = { bano: 1 };
    expect(banosEfectivos(d)).toBe(1);
  });

  it('payload omite números inválidos y conserva títulos de foto', () => {
    const d = borradorDesdeInmueble(inmueble({}));
    d.lat = '';
    d.precioBase = '250000';
    d.media = [{ url: 'a.jpg' }, { url: 'b.jpg', titulo: 'Fachada' }];
    const payload = payloadDesdeBorrador(d);
    expect(payload.lat).toBeUndefined();
    expect(payload.precioBase).toBe(250000);
    expect(payload.media).toEqual([
      { url: 'a.jpg' },
      { url: 'b.jpg', titulo: 'Fachada' },
    ]);
  });

  it('estadoDesdeBorrador proyecta números parseados', () => {
    const d = borradorDesdeInmueble(inmueble({ bedrooms: 4 }));
    d.precioBase = '900';
    const proyeccion = estadoDesdeBorrador(d);
    expect(proyeccion.precioBase).toBe(900);
    expect(proyeccion.bedrooms).toBe(4);
  });

  it('hacerPortada mueve la foto elegida al frente', () => {
    const fotos = [{ url: 'a' }, { url: 'b' }, { url: 'c' }];
    const nuevas = hacerPortada(fotos, 2);
    expect(nuevas[0].url).toBe('c');
    expect(nuevas.map((f) => f.url)).toEqual(['c', 'a', 'b']);
  });

  it('mediaAFotos descarta entradas sin URL', () => {
    expect(mediaAFotos([{ url: 'x' }, 'y'])).toEqual([{ url: 'x' }, { url: 'y' }]);
    expect(mediaAFotos([{}, null])).toEqual([]);
  });
});
