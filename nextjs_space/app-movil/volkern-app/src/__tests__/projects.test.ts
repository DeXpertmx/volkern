import { projectService } from '../services/projects';
import { api } from '../services/api';

// ─── Mock API ─────────────────────────────────────────────────────────────────
jest.mock('../services/api', () => ({
  api: {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
  },
}));

const mockGet = api.get as jest.Mock;
const mockPost = api.post as jest.Mock;
const mockPatch = api.patch as jest.Mock;
const mockDelete = api.delete as jest.Mock;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const API_PROJECT = {
  id: 'proj-1',
  name: 'Rediseño Web',
  description: 'Rediseño completo del sitio corporativo',
  status: 'IN_PROGRESS',
  startDate: '2026-05-01T00:00:00.000Z',
  endDate: '2026-07-15T00:00:00.000Z',
  budget: 15000,
  progress: 40,
  createdAt: '2026-04-20T00:00:00.000Z',
  updatedAt: '2026-05-24T00:00:00.000Z',
  milestones: [
    { id: 'ms-1', name: 'Kickoff', status: 'COMPLETED', dueDate: '2026-05-05T00:00:00.000Z' },
    { id: 'ms-2', name: 'Fase 1', status: 'IN_PROGRESS', dueDate: '2026-06-01T00:00:00.000Z' },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
});

// ─── getById ──────────────────────────────────────────────────────────────────

describe('projectService.getById', () => {
  it('returns mapped project when API responds', async () => {
    mockGet.mockResolvedValue(API_PROJECT);
    const result = await projectService.getById('proj-1');
    expect(result).not.toBeNull();
    expect(result!.name).toBe('Rediseño Web');
    expect(result!.status).toBe('active');
    expect(result!.budget).toBe(15000);
    expect(result!.tasks).toHaveLength(2);
    expect(mockGet).toHaveBeenCalledWith('/erp/projects/proj-1');
  });

  it('returns null when API returns nothing', async () => {
    mockGet.mockResolvedValue(null);
    const result = await projectService.getById('proj-1');
    expect(result).toBeNull();
  });

  it('returns null on API error', async () => {
    mockGet.mockRejectedValueOnce(new Error('Network error'));
    const result = await projectService.getById('proj-1');
    expect(result).toBeNull();
  });
});

// ─── update (PATCH) ──────────────────────────────────────────────────────────

describe('projectService.update', () => {
  const updatedProject = { ...API_PROJECT, name: 'Updated Name', status: 'COMPLETED', progress: 100 };

  it('sends PATCH and maps response from { success, data } wrapper', async () => {
    mockPatch.mockResolvedValue({ success: true, data: updatedProject });
    const result = await projectService.update('proj-1', { name: 'Updated Name', status: 'completed' });
    expect(result.name).toBe('Updated Name');
    expect(result.status).toBe('completed');
    expect(mockPatch).toHaveBeenCalledWith('/erp/projects/proj-1', {
      name: 'Updated Name',
      status: 'COMPLETED',
    });
  });

  it('handles PATCH response without wrapper (result.data || result)', async () => {
    mockPatch.mockResolvedValue(updatedProject);
    const result = await projectService.update('proj-1', { name: 'Updated Name' });
    expect(result.name).toBe('Updated Name');
  });

  it('sends STATUS_REVERSE mapping', async () => {
    mockPatch.mockResolvedValue({ success: true, data: { ...API_PROJECT, status: 'PAUSED' } });
    await projectService.update('proj-1', { status: 'paused' });
    expect(mockPatch).toHaveBeenCalledWith('/erp/projects/proj-1', { status: 'PAUSED' });
  });

  it('only sends defined fields', async () => {
    mockPatch.mockResolvedValue({ success: true, data: API_PROJECT });
    await projectService.update('proj-1', { name: 'New' });
    // Should NOT send status, budget, etc.
    const body = mockPatch.mock.calls[0][1];
    expect(body).toEqual({ name: 'New' });
  });

  it('throws error when API fails', async () => {
    mockPatch.mockRejectedValueOnce(new Error('API error'));
    await expect(projectService.update('proj-1', { name: 'X' })).rejects.toThrow('API error');
  });
});

// ─── delete (DELETE) ──────────────────────────────────────────────────────────

