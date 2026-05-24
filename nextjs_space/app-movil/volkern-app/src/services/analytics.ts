import * as SecureStore from 'expo-secure-store';

// ─── Types ────────────────────────────────────────────────────────────────────

export type AnalyticsPeriod = '7d' | '30d' | '90d' | '1y' | 'custom';

export type MetricType = 'revenue' | 'leads' | 'deals' | 'contacts' | 'tasks' | 'appointments';

export interface MetricCard {
  id: string;
  type: MetricType;
  label: string;
  value: number;
  previousValue: number;
  change: number;
  changePercent: number;
  trend: 'up' | 'down' | 'flat';
  prefix?: string;
  suffix?: string;
  color: string;
}

export interface ChartDataPoint {
  date: string;
  value: number;
  previousValue?: number;
  label?: string;
}

export interface ChartDataset {
  id: string;
  label: string;
  data: ChartDataPoint[];
  color: string;
  fill?: boolean;
}

export interface AnalyticsReport {
  id: string;
  name: string;
  period: AnalyticsPeriod;
  metrics: MetricCard[];
  charts: ChartDataset[];
  summary: string;
  generatedAt: number;
}

export interface PeriodComparison {
  current: { value: number; label: string };
  previous: { value: number; label: string };
  change: number;
  changePercent: number;
  trend: 'up' | 'down' | 'flat';
}

export interface ExportOptions {
  format: 'csv' | 'json' | 'pdf';
  includeCharts: boolean;
  dateRange: { start: number; end: number };
  metrics: MetricType[];
}

// ─── Keys ─────────────────────────────────────────────────────────────────────

const REPORTS_KEY = 'volkern_analytics_reports';
const CACHED_METRICS_KEY = 'volkern_analytics_metrics_cache';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateId(): string {
  return `an_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function calcChange(current: number, previous: number): { change: number; changePercent: number; trend: 'up' | 'down' | 'flat' } {
  const change = current - previous;
  const changePercent = previous > 0 ? Math.round((change / previous) * 100) : 0;
  const trend = change > 0 ? 'up' : change < 0 ? 'down' : 'flat';
  return { change, changePercent, trend };
}

// ─── Service ──────────────────────────────────────────────────────────────────

class AnalyticsService {
  // ── Metrics ───────────────────────────────────────────────────────────

  async getDashboardMetrics(): Promise<MetricCard[]> {
    // Return cached or computed metrics
    try {
      const raw = await SecureStore.getItemAsync(CACHED_METRICS_KEY);
      if (raw) return JSON.parse(raw) as MetricCard[];
    } catch { /* ignore */ }
    return [];
  }

  async computeMetrics(data: Record<MetricType, { current: number; previous: number }>): Promise<MetricCard[]> {
    const metrics: MetricCard[] = [];
    const configs: { type: MetricType; label: string; color: string; prefix?: string; suffix?: string }[] = [
      { type: 'revenue', label: 'Ingresos', color: '#10B981', prefix: '$' },
      { type: 'leads', label: 'Leads', color: '#3B82F6' },
      { type: 'deals', label: 'Deals', color: '#8B5CF6' },
      { type: 'contacts', label: 'Contactos', color: '#F59E0B' },
      { type: 'tasks', label: 'Tareas', color: '#EC4899' },
      { type: 'appointments', label: 'Citas', color: '#06B6D4' },
    ];

    for (const cfg of configs) {
      const d = data[cfg.type];
      const { change, changePercent, trend } = calcChange(d.current, d.previous);
      metrics.push({
        id: `metric_${cfg.type}`,
        type: cfg.type,
        label: cfg.label,
        value: d.current,
        previousValue: d.previous,
        change,
        changePercent,
        trend,
        prefix: cfg.prefix,
        suffix: cfg.suffix,
        color: cfg.color,
      });
    }

    try {
      await SecureStore.setItemAsync(CACHED_METRICS_KEY, JSON.stringify(metrics));
    } catch { /* ignore */ }
    return metrics;
  }

  // ── Chart Data ────────────────────────────────────────────────────────

  async getChartData(type: MetricType, period: AnalyticsPeriod, dataPoints: ChartDataPoint[]): Promise<ChartDataset> {
    return {
      id: `chart_${type}_${period}`,
      label: type.charAt(0).toUpperCase() + type.slice(1),
      data: dataPoints,
      color: this.getMetricColor(type),
      fill: true,
    };
  }

  private getMetricColor(type: MetricType): string {
    const colors: Record<MetricType, string> = {
      revenue: '#10B981', leads: '#3B82F6', deals: '#8B5CF6',
      contacts: '#F59E0B', tasks: '#EC4899', appointments: '#06B6D4',
    };
    return colors[type] || '#6B7280';
  }

  // ── Period Comparison ─────────────────────────────────────────────────

  comparePeriods(current: number, previous: number): PeriodComparison {
    const { change, changePercent, trend } = calcChange(current, previous);
    return {
      current: { value: current, label: 'Período actual' },
      previous: { value: previous, label: 'Período anterior' },
      change,
      changePercent,
      trend,
    };
  }

  // ── Reports ───────────────────────────────────────────────────────────

  async getSavedReports(): Promise<AnalyticsReport[]> {
    try {
      const raw = await SecureStore.getItemAsync(REPORTS_KEY);
      if (raw) return JSON.parse(raw) as AnalyticsReport[];
    } catch { /* ignore */ }
    return [];
  }

  async saveReport(report: Omit<AnalyticsReport, 'id' | 'generatedAt'>): Promise<AnalyticsReport> {
    const all = await this.getSavedReports();
    const newReport: AnalyticsReport = {
      ...report,
      id: generateId(),
      generatedAt: Date.now(),
    };
    all.push(newReport);
    await this.persistReports(all);
    return newReport;
  }

  async deleteReport(id: string): Promise<void> {
    const all = await this.getSavedReports();
    await this.persistReports(all.filter(r => r.id !== id));
  }

  // ── Export ────────────────────────────────────────────────────────────

  async exportToCSV(metrics: MetricCard[], dataPoints: ChartDataPoint[]): Promise<string> {
    const headers = ['Metric', 'Value', 'Previous', 'Change', 'Change%', 'Trend'];
    const rows = metrics.map(m =>
      `${m.label},${m.value},${m.previousValue},${m.change},${m.changePercent}%,${m.trend}`
    );
    const dataRows = dataPoints.map(dp => `${dp.date},${dp.value}`);
    return [headers.join(','), ...rows, '', 'Date,Value', ...dataRows].join('\n');
  }

  private async persistReports(items: AnalyticsReport[]): Promise<void> {
    try {
      await SecureStore.setItemAsync(REPORTS_KEY, JSON.stringify(items));
    } catch {
      console.error('[AnalyticsService] Error saving reports');
    }
  }
}

export const analyticsService = new AnalyticsService();
