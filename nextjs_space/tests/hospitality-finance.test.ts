import { describe, it, expect } from 'vitest';
import {
  calcularRentabilidad,
  calcularBruto,
  calcularCobrado,
  derivarEstadoCobro,
  desglosarLineas,
  importeLinea,
  normalizarLinea,
  lineasDesdeImporteExterno,
  redondear,
} from '../lib/hospitality/finance';

/**
 * Ejemplo del plan: la reserva del propietario debe cuadrar exactamente.
 *
 * Alojamiento €600 + limpieza €60 + extras €40 = bruto €700
 * - comisión OTA €105 - pasarela €20 - otros €25 = neto €550
 */
describe('rentabilidad de una reserva', () => {
  const lineas = [
    normalizarLinea({ tipo: 'alojamiento', concepto: 'Alojamiento', cantidad: 6, importeUnitario: 100 }),
    normalizarLinea({ tipo: 'limpieza', concepto: 'Limpieza', cantidad: 1, importeUnitario: 60 }),
    normalizarLinea({ tipo: 'extra', concepto: 'Extras', cantidad: 1, importeUnitario: 40 }),
  ];

  it('calcula el ingreso bruto como suma de las líneas', () => {
    expect(calcularBruto(lineas)).toBe(700);
  });

  it('cuadra el desglose del plan maestro', () => {
    const r = calcularRentabilidad({
      lineas,
      comisionOta: 105,
      comisionPasarela: 20,
      otrosGastos: [{ concepto: 'Limpieza externa', importe: 25 }],
    });

    expect(r.bruto).toBe(700);
    expect(r.comisionOta).toBe(105);
    expect(r.comisionPasarela).toBe(20);
    expect(r.otrosGastos).toBe(25);
    expect(r.neto).toBe(550);
    // 550 / 700 = 78,57% (el ejemplo del plan lo redondeaba a 79%).
    expect(r.margenPct).toBe(78.57);
  });

  it('desglosa por tipo de línea y agrupa lo desconocido en "otro"', () => {
    const d = desglosarLineas([
      ...lineas,
      normalizarLinea({ tipo: 'raro', concepto: 'No previsto', cantidad: 1, importeUnitario: 10 }),
    ]);
    expect(d).toEqual({ alojamiento: 600, limpieza: 60, extra: 40, otro: 10 });
  });

  it('sin líneas el bruto y el neto son cero y el margen no revienta', () => {
    const r = calcularRentabilidad({ lineas: [], comisionOta: 50 });
    expect(r.bruto).toBe(0);
    expect(r.neto).toBe(-50);
    expect(r.margenPct).toBe(0);
  });

  it('no usa la expresión "bruto después de gastos": el neto puede ser negativo', () => {
    const r = calcularRentabilidad({
      lineas: [normalizarLinea({ tipo: 'alojamiento', concepto: 'Noche', cantidad: 1, importeUnitario: 100 })],
      comisionOta: 120,
    });
    expect(r.neto).toBe(-20);
    expect(r.margenPct).toBe(-20);
  });
});

describe('líneas de reserva', () => {
  it('el importe se calcula y no se confía en el total recibido', () => {
    const linea = normalizarLinea({ concepto: 'x', cantidad: 3, importeUnitario: 33.33, importeTotal: 999 });
    expect(linea.importeTotal).toBe(99.99);
  });

  it('redondea cantidades con decimales sin arrastrar coma flotante', () => {
    expect(importeLinea(3, 0.1)).toBe(0.3);
    expect(redondear(0.1 + 0.2)).toBe(0.3);
  });

  it('una reserva de OTA sin desglose queda como una línea de alojamiento', () => {
    const lineas = lineasDesdeImporteExterno(700);
    expect(lineas).toHaveLength(1);
    expect(lineas[0].tipo).toBe('alojamiento');
    expect(calcularBruto(lineas)).toBe(700);
  });

  it('un importe externo vacío o cero no genera líneas', () => {
    expect(lineasDesdeImporteExterno(0)).toEqual([]);
    expect(lineasDesdeImporteExterno(undefined as unknown as number)).toEqual([]);
  });
});

describe('estado de cobro derivado de los pagos', () => {
  it('suma solo lo cobrado y resta los reembolsos', () => {
    const cobrado = calcularCobrado([
      { importe: 300, estado: 'pagado' },
      { importe: 200, estado: 'parcial' },
      { importe: 400, estado: 'pendiente' },
      { importe: 50, estado: 'fallido' },
      { importe: 100, estado: 'reembolsado' },
    ]);
    expect(cobrado).toBe(400);
  });

  it('clasifica pendiente, parcial, pagado y sobrepagado', () => {
    expect(derivarEstadoCobro(700, 0)).toBe('pendiente');
    expect(derivarEstadoCobro(700, 300)).toBe('parcial');
    expect(derivarEstadoCobro(700, 700)).toBe('pagado');
    expect(derivarEstadoCobro(700, 750)).toBe('sobrepagado');
  });

  it('tolera un céntimo de diferencia sin marcar parcial', () => {
    expect(derivarEstadoCobro(700, 699.995)).toBe('pagado');
  });

  it('calcula el pendiente real y nunca lo deja negativo', () => {
    const r = calcularRentabilidad({
      lineas: lineasDesdeImporteExterno(700),
      pagos: [{ importe: 300, estado: 'pagado' }],
    });
    expect(r.cobrado).toBe(300);
    expect(r.pendiente).toBe(400);
    expect(r.estadoCobro).toBe('parcial');
  });

  it('una reserva totalmente cobrada no deja pendiente', () => {
    const r = calcularRentabilidad({
      lineas: lineasDesdeImporteExterno(700),
      pagos: [
        { importe: 300, estado: 'pagado' },
        { importe: 400, estado: 'pagado' },
      ],
    });
    expect(r.pendiente).toBe(0);
    expect(r.estadoCobro).toBe('pagado');
  });

  it('una reserva sin líneas y sin pagos se considera pendiente', () => {
    expect(derivarEstadoCobro(0, 0)).toBe('pagado');
  });
});
