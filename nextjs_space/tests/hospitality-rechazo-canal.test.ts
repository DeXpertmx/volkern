// @vitest-environment node
//
// Guardias de la pieza pura que atribuye los descartes del canal a las UNIDADES
// del envío (lib/hospitality/rechazo-canal.ts).
//
// El caso que las motivó es real (13-oct-2026, hotel 75fdbbce2e): el proveedor
// acepta la petición y descarta tres de las cuatro habitaciones empujadas con
// `INVALID_ROOM_CODE`, y el operador veía un bloque de códigos —o directamente
// «la sincronización falló»— sin saber qué unidad arreglar ni que la cuarta sí
// había llegado al canal.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  CONSEJO_DESCARTE_CANAL,
  MOTIVO_SIN_TARIFA,
  atribuirDescartes,
  motivoLegible,
  parsearAvisos,
  rechazoDePush,
  unidadesDelEnvio,
  unidadesFueraDelEnvio,
} from '@/lib/hospitality/rechazo-canal';

const RAIZ = path.resolve(__dirname, '..');

/** Las cuatro unidades del hotel real, con sus códigos vinculados. */
const UNIDADES = [
  { unitId: 'u-1a', nombre: 'Apartamento centro ciudad patio cuarenta 1A', roomCode: '1a', rateplanCodes: ['1a-s-ep'] },
  { unitId: 'u-1b', nombre: 'Apartamento centro ciudad patio cuarenta 1B', roomCode: '1b', rateplanCodes: ['1b-s-ep'] },
  { unitId: 'u-2a', nombre: 'Apartamento centro ciudad patio cuarenta 2A', roomCode: '2a', rateplanCodes: ['2a-s-ep'] },
  { unitId: 'u-2b', nombre: 'Apartamento Centro Ciudad Patio Cuarenta 2B', roomCode: '2b', rateplanCodes: ['2b-s-ep'] },
];

/** Los `warnings` tal cual los devolvió el servicio ese día. */
const WARNINGS_REALES = [
  'INVALID_ROOM_CODE : 2a',
  'INVALID_RATEPLAN_CODE : 2a-s-ep',
  'INVALID_ROOM_CODE : 1a',
  'INVALID_RATEPLAN_CODE : 1a-s-ep',
  'INVALID_ROOM_CODE : 1b',
  'INVALID_RATEPLAN_CODE : 1b-s-ep',
];

describe('parsearAvisos', () => {
  it('separa código y valor, y deduplica los repetidos por tramo', () => {
    const avisos = parsearAvisos([
      'INVALID_ROOM_CODE : 1b',
      'INVALID_ROOM_CODE : 1b',
      'INVALID_ROOM_CODE : 1b',
      'INVALID_RATEPLAN_CODE : 1b-s-ep',
    ]);
    expect(avisos).toEqual([
      { codigo: 'INVALID_ROOM_CODE', valor: '1b', crudo: 'INVALID_ROOM_CODE : 1b' },
      { codigo: 'INVALID_RATEPLAN_CODE', valor: '1b-s-ep', crudo: 'INVALID_RATEPLAN_CODE : 1b-s-ep' },
    ]);
  });

  it('un aviso con otra forma no se pierde: viaja entero como descarte desconocido', () => {
    const avisos = parsearAvisos(['algo raro pasó en el canal']);
    expect(avisos).toHaveLength(1);
    expect(avisos[0].codigo).toBe('DESCONOCIDO');
    expect(avisos[0].valor).toBe('algo raro pasó en el canal');
    expect(avisos[0].crudo).toBe('algo raro pasó en el canal');
  });

  it('descarta lo que no es un aviso utilizable y aguanta entradas raras', () => {
    expect(parsearAvisos(['   ', '', 42, null, { a: 1 }])).toEqual([]);
    expect(parsearAvisos(undefined)).toEqual([]);
    expect(parsearAvisos({ warnings: ['INVALID_ROOM_CODE : 1a'] })).toEqual([]);
  });

  it('lee el mismo par con `=` y con espacios de más', () => {
    expect(parsearAvisos(['invalid_room_code = 1a '])).toEqual([
      { codigo: 'INVALID_ROOM_CODE', valor: '1a', crudo: 'invalid_room_code = 1a' },
    ]);
  });
});

