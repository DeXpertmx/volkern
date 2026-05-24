import { dashboardService } from '../services/dashboard';
import { api } from '../services/api';

jest.mock('../services/api', () => ({
  api: {
    get: jest.fn(),
  },
}));

const mockGet = api.get as jest.Mock;

beforeEach(() => { jest.clearAllMocks(); });

describe('dashboardService.getStats', () => {
  it('calls api.get with range', async () => {
    mockGet.mockResolvedValue({ totalLeads: 10, citasHoy: 2, ingresosMes: 50000, campanasActivas: 3, totalCampanas: 5, campanasCompletadas: 1, proximasCitas: [], ingresosDiarios: [] });
    const result = await dashboardService.getStats('30');
    expect(mockGet).toHaveBeenCalled();
    expect(result.totalLeads).toBe(10);
  });

  it('uses default range when not provided', async () => {
    mockGet.mockResolvedValue({ totalLeads: 5, citasHoy: 1, ingresosMes: 10000, campanasActivas: 1, totalCampanas: 2, campanasCompletadas: 0, proximasCitas: [], ingresosDiarios: [] });
    await dashboardService.getStats();
    expect(mockGet).toHaveBeenCalled();
  });
});

describe('dashboardService.computeTrend', () => {
  it('computes trend direction', () => {
    const result = dashboardService.computeTrend(100, 80);
    expect(result).toHaveProperty('direction');
    expect(result.direction).toBe('up');
  });
});

describe('dashboardService.formatCurrency', () => {
  it('formats MXN currency', () => {
    const result = dashboardService.formatCurrency(15000);
    expect(typeof result).toBe('string');
    expect(result).toContain('15');
  });

  it('formatCurrency handles zero', () => {
    expect(dashboardService.formatCurrency(0)).toContain('0');
  });
});


describe('dashboardService.parseActivities', () => {
  it('parses proximasCitas into activities', () => {
    const stats = {
      totalLeads: 0, citasHoy: 0, ingresosMes: 0,
      campanasActivas: 0, totalCampanas: 0, campanasCompletadas: 0,
      ingresosDiarios: [],
      proximasCitas: [{
        id: 'c1', fechaHora: new Date(Date.now() + 3600000).toISOString(),
        estado: 'pending',
        lead: { id: 'l1', name: 'Juan' },
        servicio: { id: 's1', nombre: 'Consulta' },
      }],
    };
    const activities = dashboardService.parseActivities(stats);
    expect(activities).toHaveLength(1);
    expect(activities[0].type).toBe('cita');
  });

  it('returns empty array when no proximasCitas', () => {
    const stats = {
      totalLeads: 0, citasHoy: 0, ingresosMes: 0,
      campanasActivas: 0, totalCampanas: 0, campanasCompletadas: 0,
      ingresosDiarios: [], proximasCitas: [],
    };
    expect(dashboardService.parseActivities(stats)).toEqual([]);
  });

  it('parses cita with negative offset as Ahora', () => {
    const stats = {
      totalLeads: 0, citasHoy: 0, ingresosMes: 0,
      campanasActivas: 0, totalCampanas: 0, campanasCompletadas: 0,
      ingresosDiarios: [],
      proximasCitas: [{
        id: 'c2', fechaHora: new Date(Date.now() - 60000).toISOString(),
        estado: 'pending',
        lead: { id: 'l2', name: 'Ana' },
        servicio: { id: 's2', nombre: 'Cons' },
      }],
    };
    const activities = dashboardService.parseActivities(stats);
    expect(activities[0].time).toBe('Ahora');
  });

  it('parses cita with 30 min offset as minutes', () => {
    const stats = {
      totalLeads: 0, citasHoy: 0, ingresosMes: 0,
      campanasActivas: 0, totalCampanas: 0, campanasCompletadas: 0,
      ingresosDiarios: [],
      proximasCitas: [{
        id: 'c5', fechaHora: new Date(Date.now() + 1800000).toISOString(),
        estado: 'pending',
      }],
    };
    const activities = dashboardService.parseActivities(stats);
    expect(activities[0].time).toMatch(/^En \d+ min$/);
  });

  it('parses cita with 3 days offset as days', () => {
    const stats = {
      totalLeads: 0, citasHoy: 0, ingresosMes: 0,
      campanasActivas: 0, totalCampanas: 0, campanasCompletadas: 0,
      ingresosDiarios: [],
      proximasCitas: [{
        id: 'c3', fechaHora: new Date(Date.now() + 4 * 86400000).toISOString(),
        estado: 'pending',
      }],
    };
    const activities = dashboardService.parseActivities(stats);
    expect(activities[0].time).toMatch(/^En \d+d$/);
  });

  it('handles cita without lead or servicio', () => {
    const stats = {
      totalLeads: 0, citasHoy: 0, ingresosMes: 0,
      campanasActivas: 0, totalCampanas: 0, campanasCompletadas: 0,
      ingresosDiarios: [],
      proximasCitas: [{
        id: 'c4', fechaHora: new Date(Date.now() + 7200000).toISOString(),
        estado: 'pending',
      }],
    };
    const activities = dashboardService.parseActivities(stats);
    expect(activities[0].text).toContain('Sin cliente');
    expect(activities[0].text).toContain('Sin servicio');
  });
});

// ─── Extra coverage: computeTrend edge cases ───────────────────────────

describe('dashboardService.computeTrend', () => {
  it('returns down trend when current < previous', () => {
    const result = dashboardService.computeTrend(50, 100);
    expect(result.direction).toBe('down');
  });

  it('returns flat when values equal', () => {
    const result = dashboardService.computeTrend(100, 100);
    expect(result.direction).toBe('flat');
  });

  it('handles previous = 0', () => {
    const result = dashboardService.computeTrend(50, 0);
    expect(result.direction).toBe('up');
    expect(result.change).toBe(100);
  });

  it('handles current = 0 and previous = 0', () => {
    const result = dashboardService.computeTrend(0, 0);
    expect(result.direction).toBe('flat');
  });

  it('handles current = 0 with previous = 0 (flat)', () => {
    const result = dashboardService.computeTrend(0, 0);
    expect(result.direction).toBe('flat');
    expect(result.change).toBe(0);
  });
});

describe('dashboardService.buildAnalyticsInsights', () => {
  it('builds 4 insights from stats', () => {
    const stats = {
      totalLeads: 100, citasHoy: 5, ingresosMes: 50000,
      campanasActivas: 2, totalCampanas: 4, campanasCompletadas: 1,
      proximasCitas: [], ingresosDiarios: [],
    };
    const insights = dashboardService.buildAnalyticsInsights(stats);
    expect(insights).toHaveLength(4);
    expect(insights[0].label).toBe('Leads Totales');
    expect(insights[2].label).toBe('Ingresos del Mes');
  });
});
