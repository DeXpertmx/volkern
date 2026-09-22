// @vitest-environment node

import { describe, it, expect } from 'vitest';

/**
 * Guardia de la política de penalización por no-show (módulo PURO).
 *
 * La pregunta que responde: **¿cuánto se cobra cuando el huésped no llega?**
 * Ninguna métrica de ocupación puede depender de esto: el no-show no ocupa la
 * unidad (regla 7 del plan) y la penalización es un cargo de cancelación, no
 * ingreso de alojamiento. Este fichero fija solo la decisión de cobro.
 */

import {
  calcularPenalizacionNoShow,
  politicaEfectiva,
  esPoliticaNoShow,
  elHotelEmiteElCargo,
  POLITICAS_NO_SHOW,
  POLITICA_NO_SHOW_POR_DEFECTO,
  ETIQUETA_POLITICA_NO_SHOW,
  DESCRIPCION_POLITICA_NO_SHOW,
  type PoliticaNoShow,
} from '@/lib/hospitality/no-show';

const entrada = (overrides: Partial<Parameters<typeof calcularPenalizacionNoShow>[0]> = {}) => ({
  politica: 'primera_noche' as PoliticaNoShow,
  canal: 'Directa',
  importeTotal: 700,
  noches: 5,
  ...overrides,
});

describe('Penalización por no-show — qué se cobra', () => {
  it('la primera noche es el defecto y cobra una noche: importe de la reserva entre sus noches', () => {
    const r = calcularPenalizacionNoShow(entrada({ politica: 'primera_noche', importeTotal: 700, noches: 5 }));

    expect(r.aplica).toBe(true);
    expect(r.nochesPenalizadas).toBe(1);
    expect(r.importe).toBe(140);
    expect(r.motivo).toBeNull();
    expect(r.concepto).toContain('1 noche');
  });

  it('la estancia completa cobra el importe entero y declara todas las noches', () => {
    const r = calcularPenalizacionNoShow(entrada({ politica: 'estancia_completa', importeTotal: 700, noches: 5 }));

    expect(r.importe).toBe(700);
    expect(r.nochesPenalizadas).toBe(5);
    expect(r.concepto).toContain('estancia completa');
    expect(r.concepto).toContain('5 noches');
  });

  it('«ninguna» no cobra nada y lo dice', () => {
    const r = calcularPenalizacionNoShow(entrada({ politica: 'ninguna' }));

    expect(r.aplica).toBe(false);
    expect(r.importe).toBe(0);
    expect(r.nochesPenalizadas).toBe(0);
    expect(r.motivo).toBe('politica_ninguna');
  });

  it('en una estancia de una sola noche, primera_noche y estancia_completa coinciden', () => {
    const una = calcularPenalizacionNoShow(entrada({ politica: 'primera_noche', importeTotal: 180, noches: 1 }));
    const entera = calcularPenalizacionNoShow(entrada({ politica: 'estancia_completa', importeTotal: 180, noches: 1 }));

    expect(una.importe).toBe(180);
    expect(entera.importe).toBe(180);
    expect(una.nochesPenalizadas).toBe(entera.nochesPenalizadas);
  });

  it('redondea a dos decimales (700 / 3)', () => {
    const r = calcularPenalizacionNoShow(entrada({ importeTotal: 700, noches: 3 }));

    expect(r.importe).toBe(233.33);
  });

  it('sin importe o sin noches no se inventa un cargo', () => {
    expect(calcularPenalizacionNoShow(entrada({ importeTotal: null })).motivo).toBe('sin_importe');
    expect(calcularPenalizacionNoShow(entrada({ importeTotal: 0 })).motivo).toBe('sin_importe');
    expect(calcularPenalizacionNoShow(entrada({ noches: 0 })).motivo).toBe('sin_noches');
    expect(calcularPenalizacionNoShow(entrada({ noches: -2 })).motivo).toBe('sin_noches');
  });
});

describe('Penalización por no-show — quién emite el cargo', () => {
  it('solo los canales de venta propia son responsabilidad del hotel', () => {
    for (const canal of ['Directa', 'directa', '  DIRECTA ', 'Volkern', 'Booking Engine', 'Mostrador']) {
      expect(elHotelEmiteElCargo(canal), canal).toBe(true);
    }
  });

  it('un canal externo cobra su propia penalización: emitirla sería cobrar dos veces', () => {
    for (const canal of ['Airbnb', 'Booking.com', 'Expedia', 'Despegar']) {
      const r = calcularPenalizacionNoShow(entrada({ canal }));
      expect(r.aplica, canal).toBe(false);
      expect(r.motivo, canal).toBe('canal_del_proveedor');
    }
  });

  it('el operador puede forzar la emisión en un canal externo (override explícito)', () => {
    const r = calcularPenalizacionNoShow(entrada({ canal: 'Airbnb', cobrarEnCanal: true }));

    expect(r.aplica).toBe(true);
    expect(r.importe).toBe(140);
  });

  it('ante un canal vacío o desconocido no se emite (peor cobrar dos veces que no cobrar)', () => {
    expect(calcularPenalizacionNoShow(entrada({ canal: '' })).motivo).toBe('canal_del_proveedor');
    expect(calcularPenalizacionNoShow(entrada({ canal: null })).motivo).toBe('canal_del_proveedor');
    expect(calcularPenalizacionNoShow(entrada({ canal: 'Canal Nuevo' })).motivo).toBe('canal_del_proveedor');
  });
});

describe('Penalización por no-show — política efectiva de la propiedad', () => {
  it('acepta solo las tres políticas conocidas', () => {
    for (const p of POLITICAS_NO_SHOW) expect(esPoliticaNoShow(p)).toBe(true);
    for (const v of ['', 'todo', 'ESTANCIA_COMPLETA', null, undefined, 3, {}]) {
      expect(esPoliticaNoShow(v), String(v)).toBe(false);
    }
  });

  it('un valor corrupto en la BD cae en la de defecto en vez de cambiar el criterio en silencio', () => {
    expect(politicaEfectiva('primera_noche')).toBe('primera_noche');
    expect(politicaEfectiva('estancia_completa')).toBe('estancia_completa');
    expect(politicaEfectiva('lo-que-sea')).toBe(POLITICA_NO_SHOW_POR_DEFECTO);
    expect(politicaEfectiva(null)).toBe('primera_noche');
  });

  it('la UI tiene etiqueta y explicación para cada política', () => {
    for (const p of POLITICAS_NO_SHOW) {
      expect(ETIQUETA_POLITICA_NO_SHOW[p]).toBeTruthy();
      expect(DESCRIPCION_POLITICA_NO_SHOW[p]).toBeTruthy();
    }
  });
});
