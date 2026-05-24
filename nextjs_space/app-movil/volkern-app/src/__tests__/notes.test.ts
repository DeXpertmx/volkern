import { notesService } from '../services/notes';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
}));

const mockedGetItem = require('expo-secure-store').getItemAsync as jest.Mock;
const mockedSetItem = require('expo-secure-store').setItemAsync as jest.Mock;

const mockItems: any[] = [
  { id: 'test-1', title: 'Meeting Notes', content: 'Discussed project timeline', tags: ['project'], category: 'meeting', pinned: false, createdAt: 1700000000000, updatedAt: 1700000000000 },
  { id: 'test-2', title: 'Idea List', content: 'New feature ideas', tags: ['idea'], category: 'idea', pinned: true, createdAt: 1700000000001, updatedAt: 1700000000001 },
];

beforeEach(() => { jest.clearAllMocks(); });

describe('notesService.getAll', () => {
  it('returns empty array when no data', async () => {
    mockedGetItem.mockResolvedValue(null);
    expect(await notesService.getAll()).toEqual([]);
  });
  it('returns stored items', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify(mockItems));
    expect(await notesService.getAll()).toHaveLength(2);
  });
});

describe('notesService.getById', () => {
  it('returns item by id', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify(mockItems));
    const result = await notesService.getById('test-1');
    expect(result).not.toBeNull();
    if (result) expect(result.id).toBe('test-1');
  });
  it('returns undefined for non-existent id', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify(mockItems));
    expect(await notesService.getById('bad-id')).toBeUndefined();
  });
});

describe('notesService.create', () => {
  it('creates and persists item', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify([]));
    const result = await notesService.create({ name: 'New' } as any);
    expect(result.id).toBeDefined();
    expect(mockedSetItem).toHaveBeenCalled();
  });
});

describe('notesService.update', () => {
  it('updates item fields', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify(mockItems));
    await notesService.update('test-1', { name: 'Updated' } as any);
    expect(mockedSetItem).toHaveBeenCalled();
  });
  it('returns null if not found', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify(mockItems));
    const result = await notesService.update('bad-id', {} as any);
    expect(result).toBeNull();
  });
});

describe('notesService.delete', () => {
  it('removes item', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify(mockItems));
    await notesService.delete('test-1');
    expect(mockedSetItem).toHaveBeenCalled();
  });
  it('no-op if not found', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify(mockItems));
    await notesService.delete('bad-id');
  });
});

describe('notesService.getStats', () => {
  it('returns stats object', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify(mockItems));
    const stats = await notesService.getStats();
    expect(stats).toHaveProperty('total');
  });
});


describe('notesService.search', () => {
  it('returns matching items', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify(mockItems));
    const result = await notesService.search('Meeting');
    expect(result).toHaveLength(1);
  });

  it('returns empty for no match', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify(mockItems));
    const result = await notesService.search('zzzznonexistent');
    expect(result).toHaveLength(0);
  });
});

describe('notesService.getByCategory', () => {
  it('filters by category', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify(mockItems));
    const result = await notesService.getByCategory('meeting');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('test-1');
  });
});

describe('notesService.togglePin', () => {
  it('toggles pin status', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify([{ id: 'n1', title: 'Note', pinned: false, category: 'general', tags: [], createdAt: 1, updatedAt: 1 }]));
    const result = await notesService.togglePin('n1');
    expect(result!.pinned).toBe(true);
    expect(mockedSetItem).toHaveBeenCalled();
  });

  it('returns null if not found', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify(mockItems));
    const result = await notesService.togglePin('bad-id');
    expect(result).toBeNull();
  });
});

describe('notesService.clearAll', () => {
  it('clears all notes', async () => {
    await notesService.clearAll();
    expect(mockedSetItem).toHaveBeenCalled();
  });
});
