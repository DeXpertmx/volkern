import { taskService, getStatusLabel, getPriorityLabel, getPriorityColor, getStatusIcon } from '../services/tasks';

jest.mock('../services/api', () => ({
  api: {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
  },
}));

const mockApi = require('../services/api').api;

const mockTask = {
  id: 't1',
  title: 'Test Task',
  description: 'A test task',
  status: 'pending',
  priority: 'high',
  dueDate: '2025-06-01',
  assignedTo: { id: 'u1', name: 'User' },
  category: 'Ventas',
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-02T00:00:00Z',
  completedAt: null,
};

beforeEach(() => {
  jest.clearAllMocks();
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

describe('getStatusLabel', () => {
  it('returns label for known status', () => {
    expect(getStatusLabel('pending')).toBe('Pendiente');
    expect(getStatusLabel('in_progress')).toBe('En Progreso');
    expect(getStatusLabel('completed')).toBe('Completada');
    expect(getStatusLabel('cancelled')).toBe('Cancelada');
  });

  it('returns status itself for unknown value', () => {
    expect(getStatusLabel('unknown' as any)).toBe('unknown');
  });
});

describe('getPriorityLabel', () => {
  it('returns label for known priority', () => {
    expect(getPriorityLabel('low')).toBe('Baja');
    expect(getPriorityLabel('medium')).toBe('Media');
    expect(getPriorityLabel('high')).toBe('Alta');
    expect(getPriorityLabel('urgent')).toBe('Urgente');
  });

  it('returns priority itself for unknown value', () => {
    expect(getPriorityLabel('unknown' as any)).toBe('unknown');
  });
});

describe('getPriorityColor', () => {
  it('returns color for known priority', () => {
    expect(getPriorityColor('low')).toBe('#94A3B8');
    expect(getPriorityColor('medium')).toBe('#3B82F6');
    expect(getPriorityColor('high')).toBe('#F59E0B');
    expect(getPriorityColor('urgent')).toBe('#EF4444');
  });

  it('returns default color for unknown priority', () => {
    expect(getPriorityColor('unknown' as any)).toBe('#94A3B8');
  });
});

describe('getStatusIcon', () => {
  it('returns icon for known status', () => {
    expect(getStatusIcon('pending')).toBe('ellipse-outline');
    expect(getStatusIcon('in_progress')).toBe('time-outline');
    expect(getStatusIcon('completed')).toBe('checkmark-circle');
    expect(getStatusIcon('cancelled')).toBe('close-circle');
  });

  it('returns default icon for unknown status', () => {
    expect(getStatusIcon('unknown' as any)).toBe('ellipse-outline');
  });
});

// ─── getAll ───────────────────────────────────────────────────────────────────

describe('taskService.getAll', () => {
  it('calls api.get without query params', async () => {
    mockApi.get.mockResolvedValue([mockTask]);
    const result = await taskService.getAll();
    expect(mockApi.get).toHaveBeenCalledWith('/tasks');
    expect(result).toEqual([mockTask]);
  });

  it('builds query string from params', async () => {
    mockApi.get.mockResolvedValue([]);
    await taskService.getAll({ status: 'pending', priority: 'high', category: 'Ventas', search: 'test' });
    expect(mockApi.get).toHaveBeenCalledWith('/tasks?status=pending&priority=high&category=Ventas&search=test');
  });

  it('omits undefined params from query', async () => {
    mockApi.get.mockResolvedValue([]);
    await taskService.getAll({ status: 'completed' });
    expect(mockApi.get).toHaveBeenCalledWith('/tasks?status=completed');
  });
});

// ─── getById ──────────────────────────────────────────────────────────────────

describe('taskService.getById', () => {
  it('calls api.get with id', async () => {
    mockApi.get.mockResolvedValue(mockTask);
    const result = await taskService.getById('t1');
    expect(mockApi.get).toHaveBeenCalledWith('/tasks/t1');
    expect(result).toEqual(mockTask);
  });
});

// ─── create ───────────────────────────────────────────────────────────────────

describe('taskService.create', () => {
  it('calls api.post with input', async () => {
    const input = { title: 'New Task', description: 'Desc', priority: 'high' as const };
    mockApi.post.mockResolvedValue({ ...mockTask, title: 'New Task' });
    const result = await taskService.create(input);
    expect(mockApi.post).toHaveBeenCalledWith('/tasks', input);
    expect(result.title).toBe('New Task');
  });
});

// ─── update ───────────────────────────────────────────────────────────────────

describe('taskService.update', () => {
  it('calls api.patch with id and input', async () => {
    const input = { title: 'Updated', status: 'completed' as const };
    mockApi.patch.mockResolvedValue({ ...mockTask, ...input });
    const result = await taskService.update('t1', input);
    expect(mockApi.patch).toHaveBeenCalledWith('/tasks/t1', input);
    expect(result.title).toBe('Updated');
  });
});

// ─── delete ───────────────────────────────────────────────────────────────────

describe('taskService.delete', () => {
  it('calls api.delete with id', async () => {
    mockApi.delete.mockResolvedValue(undefined);
    await taskService.delete('t1');
    expect(mockApi.delete).toHaveBeenCalledWith('/tasks/t1');
  });
});

// ─── updateStatus ─────────────────────────────────────────────────────────────

describe('taskService.updateStatus', () => {
  it('calls api.patch with status endpoint', async () => {
    mockApi.patch.mockResolvedValue({ ...mockTask, status: 'completed' });
    const result = await taskService.updateStatus('t1', 'completed');
    expect(mockApi.patch).toHaveBeenCalledWith('/tasks/t1/status', { status: 'completed' });
    expect(result.status).toBe('completed');
  });
});

// ─── getStats ─────────────────────────────────────────────────────────────────

describe('taskService.getStats', () => {
  it('calls api.get for stats', async () => {
    const stats = { total: 10, pending: 3, inProgress: 2, completed: 4, overdue: 1 };
    mockApi.get.mockResolvedValue(stats);
    const result = await taskService.getStats();
    expect(mockApi.get).toHaveBeenCalledWith('/tasks/stats');
    expect(result).toEqual(stats);
  });
});
