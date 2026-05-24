import { getData, saveData } from './secure-storage';

const STORAGE_KEY = 'volkern_automations';

// ─── Types ────────────────────────────────────────────────────────────────────
export type TriggerType = 'lead_created' | 'lead_status_changed' | 'task_completed' | 'invoice_paid' | 'email_received' | 'scheduled';
export type ActionType = 'send_email' | 'send_notification' | 'update_lead_status' | 'create_task' | 'send_webhook' | 'assign_lead';

export interface AutomationTrigger {
  type: TriggerType;
  config: Record<string, string>;
}

export interface AutomationAction {
  type: ActionType;
  config: Record<string, string>;
}

export interface Automation {
  id: string;
  name: string;
  description: string;
  trigger: AutomationTrigger;
  actions: AutomationAction[];
  enabled: boolean;
  lastRun: string | null;
  runCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAutomationInput {
  name: string;
  description?: string;
  trigger: AutomationTrigger;
  actions: AutomationAction[];
}

export const TRIGGER_TYPES: { value: TriggerType; label: string; icon: string; color: string }[] = [
  { value: 'lead_created', label: 'Lead Created', icon: 'person-add', color: '#3B82F6' },
  { value: 'lead_status_changed', label: 'Lead Status Changed', icon: 'swap-horizontal', color: '#8B5CF6' },
  { value: 'task_completed', label: 'Task Completed', icon: 'checkbox', color: '#10B981' },
  { value: 'invoice_paid', label: 'Invoice Paid', icon: 'cash', color: '#F59E0B' },
  { value: 'email_received', label: 'Email Received', icon: 'mail', color: '#EF4444' },
  { value: 'scheduled', label: 'Scheduled', icon: 'timer', color: '#06B6D4' },
];

export const ACTION_TYPES: { value: ActionType; label: string; icon: string; color: string }[] = [
  { value: 'send_email', label: 'Send Email', icon: 'mail', color: '#3B82F6' },
  { value: 'send_notification', label: 'Send Notification', icon: 'notifications', color: '#F59E0B' },
  { value: 'update_lead_status', label: 'Update Lead Status', icon: 'swap-horizontal', color: '#8B5CF6' },
  { value: 'create_task', label: 'Create Task', icon: 'checkbox', color: '#10B981' },
  { value: 'send_webhook', label: 'Send Webhook', icon: 'globe', color: '#06B6D4' },
  { value: 'assign_lead', label: 'Assign Lead', icon: 'person', color: '#EF4444' },
];

// ─── Service ──────────────────────────────────────────────────────────────────
function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export const automationService = {
  async getAll(): Promise<Automation[]> {
    const items = await getData<Automation[]>(STORAGE_KEY);
    return items || [];
  },

  async getById(id: string): Promise<Automation | null> {
    const items = await this.getAll();
    return items.find(i => i.id === id) || null;
  },

  async create(input: CreateAutomationInput): Promise<Automation> {
    const items = await this.getAll();
    const now = new Date().toISOString();
    const item: Automation = {
      id: generateId(),
      ...input,
      description: input.description || '',
      enabled: true,
      lastRun: null,
      runCount: 0,
      createdAt: now,
      updatedAt: now,
    };
    items.push(item);
    await saveData(STORAGE_KEY, items);
    return item;
  },

  async update(id: string, input: Partial<CreateAutomationInput & { enabled: boolean }>): Promise<void> {
    const items = await this.getAll();
    const idx = items.findIndex(i => i.id === id);
    if (idx === -1) throw new Error('Automation not found');
    items[idx] = {
      ...items[idx],
      ...input,
      updatedAt: new Date().toISOString(),
    };
    await saveData(STORAGE_KEY, items);
  },

  async delete(id: string): Promise<void> {
    const items = await this.getAll();
    const filtered = items.filter(i => i.id !== id);
    await saveData(STORAGE_KEY, filtered);
  },

  async toggleEnabled(id: string): Promise<void> {
    const items = await this.getAll();
    const idx = items.findIndex(i => i.id === id);
    if (idx === -1) throw new Error('Automation not found');
    items[idx].enabled = !items[idx].enabled;
    items[idx].updatedAt = new Date().toISOString();
    await saveData(STORAGE_KEY, items);
  },

  async getStats(): Promise<{ total: number; enabled: number; disabled: number; totalRuns: number }> {
    const items = await this.getAll();
    return {
      total: items.length,
      enabled: items.filter(i => i.enabled).length,
      disabled: items.filter(i => !i.enabled).length,
      totalRuns: items.reduce((s, i) => s + i.runCount, 0),
    };
  },
};
