import { describe, it, expect } from 'vitest';

import {
  fotosHospedaje,
  sesDeProperty,
  detalleAlojamientoDe,
  borradorDesdeProperty,
  payloadDesdeBorradorHospedaje,
  estadoSeccionesHospedaje,
  progresoHospedaje,
  hacerPortadaHospedaje,
  contarFotosHospedaje,
  sumarContadores,
  hayDetalle,
  SECCIONES_HOSPEDAJE,
  PRIMERA_SECCION_HOSPEDAJE,
  HABITACIONES_GRUPOS_HOSPEDAJE,
  CAMAS_CATALOGO_HOSPEDAJE,
  detalleCamasHospedaje,
  detalleHabitacionesHospedaje,
  labelDeHabitacionHospedaje,
  miniaturasHospedaje,
  portadaHospedaje,
  reordenarFotosHospedaje,
  resumenFotosHospedaje,
  SERVICIOS_GRUPOS_HOSPEDAJE,
  SERVICIOS_TODOS_HOSPEDAJE,
  infoServicioHospedaje,
  fichaUnidadDeWire,
  payloadUnidadHospedaje,
  TIPOS_UNIDAD_HOSPEDAJE,
  ESTADOS_UNIDAD_HOSPEDAJE,
  FORM_UNIDAD_VACIO,
  type PropertyWire,
} from '../lib/hospitality/property-editor-config';

function vacioFormUnidad() {
  return { ...FORM_UNIDAD_VACIO };
}

function property(overrides: Partial<PropertyWire> = {}): PropertyWire {
  return {
    id: 'hp-1',
    nombre: 'Casa Marfil',
    descripcion: null,
    codigo: null,
    zona: null,
    direccion: null,
    ciudad: null,
    estadoProvincia: null,
    pais: null,
    cp: null,
    latitud: null,
    longitud: null,
    fotos: [],
    sesHospedajes: null,
    timezone: 'America/Mexico_City',
    estado: 'activa',
    politicaNoShow: 'primera_noche',
    politicaSalidaAnticipada: 'salida_real',
    holdHoras: 24,
    units: [],
    ...overrides,
  };
}

describe('fotosHospedaje', () => {
  it('acepta URLs sueltas y objetos { url, titulo, portada }', () => {
    expect(fotosHospedaje(['a.jpg', { url: 'b.jpg', titulo: 'Salón' }])).toEqual([
      { url: 'a.jpg' },
      { url: 'b.jpg', titulo: 'Salón' },
    ]);
  });

  it('descarta basura sin URL y tolera null', () => {
    expect(fotosHospedaje([{}, null, ''])).toEqual([]);
    expect(fotosHospedaje(null)).toEqual([]);
  });

  it('contarFotosHospedaje cuenta solo entradas con URL', () => {
    expect(contarFotosHospedaje(['a', { url: 'b' }, { url: '' }])).toBe(2);
    expect(contarFotosHospedaje(undefined)).toBe(0);
  });
});

describe('sesHospedajes', () => {
  it('extrae código y municipio del Json', () => {
    expect(
      sesDeProperty({ codigoEstablecimiento: 'A1234', municipioIne: '48020' })
    ).toEqual({ codigo: 'A1234', municipio: '48020' });
    expect(sesDeProperty(null)).toEqual({ codigo: '', municipio: '' });
  });

  it('el payload incluye sesHospedajes solo si hay datos', () => {
    const base = borradorDesdeProperty(property());
    expect(payloadDesdeBorradorHospedaje(base).sesHospedajes).toBeUndefined();
    base.sesCodigo = 'A1234';
    expect(payloadDesdeBorradorHospedaje(base).sesHospedajes).toEqual({
      codigoEstablecimiento: 'A1234',
    });
  });
});

describe('borrador ↔ payload', () => {
  it('normaliza fotos a la forma rica en el payload', () => {
    const d = borradorDesdeProperty(property({ fotos: ['a.jpg', { url: 'b.jpg', titulo: 'T' }] }));
    const payload = payloadDesdeBorradorHospedaje(d);
    expect(payload.fotos).toEqual([{ url: 'a.jpg' }, { url: 'b.jpg', titulo: 'T' }]);
  });

  it('holdHoras no válido cae a 24', () => {
    const d = borradorDesdeProperty(property());
    d.holdHoras = 'abc';
    expect(payloadDesdeBorradorHospedaje(d).holdHoras).toBe(24);
  });

  it('hacerPortadaHospedaje mueve la foto al frente', () => {
    const fotos = [{ url: 'a' }, { url: 'b' }, { url: 'c' }];
    expect(hacerPortadaHospedaje(fotos, 2).map((f) => f.url)).toEqual(['c', 'a', 'b']);
    expect(hacerPortadaHospedaje(fotos, 0)).toBe(fotos);
  });
});

