import { describe, it, expect } from 'vitest';
import { resumirConsolidacion } from '../lib/finance/resumen-financiero';

/**
 * El cockpit de Finanzas y Reportes leían los campos a mano y mal
 * (`pnl.totalRevenue`, `pnl.netProfit`, `pnl.totalExpenses`), así que un tenant
 * sin movimientos y un endpoint caído se veían igual: ceros. Estas pruebas fijan
 * la traducción y, sobre todo, que "no hay datos" no es "cero".
 */
describe('resumirConsolidacion — traducción de la consolidación', () => {
  const conDatos = {
    period: { meses: 1, desde: '2026-09-01', hasta: '2026-09-12' },
    pnl: {
      revenue: 42750.5,
      expenses: 18200,
      payroll: 9000,
      manufacturingCosts: 1200,
      scrapLoss: 200,
      profit: 24550.5,
      margin: '57.42',
      resumen: 'Análisis de Rentabilidad (current_month)',
    },
    cashFlow: { expectedIn: 31000, committedOut: 18200, runwayDays: 51.1, resumen: 'Proyección a 30 días' },
    tax: { region: 'ES', estimatedLiability: '8977.61', advice: 'Reserva el 21% de IVA.' },
  };

  it('traduce las cifras del periodo y la proyección', () => {
    const resumen = resumirConsolidacion(conDatos);
    expect(resumen.hayRespuesta).toBe(true);
    expect(resumen.hayDatos).toBe(true);
    expect(resumen.cifras).toEqual({ ingresos: 42750.5, gastos: 18200, beneficio: 24550.5, margen: 57.42 });
    expect(resumen.proyeccion).toEqual({ pipelinePonderado: 31000, gastoMensual: 18200, diasDeCaja: 51.1 });
    expect(resumen.resumen).toBe('Análisis de Rentabilidad (current_month)');
  });

  it('un periodo sin movimientos no es un periodo con ceros', () => {
    const resumen = resumirConsolidacion({
      pnl: { revenue: 0, expenses: 0, profit: 0, margin: '0.00' },
      cashFlow: { expectedIn: 0, committedOut: 0, runwayDays: null },
    });
    expect(resumen.hayRespuesta).toBe(true);
    expect(resumen.hayDatos).toBe(false);
    // Un margen sobre ingresos cero no es un dato: se descarta.
    expect(resumen.cifras.margen).toBeNull();
    expect(resumen.cifras.ingresos).toBe(0);
    expect(resumen.proyeccion.diasDeCaja).toBeNull();
  });

  it('gastos sin ingresos sí son datos, pero sin margen', () => {
    const resumen = resumirConsolidacion({ pnl: { revenue: 0, expenses: 1500, profit: -1500, margin: '0.00' } });
    expect(resumen.hayDatos).toBe(true);
    expect(resumen.cifras.gastos).toBe(1500);
    expect(resumen.cifras.beneficio).toBe(-1500);
    expect(resumen.cifras.margen).toBeNull();
  });

  it('calcula el margen si la skill no lo declara y hay ingresos', () => {
    const resumen = resumirConsolidacion({ pnl: { revenue: 1000, expenses: 250, profit: 750 } });
    expect(resumen.cifras.margen).toBeCloseTo(75, 5);
  });

  it('una respuesta de error no se confunde con un periodo vacío', () => {
    const resumen = resumirConsolidacion({ error: 'Error al consolidar datos financieros' });
    expect(resumen.hayRespuesta).toBe(false);
    expect(resumen.hayDatos).toBe(false);
    expect(resumen.cifras.ingresos).toBeNull();
  });

  it('aguanta payloads sin forma (sin datos, undefined, null)', () => {
    for (const entrada of [undefined, null, 'texto', 42, {}]) {
      const resumen = resumirConsolidacion(entrada);
      expect(resumen.hayDatos).toBe(false);
      expect(resumen.hayRespuesta).toBe(false);
      expect(resumen.cifras).toEqual({ ingresos: null, gastos: null, beneficio: null, margen: null });
    }
  });

  it('ignora cifras que no son números en lugar de convertirlas en cero', () => {
    const resumen = resumirConsolidacion({ pnl: { revenue: 'no es un número', expenses: 100 } });
    expect(resumen.cifras.ingresos).toBeNull();
    expect(resumen.cifras.gastos).toBe(100);
    expect(resumen.hayDatos).toBe(true);
  });
});
