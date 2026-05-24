import { crmService } from '../services/crm';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
}));

const mockedGetItem = require('expo-secure-store').getItemAsync as jest.Mock;
const mockedSetItem = require('expo-secure-store').setItemAsync as jest.Mock;

beforeEach(() => { jest.clearAllMocks(); });

describe('crmService.getTimeline', () => {
  it('returns empty array when no data', async () => {
    mockedGetItem.mockResolvedValue(null);
    expect(await crmService.getTimeline()).toEqual([]);
  });
});

describe('crmService.addActivity', () => {
  it('creates activity', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify([]));
    const result = await crmService.addActivity({ type: 'note_added', title: 'Note', description: 'Desc', entityId: 'e1', entityType: 'deal' });
    expect(result.id).toBeDefined();
    expect(mockedSetItem).toHaveBeenCalled();
  });
});

describe('crmService.getSettings', () => {
  it('returns default settings when no data', async () => {
    mockedGetItem.mockResolvedValue(null);
    const settings = await crmService.getSettings();
    expect(settings.defaultFollowUpDays).toBe(7);
  });

  it('handles corrupt JSON gracefully', async () => {
    mockedGetItem.mockResolvedValue('not-json');
    const settings = await crmService.getSettings();
    expect(settings.defaultFollowUpDays).toBe(7);
  });
});


// ─── Extra coverage: CRM methods ───────────────────────────────────────

describe('crmService.getTimeline', () => {
  it('returns activities sorted by timestamp', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify([
      { id: 'a1', type: 'deal_created', title: 'A', description: 'D', entityId: 'e1', entityType: 'deal', timestamp: 200 },
      { id: 'a2', type: 'deal_moved', title: 'B', description: 'D', entityId: 'e1', entityType: 'deal', timestamp: 100 },
    ]));
    const result = await crmService.getTimeline();
    expect(result[0].id).toBe('a1');
  });
});

describe('crmService.getTimelineByDateRange', () => {
  it('filters by date range', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify([
      { id: 'a1', type: 'deal_created', title: 'A', description: 'D', entityId: 'e1', entityType: 'deal', timestamp: 200 },
      { id: 'a2', type: 'deal_moved', title: 'B', description: 'D', entityId: 'e1', entityType: 'deal', timestamp: 100 },
      { id: 'a3', type: 'deal_won', title: 'C', description: 'D', entityId: 'e1', entityType: 'deal', timestamp: 50 },
    ]));
    const result = await crmService.getTimelineByDateRange(60, 250);
    expect(result).toHaveLength(2);
  });
});

describe('crmService.addActivity', () => {
  it('adds activity and persists', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify([]));
    const activity = await crmService.addActivity({
      type: 'note_added', title: 'Note', description: 'Something',
      entityId: 'e1', entityType: 'note',
    });
    expect(activity.id).toBeDefined();
    expect(activity.timestamp).toBeGreaterThan(0);
    expect(mockedSetItem).toHaveBeenCalled();
  });
});

describe('crmService.deleteActivity', () => {
  it('deletes activity by id', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify([
      { id: 'a1', type: 'deal_created', title: 'A', description: 'D', entityId: 'e1', entityType: 'deal', timestamp: 100 },
    ]));
    await crmService.deleteActivity('a1');
    expect(mockedSetItem).toHaveBeenCalled();
  });
});

describe('crmService.getSettings', () => {
  it('returns default settings when no data', async () => {
    mockedGetItem.mockResolvedValue(null);
    const settings = await crmService.getSettings();
    expect(settings.defaultFollowUpDays).toBe(7);
  });
});

describe('crmService.updateSettings', () => {
  it('updates settings partially', async () => {
    mockedGetItem.mockResolvedValue(null);
    const updated = await crmService.updateSettings({ defaultFollowUpDays: 14 });
    expect(updated.defaultFollowUpDays).toBe(14);
    expect(mockedSetItem).toHaveBeenCalled();
  });
});

describe('crmService.cacheInsights', () => {
  it('caches insights', async () => {
    await crmService.cacheInsights({
      totalContacts: 10, totalDeals: 5, totalInteractions: 20,
      conversionRate: 0.5, avgDealValue: 100, topSources: [], activityByDay: [],
    });
    expect(mockedSetItem).toHaveBeenCalled();
  });
});

describe('crmService.getActivitiesByEntity', () => {
  it('filters and sorts activities', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify([
      { id: 'a1', type: 'note_added', title: 'Note', description: 'D', entityId: 'e1', entityType: 'deal', timestamp: 200 },
      { id: 'a2', type: 'deal_moved', title: 'Move', description: 'D', entityId: 'e2', entityType: 'deal', timestamp: 100 },
    ]));
    const result = await crmService.getActivitiesByEntity('e1', 'deal');
    expect(result).toHaveLength(1);
  });
});

describe('crmService.clearTimeline', () => {
  it('clears all activities', async () => {
    await crmService.clearTimeline();
    expect(mockedSetItem).toHaveBeenCalled();
  });
});

describe('crmService.getInsights', () => {
  it('returns default when no data', async () => {
    mockedGetItem.mockResolvedValue(null);
    const insights = await crmService.getInsights();
    expect(insights).toHaveProperty('totalContacts');
  });

  it('parses stored insights', async () => {
    mockedGetItem.mockResolvedValue(JSON.stringify({ totalContacts: 5, totalDeals: 3, totalInteractions: 10, conversionRate: 0.6, avgDealValue: 200, topSources: ['web'], activityByDay: [{ date: '2025-01-01', count: 2 }] }));
    const insights = await crmService.getInsights();
    expect(insights.totalContacts).toBe(5);
  });
});

describe('crmService persist error', () => {
  it('handles SecureStore failure on persist', async () => {
    mockedSetItem.mockRejectedValue(new Error('Storage error'));
    mockedGetItem.mockResolvedValue(JSON.stringify([]));
    await crmService.addActivity({ type: 'note_added', title: 'Note', description: 'Desc', entityId: 'e1', entityType: 'deal' });
    // Should not throw
  });
});
