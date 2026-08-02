/**
 * Funciones puras del motor de forecast. Reutilizadas por:
 *   · /api/insurance/portfolio/forecast (forecast base global)
 *   · /api/insurance/portfolio/forecast/smart (smart = base + multipliers)
 *   · /api/insurance/portfolio/forecast/by-ramo (desglose por ramo)
 *
 * Toda la matemática vive aquí para que cada endpoint solo orqueste queries
 * Prisma + composición. Tests:
 *   tests/forecast-accuracy.test.ts (puros)
 *   tests/seasonal-forecast.test.ts (algunos reusan buildEmptySeries)
 */

export interface TimelinePoint {
  mes: string;          // YYYY-MM
  label: string;         // "Ene 26"
  polizasCount: number;
  polizasNuevas: number;
  primaTotal: number;
  primaPromedio: number;
}

export interface RegressionResult {
  slope: number;
  intercept: number;
  r2: number;
  proyeccion: number;     // próxima ventana (x = count)
  ventana: TimelinePoint[];
  mensaje: string;
  /** Mensaje canónico según slope+R² (compartido con ForecastCard UI). */
  pendienteLabel: 'Alcista fuerte' | 'Alcista débil' | 'Bajista fuerte' | 'Bajista débil' | 'Plana';
}

const MONTHS_ES_SHORT = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

export const RAMO_LABELS: Record<string, string> = {
  AUTO: 'Auto',
  HOGAR: 'Hogar',
  VIDA: 'Vida',
  SALUD: 'Salud',
  GASTOS_MEDICOS: 'Gastos Médicos',
  EMPRESARIAL: 'Empresarial',
  RESPONSABILIDAD_CIVIL: 'Responsabilidad Civil',
  INCENDIO: 'Incendio',
  TRANSPORTE: 'Transporte',
  AHORRO: 'Ahorro',
  JUBILACION: 'Jubilación',
  OTROS: 'Otros',
};

export const RAMO_COLORS_BAR: Record<string, string> = {
  AUTO: 'bg-blue-500',
  HOGAR: 'bg-emerald-500',
  VIDA: 'bg-violet-500',
  SALUD: 'bg-pink-500',
  GASTOS_MEDICOS: 'bg-rose-500',
  EMPRESARIAL: 'bg-indigo-500',
  RESPONSABILIDAD_CIVIL: 'bg-amber-500',
  INCENDIO: 'bg-orange-500',
  TRANSPORTE: 'bg-cyan-500',
  AHORRO: 'bg-teal-500',
  JUBILACION: 'bg-purple-500',
  OTROS: 'bg-slate-400',
};

export const RAMO_COLORS_HEX: Record<string, string> = {
  AUTO: '#3b82f6',
  HOGAR: '#10b981',
  VIDA: '#8b5cf6',
  SALUD: '#ec4899',
  GASTOS_MEDICOS: '#f43f5e',
  EMPRESARIAL: '#6366f1',
  RESPONSABILIDAD_CIVIL: '#f59e0b',
  INCENDIO: '#f97316',
  TRANSPORTE: '#06b6d4',
  AHORRO: '#14b8a6',
  JUBILACION: '#a855f7',
  OTROS: '#94a3b8',
};

export const ALL_RAMOS: string[] = [
  'AUTO', 'HOGAR', 'VIDA', 'SALUD', 'GASTOS_MEDICOS', 'EMPRESARIAL',
  'RESPONSABILIDAD_CIVIL', 'INCENDIO', 'TRANSPORTE', 'AHORRO',
  'JUBILACION', 'OTROS',
];

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export function buildEmptySeries(now: Date, count: number): TimelinePoint[] {
  const series: TimelinePoint[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const mes = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
    const label = `${MONTHS_ES_SHORT[d.getMonth()]} ${d.getFullYear().toString().slice(-2)}`;
    series.push({ mes, label, polizasCount: 0, polizasNuevas: 0, primaTotal: 0, primaPromedio: 0 });
  }
  return series;
}

export function linearRegression(points: Array<{ x: number; y: number }>): { slope: number; intercept: number } | null {
  const n = points.length;
  if (n < 2) return null;
  let sumX = 0;
  let sumY = 0;
  for (const p of points) { sumX += p.x; sumY += p.y; }
  const meanX = sumX / n;
  const meanY = sumY / n;
  let num = 0;
  let den = 0;
  for (const p of points) {
    num += (p.x - meanX) * (p.y - meanY);
    den += (p.x - meanX) ** 2;
  }
  if (den === 0) return null;
  const slope = num / den;
  const intercept = meanY - slope * meanX;
  return { slope, intercept };
}

