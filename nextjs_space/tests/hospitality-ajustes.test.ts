// @vitest-environment node
//
// Guardia del módulo de ajustes (capa 2 del pricing dinámico): antelación,
// ocupación y duración.
//
// Lo que protege:
//  - El Json de la base no es confiable: una pieza malformada se descarta y el
//    plan cotiza como si no tuviera ajustes.
//  - Por regla se aplica UN tramo (el más específico), nunca varios en cascada.
//  - Sin dato (antelación desconocida, noche sin ocupación) la regla no aplica:
//    no se inventa un porcentaje para poder cobrar.
//  - El factor tiene suelo y techo: la configuración no puede regalar la noche
//    ni multiplicarla por veinte.

import { describe, it, expect } from 'vitest';
import {
  FACTOR_MAXIMO,
  FACTOR_MINIMO,
  ajustesDeEstancia,
  factorDeAjustes,
  normalizarAjustes,
  porcentajeTotalDeAjustes,
  pidenAjustes,
  tieneAjustes,
  type ConfigAjustes,
} from '../lib/hospitality/ajustes';

const config = (crudo: unknown): ConfigAjustes | null => normalizarAjustes(crudo);

describe('normalizarAjustes', () => {
  it('acepta las tres reglas y ordena cada una del tramo más específico al más general', () => {
    const c = config({
      antelacion: [
        { desdeDias: 0, hastaDias: 6, porcentaje: 15, nombre: 'Última hora' },
        { desdeDias: 30, hastaDias: null, porcentaje: -10, nombre: 'Early bird' },
      ],
      ocupacion: [
        { desdePorcentaje: 50, porcentaje: 5 },
        { desdePorcentaje: 90, porcentaje: 25 },
      ],
      duracion: [
        { desdeNoches: 3, porcentaje: -5 },
        { desdeNoches: 7, porcentaje: -15 },
      ],
    });

    expect(c?.antelacion?.map((t) => t.desdeDias)).toEqual([30, 0]);
    expect(c?.ocupacion?.map((t) => t.desdePorcentaje)).toEqual([90, 50]);
    expect(c?.duracion?.map((t) => t.desdeNoches)).toEqual([7, 3]);
    expect(c?.antelacion?.[0]).toEqual({
      desdeDias: 30,
      hastaDias: null,
      porcentaje: -10,
      nombre: 'Early bird',
    });
  });

  it('acepta los números que llegan como texto desde el formulario', () => {
    const c = config({
      duracion: [{ desdeNoches: '7', porcentaje: '-15', nombre: 'Semana' }],
    });
    expect(c?.duracion).toEqual([{ desdeNoches: 7, porcentaje: -15, nombre: 'Semana' }]);
  });

  it('descarta la pieza mala y conserva las demás (nunca lanza)', () => {
    const c = config({
      antelacion: [
        { desdeDias: 'ayer', porcentaje: -10 }, // días no numéricos
        { desdeDias: 10, hastaDias: 3, porcentaje: -10 }, // rango invertido
        { desdeDias: 7, porcentaje: 0 }, // un 0 % no es un ajuste
        { desdeDias: 5, porcentaje: -8, nombre: 'Buena' },
      ],
    });
    expect(c?.antelacion).toEqual([{ desdeDias: 5, hastaDias: null, porcentaje: -8, nombre: 'Buena' }]);
    expect(c?.ocupacion).toBeNull();
    expect(c?.duracion).toBeNull();
  });

  it('respeta los límites del módulo: −90 % y +500 % son el borde, fuera de ahí se descarta', () => {
    const c = config({
      duracion: [
        { desdeNoches: 1, porcentaje: -90 },
        { desdeNoches: 2, porcentaje: 500 },
        { desdeNoches: 3, porcentaje: -90.5 },
        { desdeNoches: 4, porcentaje: 501 },
      ],
    });
    expect(c?.duracion?.map((t) => t.porcentaje)).toEqual([500, -90]);
  });

  it('la ocupación se mide en % (0-100) y la duración en noches (≥ 1)', () => {
    const c = config({
      ocupacion: [
        { desdePorcentaje: 101, porcentaje: 10 },
        { desdePorcentaje: 100, porcentaje: 10 },
      ],
      duracion: [
        { desdeNoches: 0, porcentaje: -10 },
        { desdeNoches: 1, porcentaje: -10 },
      ],
    });
    expect(c?.ocupacion).toEqual([{ desdePorcentaje: 100, porcentaje: 10 }]);
    expect(c?.duracion).toEqual([{ desdeNoches: 1, porcentaje: -10 }]);
  });

  it('sin ninguna regla utilizable no hay ajustes: el plan cotiza como siempre', () => {
    expect(config(null)).toBeNull();
    expect(config(undefined)).toBeNull();
    expect(config([])).toBeNull();
    expect(config('Reglas')).toBeNull();
    expect(config({ antelacion: [], ocupacion: [], duracion: [] })).toBeNull();
    expect(config({ otraCosa: 3 })).toBeNull();
    expect(tieneAjustes({ duracion: [{ desdeNoches: 7, porcentaje: -10 }] })).toBe(true);
    expect(tieneAjustes({ duracion: [] })).toBe(false);
  });

  it('pidenAjustes distingue «no mando nada» de «mando reglas que no valen»', () => {
    expect(pidenAjustes(undefined)).toBe(false);
    expect(pidenAjustes(null)).toBe(false);
    expect(pidenAjustes({ antelacion: [], duracion: [] })).toBe(false);
    expect(pidenAjustes({ duracion: [{ desdeNoches: 0, porcentaje: 0 }] })).toBe(true);
  });
});

