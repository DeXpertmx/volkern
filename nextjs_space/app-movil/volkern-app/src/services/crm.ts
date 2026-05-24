import * as SecureStore from 'expo-secure-store';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ActivityType = 'deal_created' | 'deal_moved' | 'deal_won' | 'deal_lost' | 'note_added' | 'interaction' | 'lead_created' | 'lead_converted';

export interface TimelineActivity {
  id: string;
  type: ActivityType;
  title: string;
  description: string;
  entityId: string;
  entityType: 'deal' | 'lead' | 'contact' | 'note';
  timestamp: number;
  metadata?: Record<string, string>;
}

export interface DealSummary {
  total: number;
  won: number;
  lost: number;
  active: number;
  totalValue: number;
  wonValue: number;
  weightedValue: number;
}

export interface CustomerInsight {
  totalContacts: number;
  totalDeals: number;
  totalInteractions: number;
  conversionRate: number;
  avgDealValue: number;
  topSources: { source: string; count: number }[];
  activityByDay: { date: string; count: number }[];
}

export interface CRMSettings {
  defaultFollowUpDays: number;
  autoReminders: boolean;
  dealStageColors: Record<string, string>;
  enableActivityNotifications: boolean;
}

// ─── Keys ─────────────────────────────────────────────────────────────────────

const TIMELINE_KEY = 'volkern_crm_timeline';
const INSIGHTS_KEY = 'volkern_crm_insights_cache';
const SETTINGS_KEY = 'volkern_crm_settings';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateId(): string {
  return `crm_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

// ─── Service ──────────────────────────────────────────────────────────────────

class CRMService {
  // ── Timeline ──────────────────────────────────────────────────────────

  async getAllActivities(): Promise<TimelineActivity[]> {
    try {
      const raw = await SecureStore.getItemAsync(TIMELINE_KEY);
      if (raw) return JSON.parse(raw) as TimelineActivity[];
    } catch { /* ignore */ }
    return [];
  }

  async getTimeline(limit = 50): Promise<TimelineActivity[]> {
    const all = await this.getAllActivities();
    return all.sort((a, b) => b.timestamp - a.timestamp).slice(0, limit);
  }

  async getTimelineByDateRange(start: number, end: number): Promise<TimelineActivity[]> {
    const all = await this.getAllActivities();
    return all.filter(a => a.timestamp >= start && a.timestamp <= end)
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  async getActivitiesByEntity(entityId: string, entityType: string): Promise<TimelineActivity[]> {
    const all = await this.getAllActivities();
    return all.filter(a => a.entityId === entityId && a.entityType === entityType)
      .sort((a, b) => b.timestamp - a.timestamp);
  }

  async addActivity(data: Omit<TimelineActivity, 'id' | 'timestamp'>): Promise<TimelineActivity> {
    const all = await this.getAllActivities();
    const activity: TimelineActivity = {
      ...data,
      id: generateId(),
      timestamp: Date.now(),
    };
    all.push(activity);
    // Keep max 500 entries
    const trimmed = all.sort((a, b) => b.timestamp - a.timestamp).slice(0, 500);
    await this.persist(trimmed);
    return activity;
  }

  async deleteActivity(id: string): Promise<void> {
    const all = await this.getAllActivities();
    await this.persist(all.filter(a => a.id !== id));
  }

  async clearTimeline(): Promise<void> {
    await this.persist([]);
  }

  // ── Insights ──────────────────────────────────────────────────────────

  async getInsights(): Promise<CustomerInsight> {
    try {
      const raw = await SecureStore.getItemAsync(INSIGHTS_KEY);
      if (raw) return JSON.parse(raw) as CustomerInsight;
    } catch { /* ignore */ }
    return {
      totalContacts: 0, totalDeals: 0, totalInteractions: 0,
      conversionRate: 0, avgDealValue: 0, topSources: [],
      activityByDay: [],
    };
  }

  async cacheInsights(insights: CustomerInsight): Promise<void> {
    try {
      await SecureStore.setItemAsync(INSIGHTS_KEY, JSON.stringify(insights));
    } catch { /* ignore */ }
  }

  // ── Settings ──────────────────────────────────────────────────────────

  async getSettings(): Promise<CRMSettings> {
    try {
      const raw = await SecureStore.getItemAsync(SETTINGS_KEY);
      if (raw) return JSON.parse(raw) as CRMSettings;
    } catch { /* ignore */ }
    return {
      defaultFollowUpDays: 7,
      autoReminders: true,
      dealStageColors: {
        lead: '#6B7280', qualified: '#3B82F6', proposal: '#F59E0B',
        negotiation: '#8B5CF6', closed_won: '#10B981', closed_lost: '#EF4444',
      },
      enableActivityNotifications: true,
    };
  }

  async updateSettings(data: Partial<CRMSettings>): Promise<CRMSettings> {
    const current = await this.getSettings();
    const updated = { ...current, ...data };
    try {
      await SecureStore.setItemAsync(SETTINGS_KEY, JSON.stringify(updated));
    } catch { /* ignore */ }
    return updated;
  }

  // ── Private ───────────────────────────────────────────────────────────

  private async persist(items: TimelineActivity[]): Promise<void> {
    try {
      await SecureStore.setItemAsync(TIMELINE_KEY, JSON.stringify(items));
    } catch {
      console.error('[CRMService] Error saving timeline');
    }
  }
}

export const crmService = new CRMService();
