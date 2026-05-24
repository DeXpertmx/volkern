import { projectService } from '../services/projects';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

const getItem = require('expo-secure-store').getItemAsync as jest.Mock;
const setItem = require('expo-secure-store').setItemAsync as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  // Clear projectService cache between tests
  (projectService as any).cache = null;
});

describe('projectService.getAll', () => {
  it('returns seed projects when no saved data', async () => {
    getItem.mockResolvedValue(null);
    const result = await projectService.getAll();
    expect(result.length).toBeGreaterThanOrEqual(5);
  });
  it('returns stored projects', async () => {
    getItem.mockResolvedValue(null);
    // Mock load to return custom data
    const spy = jest.spyOn(projectService as any, 'load').mockResolvedValue([
      { id: 'p1', name: 'Custom', description: '', status: 'active', priority: 'medium',
        startDate: '', endDate: null, budget: 0, spent: 0, progress: 0, color: '#000',
        icon: 'flag', members: [], tasks: [], tags: [], createdAt: '', updatedAt: '' }
    ]);
    const result = await projectService.getAll();
    expect(result).toHaveLength(1);
    spy.mockRestore();
  });
});

describe('projectService.getById', () => {
  it('returns seed project by id', async () => {
    getItem.mockResolvedValue(null);
    (projectService as any).cache = null;
    const result = await projectService.getById('p1');
    expect(result).not.toBeNull();
    if (result) expect(result.name).toBe('Rediseño Web');
  });
  it('returns null for non-existent id', async () => {
    getItem.mockResolvedValue(null);
    (projectService as any).cache = null;
    expect(await projectService.getById('nonexistent')).toBeNull();
  });
});

describe('projectService.create', () => {
  it('creates project', async () => {
    getItem.mockResolvedValue(null);
    (projectService as any).cache = null;
    const result = await projectService.create({ name: 'New Project' });
    expect(result.id).toBeDefined();
    expect(setItem).toHaveBeenCalled();
  });
});

describe('projectService.update', () => {
  it('updates project', async () => {
    getItem.mockResolvedValue(null);
    (projectService as any).cache = null;
    // First need seed data in cache for update to find project
    await projectService.getById('p1');
    (projectService as any).cache = null;
    // Mock getItemAsync to return seed data
    getItem.mockResolvedValueOnce(Promise.resolve(null));
    // The load method will set cache from seed data
    const result = await projectService.update('p1', { name: 'Updated' });
    expect(setItem).toHaveBeenCalled();
  });
});

describe('projectService.delete', () => {
  it('deletes project', async () => {
    getItem.mockResolvedValue(null);
    (projectService as any).cache = null;
    await projectService.delete('p1');
    expect(setItem).toHaveBeenCalled();
  });
});

describe('projectService.getStats', () => {
  it('returns stats', async () => {
    getItem.mockResolvedValue(null);
    (projectService as any).cache = null;
    const stats = await projectService.getStats();
    expect(stats).toHaveProperty('total');
    expect(stats).toHaveProperty('active');
    expect(stats).toHaveProperty('completed');
  });
});


// ─── Extra coverage: project task/member operations ─────────────────────

describe('projectService.addTask', () => {
  it('adds a task to a project', async () => {
    (projectService as any).cache = null;
    getItem.mockResolvedValue(JSON.stringify([{ id: 'p1', name: 'P1', tasks: [], members: [], tags: [], status: 'active', priority: 'medium', startDate: '2026-01-01', endDate: null, budget: 0, spent: 0, progress: 0, color: '#000', icon: 'rocket', description: '', createdAt: '1', updatedAt: '1' }]));
    const task = await projectService.addTask('p1', { title: 'New Task', status: 'todo' });
    expect(task.id).toBeDefined();
    expect(task.title).toBe('New Task');
    expect(setItem).toHaveBeenCalled();
  });

  it('throws on project not found', async () => {
    (projectService as any).cache = null;
    getItem.mockResolvedValue(JSON.stringify([]));
    await expect(projectService.addTask('bad', { title: 'T', status: 'todo' })).rejects.toThrow('Proyecto no encontrado');
  });
});

describe('projectService.addMember', () => {
  it('adds a member', async () => {
    (projectService as any).cache = null;
    getItem.mockResolvedValue(JSON.stringify([{ id: 'p1', name: 'P1', members: [], tasks: [], tags: [], status: 'active', priority: 'medium', startDate: '2026-01-01', endDate: null, budget: 0, spent: 0, progress: 0, color: '#000', icon: 'rocket', description: '', createdAt: '1', updatedAt: '1' }]));
    await projectService.addMember('p1', { id: 'u1', name: 'User 1', role: 'member' });
    expect(setItem).toHaveBeenCalled();
  });

  it('throws on project not found', async () => {
    (projectService as any).cache = null;
    getItem.mockResolvedValue(JSON.stringify([]));
    await expect(projectService.addMember('bad', { id: 'u1', name: 'U1', role: 'member' })).rejects.toThrow('Proyecto no encontrado');
  });

  it('skip duplicate member', async () => {
    (projectService as any).cache = null;
    getItem.mockResolvedValue(JSON.stringify([{ id: 'p1', name: 'P1', members: [{ id: 'u1', name: 'Existing', role: 'member' }], tasks: [], tags: [], status: 'active', priority: 'medium', startDate: '2026-01-01', endDate: null, budget: 0, spent: 0, progress: 0, color: '#000', icon: 'rocket', description: '', createdAt: '1', updatedAt: '1' }]));
    // Member already in the project — should return early without persisting
    await projectService.addMember('p1', { id: 'u1', name: 'Existing', role: 'member' });
    // persist() is NOT called because the early return happens before save
    // But setItem may have been called by load() saving seed data, so check via member count
    const updated = await projectService.getById('p1');
    expect(updated?.members).toHaveLength(1);
  });
});

