import { expenseService } from '../services/expenses';
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

describe('expenseService.getAll', () => {
  it('returns empty array when no data', async () => {
    mockedGetData.mockResolvedValue(null);
    expect(await expenseService.getAll()).toEqual([]);
  });
  it('returns stored items', async () => {
    mockedGetData.mockResolvedValue([...mockItems]);
    expect(await expenseService.getAll()).toHaveLength(2);
  });
});

describe('expenseService.getById', () => {
  it('returns item by id', async () => {
    mockedGetData.mockResolvedValue([...mockItems]);
    const result = await expenseService.getById('test-1');
    expect(result).not.toBeNull();
    if (result) expect(result.id).toBe('test-1');
  });
  it('returns null for non-existent id', async () => {
    mockedGetData.mockResolvedValue([...mockItems]);
    expect(await expenseService.getById('bad-id')).toBeNull();
  });
});

describe('expenseService.create', () => {
  it('creates and persists item', async () => {
    mockedGetData.mockResolvedValue([]);
    const result = await expenseService.create({ name: 'New' } as any);
    expect(result.id).toBeDefined();
    expect(mockedSaveData).toHaveBeenCalled();
  });
});

describe('expenseService.update', () => {
  it('updates item fields', async () => {
    mockedGetData.mockResolvedValue([...mockItems]);
    await expenseService.update('test-1', { name: 'Updated' } as any);
    expect(mockedSaveData).toHaveBeenCalled();
  });
});

describe('expenseService.delete', () => {
  it('removes item', async () => {
    mockedGetData.mockResolvedValue([...mockItems]);
    await expenseService.delete('test-1');
    expect(mockedSaveData).toHaveBeenCalled();
  });
});

describe('expenseService.getStats', () => {
  it('returns zero stats for empty data', async () => {
    mockedGetData.mockResolvedValue([]);
    const stats = await expenseService.getStats();
    expect(stats.totalExpenses).toBe(0);
    expect(stats.totalIncome).toBe(0);
    expect(stats.balance).toBe(0);
  });

  it('computes stats from mixed data', async () => {
    const now = new Date();
    const month = now.toISOString().slice(0, 7);
    const items = [
      { id: 'e1', type: 'expense', description: 'Office', amount: 100, category: 'office', date: now.toISOString(), notes: '', isRecurring: false, recurringInterval: null, createdAt: '', updatedAt: '' },
      { id: 'e2', type: 'income', description: 'Sale', amount: 500, category: 'other', date: now.toISOString(), notes: '', isRecurring: false, recurringInterval: null, createdAt: '', updatedAt: '' },
      { id: 'e3', type: 'expense', description: 'Travel', amount: 50, category: 'travel', date: now.toISOString(), notes: '', isRecurring: false, recurringInterval: null, createdAt: '', updatedAt: '' },
    ];
    mockedGetData.mockResolvedValue(items);
    const stats = await expenseService.getStats();
    expect(stats.totalExpenses).toBe(150);
    expect(stats.totalIncome).toBe(500);
    expect(stats.balance).toBe(350);
    expect(stats.monthlyExpenses).toBe(150);
    expect(stats.monthlyIncome).toBe(500);
    expect(stats.categoryTotals.office).toBe(100);
    expect(stats.categoryTotals.travel).toBe(50);
  });
});

describe('expenseService.update', () => {
  it('throws on not found', async () => {
    mockedGetData.mockResolvedValue([]);
    await expect(expenseService.update('bad-id', { description: 'X' } as any)).rejects.toThrow('Expense not found');
  });
});