describe('projectService.delete', () => {
  it('calls DELETE with project id', async () => {
    mockDelete.mockResolvedValue({ success: true, message: 'Eliminado' });
    await projectService.delete('proj-1');
    expect(mockDelete).toHaveBeenCalledWith('/erp/projects/proj-1');
  });

  it('throws when API fails', async () => {
    mockDelete.mockRejectedValueOnce(new Error('Conflict: has expenses'));
    await expect(projectService.delete('proj-1')).rejects.toThrow('Conflict: has expenses');
  });
});

// ─── getStats ─────────────────────────────────────────────────────────────────

describe('projectService.getStats', () => {
  it('computes stats from getAll', async () => {
    mockGet.mockResolvedValue([
      API_PROJECT,
      { ...API_PROJECT, id: 'p2', name: 'Done', status: 'COMPLETED', progress: 100, budget: 5000 },
    ]);
    const stats = await projectService.getStats();
    expect(stats.total).toBe(2);
    expect(stats.active).toBe(1);
    expect(stats.completed).toBe(1);
    expect(stats.totalBudget).toBe(20000);
    expect(stats.avgProgress).toBe(70);
  });

  it('returns zeros on error', async () => {
    mockGet.mockRejectedValueOnce(new Error('fail'));
    const stats = await projectService.getStats();
    expect(stats).toEqual({ total: 0, active: 0, completed: 0, paused: 0, cancelled: 0, totalBudget: 0, totalSpent: 0, avgProgress: 0 });
  });
});

// ─── getAll ───────────────────────────────────────────────────────────────────

describe('projectService.getAll', () => {
  it('maps and returns all projects', async () => {
    mockGet.mockResolvedValue([API_PROJECT]);
    const result = await projectService.getAll();
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Rediseño Web');
  });

  it('filters by status via query param', async () => {
    mockGet.mockResolvedValue([{ ...API_PROJECT, status: 'ACTIVE' }]);
    await projectService.getAll({ status: 'active' });
    expect(mockGet).toHaveBeenCalledWith('/erp/projects?status=ACTIVE');
  });

  it('filters by search locally', async () => {
    mockGet.mockResolvedValue([API_PROJECT, { ...API_PROJECT, id: 'p2', name: 'Otro', description: '' }]);
    const result = await projectService.getAll({ search: 'rediseño' });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Rediseño Web');
  });

  it('returns empty array on API error', async () => {
    mockGet.mockRejectedValueOnce(new Error('fail'));
    const result = await projectService.getAll();
    expect(result).toEqual([]);
  });
});

// ─── create ───────────────────────────────────────────────────────────────────

describe('projectService.create', () => {
  it('sends POST and maps response', async () => {
    mockPost.mockResolvedValue(API_PROJECT);
    const result = await projectService.create({ name: 'Nuevo Proyecto', budget: 10000 });
    expect(result.name).toBe('Rediseño Web');
    expect(mockPost).toHaveBeenCalledWith('/erp/projects', {
      name: 'Nuevo Proyecto',
      description: '',
      budget: 10000,
      startDate: expect.any(String),
    });
  });
});

// ─── addTask / updateTask / deleteTask / addMember / removeMember ────────────

describe('projectService.addTask', () => {
  it('returns a stub task with warning', async () => {
    const task = await projectService.addTask('p1', { title: 'New', status: 'todo' });
    expect(task.title).toBe('New');
    expect(task.id).toContain('pt-');
  });
});

describe('projectService.updateTask', () => {
  it('returns a stub response', async () => {
    const result = await projectService.updateTask('p1', 't1', { title: 'Updated' });
    expect(result.id).toBe('t1');
    expect(result.title).toBe('Updated');
  });
});

describe('projectService.deleteTask', () => {
  it('does not throw', async () => {
    await expect(projectService.deleteTask('p1', 't1')).resolves.toBeUndefined();
  });
});

describe('projectService.addMember', () => {
  it('does not throw', async () => {
    await expect(projectService.addMember('p1', { id: 'u1', name: 'U1', role: 'member' })).resolves.toBeUndefined();
  });
});

describe('projectService.removeMember', () => {
  it('does not throw', async () => {
    await expect(projectService.removeMember('p1', 'u1')).resolves.toBeUndefined();
  });
});

describe('projectService.clearAll', () => {
  it('does not throw', async () => {
    await expect(projectService.clearAll()).resolves.toBeUndefined();
  });
});
