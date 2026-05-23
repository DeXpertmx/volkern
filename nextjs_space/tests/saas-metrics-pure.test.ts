import { describe, it, expect } from 'vitest';
import { SaaSMetricsService } from '@/lib/saas-metrics';

// ─── calculateARR ──────────────────────────────────────────────────────
describe('calculateARR', () => {
  it('MRR 100 → ARR 1200', () => {
    expect(SaaSMetricsService.calculateARR(100)).toBe(1200);
  });

  it('MRR 0 → ARR 0', () => {
    expect(SaaSMetricsService.calculateARR(0)).toBe(0);
  });

  it('MRR 1000 → ARR 12000', () => {
    expect(SaaSMetricsService.calculateARR(1000)).toBe(12000);
  });

  it('MRR decimal 99.99 → ARR 1199.88', () => {
    expect(SaaSMetricsService.calculateARR(99.99)).toBeCloseTo(1199.88, 2);
  });

  it('MRR negativo → ARR negativo', () => {
    expect(SaaSMetricsService.calculateARR(-50)).toBe(-600);
  });
});

// ─── calculateLTV ──────────────────────────────────────────────────────
describe('calculateLTV', () => {
  it('avgRevenue 1000, churnRate 5% → LTV 20000', () => {
    expect(SaaSMetricsService.calculateLTV(1000, 5)).toBe(20000);
  });

  it('avgRevenue 500, churnRate 10% → LTV 5000', () => {
    expect(SaaSMetricsService.calculateLTV(500, 10)).toBe(5000);
  });

  it('avgRevenue 100, churnRate 2% → LTV 5000', () => {
    expect(SaaSMetricsService.calculateLTV(100, 2)).toBe(5000);
  });

  it('churnRate 0 → LTV 0 (división por cero protegida)', () => {
    expect(SaaSMetricsService.calculateLTV(1000, 0)).toBe(0);
  });

  it('churnRate 100% → LTV = avgRevenue', () => {
    expect(SaaSMetricsService.calculateLTV(1000, 100)).toBe(1000);
  });

  it('avgRevenue 0 → LTV 0', () => {
    expect(SaaSMetricsService.calculateLTV(0, 10)).toBe(0);
  });
});

// ─── calculateCAC ──────────────────────────────────────────────────────
describe('calculateCAC', () => {
  it('marketing 10000, 100 new customers → CAC 100', () => {
    expect(SaaSMetricsService.calculateCAC(10000, 100)).toBe(100);
  });

  it('marketing 5000, 50 new customers → CAC 100', () => {
    expect(SaaSMetricsService.calculateCAC(5000, 50)).toBe(100);
  });

  it('0 new customers → CAC 0', () => {
    expect(SaaSMetricsService.calculateCAC(10000, 0)).toBe(0);
  });

  it('marketing 0 → CAC 0', () => {
    expect(SaaSMetricsService.calculateCAC(0, 100)).toBe(0);
  });

  it('marketing 15000, 3 new customers → CAC 5000', () => {
    expect(SaaSMetricsService.calculateCAC(15000, 3)).toBe(5000);
  });
});