describe('estado de completado', () => {
  it('propiedad mínima: operación completa con los tres campos, resto pendiente', () => {
    const estado = estadoSeccionesHospedaje({
      nombre: 'Casa',
      holdHoras: 24,
      timezone: 'Europe/Madrid',
      politicaNoShow: 'primera_noche',
      politicaSalidaAnticipada: 'salida_real',
    });
    expect(estado.descripcion).toBe(false); // falta descripción
    expect(estado.operacion).toBe(true);
    expect(estado.fotos).toBe(false);
    expect(estado.unidades).toBe(false);
  });

  it('operación pendiente si falta cualquiera de los tres campos', () => {
    expect(estadoSeccionesHospedaje({ timezone: 'Europe/Madrid', politicaNoShow: 'ninguna', politicaSalidaAnticipada: 'salida_real' }).operacion).toBe(false);
    expect(estadoSeccionesHospedaje({ holdHoras: 24, politicaNoShow: 'ninguna', politicaSalidaAnticipada: 'salida_real' }).operacion).toBe(false);
  });

  it('unidades completas cuando hay al menos una', () => {
    const estado = estadoSeccionesHospedaje({
      units: [{ id: 'u1', nombre: 'Suite 1' }],
    });
    expect(estado.unidades).toBe(true);
  });

  it('progreso 100% con todo completo', () => {
    const completo = {
      nombre: 'Casa',
      descripcion: 'Desc',
      fotos: [{ url: 'a.jpg' }],
      ciudad: 'Bilbao',
      units: [{ id: 'u1', nombre: 'Suite' }],
      timezone: 'Europe/Madrid',
      politicaNoShow: 'primera_noche',
      politicaSalidaAnticipada: 'salida_real',
      holdHoras: 24,
      sesCodigo: 'A1234',
    };
    expect(progresoHospedaje(completo)).toBe(100);
  });

  it('las secciones están bien formadas (Vista global primero)', () => {
    expect(SECCIONES_HOSPEDAJE.length).toBe(7);
    expect(SECCIONES_HOSPEDAJE.map((s) => s.id)).toEqual([
      'global',
      'descripcion',
      'fotos',
      'ubicacion',
      'unidades',
      'operacion',
      'cumplimiento',
    ]);
    expect(PRIMERA_SECCION_HOSPEDAJE).toBe('global');
  });
});

describe('detalle de alojamiento (Vista global)', () => {
  it('detalleAlojamientoDe normaliza contadores y servicios', () => {
    expect(
      detalleAlojamientoDe({
        habitaciones: { dormitorio: 2, basura: 'x', wc: -1 },
        camas: { cama_doble: 1 },
        servicios: ['wifi', 42, 'piscina'],
      })
    ).toEqual({
      habitaciones: { dormitorio: 2 },
      camas: { cama_doble: 1 },
      servicios: ['wifi', 'piscina'],
    });
    expect(detalleAlojamientoDe(null)).toEqual({ habitaciones: {}, camas: {}, servicios: [] });
    expect(detalleAlojamientoDe('no')).toEqual({ habitaciones: {}, camas: {}, servicios: [] });
  });

  it('sumarContadores suma los valores de un mapa', () => {
    expect(sumarContadores({ a: 2, b: 3 })).toBe(5);
    expect(sumarContadores({})).toBe(0);
    expect(sumarContadores(null)).toBe(0);
  });

  it('hayDetalle solo es verdad con algo declarado', () => {
    expect(hayDetalle({ habitaciones: {}, camas: {}, servicios: [] })).toBe(false);
    expect(hayDetalle({ habitaciones: { wc: 1 }, camas: {}, servicios: [] })).toBe(true);
    expect(hayDetalle({ habitaciones: {}, camas: {}, servicios: ['wifi'] })).toBe(true);
  });

  it('el borrador redondea el detalle desde la property', () => {
    const d = borradorDesdeProperty(
      property({ detalleAlojamiento: { habitaciones: { dormitorio: 2 }, servicios: ['wifi'] } })
    );
    expect(d.detalle.habitaciones).toEqual({ dormitorio: 2 });
    expect(d.detalle.servicios).toEqual(['wifi']);
  });

  it('el payload incluye detalleAlojamiento solo si hay algo', () => {
    const vacio = borradorDesdeProperty(property());
    expect(payloadDesdeBorradorHospedaje(vacio).detalleAlojamiento).toBeNull();

    const lleno = borradorDesdeProperty(property());
    lleno.detalle = {
      habitaciones: { dormitorio: 1 },
      camas: { cama_doble: 1 },
      servicios: ['wifi', 'piscina'],
    };
    expect(payloadDesdeBorradorHospedaje(lleno).detalleAlojamiento).toEqual({
      habitaciones: { dormitorio: 1 },
      camas: { cama_doble: 1 },
      servicios: ['wifi', 'piscina'],
    });
  });

  it('la Vista global queda completa con nombre, descripción y unidades o habitaciones', () => {
    expect(estadoSeccionesHospedaje({ nombre: 'Casa', descripcion: 'D' }).global).toBe(false);
    expect(
      estadoSeccionesHospedaje({
        nombre: 'Casa',
        descripcion: 'D',
        units: [{ id: 'u1', nombre: 'Suite' }],
      }).global
    ).toBe(true);
    expect(
      estadoSeccionesHospedaje({
        nombre: 'Casa',
        descripcion: 'D',
        habitaciones: { dormitorio: 1 },
      }).global
    ).toBe(true);
  });
});

