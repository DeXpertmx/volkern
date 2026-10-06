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
  SECCIONES_UNIDAD_HOSPEDAJE,
  PRIMERA_SECCION_UNIDAD,
  AMENIDADES_UNIDAD_CATALOGO,
  MONEDAS_UNIDAD_CATALOGO,
  fotosUnidadDe,
  amenidadesUnidadDe,
  borradorDesdeUnidad,
  hayEspacioUnidad,
  payloadDesdeBorradorUnidad,
  estadoSeccionesUnidadHospedaje,
  progresoUnidadHospedaje,
  resumenHabitacionesUnidad,
  resumenCamasUnidad,
  resumenAmenidadesUnidad,
  resumenTarifaUnidad,
  type PropertyWire,
  type UnitWireFull,
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
  it('detalleAlojamientoDe lee SOLO servicios (habitaciones/camas son de la unidad)', () => {
    // Un detalle antiguo con habitaciones/camas las descarta: desde el
    // reencuadre son un agregado de las unidades, no valor de la propiedad.
    expect(
      detalleAlojamientoDe({
        habitaciones: { dormitorio: 2, basura: 'x', wc: -1 },
        camas: { cama_doble: 1 },
        servicios: ['wifi', 42, 'piscina'],
      })
    ).toEqual({ servicios: ['wifi', 'piscina'] });
    expect(detalleAlojamientoDe(null)).toEqual({ servicios: [] });
    expect(detalleAlojamientoDe('no')).toEqual({ servicios: [] });
    expect(detalleAlojamientoDe({ servicios: ['', 'wifi'] })).toEqual({ servicios: ['wifi'] });
  });

  it('sumarContadores suma los valores de un mapa', () => {
    expect(sumarContadores({ a: 2, b: 3 })).toBe(5);
    expect(sumarContadores({})).toBe(0);
    expect(sumarContadores(null)).toBe(0);
  });

  it('hayDetalle solo es verdad con servicios declarados', () => {
    expect(hayDetalle({ servicios: [] })).toBe(false);
    expect(hayDetalle({ servicios: ['wifi'] })).toBe(true);
  });

  it('el borrador redondea servicios desde la property y agrega las unidades', () => {
    const d = borradorDesdeProperty(
      property({
        detalleAlojamiento: { habitaciones: { dormitorio: 2 }, servicios: ['wifi'] },
        units: [
          { id: 'u1', nombre: 'Suite', detalleAlojamiento: { habitaciones: { dormitorio: 1 }, camas: { cama_doble: 1 } } },
          { id: 'u2', nombre: 'Loft', detalleAlojamiento: { habitaciones: { dormitorio: 1, salon: 1 }, camas: { sofa_cama: 1 } } },
        ],
      })
    );
    expect(d.detalle).toEqual({ servicios: ['wifi'] });
    // El agregado SOLO LECTURA suma habitaciones y camas de las unidades.
    expect(d.agregadoUnidades).toEqual({
      habitaciones: { dormitorio: 2, salon: 1 },
      camas: { cama_doble: 1, sofa_cama: 1 },
    });
  });

  it('el payload envía solo servicios (habitaciones/camas nunca salen de la propiedad)', () => {
    const vacio = borradorDesdeProperty(property());
    expect(payloadDesdeBorradorHospedaje(vacio).detalleAlojamiento).toBeNull();

    const lleno = borradorDesdeProperty(property());
    lleno.detalle = { servicios: ['wifi', 'piscina'] };
    expect(payloadDesdeBorradorHospedaje(lleno).detalleAlojamiento).toEqual({
      servicios: ['wifi', 'piscina'],
    });
  });

  it('la Vista global queda completa con nombre, descripción y UNIDADES (no habitaciones)', () => {
    expect(estadoSeccionesHospedaje({ nombre: 'Casa', descripcion: 'D' }).global).toBe(false);
    expect(
      estadoSeccionesHospedaje({
        nombre: 'Casa',
        descripcion: 'D',
        units: [{ id: 'u1', nombre: 'Suite' }],
      }).global
    ).toBe(true);
    // Sin unidades, declarar habitaciones ya NO completa la sección: la
    // distribución es de la unidad.
    expect(
      estadoSeccionesHospedaje({
        nombre: 'Casa',
        descripcion: 'D',
        habitaciones: { dormitorio: 1 },
      }).global
    ).toBe(false);
  });

  it('las proyecciones de tarjeta leen el AGREGADO/unidad, no la propiedad', () => {
    const agregado = { habitaciones: { dormitorio: 2, salon: 1 }, camas: { cama_doble: 1 } };
    expect(detalleHabitacionesHospedaje(agregado)).toEqual([
      ['dormitorio', 2],
      ['salon', 1],
    ]);
    expect(detalleCamasHospedaje(agregado)).toEqual([['cama_doble', 1]]);
    expect(sumarContadores(agregado.camas)).toBe(1);
    expect(detalleHabitacionesHospedaje(null)).toBeNull();
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

// ─── Editor de unidad por secciones (mismo UX que la propiedad) ──────────────

function unidadWire(overrides: Partial<UnitWireFull> = {}): UnitWireFull {
  return {
    id: 'u-1',
    propertyId: 'hp-1',
    nombre: 'Suite Océano 101',
    codigo: 'SUI-101',
    tipo: 'apartamento',
    capacidad: 4,
    tarifaBase: 200,
    moneda: 'EUR',
    descripcion: 'Vista al mar',
    fotos: ['https://cdn.example.com/f1.jpg', { url: 'https://cdn.example.com/f2.jpg' }],
    amenidades: ['Wifi', 'Wifi', 'Alberca', ''],
    detalleAlojamiento: { habitaciones: { dormitorio: 2, basura: 0 }, camas: { cama_doble: 1 } },
    estado: 'available',
    ...overrides,
  };
}

describe('SECCIONES_UNIDAD_HOSPEDAJE', () => {
  it('arranca en la vista global y tiene grupos como la propiedad', () => {
    expect(PRIMERA_SECCION_UNIDAD).toBe('general');
    expect(SECCIONES_UNIDAD_HOSPEDAJE[0]).toMatchObject({ id: 'general', grupo: 'Vista global' });
    expect(SECCIONES_UNIDAD_HOSPEDAJE.map((s) => s.id)).toEqual([
      'general',
      'basico',
      'espacio',
      'amenidades',
      'fotos',
      'tarifas',
    ]);
  });
});

describe('fotosUnidadDe y amenidadesUnidadDe', () => {
  it('sanean URLs (strings u objetos { url }) y amenidades sin duplicados', () => {
    const u = unidadWire();
    expect(fotosUnidadDe(u.fotos)).toEqual([
      'https://cdn.example.com/f1.jpg',
      'https://cdn.example.com/f2.jpg',
    ]);
    expect(amenidadesUnidadDe(u.amenidades)).toEqual(['Wifi', 'Alberca']);
    expect(fotosUnidadDe(null)).toEqual([]);
    expect(amenidadesUnidadDe('no-array')).toEqual([]);
  });
});

describe('borradorDesdeUnidad', () => {
  it('normaliza el detalle con el módulo unit-detalle (descarta basura y ceros)', () => {
    const d = borradorDesdeUnidad(unidadWire());
    expect(d.habitaciones).toEqual({ dormitorio: 2 });
    expect(d.camas).toEqual({ cama_doble: 1 });
    expect(d.capacidad).toBe('4');
    expect(d.tarifaBase).toBe('200');
    expect(d.amenidades).toEqual(['Wifi', 'Alberca']);
  });

  it('una unidad sin detalle ni tarifa nace con contadores vacíos y tarifa vacía', () => {
    const d = borradorDesdeUnidad(unidadWire({ detalleAlojamiento: null, tarifaBase: null }));
    expect(d.habitaciones).toEqual({});
    expect(d.camas).toEqual({});
    expect(d.tarifaBase).toBe('');
  });
});

describe('hayEspacioUnidad', () => {
  it('es false con contadores vacíos y true con cualquier contador positivo', () => {
    expect(hayEspacioUnidad({ habitaciones: {}, camas: {} })).toBe(false);
    expect(hayEspacioUnidad({ habitaciones: { dormitorio: 1 }, camas: {} })).toBe(true);
    expect(hayEspacioUnidad({ habitaciones: {}, camas: { cama_doble: 2 } })).toBe(true);
  });
});

describe('payloadDesdeBorradorUnidad', () => {
  it('convierte a números capacidad y tarifa y limpia vacíos como la API', () => {
    const payload = payloadDesdeBorradorUnidad({
      ...borradorDesdeUnidad(unidadWire()),
      capacidad: '4',
      tarifaBase: '200',
    });
    expect(payload).toMatchObject({
      nombre: 'Suite Océano 101',
      codigo: 'SUI-101',
      capacidad: 4,
      tarifaBase: 200,
      detalleAlojamiento: { habitaciones: { dormitorio: 2 }, camas: { cama_doble: 1 } },
    });
    // Sin propertyId: la unidad no se mueve de propiedad desde el editor.
    expect(payload.propertyId).toBeUndefined();
  });

  it('vacío limpia: descripción/tarifa → null y detalle → null (la API pisa con DbNull)', () => {
    const payload = payloadDesdeBorradorUnidad({
      nombre: '  Suite  ',
      codigo: '',
      tipo: 'apartamento',
      descripcion: '   ',
      capacidad: '',
      estado: 'available',
      tarifaBase: 'abc',
      moneda: 'EUR',
      amenidades: [],
      fotos: [],
      habitaciones: {},
      camas: {},
    });
    expect(payload).toMatchObject({
      nombre: 'Suite',
      codigo: null,
      descripcion: null,
      capacidad: 2,
      tarifaBase: null,
      detalleAlojamiento: null,
    });
  });
});

describe('estadoSeccionesUnidadHospedaje y progresoUnidadHospedaje', () => {
  it('marca secciones por criterio publicable y calcula el progreso', () => {
    const llena = borradorDesdeUnidad(unidadWire());
    const estado = estadoSeccionesUnidadHospedaje(llena);
    expect(estado).toEqual({
      general: true,
      basico: true,
      espacio: true,
      amenidades: true,
      fotos: true,
      tarifas: true,
    });
    expect(progresoUnidadHospedaje(llena)).toBe(100);

    const vacia = borradorDesdeUnidad(
      unidadWire({
        nombre: '',
        descripcion: null,
        tarifaBase: null,
        fotos: [],
        amenidades: [],
        detalleAlojamiento: null,
      })
    );
    const estadoVacio = estadoSeccionesUnidadHospedaje(vacia);
    expect(estadoVacio.general).toBe(false);
    expect(estadoVacio.espacio).toBe(false);
    expect(progresoUnidadHospedaje(vacia)).toBe(0);
  });

  it('la vista global exige identidad Y algo de espacio declarado', () => {
    const sinEspacio = borradorDesdeUnidad(unidadWire({ detalleAlojamiento: null }));
    expect(estadoSeccionesUnidadHospedaje(sinEspacio).general).toBe(false);
    const sinDescripcion = borradorDesdeUnidad(unidadWire({ descripcion: '' }));
    expect(estadoSeccionesUnidadHospedaje(sinDescripcion).general).toBe(false);
  });
});

describe('resúmenes de la vista global de unidad', () => {
  it('habitaciones, camas, amenidades y tarifa resumen lo declarado', () => {
    const d = borradorDesdeUnidad(unidadWire());
    expect(resumenHabitacionesUnidad(d)).toBe('2 habitaciones');
    expect(resumenCamasUnidad(d)).toBe('1 cama doble');
    expect(resumenAmenidadesUnidad(d)).toBe('2 amenidades');
    expect(resumenTarifaUnidad(d)).toBe('200 EUR / noche · Disponible');
  });

  it('sin configurar devuelven textos nulos y la tarifa vacía dice «Sin tarifa»', () => {
    const d = borradorDesdeUnidad(
      unidadWire({ detalleAlojamiento: null, amenidades: [], tarifaBase: null })
    );
    expect(resumenHabitacionesUnidad(d)).toBe('Sin configurar');
    expect(resumenCamasUnidad(d)).toBe('Sin configurar');
    expect(resumenAmenidadesUnidad(d)).toBe('Sin configurar');
    expect(resumenTarifaUnidad(d)).toBe('Sin tarifa · Disponible');
  });
});

describe('catálogos del editor de unidad', () => {
  it('amenidades y divisas coinciden con lo que ya usaba la portada y lib/moneda', () => {
    expect(AMENIDADES_UNIDAD_CATALOGO).toContain('Wifi');
    expect(AMENIDADES_UNIDAD_CATALOGO.length).toBe(16);
    expect(MONEDAS_UNIDAD_CATALOGO).toEqual(['MXN', 'USD', 'EUR', 'COP']);
  });
});
