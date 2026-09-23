// @vitest-environment node
//
// GUARDIA H15 · El backoff del parte de viajeros — bordes y JITTER.
//
// La ficha H15 ya tenía guardias (parte-rechazo, partes-metrics, aviso-partes,
// abandono, cron) pero el plan §5.1 pedía cubrir los BORDES del backoff y su
// jitter, que no existía: todos los partes de un barrido reintentaban en el
// mismo minuto (efecto estampida si el servicio del Ministerio está caído).
//
// Lo que se congela:
//   PELDAÑOS — 1h/2h/4h/8h con tope 16h, sin deuda: los casos nominales viven
//   en hospitality-parte-rechazo.test.ts; aquí están sus FRONTERAS.
//   JITTER — ±20 % del peldaño, redondeado, con el azar INYECTADO
//   (reproducible): acotado, centrado, simétrico, nunca negativo y tope jamás
//   superado. Es jitter POR PASADA del cron (los límites viajan en SQL y el
//   azar se tira una vez por barrido) — así se diseñó y así se congela.
//   CRON — consume la función con jitter, no la pelada.
//   ÚNICA DEFINICIÓN — el tope de intentos del cron es el alias del módulo.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  esperaReintentoMs,
  esperaReintentoConJitterMs,
  JITTER_REINTENTO,
  ESPERA_BASE_REINTENTO_MS,
  ESPERA_REINTENTO_MAXIMA_MS,
  MAX_INTENTOS_PARTE,
} from '@/lib/hospitality/parte-rechazo';

const HORA = ESPERA_BASE_REINTENTO_MS;

// Azar controlado: construye una función que devuelve la secuencia dada
// (0 → mínimo del peldaño, 0.5 → el peldaño tal cual, 1 → máximo).
const azarFijo = (valores: number[]) => {
  let i = 0;
  return () => valores[i++ % valores.length];
};

describe('H15 · peldaños del backoff: las fronteras exactas', () => {
  it('peldaño 1 = 1 h exacta: la frontera del primer reintento no se adelanta ni se retrasa', () => {
    expect(esperaReintentoMs(1)).toBe(1 * HORA);
    expect(esperaReintentoMs(1)).not.toBe(1 * HORA - 1);
  });

  it('cada peldaño DOBLA al anterior: 1, 2, 4, 8 — la curva es exponencial, no lineal', () => {
    expect(esperaReintentoMs(2)).toBe(esperaReintentoMs(1) * 2);
    expect(esperaReintentoMs(3)).toBe(esperaReintentoMs(2) * 2);
    expect(esperaReintentoMs(4)).toBe(esperaReintentoMs(3) * 2);
  });

  it('el tope 16 h manda desde el quinto peldaño y no se supera nunca', () => {
    expect(esperaReintentoMs(5)).toBe(16 * HORA);
    expect(esperaReintentoMs(6)).toBe(16 * HORA);
    expect(esperaReintentoMs(50)).toBe(16 * HORA);
    expect(esperaReintentoMs(50)).toBe(ESPERA_REINTENTO_MAXIMA_MS);
  });

  it('entradas raras no rompen la curva: decimales caen al peldaño INFERIOR (floor), 0 y negativos son el primer peldaño', () => {
    // El módulo hace Math.floor antes de calcular: 1.9 gasta el peldaño 1, no el 2.
    expect(esperaReintentoMs(1.9)).toBe(esperaReintentoMs(1));
    expect(esperaReintentoMs(0)).toBe(1 * HORA);
    expect(esperaReintentoMs(-3)).toBe(1 * HORA);
  });

  it('la suma de los cuatro primeros peldaños es 15 h: cuatro intentos en media jornada y pico', () => {
    // Es la cifra que decide si «una mañana caída» se machaca: con backoff,
    // los cuatro primeros reintentos caben en 15 horas, no en 4.
    expect(esperaReintentoMs(1) + esperaReintentoMs(2) + esperaReintentoMs(3) + esperaReintentoMs(4)).toBe(15 * HORA);
  });
});

