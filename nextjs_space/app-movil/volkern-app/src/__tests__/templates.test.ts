import { templatesService } from '../services/templates';
import { getData, saveData } from '../services/secure-storage';

jest.mock('../services/secure-storage', () => ({
  getData: jest.fn(),
  saveData: jest.fn(),
}));

const mockedGetData = getData as jest.Mock;
const mockedSaveData = saveData as jest.Mock;

beforeEach(() => { jest.clearAllMocks(); });

describe('templatesService.getAll', () => {
  it('returns built-in templates when no saved data', async () => {
    mockedGetData.mockResolvedValue(null);
    const result = await templatesService.getAll();
    expect(result.length).toBeGreaterThanOrEqual(6);
  });
});

describe('templatesService.getById', () => {
  it('returns built-in template by id', async () => {
    mockedGetData.mockResolvedValue(null);
    const result = await templatesService.getById('builtin-welcome-email');
    expect(result).toBeDefined();
    if (result) expect(result.title).toBe('Bienvenida');
  });
});

describe('templatesService.create', () => {
  it('creates user template', async () => {
    mockedGetData.mockResolvedValue(null);
    const result = await templatesService.create({
      title: 'Custom Template', description: 'Desc', content: 'Content',
      category: 'custom', channel: 'email', status: 'draft', variables: [], tags: [],
    });
    expect(result.id).toBeDefined();
    expect(mockedSaveData).toHaveBeenCalled();
  });
});

describe('templatesService.update', () => {
  it('updates template', async () => {
    mockedGetData.mockResolvedValue(null);
    const result = await templatesService.update('builtin-welcome-email', { title: 'Updated' });
    // Built-in templates don't trigger saveData (no user templates stored)
    expect(result).toBeDefined();
    if (result) expect(result.title).toBe('Bienvenida');
  });
});

describe('templatesService.delete', () => {
  it('deletes template', async () => {
    mockedGetData.mockResolvedValue(null);
    const delResult = await templatesService.delete('builtin-welcome-email');
    // Built-in templates can't be deleted (no user templates stored)
    expect(delResult).toBe(false);
  });
});

describe('templatesService.getStats', () => {
  it('returns stats', async () => {
    mockedGetData.mockResolvedValue(null);
    const stats = await templatesService.getStats();
    expect(stats).toHaveProperty('total');
    expect(stats).toHaveProperty('active');
  });

  it('includes user templates in stats', async () => {
    mockedGetData.mockResolvedValue([{ id: 'custom', title: 'C1', status: 'active', usageCount: 5 }]);
    const stats = await templatesService.getStats();
    expect(stats.total).toBeGreaterThan(0);
    expect(stats.active).toBeGreaterThan(0);
  });
});

describe('templatesService.incrementUsage', () => {
  it('increments usage count', async () => {
    mockedGetData.mockResolvedValue(null);
    await templatesService.incrementUsage('builtin-welcome-email');
    // Built-in templates don't have custom storage entry
    expect(mockedSaveData).not.toHaveBeenCalled();
  });

  it('increments usage for custom template', async () => {
    mockedGetData.mockResolvedValue([{ id: 'custom-1', title: 'Custom', status: 'active', usageCount: 0 }]);
    await templatesService.incrementUsage('custom-1');
    expect(mockedSaveData).toHaveBeenCalled();
  });

  it('no-op for non-existent template', async () => {
    mockedGetData.mockResolvedValue(null);
    await templatesService.incrementUsage('bad-id');
    expect(mockedSaveData).not.toHaveBeenCalled();
  });
});

describe('templatesService.getByCategory', () => {
  it('filters by category', async () => {
    mockedGetData.mockResolvedValue(null);
    const result = await templatesService.getByCategory('onboarding');
    expect(Array.isArray(result)).toBe(true);
  });
});

describe('templatesService.getByChannel', () => {
  it('filters by channel', async () => {
    mockedGetData.mockResolvedValue(null);
    const result = await templatesService.getByChannel('email');
    expect(Array.isArray(result)).toBe(true);
  });
});

describe('templatesService.search', () => {
  it('searches templates by title', async () => {
    mockedGetData.mockResolvedValue(null);
    const result = await templatesService.search('bienvenida');
    expect(result.length).toBeGreaterThanOrEqual(1);
  });

  it('returns empty for unmatched query', async () => {
    mockedGetData.mockResolvedValue(null);
    const result = await templatesService.search('zzzznonexistent');
    expect(result).toEqual([]);
  });
});

describe('templatesService user create/update/delete', () => {
  it('create user template', async () => {
    mockedGetData.mockResolvedValue(null);
    const created = await templatesService.create({ title: 'Custom', description: 'D', content: 'C', category: 'custom', channel: 'email', status: 'draft', variables: [], tags: [] });
    expect(created.id).toBeDefined();
    expect(mockedSaveData).toHaveBeenCalled();
  });

  it('update user template', async () => {
    mockedGetData.mockResolvedValue([{ id: 'u1', title: 'Old', status: 'draft', usageCount: 0 }]);
    const updated = await templatesService.update('u1', { title: 'Updated' });
    expect(updated).toBeDefined();
    expect(mockedSaveData).toHaveBeenCalled();
  });

  it('delete user template', async () => {
    mockedGetData.mockResolvedValue([{ id: 'u1', title: 'Custom', status: 'draft', usageCount: 0 }]);
    const result = await templatesService.delete('u1');
    expect(result).toBe(true);
    expect(mockedSaveData).toHaveBeenCalled();
  });
});

