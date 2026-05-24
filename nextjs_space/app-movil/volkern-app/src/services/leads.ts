import * as SecureStore from 'expo-secure-store';

// ─── Types ────────────────────────────────────────────────────────────────────

export type LeadStatus = 'new' | 'contacted' | 'qualified' | 'proposal' | 'negotiation' | 'won' | 'lost';
export type LeadSource = 'website' | 'referral' | 'social' | 'email' | 'call' | 'walk_in' | 'other';

export interface Lead {
  id: string;
  name: string;
  email: string;
  phone: string;
  company: string;
  status: LeadStatus;
  source: LeadSource;
  notes: string;
  tags: string[];
  assignedTo: string;
  budget: number;
  currency: string;
  interestScore: number; // 1-10
  lastContactedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface CreateLeadInput {
  name: string;
  email?: string;
  phone?: string;
  company?: string;
  source?: LeadSource;
  notes?: string;
  tags?: string[];
  budget?: number;
  currency?: string;
  interestScore?: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const LEADS_KEY = 'volkern_leads';

export const LEAD_STATUSES: { value: LeadStatus; label: string; icon: string; color: string }[] = [
  { value: 'new', label: 'Nuevo', icon: 'sparkles', color: '#3B82F6' },
  { value: 'contacted', label: 'Contactado', icon: 'chatbubble', color: '#8B5CF6' },
  { value: 'qualified', label: 'Calificado', icon: 'checkmark-circle', color: '#10B981' },
  { value: 'proposal', label: 'Propuesta', icon: 'document-text', color: '#F59E0B' },
  { value: 'negotiation', label: 'Negociación', icon: 'chatbubbles', color: '#EC4899' },
  { value: 'won', label: 'Ganado', icon: 'trophy', color: '#10B981' },
  { value: 'lost', label: 'Perdido', icon: 'close-circle', color: '#EF4444' },
];

export const LEAD_SOURCES: { value: LeadSource; label: string; icon: string }[] = [
  { value: 'website', label: 'Sitio web', icon: 'globe' },
  { value: 'referral', label: 'Referido', icon: 'people' },
  { value: 'social', label: 'Redes sociales', icon: 'share-social' },
  { value: 'email', label: 'Correo', icon: 'mail' },
  { value: 'call', label: 'Llamada', icon: 'call' },
  { value: 'walk_in', label: 'Visitó', icon: 'walk' },
  { value: 'other', label: 'Otro', icon: 'ellipsis-horizontal' },
];

export function getStatusColor(status: LeadStatus): string {
  return LEAD_STATUSES.find((s) => s.value === status)?.color || '#94A3B8';
}

export function getStatusLabel(status: LeadStatus): string {
  return LEAD_STATUSES.find((s) => s.value === status)?.label || status;
}

export function getStatusIcon(status: LeadStatus): string {
  return LEAD_STATUSES.find((s) => s.value === status)?.icon || 'ellipse';
}

// ─── Service ──────────────────────────────────────────────────────────────────

class LeadsService {
  async getAll(): Promise<Lead[]> {
    try {
      const raw = await SecureStore.getItemAsync(LEADS_KEY);
      if (raw) {
        const items = JSON.parse(raw) as Lead[];
        return items.sort((a, b) => b.updatedAt - a.updatedAt);
      }
    } catch {
      // ignore
    }
    return [];
  }

  async getByStatus(status: LeadStatus): Promise<Lead[]> {
    const all = await this.getAll();
    return all.filter((l) => l.status === status);
  }

  async getById(id: string): Promise<Lead | undefined> {
    const all = await this.getAll();
    return all.find((l) => l.id === id);
  }

  async search(query: string): Promise<Lead[]> {
    const all = await this.getAll();
    const q = query.toLowerCase();
    return all.filter(
      (l) =>
        l.name.toLowerCase().includes(q) ||
        l.email.toLowerCase().includes(q) ||
        l.company.toLowerCase().includes(q) ||
        l.phone.includes(q) ||
        l.tags.some((t) => t.toLowerCase().includes(q)),
    );
  }

  async create(data: CreateLeadInput): Promise<Lead> {
    const all = await this.getAll();
    const lead: Lead = {
      id: `lead_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name: data.name,
      email: data.email || '',
      phone: data.phone || '',
      company: data.company || '',
      status: 'new',
      source: data.source || 'other',
      notes: data.notes || '',
      tags: data.tags || [],
      assignedTo: '',
      budget: data.budget || 0,
      currency: data.currency || 'MXN',
      interestScore: data.interestScore || 5,
      lastContactedAt: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    all.push(lead);
    await this.persist(all);
    return lead;
  }

  async update(id: string, data: Partial<Omit<Lead, 'id' | 'createdAt'>>): Promise<Lead | null> {
    const all = await this.getAll();
    const idx = all.findIndex((l) => l.id === id);
    if (idx === -1) return null;
    all[idx] = { ...all[idx], ...data, updatedAt: Date.now() };
    await this.persist(all);
    return all[idx];
  }

  async updateStatus(id: string, status: LeadStatus): Promise<Lead | null> {
    return this.update(id, { status });
  }

  async delete(id: string): Promise<void> {
    const all = await this.getAll();
    const filtered = all.filter((l) => l.id !== id);
    await this.persist(filtered);
  }

  async clearAll(): Promise<void> {
    await this.persist([]);
  }

  async getStats(): Promise<{
    total: number;
    new: number;
    contacted: number;
    qualified: number;
    won: number;
    lost: number;
    conversionRate: number;
  }> {
    const all = await this.getAll();
    const newCount = all.filter((l) => l.status === 'new').length;
    const contacted = all.filter((l) => l.status === 'contacted').length;
    const qualified = all.filter((l) => l.status === 'qualified').length;
    const won = all.filter((l) => l.status === 'won').length;
    const lost = all.filter((l) => l.status === 'lost').length;
    const totalClosed = won + lost;
    const conversionRate = totalClosed > 0 ? Math.round((won / totalClosed) * 100) : 0;
    return { total: all.length, new: newCount, contacted, qualified, won, lost, conversionRate };
  }

  // ── Private ────────────────────────────────────────────────────────────

  private async persist(items: Lead[]): Promise<void> {
    try {
      await SecureStore.setItemAsync(LEADS_KEY, JSON.stringify(items));
    } catch {
      console.error('[LeadsService] Error saving leads');
    }
  }
}

export const leadsService = new LeadsService();
