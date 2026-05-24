import { inventoryService } from '../services/inventory';
import { getData, saveData } from '../services/secure-storage';

jest.mock('../services/secure-storage', () => ({
  getData: jest.fn(),
  saveData: jest.fn(),
}));

const mockedGetData = getData as jest.MockedFunction<typeof getData>;
const mockedSaveData = saveData as jest.MockedFunction<typeof saveData>;

const mockItems: any[] = [
  { id: 'test-1', sku: 'SKU1', name: 'Item 1', category: 'raw_materials', quantity: 10, unitPrice: 100, minStock: 5, createdAt: '2025-01-01', updatedAt: '2025-01-01', location: 'A1', description: 'Desc' },
  { id: 'test-2', sku: 'SKU2', name: 'Item 2', category: 'finished_goods', quantity: 2, unitPrice: 200, minStock: 5, createdAt: '2025-01-02', updatedAt: '2025-01-02', location: 'A2', description: 'Desc' },
];

beforeEach(() => { jest.clearAllMocks(); });

describe('inventoryService.getAll', () => {
  it('returns empty array when no data', async () => {
    mockedGetData.mockResolvedValue(null);
    expect(await inventoryService.getAll()).toEqual([]);
  });
  it('returns stored items', async () => {
    mockedGetData.mockResolvedValue([...mockItems]);
    expect(await inventoryService.getAll()).toHaveLength(2);
  });
});

describe('inventoryService.getById', () => {
  it('returns item by id', async () => {
    mockedGetData.mockResolvedValue([...mockItems]);
    const result = await inventoryService.getById('test-1');
    expect(result).not.toBeNull();
    if (result) expect(result.id).toBe('test-1');
  });
  it('returns null for non-existent id', async () => {
    mockedGetData.mockResolvedValue([...mockItems]);
    expect(await inventoryService.getById('bad-id')).toBeNull();
  });
});

describe('inventoryService.create', () => {
  it('creates and persists item', async () => {
    mockedGetData.mockResolvedValue([]);
    const result = await inventoryService.create({ name: 'New' } as any);
    expect(result.id).toBeDefined();
    expect(mockedSaveData).toHaveBeenCalled();
  });
});

describe('inventoryService.update', () => {
  it('updates item fields', async () => {
    mockedGetData.mockResolvedValue([...mockItems]);
    await inventoryService.update('test-1', { name: 'Updated' } as any);
    expect(mockedSaveData).toHaveBeenCalled();
  });
});

describe('inventoryService.delete', () => {
  it('removes item', async () => {
    mockedGetData.mockResolvedValue([...mockItems]);
    await inventoryService.delete('test-1');
    expect(mockedSaveData).toHaveBeenCalled();
  });
});

describe('inventoryService.getStats', () => {
  it('returns stats with totals', async () => {
    mockedGetData.mockResolvedValue([...mockItems]);
    const stats = await inventoryService.getStats();
    expect(stats.totalItems).toBe(2);
    expect(stats.lowStock).toBe(1); // Item 2 has qty 2 < minStock 5
    expect(stats.totalValue).toBe(10 * 100 + 2 * 200);
  });
});

describe('inventoryService.getMovements', () => {
  it('returns empty when no movements', async () => {
    mockedGetData.mockResolvedValue(null);
    const movements = await inventoryService.getMovements('test-1');
    expect(movements).toEqual([]);
  });

  it('filters by itemId', async () => {
    const movements = [
      { id: 'm1', itemId: 'test-1', type: 'in', quantity: 10, reason: 'Restock', reference: '', createdAt: new Date().toISOString() },
      { id: 'm2', itemId: 'test-2', type: 'out', quantity: 5, reason: 'Sale', reference: '', createdAt: new Date().toISOString() },
    ];
    mockedGetData.mockResolvedValue(movements);
    const result = await inventoryService.getMovements('test-1');
    expect(result).toHaveLength(1);
  });
});

describe('inventoryService.recordMovement', () => {
  it('records in movement and updates quantity', async () => {
    mockedGetData.mockResolvedValue([...mockItems]);
    await inventoryService.recordMovement({
      itemId: 'test-1', type: 'in', quantity: 5,
      reason: 'Restock', reference: '',
    });
    expect(mockedSaveData).toHaveBeenCalled();
  });

  it('records out movement with quantity floor at 0', async () => {
    mockedGetData.mockResolvedValue([...mockItems]);
    await inventoryService.recordMovement({
      itemId: 'test-2', type: 'out', quantity: 100,
      reason: 'Write-off', reference: '',
    });
    expect(mockedSaveData).toHaveBeenCalled();
  });

  it('records adjustment movement', async () => {
    mockedGetData.mockResolvedValue([...mockItems]);
    await inventoryService.recordMovement({
      itemId: 'test-1', type: 'adjustment', quantity: 15,
      reason: 'Correct count', reference: '',
    });
    expect(mockedSaveData).toHaveBeenCalled();
  });

  it('handles item not found in recordMovement', async () => {
    mockedGetData.mockResolvedValue([...mockItems]);
    await inventoryService.recordMovement({
      itemId: 'nonexistent', type: 'in', quantity: 10,
      reason: 'Test', reference: '',
    });
    expect(mockedSaveData).toHaveBeenCalled();
  });
});

describe('inventoryService.update', () => {
  it('throws on not found', async () => {
    mockedGetData.mockResolvedValue([...mockItems]);
    await expect(inventoryService.update('bad-id', { name: 'X' } as any)).rejects.toThrow('Item not found');
  });
});

describe('inventoryService.delete', () => {
  it('no-op for non-existent id', async () => {
    mockedGetData.mockResolvedValue([...mockItems]);
    await inventoryService.delete('bad-id');
    expect(mockedSaveData).not.toHaveBeenCalled();
  });
});