import { describe, it, expect } from 'vitest';

/**
 * Tests vitest del motor de forecast reutilizado por el endpoint by-ramo:
 *   · buildEmptySeries (no gaps, MMDD correcto)
 *   · linearRegression (slope/intercept, R² =1 para línea perfecta)
 *   · stddev / rSquared
 *   · computeRegressionForecast (caso borde <3 actividad, regresión sólida)
 *   · accumulateByMonth (suma correctamente con padding de skeleton)
 *   · ALL_RAMOS tiene los 12 valores del enum + labels/color maps
 */

import {
  ALL_RAMOS,
  RAMO_LABELS,
  RAMO_COLORS_HEX,
  RAMO_COLORS_BAR,
  buildEmptySeries,
  linearRegression,
  stddev,
  rSquared,
  computeRegressionForecast,
  accumulateByMonth,
  type TimelinePoint,
} from '@/lib/insurance/forecast-engine';

describe('forecast-engine — buildEmptySeries', () => {
  it('genera N meses consecutivos sin gaps cuando N=6', () => {
    const now = new Date(2026, 7, 15);
    const series = buildEmptySeries(now, 6);
    expect(series.length).toBe(6);
    expect(series[0].mes).toBe('2026-03');
    expect(series[5].mes).toBe('2026-08');
    for (let i = 1; i < series.length; i++) {
      expect(series[i].mes > series[i - 1].mes).toBe(true);
    }
  });

  it('rellena con ceros (cero polizasCount / primaTotal)', () => {
    const s = buildEmptySeries(new Date(2026, 0, 1), 4);
    expect(s.every(p => p.polizasCount === 0 && p.primaTotal === 0)).toBe(true);
  });
});

describe('forecast-engine — linearRegression', () => {
  it('detecta línea recta perfecta (slope=100, intercept=0)', () => {
    const reg = linearRegression([0, 1, 2, 3, 4].map(x => ({ x, y: x * 100 })));
    expect(reg).not.toBeNull();
    expect(reg!.slope).toBeCloseTo(100, 4);
    expect(reg!.intercept).toBeCloseTo(0, 4);
  });

  it('null si hay <2 puntos', () => {
    expect(linearRegression([])).toBeNull();
    expect(linearRegression([{ x: 0, y: 0 }])).toBeNull();
  });

  it('null si la X es constante (den=0)', () => {
    expect(linearRegression([{ x: 1, y: 5 }, { x: 1, y: 10 }])).toBeNull();
  });
});

describe('forecast-engine — stddev / rSquared', () => {
  it('stddev=0 cuando todos los valores son iguales', () => {
    expect(stddev([5, 5, 5, 5])).toBe(0);
  });

  it('rSquared=1 con ajuste perfecto', () => {
    const points = [
      { x: 0, y: 10, yHat: 10 },
      { x: 1, y: 20, yHat: 20 },
      { x: 2, y: 30, yHat: 30 },
    ];
    expect(rSquared(points)).toBe(1);
  });
});

