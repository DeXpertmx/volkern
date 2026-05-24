import { leadsService, getStatusColor, getStatusLabel, getStatusIcon } from '../services/leads';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
}));

const mockedGetItem = require('expo-secure-store').getItemAsync as jest.Mock;
const mockedSetItem = require('expo-secure-store').setItemAsync as jest.Mock;

const mockItems: any[] = [
  { id: 'test-1', name: 'Item 1', createdAt: 1700000000000, updatedAt: 1700000000000 },
  { id: 'test-2', name: 'Item 2', createdAt: 1700000000001, updatedAt: 1700000000001 },
];

beforeEach(() => { jest.clearAllMocks(); });

describe('leadsService.getAll', () => {
  it('returns empty array when no data', async () => {
    mockedGetItem.mockResolvedValue(null);
    expect(await leadsService.getAll()).toEqual([]);
  });
  it('returns stored items', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify(mockItems));
    expect(await leadsService.getAll()).toHaveLength(2);
  });
});

describe('leadsService.getById', () => {
  it('returns item by id', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify(mockItems));
    const result = await leadsService.getById('test-1');
    expect(result).not.toBeNull();
    if (result) expect(result.id).toBe('test-1');
  });
  it('returns undefined for non-existent id', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify(mockItems));
    expect(await leadsService.getById('bad-id')).toBeUndefined();
  });
});

describe('leadsService.create', () => {
  it('creates and persists item', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify([]));
    const result = await leadsService.create({ name: 'New' } as any);
    expect(result.id).toBeDefined();
    expect(mockedSetItem).toHaveBeenCalled();
  });
});

describe('leadsService.update', () => {
  it('updates item fields', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify(mockItems));
    await leadsService.update('test-1', { name: 'Updated' } as any);
    expect(mockedSetItem).toHaveBeenCalled();
  });
  it('returns null if not found', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify(mockItems));
    const result = await leadsService.update('bad-id', {} as any);
    expect(result).toBeNull();
  });
});

describe('leadsService.delete', () => {
  it('removes item', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify(mockItems));
    await leadsService.delete('test-1');
    expect(mockedSetItem).toHaveBeenCalled();
  });
  it('no-op if not found', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify(mockItems));
    await leadsService.delete('bad-id');
  });
});

describe('leadsService.getStats', () => {
  it('returns stats object', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify(mockItems));
    const stats = await leadsService.getStats();
    expect(stats).toHaveProperty('total');
  });
});


describe('leadsService.search', () => {
  it('returns matching items', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify(mockItems));
    const result = await leadsService.search('Item');
    expect(result).toBeDefined();
  });

  it('búsqueda por tags', async () => {
    const itemsWithTags = mockItems.map(i => ({ ...i, tags: ['vip'], phone: '521', email: 'a@b.com', company: 'C', source: 'web', status: 'new' }));
    mockedGetItem.mockResolvedValue(JSON.stringify(itemsWithTags));
    const result = await leadsService.search('vip');
    expect(result.length).toBeGreaterThanOrEqual(1);
  });

  it('búsqueda por email', async () => {
    const items = [{ id: 'l1', name: 'N', email: 'test@example.com', phone: '', company: '', tags: [], status: 'new', source: 'web', createdAt: 1, updatedAt: 1 }];
    mockedGetItem.mockResolvedValue(JSON.stringify(items));
    const result = await leadsService.search('test@example.com');
    expect(result).toHaveLength(1);
  });

  it('búsqueda por phone', async () => {
    const items = [{ id: 'l1', name: 'N', email: '', phone: '+521234567890', company: '', tags: [], status: 'new', source: 'web', createdAt: 1, updatedAt: 1 }];
    mockedGetItem.mockResolvedValue(JSON.stringify(items));
    const result = await leadsService.search('123456');
    expect(result).toHaveLength(1);
  });

  it('búsqueda por company', async () => {
    const items = [{ id: 'l1', name: 'N', email: '', phone: '', company: 'Acme Corp', tags: [], status: 'new', source: 'web', createdAt: 1, updatedAt: 1 }];
    mockedGetItem.mockResolvedValue(JSON.stringify(items));
    const result = await leadsService.search('Acme');
    expect(result).toHaveLength(1);
  });
});

describe('leadsService.getByStatus', () => {
  it('filtra por status', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify(mockItems.map(i => ({ ...i, status: 'new', phone: '521', email: 'a@b.com', company: 'C', source: 'web' }))));
    const result = await leadsService.getByStatus('new');
    expect(result.length).toBeGreaterThanOrEqual(1);
  });
});

describe('leadsService.updateStatus', () => {
  it('actualiza status', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify([{ id: 'l1', name: 'L', status: 'new', phone: '521', email: 'a@b.com', company: 'C', source: 'web', tags: [], createdAt: 1, updatedAt: 1 }]));
    const result = await leadsService.updateStatus('l1', 'contacted');
    expect(result).not.toBeNull();
    expect(mockedSetItem).toHaveBeenCalled();
  });
});

describe('leadsService.clearAll', () => {
  it('limpia todos los leads', async () => {
    await leadsService.clearAll();
    expect(mockedSetItem).toHaveBeenCalled();
  });
});

describe('lead helper functions', () => {
  it('getStatusColor returns color for known status', () => {
    expect(getStatusColor('new')).toBe('#3B82F6');
  });
  it('getStatusColor returns default for unknown status', () => {
    expect(getStatusColor('invalid' as any)).toBe('#94A3B8');
  });
  it('getStatusLabel returns label', () => {
    expect(getStatusLabel('new')).toBe('Nuevo');
  });
  it('getStatusLabel returns default for unknown', () => {
    expect(getStatusLabel('invalid' as any)).toBe('invalid');
  });
  it('getStatusIcon returns icon', () => {
    expect(getStatusIcon('new')).toBe('sparkles');
  });
  it('getStatusIcon returns default for unknown', () => {
    expect(getStatusIcon('invalid' as any)).toBe('ellipse');
  });
});

describe('leadsService persist error', () => {
  it('handles SecureStore failure gracefully', async () => {
    mockedSetItem.mockRejectedValue(new Error('Storage error'));
    mockedGetItem.mockResolvedValue(JSON.stringify([]));
    await leadsService.create({ name: 'Test' } as any);
    // Should not throw despite SecureStore error
  });
});
