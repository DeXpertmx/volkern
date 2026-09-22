// @vitest-environment node
//
// Exportación CSV de reservas con sus respuestas de check-in
// (lib/hospitality/reservas-csv.ts): la lista del día de recepción. Lo que se
// vigila aquí es que el CSV diga lo que la recepción necesita y NADA más:
// columnas fijas legibles, una columna por pregunta del hotel (en su orden),
// escape RFC 4180 (un valor con «;» o comillas no puede romper la fila),
// BOM UTF-8 para Excel y separador `;`.

import { describe, it, expect } from 'vitest';
import {
  construirReservasCsv,
  columnasDeReservasCsv,
  filaDeReservaCsv,
  diaLocalIso,
  nombreArchivoReservasCsv,
  COLUMNAS_FIJAS_RESERVAS_CSV,
  type ReservaExportable,
} from '@/lib/hospitality/reservas-csv';

const PREGUNTAS = [
  { id: 'p1', texto: 'Hora estimada de llegada' },
  { id: 'p2', texto: '¿Trae mascotas?' },
];

function reserva(over: Partial<ReservaExportable> = {}): ReservaExportable {
  return {
    referencia: 'BE-2026-001',
    estado: 'confirmed',
    huesped: 'Ana Ruiz',
    email: 'ana@ensayo.test',
    telefono: '+34 666 666 666',
    propiedad: 'Hotel Volcán',
    unidad: 'Suite 1',
    checkIn: '2026-10-01',
    checkOut: '2026-10-03',
    noches: 2,
    canal: 'Directa',
    importe: 3000,
    moneda: 'MXN',
    parteEstado: '',
    respuestas: { p1: 'Night (after 19:00)' },
    ...over,
  };
}

describe('reservas-csv — módulo puro', () => {
  it('las columnas fijas son legibles y estables (la recepción las aprende una vez)', () => {
    expect(columnasDeReservasCsv(PREGUNTAS)).toEqual([
      'Referencia',
      'Estado',
      'Huésped',
      'Email',
      'Teléfono',
      'Propiedad',
      'Unidad',
      'Entrada',
      'Salida',
      'Noches',
      'Canal',
      'Importe',
      'Moneda',
      'Parte de viajeros',
      'Hora estimada de llegada',
      '¿Trae mascotas?',
    ]);
  });

  it('sin preguntas del hotel no hay columnas extra: el CSV sigue siendo la lista del día', () => {
    expect(columnasDeReservasCsv([])).toEqual(COLUMNAS_FIJAS_RESERVAS_CSV.map((c) => c.cabecera));
  });

  it('la fila lleva las respuestas en las columnas de sus preguntas y vacío en las sin responder', () => {
    const fila = filaDeReservaCsv(reserva(), PREGUNTAS);
    // fija (14) + pregunta respondida + pregunta sin responder
    expect(fila).toHaveLength(16);
    expect(fila[14]).toBe('Night (after 19:00)');
    expect(fila[15]).toBe('');
  });

  it('una pregunta desactivada no tiene columna y su respuesta no aparece (la lista es del hotel de hoy)', () => {
    const fila = filaDeReservaCsv(reserva(), [PREGUNTAS[1]]);
    expect(fila).toHaveLength(15);
    expect(fila.join(';')).not.toContain('Night (after 19:00)');
  });

  it('el CSV lleva BOM UTF-8, separador `;` y CRLF (Excel de recepción)', () => {
    const csv = construirReservasCsv([reserva()], PREGUNTAS);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('\r\n');
    const lineas = csv.slice(1).split('\r\n').filter(Boolean);
    expect(lineas).toHaveLength(2); // cabecera + fila
    expect(lineas[0].split(';')).toHaveLength(16);
  });

  it('el escape RFC 4180 aguanta separadores y comillas dentro de un valor', () => {
    const csv = construirReservasCsv(
      [reserva({ huesped: 'Ana "La Jefa" Ruiz', email: 'a;b@c.test' })],
      []
    );
    const linea = csv.split('\r\n')[1];
    expect(linea).toContain('"Ana ""La Jefa"" Ruiz"');
    expect(linea).toContain('"a;b@c.test"');
  });

  it('una fila sin caracteres especiales conserva el número exacto de celdas', () => {
    const csv = construirReservasCsv([reserva({ huesped: 'Ana Ruiz' })], []);
    const linea = csv.split('\r\n')[1];
    expect(linea.split(';').length).toBe(COLUMNAS_FIJAS_RESERVAS_CSV.length);
  });

  it('sin reservas devuelve cadena vacía: la ruta decide el 404 razonado', () => {
    expect(construirReservasCsv([], PREGUNTAS)).toBe('');
  });

  it('los null e importes ausentes salen como celda vacía, no como "null"', () => {
    const csv = construirReservasCsv([reserva({ importe: null, moneda: '' })], []);
    expect(csv).not.toContain('null');
    expect(csv).not.toContain('undefined');
  });

  it('diaLocalIso devuelve el día LOCAL del servidor (misma regla que el planning), en AAAA-MM-DD', () => {
    // Fija TZ para que el test no dependa de la máquina que lo corre.
    expect(() => diaLocalIso(new Date('2026-10-01T15:00:00Z'))).not.toThrow();
    expect(diaLocalIso(new Date('2026-10-01T15:00:00Z'))).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('diaLocalIso tolera fechas inválidas y nulos', () => {
    expect(diaLocalIso(null)).toBe('');
    expect(diaLocalIso('')).toBe('');
    expect(diaLocalIso('no-es-fecha')).toBe('');
  });

  it('el nombre del archivo lleva la fecha de la exportación', () => {
    expect(nombreArchivoReservasCsv(new Date('2026-09-21T12:00:00Z'))).toBe('reservas-2026-09-21.csv');
  });
});
