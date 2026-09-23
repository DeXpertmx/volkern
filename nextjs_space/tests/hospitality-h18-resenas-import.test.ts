// @vitest-environment node
//
// GUARDIA H18 · La importación de reseñas HISTÓRICAS de OTAs
// (lib/hospitality/resenas-import.ts) — el paso del plan §5.1 que pide
// «dedupe por huella y parseo: errores caros y silenciosos».
//
// Los errores aquí son de los CAROS: una reseña duplicada infla la media
// pública del hotel, y una fecha mal leída (05/06: ¿mayo o junio?) pone la
// reseña en el mes equivocado. Lo que se congela:
//   CSV — autodetección de separador, comillas RFC 4180, BOM, sin \n final.
//   CANAL — canónico con alias (Booking.com = booking = BOOKING) y «Otro».
//   FECHA — ISO siempre gana; DD/MM/YYYY con día > 12 se acepta; la AMBIGUA
//   (05/06) NO se adivina (Europa y EEUU la escriben distinto): null.
//   PUNTUACIÓN — rango 1–5, coma decimal española (4,5), decimales redondeados.
//   HUELLA — sha256 con canal+fecha+nombre+nota(+comentario); el mismo CSV dos
//   veces no duplica, un comentario distinto sí es otra reseña.
//   CONTRATO — filas válidas con su huella, errores fila a fila con número
//   humano (cabecera = 1), nunca lanza.

import { describe, it, expect } from 'vitest';
import {
  CANALES_IMPORT,
  canalCanonico,
  fechaEstanciaDe,
  parsearCsv,
  huellaDe,
  parseImportResenas,
} from '@/lib/hospitality/resenas-import';

describe('H18 · canales: canónicos, alias y respaldo', () => {
  it('el catálogo es el acordado y solo él', () => {
    expect(CANALES_IMPORT).toEqual(['Airbnb', 'Booking.com', 'Expedia', 'Vrbo', 'Google', 'Otro']);
  });

  it('los alias del catálogo se pliegan al canónico (mayúsculas, sin tld, con espacios)', () => {
    expect(canalCanonico('booking.com')).toBe('Booking.com');
    expect(canalCanonico('BOOKING')).toBe('Booking.com');
    expect(canalCanonico('  airbnb ')).toBe('Airbnb');
    // Comportamiento real congelado: «booking com» sin punto no está en el
    // mapa — si algún día se quiere, es un cambio a propósito en MAPA_CANAL.
    expect(canalCanonico('booking com')).toBe('Otro');
    expect(canalCanonico('vrbo')).toBe('Vrbo');
  });

  it('lo desconocido es «Otro», nunca un canal inventado ni null', () => {
    expect(canalCanonico('TripAdvisor')).toBe('Otro');
    expect(canalCanonico('')).toBe('Otro');
    expect(canalCanonico(null)).toBe('Otro');
    expect(canalCanonico(undefined)).toBe('Otro');
  });
});

describe('H18 · fechas: el error caro y silencioso era el mes equivocado', () => {
  it('ISO siempre gana', () => {
    const d = fechaEstanciaDe('2026-06-05');
    expect(d?.toISOString().slice(0, 10)).toBe('2026-06-05');
  });

  it('DD/MM/YYYY con día > 12 se acepta como europeo (13/06 solo puede ser 13 de junio)', () => {
    const d = fechaEstanciaDe('13/06/2026');
    expect(d?.toISOString().slice(0, 10)).toBe('2026-06-13');
  });

  it('LA AMBIGUA NO SE ADIVINA: 05/06/2026 es null — Europa y EEUU la escriben distinto', () => {
    expect(fechaEstanciaDe('05/06/2026')).toBeNull();
  });

  it('una fecha IMPOSIBLE se rechaza (no rueda al mes siguiente) y la basura es null, no excepciones', () => {
    // El rollover de Date rueda 32/01 → 1 de febrero y 30/02 → 2 de marzo:
    // el módulo lo detecta y rechaza — la reseña no va al mes equivocado.
    expect(fechaEstanciaDe('32/01/2026')).toBeNull();
    expect(fechaEstanciaDe('2026-02-31')).toBeNull();
    expect(fechaEstanciaDe('2026-04-31')).toBeNull(); // abril tiene 30
    expect(fechaEstanciaDe('ayer')).toBeNull();
    expect(fechaEstanciaDe('')).toBeNull();
    expect(fechaEstanciaDe(null)).toBeNull();
  });
});

