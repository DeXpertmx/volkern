import { api } from './api';

// ─── Types ────────────────────────────────────────────────────────────────────
export type EventType = 'meeting' | 'call' | 'task' | 'reminder' | 'birthday' | 'holiday' | 'other';

export interface CalendarEvent {
  id: string;
  title: string;
  description: string;
  type: EventType;
  date: string;       // ISO date YYYY-MM-DD
  startTime: string;  // HH:mm
  endTime: string;    // HH:mm
  allDay: boolean;
  location: string | null;
  participants: { id: string; name: string }[];
  leadId?: string;
  leadName?: string;
  relatedTaskId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateEventInput {
  title: string;
  description?: string;
  type?: EventType;
  date: string;
  startTime?: string;
  endTime?: string;
  allDay?: boolean;
  location?: string;
  participants?: { id: string; name: string }[];
  leadId?: string;
}

export interface UpdateEventInput {
  title?: string;
  description?: string;
  type?: EventType;
  date?: string;
  startTime?: string;
  endTime?: string;
  allDay?: boolean;
  location?: string | null;
  participants?: { id: string; name: string }[];
}

// ─── Constants ────────────────────────────────────────────────────────────────
export const EVENT_TYPES: { value: EventType; label: string; icon: string; color: string }[] = [
  { value: 'meeting', label: 'Reunión', icon: 'people-outline', color: '#8B5CF6' },
  { value: 'call', label: 'Llamada', icon: 'call-outline', color: '#3B82F6' },
  { value: 'task', label: 'Tarea', icon: 'checkbox-outline', color: '#F59E0B' },
  { value: 'reminder', label: 'Recordatorio', icon: 'alarm-outline', color: '#10B981' },
  { value: 'birthday', label: 'Cumpleaños', icon: 'gift-outline', color: '#EC4899' },
  { value: 'holiday', label: 'Feriado', icon: 'sunny-outline', color: '#EF4444' },
  { value: 'other', label: 'Otro', icon: 'ellipse-outline', color: '#64748B' },
];

export const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

export const DAY_NAMES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

// ─── Helpers ──────────────────────────────────────────────────────────────────
export function getEventTypeConfig(type: EventType) {
  return EVENT_TYPES.find(t => t.value === type) || EVENT_TYPES[6];
}

export function getEventTypeLabel(type: EventType): string {
  return getEventTypeConfig(type).label;
}

export function getEventTypeIcon(type: EventType): string {
  return getEventTypeConfig(type).icon;
}

export function getEventTypeColor(type: EventType): string {
  return getEventTypeConfig(type).color;
}

/** Get days in a given month */
export function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

/** Get the day-of-week (0=Sun) for the first day of the month */
export function getFirstDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

/** Format a Date as YYYY-MM-DD */
export function formatDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Format time from HH:mm to friendly format */
export function formatTime(time: string): string {
  if (!time) return '';
  const [h, m] = time.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 || 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${ampm}`;
}

/** Get events for a specific date */
export function getEventsForDate(events: CalendarEvent[], dateKey: string): CalendarEvent[] {
  return events.filter(e => e.date === dateKey);
}

/** Check if a date is today */
export function isToday(dateKey: string): boolean {
  return dateKey === formatDateKey(new Date());
}

/** Check if a date is in the past (not today) */
export function isPastDate(dateKey: string): boolean {
  if (isToday(dateKey)) return false;
  return dateKey < formatDateKey(new Date());
}

// ─── Service ──────────────────────────────────────────────────────────────────
class CalendarService {
  /**
   * GET /api/events — Obtener eventos en un rango de fechas
   */
  async getEvents(params?: {
    dateFrom?: string;
    dateTo?: string;
    type?: EventType;
  }): Promise<CalendarEvent[]> {
    const query = new URLSearchParams();
    if (params?.dateFrom) query.set('dateFrom', params.dateFrom);
    if (params?.dateTo) query.set('dateTo', params.dateTo);
    if (params?.type) query.set('type', params.type);
    const qs = query.toString();
    return api.get<CalendarEvent[]>(`/events${qs ? `?${qs}` : ''}`);
  }

  /**
   * GET /api/events/:id — Obtener un evento por ID
   */
  async getById(id: string): Promise<CalendarEvent> {
    return api.get<CalendarEvent>(`/events/${id}`);
  }

  /**
   * POST /api/events — Crear un nuevo evento
   */
  async create(input: CreateEventInput): Promise<CalendarEvent> {
    return api.post<CalendarEvent>('/events', input);
  }

  /**
   * PATCH /api/events/:id — Actualizar un evento
   */
  async update(id: string, input: UpdateEventInput): Promise<CalendarEvent> {
    return api.patch<CalendarEvent>(`/events/${id}`, input);
  }

  /**
   * DELETE /api/events/:id — Eliminar un evento
   */
  async delete(id: string): Promise<void> {
    await api.delete(`/events/${id}`);
  }

  /**
   * GET /api/events/stats?date=YYYY-MM-DD — Obtener stats del día
   */
  async getDayStats(date: string): Promise<{
    count: number;
    byType: Record<string, number>;
  }> {
    return api.get(`/events/stats?date=${date}`);
  }
}

export const calendarService = new CalendarService();
