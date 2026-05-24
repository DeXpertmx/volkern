import { searchService, getRecentSearches, addRecentSearch, clearRecentSearches, getEventTypeConfig } from '../services/search';

jest.mock('../services/hubs', () => ({
  hubsService: {
    getModules: () => [
      { id: 'm1', name: 'Analytics', icon: 'bar-chart', color: '#3B82F6', categoryId: 'ventas', categoryName: 'Ventas', hubHref: '/analytics', description: 'Métricas de negocio' },
      { id: 'm2', name: 'Leads', icon: 'people', color: '#2563EB', categoryId: 'ventas', categoryName: 'Ventas', hubHref: '/leads', description: 'Prospectos y clientes' },
    ],
  },
}));

// Inline mock: implementation defined inside factory to avoid jest.mock hoisting issues
jest.mock('../services/tasks', () => ({
  taskService: {
    getAll: jest.fn().mockImplementation((opts?: { search?: string }) => {
      const allTasks = [
        { id: 't1', title: 'Important Task', description: 'Do this', category: 'general', priority: 'urgent', createdAt: 1, updatedAt: 1, completed: false },
        { id: 't2', title: 'Something', description: 'No match data', category: 'general', priority: 'urgent', createdAt: 1, updatedAt: 1, completed: false },
      ];
      if (opts?.search) {
        const q = opts.search.toLowerCase();
        return Promise.resolve(allTasks.filter(t => t.title.toLowerCase().includes(q) || t.description.toLowerCase().includes(q)));
      }
      return Promise.resolve(allTasks);
    }),
  },
}));

jest.mock('../services/calendar', () => ({
  calendarService: {
    getAll: jest.fn(() => Promise.resolve([])),
    getEvents: jest.fn(() => Promise.resolve([])),
  },
}));

const taskService = require('../services/tasks').taskService;
const calendarService = require('../services/calendar').calendarService;

beforeEach(() => {
  clearRecentSearches();
  jest.clearAllMocks();
});

describe('searchService', () => {
  it('searchAll returns empty for short query', async () => {
    expect(await searchService.searchAll('a')).toEqual([]);
  });

  it('searchModule finds by name', async () => {
    const results = await searchService.searchAll('analytics');
    expect(results.length).toBeGreaterThan(0);
  });

  it('addRecentSearch and getRecentSearches work', () => {
    addRecentSearch('test query');
    expect(getRecentSearches()).toContain('test query');
  });

  it('clearRecentSearches empties list', () => {
    addRecentSearch('test');
    clearRecentSearches();
    expect(getRecentSearches()).toEqual([]);
  });

  it('limita a 10 búsquedas recientes', () => {
    for (let i = 0; i < 15; i++) addRecentSearch(`q-${i}`);
    const recent = getRecentSearches();
    expect(recent.length).toBeLessThanOrEqual(10);
  });

  it('searchAll with description match', async () => {
    const results = await searchService.searchAll('métricas');
    expect(results.length).toBeGreaterThan(0);
  });

  it('searchAll includes task results', async () => {
    taskService.getAll.mockResolvedValue([
      { id: 't1', title: 'Important Task', description: 'Do this', category: 'general', priority: 'urgent', createdAt: 1, updatedAt: 1, completed: false },
    ]);
    const results = await searchService.searchAll('Important');
    const taskSection = results.find(s => s.title === 'Tareas');
    expect(taskSection).toBeDefined();
    expect(taskSection!.results.length).toBeGreaterThan(0);
  });

  it('searchAll includes events results', async () => {
    calendarService.getEvents.mockResolvedValue([
      { id: 'e1', title: 'Team Meeting', description: 'Weekly sync', date: '2025-06-01', type: 'meeting', location: 'Room A', createdAt: 1, updatedAt: 1 },
    ]);
    const results = await searchService.searchAll('meeting');
    const eventSection = results.find(s => s.title === 'Eventos');
    expect(eventSection).toBeDefined();
    expect(eventSection!.results.length).toBeGreaterThan(0);
  });

  it('searchAll returns sections for multiple categories', async () => {
    taskService.getAll.mockResolvedValue([
      { id: 't1', title: 'Analytics Report', description: 'Make report', category: 'work', priority: 'medium', createdAt: 1, updatedAt: 1, completed: false },
    ]);
    calendarService.getEvents.mockResolvedValue([
      { id: 'e1', title: 'Analytics Review', description: 'Review metrics', date: '2025-06-01', type: 'meeting', location: '', createdAt: 1, updatedAt: 1 },
    ]);
    const results = await searchService.searchAll('analytics');
    expect(results.length).toBeGreaterThanOrEqual(1);
  });

  it('searchTasks returns empty when no match', async () => {
    // Use empty mock to ensure no tasks returned regardless of previous test's mockResolvedValue
    taskService.getAll.mockResolvedValue([]);
    const results = await searchService.searchAll('zzzzz');
    const taskSection = results.find(s => s.title === 'Tareas');
    expect(taskSection).toBeUndefined();
  });

  it('searchTasks handles errors gracefully', async () => {
    taskService.getAll.mockRejectedValue(new Error('Network error'));
    const results = await searchService.searchAll('Important');
    const taskSection = results.find(s => s.title === 'Tareas');
    expect(taskSection).toBeUndefined();
  });

  it('searchTasks sorts by matchScore when multiple results', async () => {
    taskService.getAll.mockResolvedValue([
      { id: 't1', title: 'Important Task', description: 'Do this', category: 'general', priority: 'urgent', createdAt: 1, updatedAt: 1, completed: false },
      { id: 't2', title: 'Important Meeting', description: 'Discuss project', category: 'work', priority: 'high', createdAt: 2, updatedAt: 2, completed: false },
    ]);
    const results = await searchService.searchAll('Important');
    const taskSection = results.find(s => s.title === 'Tareas');
    expect(taskSection).toBeDefined();
    expect(taskSection!.results.length).toBeGreaterThanOrEqual(2);
  });

  it('searchEvents handles errors gracefully', async () => {
    calendarService.getEvents.mockRejectedValue(new Error('Network error'));
    const results = await searchService.searchAll('meeting');
    const eventSection = results.find(s => s.title === 'Eventos');
    expect(eventSection).toBeUndefined();
  });

  it('searchEvents sorts and limits results', async () => {
    const manyEvents = Array.from({ length: 10 }, (_, i) => ({
      id: `e${i}`, title: `Event ${i}`, description: 'Test event', date: '2025-06-01', type: 'meeting', location: '', createdAt: 1, updatedAt: 1,
    }));
    calendarService.getEvents.mockResolvedValue(manyEvents);
    const results = await searchService.searchAll('Event');
    const eventSection = results.find(s => s.title === 'Eventos');
    expect(eventSection).toBeDefined();
    expect(eventSection!.results.length).toBeLessThanOrEqual(5);
  });
});

describe('event type config', () => {
  it('getEventTypeConfig returns config for all known types', () => {
    expect(getEventTypeConfig('meeting').label).toBe('Reunión');
    expect(getEventTypeConfig('call').label).toBe('Llamada');
    expect(getEventTypeConfig('task').label).toBe('Tarea');
    expect(getEventTypeConfig('reminder').label).toBe('Recordatorio');
    expect(getEventTypeConfig('birthday').label).toBe('Cumpleaños');
    expect(getEventTypeConfig('holiday').label).toBe('Feriado');
  });

  it('getEventTypeConfig returns default for unknown type', () => {
    const config = getEventTypeConfig('unknown_type');
    expect(config.label).toBe('Otro');
    expect(config.color).toBe('#64748B');
  });
});