describe('atribuirDescartes — caso real de producción', () => {
  const rechazo = atribuirDescartes({ avisos: parsearAvisos(WARNINGS_REALES), unidades: UNIDADES });

  it('nombra las tres unidades descartadas por su nombre, no por su código', () => {
    expect(rechazo.huboDescartes).toBe(true);
    expect(rechazo.descartadas.map((d) => d.nombre)).toEqual([
      'Apartamento centro ciudad patio cuarenta 1A',
      'Apartamento centro ciudad patio cuarenta 1B',
      'Apartamento centro ciudad patio cuarenta 2A',
    ]);
    // Habitación y tarifa descartadas, cada una en su campo.
    const primera = rechazo.descartadas[0];
    expect(primera.roomCode).toBe('1a');
    expect(primera.roomCodeDescarte).toBe('1a');
    expect(primera.codigosTarifa).toEqual(['1a-s-ep']);
    expect(primera.motivos).toHaveLength(2);
    expect(primera.texto).toContain('la habitación «1a» no está autorizada en el canal');
  });

  it('la unidad que el canal NO descartó queda como enviada, con su nombre', () => {
    expect(rechazo.aceptadas).toEqual([
      { unitId: 'u-2b', nombre: 'Apartamento Centro Ciudad Patio Cuarenta 2B' },
    ]);
    // Y el mensaje lo dice, que es la mitad de la noticia que faltaba.
    expect(rechazo.mensaje).toContain('descartó 3 de 4 unidades');
    expect(rechazo.mensaje).toContain('Las otras 1 sí se enviaron');
    expect(rechazo.mensaje).toContain('Patio Cuarenta 2B');
  });

  it('el consejo apunta a la autorización en el canal, no a rotar credenciales', () => {
    expect(rechazo.mensaje).toContain(CONSEJO_DESCARTE_CANAL);
    expect(rechazo.mensaje).toContain('extranet');
  });

  it('sin descartes no hay mensaje ni listas que confundan', () => {
    const limpio = atribuirDescartes({ avisos: [], unidades: UNIDADES });
    expect(limpio).toEqual({
      huboDescartes: false,
      descartadas: [],
      aceptadas: UNIDADES.map((u) => ({ unitId: u.unitId, nombre: u.nombre })),
      codigosSinUnidad: [],
      noEnviadas: [],
      mensaje: null,
    });
  });
});

describe('quién viaja en cada push (medido en producción, 13-oct-2026)', () => {
  // Los dos pushes reales del hotel 75fdbbce2e: el de inventario lleva las cuatro
  // habitaciones; el de restricciones de tarifa solo las unidades CON plan de
  // tarifa con código (1b y 2b — 1a y 2a no tienen ninguno).
  const INVENTARIO = { roomCodes: ['1a', '1b', '2a', '2b'] };
  const RESTRICCIONES_DE_TARIFA = {
    roomCodes: ['1b', '2b'],
    paresTarifa: [
      { roomCode: '1b', rateplanCode: '1b-s-ep' },
      { roomCode: '2b', rateplanCode: '2b-s-ep' },
    ],
  };

  it('el push de inventario lleva las cuatro: nada que informar fuera', () => {
    expect(unidadesDelEnvio(UNIDADES, INVENTARIO)).toHaveLength(4);
    expect(unidadesFueraDelEnvio(UNIDADES, INVENTARIO)).toEqual([]);
  });

  it('el de restricciones de tarifa NO lleva a las que no tienen plan con código', () => {
    const enviadas = unidadesDelEnvio(UNIDADES, RESTRICCIONES_DE_TARIFA);
    expect(enviadas.map((u) => u.roomCode)).toEqual(['1b', '2b']);
    expect(unidadesFueraDelEnvio(UNIDADES, RESTRICCIONES_DE_TARIFA)).toEqual([
      { unitId: 'u-1a', nombre: UNIDADES[0].nombre, motivo: MOTIVO_SIN_TARIFA },
      { unitId: 'u-2a', nombre: UNIDADES[2].nombre, motivo: MOTIVO_SIN_TARIFA },
    ]);
  });

  it('el caso real: el descarte del push corto cuenta sobre lo enviado y nombra lo que no viajó', () => {
    // Firmado en producción: `rates_restrictions` descartó 1b y el mensaje decía
    // «las otras 3 sí se enviaron», nombrando dos unidades que no iban en la
    // petición. El conteo ahora es sobre el envío (2) y las ausentes se dicen.
    const rechazo = atribuirDescartes({
      avisos: parsearAvisos([
        'INVALID_ROOM_CODE : 1b',
        'INVALID_RATEPLAN_CODE : 1b-s-ep',
      ]),
      unidades: unidadesDelEnvio(UNIDADES, RESTRICCIONES_DE_TARIFA),
      noEnviadas: unidadesFueraDelEnvio(UNIDADES, RESTRICCIONES_DE_TARIFA),
    });
    expect(rechazo.mensaje).toContain('descartó 1 de 2 unidades');
    expect(rechazo.mensaje).toContain('Las otras 1 sí se enviaron');
    expect(rechazo.mensaje).toContain('Patio Cuarenta 2B');
    // Las unidades que no viajaron se nombran con su motivo, no como enviadas.
    expect(rechazo.mensaje).not.toContain('Las otras 3');
    expect(rechazo.mensaje).toContain('2 unidades no viajaron en este envío');
    expect(rechazo.mensaje).toContain(MOTIVO_SIN_TARIFA);
    expect(rechazo.noEnviadas.map((n) => n.nombre)).toEqual([
      'Apartamento centro ciudad patio cuarenta 1A',
      'Apartamento centro ciudad patio cuarenta 2A',
    ]);
  });

  it('un descarte de una unidad que no viajó no se atribuye (solo viaja lo que viaja)', () => {
    const rechazo = atribuirDescartes({
      avisos: parsearAvisos(['INVALID_ROOM_CODE : 1a']),
      unidades: unidadesDelEnvio(UNIDADES, RESTRICCIONES_DE_TARIFA),
    });
    expect(rechazo.descartadas).toEqual([]);
    expect(rechazo.codigosSinUnidad).toEqual(['1a']);
  });

  it('una unidad sin vínculo externo tampoco viaja, y se dice por qué', () => {
    const fuera = unidadesFueraDelEnvio(
      [{ unitId: 'u-x', nombre: 'Loft sin vincular', roomCode: null }],
      INVENTARIO
    );
    expect(fuera).toEqual([
      { unitId: 'u-x', nombre: 'Loft sin vincular', motivo: 'no tiene vínculo con el proveedor' },
    ]);
  });
});

