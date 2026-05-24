import { hubsService, type HubModule } from './hubs';
import { taskService, type Task } from './tasks';
import { calendarService, type CalendarEvent } from './calendar';
import { profileService, type UserProfile } from './profile';

// ─── Types ────────────────────────────────────────────────────────────────────
export type SearchCategory = 'modules' | 'tasks' | 'events' | 'settings';

export interface SearchResult {
  id: string;
  title: string;
  description: string;
  category: SearchCategory;
  categoryLabel: string;
  icon: string;
  color: string;
  route: string;
  params?: Record<string, string>;
  matchScore: number;
}

export interface SearchSection {
  title: string;
  results: SearchResult[];
}

// ─── Constants ────────────────────────────────────────────────────────────────
export const CATEGORY_LABELS: Record<SearchCategory, string> = {
  modules: 'Módulos',
  tasks: 'Tareas',
  events: 'Eventos',
  settings: 'Configuración',
};

export const CATEGORY_ICONS: Record<SearchCategory, string> = {
  modules: 'grid',
  tasks: 'checkbox',
  events: 'calendar',
  settings: 'settings',
};

const RECENT_SEARCHES_KEY = 'recent_searches';
const MAX_RECENT = 8;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function normalize(text: string): string {
  return text.toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove accents
    .trim();
}

function scoreMatch(text: string, query: string): number {
  const t = normalize(text);
  const q = normalize(query);

  if (t === q) return 100;           // Exact match
  if (t.startsWith(q)) return 80;    // Starts with
  if (t.includes(q)) return 60;      // Contains
  if (q.split(' ').every(w => t.includes(w))) return 40; // All words

  return 0;
}

// ─── Recent Searches (in-memory + localStorage) ──────────────────────────────
let recentSearches: string[] = [];

export function getRecentSearches(): string[] {
  return recentSearches;
}

export function addRecentSearch(query: string): void {
  recentSearches = [query, ...recentSearches.filter(s => s !== query)].slice(0, MAX_RECENT);
}

export function clearRecentSearches(): void {
  recentSearches = [];
}

// ─── Search Service ───────────────────────────────────────────────────────────
class SearchService {
  /**
   * Busca en todas las fuentes de datos disponibles
   */
  async searchAll(query: string): Promise<SearchSection[]> {
    if (!query.trim() || query.length < 2) return [];
    const q = query.trim();

    const [modules, tasks, events] = await Promise.all([
      this.searchModules(q),
      this.searchTasks(q),
      this.searchEvents(q),
    ]);

    const sections: SearchSection[] = [];

    if (modules.length > 0) {
      sections.push({ title: CATEGORY_LABELS.modules, results: modules });
    }
    if (tasks.length > 0) {
      sections.push({ title: CATEGORY_LABELS.tasks, results: tasks });
    }
    if (events.length > 0) {
      sections.push({ title: CATEGORY_LABELS.events, results: events });
    }

    // Add recent search
    addRecentSearch(q);

    return sections;
  }

  /**
   * Buscar en módulos/hubs
   */
  private searchModules(query: string): SearchResult[] {
    const modules = hubsService.getModules();
    const results: SearchResult[] = [];

    for (const mod of modules) {
      const nameScore = scoreMatch(mod.name, query);
      const catScore = scoreMatch(mod.categoryName, query);
      const descScore = scoreMatch(mod.description, query);
      const maxScore = Math.max(nameScore, catScore, descScore);

      if (maxScore > 0) {
        results.push({
          id: mod.id,
          title: mod.name,
          description: `${mod.categoryName} — ${mod.description}`,
          category: 'modules',
          categoryLabel: CATEGORY_LABELS.modules,
          icon: mod.icon,
          color: mod.color,
          route: mod.hubHref,
          matchScore: maxScore + (nameScore > 0 ? 10 : 0), // Boost name matches
        });
      }
    }

    return results
      .sort((a, b) => b.matchScore - a.matchScore)
      .slice(0, 10);
  }

  /**
   * Buscar en tareas
   */
  private async searchTasks(query: string): Promise<SearchResult[]> {
    try {
      const tasks = await taskService.getAll({ search: query });
      return tasks.slice(0, 5).map(t => ({
        id: t.id,
        title: t.title,
        description: t.description || t.category || 'Sin descripción',
        category: 'tasks' as SearchCategory,
        categoryLabel: CATEGORY_LABELS.tasks,
        icon: 'checkbox-outline',
        color: t.priority === 'urgent' ? '#EF4444' :
               t.priority === 'high' ? '#F59E0B' :
               t.priority === 'medium' ? '#3B82F6' : '#94A3B8',
        route: '/(tabs)/tasks',
        matchScore: 70,
      }));
    } catch {
      return [];
    }
  }

  /**
   * Buscar en eventos
   */
  private async searchEvents(query: string): Promise<SearchResult[]> {
    try {
      const events = await calendarService.getEvents();
      const q = normalize(query);
      const results: SearchResult[] = [];

      for (const ev of events) {
        const titleScore = scoreMatch(ev.title, query);
        const descScore = ev.description ? scoreMatch(ev.description, query) : 0;
        const maxScore = Math.max(titleScore, descScore);

        if (maxScore > 0) {
          const typeConfig = getEventTypeConfig(ev.type);
          results.push({
            id: ev.id,
            title: ev.title,
            description: new Date(ev.date + 'T12:00:00').toLocaleDateString('es-MX', {
              weekday: 'short', day: 'numeric', month: 'short',
            }) + (ev.location ? ` · ${ev.location}` : ''),
            category: 'events',
            categoryLabel: CATEGORY_LABELS.events,
            icon: typeConfig.icon,
            color: typeConfig.color,
            route: '/(tabs)/calendar',
            matchScore: maxScore,
          });
        }
      }

      return results
        .sort((a, b) => b.matchScore - a.matchScore)
        .slice(0, 5);
    } catch {
      return [];
    }
  }
}

// Need to import this for event type config - inline the helper
interface EventTypeConfig {
  value: string;
  label: string;
  icon: string;
  color: string;
}

export function getEventTypeConfig(type: string): EventTypeConfig {
  const configs: Record<string, EventTypeConfig> = {
    meeting: { value: 'meeting', label: 'Reunión', icon: 'people-outline', color: '#8B5CF6' },
    call: { value: 'call', label: 'Llamada', icon: 'call-outline', color: '#3B82F6' },
    task: { value: 'task', label: 'Tarea', icon: 'checkbox-outline', color: '#F59E0B' },
    reminder: { value: 'reminder', label: 'Recordatorio', icon: 'alarm-outline', color: '#10B981' },
    birthday: { value: 'birthday', label: 'Cumpleaños', icon: 'gift-outline', color: '#EC4899' },
    holiday: { value: 'holiday', label: 'Feriado', icon: 'sunny-outline', color: '#EF4444' },
  };
  return configs[type] || { value: 'other', label: 'Otro', icon: 'ellipse-outline', color: '#64748B' };
}

export const searchService = new SearchService();