describe('forecast-engine — computeRegressionForecast', () => {
  function makeSkeleton(now: Date, count: number): TimelinePoint[] {
    return buildEmptySeries(now, count);
  }

  it('caso <3 meses con actividad → confianza=0 y pendienteLabel=Plana', () => {
    const skeleton = makeSkeleton(new Date(2026, 7, 15), 6);
    // Solo 2 meses con actividad
    const ventana = skeleton.map((p, i) =>
      i === 4 || i === 5
        ? { ...p, polizasCount: 5, polizasNuevas: 5, primaTotal: 10000, primaPromedio: 2000 }
        : p
    );
    const reg = computeRegressionForecast(ventana, 6);
    expect(reg.confianza).toBe(0);
    expect(reg.pendienteLabel).toBe('Plana');
    expect(reg.sinActividad).toBe(true);
  });

  it('caso >3 meses con actividad → regresión real y pendienteLabel coherente', () => {
    const skeleton = makeSkeleton(new Date(2026, 7, 15), 6);
    const ventana = skeleton.map((p, i) => ({
      ...p,
      polizasCount: 5,
      polizasNuevas: 5,
      primaTotal: 10000 + i * 500, // lineal creciente
      primaPromedio: 2000 + i * 100,
    }));
    const reg = computeRegressionForecast(ventana, 6);
    expect(reg.confianza).toBeGreaterThan(0.9);
    expect(reg.slope).toBeGreaterThan(0);
    expect(reg.pendienteLabel).toBe('Alcista fuerte');
    // Proyección: x=6 → 10000 + 6*500 = 13000
    expect(reg.proyeccion).toBeCloseTo(13000, 0);
  });

  it('caída monotónica → pendienteLabel=Bajista fuerte y mensaje correcto', () => {
    const skeleton = makeSkeleton(new Date(2026, 7, 15), 6);
    const ventana = skeleton.map((p, i) => ({
      ...p,
      polizasCount: 5,
      polizasNuevas: 5,
      primaTotal: 30000 - i * 2000, // decreciente
      primaPromedio: 6000 - i * 400,
    }));
    const reg = computeRegressionForecast(ventana, 6);
    expect(reg.pendienteLabel).toBe('Bajista fuerte');
    expect(reg.mensaje).toMatch(/Tendencia a la baja/);
    // Proyección: x=6 → 30000 - 12000 = 18000
    expect(reg.proyeccion).toBeCloseTo(18000, 0);
  });
});

describe('forecast-engine — accumulateByMonth', () => {
  it('suma correctamente con padding de skeleton', () => {
    const skeleton = buildEmptySeries(new Date(2026, 7, 15), 6);
    const rows = [
      { fechaEmision: new Date(2026, 5, 10), primaAnual: 5000 },
      { fechaEmision: new Date(2026, 6, 20), primaAnual: 7000 },
      { fechaEmision: new Date(2026, 6, 25), primaAnual: 3000 },
    ];
    const result = accumulateByMonth(rows, JSON.parse(JSON.stringify(skeleton)));
    // Mapeamos: skeleton[i=0]=Marzo, [1]=Abril, [2]=Mayo, [3]=Junio, [4]=Julio, [5]=Agosto
    // Nuestra fila 1 está en mes 5 (junio) con prima=5000
    expect(result[3].mes).toBe('2026-06');
    expect(result[3].primaTotal).toBe(5000);
    expect(result[3].polizasCount).toBe(1);
    // Nuestras filas 2 y 3 son julio (mes 6), suman 10000
    expect(result[4].mes).toBe('2026-07');
    expect(result[4].primaTotal).toBe(10000);
    expect(result[4].polizasCount).toBe(2);
    // Meses sin actividad deben quedar en 0
    expect(result[0].primaTotal).toBe(0);
  });
});

describe('forecast-engine — ALL_RAMOS y label/color maps', () => {
  it('ALL_RAMOS tiene exactamente 12 valores', () => {
    expect(ALL_RAMOS.length).toBe(12);
  });

  it('ALL_RAMOS cubre todos los del enum Ramo (sin faltantes)', () => {
    const REQUIRED = [
      'AUTO', 'HOGAR', 'VIDA', 'SALUD', 'GASTOS_MEDICOS', 'EMPRESARIAL',
      'RESPONSABILIDAD_CIVIL', 'INCENDIO', 'TRANSPORTE', 'AHORRO',
      'JUBILACION', 'OTROS',
    ];
    for (const r of REQUIRED) {
      expect(ALL_RAMOS).toContain(r);
    }
  });

  it('RAMO_LABELS tiene label humano para cada ramo', () => {
    for (const ramo of ALL_RAMOS) {
      expect(RAMO_LABELS[ramo]).toBeTruthy();
      expect(RAMO_LABELS[ramo].length).toBeGreaterThan(2);
    }
  });

  it('RAMO_COLORS_HEX tiene hex (7 chars) por ramo', () => {
    for (const ramo of ALL_RAMOS) {
      expect(RAMO_COLORS_HEX[ramo]).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('RAMO_COLORS_BAR tiene clase Tailwind por ramo', () => {
    for (const ramo of ALL_RAMOS) {
      expect(RAMO_COLORS_BAR[ramo]).toMatch(/^bg-/);
    }
  });
});
