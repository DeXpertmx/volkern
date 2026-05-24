import { getData, saveData } from './secure-storage';

const STORAGE_KEY = 'volkern_audit';

// ─── Types ────────────────────────────────────────────────────────────────────
export type AuditEventType = 'user_action' | 'system_action' | 'security_event';

export interface AuditEvent {
  id: string;
  type: AuditEventType;
  action: string;
  userId: string;
  userName: string;
  details: string;
  ipAddress: string;
  metadata: Record<string, string>;
  timestamp: string;
}

export interface AuditFilter {
  type?: AuditEventType | 'all';
  userId?: string;
  search?: string;
  startDate?: string;
  endDate?: string;
}

// ─── Service ──────────────────────────────────────────────────────────────────
function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export const auditService = {
  async getAll(filter?: AuditFilter): Promise<AuditEvent[]> {
    const events = await getData<AuditEvent[]>(STORAGE_KEY);
    if (!events) return [];

    let filtered = [...events];

    if (filter) {
      if (filter.type && filter.type !== 'all') {
        filtered = filtered.filter(e => e.type === filter.type);
      }
      if (filter.userId) {
        filtered = filtered.filter(e => e.userId === filter.userId);
      }
      if (filter.search) {
        const q = filter.search.toLowerCase();
        filtered = filtered.filter(e =>
          e.action.toLowerCase().includes(q) ||
          e.userName.toLowerCase().includes(q) ||
          e.details.toLowerCase().includes(q)
        );
      }
      if (filter.startDate) {
        filtered = filtered.filter(e => e.timestamp >= filter.startDate!);
      }
      if (filter.endDate) {
        filtered = filtered.filter(e => e.timestamp <= filter.endDate!);
      }
    }

    return filtered.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  },

  async log(event: Omit<AuditEvent, 'id' | 'timestamp'>): Promise<AuditEvent> {
    const events = await getData<AuditEvent[]>(STORAGE_KEY) || [];
    const item: AuditEvent = {
      ...event,
      id: generateId(),
      timestamp: new Date().toISOString(),
    };
    events.unshift(item);
    // Keep max 500 events
    const trimmed = events.slice(0, 500);
    await saveData(STORAGE_KEY, trimmed);
    return item;
  },

  async clearAll(): Promise<void> {
    await saveData(STORAGE_KEY, []);
  },

  async export(): Promise<AuditEvent[]> {
    return this.getAll();
  },

  async getEventTypes(): Promise<{ value: AuditEventType; label: string; icon: string; color: string }[]> {
    return [
      { value: 'user_action', label: 'User Action', icon: 'person', color: '#3B82F6' },
      { value: 'system_action', label: 'System Action', icon: 'cog', color: '#10B981' },
      { value: 'security_event', label: 'Security Event', icon: 'shield', color: '#EF4444' },
    ];
  },
};
