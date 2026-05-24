import { analyticsService } from '../services/analytics';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
}));

const mockedGetItem = require('expo-secure-store').getItemAsync as jest.Mock;
const mockedSetItem = require('expo-secure-store').setItemAsync as jest.Mock;

beforeEach(() => { jest.clearAllMocks(); });

describe('analyticsService.getDashboardMetrics', () => {
  it('returns empty array when no cache', async () => {
    mockedGetItem.mockResolvedValue(null);
    expect(await analyticsService.getDashboardMetrics()).toEqual([]);
  });

  it('returns cached metrics when available', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify([{ id: 'm1', type: 'revenue', label: 'Revenue', value: 100, previousValue: 80, change: 20, changePercent: 25, trend: 'up', color: '#000' }]));
    const result = await analyticsService.getDashboardMetrics();
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('revenue');
  });
});

describe('analyticsService.computeMetrics', () => {
  it('computes metrics from data', async () => {
    const data = { revenue: { current: 1000, previous: 800 }, leads: { current: 50, previous: 40 }, deals: { current: 20, previous: 15 }, contacts: { current: 100, previous: 90 }, tasks: { current: 30, previous: 25 }, appointments: { current: 10, previous: 8 } };
    const result = await analyticsService.computeMetrics(data);
    expect(Array.isArray(result)).toBe(true);
    expect(mockedSetItem).toHaveBeenCalled();
  });
});

describe('analyticsService.comparePeriods', () => {
  it('compares two values', () => {
    const result = analyticsService.comparePeriods(100, 80);
    expect(result).toHaveProperty('trend');
    expect(result.trend).toBe('up');
  });
});


// ─── Extra coverage: analytics methods ──────────────────────────────────

describe('analyticsService.comparePeriods', () => {
  it('compares two periods', () => {
    const result = analyticsService.comparePeriods(150, 100);
    expect(result.trend).toBe('up');
    expect(result.changePercent).toBe(50);
  });

  it('returns down trend', () => {
    const result = analyticsService.comparePeriods(50, 100);
    expect(result.trend).toBe('down');
  });

  it('returns flat trend when equal', () => {
    const result = analyticsService.comparePeriods(100, 100);
    expect(result.trend).toBe('flat');
    expect(result.changePercent).toBe(0);
  });

  it('handles previous = 0 in comparePeriods', () => {
    const result = analyticsService.comparePeriods(50, 0);
    expect(result.changePercent).toBe(0);
    expect(result.trend).toBe('up');
  });
});

describe('analyticsService.getChartData', () => {
  it('creates chart dataset', async () => {
    const data = [{ date: '2026-01-01', value: 100 }];
    const result = await analyticsService.getChartData('revenue', '30d', data);
    expect(result.id).toContain('chart_revenue');
    expect(result.data).toHaveLength(1);
  });

  it('uses gray fallback color for unknown metric type', async () => {
    const data = [{ date: '2026-01-01', value: 100 }];
    const result = await analyticsService.getChartData('unknown' as any, '30d', data);
    expect(result.color).toBe('#6B7280');
  });
});

describe('analyticsService.getSavedReports', () => {
  it('returns empty list when no data', async () => {
    mockedGetItem.mockResolvedValue(null);
    expect(await analyticsService.getSavedReports()).toEqual([]);
  });
});

describe('analyticsService.saveReport', () => {
  it('saves a report', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify([]));
    const report = await analyticsService.saveReport({
      name: 'Test Report', period: '30d',
      metrics: [], charts: [], summary: 'Test',
    });
    expect(report.id).toBeDefined();
    expect(report.generatedAt).toBeDefined();
    expect(mockedSetItem).toHaveBeenCalled();
  });
});

describe('analyticsService.deleteReport', () => {
  it('deletes a report', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify([{ id: 'r1', name: 'R1', period: '30d', metrics: [], charts: [], summary: '', generatedAt: 1 }]));
    await analyticsService.deleteReport('r1');
    expect(mockedSetItem).toHaveBeenCalled();
  });
});

describe('analyticsService.exportToCSV', () => {
  it('generates CSV string', async () => {
    const metrics = [{ label: 'Revenue', value: 100, previousValue: 80, change: 20, changePercent: 25, trend: 'up' as const, id: 'm1', type: 'revenue' as const, prefix: '$', color: '#000' }];
    const dataPoints = [{ date: '2026-01-01', value: 50 }];
    const csv = await analyticsService.exportToCSV(metrics, dataPoints);
    expect(csv).toContain('Revenue');
    expect(csv).toContain('2026-01-01');
  });
});

// ─── persistReports catch ─────────────────────────────────────────────

describe('analyticsService persistReports catch', () => {
  it('handles setItemAsync error gracefully', async () => {
    mockedSetItem.mockRejectedValueOnce(new Error('fail'));
    mockedGetItem.mockResolvedValue(JSON.stringify([]));
    const report = await analyticsService.saveReport({
      name: 'Test', period: '30d', metrics: [], charts: [], summary: 'S',
    });
    expect(report.id).toBeDefined();
  });
});
