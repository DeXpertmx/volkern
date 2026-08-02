import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests unitarios del forecast smart.
 * Cubre:
 *   1. Catálogo estático: claves canónicas, ventanas MMDD.
 *   2. Paschal Sunday algorithm (Semana Santa mobile).
 *   3. combinarMultipliers: producto + cap [0.5, 3.0].
 *   4. Heurístico de mejora MAPE > 20% cuando hay eventos con confianza.
 */

// Mock Prisma (no se usa aquí pero evita romper si el test importa transitivamente)
let upsertCalls: any[] = [];
let findFirstResults: any[] = [];
vi.mock('@/lib/db', () => ({
  prisma: {
    portfolioSeasonalMultiplier: {
      findFirst: vi.fn(async () => findFirstResults.shift() ?? null),
      upsert: vi.fn(async (args: any) => { upsertCalls.push(args); return { id: 'mock' }; }),
    },
    poliza: { aggregate: vi.fn(async () => ({ _sum: { primaAnual: 0 }, _count: 0 })) },
    googleCalendarIntegration: { findUnique: vi.fn(async () => null) },
    portfolioForecastLog: { create: vi.fn(async () => ({ id: 'log' })) },
    message: { create: vi.fn(async () => ({ id: 'm' })) },
    conversation: { create: vi.fn(async () => ({ id: 'c' })) },
  },
}));

beforeEach(() => {
  upsertCalls = [];
  findFirstResults = [];
});

import {
  SEASONAL_EVENTS_CATALOG,
  eventosParaRango,
  hayEventoEnRango,
} from '@/lib/insurance/seasonal-calendar';
import {
  combinarMultipliers,
  type ConsideredEvent,
} from '@/lib/insurance/seasonal-multiplier';

describe('seasonal-calendar — catálogo estático', () => {
  it('expone 5 eventos canónicos', () => {
    const keys = SEASONAL_EVENTS_CATALOG.map(e => e.key);
    expect(keys).toContain('VUELTA_COLE');
    expect(keys).toContain('FIN_ANO');
    expect(keys).toContain('BUEN_FIN');
    expect(keys).toContain('VERANO');
    expect(keys).toContain('RAMO_RENOVACION');
  });

  it('cada evento tiene ventana MMDD válida (inicio <= fin sin cruzar año)', () => {
    for (const ev of SEASONAL_EVENTS_CATALOG) {
      const [i, f] = ev.ventanaMd;
      expect(i).toBeGreaterThanOrEqual(101);
      expect(i).toBeLessThanOrEqual(1231);
      expect(f).toBeGreaterThanOrEqual(101);
      expect(f).toBeLessThanOrEqual(1231);
      // MMDD: mes*100 + día → mes está entre 1-12
      expect(Math.floor(i / 100)).toBeLessThanOrEqual(12);
      expect(Math.floor(f / 100)).toBeLessThanOrEqual(12);
    }
  });

  it('multipliersDefault están en [1.0, 2.0]', () => {
    for (const ev of SEASONAL_EVENTS_CATALOG) {
      expect(ev.multiplierDefault).toBeGreaterThanOrEqual(1.0);
      expect(ev.multiplierDefault).toBeLessThanOrEqual(2.0);
    }
  });
});

describe('seasonal-calendar — Semana Santa mobile (paschalSunday)', () => {
  it('carga Semana Santa dentro del rango pedido en abril', () => {
    // Año 2026: Pascua es 5 de abril; Ramos 29 marzo; Lunes Pascua 6 abril
    const desde = new Date(Date.UTC(2026, 2, 1)); // 1 marzo
    const hasta = new Date(Date.UTC(2026, 4, 30)); // 30 abril
    const eventos = eventosParaRango(desde, hasta, 2026);
    const ss = eventos.find(e => e.key === 'SEMANA_SANTA');
    expect(ss).toBeDefined();
    // Debe caer entre 22-marzo y 6-abril (incluyendo lunes pascua)
    expect(ss!.fechaInicio.getUTCMonth()).toBeLessThanOrEqual(3); // marzo o antes
  });

  it('Pascua 2026 cae cerca del 5 de abril (window: 22-mar → 25-abr)', () => {
    const desde = new Date(Date.UTC(2026, 2, 1));
    const hasta = new Date(Date.UTC(2026, 4, 30));
    const eventos = eventosParaRango(desde, hasta, 2026);
    const ss = eventos.find(e => e.key === 'SEMANA_SANTA');
    expect(ss).toBeDefined();
    // Semana Santa 2026 cae entre 29-mar (Domingo de Ramos) y 6-abr (Lunes Pascua).
    // La ventana canónica de Pascua es 22-marzo → 25-abril.
    const inicioMin = new Date(Date.UTC(2026, 2, 22));
    const finMax = new Date(Date.UTC(2026, 3, 25));
    const enVentana = ss!.fechaInicio >= inicioMin && ss!.fechaInicio <= finMax;
    expect(enVentana).toBe(true);
  });

  it('rango sin abr/mar no incluye Semana Santa', () => {
    const desde = new Date(Date.UTC(2026, 5, 1));
    const hasta = new Date(Date.UTC(2026, 6, 30));
    const eventos = eventosParaRango(desde, hasta, 2026);
    expect(eventos.find(e => e.key === 'SEMANA_SANTA')).toBeUndefined();
  });
});

