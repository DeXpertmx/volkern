import { automationService } from '../services/automation';
import { getData, saveData } from '../services/secure-storage';

jest.mock('../services/secure-storage', () => ({
  getData: jest.fn(),
  saveData: jest.fn(),
}));

const mockedGetData = getData as jest.MockedFunction<typeof getData>;
const mockedSaveData = saveData as jest.MockedFunction<typeof saveData>;

const mockItems: any[] = [
  { id: 'test-1', name: 'Item 1', createdAt: '2025-01-01', updatedAt: '2025-01-01' },
  { id: 'test-2', name: 'Item 2', createdAt: '2025-01-02', updatedAt: '2025-01-02' },
];

beforeEach(() => { jest.clearAllMocks(); });

describe('automationService.getAll', () => {
  it('returns empty array when no data', async () => {
    mockedGetData.mockResolvedValue(null);
    expect(await automationService.getAll()).toEqual([]);
  });
  it('returns stored items', async () => {
    mockedGetData.mockResolvedValue([...mockItems]);
    expect(await automationService.getAll()).toHaveLength(2);
  });
});

describe('automationService.getById', () => {
  it('returns item by id', async () => {
    mockedGetData.mockResolvedValue([...mockItems]);
    const result = await automationService.getById('test-1');
    expect(result).not.toBeNull();
    if (result) expect(result.id).toBe('test-1');
  });
  it('returns null for non-existent id', async () => {
    mockedGetData.mockResolvedValue([...mockItems]);
    expect(await automationService.getById('bad-id')).toBeNull();
  });
});

describe('automationService.create', () => {
  it('creates and persists item', async () => {
    mockedGetData.mockResolvedValue([]);
    const result = await automationService.create({ name: 'New' } as any);
    expect(result.id).toBeDefined();
    expect(mockedSaveData).toHaveBeenCalled();
  });
});

describe('automationService.update', () => {
  it('updates item fields', async () => {
    mockedGetData.mockResolvedValue([...mockItems]);
    await automationService.update('test-1', { name: 'Updated' } as any);
    expect(mockedSaveData).toHaveBeenCalled();
  });
});

describe('automationService.delete', () => {
  it('removes item', async () => {
    mockedGetData.mockResolvedValue([...mockItems]);
    await automationService.delete('test-1');
    expect(mockedSaveData).toHaveBeenCalled();
  });
});

describe('automationService.getStats', () => {
  it('returns stats object', async () => {
    mockedGetData.mockResolvedValue([]);
    const stats = await automationService.getStats();
    expect(stats).toHaveProperty('total');
  });
});

describe('automationService.toggleEnabled', () => {
  it('toggles enabled field', async () => {
    mockedGetData.mockResolvedValue([{ id: 'test-1', name: 'Item', enabled: false, createdAt: '1', updatedAt: '1' }]);
    await automationService.toggleEnabled('test-1');
    expect(mockedSaveData).toHaveBeenCalled();
  });
  it('throws on not found', async () => {
    mockedGetData.mockResolvedValue([{ id: 'test-1', enabled: false, createdAt: '1', updatedAt: '1' }]);
    await expect(automationService.toggleEnabled('bad-id')).rejects.toThrow('Automation not found');
  });
});

describe('automationService.getStats', () => {
  it('computes enabled/disabled counts', async () => {
    mockedGetData.mockResolvedValue([
      { id: 'a1', name: 'A1', enabled: true, runCount: 5, createdAt: '1', updatedAt: '1' },
      { id: 'a2', name: 'A2', enabled: false, runCount: 3, createdAt: '2', updatedAt: '2' },
      { id: 'a3', name: 'A3', enabled: true, runCount: 2, createdAt: '3', updatedAt: '3' },
    ]);
    const stats = await automationService.getStats();
    expect(stats.total).toBe(3);
    expect(stats.enabled).toBe(2);
    expect(stats.disabled).toBe(1);
    expect(stats.totalRuns).toBe(10);
  });
});
