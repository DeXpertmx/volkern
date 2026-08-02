'use client';

import React, { useEffect, useState, useMemo } from 'react';
import {
  Shield,
  Building2,
  Package,
  FileText,
  TrendingUp,
  AlertTriangle,
  Download,
  RefreshCw,
  ArrowRight,
  CalendarClock,
  Clock,
  Sparkles,
  Calendar,
  Target,
} from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { TimelineMensual, type TimelineData } from '@/components/insurance/TimelineMensual';
import { ForecastCard, type ForecastData } from '@/components/insurance/ForecastCard';
import { SmartForecastCard, type SmartForecastFE } from '@/components/insurance/SmartForecastCard';
import { formatCurrency, formatDate, formatRelative } from '@/components/insurance/portfolio-format';

interface PortfolioSnapshot {
  generado: string;
  kpis: {
    aseguradoras: number;
    productos: number;
    polizasActivas: number;
    polizasVencidas: number;
    primaTotal: number;
    primaPromedio: number;
  };
  alertas: {
    polizasPorVencer30d: number;
    polizasPorVencer60d: number;
    polizasSinComisionCount: number;
  };
  mixPorRamo: Array<{
    ramo: string;
    ramoLabel: string;
    polizasCount: number;
    primaTotal: number;
  }>;
  topAseguradoras: Array<{
    id: string;
    nombre: string;
    polizasCount: number;
    primaTotal: number;
  }>;
  ultimasPolizas: Array<{
    id: string;
    numeroPoliza: string;
    cliente: string | null;
    aseguradora: string | null;
    producto: string | null;
    ramo: string | null;
    estado: string;
    primaAnual: number;
    fechaVencimiento: string;
    createdAt: string;
  }>;
  productosSinComision: Array<{
    polizaId: string;
    numeroPoliza: string;
    aseguradora: string | null;
    producto: string | null;
    primaAnual: number;
  }>;
}

const ESTADO_POLIZA_LABELS: Record<string, string> = {
  ACTIVA: 'Activa',
  PROXIMA_A_VENCER: 'Por vencer',
  VENCIDA: 'Vencida',
  CANCELADA: 'Cancelada',
  EN_TRAMITE: 'En trámite',
};

const ESTADO_POLIZA_COLORS: Record<string, string> = {
  ACTIVA: 'bg-green-100 text-green-800',
  PROXIMA_A_VENCER: 'bg-amber-100 text-amber-800',
  VENCIDA: 'bg-red-100 text-red-800',
  CANCELADA: 'bg-slate-200 text-slate-700',
  EN_TRAMITE: 'bg-blue-100 text-blue-800',
};

const RAMO_COLORS: Record<string, string> = {
  AUTO: 'bg-blue-500',
  HOGAR: 'bg-emerald-500',
  VIDA: 'bg-violet-500',
  SALUD: 'bg-pink-500',
  GASTOS_MEDICOS: 'bg-rose-500',
  EMPRESARIAL: 'bg-indigo-500',
  RESPONSABILIDAD_CIVIL: 'bg-amber-500',
  INCENDIO: 'bg-orange-500',
  TRANSPORTE: 'bg-cyan-500',
  AHORRO: 'bg-teal-500',
  JUBILACION: 'bg-purple-500',
  OTROS: 'bg-slate-400',
};

