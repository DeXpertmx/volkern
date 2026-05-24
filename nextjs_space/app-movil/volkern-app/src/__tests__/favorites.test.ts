import { favoritesService } from '../services/favorites';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
}));

const mockedGetItem = require('expo-secure-store').getItemAsync as jest.Mock;
const mockedSetItem = require('expo-secure-store').setItemAsync as jest.Mock;

const favoriteItem = { id: 'item1', type: 'module' as const, name: 'Module 1', icon: 'star', color: '#FFD700' };

beforeEach(() => { jest.clearAllMocks(); });

describe('favoritesService.getAll', () => {
  it('returns empty array when no data', async () => {
    mockedGetItem.mockResolvedValue(null);
    expect(await favoritesService.getAll()).toEqual([]);
  });
});

describe('favoritesService.toggle', () => {
  it('adds favorite when not present', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify([]));
    const result = await favoritesService.toggle(favoriteItem);
    expect(result).toBe(true);
    expect(mockedSetItem).toHaveBeenCalled();
  });
  it('removes favorite when already present', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify([{ ...favoriteItem, addedAt: Date.now() }]));
    const result = await favoritesService.toggle(favoriteItem);
    expect(result).toBe(false);
  });
});

describe('favoritesService.isFavorite', () => {
  it('checks if item is favorite', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify([{ ...favoriteItem, addedAt: Date.now() }]));
    expect(await favoritesService.isFavorite('item1', 'module')).toBe(true);
    expect(await favoritesService.isFavorite('item2', 'module')).toBe(false);
  });
});

describe('favoritesService.getByType', () => {
  it('filters by type', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify([
      { ...favoriteItem, addedAt: 1000 },
      { id: 't1', type: 'task', name: 'Task 1', icon: 'check', color: '#000', addedAt: 2000 },
    ]));
    const result = await favoritesService.getByType('module');
    expect(result).toHaveLength(1);
  });
});

describe('favoritesService.add', () => {
  it('skips duplicate', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify([{ ...favoriteItem, addedAt: 1000 }]));
    await favoritesService.add(favoriteItem);
    expect(mockedSetItem).not.toHaveBeenCalled();
  });
});

describe('favoritesService.remove', () => {
  it('removes item', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify([{ ...favoriteItem, addedAt: 1000 }]));
    await favoritesService.remove('item1', 'module');
    expect(mockedSetItem).toHaveBeenCalledWith(expect.any(String), JSON.stringify([]));
  });
});

describe('favoritesService.getFavoritedIds', () => {
  it('returns set of ids for type', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify([
      { ...favoriteItem, addedAt: 1000 },
      { id: 'item2', type: 'module', name: 'M2', icon: 's', color: '#000', addedAt: 2000 },
    ]));
    const ids = await favoritesService.getFavoritedIds('module');
    expect(ids.has('item1')).toBe(true);
    expect(ids.has('item2')).toBe(true);
    expect(ids.size).toBe(2);
  });
});

describe('favoritesService.clearByType', () => {
  it('clears type but keeps others', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify([
      { ...favoriteItem, addedAt: 1000 },
      { id: 't1', type: 'task', name: 'T1', icon: 'c', color: '#000', addedAt: 2000 },
    ]));
    await favoritesService.clearByType('module');
    expect(mockedSetItem).toHaveBeenCalledWith(expect.any(String), JSON.stringify([
      { id: 't1', type: 'task', name: 'T1', icon: 'c', color: '#000', addedAt: 2000 },
    ]));
  });
});

describe('favoritesService.clearAll', () => {
  it('clears all favorites', async () => {
    await favoritesService.clearAll();
    expect(mockedSetItem).toHaveBeenCalledWith(expect.any(String), '[]');
  });
});

describe('favoritesService.count', () => {
  it('returns count', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify([{ ...favoriteItem, addedAt: 1000 }]));
    expect(await favoritesService.count()).toBe(1);
  });
});