describe('catálogos de la Vista global', () => {
  it('habitaciones privadas y compartidas con ids únicos', () => {
    expect(HABITACIONES_GRUPOS_HOSPEDAJE.map((g) => g.titulo)).toEqual(['Privada', 'Compartida']);
    const ids = HABITACIONES_GRUPOS_HOSPEDAJE.flatMap((g) => g.items.map((i) => i.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('camas del catálogo con ids únicos', () => {
    const ids = CAMAS_CATALOGO_HOSPEDAJE.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('servicios: «Popular» primero, badges de portal e ids únicos', () => {
    expect(SERVICIOS_GRUPOS_HOSPEDAJE[0].titulo).toBe('Popular');
    const ids = SERVICIOS_TODOS_HOSPEDAJE.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    const wifi = infoServicioHospedaje('wifi');
    expect(wifi?.airbnb).toBe(true);
    expect(wifi?.booking).toBe(true);
    expect(infoServicioHospedaje('jacuzzi')?.airbnb).toBeUndefined();
  });
});

describe('unidades de la Vista global (modal clicable)', () => {
  it('fichaUnidadDeWire normaliza la fila de la API y descarta inválidas', () => {
    const ficha = fichaUnidadDeWire({
      id: 'u1',
      nombre: '  Suite 1 ',
      codigo: ' SU1 ',
      tipo: 'apartamento',
      capacidad: '4',
      estado: 'available',
    });
    expect(ficha).toEqual({
      id: 'u1',
      nombre: 'Suite 1',
      codigo: 'SU1',
      tipo: 'apartamento',
      capacidad: 4,
      estado: 'available',
    });
    expect(fichaUnidadDeWire(null)).toBeNull();
    expect(fichaUnidadDeWire({ id: 'x' })).toBeNull(); // sin nombre
    expect(fichaUnidadDeWire({ nombre: 'x' })).toBeNull(); // sin id
    expect(fichaUnidadDeWire({ id: 'x', nombre: '  ' })).toBeNull();
  });

  it('payloadUnidadHospedaje exige nombre y sanea números', () => {
    expect(
      payloadUnidadHospedaje(
        { nombre: ' Suite ', codigo: ' s1 ', tipo: 'estudio', capacidad: '3', estado: 'available' },
        'p1'
      )
    ).toEqual({
      propertyId: 'p1',
      nombre: 'Suite',
      codigo: 's1',
      tipo: 'estudio',
      capacidad: 3,
      estado: 'available',
    });
    expect(payloadUnidadHospedaje({ ...vacioFormUnidad(), nombre: '   ' }, 'p1')).toBeNull();
    const sinCapacidad = { ...vacioFormUnidad(), nombre: 'A', capacidad: 'x' };
    expect(payloadUnidadHospedaje(sinCapacidad, 'p1').capacidad).toBe(2);
  });

  it('los catálogos de unidades tienen ids/valores únicos', () => {
    const tipos = TIPOS_UNIDAD_HOSPEDAJE;
    expect(new Set(tipos).size).toBe(tipos.length);
    const estados = ESTADOS_UNIDAD_HOSPEDAJE.map((e) => e.value);
    expect(new Set(estados).size).toBe(estados.length);
    expect(ESTADOS_UNIDAD_HOSPEDAJE.map((e) => e.label)).toContain('Disponible');
  });
});

describe('detalle por tipo en las tarjetas de la Vista global', () => {
  it('detalleCamasHospedaje lista solo tipos con cantidad y respeta el orden del catálogo', () => {
    expect(detalleCamasHospedaje(null)).toBeNull();
    expect(detalleCamasHospedaje({ habitaciones: {}, camas: {}, servicios: [] })).toBeNull();
    expect(
      detalleCamasHospedaje({ habitaciones: {}, camas: { cama_doble: 0, sofa_cama: -1 }, servicios: [] })
    ).toBeNull();
    const pares = detalleCamasHospedaje({
      habitaciones: {},
      camas: { sofa_cama: 1, cama_doble: 2 },
      servicios: [],
    });
    expect(pares).toEqual([
      ['cama_doble', 2],
      ['sofa_cama', 1],
    ]);
  });

  it('detalleHabitacionesHospedaje usa el flatten de privadas + compartidas', () => {
    expect(detalleHabitacionesHospedaje(undefined)).toBeNull();
    const pares = detalleHabitacionesHospedaje({
      habitaciones: { bano: 2, cocina_compartida: 1 },
      camas: {},
      servicios: [],
    });
    expect(pares).toEqual([
      ['bano', 2],
      ['cocina_compartida', 1],
    ]);
  });

  it('labelDeHabitacionHospedaje resuelve ids de ambos grupos y cae al id', () => {
    expect(labelDeHabitacionHospedaje('bano')).toBe('Baño');
    expect(labelDeHabitacionHospedaje('cama_doble')).toBe('Cama doble');
    expect(labelDeHabitacionHospedaje('id_inexistente')).toBe('id_inexistente');
  });
});

describe('tarjeta de fotos de la Vista global', () => {
  it('miniaturasHospedaje toma las primeras válidas y limita a max', () => {
    expect(miniaturasHospedaje(null)).toEqual([]);
    expect(miniaturasHospedaje([])).toEqual([]);
    expect(miniaturasHospedaje(['', { titulo: 'sin url' }, { url: '' }])).toEqual([]);
    expect(miniaturasHospedaje(['https://a/1.jpg', 'https://a/2.jpg'])).toEqual([
      { url: 'https://a/1.jpg' },
      { url: 'https://a/2.jpg' },
    ]);
    expect(
      miniaturasHospedaje([{ url: 'https://a/1.jpg', titulo: 'Salón', portada: true }, 'https://a/2.jpg'])
    ).toEqual([{ url: 'https://a/1.jpg', titulo: 'Salón' }, { url: 'https://a/2.jpg' }]);
    expect(miniaturasHospedaje(['1', '2', '3', '4', '5'].map((n) => `https://a/${n}.jpg`), 3)).toEqual([
      { url: 'https://a/1.jpg' },
      { url: 'https://a/2.jpg' },
      { url: 'https://a/3.jpg' },
    ]);
  });

  it('resumenFotosHospedaje cuenta y detecta la portada', () => {
    expect(resumenFotosHospedaje(null)).toBe('Sin fotos');
    expect(resumenFotosHospedaje([])).toBe('Sin fotos');
    expect(resumenFotosHospedaje([''])).toBe('Sin fotos');
    expect(resumenFotosHospedaje(['https://a/1.jpg'])).toBe('1 foto');
    expect(resumenFotosHospedaje([{ url: 'https://a/1.jpg', portada: true }, 'https://a/2.jpg'])).toBe(
      '2 fotos · portada asignada'
    );
    expect(resumenFotosHospedaje([{ url: 'https://a/1.jpg' }, { url: 'https://a/2.jpg' }])).toBe('2 fotos');
  });

  it('portadaHospedaje prefiere la foto marcada y cae a la primera válida', () => {
    expect(portadaHospedaje(null)).toBeNull();
    expect(portadaHospedaje([])).toBeNull();
    expect(portadaHospedaje(['', { url: '' }])).toBeNull();
    expect(portadaHospedaje([{ url: 'https://a/1.jpg' }, { url: 'https://a/2.jpg' }])).toEqual({
      url: 'https://a/1.jpg',
    });
    expect(
      portadaHospedaje([
        { url: 'https://a/1.jpg', titulo: 'Salón' },
        { url: 'https://a/2.jpg', portada: true, titulo: 'Fachada' },
      ])
    ).toEqual({ url: 'https://a/2.jpg', titulo: 'Fachada' });
  });

  it('reordenarFotosHospedaje mueve elementos y protege índices inválidos', () => {
    const base = ['a', 'b', 'c', 'd'];
    expect(reordenarFotosHospedaje(base, 0, 2)).toEqual(['b', 'c', 'a', 'd']);
    expect(reordenarFotosHospedaje(base, 3, 0)).toEqual(['d', 'a', 'b', 'c']);
    expect(reordenarFotosHospedaje(base, 1, 1)).toEqual(base);
    expect(reordenarFotosHospedaje(base, -1, 2)).toEqual(base);
    expect(reordenarFotosHospedaje(base, 0, 4)).toEqual(base);
    expect(reordenarFotosHospedaje(base, 0.5, 2)).toEqual(base);
    expect(reordenarFotosHospedaje(null, 0, 1)).toEqual([]);
    // No muta el original
    expect(base).toEqual(['a', 'b', 'c', 'd']);
  });
});
