import { describe, expect, it } from 'vitest';
import { mapearHistorialMetricas } from '@/lib/saas-metrics';

const fila = {
  date: new Date('2026-11-01T00:00:00.000Z'),
  mrr: 828,
  arr: 9936,
  activeCustomers: 8,
  newCustomers: 3,
  trialConversionRate: 0,
};

describe('mapearHistorialMetricas', () => {
  it('usa la tasa guardada en el snapshot y no la recalcula', () => {
    // 2 bajas sobre una base de 40 = 5 %. Si se recalculara con
    // churnedCustomers/activeCustomers daría otro número (2/8 = 25 %).
    const [item] = mapearHistorialMetricas([{ ...fila, churnRate: 5 }]);
    expect(item.churnRate).toBe(5);
    expect(item.date).toBe('2026-11-01');
  });

  it('mantiene null en las filas anteriores a la unificación', () => {
    const [item] = mapearHistorialMetricas([{ ...fila, churnRate: null }]);
    expect(item.churnRate).toBeNull();
  });

  it('transporta el resto de métricas sin tocarlas', () => {
    const [item] = mapearHistorialMetricas([{ ...fila, churnRate: 0 }]);
    expect(item).toMatchObject({
      mrr: 828,
      arr: 9936,
      activeCustomers: 8,
      newCustomers: 3,
      trialConversionRate: 0,
    });
  });
});
