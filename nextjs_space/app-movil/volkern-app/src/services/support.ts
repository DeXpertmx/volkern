import { getData, saveData } from './secure-storage';

const STORAGE_KEY = 'volkern_support';

// ─── Types ────────────────────────────────────────────────────────────────────
export type TicketStatus = 'open' | 'in_progress' | 'waiting' | 'resolved' | 'closed';
export type TicketPriority = 'low' | 'medium' | 'high' | 'critical';

export interface Ticket {
  id: string;
  number: string;
  subject: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
  category: string;
  requester: string;
  requesterEmail: string;
  assignee: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
}

export const TICKET_STATUSES: { value: TicketStatus; label: string; icon: string; color: string }[] = [
  { value: 'open', label: 'Abierto', icon: 'ellipse', color: '#3B82F6' },
  { value: 'in_progress', label: 'En Progreso', icon: 'cog', color: '#F59E0B' },
  { value: 'waiting', label: 'Esperando', icon: 'time', color: '#8B5CF6' },
  { value: 'resolved', label: 'Resuelto', icon: 'checkmark-circle', color: '#10B981' },
  { value: 'closed', label: 'Cerrado', icon: 'close-circle', color: '#64748B' },
];

export const TICKET_PRIORITIES: { value: TicketPriority; label: string; icon: string; color: string }[] = [
  { value: 'low', label: 'Baja', icon: 'arrow-down', color: '#10B981' },
  { value: 'medium', label: 'Media', icon: 'remove', color: '#F59E0B' },
  { value: 'high', label: 'Alta', icon: 'arrow-up', color: '#EF4444' },
  { value: 'critical', label: 'Crítica', icon: 'warning', color: '#DC2626' },
];

// ─── Service ──────────────────────────────────────────────────────────────────
function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function generateNumber(): string {
  const n = Math.floor(Math.random() * 9999) + 1;
  return `TCK-${String(n).padStart(4, '0')}`;
}

export const supportService = {
  async getAll(): Promise<Ticket[]> {
    const items = await getData<Ticket[]>(STORAGE_KEY);
    return items || [];
  },

  async getById(id: string): Promise<Ticket | null> {
    const items = await this.getAll();
    return items.find(t => t.id === id) || null;
  },

  async create(data: Omit<Ticket, 'id' | 'number' | 'createdAt' | 'updatedAt' | 'resolvedAt'>): Promise<Ticket> {
    const items = await this.getAll();
    const now = new Date().toISOString();
    const item: Ticket = {
      ...data,
      id: generateId(),
      number: generateNumber(),
      createdAt: now,
      updatedAt: now,
      resolvedAt: null,
    };
    items.unshift(item);
    await saveData(STORAGE_KEY, items);
    return item;
  },

  async update(id: string, data: Partial<Ticket>): Promise<void> {
    const items = await this.getAll();
    const idx = items.findIndex(t => t.id === id);
    if (idx === -1) throw new Error('Ticket not found');
    items[idx] = { ...items[idx], ...data, updatedAt: new Date().toISOString() };
    if (data.status === 'resolved') items[idx].resolvedAt = new Date().toISOString();
    await saveData(STORAGE_KEY, items);
  },

  async delete(id: string): Promise<void> {
    const items = await this.getAll();
    const idx = items.findIndex(t => t.id === id);
    if (idx === -1) return;
    items.splice(idx, 1);
    await saveData(STORAGE_KEY, items);
  },

  async getStats(): Promise<{ total: number; open: number; critical: number }> {
    const items = await this.getAll();
    return {
      total: items.length,
      open: items.filter(t => t.status === 'open' || t.status === 'in_progress').length,
      critical: items.filter(t => t.priority === 'critical' && t.status !== 'resolved' && t.status !== 'closed').length,
    };
  },
};
