import * as SecureStore from 'expo-secure-store';

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
const STORAGE_KEY = 'VOLKERN_PROJECTS';

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
function generateId(): string {
  return `proj-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// ─── Service ──────────────────────────────────────────────────────────────────
class ProjectService {
  private cache: Project[] | null = null;

  private async load(): Promise<Project[]> {
    if (this.cache) return this.cache;
    try {
      const raw = await SecureStore.getItemAsync(STORAGE_KEY);
      if (raw) {
        this.cache = JSON.parse(raw);
        return this.cache!;
      }
    } catch { /* ignore */ }
    this.cache = this.getSeedData();
    await this.persist();
    return this.cache;
  }

  private async persist(): Promise<void> {
    if (!this.cache) return;
    await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(this.cache));
  }

  private getSeedData(): Project[] {
    const now = new Date().toISOString();
    return [
      {
        id: 'p1', name: 'Rediseño Web', description: 'Rediseño completo del sitio corporativo con nuevo branding',
        status: 'active', priority: 'high', startDate: '2026-04-01', endDate: '2026-06-30',
        budget: 150000, spent: 85000, progress: 55, color: '#2563EB', icon: 'code-slash',
        members: [
          { id: 'u1', name: 'Ana García', role: 'owner' },
          { id: 'u2', name: 'Carlos López', role: 'manager' },
          { id: 'u3', name: 'María Pérez', role: 'member' },
        ],
        tasks: [
          { id: 't1', title: 'Definir paleta de colores', status: 'done', assignee: 'Ana García' },
          { id: 't2', title: 'Maquetar homepage', status: 'in_progress', assignee: 'Carlos López' },
          { id: 't3', title: 'Desarrollar componentes', status: 'todo' },
        ],
        tags: ['web', 'branding', 'diseño'],
        createdAt: now, updatedAt: now,
      },
      {
        id: 'p2', name: 'App Móvil', description: 'Desarrollo de la aplicación móvil para clientes',
        status: 'active', priority: 'critical', startDate: '2026-02-01', endDate: '2026-09-30',
        budget: 500000, spent: 320000, progress: 40, color: '#10B981', icon: 'phone-portrait',
        members: [
          { id: 'u1', name: 'Ana García', role: 'owner' },
          { id: 'u4', name: 'Pedro Ramírez', role: 'manager' },
        ],
        tasks: [
          { id: 't4', title: 'Diseño de UI/UX', status: 'done', assignee: 'Pedro Ramírez' },
          { id: 't5', title: 'API Rest', status: 'in_progress', assignee: 'Ana García' },
          { id: 't6', title: 'Pantalla principal', status: 'todo' },
          { id: 't7', title: 'Integración de pagos', status: 'todo' },
        ],
        tags: ['mobile', 'react-native', 'app'],
        createdAt: now, updatedAt: now,
      },
      {
        id: 'p3', name: 'Campaña Marketing', description: 'Campaña de lanzamiento del nuevo producto',
        status: 'active', priority: 'high', startDate: '2026-05-01', endDate: '2026-07-15',
        budget: 80000, spent: 35000, progress: 70, color: '#EC4899', icon: 'megaphone',
        members: [
          { id: 'u2', name: 'Carlos López', role: 'owner' },
          { id: 'u5', name: 'Laura Sánchez', role: 'member' },
        ],
        tasks: [
          { id: 't8', title: 'Crear contenido redes', status: 'done', assignee: 'Laura Sánchez' },
          { id: 't9', title: 'Email marketing', status: 'done', assignee: 'Carlos López' },
          { id: 't10', title: 'Lanzamiento anuncios', status: 'in_progress' },
        ],
        tags: ['marketing', 'campaña', 'redes'],
        createdAt: now, updatedAt: now,
      },
      {
        id: 'p4', name: 'Migración Cloud', description: 'Migración de infraestructura a la nube',
        status: 'paused', priority: 'medium', startDate: '2026-03-01', endDate: '2026-08-31',
        budget: 200000, spent: 90000, progress: 30, color: '#F59E0B', icon: 'cloud-upload',
        members: [
          { id: 'u4', name: 'Pedro Ramírez', role: 'manager' },
        ],
        tasks: [
          { id: 't11', title: 'Auditoría actual', status: 'done' },
          { id: 't12', title: 'Plan de migración', status: 'in_progress', assignee: 'Pedro Ramírez' },
        ],
        tags: ['cloud', 'infra', 'migración'],
        createdAt: now, updatedAt: now,
      },
      {
        id: 'p5', name: 'Capacitación Equipo', description: 'Programa de capacitación en nuevas herramientas',
        status: 'completed', priority: 'low', startDate: '2026-01-15', endDate: '2026-04-30',
        budget: 30000, spent: 28000, progress: 100, color: '#8B5CF6', icon: 'school',
        members: [
          { id: 'u1', name: 'Ana García', role: 'owner' },
          { id: 'u5', name: 'Laura Sánchez', role: 'member' },
        ],
        tasks: [
          { id: 't13', title: 'Seleccionar cursos', status: 'done' },
          { id: 't14', title: 'Realizar capacitaciones', status: 'done' },
          { id: 't15', title: 'Evaluar resultados', status: 'done' },
        ],
        tags: ['capacitación', 'equipo', 'formación'],
        createdAt: now, updatedAt: now,
      },
    ];
  }

  async getAll(params?: { status?: ProjectStatus; search?: string }): Promise<Project[]> {
    let projects = await this.load();
    if (params?.status) {
      projects = projects.filter(p => p.status === params.status);
    }
    if (params?.search) {
      const q = params.search.toLowerCase();
      projects = projects.filter(p => p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q) || p.tags.some(t => t.toLowerCase().includes(q)));
    }
    return projects.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }

  async getById(id: string): Promise<Project | null> {
    const projects = await this.load();
    return projects.find(p => p.id === id) || null;
  }

  async getStats(): Promise<{ total: number; active: number; completed: number; paused: number; cancelled: number; totalBudget: number; totalSpent: number; avgProgress: number }> {
    const projects = await this.load();
    return {
      total: projects.length,
      active: projects.filter(p => p.status === 'active').length,
      completed: projects.filter(p => p.status === 'completed').length,
      paused: projects.filter(p => p.status === 'paused').length,
      cancelled: projects.filter(p => p.status === 'cancelled').length,
      totalBudget: projects.reduce((s, p) => s + p.budget, 0),
      totalSpent: projects.reduce((s, p) => s + p.spent, 0),
      avgProgress: projects.length > 0 ? Math.round(projects.reduce((s, p) => s + p.progress, 0) / projects.length) : 0,
    };
  }

  async create(input: CreateProjectInput): Promise<Project> {
    const projects = await this.load();
    const now = new Date().toISOString();
    const project: Project = {
      id: generateId(),
      name: input.name,
      description: input.description || '',
      status: 'active',
      priority: input.priority || 'medium',
      startDate: input.startDate || new Date().toISOString().split('T')[0],
      endDate: input.endDate || null,
      budget: input.budget || 0,
      spent: 0,
      progress: 0,
      color: input.color || '#2563EB',
      icon: input.icon || 'rocket',
      members: [],
      tasks: [],
      tags: [],
      createdAt: now,
      updatedAt: now,
    };
    projects.push(project);
    this.cache = projects;
    await this.persist();
    return project;
  }

  async update(id: string, input: Partial<Pick<Project, 'name' | 'description' | 'status' | 'priority' | 'startDate' | 'endDate' | 'budget' | 'spent' | 'progress' | 'color' | 'icon' | 'tags'>>): Promise<Project> {
    const projects = await this.load();
    const idx = projects.findIndex(p => p.id === id);
    if (idx === -1) throw new Error('Proyecto no encontrado');
    projects[idx] = { ...projects[idx], ...input, updatedAt: new Date().toISOString() };
    this.cache = projects;
    await this.persist();
    return projects[idx];
  }

  async delete(id: string): Promise<void> {
    const projects = await this.load();
    const idx = projects.findIndex(p => p.id === id);
    if (idx === -1) throw new Error('Proyecto no encontrado');
    projects.splice(idx, 1);
    this.cache = projects;
    await this.persist();
  }

  async addTask(projectId: string, task: Omit<ProjectTaskItem, 'id'>): Promise<ProjectTaskItem> {
    const projects = await this.load();
    const project = projects.find(p => p.id === projectId);
    if (!project) throw new Error('Proyecto no encontrado');
    const newTask: ProjectTaskItem = { id: `pt-${Date.now()}`, ...task };
    project.tasks.push(newTask);
    project.updatedAt = new Date().toISOString();
    this.cache = projects;
    await this.persist();
    return newTask;
  }

  async updateTask(projectId: string, taskId: string, input: Partial<ProjectTaskItem>): Promise<ProjectTaskItem> {
    const projects = await this.load();
    const project = projects.find(p => p.id === projectId);
    if (!project) throw new Error('Proyecto no encontrado');
    const tIdx = project.tasks.findIndex(t => t.id === taskId);
    if (tIdx === -1) throw new Error('Tarea no encontrada');
    project.tasks[tIdx] = { ...project.tasks[tIdx], ...input };
    project.updatedAt = new Date().toISOString();
    this.cache = projects;
    await this.persist();
    return project.tasks[tIdx];
  }

  async deleteTask(projectId: string, taskId: string): Promise<void> {
    const projects = await this.load();
    const project = projects.find(p => p.id === projectId);
    if (!project) throw new Error('Proyecto no encontrado');
    project.tasks = project.tasks.filter(t => t.id !== taskId);
    project.updatedAt = new Date().toISOString();
    this.cache = projects;
    await this.persist();
  }

  async addMember(projectId: string, member: ProjectMember): Promise<void> {
    const projects = await this.load();
    const project = projects.find(p => p.id === projectId);
    if (!project) throw new Error('Proyecto no encontrado');
    if (project.members.some(m => m.id === member.id)) return;
    project.members.push(member);
    project.updatedAt = new Date().toISOString();
    this.cache = projects;
    await this.persist();
  }

  async removeMember(projectId: string, memberId: string): Promise<void> {
    const projects = await this.load();
    const project = projects.find(p => p.id === projectId);
    if (!project) throw new Error('Proyecto no encontrado');
    project.members = project.members.filter(m => m.id !== memberId);
    project.updatedAt = new Date().toISOString();
    this.cache = projects;
    await this.persist();
  }

  async clearAll(): Promise<void> {
    this.cache = [];
    await SecureStore.deleteItemAsync(STORAGE_KEY);
  }
}

export const projectService = new ProjectService();
