import { getData, saveData } from './secure-storage';

const STORAGE_KEY = 'volkern_feedback';

// ─── Types ────────────────────────────────────────────────────────────────────
export type FeedbackType = 'bug' | 'feature' | 'improvement' | 'other';
export type FeedbackStatus = 'new' | 'reviewed' | 'implemented' | 'declined';

export interface Feedback {
  id: string;
  type: FeedbackType;
  message: string;
  rating: number;
  screenshot: string | null;
  userId: string;
  userName: string;
  status: FeedbackStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CreateFeedbackInput {
  type: FeedbackType;
  message: string;
  rating?: number;
  screenshot?: string;
}

export const FEEDBACK_TYPES: { value: FeedbackType; label: string; icon: string; color: string }[] = [
  { value: 'bug', label: 'Bug Report', icon: 'bug', color: '#EF4444' },
  { value: 'feature', label: 'Feature Request', icon: 'bulb', color: '#8B5CF6' },
  { value: 'improvement', label: 'Improvement', icon: 'trending-up', color: '#3B82F6' },
  { value: 'other', label: 'Other', icon: 'ellipsis-horizontal', color: '#64748B' },
];

export const FEEDBACK_STATUSES: { value: FeedbackStatus; label: string; icon: string; color: string }[] = [
  { value: 'new', label: 'New', icon: 'ellipse', color: '#3B82F6' },
  { value: 'reviewed', label: 'Reviewed', icon: 'eye', color: '#F59E0B' },
  { value: 'implemented', label: 'Implemented', icon: 'checkmark-circle', color: '#10B981' },
  { value: 'declined', label: 'Declined', icon: 'close-circle', color: '#EF4444' },
];

// ─── Service ──────────────────────────────────────────────────────────────────
function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export const feedbackService = {
  async getAll(): Promise<Feedback[]> {
    const items = await getData<Feedback[]>(STORAGE_KEY);
    return items || [];
  },

  async create(input: CreateFeedbackInput, userId: string, userName: string): Promise<Feedback> {
    const items = await this.getAll();
    const now = new Date().toISOString();
    const item: Feedback = {
      id: generateId(),
      type: input.type,
      message: input.message,
      rating: input.rating || 0,
      screenshot: input.screenshot || null,
      userId,
      userName,
      status: 'new',
      createdAt: now,
      updatedAt: now,
    };
    items.unshift(item);
    await saveData(STORAGE_KEY, items);
    return item;
  },

  async updateStatus(id: string, status: FeedbackStatus): Promise<void> {
    const items = await this.getAll();
    const idx = items.findIndex(i => i.id === id);
    if (idx === -1) return;
    items[idx].status = status;
    items[idx].updatedAt = new Date().toISOString();
    await saveData(STORAGE_KEY, items);
  },

  async getStats(): Promise<{ total: number; byType: Record<FeedbackType, number>; byStatus: Record<FeedbackStatus, number> }> {
    const items = await this.getAll();
    const byType = { bug: 0, feature: 0, improvement: 0, other: 0 };
    const byStatus = { new: 0, reviewed: 0, implemented: 0, declined: 0 };
    items.forEach(i => {
      byType[i.type]++;
      byStatus[i.status]++;
    });
    return { total: items.length, byType, byStatus };
  },
};
