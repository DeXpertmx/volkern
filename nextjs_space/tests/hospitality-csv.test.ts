import { describe, it, expect } from 'vitest';
import {
  construirCsv,
  escaparCampoCsv,
  nombreArchivoReporte,
} from '../lib/hospitality/csv';

describe('construirCsv — escape y formato', () => {
  it('genera cabecera y filas con separador de coma', () => {
    const csv = construirCsv([
      { propiedad: 'Villa Mar', ocupacion: 0.75, adr: 1000 },
      { propiedad: 'Loft', ocupacion: 0.5, adr: 800 },
    ]);
    const lineas = csv.split('\r\n');
    expect(lineas[0]).toBe('propiedad,ocupacion,adr');
    expect(lineas[1]).toBe('Villa Mar,0.75,1000');
    expect(lineas[2]).toBe('Loft,0.5,800');
  });

  it('escapa campos con comillas, comas y saltos de línea (RFC 4180)', () => {
    expect(escaparCampoCsv('Villa "Del Mar"')).toBe('"Villa ""Del Mar"""');
    expect(escaparCampoCsv('a,b')).toBe('"a,b"');
    expect(escaparCampoCsv('linea\nsalto')).toBe('"linea\nsalto"');
    // Un valor sin caracteres especiales no se entrecomilla.
    expect(escaparCampoCsv('simple')).toBe('simple');
  });

  it('respeta el campo que contiene el delimitador elegido (punto y coma)', () => {
    const csv = construirCsv([{ a: 'x;y', b: 1 }], { delimitador: ';' });
    expect(csv.split('\r\n')[1]).toBe('"x;y";1');
  });

  it('nulos, indefinidos y no finitos se exportan vacíos; fechas en ISO', () => {
    expect(escaparCampoCsv(null)).toBe('');
    expect(escaparCampoCsv(undefined)).toBe('');
    expect(escaparCampoCsv(NaN)).toBe('');
    expect(escaparCampoCsv(Infinity)).toBe('');
    expect(escaparCampoCsv(new Date('2026-09-17T00:00:00Z'))).toBe('2026-09-17T00:00:00.000Z');
  });

  it('admite columnas explícitas (orden y subset)', () => {
    const csv = construirCsv([{ a: 1, b: 2, c: 3 }], { columnas: ['c', 'a'] });
    expect(csv.split('\r\n')[0]).toBe('c,a');
    expect(csv.split('\r\n')[1]).toBe('3,1');
  });

  it('añade BOM UTF-8 cuando se pide (Excel y acentos)', () => {
    const csv = construirCsv([{ p: 'Cañón' }], { bom: true });
    expect(csv.charCodeAt(0)).toBe(0xfeff);
  });

  it('sin filas devuelve cadena vacía (no una cabecera suelta)', () => {
    expect(construirCsv([])).toBe('');
  });

  it('nombre de archivo con fecha UTC del reporte', () => {
    expect(nombreArchivoReporte('operacion', new Date('2026-09-17T12:00:00Z'))).toBe(
      'reporte-operacion-2026-09-17.csv',
    );
  });
});