describe('ajustesDeEstancia — un tramo por regla, el más específico', () => {
  const reglas = config({
    antelacion: [
      { desdeDias: 0, hastaDias: 6, porcentaje: 15, nombre: 'Última hora' },
      { desdeDias: 30, hastaDias: null, porcentaje: -10, nombre: 'Early bird' },
    ],
    ocupacion: [{ desdePorcentaje: 80, porcentaje: 20, nombre: 'Casi lleno' }],
    duracion: [
      { desdeNoches: 3, porcentaje: -5 },
      { desdeNoches: 7, porcentaje: -15 },
    ],
  });

  it('aplica el tramo de antelación que contiene los días y ni uno más', () => {
    expect(ajustesDeEstancia({ config: reglas, noches: 2, diasAntelacion: 45 }).map((a) => a.porcentaje)).toEqual([-10]);
    expect(ajustesDeEstancia({ config: reglas, noches: 2, diasAntelacion: 3 }).map((a) => a.porcentaje)).toEqual([15]);
    // 10 días: por encima del techo de «última hora» y por debajo del «early bird».
    expect(ajustesDeEstancia({ config: reglas, noches: 2, diasAntelacion: 10 })).toEqual([]);
  });

  it('la duración entra a partir de sus noches y gana el tramo más largo', () => {
    expect(ajustesDeEstancia({ config: reglas, noches: 2 }).map((a) => a.tipo)).toEqual([]);
    expect(ajustesDeEstancia({ config: reglas, noches: 4 }).map((a) => a.porcentaje)).toEqual([-5]);
    expect(ajustesDeEstancia({ config: reglas, noches: 9 }).map((a) => a.porcentaje)).toEqual([-15]);
  });

  it('la ocupación solo entra si llega el dato, y entra a partir de su umbral', () => {
    expect(ajustesDeEstancia({ config: reglas, noches: 2, ocupacionPorcentaje: 85 }).map((a) => a.porcentaje)).toEqual([20]);
    expect(ajustesDeEstancia({ config: reglas, noches: 2, ocupacionPorcentaje: 60 })).toEqual([]);
    expect(ajustesDeEstancia({ config: reglas, noches: 2, ocupacionPorcentaje: null })).toEqual([]);
    expect(ajustesDeEstancia({ config: reglas, noches: 2 })).toEqual([]);
  });

  it('sin antelación conocida la regla de antelación no aplica (no se inventa un valor)', () => {
    expect(ajustesDeEstancia({ config: reglas, noches: 2, diasAntelacion: null })).toEqual([]);
  });

  it('las tres reglas conviven y se explican una a una', () => {
    const aplicados = ajustesDeEstancia({
      config: reglas,
      noches: 7,
      diasAntelacion: 3,
      ocupacionPorcentaje: 95,
    });
    expect(aplicados).toEqual([
      { tipo: 'antelacion', porcentaje: 15, nombre: 'Última hora' },
      { tipo: 'ocupacion', porcentaje: 20, nombre: 'Casi lleno' },
      { tipo: 'duracion', porcentaje: -15 },
    ]);
  });

  it('sin configuración no hay nada que aplicar', () => {
    expect(ajustesDeEstancia({ config: null, noches: 7, diasAntelacion: 0 })).toEqual([]);
  });
});

describe('factorDeAjustes — multiplica, con suelo y techo', () => {
  it('sin ajustes la tarifa queda intacta', () => {
    expect(factorDeAjustes([])).toBe(1);
    expect(porcentajeTotalDeAjustes([])).toBe(0);
  });

  it('dos descuentos multiplican: dos −10 % son −19 %, no −20 %', () => {
    const aplicados = [
      { tipo: 'duracion' as const, porcentaje: -10 },
      { tipo: 'antelacion' as const, porcentaje: -10 },
    ];
    expect(factorDeAjustes(aplicados)).toBeCloseTo(0.81, 10);
    expect(porcentajeTotalDeAjustes(aplicados)).toBe(-19);
  });

  it('la configuración no puede regalar la noche: el suelo es el 10 %', () => {
    const brutal = [
      { tipo: 'duracion' as const, porcentaje: -90 },
      { tipo: 'antelacion' as const, porcentaje: -90 },
      { tipo: 'ocupacion' as const, porcentaje: -90 },
    ];
    expect(factorDeAjustes(brutal)).toBe(FACTOR_MINIMO);
    expect(porcentajeTotalDeAjustes(brutal)).toBe(-90);
  });

  it('ni multiplicarla por veinte: el techo es 5×', () => {
    const brutal = [
      { tipo: 'duracion' as const, porcentaje: 500 },
      { tipo: 'antelacion' as const, porcentaje: 500 },
      { tipo: 'ocupacion' as const, porcentaje: 500 },
    ];
    expect(factorDeAjustes(brutal)).toBe(FACTOR_MAXIMO);
    expect(porcentajeTotalDeAjustes(brutal)).toBe(400);
  });
});
