import { api } from './api';

// ─── Types ────────────────────────────────────────────────────────────────────
export type ProjectStatus = 'active' | 'paused' | 'completed' | 'cancelled';
export type ProjectPriority = 'low' | 'medium' | 'high' | 'critical';

export interface Project {
  id: string;
  name: string;
  description: string;
  status: ProjectStatus;
  priority: ProjectPriority;
  startDate: string;
  endDate: string | null;
  budget: number;
  spent: number;
  progress: number;
  color: string;
  icon: string;
  members: ProjectMember[];
  tasks: ProjectTaskItem[];
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ProjectMember {
  id: string;
  name: string;
  role: 'owner' | 'manager' | 'member' | 'viewer';
  avatar?: string;
}

export interface ProjectTaskItem {
  id: string;
  title: string;
  status: 'todo' | 'in_progress' | 'done';
  assignee?: string;
  dueDate?: string;
}

export interface CreateProjectInput {
  name: string;
  description?: string;
  priority?: ProjectPriority;
  startDate?: string;
  endDate?: string | null;
  budget?: number;
  color?: string;
  icon?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

// Mapa de estados API → local
const STATUS_MAP: Record<string, ProjectStatus> = {
  PLANNING: 'active',
  ACTIVE: 'active',
  IN_PROGRESS: 'active',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  PAUSED: 'paused',
};

const STATUS_REVERSE: Record<ProjectStatus, string> = {
  active: 'ACTIVE',
  paused: 'PAUSED',
  completed: 'COMPLETED',
  cancelled: 'CANCELLED',
};

export const PROJECT_STATUSES: { value: ProjectStatus; label: string; icon: string; color: string }[] = [
  { value: 'active', label: 'Activo', icon: 'play-circle', color: '#10B981' },
  { value: 'paused', label: 'Pausado', icon: 'pause-circle', color: '#F59E0B' },
  { value: 'completed', label: 'Completado', icon: 'checkmark-circle', color: '#3B82F6' },
  { value: 'cancelled', label: 'Cancelado', icon: 'close-circle', color: '#EF4444' },
];

export const PROJECT_PRIORITIES: { value: ProjectPriority; label: string; color: string }[] = [
  { value: 'low', label: 'Baja', color: '#94A3B8' },
  { value: 'medium', label: 'Media', color: '#3B82F6' },
  { value: 'high', label: 'Alta', color: '#F59E0B' },
  { value: 'critical', label: 'Crítica', color: '#EF4444' },
];

export const PROJECT_ICONS = [
  'rocket', 'code-slash', 'brush', 'megaphone', 'business',
  'flask', 'construct', 'analytics', 'globe', 'heart',
  'school', 'cart', 'medical', 'leaf', 'build',
];

export const PROJECT_COLORS = [
  '#2563EB', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6',
  '#EC4899', '#06B6D4', '#F97316', '#64748B', '#84CC16',
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Mapea un proyecto de la API al tipo Project local */
function mapApiProject(apiProject: any): Project {
  const status = STATUS_MAP[apiProject.status?.toUpperCase()] || 'active';
  const milestones = apiProject.milestones || [];

  return {
    id: apiProject.id,
    name: apiProject.name || '',
    description: apiProject.description || '',
    status,
    priority: 'medium', // La API no tiene priority, default
    startDate: apiProject.startDate
      ? new Date(apiProject.startDate).toISOString().split('T')[0]
      : new Date().toISOString().split('T')[0],
    endDate: apiProject.endDate
      ? new Date(apiProject.endDate).toISOString().split('T')[0]
      : null,
    budget: apiProject.budget || 0,
    spent: 0, // La API no tiene spent directamente
    progress: apiProject.progress || 0,
    color: '#2563EB', // Default
    icon: 'rocket', // Default
    members: [], // La API no tiene members
    tasks: milestones.map((m: any) => ({
      id: m.id,
      title: m.name,
      status: m.status === 'COMPLETED' ? 'done' : m.status === 'IN_PROGRESS' ? 'in_progress' : 'todo',
      assignee: undefined,
      dueDate: m.dueDate ? new Date(m.dueDate).toISOString().split('T')[0] : undefined,
    })),
    tags: [],
    createdAt: apiProject.createdAt
      ? new Date(apiProject.createdAt).toISOString()
      : new Date().toISOString(),
    updatedAt: apiProject.updatedAt
      ? new Date(apiProject.updatedAt).toISOString()
      : new Date().toISOString(),
  };
}

// ─── Service ──────────────────────────────────────────────────────────────────
class ProjectService {

  async getAll(params?: { status?: ProjectStatus; search?: string }): Promise<Project[]> {
    try {
      const qParams = new URLSearchParams();
      if (params?.status) qParams.set('status', STATUS_REVERSE[params.status]);
      const query = qParams.toString();
      const endpoint = `/erp/projects${query ? `?${query}` : ''}`;
      const data = await api.get<any[]>(endpoint);
      let projects = (data || []).map(mapApiProject);
      // Filtro local por búsqueda (la API no soporta search)
      if (params?.search) {
        const q = params.search.toLowerCase();
        projects = projects.filter(p =>
          p.name.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q) ||
          p.tags.some(t => t.toLowerCase().includes(q))
        );
      }
      return projects;
    } catch (e) {
      console.error('[ProjectService] Error fetching projects:', e);
      return [];
    }
  }

  async getById(id: string): Promise<Project | null> {
    try {
      const data = await api.get<any>(`/erp/projects/${id}`);
      return data ? mapApiProject(data) : null;
    } catch (e) {
      console.error('[ProjectService] Error fetching project:', e);
      return null;
    }
  }

  async getStats(): Promise<{ total: number; active: number; completed: number; paused: number; cancelled: number; totalBudget: number; totalSpent: number; avgProgress: number }> {
    try {
      const projects = await this.getAll();
      return {
        total: projects.length,
        active: projects.filter(p => p.status === 'active').length,
        completed: projects.filter(p => p.status === 'completed').length,
        paused: projects.filter(p => p.status === 'paused').length,
        cancelled: projects.filter(p => p.status === 'cancelled').length,
        totalBudget: projects.reduce((s, p) => s + p.budget, 0),
        totalSpent: projects.reduce((s, p) => s + p.spent, 0),
        avgProgress: projects.length > 0
          ? Math.round(projects.reduce((s, p) => s + p.progress, 0) / projects.length)
          : 0,
      };
    } catch (e) {
      console.error('[ProjectService] Error fetching stats:', e);
      return { total: 0, active: 0, completed: 0, paused: 0, cancelled: 0, totalBudget: 0, totalSpent: 0, avgProgress: 0 };
    }
  }

  async create(input: CreateProjectInput): Promise<Project> {
    const body: any = {
      name: input.name,
      description: input.description || '',
      budget: input.budget || 0,
      startDate: input.startDate || new Date().toISOString().split('T')[0],
    };
    if (input.endDate) body.endDate = input.endDate;
    if (input.priority) body.priority = input.priority; // Se ignora en API pero lo enviamos

    const result = await api.post<any>('/erp/projects', body);
    return mapApiProject(result);
  }

  async update(id: string, input: Partial<Pick<Project, 'name' | 'description' | 'status' | 'priority' | 'startDate' | 'endDate' | 'budget' | 'spent' | 'progress' | 'color' | 'icon' | 'tags'>>): Promise<Project> {
    const body: any = {};
    if (input.name !== undefined) body.name = input.name;
    if (input.description !== undefined) body.description = input.description;
    if (input.status !== undefined) body.status = STATUS_REVERSE[input.status];
    if (input.startDate !== undefined) body.startDate = input.startDate;
    if (input.endDate !== undefined) body.endDate = input.endDate;
    if (input.budget !== undefined) body.budget = input.budget;

    const result = await api.patch<any>(`/erp/projects/${id}`, body);
    const projectData = result.data || result;
    return mapApiProject(projectData);
  }

  async delete(id: string): Promise<void> {
    await api.delete(`/erp/projects/${id}`);
  }

  async addTask(projectId: string, task: Omit<ProjectTaskItem, 'id'>): Promise<ProjectTaskItem> {
    // La API usa milestones, no tasks directamente
    console.warn('[ProjectService] addTask no implementado vía API');
    return { id: `pt-${Date.now()}`, ...task };
  }

  async updateTask(projectId: string, taskId: string, input: Partial<ProjectTaskItem>): Promise<ProjectTaskItem> {
    console.warn('[ProjectService] updateTask no implementado vía API');
    return { id: taskId, title: '', status: 'todo', ...input };
  }

  async deleteTask(projectId: string, taskId: string): Promise<void> {
    console.warn('[ProjectService] deleteTask no implementado vía API');
  }

  async addMember(projectId: string, member: ProjectMember): Promise<void> {
    console.warn('[ProjectService] addMember no implementado vía API');
  }

  async removeMember(projectId: string, memberId: string): Promise<void> {
    console.warn('[ProjectService] removeMember no implementado vía API');
  }

  async clearAll(): Promise<void> {
    console.warn('[ProjectService] clearAll no soportado vía API');
  }
}

export const projectService = new ProjectService();
