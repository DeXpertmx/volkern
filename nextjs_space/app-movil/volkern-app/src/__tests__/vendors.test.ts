import { vendorsService } from '../services/vendors';
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

describe('vendorsService.getAll', () => {
  it('returns empty array when no data', async () => {
    mockedGetData.mockResolvedValue(null);
    expect(await vendorsService.getAll()).toEqual([]);
  });
  it('returns stored items', async () => {
    mockedGetData.mockResolvedValue([...mockItems]);
    expect(await vendorsService.getAll()).toHaveLength(2);
  });
});

describe('vendorsService.getById', () => {
  it('returns item by id', async () => {
    mockedGetData.mockResolvedValue([...mockItems]);
    const result = await vendorsService.getById('test-1');
    expect(result).not.toBeNull();
    if (result) expect(result.id).toBe('test-1');
  });
  it('returns null for non-existent id', async () => {
    mockedGetData.mockResolvedValue([...mockItems]);
    expect(await vendorsService.getById('bad-id')).toBeNull();
  });
});

describe('vendorsService.create', () => {
  it('creates and persists item', async () => {
    mockedGetData.mockResolvedValue([]);
    const result = await vendorsService.create({ name: 'New' } as any);
    expect(result.id).toBeDefined();
    expect(mockedSaveData).toHaveBeenCalled();
  });
});

describe('vendorsService.update', () => {
  it('updates item fields', async () => {
    mockedGetData.mockResolvedValue([...mockItems]);
    await vendorsService.update('test-1', { name: 'Updated' } as any);
    expect(mockedSaveData).toHaveBeenCalled();
  });

  it('throws when updating non-existent vendor', async () => {
    mockedGetData.mockResolvedValue([...mockItems]);
    await expect(vendorsService.update('bad-id', { name: 'X' } as any)).rejects.toThrow('Vendor not found');
  });
});

describe('vendorsService.delete', () => {
  it('removes item', async () => {
    mockedGetData.mockResolvedValue([...mockItems]);
    await vendorsService.delete('test-1');
    expect(mockedSaveData).toHaveBeenCalled();
  });

  it('does nothing when deleting non-existent', async () => {
    mockedGetData.mockResolvedValue([...mockItems]);
    mockedSaveData.mockClear();
    await vendorsService.delete('bad-id');
    expect(mockedSaveData).not.toHaveBeenCalled();
  });
});

describe('vendorsService.getStats', () => {
  it('returns stats object', async () => {
    mockedGetData.mockResolvedValue([]);
    const stats = await vendorsService.getStats();
    expect(stats).toHaveProperty('total');
    expect(stats.active).toBe(0);
    expect(stats.avgRating).toBe(0);
  });

  it('getStats computes avgRating for active vendors', async () => {
    mockedGetData.mockResolvedValue([
      { id: 'v1', status: 'active', rating: 4 } as any,
      { id: 'v2', status: 'active', rating: 5 } as any,
      { id: 'v3', status: 'inactive', rating: 3 } as any,
    ]);
    const stats = await vendorsService.getStats();
    expect(stats.total).toBe(3);
    expect(stats.active).toBe(2);
    expect(stats.avgRating).toBe(4.5);
  });
});



