import { taskService, type Task, type TaskStatus } from './tasks';

// ─── Types ────────────────────────────────────────────────────────────────────
export interface KanbanColumn {
  id: TaskStatus;
  titleKey: string;
  icon: string;
  color: string;
  tasks: Task[];
}

export const KANBAN_COLUMNS: Omit<KanbanColumn, 'tasks'>[] = [
  { id: 'pending', titleKey: 'columnPending', icon: 'ellipse-outline', color: '#94A3B8' },
  { id: 'in_progress', titleKey: 'columnInProgress', icon: 'time-outline', color: '#3B82F6' },
  { id: 'completed', titleKey: 'columnCompleted', icon: 'checkmark-circle', color: '#22C55E' },
  { id: 'cancelled', titleKey: 'columnCancelled', icon: 'close-circle', color: '#EF4444' },
];

export const STATUS_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  pending: ['in_progress'],
  in_progress: ['pending', 'completed'],
  completed: ['in_progress'],
  cancelled: ['pending'],
};

// ─── Service ──────────────────────────────────────────────────────────────────
class KanbanService {
  /**
   * Fetch all tasks and group them by status into Kanban columns
   */
  async getBoard(params?: {
    search?: string;
    priority?: string;
    category?: string;
  }): Promise<KanbanColumn[]> {
    const tasks = await taskService.getAll(params as any);

    const columns: KanbanColumn[] = KANBAN_COLUMNS.map((col) => ({
      ...col,
      tasks: tasks
        .filter((t) => t.status === col.id)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    }));

    return columns;
  }

  /**
   * Move a task to a different status column
   */
  async moveTask(taskId: string, newStatus: TaskStatus): Promise<Task> {
    return taskService.updateStatus(taskId, newStatus);
  }
}

export const kanbanService = new KanbanService();