describe('atribuirDescartes — reglas de atribución', () => {
  it('un código que no es de ninguna unidad no se reparte: se informa aparte', () => {
    const rechazo = atribuirDescartes({
      avisos: parsearAvisos(['INVALID_ROOM_CODE : 1a', 'INVALID_ROOM_CODE : 9z']),
      unidades: UNIDADES,
    });
    expect(rechazo.descartadas.map((d) => d.nombre)).toEqual([
      'Apartamento centro ciudad patio cuarenta 1A',
    ]);
    expect(rechazo.codigosSinUnidad).toEqual(['9z']);
    expect(rechazo.mensaje).toContain('no son de ninguna unidad del envío: 9z');
  });

  it('el código de tarifa atribuye por el vinculado o por el de un plan activo', () => {
    const rechazo = atribuirDescartes({
      avisos: parsearAvisos(['INVALID_RATEPLAN_CODE : FLEX-9']),
      unidades: [
        { unitId: 'u1', nombre: 'Loft', roomCode: 'L1', rateplanCodes: ['L1-S-EP', 'FLEX-9', null] },
      ],
    });
    expect(rechazo.descartadas[0].codigosTarifa).toEqual(['FLEX-9']);
    expect(rechazo.descartadas[0].motivos[0]).toBe(
      'el plan de tarifa «FLEX-9» no está autorizado en el canal'
    );
  });

  it('el mismo par código/valor no se anota dos veces aunque venga de dos códigos distintos', () => {
    const rechazo = atribuirDescartes({
      avisos: parsearAvisos(['INVALID_ROOM_CODE : 1a', 'INVALID_ROOM_CODE : 1a']),
      unidades: UNIDADES,
    });
    // parsearAvisos ya deduplica; la atribución no puede duplicar la unidad.
    expect(rechazo.descartadas).toHaveLength(1);
    expect(rechazo.descartadas[0].motivos).toHaveLength(1);
  });

  it('la comparación de códigos distingue mayúsculas: `1A` no es la unidad de `1a`', () => {
    const rechazo = atribuirDescartes({
      avisos: parsearAvisos(['INVALID_ROOM_CODE : 1A']),
      unidades: UNIDADES,
    });
    expect(rechazo.descartadas).toHaveLength(0);
    expect(rechazo.codigosSinUnidad).toEqual(['1A']);
  });

  it('sin unidades en el envío los descartes quedan como códigos sin unidad (no se inventa atribución)', () => {
    const rechazo = atribuirDescartes({ avisos: parsearAvisos(['INVALID_ROOM_CODE : 1a']), unidades: [] });
    expect(rechazo.huboDescartes).toBe(true);
    expect(rechazo.descartadas).toEqual([]);
    expect(rechazo.codigosSinUnidad).toEqual(['1a']);
  });

  it('nombra el canal cuando se le pasa el nombre', () => {
    const rechazo = atribuirDescartes({
      avisos: parsearAvisos(['INVALID_ROOM_CODE : 1a']),
      unidades: UNIDADES,
      canal: 'Booking.com',
    });
    expect(rechazo.mensaje).toContain('Booking.com descartó 1 de 4');
  });

  it('con muchas unidades aceptadas enumera unas pocas y dice cuántas quedan', () => {
    const unidades = Array.from({ length: 8 }, (_, i) => ({
      unitId: `u${i}`,
      nombre: `Unidad ${i}`,
      roomCode: `r${i}`,
      rateplanCodes: [`r${i}-S`],
    }));
    const rechazo = atribuirDescartes({
      avisos: parsearAvisos(['INVALID_ROOM_CODE : r0']),
      unidades,
    });
    expect(rechazo.mensaje).toContain('Las otras 7 sí se enviaron');
    expect(rechazo.mensaje).toContain('y 2 más');
  });
});

