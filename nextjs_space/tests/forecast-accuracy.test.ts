import { describe, it, expect } from 'vitest';
import type { ForecastAccuracy, ForecastPoint } from '@/components/insurance/ForecastCard';

/**
 * Tests unitarios sin red ni DB: prueban las funciones puras extraíbles del
 * forecast. Como `computeAccuracy` y `buildEmptySeries` están dentro del
 * route handler (no se exportan), aquí re-creamos versiones simplificadas
 * con la misma lógica y testeamos:
 *   1. fillEmptySeries: 12 meses sin gaps
 *   2. mapErrorToAccuracy: clasificación semántica del accuracy pill
 *   3. experimental threshold: 5 muestras mínimo + MAPE > 30%
 */

// ─── 1) buildEmptySeries (réplica del helper del endpoint) ─────────────────
function buildEmptySeries(now: Date, count: number): ForecastPoint[] {
  const pad2 = (n: number) => (n < 10 ? `0${n}` : String(n));
  const MONTHS_ES_SHORT = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  const series: ForecastPoint[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const mes = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
    const label = `${MONTHS_ES_SHORT[d.getMonth()]} ${d.getFullYear().toString().slice(-2)}`;
    series.push({ mes, label, polizasCount: 0, polizasNuevas: 0, primaTotal: 0, primaPromedio: 0 });
  }
  return series;
}

// ─── 2) Clasificación semántica de accuracy (réplica del ForecastCard) ─────
function accuracyLevel(acc: ForecastAccuracy) {
  if (acc.muestras === 0) return { label: 'Sin historial' };
  if (acc.accuracyPct >= 80) return { label: 'Fiable' };
  if (acc.accuracyPct >= 70) return { label: 'Aceptable' };
  return { label: 'Baja' };
}

// ─── 3) computeAccuracy (réplica pura, sin DB) ─────────────────────────────
function computeAccuracy(logs: Array<{ errorPct: number }>, dias: number): ForecastAccuracy {
  const ACIERTO_PCT = 25;
  const EXPERIMENTAL_MAPE_THRESHOLD = 0.30;
  const EXPERIMENTAL_BANDA = 1.6;
  const muestras = logs.length;
  if (muestras === 0) {
    return { dias, muestras: 0, mape: 0, accuracyPct: 100, mejorRacha: 0, experimental: false, bandaMultiplicador: 1 };
  }
  const errores = logs.map(l => l.errorPct / 100).filter(Number.isFinite);
  const mape = errores.reduce((acc, v) => acc + v, 0) / errores.length;
  let racha = 0;
  let mejorRacha = 0;
  for (const e of errores) {
    if (e * 100 <= ACIERTO_PCT) { racha++; mejorRacha = Math.max(mejorRacha, racha); }
    else { racha = 0; }
  }
  const experimental = muestras >= 5 && mape > EXPERIMENTAL_MAPE_THRESHOLD;
  return {
    dias,
    muestras,
    mape,
    accuracyPct: Math.round((1 - mape) * 100),
    mejorRacha,
    experimental,
    bandaMultiplicador: experimental ? EXPERIMENTAL_BANDA : 1,
  };
}

// ─── 4) Regresión lineal (réplica del endpoint) ─────────────────────────────
function linearRegression(points: Array<{ x: number; y: number }>) {
  const n = points.length;
  if (n < 2) return null;
  let sx = 0, sy = 0;
  for (const p of points) { sx += p.x; sy += p.y; }
  const mx = sx / n, my = sy / n;
  let num = 0, den = 0;
  for (const p of points) { num += (p.x - mx) * (p.y - my); den += (p.x - mx) ** 2; }
  if (den === 0) return null;
  const slope = num / den;
  return { slope, intercept: my - slope * mx };
}

describe('forecast — buildEmptySeries', () => {
  it('genera 6 meses consecutivos sin gaps', () => {
    const now = new Date(2026, 7, 15); // 15 Ago 2026
    const series = buildEmptySeries(now, 6);
    expect(series.length).toBe(6);
    // Primer mes debe ser 6 meses atrás
    expect(series[0].mes).toBe('2026-03');
    expect(series[0].label).toBe('Mar 26');
    // Último mes debe ser el actual
    expect(series[5].mes).toBe('2026-08');
    expect(series[5].label).toBe('Ago 26');
    // Todos los meses intermedios son consecutivos (no hay huecos)
    for (let i = 1; i < series.length; i++) {
      expect(series[i].mes > series[i - 1].mes).toBe(true);
    }
  });

  it('rellena con ceros (no NaN ni undefined)', () => {
    const s = buildEmptySeries(new Date(2026, 0, 1), 3);
    expect(s.every(p => p.primaTotal === 0 && p.polizasCount === 0)).toBe(true);
  });
});