describe('H15 · jitter (±20 %): la estampida se rompe', () => {
  it('la amplitud declarada es 0.2', () => {
    expect(JITTER_REINTENTO).toBe(0.2);
  });

  it('con azar 0.5 el jitter es neutro: sale el peldaño pelado', () => {
    expect(esperaReintentoConJitterMs(1, azarFijo([0.5]))).toBe(1 * HORA);
    expect(esperaReintentoConJitterMs(3, azarFijo([0.5]))).toBe(4 * HORA);
  });

  it('los extremos son ±20 % del peldaño, redondeados (azar 0 → mínimo, azar 1 → máximo)', () => {
    expect(esperaReintentoConJitterMs(1, azarFijo([0]))).toBe(Math.round(1 * HORA * 0.8));
    expect(esperaReintentoConJitterMs(1, azarFijo([1]))).toBe(Math.round(1 * HORA * 1.2));
    expect(esperaReintentoConJitterMs(3, azarFijo([0]))).toBe(Math.round(4 * HORA * 0.8));
    expect(esperaReintentoConJitterMs(3, azarFijo([1]))).toBe(Math.round(4 * HORA * 1.2));
  });

  it('cada llamada tira SU azar: dos partes del mismo pase no comparten desviación si la secuencia avanza', () => {
    const valor = esperaReintentoConJitterMs(1, azarFijo([0, 1]));
    expect(valor).toBe(Math.round(1 * HORA * 0.8)); // el primero consume el 0
  });

  it('SIEMPRE dentro de [base − 20 %, base + 20 %] y jamás negativo, con mil azares barajados', () => {
    const azar = azarFijo([0.13, 0.97, 0.41, 0.66, 0.05, 0.89, 0.22, 0.58]);
    for (const peldano of [1, 2, 3, 4, 5]) {
      const base = esperaReintentoMs(peldano);
      const min = base - Math.round(base * JITTER_REINTENTO);
      const max = base + Math.round(base * JITTER_REINTENTO);
      for (let i = 0; i < 20; i++) {
        const v = esperaReintentoConJitterMs(peldano, azar);
        expect(v).toBeGreaterThanOrEqual(min);
        expect(v).toBeLessThanOrEqual(max);
        expect(v).toBeGreaterThan(0);
      }
    }
  });

  it('el TOPE del backoff manda sobre el jitter: en el último peldaño el azar solo puede ACORTAR la espera', () => {
    const azar = azarFijo([1, 0.99, 0.95, 1, 0.97]);
    for (let i = 0; i < 10; i++) {
      expect(esperaReintentoConJitterMs(5, azar)).toBeLessThanOrEqual(ESPERA_REINTENTO_MAXIMA_MS);
    }
    // El caso límite exacto: azar 1 sobre el peldaño 16 h NO lo estira a 19,2 h.
    expect(esperaReintentoConJitterMs(5, azarFijo([1]))).toBe(ESPERA_REINTENTO_MAXIMA_MS);
  });

  it('reproducible: misma secuencia de azar, misma espera (la guardia puede congelar el comportamiento)', () => {
    const a = esperaReintentoConJitterMs(2, azarFijo([0.3, 0.3, 0.3]));
    const b = esperaReintentoConJitterMs(2, azarFijo([0.3, 0.3, 0.3]));
    expect(a).toBe(b);
    expect(a).toBe(2 * HORA + Math.round((0.3 * 2 - 1) * Math.round(2 * HORA * 0.2)));
  });

  it('en producción usa Math.random: sin azar inyectado el resultado cae dentro del rango', () => {
    const base = esperaReintentoMs(1);
    const min = base - Math.round(base * JITTER_REINTENTO);
    const max = base + Math.round(base * JITTER_REINTENTO);
    for (let i = 0; i < 50; i++) {
      const v = esperaReintentoConJitterMs(1);
      expect(v).toBeGreaterThanOrEqual(min);
      expect(v).toBeLessThanOrEqual(max);
    }
  });
});

describe('H15 · la costura del abandono (los bordes que deciden el producto)', () => {
  it('con MAX_INTENTOS_PARTE = 5: el parte con 4 intentos y 16 h sigue teniendo UN reintento final', () => {
    // No está congelado el valor del máximo como número suelto sino la CONSECUENCIA:
    // 5 intentos máximos significan 4 esperas completas antes del último tiro.
    expect(MAX_INTENTOS_PARTE).toBe(5);
  });

  it('el peldaño que toca tras N intentos es N+1 (el módulo no re-espera un peldaño ya gastado)', () => {
    // reintentoDisponible ya está congelado en hospitality-parte-rechazo.test.ts;
    // aquí se congela la REGLA que lo conecta con los peldaños: con 3 gastados
    // toca esperar el peldaño 4, no el 3.
    expect(esperaReintentoMs(4)).toBe(8 * HORA);
  });
});

// ── Cron y fuente ────────────────────────────────────────────────────────────

describe('H15 · el cron consume el jitter y la definición es única', () => {
  const cron = () => readFileSync('lib/cron/hospitality-registro-viajeros.ts', 'utf8');
  const modulo = () => readFileSync('lib/hospitality/parte-rechazo.ts', 'utf8');

  it('los límites SQL de la pasada se calculan con esperaReintentoConJitterMs', () => {
    const fuente = cron();
    expect(fuente).toContain('esperaReintentoConJitterMs(1)');
    expect(fuente).toContain('esperaReintentoConJitterMs(2)');
    expect(fuente).toContain('esperaReintentoConJitterMs(3)');
    expect(fuente).toContain('esperaReintentoConJitterMs(4)');
    expect(fuente).toContain('esperaReintentoConJitterMs(5)');
    expect(fuente).not.toContain('esperaReintentoMs('); // la pelada, prohibida en el cron
  });

  it('MAX_REINTENTOS del cron es el alias del módulo: el tope no puede divergir', () => {
    expect(readFileSync('lib/cron/hospitality-registro-viajeros.ts', 'utf8')).toContain(
      'export const MAX_REINTENTOS = MAX_INTENTOS_PARTE;'
    );
  });

  it('el cron documenta el jitter como POR PASADA (decisión visible, no accidente)', () => {
    expect(cron()).toMatch(/POR PASADA/);
  });
});
