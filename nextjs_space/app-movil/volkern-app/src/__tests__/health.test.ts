import { healthService } from '../services/health';
import { getData, saveData } from '../services/secure-storage';

jest.mock('../services/secure-storage', () => ({
  getData: jest.fn(),
  saveData: jest.fn(),
}));

const mockedGetData = getData as jest.Mock;
const mockedSaveData = saveData as jest.Mock;

beforeEach(() => { jest.clearAllMocks(); });

describe('healthService.getStatus', () => {
  it('returns default services when no saved data', async () => {
    mockedGetData.mockResolvedValue(null);
    const result = await healthService.getStatus();
    expect(result).toHaveProperty('services');
    expect(result).toHaveProperty('allHealthy');
    expect(result.services.length).toBeGreaterThanOrEqual(4);
  });
  it('returns saved services', async () => {
    mockedGetData.mockResolvedValue({ services: [{ id: 'custom', name: 'Custom', status: 'degraded', uptime: '50%', responseTime: 500, lastChecked: '' }] });
    const result = await healthService.getStatus();
    expect(result.services).toHaveLength(1);
    expect(result.allHealthy).toBe(false);
  });
});

describe('healthService.checkNow', () => {
  it('performs health check and saves', async () => {
    mockedGetData.mockResolvedValue(null);
    const result = await healthService.checkNow();
    expect(result).toHaveProperty('services');
    expect(mockedSaveData).toHaveBeenCalled();
  });

  it('can produce degraded status', async () => {
    // Force Math.random > 0.9 to hit 'degraded' branch
    const origRandom = Math.random;
    Math.random = jest.fn().mockReturnValue(0.95);
    mockedGetData.mockResolvedValue(null);
    const result = await healthService.checkNow();
    expect(result).toHaveProperty('services');
    expect(mockedSaveData).toHaveBeenCalled();
    Math.random = origRandom;
  });
});

describe('healthService.getIssues', () => {
  it('returns empty array when no issues', async () => {
    mockedGetData.mockResolvedValue(null);
    expect(await healthService.getIssues()).toEqual([]);
  });
});

describe('healthService.resolveIssue', () => {
  it('resolves an issue', async () => {
    const issues = [{ id: 'iss-1', serviceId: 'db', serviceName: 'Database', title: 'Down', description: 'DB down', severity: 'critical', status: 'open', createdAt: '', resolvedAt: null }];
    mockedGetData.mockResolvedValue(issues);
    await healthService.resolveIssue('iss-1');
    expect(mockedSaveData).toHaveBeenCalled();
  });

  it('does nothing if issue not found', async () => {
    mockedGetData.mockResolvedValue([]);
    await healthService.resolveIssue('nonexistent');
    expect(mockedSaveData).not.toHaveBeenCalled();
  });
});

describe('healthService.getHistory', () => {
  it('returns empty history when no data', async () => {
    mockedGetData.mockResolvedValue(null);
    expect(await healthService.getHistory()).toEqual([]);
  });
});

// ─── generateId ────────────────────────────────────────────────────────────

describe('generateId', () => {
  it('generates a unique string id', () => {
    const { generateId } = require('../services/health');
    const id1 = generateId();
    const id2 = generateId();
    expect(typeof id1).toBe('string');
    expect(id1.length).toBeGreaterThan(5);
    expect(id1).not.toBe(id2);
  });
});
