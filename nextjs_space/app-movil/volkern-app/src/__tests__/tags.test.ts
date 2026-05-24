import { tagsService } from '../services/tags';
import { getData, saveData } from '../services/secure-storage';

jest.mock('../services/secure-storage', () => ({
  getData: jest.fn(),
  saveData: jest.fn(),
}));

const mockedGetData = getData as jest.Mock;
const mockedSaveData = saveData as jest.Mock;

beforeEach(() => { jest.clearAllMocks(); });

describe('tagsService.getAll', () => {
  it('returns seed tags when no user data', async () => {
    mockedGetData.mockResolvedValue(null);
    const result = await tagsService.getAll();
    expect(result.length).toBeGreaterThanOrEqual(7);
  });
});

describe('tagsService.getById', () => {
  it('returns seed tag by id', async () => {
    mockedGetData.mockResolvedValue(null);
    const result = await tagsService.getById('seed-vip');
    expect(result).toBeDefined();
    if (result) expect(result.name).toBe('VIP');
  });
});

describe('tagsService.create', () => {
  it('creates user tag', async () => {
    mockedGetData.mockResolvedValue(null);
    const result = await tagsService.create({ name: 'New Tag', color: '#FF0000', group: 'general', isSmart: false });
    expect(result.id).toBeDefined();
    expect(mockedSaveData).toHaveBeenCalled();
  });
});

describe('tagsService.update', () => {
  it('updates tag', async () => {
    mockedGetData.mockResolvedValue(null);
    const result = await tagsService.update('seed-vip', { name: 'VIP Updated' });
    expect(result).toBeDefined();
    if (result) expect(result.name).toBe('VIP');
  });
});

describe('tagsService.delete', () => {
  it('deletes user-created tag only', async () => {
    mockedGetData.mockResolvedValue(null);
    const delResult = await tagsService.delete('seed-vip');
    expect(delResult).toBe(false);
  });
});

describe('tagsService.update', () => {
  it('updates user tag', async () => {
    mockedGetData.mockResolvedValue([{ id: 'user-t1', name: 'Old', color: '#000', group: 'general', isSmart: false, usageCount: 0, createdAt: 1, updatedAt: 1 }]);
    const result = await tagsService.update('user-t1', { name: 'Updated' });
    expect(result).toBeDefined();
    expect(result!.name).toBe('Updated');
    expect(mockedSaveData).toHaveBeenCalled();
  });

  it('returns undefined for non-existent', async () => {
    mockedGetData.mockResolvedValue([]);
    const result = await tagsService.update('bad-id', { name: 'X' });
    expect(result).toBeUndefined();
  });
});

describe('tagsService.delete', () => {
  it('deletes user tag and returns true', async () => {
    mockedGetData.mockResolvedValue([{ id: 'user-t2', name: 'Tag', color: '#000', group: 'general', isSmart: false, usageCount: 0, createdAt: 1, updatedAt: 1 }]);
    const result = await tagsService.delete('user-t2');
    expect(result).toBe(true);
    expect(mockedSaveData).toHaveBeenCalled();
  });

  it('returns false for non-existent tag', async () => {
    mockedGetData.mockResolvedValue([]);
    const result = await tagsService.delete('bad-id');
    expect(result).toBe(false);
  });
});

describe('tagsService.getStats', () => {
  it('returns stats', async () => {
    mockedGetData.mockResolvedValue(null);
    const stats = await tagsService.getStats();
    expect(stats).toHaveProperty('total');
    expect(stats).toHaveProperty('smartCount');
  });
});


// ─── Extra coverage: tag operations ─────────────────────────────────────

describe('tagsService.getByGroup', () => {
  it('filters by group', async () => {
    mockedGetData.mockResolvedValue([]);
    const result = await tagsService.getByGroup('lead');
    expect(result.length).toBeGreaterThan(0);
    result.forEach(t => expect(t.group).toBe('lead'));
  });
});

describe('tagsService.getSmartTags', () => {
  it('returns smart tags', async () => {
    mockedGetData.mockResolvedValue([]);
    const result = await tagsService.getSmartTags();
    result.forEach(t => expect(t.isSmart).toBe(true));
  });
});

describe('tagsService.incrementUsage', () => {
  it('increments usage count', async () => {
    mockedGetData.mockResolvedValue([{ id: 'user-tag-1', name: 'Custom', color: '#000', group: 'general', isSmart: false, usageCount: 0, createdAt: 1, updatedAt: 1 }]);
    await tagsService.incrementUsage('user-tag-1');
    expect(mockedSaveData).toHaveBeenCalled();
  });

  it('does nothing for seed tags', async () => {
    await tagsService.incrementUsage('seed-vip');
    expect(mockedSaveData).not.toHaveBeenCalled();
  });
});

describe('tagsService.toggleSmart', () => {
  it('toggles isSmart flag', async () => {
    mockedGetData.mockResolvedValue([{ id: 'user-tag-2', name: 'Test', color: '#000', group: 'general', isSmart: false, usageCount: 0, createdAt: 1, updatedAt: 1 }]);
    await tagsService.toggleSmart('user-tag-2');
    expect(mockedSaveData).toHaveBeenCalled();
  });
});

describe('tagsService.getStats', () => {
  it('computes tag stats', async () => {
    mockedGetData.mockResolvedValue([
      { id: 't1', name: 'A', color: '#000', group: 'general', isSmart: true, usageCount: 5, createdAt: 1, updatedAt: 1 },
    ]);
    const stats = await tagsService.getStats();
    expect(stats.total).toBe(8); // 7 seed + 1 custom
    expect(stats.smartCount).toBeGreaterThanOrEqual(1);
  });
});