describe('H18 · CSV: el parseo tolerante', () => {
  it('autodetecta separador y respeta comillas RFC 4180 (el comentario con coma dentro)', () => {
    const csv = 'canal,fecha,nombre,puntuacion,comentario\nAirbnb,2026-06-05,Ana,5,"Bueno, limpio y bien situado"';
    const r = parsearCsv(csv);

    expect(r?.separador).toBe(',');
    expect(r?.filas[1]).toEqual(['Airbnb', '2026-06-05', 'Ana', '5', 'Bueno, limpio y bien situado']);
  });

  it('el punto y coma gana cuando hay más (Excel español) y la coma dentro de comillas no confunde', () => {
    const csv = 'canal;fecha;nombre;puntuacion;comentario\nAirbnb;2026-06-05;Ana;5;"Bueno; limpio"';
    const r = parsearCsv(csv);

    expect(r?.separador).toBe(';');
    expect(r?.filas[1][4]).toBe('Bueno; limpio');
  });

  it('BOM de Excel y falta de \\n final: ni el uno ni el otro rompen el parseo', () => {
    const conBom = '\uFEFFcanal,fecha,nombre,puntuacion\nAirbnb,2026-06-05,Ana,5';
    const r = parsearCsv(conBom);

    expect(r?.filas[0][0]).toBe('canal');
    expect(r?.filas[1]).toEqual(['Airbnb', '2026-06-05', 'Ana', '5']);
  });

  it('comillas escapadas dentro de comillas ("" → ") y archivo vacío → null', () => {
    const r = parsearCsv('a,b\n"x ""y"" z",2');
    expect(r?.filas[1][0]).toBe('x "y" z');
    expect(parsearCsv('')).toBeNull();
    expect(parsearCsv('   \n  ')).toBeNull();
  });
});

