import { calendarService } from '../services/calendar';
import { api } from '../services/api';

jest.mock('../services/api', () => ({
  api: {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
  },
}));

const mockGet = api.get as jest.Mock;
const mockPost = api.post as jest.Mock;
const mockPatch = api.patch as jest.Mock;
const mockDelete = api.delete as jest.Mock;

beforeEach(() => { jest.clearAllMocks(); });

describe('calendarService.getEvents', () => {
  it('calls api.get with params', async () => {
    mockGet.mockResolvedValue([]);
    await calendarService.getEvents({ dateFrom: '2026-01-01', dateTo: '2026-01-31' });
    expect(mockGet).toHaveBeenCalled();
  });

  it('calls api.get with type filter', async () => {
    mockGet.mockResolvedValue([]);
    await calendarService.getEvents({ type: 'meeting' });
    expect(mockGet).toHaveBeenCalled();
  });

  it('calls api.get without params (empty qs)', async () => {
    mockGet.mockResolvedValue([]);
    await calendarService.getEvents();
    expect(mockGet).toHaveBeenCalledWith('/events');
  });
});

describe('calendarService.getById', () => {
  it('calls api.get with id', async () => {
    mockGet.mockResolvedValue({ id: 'evt-1' });
    const result = await calendarService.getById('evt-1');
    expect(result).toHaveProperty('id');
  });
});

describe('calendarService.create', () => {
  it('calls api.post', async () => {
    mockPost.mockResolvedValue({ id: 'new-1' });
    await calendarService.create({ title: 'Meeting', date: '2026-06-01' });
    expect(mockPost).toHaveBeenCalled();
  });
});

describe('calendarService.update', () => {
  it('calls api.patch', async () => {
    mockPatch.mockResolvedValue({});
    await calendarService.update('evt-1', { title: 'Updated' });
    expect(mockPatch).toHaveBeenCalled();
  });
});

describe('calendarService.delete', () => {
  it('calls api.delete', async () => {
    mockDelete.mockResolvedValue(undefined);
    await calendarService.delete('evt-1');
    expect(mockDelete).toHaveBeenCalled();
  });
});


// ─── Extra coverage: calendar helpers ───────────────────────────────────

import {
  getEventTypeConfig, getEventTypeLabel, getEventTypeIcon, getEventTypeColor,
  getDaysInMonth, getFirstDayOfMonth, formatDateKey, formatTime,
  getEventsForDate, isToday, isPastDate,
} from '../services/calendar';

describe('calendar helpers', () => {
  it('getEventTypeConfig returns config', () => {
    expect(getEventTypeConfig('meeting').label).toBe('Reunión');
    expect(getEventTypeConfig('unknown' as any).label).toBe('Otro');
  });

  it('getEventTypeLabel returns label', () => {
    expect(getEventTypeLabel('call')).toBe('Llamada');
  });

  it('getEventTypeIcon returns icon', () => {
    expect(getEventTypeIcon('task')).toBe('checkbox-outline');
  });

  it('getEventTypeColor returns color', () => {
    expect(getEventTypeColor('holiday')).toBe('#EF4444');
  });

  it('formatTime handles midnight', () => {
    expect(formatTime('00:00')).toBe('12:00 AM');
    expect(formatTime('12:00')).toBe('12:00 PM');
  });

  it('isToday returns false for past date', () => {
    expect(isToday('2000-01-01')).toBe(false);
  });

  it('isPastDate returns true for older date', () => {
    expect(isPastDate('2000-06-15')).toBe(true);
  });

  it('isPastDate returns false when is today', () => {
    const today = formatDateKey(new Date());
    expect(isPastDate(today)).toBe(false);
  });

  it('getDaysInMonth returns correct days', () => {
    expect(getDaysInMonth(2026, 0)).toBe(31); // January
    expect(getDaysInMonth(2026, 1)).toBe(28); // February (2026 not leap)
  });

  it('getFirstDayOfMonth returns day index', () => {
    const day = getFirstDayOfMonth(2026, 0);
    expect(day).toBeGreaterThanOrEqual(0);
    expect(day).toBeLessThanOrEqual(6);
  });

  it('formatDateKey formats date', () => {
    const result = formatDateKey(new Date(2026, 0, 15));
    expect(result).toBe('2026-01-15');
  });

  it('formatTime formats HH:mm', () => {
    expect(formatTime('14:30')).toBe('2:30 PM');
    expect(formatTime('09:05')).toBe('9:05 AM');
    expect(formatTime('')).toBe('');
  });

  it('getEventsForDate filters events', () => {
    const events = [
      { id: 'e1', title: 'Event 1', date: '2026-01-15' } as any,
      { id: 'e2', title: 'Event 2', date: '2026-01-16' } as any,
    ];
    const result = getEventsForDate(events, '2026-01-15');
    expect(result).toHaveLength(1);
  });

  it('isToday checks against today', () => {
    const today = formatDateKey(new Date());
    expect(isToday(today)).toBe(true);
    expect(isToday('2000-01-01')).toBe(false);
  });

  it('isPastDate checks if date is past', () => {
    expect(isPastDate('2000-01-01')).toBe(true);
    expect(isPastDate('2099-01-01')).toBe(false);
  });
});

describe('calendarService.getDayStats', () => {
  it('calls api.get with date', async () => {
    mockGet.mockResolvedValue({ count: 3, byType: {} });
    const result = await calendarService.getDayStats('2026-06-15');
    expect(result).toHaveProperty('count', 3);
  });
});