describe('rechazoDePush — atajo de los caminos reales', () => {
  it('acepta los warnings crudos de la respuesta del proveedor', () => {
    const rechazo = rechazoDePush({
      warnings: ['INVALID_ROOM_CODE : 2b'],
      unidades: UNIDADES,
    });
    expect(rechazo.descartadas.map((d) => d.nombre)).toEqual([
      'Apartamento Centro Ciudad Patio Cuarenta 2B',
    ]);
  });

  it('un `warnings` con forma inesperada no rompe ni inventa descartes', () => {
    expect(rechazoDePush({ warnings: null, unidades: UNIDADES }).huboDescartes).toBe(false);
    expect(rechazoDePush({ warnings: [{ code: 'X' }], unidades: UNIDADES }).huboDescartes).toBe(false);
  });
});

describe('motivoLegible', () => {
  it('cubre los dos códigos medidos y el desconocido', () => {
    expect(motivoLegible({ codigo: 'INVALID_ROOM_CODE', valor: '1a', crudo: '' })).toContain('habitación');
    expect(motivoLegible({ codigo: 'INVALID_RATEPLAN_CODE', valor: '1a-s-ep', crudo: '' })).toContain(
      'plan de tarifa'
    );
    expect(motivoLegible({ codigo: 'DESCONOCIDO', valor: 'vaya', crudo: '' })).toContain('vaya');
  });
});

describe('cableado: el informe llega al operador', () => {
  const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), 'utf8');

  it('el dispatcher atribuye cada push fallido y publica el informe', () => {
    const sync = leer('lib/hospitality/sync.ts');
    expect(sync).toContain("from './rechazo-canal'");
    // La atribución usa las unidades QUE VIAJARON en ese push, no todas las de
    // la propiedad: cuatro llamadas, todas con el mismo par.
    expect(sync.match(/errorAtribuido\(result, envio\.enviadas, envio\.fuera\)/g)).toHaveLength(4);
    expect(sync).not.toContain('errorAtribuido(result, unidadesCanal)');
    expect(sync).toContain('rechazo: fusionarRechazos(rechazos)');
    // El error del sync-log es el atribuido: la columna de errores del panel y
    // el asistente leen de ahí.
    expect(sync).toContain('errorMensaje: error,');
    // Las unidades viajan con su nombre y sus códigos de tarifa al informe.
    expect(sync).toContain('nombre: u.nombre');
    expect(sync).toContain('rateplanCodes: [u.rateplanCodeMapeado,');
  });

  it('cada push declara sus códigos viajeros (habitación y, si lleva tarifas, el par)', () => {
    const sync = leer('lib/hospitality/sync.ts');
    expect(sync).toContain('const enviadasYFuera = (envio: EnvioPush) => ({');
    expect(sync).toContain('unidadesDelEnvio(unidadesCanal, envio)');
    expect(sync).toContain('unidadesFueraDelEnvio(unidadesCanal, envio)');
    // Los pushes de tarifas (y sus restricciones) declaran el par completo.
    expect(sync.match(/paresTarifa:/g)).toHaveLength(2);
  });

  it('la sincronización manual devuelve el informe y un error legible', () => {
    const ruta = leer('app/api/hospitality/sync/route.ts');
    expect(ruta).toContain('rechazo: result.rechazo');
    expect(ruta).toContain('result.rechazo.mensaje || primerErrorDePush(result)');
  });

  it('las pruebas del asistente devuelven el informe por unidad', () => {
    const ruta = leer('app/api/hospitality/onboarding/probar/route.ts');
    expect(ruta).toContain('rechazo: push.rechazo');
  });

  it('la puesta en marcha pinta las unidades descartadas una a una', () => {
    const pagina = leer('app/dashboard/hospitality/onboarding/page.tsx');
    expect(pagina).toContain("import type { RechazoDeCanal } from '@/lib/hospitality/rechazo-canal'");
    expect(pagina).toContain('detalle.rechazo?.descartadas');
    expect(pagina).toContain('resultado.unidades.map');
  });

  it('la pantalla de tarifas no se queda en «revisa los sync-logs»', () => {
    const pagina = leer('app/dashboard/hospitality/tarifas/page.tsx');
    expect(pagina).toContain('data?.rechazo?.descartadas');
    expect(pagina).toContain('syncRechazo.descartadas.map');
  });
});