describe('H18 · parseImportResenas: el contrato completo', () => {
  const CABECERA = 'canal,fecha,nombre,puntuacion,comentario,respuesta';

  const csv = (cuerpo: string) => `${CABECERA}\n${cuerpo}`;

  it('una fila buena produce la fila válida con su huella sha256', () => {
    const r = parseImportResenas(csv('Airbnb,2026-06-05,Ana García,5,Excelente anfitrión,Gracias'));

    expect(r.ok).toBe(true);
    expect(r.filas).toHaveLength(1);
    expect(r.filas![0]).toMatchObject({
      canal: 'Airbnb',
      fechaEstancia: '2026-06-05',
      nombreHuesped: 'Ana García',
      puntuacion: 5,
      comentario: 'Excelente anfitrión',
      respuestaHotel: 'Gracias',
    });
    expect(r.filas![0].huella).toMatch(/^[0-9a-f]{64}$/);
  });

  it('cabeceras alternativas y con tildes: «Fecha de Estancia», «Huésped», «Rating» se encuentran', () => {
    const r = parseImportResenas(
      'Canal;Fecha de Estancia;Huésped;Rating;Comentario\nAirbnb;2026-06-05;Ana;5;todo bien'
    );

    expect(r.ok).toBe(true);
    expect(r.filas).toHaveLength(1);
    expect(r.separador).toBe(';');
  });

  it('sin columnas requeridas → error que NOMBRA lo que falta y las cabeceras detectadas', () => {
    const r = parseImportResenas('canal,comentario\nAirbnb,bien');

    expect(r.ok).toBe(false);
    expect(String((r as { error?: string }).error)).toContain('fecha de estancia');
    expect(String((r as { error?: string }).error)).toContain('nombre del huésped');
    expect(String((r as { error?: string }).error)).toContain('puntuación');
    expect(String((r as { error?: string }).error)).toContain('canal, comentario');
  });

  it('LA COLUMNA 0 CUENTA: la primera columna puede ser la requerida (índice 0 no es «no encontrado»)', () => {
    const r = parseImportResenas('fecha,nombre,puntuacion\n2026-06-05,Ana,5');

    expect(r.ok).toBe(true);
    expect(r.filas![0].nombreHuesped).toBe('Ana');
  });

  it('errores FILA A FILA con número humano (cabecera = fila 1): una fila mala no tira el lote', () => {
    const r = parseImportResenas(
      csv('Airbnb,ayer,Ana,5,x\nBooking.com,2026-06-06,Bruno,7,x\nBooking.com,2026-06-07,Caro,4,bien')
    );

    expect(r.ok).toBe(true);
    expect(r.filas).toHaveLength(1); // solo Caro
    expect(r.errores).toEqual([
      { fila: 2, error: 'Fecha de estancia no reconocida (usa AAAA-MM-DD o DD/MM/YYYY)' },
      { fila: 3, error: 'La puntuación debe ser de 1 a 5' },
    ]);
  });

  it('puntuación con coma decimal (4,5) se acepta y se redondea al entero admitido', () => {
    // La coma decimal española vive dentro de comillas para no romper la fila:
    const r = parseImportResenas(csv('Airbnb,2026-06-05,Ana,"4,5",x'));

    expect(r.filas![0].puntuacion).toBe(5); // 4,5 → 4.5 → round → 5
  });

  it('puntuaciones fuera de rango (0 y 6) se rechazan fila a fila', () => {
    const r = parseImportResenas(csv('Airbnb,2026-06-05,Ana,0,x\nAirbnb,2026-06-06,Bruno,6,x'));

    expect(r.errores).toHaveLength(2);
    expect(r.errores?.every((e) => e.error.includes('La puntuación debe ser de 1 a 5'))).toBe(true);
  });

  it('filas vacías se saltan sin error ni hueco', () => {
    const r = parseImportResenas(csv('Airbnb,2026-06-05,Ana,5,x\n,,,,\nAirbnb,2026-06-06,Bruno,4,y'));

    expect(r.ok).toBe(true);
    expect(r.filas).toHaveLength(2);
    expect(r.errores).toHaveLength(0);
  });

  it('comentario largo se trunca al tope del sistema (2000), no se rechaza', () => {
    const comentarioLargo = 'x'.repeat(3000);
    const r = parseImportResenas(csv(`Airbnb,2026-06-05,Ana,5,${comentarioLargo}`));

    expect(r.ok).toBe(true);
    expect(r.filas![0].comentario.length).toBeLessThanOrEqual(2000);
  });

  it('la AMBIGUA en una fila es error de fila con su motivo, no un silencio', () => {
    const r = parseImportResenas(csv('Airbnb,05/06/2026,Ana,5,x'));

    expect(r.ok).toBe(true); // el lote sigue
    expect(r.errores).toEqual([
      { fila: 2, error: 'Fecha de estancia no reconocida (usa AAAA-MM-DD o DD/MM/YYYY)' },
    ]);
  });
});

describe('H18 · la huella del dedupe', () => {
  const base = {
    canal: 'Airbnb',
    fechaEstancia: '2026-06-05',
    nombreHuesped: 'Ana García',
    puntuacion: 5,
    comentario: 'Genial',
  };

  it('el mismo CSV dos veces produce la MISMA huella: importar dos veces no duplica', () => {
    expect(huellaDe(base)).toBe(huellaDe({ ...base }));
  });

  it('no distingue mayúsculas en el nombre (el canal ya llega canónico y la fecha ISO)', () => {
    expect(huellaDe(base)).toBe(huellaDe({ ...base, nombreHuesped: 'ana garcía' }));
  });

  it('cambia el comentario → otra reseña; cambia el canal o la nota → otra reseña', () => {
    expect(huellaDe(base)).not.toBe(huellaDe({ ...base, comentario: 'Genial, repetiría' }));
    expect(huellaDe(base)).not.toBe(huellaDe({ ...base, canal: 'Booking.com' }));
    expect(huellaDe(base)).not.toBe(huellaDe({ ...base, puntuacion: 4 }));
  });

  it('es sha256: 64 hex y determinista', () => {
    const h = huellaDe(base);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(huellaDe(base)).toBe(h);
  });
});
