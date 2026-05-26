import { api, ApiClientError } from './api';

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

// Mapa de estados español → inglés
export const STATUS_MAP: Record<string, LeadStatus> = {
  nuevo: 'new',
  contactado: 'contacted',
  calificado: 'qualified',
  propuesta: 'proposal',
  negociacion: 'negotiation',
  ganado: 'won',
  perdido: 'lost',
};

const STATUS_REVERSE: Record<LeadStatus, string> = {
  new: 'nuevo',
  contacted: 'contactado',
  qualified: 'calificado',
  proposal: 'propuesta',
  negotiation: 'negociacion',
  won: 'ganado',
  lost: 'perdido',
};

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Mapea un lead de la API (campos español) al tipo Lead local (inglés) */
function mapApiLead(apiLead: any): Lead {
  const status = STATUS_MAP[apiLead.estado?.toLowerCase()] || 'new';
  const sourceMap: Record<string, LeadSource> = {
    website: 'website',
    referido: 'referral',
    referral: 'referral',
    'redes sociales': 'social',
    social: 'social',
    email: 'email',
    correo: 'email',
    llamada: 'call',
    call: 'call',
    visita: 'walk_in',
    'walk_in': 'walk_in',
    otro: 'other',
    other: 'other',
  };
  const source = sourceMap[apiLead.fuente?.toLowerCase()] || 'other';
  const tags = apiLead.tags
    ? String(apiLead.tags).split(',').map((t: string) => t.trim()).filter(Boolean)
    : [];

  return {
    id: apiLead.id,
    name: apiLead.nombre || '',
    email: apiLead.email || '',
    phone: apiLead.telefono || '',
    company: apiLead.empresa || '',
    status,
    source,
    notes: apiLead.notas || '',
    tags,
    assignedTo: apiLead.asignadoA || '',
    budget: apiLead.presupuesto || 0,
    currency: apiLead.moneda || 'MXN',
    interestScore: apiLead.scoreValue || apiLead.interes || 5,
    lastContactedAt: apiLead.fechaUltimaActividad
      ? new Date(apiLead.fechaUltimaActividad).getTime()
      : null,
    createdAt: apiLead.fechaCreacion
      ? new Date(apiLead.fechaCreacion).getTime()
      : Date.now(),
    updatedAt: apiLead.fechaActualizacion
      ? new Date(apiLead.fechaActualizacion).getTime()
      : Date.now(),
  };
}

// ─── Service ──────────────────────────────────────────────────────────────────

class LeadsService {
  async getAll(): Promise<Lead[]> {
    try {
      const data = await api.get<any[]>('/leads');
      return (data || []).map(mapApiLead).sort((a, b) => b.updatedAt - a.updatedAt);
    } catch (e) {
      console.error('[LeadsService] Error fetching leads:', e);
      return [];
    }
  }

  async getByStatus(status: LeadStatus): Promise<Lead[]> {
    try {
      const data = await api.get<any[]>(`/leads?etapa=${STATUS_REVERSE[status]}`);
      return (data || []).map(mapApiLead);
    } catch (e) {
      console.error('[LeadsService] Error fetching leads by status:', e);
      return [];
    }
  }

  async getById(id: string): Promise<Lead | undefined> {
    try {
      const data = await api.get<any>(`/leads/${id}`);
      return data ? mapApiLead(data) : undefined;
    } catch (e) {
      if (e instanceof ApiClientError && e.status === 404) return undefined;
      console.error('[LeadsService] Error fetching lead:', e);
      return undefined;
    }
  }

  async search(query: string): Promise<Lead[]> {
    try {
      const data = await api.get<any[]>(`/leads?q=${encodeURIComponent(query)}`);
      return (data || []).map(mapApiLead);
    } catch (e) {
      console.error('[LeadsService] Error searching leads:', e);
      return [];
    }
  }

  async create(data: CreateLeadInput): Promise<Lead> {
    const body: any = {
      nombre: data.name,
      email: data.email || '',
      telefono: data.phone || '',
      empresa: data.company || '',
      notas: data.notes || '',
      fuente: data.source || 'other',
      scoreValue: data.interestScore || 5,
    };
    if (data.tags?.length) body.tags = data.tags.join(',');

    const result = await api.post<any>('/leads', body);
    return mapApiLead(result);
  }

  async update(id: string, data: Partial<Omit<Lead, 'id' | 'createdAt'>>): Promise<Lead | null> {
    const body: any = {};
    if (data.name !== undefined) body.nombre = data.name;
    if (data.email !== undefined) body.email = data.email;
    if (data.phone !== undefined) body.telefono = data.phone;
    if (data.company !== undefined) body.empresa = data.company;
    if (data.status !== undefined) body.estado = STATUS_REVERSE[data.status];
    if (data.source !== undefined) body.fuente = data.source;
    if (data.notes !== undefined) body.notas = data.notes;
    if (data.tags !== undefined) body.tags = data.tags.join(',');
    if (data.interestScore !== undefined) body.scoreValue = data.interestScore;
    if (data.budget !== undefined) body.presupuesto = data.budget;

    try {
      const resp = await api.patch<any>(`/leads/${id}`, body);
      // PATCH returns { success: true, lead }
      const leadData = resp.lead || resp;
      return mapApiLead(leadData);
    } catch (e) {
      if (e instanceof ApiClientError && e.status === 404) return null;
      throw e;
    }
  }

  async updateStatus(id: string, status: LeadStatus): Promise<Lead | null> {
    return this.update(id, { status });
  }

  async delete(id: string): Promise<void> {
    try {
      await api.delete(`/leads/${id}`);
    } catch (e) {
      console.error('[LeadsService] Error deleting lead:', e);
    }
  }

  async clearAll(): Promise<void> {
    // No implementado para API - borrado masivo no disponible
    console.warn('[LeadsService] clearAll no soportado vía API');
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
    try {
      const resp = await api.get<{ success: boolean; stats: any }>('/leads/stats');
      const s = resp.stats?.overview;
      if (s) {
        return {
          total: s.totalLeads || 0,
          new: s.leadsNuevos || 0,
          contacted: 0, // no disponible en stats actual
          qualified: 0,
          won: s.leadsConvertidos || 0,
          lost: 0,
          conversionRate: s.tasaConversion || 0,
        };
      }
      // Fallback: calcular desde porEstado
      const porEstado = resp.stats?.porEstado || [];
      const total = porEstado.reduce((sum: number, e: any) => sum + e.count, 0);
      const newCount = porEstado.find((e: any) => e.estado === 'nuevo')?.count || 0;
      const won = porEstado.find((e: any) => e.estado === 'ganado')?.count || 0;
      const lost = porEstado.find((e: any) => e.estado === 'perdido')?.count || 0;
      const totalClosed = won + lost;
      return {
        total,
        new: newCount,
        contacted: porEstado.find((e: any) => e.estado === 'contactado')?.count || 0,
        qualified: porEstado.find((e: any) => e.estado === 'calificado')?.count || 0,
        won,
        lost,
        conversionRate: totalClosed > 0 ? Math.round((won / totalClosed) * 100) : 0,
      };
    } catch (e) {
      console.error('[LeadsService] Error fetching stats:', e);
      return { total: 0, new: 0, contacted: 0, qualified: 0, won: 0, lost: 0, conversionRate: 0 };
    }
  }
}

export const leadsService = new LeadsService();