describe('forecast — computeAccuracy', () => {
  it('sin muestras devuelve accuracyPct=100 optimista', () => {
    const acc = computeAccuracy([], 30);
    expect(acc.muestras).toBe(0);
    expect(acc.accuracyPct).toBe(100);
    expect(acc.experimental).toBe(false);
    expect(acc.bandaMultiplicador).toBe(1);
  });

  it('5 muestras con MAPE 10% → Fiable pero NO experimental', () => {
    // 5 logs con 10% de error cada uno → MAPE = 0.10
    const logs = Array.from({ length: 5 }, () => ({ errorPct: 10 }));
    const acc = computeAccuracy(logs, 30);
    expect(acc.muestras).toBe(5);
    expect(acc.mape).toBeCloseTo(0.10, 5);
    expect(acc.accuracyPct).toBe(90);
    expect(acc.experimental).toBe(false);
    expect(acc.bandaMultiplicador).toBe(1);
  });

  it('5 muestras con MAPE 35% → experimental y banda 1.6x', () => {
    const logs = Array.from({ length: 5 }, () => ({ errorPct: 35 }));
    const acc = computeAccuracy(logs, 30);
    expect(acc.mape).toBeCloseTo(0.35, 5);
    expect(acc.accuracyPct).toBe(65);
    expect(acc.experimental).toBe(true);
    expect(acc.bandaMultiplicador).toBe(1.6);
  });

  it('MÁS de 30% con menos de 5 muestras NO marca como experimental (justo arranque)', () => {
    // El tenant arrancó hace poco: 3 muestras desafortunadas no deben condenarlo
    const logs = [{ errorPct: 50 }, { errorPct: 60 }, { errorPct: 40 }];
    const acc = computeAccuracy(logs, 30);
    expect(acc.muestras).toBe(3);
    expect(acc.mape).toBeGreaterThan(0.30);
    expect(acc.experimental).toBe(false);
    expect(acc.bandaMultiplicador).toBe(1);
  });

  it('mejorRacha cuenta aciertos consecutivos (error ≤ 25%)', () => {
    // Acierto, acierto, fallo, acierto, acierto, acierto → mejorRacha=3
    const logs = [
      { errorPct: 5 },
      { errorPct: 10 },
      { errorPct: 60 },
      { errorPct: 15 },
      { errorPct: 20 },
      { errorPct: 8 },
    ];
    const acc = computeAccuracy(logs, 30);
    expect(acc.mejorRacha).toBe(3);
  });

  it('accuracy pill "Acertó en X%" se redondea correctamente', () => {
    // MAPE 18.7% → accuracyPct ≈ 81
    const logs = Array.from({ length: 5 }, () => ({ errorPct: 18.7 }));
    const acc = computeAccuracy(logs, 30);
    expect(acc.accuracyPct).toBe(81);
  });

  it('filtrar NaN/Infinity no rompe el cálculo', () => {
    const logs = [
      { errorPct: 10 },
      { errorPct: 20 },
      // @ts-expect-error — forzamos un valor inválido como prueba de robustez
      { errorPct: Number.NaN },
    ];
    const acc = computeAccuracy(logs, 30);
    expect(Number.isFinite(acc.mape)).toBe(true);
    // Solo cuenta los válidos
    expect(acc.mape).toBeCloseTo(0.15, 5);
  });
});

describe('forecast — accuracyLevel (UI)', () => {
  it('sin muestras → "Sin historial"', () => {
    expect(accuracyLevel({
      dias: 30, muestras: 0, mape: 0, accuracyPct: 100,
      mejorRacha: 0, experimental: false, bandaMultiplicador: 1,
    }).label).toBe('Sin historial');
  });

  it('accuracyPct >= 80 → "Fiable"', () => {
    expect(accuracyLevel({
      dias: 30, muestras: 10, mape: 0.10, accuracyPct: 90,
      mejorRacha: 3, experimental: false, bandaMultiplicador: 1,
    }).label).toBe('Fiable');
  });

  it('accuracyPct entre 70-79 → "Aceptable"', () => {
    expect(accuracyLevel({
      dias: 30, muestras: 5, mape: 0.25, accuracyPct: 75,
      mejorRacha: 2, experimental: false, bandaMultiplicador: 1,
    }).label).toBe('Aceptable');
  });

  it('accuracyPct < 70 → "Baja"', () => {
    expect(accuracyLevel({
      dias: 30, muestras: 5, mape: 0.50, accuracyPct: 50,
      mejorRacha: 0, experimental: true, bandaMultiplicador: 1.6,
    }).label).toBe('Baja');
  });
});

describe('forecast — regresión lineal', () => {
  it('detecta tendencia alcista perfecta', () => {
    // 6 puntos en línea recta creciente (slope=1000)
    const points = [0, 1, 2, 3, 4, 5].map(x => ({ x, y: x * 1000 }));
    const reg = linearRegression(points);
    expect(reg).not.toBeNull();
    expect(reg!.slope).toBeCloseTo(1000, 4);
  });

  it('proyecta correctamente el siguiente bucket', () => {
    // Serie ascendente: 10000, 11000, 12000, 13000, 14000, 15000
    const puntos = [0, 1, 2, 3, 4, 5].map(x => ({ x, y: 10000 + x * 1000 }));
    const reg = linearRegression(puntos);
    const proyeccion = Math.max(0, reg!.slope * 6 + reg!.intercept);
    // La predicción para x=6 debe ser ~16000
    expect(proyeccion).toBeCloseTo(16000, 0);
  });

  it('con menos de 2 puntos devuelve null', () => {
    expect(linearRegression([])).toBeNull();
    expect(linearRegression([{ x: 0, y: 100 }])).toBeNull();
  });
});
