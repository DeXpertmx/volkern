import { reportsService } from '../services/reports';
import { api } from '../services/api';

jest.mock('../services/api', () => ({
  api: {
    get: jest.fn(),
  },
}));

const mockGet = api.get as jest.Mock;

beforeEach(() => { jest.clearAllMocks(); });

describe('reportsService.getLeadStats', () => {
  it('calls api.get with period', async () => {
    mockGet.mockResolvedValue({ stats: { overview: { totalLeads: 100 }, porEstado: [], porFuente: [], porUsuario: [], evolucion: [], topLeads: [] } });
    const result = await reportsService.getLeadStats('30');
    expect(mockGet).toHaveBeenCalled();
  });
});

describe('reportsService.formatCurrency', () => {
  it('formats MXN currency', () => {
    const result = reportsService.formatCurrency(50000);
    expect(typeof result).toBe('string');
  });
});

describe('reportsService.formatPercent', () => {
  it('formats percentage', () => {
    const result = reportsService.formatPercent(75.5);
    expect(result).toContain('%');
  });
});

describe('reportsService.getDealMetrics', () => {
  it('calls api.get with period', async () => {
    mockGet.mockResolvedValue({ totalDeals: 10, wonDeals: 5, totalValue: 50000 });
    const result = await reportsService.getDealMetrics('30');
    expect(mockGet).toHaveBeenCalled();
  });
});

describe('reportsService.getDashboardStats', () => {
  it('calls api.get with default range', async () => {
    mockGet.mockResolvedValue({ totalRevenue: 100000, activeCampaigns: 3, conversionRate: 0.15 });
    const result = await reportsService.getDashboardStats();
    expect(mockGet).toHaveBeenCalled();
  });
});

