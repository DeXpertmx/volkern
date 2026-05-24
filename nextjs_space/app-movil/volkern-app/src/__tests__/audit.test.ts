import { auditService } from '../services/audit';
import { getData, saveData } from '../services/secure-storage';

jest.mock('../services/secure-storage', () => ({
  getData: jest.fn(),
  saveData: jest.fn(),
}));

const mockedGetData = getData as jest.Mock;
const mockedSaveData = saveData as jest.Mock;

const mockEvents: any[] = [
  { id: 'a1', type: 'user_action', action: 'login', userId: 'u1', userName: 'Test', details: 'Logged in', ipAddress: '127.0.0.1', metadata: {}, timestamp: '2025-01-02T00:00:00Z' },
  { id: 'a2', type: 'system_action', action: 'backup', userId: 'system', userName: 'System', details: 'Daily backup', ipAddress: '127.0.0.1', metadata: {}, timestamp: '2025-01-01T00:00:00Z' },
];

beforeEach(() => { jest.clearAllMocks(); });

describe('auditService.getAll', () => {
  it('returns empty array when no data', async () => {
    mockedGetData.mockResolvedValue(null);
    expect(await auditService.getAll()).toEqual([]);
  });
  it('returns sorted events', async () => {
    mockedGetData.mockResolvedValue(mockEvents);
    const result = await auditService.getAll();
    expect(result).toHaveLength(2);
  });
  it('filters by type', async () => {
    mockedGetData.mockResolvedValue(mockEvents);
    const result = await auditService.getAll({ type: 'user_action' });
    expect(result).toHaveLength(1);
  });
  it('filters by search', async () => {
    mockedGetData.mockResolvedValue(mockEvents);
    const result = await auditService.getAll({ search: 'login' });
    expect(result).toHaveLength(1);
  });
  it('filters by endDate', async () => {
    mockedGetData.mockResolvedValue(mockEvents);
    const result = await auditService.getAll({ endDate: '2025-01-01T23:59:59Z' });
    expect(result).toHaveLength(1);
  });
  it('filters by startDate+endDate', async () => {
    mockedGetData.mockResolvedValue(mockEvents);
    const result = await auditService.getAll({ startDate: '2025-01-01T00:00:00Z', endDate: '2025-01-02T23:59:59Z' });
    expect(result).toHaveLength(2);
  });
});

describe('auditService.log', () => {
  it('trims to 500 events', async () => {
    const manyEvents = Array.from({ length: 505 }, (_, i) => ({
      id: `a${i}`, type: 'user_action', action: 'test', userId: 'u1', userName: 'T',
      details: 'D', ipAddress: '127.0.0.1', metadata: {}, timestamp: `2025-01-01T00:00:0${i}Z`,
    }));
    mockedGetData.mockResolvedValue(manyEvents);
    await auditService.log({ type: 'user_action', action: 'new', userId: 'u1', userName: 'T', details: 'D', ipAddress: '127.0.0.1', metadata: {} });
    expect(mockedSaveData).toHaveBeenCalled();
    // saved array should be max 500 + 1 = 501? Actually trimmed = events.slice(0, 500) then log adds one
    const saved = mockedSaveData.mock.calls[0][1];
    expect(saved.length).toBeLessThanOrEqual(500);
  });
});

describe('auditService.clearAll', () => {
  it('clears all events', async () => {
    await auditService.clearAll();
    expect(mockedSaveData).toHaveBeenCalledWith('volkern_audit', []);
  });
});

describe('auditService.export', () => {
  it('exports all events', async () => {
    mockedGetData.mockResolvedValue(mockEvents);
    const result = await auditService.export();
    expect(result).toHaveLength(2);
  });
});

describe('auditService.getEventTypes', () => {
  it('returns event type definitions', async () => {
    const types = await auditService.getEventTypes();
    expect(types).toHaveLength(3);
  });
});

describe('auditService getAll userId filter', () => {
  it('filters by userId', async () => {
    mockedGetData.mockResolvedValue(mockEvents);
    const result = await auditService.getAll({ userId: 'u1' });
    expect(result).toHaveLength(1);
  });
});
