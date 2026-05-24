import { contactsService } from '../services/contacts';

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

describe('contactsService.getAll', () => {
  it('returns empty array when no data', async () => {
    mockedGetItem.mockResolvedValue(null);
    expect(await contactsService.getAll()).toEqual([]);
  });
  it('returns stored items', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify(mockItems));
    expect(await contactsService.getAll()).toHaveLength(2);
  });
});

describe('contactsService.getById', () => {
  it('returns item by id', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify(mockItems));
    const result = await contactsService.getById('test-1');
    expect(result).not.toBeNull();
    if (result) expect(result.id).toBe('test-1');
  });
  it('returns null for non-existent id', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify(mockItems));
    expect(await contactsService.getById('bad-id')).toBeNull();
  });
});

describe('contactsService.create', () => {
  it('creates and persists item', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify([]));
    const result = await contactsService.create({ name: 'New' } as any);
    expect(result.id).toBeDefined();
    expect(mockedSetItem).toHaveBeenCalled();
  });
});

describe('contactsService.update', () => {
  it('updates item fields', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify(mockItems));
    await contactsService.update('test-1', { name: 'Updated' } as any);
    expect(mockedSetItem).toHaveBeenCalled();
  });
  it('returns null if not found', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify(mockItems));
    const result = await contactsService.update('bad-id', {} as any);
    expect(result).toBeNull();
  });
});

describe('contactsService.delete', () => {
  it('removes item', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify(mockItems));
    await contactsService.delete('test-1');
    expect(mockedSetItem).toHaveBeenCalled();
  });
  it('no-op if not found', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify(mockItems));
    await contactsService.delete('bad-id');
  });
});

describe('contactsService.getStats', () => {
  it('returns stats object', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify(mockItems));
    const stats = await contactsService.getStats();
    expect(stats).toHaveProperty('total');
  });
});


describe('contactsService.search', () => {
  it('returns matching items', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify(mockItems));
    const result = await contactsService.search('Item');
    expect(result).toBeDefined();
  });

  it('search por tags', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify([
      { id: 'c1', name: 'Contacto', email: 'c@c.com', company: 'C', phone: '+521', tags: ['vip', 'cliente'], createdAt: 1, updatedAt: 1 },
      { id: 'c2', name: 'Otro', email: 'o@o.com', company: 'O', phone: '+522', tags: ['prospecto'], createdAt: 2, updatedAt: 2 },
    ]));
    const result = await contactsService.search('vip');
    expect(result).toHaveLength(1);
  });
});

describe('contactsService.getInteractions', () => {
  it('returns empty when no data', async () => {
    mockedGetItem.mockResolvedValue(null);
    const result = await contactsService.getInteractions('c1');
    expect(result).toEqual([]);
  });

  it('filters and sorts by contactId', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify([
      { id: 'i1', contactId: 'c1', type: 'email', notes: 'Email sent', timestamp: 200 },
      { id: 'i2', contactId: 'c2', type: 'call', notes: 'Called', timestamp: 100 },
      { id: 'i3', contactId: 'c1', type: 'meeting', notes: 'Met', timestamp: 300 },
    ]));
    const result = await contactsService.getInteractions('c1');
    expect(result).toHaveLength(2);
    expect(result[0].timestamp).toBeGreaterThanOrEqual(result[1].timestamp);
  });
});

describe('contactsService.addInteraction', () => {
  it('creates interaction and persists', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify([]));
    const result = await contactsService.addInteraction('c1', 'email', 'Follow-up');
    expect(result.id).toBeDefined();
    expect(result.contactId).toBe('c1');
    expect(mockedSetItem).toHaveBeenCalled();
  });
});

describe('contactsService.deleteInteraction', () => {
  it('deletes interaction by id', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify([{ id: 'i1', contactId: 'c1', type: 'email', notes: 'N', timestamp: 1 }]));
    await contactsService.deleteInteraction('i1');
    expect(mockedSetItem).toHaveBeenCalled();
  });
});

describe('contactsService persist error handling', () => {
  it('handles SecureStore failure on persist', async () => {
    mockedSetItem.mockRejectedValue(new Error('Storage error'));
    mockedGetItem.mockResolvedValue(JSON.stringify([]));
    await contactsService.create({ name: 'Test' } as any);
    // Should not throw
  });

  it('handles SecureStore failure on persistInteractions', async () => {
    mockedSetItem.mockRejectedValue(new Error('Storage error'));
    mockedGetItem.mockResolvedValue(JSON.stringify([]));
    await contactsService.addInteraction('c1', 'email', 'Note');
    // Should not throw
  });
});
