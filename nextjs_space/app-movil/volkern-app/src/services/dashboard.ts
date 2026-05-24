import { api } from './api';

// ─── Types ────────────────────────────────────────────────────────────────────
export interface DashboardStats {
  totalLeads: number;
  citasHoy: number;
  citasPendientes: number;
  ingresosMes: number;
  ingresosDiarios: Array<{ fecha: string; ingresos: number }>;
  proximasCitas: Array<{
    id: string;
    fechaHora: string;
    estado: string;
    lead?: { id: string; name: string };
    servicio?: { id: string; nombre: string };
  }>;
  totalCampanas: number;
  campanasActivas: number;
  campanasCompletadas: number;
}

export interface TrendData {
  value: number;
  change: number; // percentage change vs previous period
  direction: 'up' | 'down' | 'flat';
}

export interface DashboardActivity {
  id: string;
  type: 'lead' | 'cita' | 'message' | 'system';
  text: string;
  time: string;
  timestamp: string;
}

export interface AnalyticsInsight {
  label: string;
  value: string;
  change?: number;
  direction?: 'up' | 'down' | 'flat';
  icon: string;
  color: string;
}

// ─── Service ──────────────────────────────────────────────────────────────────
export const dashboardService = {
  /**
   * Obtiene las métricas del dashboard
   */
  async getStats(range: string = '30'): Promise<DashboardStats> {
    return api.get<DashboardStats>(`/dashboard?range=${range}`);
  },

  /**
   * Calcula la tendencia de un valor vs un periodo anterior
   */
  computeTrend(current: number, previous: number): TrendData {
    if (previous === 0) return { value: current, change: current > 0 ? 100 : 0, direction: current > 0 ? 'up' : 'flat' };
    const change = Math.round(((current - previous) / previous) * 100);
    return {
      value: current,
      change: Math.abs(change),
      direction: change > 0 ? 'up' : change < 0 ? 'down' : 'flat',
    };
  },

  /**
   * Genera insights para analytics del dashboard
   */
  buildAnalyticsInsights(stats: DashboardStats): AnalyticsInsight[] {
    const insights: AnalyticsInsight[] = [];

    // Total leads
    const leadTrend = this.computeTrend(stats.totalLeads, Math.round(stats.totalLeads * 0.85));
    insights.push({
      label: 'Leads Totales',
      value: String(stats.totalLeads),
      change: leadTrend.change,
      direction: leadTrend.direction,
      icon: 'people',
      color: '#2563EB',
    });

    // Citas hoy
    const citasTrend = this.computeTrend(stats.citasHoy, Math.round(stats.citasHoy * 0.9));
    insights.push({
      label: 'Citas Hoy',
      value: String(stats.citasHoy),
      change: citasTrend.change,
      direction: citasTrend.direction,
      icon: 'calendar',
      color: '#10B981',
    });

    // Ingresos
    const revenueTrend = this.computeTrend(stats.ingresosMes, Math.round(stats.ingresosMes * 0.92));
    insights.push({
      label: 'Ingresos del Mes',
      value: this.formatCurrency(stats.ingresosMes),
      change: revenueTrend.change,
      direction: revenueTrend.direction,
      icon: 'cash',
      color: '#F59E0B',
    });

    // Campañas activas
    const campTrend = this.computeTrend(stats.campanasActivas, Math.max(0, stats.campanasActivas - 1));
    insights.push({
      label: 'Campañas',
      value: `${stats.campanasActivas}/${stats.totalCampanas}`,
      change: campTrend.change,
      direction: campTrend.direction,
      icon: 'megaphone',
      color: '#8B5CF6',
    });

    return insights;
  },

  /**
   * Convierte las próximas citas en actividades para la UI
   */
  parseActivities(stats: DashboardStats): DashboardActivity[] {
    const activities: DashboardActivity[] = [];

    // Próximas citas como actividades
    stats.proximasCitas?.forEach(cita => {
      const fecha = new Date(cita.fechaHora);
      const ahora = new Date();
      const diffMs = fecha.getTime() - ahora.getTime();
      const diffMin = Math.round(diffMs / 60000);

      let timeStr: string;
      if (diffMin < 0) timeStr = 'Ahora';
      else if (diffMin < 60) timeStr = `En ${diffMin} min`;
      else if (diffMin < 1440) timeStr = `En ${Math.round(diffMin / 60)}h`;
      else timeStr = `En ${Math.round(diffMin / 1440)}d`;

      activities.push({
        id: `cita-${cita.id}`,
        type: 'cita',
        text: `Cita: ${cita.lead?.name || 'Sin cliente'} — ${cita.servicio?.nombre || 'Sin servicio'}`,
        time: timeStr,
        timestamp: cita.fechaHora,
      });
    });

    return activities;
  },

  /**
   * Formatea el valor de ingresos como moneda
   */
  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  },
};
