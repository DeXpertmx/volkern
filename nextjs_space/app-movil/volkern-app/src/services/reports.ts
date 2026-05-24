import { api } from './api';

// ─── Lead Stats Types ─────────────────────────────────────────────────────────
export interface LeadStatsOverview {
  totalLeads: number;
  leadsNuevos: number;
  leadsConvertidos: number;
  leadsAsignados: number;
  leadsSinAsignar: number;
  tasaConversion: number;
  scorePromedio: number;
}

export interface LeadGroupItem {
  estado?: string;
  fuente?: string;
  count: number;
}

export interface LeadByUser {
  usuarioId: string;
  usuarioNombre: string;
  count: number;
}

export interface LeadEvolution {
  fecha: string;
  count: number;
}

export interface TopLead {
  id: string;
  nombre: string;
  email: string;
  empresa?: string;
  estado: string;
  fuente?: string;
  score: number;
}

export interface LeadStatsResponse {
  overview: LeadStatsOverview;
  porEstado: LeadGroupItem[];
  porFuente: LeadGroupItem[];
  porUsuario: LeadByUser[];
  evolucion: LeadEvolution[];
  topLeads: TopLead[];
}

// ─── Deal Metrics Types ───────────────────────────────────────────────────────
export interface DealSummary {
  totalDeals: number;
  dealsActivos: number;
  dealsGanados: number;
  dealsPerdidos: number;
  valorTotal: number;
  valorGanado: number;
  valorPerdido: number;
  valorPonderado: number;
  tasaConversion: number;
  ticketPromedio: number;
  tiempoPromedioCiclo: number;
}

export interface DealStageDist {
  [etapa: string]: {
    cantidad: number;
    valor: number;
    valorPonderado: number;
  };
}

export interface TopSeller {
  id: string;
  nombre: string;
  deals: number;
  ganados: number;
  valorTotal: number;
  valorGanado: number;
}

export interface DealEvolution {
  periodo: string;
  creados: number;
  ganados: number;
  perdidos: number;
  valorCreado: number;
  valorGanado: number;
}

export interface DealForecast {
  mes: string;
  cantidad: number;
  valorPonderado: number;
}

export interface DealMetricsResponse {
  resumen: DealSummary;
  distribucion: {
    porEtapa: DealStageDist;
    porPrioridad: Record<string, number>;
  };
  topVendedores: TopSeller[];
  evolucion: DealEvolution[];
  pronostico: DealForecast[];
}

import type { DashboardStats as DashboardStatsType } from './dashboard';

// Re-export for reports.tsx
export type DashboardStats = DashboardStatsType;

// ─── Service ──────────────────────────────────────────────────────────────────
export const reportsService = {
  /**
   * Obtiene estadísticas detalladas de leads
   */
  async getLeadStats(periodo: string = '30'): Promise<LeadStatsResponse> {
    const res = await api.get<{ success: boolean; stats: LeadStatsResponse }>(
      `/leads/stats?periodo=${periodo}`,
    );
    return res.stats;
  },

  /**
   * Obtiene métricas de deals/ventas
   */
  async getDealMetrics(periodo: string = 'mes'): Promise<DealMetricsResponse> {
    return api.get<DealMetricsResponse>(`/deals/metrics?periodo=${periodo}`);
  },

  /**
   * Obtiene métricas del dashboard (ingresos, campañas)
   */
  async getDashboardStats(range: string = '30'): Promise<DashboardStats> {
    return api.get<DashboardStats>(`/dashboard?range=${range}`);
  },

  /**
   * Formatea un número como moneda MXN
   */
  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  },

  /**
   * Formatea un porcentaje
   */
  formatPercent(value: number): string {
    return `${Math.round(value * 10) / 10}%`;
  },
};
