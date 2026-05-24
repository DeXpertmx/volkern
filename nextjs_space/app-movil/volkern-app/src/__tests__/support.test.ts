import { supportService } from '../services/support';
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

describe('supportService.getAll', () => {
  it('returns empty array when no data', async () => {
    mockedGetData.mockResolvedValue(null);
    expect(await supportService.getAll()).toEqual([]);
  });
  it('returns stored items', async () => {
    mockedGetData.mockResolvedValue([...mockItems]);
    expect(await supportService.getAll()).toHaveLength(2);
  });
});

describe('supportService.getById', () => {
  it('returns item by id', async () => {
    mockedGetData.mockResolvedValue([...mockItems]);
    const result = await supportService.getById('test-1');
    expect(result).not.toBeNull();
    if (result) expect(result.id).toBe('test-1');
  });
  it('returns null for non-existent id', async () => {
    mockedGetData.mockResolvedValue([...mockItems]);
    expect(await supportService.getById('bad-id')).toBeNull();
  });
});

describe('supportService.create', () => {
  it('creates and persists item', async () => {
    mockedGetData.mockResolvedValue([]);
    const result = await supportService.create({ name: 'New' } as any);
    expect(result.id).toBeDefined();
    expect(mockedSaveData).toHaveBeenCalled();
  });
});

describe('supportService.update', () => {
  it('updates item fields', async () => {
    mockedGetData.mockResolvedValue([...mockItems]);
    await supportService.update('test-1', { name: 'Updated' } as any);
    expect(mockedSaveData).toHaveBeenCalled();
  });
  it('sets resolvedAt when status is resolved', async () => {
    mockedGetData.mockResolvedValue([{ id: 't1', subject: 'Ticket', requester: 'U', requesterEmail: 'u@c.com', createdAt: '2025-01-01', updatedAt: '2025-01-01', status: 'open' }]);
    await supportService.update('t1', { status: 'resolved' } as any);
    expect(mockedSaveData).toHaveBeenCalled();
  });
  it('throws when ticket not found', async () => {
    mockedGetData.mockResolvedValue([]);
    await expect(supportService.update('bad-id', { subject: 'X' } as any)).rejects.toThrow('Ticket not found');
  });
});

describe('supportService.delete', () => {
  it('removes item', async () => {
    mockedGetData.mockResolvedValue([...mockItems]);
    await supportService.delete('test-1');
    expect(mockedSaveData).toHaveBeenCalled();
  });
});

describe('supportService.getStats', () => {
  it('returns stats object', async () => {
    mockedGetData.mockResolvedValue([]);
    const stats = await supportService.getStats();
    expect(stats).toHaveProperty('total');
  });

  it('counts open and critical items correctly', async () => {
    mockedGetData.mockResolvedValue([
      { id: 't1', subject: 'Ticket 1', requester: 'U1', requesterEmail: 'u1@c.com', status: 'open', priority: 'critical', createdAt: '2025-01-01', updatedAt: '2025-01-01' },
      { id: 't2', subject: 'Ticket 2', requester: 'U2', requesterEmail: 'u2@c.com', status: 'in_progress', priority: 'high', createdAt: '2025-01-01', updatedAt: '2025-01-01' },
      { id: 't3', subject: 'Ticket 3', requester: 'U3', requesterEmail: 'u3@c.com', status: 'resolved', priority: 'critical', createdAt: '2025-01-01', updatedAt: '2025-01-01' },
    ]);
    const stats = await supportService.getStats();
    expect(stats.open).toBe(2);
    expect(stats.critical).toBe(1);
  });
});