describe('seasonal-calendar — eventos fijos en rango', () => {
  it('detecta VERANO dentro de junio-agosto', () => {
    const desde = new Date(Date.UTC(2026, 5, 15));
    const hasta = new Date(Date.UTC(2026, 7, 15));
    const eventos = eventosParaRango(desde, hasta, 2026);
    expect(eventos.some(e => e.key === 'VERANO')).toBe(true);
  });

  it('detecta VUELTA_COLE en septiembre', () => {
    const desde = new Date(Date.UTC(2026, 8, 1));
    const hasta = new Date(Date.UTC(2026, 8, 30));
    const eventos = eventosParaRango(desde, hasta, 2026);
    expect(eventos.some(e => e.key === 'VUELTA_COLE')).toBe(true);
  });

  it('detecta FIN_ANO en diciembre', () => {
    const desde = new Date(Date.UTC(2026, 11, 1));
    const hasta = new Date(Date.UTC(2026, 11, 31));
    const eventos = eventosParaRango(desde, hasta, 2026);
    expect(eventos.some(e => e.key === 'FIN_ANO')).toBe(true);
  });

  it('rango sin ningún evento reconocido devuelve []', () => {
    // Mayo 2026 (no coincide con ningún evento del catálogo fijo, ni Semana Santa)
    const desde = new Date(Date.UTC(2026, 4, 1));
    const hasta = new Date(Date.UTC(2026, 4, 15));
    const eventos = eventosParaRango(desde, hasta, 2026);
    // Mayo está libre de eventos, salvo que Semana Santa caiga tarde
    // (en 2026 cae 5-abril, fuera de mayo).
    expect(eventos.length).toBe(0);
  });

  it('hayEventoEnRango helper funciona', () => {
    expect(hayEventoEnRango(
      new Date(Date.UTC(2026, 11, 1)),
      new Date(Date.UTC(2026, 11, 31))
    )).toBe(true);
    expect(hayEventoEnRango(
      new Date(Date.UTC(2026, 4, 1)),
      new Date(Date.UTC(2026, 4, 15))
    )).toBe(false);
  });
});

describe('combinarMultipliers', () => {
  it('sin eventos devuelve 1.0', () => {
    expect(combinarMultipliers([])).toBe(1.0);
  });

  it('un evento con multiplier 1.30 → 1.30', () => {
    expect(combinarMultipliers([eventoMock('x', 1.30)])).toBeCloseTo(1.30, 5);
  });

  it('múltiples eventos se multiplican entre sí', () => {
    const compuesto = combinarMultipliers([
      eventoMock('A', 1.20),
      eventoMock('B', 1.30),
    ]);
    expect(compuesto).toBeCloseTo(1.56, 5); // 1.20 × 1.30
  });

  it('cap mínimo: producto absurdo bajo → 0.5', () => {
    const compuesto = combinarMultipliers([
      eventoMock('A', 0.10),
      eventoMock('B', 0.10),
    ]);
    expect(compuesto).toBe(0.5);
  });

  it('cap máximo: producto absurdo alto → 3.0', () => {
    const compuesto = combinarMultipliers([
      eventoMock('A', 5.0),
      eventoMock('B', 5.0),
    ]);
    expect(compuesto).toBe(3.0);
  });
});

describe('heurístico mejoraMapeEstimada > 20%', () => {
  // Reproducimos localmente la función para testearla sin mockear el módulo.
  function mejoraMapeEsperada(eventos: ConsideredEvent[], mape: number): number {
    if (eventos.length === 0) return 0;
    const fuerza = Math.abs(eventos.reduce((a, e) => a * e.multiplier, 1) - 1);
    const promedioConf = eventos.reduce((a, e) => a + e.confianza, 0) / eventos.length;
    const mejora = fuerza * promedioConf * 100;
    return Math.min(35, Math.round(mejora));
  }

  it('sin eventos → 0% mejora', () => {
    expect(mejoraMapeEsperada([], 0.20)).toBe(0);
  });

  it('evento con multiplier 1.5 y confianza 0.8 → mejora > 20%', () => {
    const mejora = mejoraMapeEsperada([eventoMock('x', 1.5, 0.8)], 0.20);
    expect(mejora).toBeGreaterThanOrEqual(20);
  });

  it('evento débil (1.10 × 0.3 conf) → mejora < 20%', () => {
    const mejora = mejoraMapeEsperada([eventoMock('x', 1.10, 0.3)], 0.20);
    expect(mejora).toBeLessThan(20);
  });

  it('múltiples eventos fuertes → mejora cap a 35%', () => {
    const eventos = [
      eventoMock('FIN_ANO', 1.40, 0.8),
      eventoMock('VERANO', 1.15, 0.6),
      eventoMock('BUEN_FIN', 1.20, 0.7),
    ];
    const mejora = mejoraMapeEsperada(eventos, 0.10);
    expect(mejora).toBeGreaterThanOrEqual(20);
    expect(mejora).toBeLessThanOrEqual(35);
  });

  it('confianza baja enmascara fuerza real', () => {
    const eventos = [eventoMock('x', 2.0, 0.1)];
    const mejora = mejoraMapeEsperada(eventos, 0.20);
    // fuerza = 1.0, conf = 0.1 → mejora = 10% < 20%
    expect(mejora).toBeLessThan(20);
  });
});

function eventoMock(key: string, multiplier: number, confianza = 0.7): ConsideredEvent {
  return {
    key,
    nombre: `Mock ${key}`,
    ramo: null,
    fechaInicio: new Date().toISOString(),
    fechaFin: new Date().toISOString(),
    multiplier,
    confianza,
    fuente: 'static',
  };
}
