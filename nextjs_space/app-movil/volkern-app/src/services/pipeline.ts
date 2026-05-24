import * as SecureStore from 'expo-secure-store';

// ─── Types ────────────────────────────────────────────────────────────────────

export type DealStage = 'lead' | 'qualified' | 'proposal' | 'negotiation' | 'closed_won' | 'closed_lost';
export type DealPriority = 'low' | 'medium' | 'high';

export interface Deal {
  id: string;
  title: string;
  company: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  amount: number;
  currency: string;
  probability: number;
  stage: DealStage;
  priority: DealPriority;
  expectedCloseDate: number | null;
  notes: string;
  tags: string[];
  createdAt: number;
  updatedAt: number;
}

export interface CreateDealInput {
  title: string;
  company: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  amount?: number;
  currency?: string;
  probability?: number;
  stage?: DealStage;
  priority?: DealPriority;
  expectedCloseDate?: number | null;
  notes?: string;
  tags?: string[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PIPELINE_KEY = 'volkern_pipeline';

export const DEAL_STAGES: { value: DealStage; label: string; icon: string; color: string }[] = [
  { value: 'lead', label: 'Lead', icon: 'person', color: '#94A3B8' },
  { value: 'qualified', label: 'Calificado', icon: 'checkmark-circle', color: '#3B82F6' },
  { value: 'proposal', label: 'Propuesta', icon: 'document-text', color: '#8B5CF6' },
  { value: 'negotiation', label: 'Negociación', icon: 'chatbubbles', color: '#F59E0B' },
  { value: 'closed_won', label: 'Ganado', icon: 'trophy', color: '#10B981' },
  { value: 'closed_lost', label: 'Perdido', icon: 'close-circle', color: '#EF4444' },
];

export const DEAL_PRIORITIES: { value: DealPriority; label: string; color: string }[] = [
  { value: 'low', label: 'Baja', color: '#94A3B8' },
  { value: 'medium', label: 'Media', color: '#3B82F6' },
  { value: 'high', label: 'Alta', color: '#EF4444' },
];

export const STAGE_TRANSITIONS: Record<DealStage, DealStage[]> = {
  lead: ['qualified'],
  qualified: ['proposal', 'lead'],
  proposal: ['negotiation', 'qualified'],
  negotiation: ['closed_won', 'closed_lost', 'proposal'],
  closed_won: ['negotiation'],
  closed_lost: ['negotiation'],
};

export function getStageColor(stage: DealStage): string {
  return DEAL_STAGES.find((s) => s.value === stage)?.color || '#94A3B8';
}

export function getStageLabel(stage: DealStage): string {
  return DEAL_STAGES.find((s) => s.value === stage)?.label || stage;
}

export function getStageIcon(stage: DealStage): string {
  return DEAL_STAGES.find((s) => s.value === stage)?.icon || 'ellipse';
}

// ─── Service ──────────────────────────────────────────────────────────────────

class PipelineService {
  async getAll(): Promise<Deal[]> {
    try {
      const raw = await SecureStore.getItemAsync(PIPELINE_KEY);
      if (raw) {
        const items = JSON.parse(raw) as Deal[];
        return items.sort((a, b) => b.updatedAt - a.updatedAt);
      }
    } catch {
      // ignore
    }
    return [];
  }

  async getByStage(stage: DealStage): Promise<Deal[]> {
    const all = await this.getAll();
    return all.filter((d) => d.stage === stage);
  }

  async getById(id: string): Promise<Deal | undefined> {
    const all = await this.getAll();
    return all.find((d) => d.id === id);
  }

  async search(query: string): Promise<Deal[]> {
    const all = await this.getAll();
    const q = query.toLowerCase();
    return all.filter(
      (d) =>
        d.title.toLowerCase().includes(q) ||
        d.company.toLowerCase().includes(q) ||
        d.contactName.toLowerCase().includes(q) ||
        d.tags.some((t) => t.toLowerCase().includes(q)),
    );
  }

  async create(data: CreateDealInput): Promise<Deal> {
    const all = await this.getAll();
    const deal: Deal = {
      id: `deal_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      title: data.title,
      company: data.company,
      contactName: data.contactName || '',
      contactEmail: data.contactEmail || '',
      contactPhone: data.contactPhone || '',
      amount: data.amount || 0,
      currency: data.currency || 'MXN',
      probability: data.probability ?? (data.stage === 'lead' ? 10 : data.stage === 'qualified' ? 25 : data.stage === 'proposal' ? 50 : data.stage === 'negotiation' ? 75 : data.stage === 'closed_won' ? 100 : 0),
      stage: data.stage || 'lead',
      priority: data.priority || 'medium',
      expectedCloseDate: data.expectedCloseDate ?? null,
      notes: data.notes || '',
      tags: data.tags || [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    all.push(deal);
    await this.persist(all);
    return deal;
  }

  async update(id: string, data: Partial<Omit<Deal, 'id' | 'createdAt'>>): Promise<Deal | null> {
    const all = await this.getAll();
    const idx = all.findIndex((d) => d.id === id);
    if (idx === -1) return null;
    const prevStage = all[idx].stage;
    all[idx] = { ...all[idx], ...data, updatedAt: Date.now() };
    // Auto-update probability on stage change
    if (data.stage && data.stage !== prevStage) {
      const probMap: Record<DealStage, number> = { lead: 10, qualified: 25, proposal: 50, negotiation: 75, closed_won: 100, closed_lost: 0 };
      all[idx].probability = probMap[data.stage];
    }
    await this.persist(all);
    return all[idx];
  }

  async updateStage(id: string, stage: DealStage): Promise<Deal | null> {
    return this.update(id, { stage });
  }

  async delete(id: string): Promise<void> {
    const all = await this.getAll();
    const filtered = all.filter((d) => d.id !== id);
    await this.persist(filtered);
  }

  async clearAll(): Promise<void> {
    await this.persist([]);
  }

  async getStats(): Promise<{
    total: number;
    totalAmount: number;
    wonAmount: number;
    weightedAmount: number;
    stageBreakdown: Record<DealStage, { count: number; amount: number }>;
  }> {
    const all = await this.getAll();
    const stageBreakdown = {} as Record<DealStage, { count: number; amount: number }>;
    for (const stage of DEAL_STAGES.map((s) => s.value)) {
      stageBreakdown[stage] = { count: 0, amount: 0 };
    }
    for (const deal of all) {
      stageBreakdown[deal.stage].count++;
      stageBreakdown[deal.stage].amount += deal.amount;
    }
    const totalAmount = all.reduce((sum, d) => sum + d.amount, 0);
    const wonAmount = all.filter((d) => d.stage === 'closed_won').reduce((sum, d) => sum + d.amount, 0);
    const weightedAmount = all.reduce((sum, d) => sum + (d.amount * d.probability) / 100, 0);
    return { total: all.length, totalAmount, wonAmount, weightedAmount, stageBreakdown };
  }

  // ── Private ────────────────────────────────────────────────────────────

  private async persist(items: Deal[]): Promise<void> {
    try {
      await SecureStore.setItemAsync(PIPELINE_KEY, JSON.stringify(items));
    } catch {
      console.error('[PipelineService] Error saving deals');
    }
  }
}

export const pipelineService = new PipelineService();