describe('projectService.getStats', () => {
  it('computes project stats from seed', async () => {
    (projectService as any).cache = null;
    getItem.mockResolvedValue(null); // will fallback to seed
    const stats = await projectService.getStats();
    expect(stats.total).toBeGreaterThan(0);
    expect(stats.avgProgress).toBeGreaterThan(0);
  });
});

describe('projectService.getAll with filters', () => {
  it('filters by status', async () => {
    (projectService as any).cache = null;
    getItem.mockResolvedValue(JSON.stringify([{ id: 'p1', name: 'Active', status: 'active', description: '', priority: 'medium', startDate: '', endDate: null, budget: 0, spent: 0, progress: 0, color: '#000', icon: 'flag', members: [], tasks: [], tags: [], createdAt: '', updatedAt: '' }]));
    const result = await projectService.getAll({ status: 'active' });
    expect(result).toHaveLength(1);
  });

  it('filters by search', async () => {
    (projectService as any).cache = null;
    getItem.mockResolvedValue(JSON.stringify([{ id: 'p1', name: 'My Project', status: 'active', description: 'Test project', priority: 'medium', startDate: '', endDate: null, budget: 0, spent: 0, progress: 0, color: '#000', icon: 'flag', members: [], tasks: [], tags: ['web'], createdAt: '', updatedAt: '' }]));
    const result = await projectService.getAll({ search: 'Project' });
    expect(result).toHaveLength(1);
  });
});

describe('projectService.updateTask', () => {
  it('updates a task', async () => {
    (projectService as any).cache = null;
    getItem.mockResolvedValue(JSON.stringify([{ id: 'p1', name: 'P1', tasks: [{ id: 't1', title: 'Old', status: 'todo' }], members: [], tags: [], status: 'active', priority: 'medium', startDate: '2026-01-01', endDate: null, budget: 0, spent: 0, progress: 0, color: '#000', icon: 'rocket', description: '', createdAt: '1', updatedAt: '1' }]));
    await projectService.updateTask('p1', 't1', { title: 'Updated', status: 'done' });
    expect(setItem).toHaveBeenCalled();
  });

  it('throws on project not found', async () => {
    (projectService as any).cache = null;
    getItem.mockResolvedValue(JSON.stringify([]));
    await expect(projectService.updateTask('bad', 't1', {})).rejects.toThrow('Proyecto no encontrado');
  });

  it('throws on task not found', async () => {
    (projectService as any).cache = null;
    getItem.mockResolvedValue(JSON.stringify([{ id: 'p1', name: 'P1', tasks: [], members: [], tags: [], status: 'active', priority: 'medium', startDate: '2026-01-01', endDate: null, budget: 0, spent: 0, progress: 0, color: '#000', icon: 'rocket', description: '', createdAt: '1', updatedAt: '1' }]));
    await expect(projectService.updateTask('p1', 'bad-task', {})).rejects.toThrow('Tarea no encontrada');
  });
});

describe('projectService.deleteTask', () => {
  it('deletes a task', async () => {
    (projectService as any).cache = null;
    getItem.mockResolvedValue(JSON.stringify([{ id: 'p1', name: 'P1', tasks: [{ id: 't1', title: 'Task', status: 'todo' }], members: [], tags: [], status: 'active', priority: 'medium', startDate: '2026-01-01', endDate: null, budget: 0, spent: 0, progress: 0, color: '#000', icon: 'rocket', description: '', createdAt: '1', updatedAt: '1' }]));
    await projectService.deleteTask('p1', 't1');
    expect(setItem).toHaveBeenCalled();
  });

  it('throws on project not found', async () => {
    (projectService as any).cache = null;
    getItem.mockResolvedValue(JSON.stringify([]));
    await expect(projectService.deleteTask('bad', 't1')).rejects.toThrow('Proyecto no encontrado');
  });
});

describe('projectService.removeMember', () => {
  it('removes a member', async () => {
    (projectService as any).cache = null;
    getItem.mockResolvedValue(JSON.stringify([{ id: 'p1', name: 'P1', members: [{ id: 'u1', name: 'User', role: 'member' }], tasks: [], tags: [], status: 'active', priority: 'medium', startDate: '2026-01-01', endDate: null, budget: 0, spent: 0, progress: 0, color: '#000', icon: 'rocket', description: '', createdAt: '1', updatedAt: '1' }]));
    await projectService.removeMember('p1', 'u1');
    expect(setItem).toHaveBeenCalled();
  });

  it('throws on project not found', async () => {
    (projectService as any).cache = null;
    getItem.mockResolvedValue(JSON.stringify([]));
    await expect(projectService.removeMember('bad', 'u1')).rejects.toThrow('Proyecto no encontrado');
  });
});

describe('projectService.clearAll', () => {
  it('clears all projects', async () => {
    const deleteItem = require('expo-secure-store').deleteItemAsync;
    await projectService.clearAll();
    expect(deleteItem).toHaveBeenCalled();
  });
});

describe('projectService.update', () => {
  it('throws on project not found', async () => {
    (projectService as any).cache = null;
    getItem.mockResolvedValue(JSON.stringify([]));
    await expect(projectService.update('bad', { name: 'X' })).rejects.toThrow('Proyecto no encontrado');
  });
});

describe('projectService.delete', () => {
  it('throws on project not found', async () => {
    (projectService as any).cache = null;
    getItem.mockResolvedValue(JSON.stringify([]));
    await expect(projectService.delete('bad')).rejects.toThrow('Proyecto no encontrado');
  });
});