function exportToCSV(data: PortfolioSnapshot): void {
  const rows: string[] = ['Sección,Métrica,Valor'];
  rows.push(`KPIs,Aseguradoras activas,${data.kpis.aseguradoras}`);
  rows.push(`KPIs,Productos publicados,${data.kpis.productos}`);
  rows.push(`KPIs,Pólizas activas,${data.kpis.polizasActivas}`);
  rows.push(`KPIs,Pólizas vencidas,${data.kpis.polizasVencidas}`);
  rows.push(`KPIs,Prima anual total,${data.kpis.primaTotal}`);
  rows.push(`KPIs,Prima promedio,${data.kpis.primaPromedio}`);
  rows.push(`Alertas,Pólizas por vencer 30d,${data.alertas.polizasPorVencer30d}`);
  rows.push(`Alertas,Pólizas por vencer 60d,${data.alertas.polizasPorVencer60d}`);
  rows.push(`Alertas,Pólizas sin comisión,${data.alertas.polizasSinComisionCount}`);
  for (const r of data.mixPorRamo) {
    rows.push(`Mix por ramo,${r.ramoLabel},${r.polizasCount} pólizas / ${formatCurrency(r.primaTotal)}`);
  }
  for (const t of data.topAseguradoras) {
    rows.push(`Top aseguradora,${t.nombre},${t.polizasCount} pólizas / ${formatCurrency(t.primaTotal)}`);
  }

  const csv = '\uFEFF' + rows.join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `portfolio-seguros-${Date.now()}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export default function PortfolioPage() {
  const [snapshot, setSnapshot] = useState<PortfolioSnapshot | null>(null);
  const [timeline, setTimeline] = useState<TimelineData | null>(null);
  const [timelineLoading, setTimelineLoading] = useState(true);
  const [forecast, setForecast] = useState<ForecastData | null>(null);
  const [forecastLoading, setForecastLoading] = useState(true);
  const [smartForecast, setSmartForecast] = useState<SmartForecastFE | null>(null);
  const [smartLoading, setSmartLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  async function loadSnapshot() {
    try {
      setLoading(true);
      const res = await apiFetch('/api/insurance/portfolio');
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? 'No pude obtener el snapshot');
      setSnapshot(data);
      setLastRefresh(new Date());
      // Refresca el timeline + forecast en paralelo — son independientes del snapshot.
      loadTimeline();
      loadForecast();
      loadSmartForecast();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al cargar el portfolio');
    } finally {
      setLoading(false);
    }
  }

  async function loadTimeline() {
    try {
      setTimelineLoading(true);
      const res = await apiFetch('/api/insurance/portfolio/timeline?months=12');
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? 'No pude obtener el timeline');
      setTimeline(data);
    } catch (err) {
      console.error('Error al cargar el timeline:', err);
    } finally {
      setTimelineLoading(false);
    }
  }

  async function loadForecast() {
    try {
      setForecastLoading(true);
      const res = await apiFetch('/api/insurance/portfolio/forecast');
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? 'No pude obtener el forecast');
      setForecast(data);
    } catch (err) {
      console.error('Error al cargar el forecast:', err);
    } finally {
      setForecastLoading(false);
    }
  }

  async function loadSmartForecast() {
    try {
      setSmartLoading(true);
      const res = await apiFetch('/api/insurance/portfolio/forecast/smart');
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? 'No pude obtener el forecast smart');
      setSmartForecast(data);
    } catch (err) {
      console.error('Error al cargar el forecast smart:', err);
    } finally {
      setSmartLoading(false);
    }
  }

  useEffect(() => {
    loadSnapshot();
    loadTimeline();
    loadForecast();
    loadSmartForecast();
  }, []);

  const maxRamoPrima = useMemo(() => {
    if (!snapshot || snapshot.mixPorRamo.length === 0) return 0;
    return Math.max(...snapshot.mixPorRamo.map(r => r.primaTotal));
  }, [snapshot]);

  const maxTopPrima = useMemo(() => {
    if (!snapshot || snapshot.topAseguradoras.length === 0) return 0;
    return Math.max(...snapshot.topAseguradoras.map(a => a.primaTotal));
  }, [snapshot]);

  if (loading && !snapshot) {
    return (
      <div className="flex items-center justify-center py-24">
        <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
        <span className="ml-3 text-sm text-muted-foreground">Cargando portfolio…</span>
      </div>
    );
  }

  if (!snapshot) {
    return (
      <div className="text-center py-24">
        <Shield className="w-12 h-12 text-muted-foreground mx-auto mb-3 opacity-30" />
        <p className="text-sm text-muted-foreground">No pude cargar el snapshot del portfolio.</p>
      </div>
    );
  }

  const { kpis, alertas, mixPorRamo, topAseguradoras, ultimasPolizas, productosSinComision } = snapshot;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-amber-500" />
            Portfolio Ejecutivo
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Vista 360° del vertical Seguros · Última actualización{' '}
            {lastRefresh ? formatRelative(lastRefresh.toISOString()).replace('En ', 'hace ') : '—'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => loadSnapshot()} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refrescar
          </Button>
          <Button variant="outline" size="sm" onClick={() => exportToCSV(snapshot)}>
            <Download className="w-4 h-4 mr-2" />
            Exportar CSV
          </Button>
        </div>
      </div>

      {/* 4 KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5 text-xs">
              <Building2 className="w-4 h-4" />
              Aseguradoras activas
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{kpis.aseguradoras}</div>
            <p className="text-xs text-muted-foreground mt-1">en cartera</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5 text-xs">
              <Package className="w-4 h-4" />
              Productos publicados
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{kpis.productos}</div>
            <p className="text-xs text-muted-foreground mt-1">de todas las aseguradoras</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5 text-xs">
              <FileText className="w-4 h-4" />
              Pólizas activas
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{kpis.polizasActivas}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {kpis.polizasVencidas > 0 && (
                <span className="text-red-600">+ {kpis.polizasVencidas} vencidas</span>
              )}
              {kpis.polizasVencidas === 0 && <span className="text-green-600">sin vencidas</span>}
            </p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-emerald-50 to-emerald-100 border-emerald-200">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5 text-xs text-emerald-700">
              <TrendingUp className="w-4 h-4" />
              Prima anual total
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-emerald-700">{formatCurrency(kpis.primaTotal)}</div>
            <p className="text-xs text-emerald-700/70 mt-1">
              promedio: {formatCurrency(kpis.primaPromedio)} / póliza
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Timeline de prima mensual: visualiza el último YYYY-MM de los últimos 12 meses */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-emerald-600" />
            Timeline de prima emitida
          </CardTitle>
          <CardDescription>
            Evolución mensual para entender tendencia, mejor mes y volumen del libro
          </CardDescription>
        </CardHeader>
        <CardContent>
          {timeline ? (
            <TimelineMensual data={timeline} loading={timelineLoading} />
          ) : (
            <div className="text-sm text-muted-foreground text-center py-8">
              Aún no hay datos de timeline.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Forecast: proyección lineal del próximo mes basada en los últimos 6 meses */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="w-5 h-5 text-indigo-600" />
            ¿Cuánto emitiré el próximo mes?
          </CardTitle>
          <CardDescription>
            Regresión lineal sobre los últimos 6 meses con intervalo de confianza
          </CardDescription>
        </CardHeader>
        <CardContent>
          {forecast || forecastLoading ? (
            <ForecastCard data={forecast} loading={forecastLoading && !forecast} />
          ) : (
            <div className="text-sm text-muted-foreground text-center py-8">
              Aún no hay suficientes datos para proyectar.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Forecast smart: base + multipliers estacionales aprendidos */}
      <Card className="border-indigo-200">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-indigo-600" />
            Forecast inteligente con eventos estacionales
          </CardTitle>
          <CardDescription>
            Combina el forecast base con multipliers aprendidos por Semana Santa,
            Vuelta al Cole, Fin de Año y campañas de Google Calendar
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SmartForecastCard data={smartForecast} loading={smartLoading && !smartForecast} />
        </CardContent>
      </Card>

      {/* Alertas (si las hay) */}
      {(alertas.polizasPorVencer30d > 0 ||
        alertas.polizasPorVencer60d > 0 ||
        alertas.polizasSinComisionCount > 0) && (
        <Card className="border-amber-200 bg-amber-50/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-amber-900">
              <AlertTriangle className="w-5 h-5" />
              Alertas que requieren atención
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {alertas.polizasPorVencer30d > 0 && (
                <a
                  href="/dashboard/seguros/renovaciones"
                  className="block p-3 rounded-lg border border-red-200 bg-red-50 hover:bg-red-100 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-red-600" />
                      <span className="text-sm font-medium text-red-900">
                        {alertas.polizasPorVencer30d} pólizas
                      </span>
                    </div>
                    <ArrowRight className="w-4 h-4 text-red-600" />
                  </div>
                  <p className="text-xs text-red-700 mt-1">
                    vencen en los próximos 30 días
                  </p>
                </a>
              )}
              {alertas.polizasPorVencer60d > 0 && (
                <a
                  href="/dashboard/seguros/polizas"
                  className="block p-3 rounded-lg border border-amber-200 bg-amber-50 hover:bg-amber-100 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CalendarClock className="w-4 h-4 text-amber-700" />
                      <span className="text-sm font-medium text-amber-900">
                        {alertas.polizasPorVencer60d} pólizas
                      </span>
                    </div>
                    <ArrowRight className="w-4 h-4 text-amber-700" />
                  </div>
                  <p className="text-xs text-amber-800 mt-1">vencen entre 30 y 60 días</p>
                </a>
              )}
              {alertas.polizasSinComisionCount > 0 && (
                <a
                  href="/dashboard/seguros/polizas"
                  className="block p-3 rounded-lg border border-purple-200 bg-purple-50 hover:bg-purple-100 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-purple-600" />
                      <span className="text-sm font-medium text-purple-900">
                        {alertas.polizasSinComisionCount} pólizas sin comisión
                      </span>
                    </div>
                    <ArrowRight className="w-4 h-4 text-purple-600" />
                  </div>
                  <p className="text-xs text-purple-700 mt-1">
                    revisar para recuperar margen
                  </p>
                </a>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Distribución por ramo + Top aseguradoras */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-violet-600" />
              Mix por ramo
            </CardTitle>
            <CardDescription>Prima total acumulada por línea de negocio</CardDescription>
          </CardHeader>
          <CardContent>
            {mixPorRamo.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                Aún no hay pólizas para clasificar por ramo.
              </p>
            ) : (
              <div className="space-y-3">
                {mixPorRamo.map(r => {
                  const pct = maxRamoPrima > 0 ? Math.round((r.primaTotal / maxRamoPrima) * 100) : 0;
                  return (
                    <div key={r.ramo}>
                      <div className="flex items-center justify-between text-sm mb-1">
                        <div className="flex items-center gap-2">
                          <span className={`h-2.5 w-2.5 rounded-full ${RAMO_COLORS[r.ramo] ?? 'bg-slate-400'}`} />
                          <span className="font-medium">{r.ramoLabel}</span>
                          <Badge variant="outline" className="text-xs">
                            {r.polizasCount}
                          </Badge>
                        </div>
                        <span className="text-sm text-muted-foreground tabular-nums">
                          {formatCurrency(r.primaTotal)}
                        </span>
                      </div>
                      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full ${RAMO_COLORS[r.ramo] ?? 'bg-slate-400'} transition-all`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="w-5 h-5 text-blue-600" />
              Top 5 aseguradoras por prima
            </CardTitle>
            <CardDescription>Ranking del libro activo por prima anual</CardDescription>
          </CardHeader>
          <CardContent>
            {topAseguradoras.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                Sin datos suficientes para ranking.
              </p>
            ) : (
              <div className="space-y-3">
                {topAseguradoras.map((a, idx) => {
                  const pct = maxTopPrima > 0 ? Math.round((a.primaTotal / maxTopPrima) * 100) : 0;
                  return (
                    <div
                      key={a.id}
                      className="flex items-center gap-3 py-2"
                    >
                      <div className="flex items-center justify-center w-7 h-7 rounded-full bg-blue-100 text-blue-700 font-bold text-sm flex-shrink-0">
                        {idx + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-medium truncate">{a.nombre}</span>
                          <span className="text-sm text-muted-foreground tabular-nums ml-2">
                            {formatCurrency(a.primaTotal)}
                          </span>
                        </div>
                        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-blue-500 transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {a.polizasCount} {a.polizasCount === 1 ? 'póliza' : 'pólizas'}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Tabla últimas pólizas */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-emerald-600" />
                Últimas 10 pólizas creadas
              </CardTitle>
              <CardDescription>Trazabilidad rápida de los movimientos más recientes</CardDescription>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <a href="/dashboard/seguros/polizas">
                Ver todas
                <ArrowRight className="w-4 h-4 ml-1" />
              </a>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {ultimasPolizas.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No hay pólizas registradas todavía.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left font-medium text-muted-foreground py-2 px-2">Nº Póliza</th>
                    <th className="text-left font-medium text-muted-foreground py-2 px-2">Cliente</th>
                    <th className="text-left font-medium text-muted-foreground py-2 px-2 hidden md:table-cell">Aseguradora</th>
                    <th className="text-left font-medium text-muted-foreground py-2 px-2 hidden lg:table-cell">Producto</th>
                    <th className="text-right font-medium text-muted-foreground py-2 px-2">Prima</th>
                    <th className="text-center font-medium text-muted-foreground py-2 px-2">Estado</th>
                    <th className="text-right font-medium text-muted-foreground py-2 px-2 hidden sm:table-cell">Vence</th>
                  </tr>
                </thead>
                <tbody>
                  {ultimasPolizas.map(p => (
                    <tr key={p.id} className="border-b last:border-0 hover:bg-slate-50">
                      <td className="py-2 px-2 font-mono text-xs">{p.numeroPoliza}</td>
                      <td className="py-2 px-2 truncate max-w-[180px]">{p.cliente ?? '—'}</td>
                      <td className="py-2 px-2 truncate max-w-[160px] hidden md:table-cell">{p.aseguradora ?? '—'}</td>
                      <td className="py-2 px-2 truncate max-w-[180px] hidden lg:table-cell">{p.producto ?? '—'}</td>
                      <td className="py-2 px-2 text-right tabular-nums">{formatCurrency(p.primaAnual)}</td>
                      <td className="py-2 px-2 text-center">
                        <Badge variant="outline" className={ESTADO_POLIZA_COLORS[p.estado] ?? ''}>
                          {ESTADO_POLIZA_LABELS[p.estado] ?? p.estado}
                        </Badge>
                      </td>
                      <td className="py-2 px-2 text-right text-xs text-muted-foreground hidden sm:table-cell">
                        {formatRelative(p.fechaVencimiento)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pólizas sin comisión (lista expandida) */}
      {productosSinComision.length > 0 && (
        <Card className="border-purple-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-purple-900">
              <TrendingUp className="w-5 h-5" />
              Pólizas sin comisión registrada ({productosSinComision.length})
            </CardTitle>
            <CardDescription>
              Oportunidad de recuperar margen — ordenadas por prima descendente
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {productosSinComision.map(p => (
                <li
                  key={p.polizaId}
                  className="flex items-center justify-between py-2 border-b last:border-0"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-xs truncate">{p.numeroPoliza}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {p.aseguradora ?? '—'} · {p.producto ?? '—'}
                    </p>
                  </div>
                  <span className="text-sm font-semibold tabular-nums text-purple-700">
                    {formatCurrency(p.primaAnual)}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
