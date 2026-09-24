import { describe, it, expect } from 'vitest';
import {
  calcularBruto,
  calcularPenalizacion,
  desglosarLineas,
  totalDeLineas,
  calcularFianza,
  calcularFianzaRetenida,
  type LineaReserva,
} from '../lib/hospitality/finance';

/**
 * Guardias de la fianza en el cálculo financiero.
 *
 * La regla que fijan: la fianza es un DEPÓSITO del huésped, no un ingreso de
 * la estancia — el bruto, el ADR y el margen no la cuentan. Solo el importe
 * RETENIDO por daños deviene ingreso (esa línea la factura el ERP), y por eso
 * se lee aparte con `calcularFianzaRetenida`.
 */

const linea = (tipo: string, importeTotal: number, concepto = ''): LineaReserva => ({
  tipo,
  concepto: concepto || `Línea ${tipo}`,
  cantidad: 1,
  importeUnitario: importeTotal,
  importeTotal,
});

describe('calcularFianza (depósito registrado, no ingreso)', () => {
  it('suma las líneas de fianza tal como están registradas', () => {
    const lineas = [
      linea('alojamiento', 500),
      linea('fianza', 200, 'Fianza (cobrada — devolver a la salida)'),
    ];
    expect(calcularFianza(lineas)).toBe(200);
  });

  it('una fianza pendiente, cobrada o devuelta cuenta igual: es la garantía registrada', () => {
    const lineas = [
      linea('fianza', 300, 'Fianza (pendiente de cobro)'),
      linea('fianza', 300, 'Fianza (devuelta a la salida)'),
    ];
    expect(calcularFianza(lineas)).toBe(600);
  });

  it('devuelve 0 sin fianza (no NaN, no undefined)', () => {
    expect(calcularFianza([linea('alojamiento', 100)])).toBe(0);
    expect(calcularFianza([])).toBe(0);
  });
});

describe('calcularFianzaRetenida (lo que deviene ingreso)', () => {
  it('solo cuenta la línea ya aplicada a daños (importe reducido a lo retenido)', () => {
    const lineas = [linea('fianza', 120, 'Fianza (aplicada a daños)')];
    expect(calcularFianzaRetenida(lineas)).toBe(120);
  });

  it('una fianza cobrada pero no aplicada NO es ingreso: se devuelve', () => {
    const lineas = [linea('fianza', 200, 'Fianza (cobrada — devolver a la salida)')];
    expect(calcularFianzaRetenida(lineas)).toBe(0);
  });

  it('sin aplicación devuelve 0', () => {
    expect(calcularFianzaRetenida([])).toBe(0);
    expect(calcularFianzaRetenida([linea('fianza', 100, 'Fianza (pendiente de cobro)')])).toBe(0);
  });
});

describe('la fianza no distorsiona los ingresos', () => {
  const lineas = [
    linea('alojamiento', 500),
    linea('limpieza', 60),
    linea('fianza', 200, 'Fianza (cobrada — devolver a la salida)'),
    linea('penalizacion', 100, 'Penalización por no-show'),
  ];

  it('calcularBruto ignora la fianza (es un depósito, como ignora la penalización)', () => {
    expect(calcularBruto(lineas)).toBe(560);
  });

  it('totalDeLineas la incluye: la pantalla de cobros ve el importe total de la reserva', () => {
    expect(totalDeLineas(lineas)).toBe(860);
  });

  it('el desglose tipado cae en "otro": no contamina alojamiento ni extras', () => {
    const d = desglosarLineas(lineas);
    expect(d.alojamiento).toBe(500);
    expect(d.limpieza).toBe(60);
    expect(d.otro).toBe(200);
    expect(d.penalizacion).toBe(100);
  });

  it('la penalización sigue aparte con la fianza en la misma reserva', () => {
    expect(calcularPenalizacion(lineas)).toBe(100);
  });
});
