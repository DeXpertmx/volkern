import { api } from './api';

// ─── Types ────────────────────────────────────────────────────────────────────
export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled';
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string | null;
  assignedTo: { id: string; name: string } | null;
  category: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  leadId?: string;
  leadName?: string;
}

export interface CreateTaskInput {
  title: string;
  description?: string;
  priority?: TaskPriority;
  dueDate?: string;
  category?: string;
  leadId?: string;
}

export interface UpdateTaskInput {
  title?: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  dueDate?: string | null;
  category?: string | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────
export const TASK_STATUSES: { value: TaskStatus; label: string; icon: string }[] = [
  { value: 'pending', label: 'Pendiente', icon: 'ellipse-outline' },
  { value: 'in_progress', label: 'En Progreso', icon: 'time-outline' },
  { value: 'completed', label: 'Completada', icon: 'checkmark-circle' },
  { value: 'cancelled', label: 'Cancelada', icon: 'close-circle' },
];

export const TASK_PRIORITIES: { value: TaskPriority; label: string; color: string }[] = [
  { value: 'low', label: 'Baja', color: '#94A3B8' },
  { value: 'medium', label: 'Media', color: '#3B82F6' },
  { value: 'high', label: 'Alta', color: '#F59E0B' },
  { value: 'urgent', label: 'Urgente', color: '#EF4444' },
];

export const TASK_CATEGORIES = [
  'Ventas',
  'Marketing',
  'Soporte',
  'Desarrollo',
  'Finanzas',
  'RRHH',
  'Personal',
  'Otro',
] as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────
export function getStatusLabel(status: TaskStatus): string {
  return TASK_STATUSES.find(s => s.value === status)?.label || status;
}

export function getPriorityLabel(priority: TaskPriority): string {
  return TASK_PRIORITIES.find(p => p.value === priority)?.label || priority;
}

export function getPriorityColor(priority: TaskPriority): string {
  return TASK_PRIORITIES.find(p => p.value === priority)?.color || '#94A3B8';
}

export function getStatusIcon(status: TaskStatus): string {
  return TASK_STATUSES.find(s => s.value === status)?.icon || 'ellipse-outline';
}

// ─── Service ──────────────────────────────────────────────────────────────────
class TaskService {
  /**
   * GET /api/tasks — Obtener todas las tareas
   */
  async getAll(params?: {
    status?: TaskStatus;
    priority?: TaskPriority;
    category?: string;
    search?: string;
  }): Promise<Task[]> {
    const query = new URLSearchParams();
    if (params?.status) query.set('status', params.status);
    if (params?.priority) query.set('priority', params.priority);
    if (params?.category) query.set('category', params.category);
    if (params?.search) query.set('search', params.search);
    const qs = query.toString();
    return api.get<Task[]>(`/tasks${qs ? `?${qs}` : ''}`);
  }

  /**
   * GET /api/tasks/:id — Obtener una tarea por ID
   */
  async getById(id: string): Promise<Task> {
    return api.get<Task>(`/tasks/${id}`);
  }

  /**
   * POST /api/tasks — Crear una nueva tarea
   */
  async create(input: CreateTaskInput): Promise<Task> {
    return api.post<Task>('/tasks', input);
  }

  /**
   * PATCH /api/tasks/:id — Actualizar una tarea
   */
  async update(id: string, input: UpdateTaskInput): Promise<Task> {
    return api.patch<Task>(`/tasks/${id}`, input);
  }

  /**
   * DELETE /api/tasks/:id — Eliminar una tarea
   */
  async delete(id: string): Promise<void> {
    await api.delete(`/tasks/${id}`);
  }

  /**
   * PATCH /api/tasks/:id/status — Cambiar estado rápidamente
   */
  async updateStatus(id: string, status: TaskStatus): Promise<Task> {
    return api.patch<Task>(`/tasks/${id}/status`, { status });
  }

  /**
   * GET /api/tasks/stats — Obtener estadísticas de tareas
   */
  async getStats(): Promise<{
    total: number;
    pending: number;
    inProgress: number;
    completed: number;
    overdue: number;
  }> {
    return api.get('/tasks/stats');
  }
}

export const taskService = new TaskService();