export function stddev(values: number[]): number {
  const n = values.length;
  if (n < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const variance = values.reduce((acc, v) => acc + (v - mean) * (v - mean), 0) / (n - 1);
  return Math.sqrt(variance);
}

export function rSquared(points: Array<{ x: number; y: number; yHat: number }>): number {
  if (points.length < 2) return 0;
  const meanY = points.reduce((acc, p) => acc + p.y, 0) / points.length;
  const ssTot = points.reduce((acc, p) => acc + (p.y - meanY) ** 2, 0);
  const ssRes = points.reduce((acc, p) => acc + (p.y - p.yHat) ** 2, 0);
  if (ssTot === 0) return 1;
  return 1 - ssRes / ssTot;
}

/**
 * Helper principal: dado un set de puntos (x=i, y=primaMensual), devuelve
 * la regresión + proyección. Caso borde: <3 meses con actividad → confianza 0.
 */
export function computeRegressionForecast(
  ventana: TimelinePoint[],
  windowSize: number = 6
): RegressionResult & { confianza: number; stdResiduos: number; sinActividad: boolean } {
  const ys = ventana.map(p => p.primaTotal);
  const mesesConActividad = ys.filter(v => v > 0).length;

  if (mesesConActividad < 3) {
    return {
      slope: 0,
      intercept: 0,
      r2: 0,
      proyeccion: ys[ys.length - 1] ?? 0,
      ventana,
      mensaje: mesesConActividad === 0
        ? 'Sin actividad en los últimos 6 meses'
        : `Pocos meses con actividad (${mesesConActividad}/6)`,
      pendienteLabel: 'Plana',
      confianza: 0,
      stdResiduos: 0,
      sinActividad: true,
    };
  }

  const puntos = ventana.map((p, i) => ({ x: i, y: p.primaTotal }));
  const reg = linearRegression(puntos);
  if (!reg) {
    return {
      slope: 0,
      intercept: ys[ys.length - 1] ?? 0,
      r2: 0,
      proyeccion: ys[ys.length - 1] ?? 0,
      ventana,
      mensaje: 'No se pudo estimar la pendiente',
      pendienteLabel: 'Plana',
      confianza: 0,
      stdResiduos: 0,
      sinActividad: false,
    };
  }

  const proyeccionRaw = reg.slope * windowSize + reg.intercept;
  const proyeccion = Math.max(0, proyeccionRaw);

  const yHats = puntos.map(p => reg.slope * p.x + reg.intercept);
  const r2 = rSquared(puntos.map((p, i) => ({ x: p.x, y: p.y, yHat: yHats[i] })));
  const confianza = Math.max(0, Math.min(1, r2));

  const residuos = puntos.map((p, i) => p.y - yHats[i]);
  const stdResiduos = stddev(residuos);

  let pendienteLabel: RegressionResult['pendienteLabel'] = 'Plana';
  let mensaje = '';
  if (reg.slope > 0 && r2 > 0.5) {
    pendienteLabel = 'Alcista fuerte';
    mensaje = `Tendencia alcista con buen ajuste (R²=${(r2 * 100).toFixed(0)}%)`;
  } else if (reg.slope > 0) {
    pendienteLabel = 'Alcista débil';
    mensaje = `Tendencia alcista, variabilidad alta (R²=${(r2 * 100).toFixed(0)}%)`;
  } else if (reg.slope < 0 && r2 > 0.5) {
    pendienteLabel = 'Bajista fuerte';
    mensaje = `Tendencia a la baja — revisar (R²=${(r2 * 100).toFixed(0)}%)`;
  } else if (reg.slope < 0) {
    pendienteLabel = 'Bajista débil';
    mensaje = `Ligera caída — métricas variables`;
  } else {
    pendienteLabel = 'Plana';
    mensaje = `Tendencia plana — sin cambio claro`;
  }

  return {
    slope: reg.slope,
    intercept: reg.intercept,
    r2,
    proyeccion,
    ventana,
    mensaje,
    pendienteLabel,
    confianza,
    stdResiduos,
    sinActividad: false,
  };
}

/**
 * Helper específico de Prisma: dada una fechaEmision ya extraída (YYYY-MM),
 * llena el skeleton. Usado por todos los endpoints de forecast (base, smart,
 * by-ramo).
 */
export function accumulateByMonth(
  rows: Array<{ fechaEmision: Date; primaAnual: number | null | undefined }>,
  skeleton: TimelinePoint[]
): TimelinePoint[] {
  const accumulator = new Map<string, { count: number; prima: number }>();
  for (const r of rows) {
    const d = new Date(r.fechaEmision);
    const key = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
    const cur = accumulator.get(key) ?? { count: 0, prima: 0 };
    accumulator.set(key, {
      count: cur.count + 1,
      prima: cur.prima + Number(r.primaAnual ?? 0),
    });
  }
  return skeleton.map(s => {
    const v = accumulator.get(s.mes);
    if (!v) return s;
    return {
      ...s,
      polizasCount: v.count,
      polizasNuevas: v.count,
      primaTotal: v.prima,
      primaPromedio: v.count > 0 ? v.prima / v.count : 0,
    };
  });
}
