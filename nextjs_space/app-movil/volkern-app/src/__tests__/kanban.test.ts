import { kanbanService, KANBAN_COLUMNS, STATUS_TRANSITIONS } from '../services/kanban';

jest.mock('../services/tasks', () => ({
  taskService: {
    getAll: jest.fn(),
    updateStatus: jest.fn(),
  },
}));

const mockTaskService = require('../services/tasks').taskService;

const mockTasks = [
  { id: 't1', title: 'Task 1', status: 'pending', priority: 'high', createdAt: '2025-03-01T00:00:00Z', updatedAt: '2025-03-01T00:00:00Z', category: 'Ventas', description: '', dueDate: null, assignedTo: null, completedAt: null },
  { id: 't2', title: 'Task 2', status: 'in_progress', priority: 'medium', createdAt: '2025-03-02T00:00:00Z', updatedAt: '2025-03-02T00:00:00Z', category: 'Marketing', description: '', dueDate: null, assignedTo: null, completedAt: null },
  { id: 't3', title: 'Task 3', status: 'completed', priority: 'low', createdAt: '2025-03-03T00:00:00Z', updatedAt: '2025-03-03T00:00:00Z', category: 'Soporte', description: '', dueDate: null, assignedTo: null, completedAt: null },
  { id: 't4', title: 'Task 4', status: 'cancelled', priority: 'urgent', createdAt: '2025-03-04T00:00:00Z', updatedAt: '2025-03-04T00:00:00Z', category: 'RRHH', description: '', dueDate: null, assignedTo: null, completedAt: null },
  { id: 't5', title: 'Task 5', status: 'pending', priority: 'low', createdAt: '2025-03-05T00:00:00Z', updatedAt: '2025-03-05T00:00:00Z', category: 'Desarrollo', description: '', dueDate: null, assignedTo: null, completedAt: null },
];

beforeEach(() => {
  jest.clearAllMocks();
});

describe('KANBAN_COLUMNS', () => {
  it('has 4 columns', () => {
    expect(KANBAN_COLUMNS).toHaveLength(4);
  });

  it('covers all task statuses', () => {
    const colIds = KANBAN_COLUMNS.map(c => c.id);
    expect(colIds).toContain('pending');
    expect(colIds).toContain('in_progress');
    expect(colIds).toContain('completed');
    expect(colIds).toContain('cancelled');
  });
});

describe('STATUS_TRANSITIONS', () => {
  it('pending can go to in_progress', () => {
    expect(STATUS_TRANSITIONS.pending).toEqual(['in_progress']);
  });

  it('in_progress can go to pending or completed', () => {
    expect(STATUS_TRANSITIONS.in_progress).toEqual(['pending', 'completed']);
  });

  it('completed can go to in_progress', () => {
    expect(STATUS_TRANSITIONS.completed).toEqual(['in_progress']);
  });

  it('cancelled can go to pending', () => {
    expect(STATUS_TRANSITIONS.cancelled).toEqual(['pending']);
  });
});

describe('kanbanService.getBoard', () => {
  it('groups tasks by status into columns', async () => {
    mockTaskService.getAll.mockResolvedValue(mockTasks);
    const board = await kanbanService.getBoard();

    expect(board).toHaveLength(4);
    expect(board[0].id).toBe('pending');
    expect(board[0].tasks).toHaveLength(2); // t1, t5
    expect(board[1].id).toBe('in_progress');
    expect(board[1].tasks).toHaveLength(1); // t2
    expect(board[2].id).toBe('completed');
    expect(board[2].tasks).toHaveLength(1); // t3
    expect(board[3].id).toBe('cancelled');
    expect(board[3].tasks).toHaveLength(1); // t4
  });

  it('passes search/priority/category params to taskService.getAll', async () => {
    mockTaskService.getAll.mockResolvedValue([]);
    await kanbanService.getBoard({ search: 'test', priority: 'high', category: 'Ventas' });
    expect(mockTaskService.getAll).toHaveBeenCalledWith({ search: 'test', priority: 'high', category: 'Ventas' });
  });

  it('returns columns even when no tasks', async () => {
    mockTaskService.getAll.mockResolvedValue([]);
    const board = await kanbanService.getBoard();
    expect(board).toHaveLength(4);
    for (const col of board) {
      expect(col.tasks).toHaveLength(0);
    }
  });

  it('sorts tasks by createdAt descending within each column', async () => {
    mockTaskService.getAll.mockResolvedValue(mockTasks);
    const board = await kanbanService.getBoard();
    const pendingCol = board.find(c => c.id === 'pending')!;
    expect(pendingCol.tasks[0].id).toBe('t5'); // newer
    expect(pendingCol.tasks[1].id).toBe('t1'); // older
  });
});

describe('kanbanService.moveTask', () => {
  it('calls taskService.updateStatus with task id and new status', async () => {
    const updatedTask = { ...mockTasks[0], status: 'in_progress' };
    mockTaskService.updateStatus.mockResolvedValue(updatedTask);

    const result = await kanbanService.moveTask('t1', 'in_progress');
    expect(mockTaskService.updateStatus).toHaveBeenCalledWith('t1', 'in_progress');
    expect(result.status).toBe('in_progress');
  });
});
