/**
 * Volkern CMS - Real Estate Dashboard Widgets (Puck)
 *
 * Componentes analíticos para el dashboard inmobiliario.
 * Se consumen como widgets Puck en páginas editables.
 */

"use client";

import React, { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatearImporte } from "@/lib/moneda";
import {
  Home,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Building2,
  Calendar,
  MapPin,
  Loader2,
  Bed,
  Bath,
  Maximize,
  Eye,
  Star,
  Users,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
} from "recharts";

// ─── Types ────────────────────────────────────────────────────────────────────

interface DashboardStats {
  /**
   * Moneda de reporte del tenant: con la que el servidor calcula los importes
   * de este panel. Antes el panel escribía todo en euros a mano.
   */
  moneda?: string;
  stats: {
    total: number;
    available: number;
    reserved: number;
    sold: number;
    rented: number;
    featured: number;
    avgPrice: number;
    avgPricePerM2: number;
  };
  leads: {
    thisMonth: number;
    total: number;
  };
  visits: {
    pending: number;
    completed: number;
    total: number;
  };
  recentProperties: Array<{
    id: string;
    nombre: string;
    precioBase: number;
    ciudad: string;
    tipo_operacion: string;
    imagen: string;
    fechaCreacion: string;
  }>;
  distribution: {
    byOperation: Array<{ operation: string; count: number }>;
    byCity: Array<{ city: string; count: number }>;
  };
}

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899"];

const formatCurrency = (value: number, moneda?: string) =>
  formatearImporte(value, moneda || "", 0);

// ─── API Hook ─────────────────────────────────────────────────────────────────

function useDashboardStats() {
  const [data, setData] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/real-estate/dashboard-stats")
      .then((r) => {
        if (!r.ok) throw new Error("Error al cargar estadísticas");
        return r.json();
      })
      .then((json) => {
        setData(json);
      })
      .catch((err) => {
        console.error("[DashboardStats] Error:", err);
        setError(err.message);
      })
      .finally(() => setLoading(false));
  }, []);

  return { data, loading, error };
}

// ─── Widget 1: KPI Stats Cards ────────────────────────────────────────────────

export interface RealEstateStatsWidgetProps {
  title?: string;
  showAvgPrice?: boolean;
  showAvgM2?: boolean;
  showFeatured?: boolean;
  columns?: 2 | 3 | 4;
}

export const RealEstateStatsWidget: React.FC<RealEstateStatsWidgetProps> = ({
  title = "Panel de Métricas",
  showAvgPrice = true,
  showAvgM2 = true,
  showFeatured = true,
  columns = 4,
}) => {
  const { data, loading, error } = useDashboardStats();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p className="text-lg">{error || "Sin datos disponibles"}</p>
      </div>
    );
  }

  const { stats } = data;
  const moneda = data.moneda || "";

  const kpis = [
    {
      label: "Total Propiedades",
      value: stats.total,
      icon: Home,
      color: "blue",
      sub: `${stats.available} disponibles`,
    },
    {
      label: "Precio Promedio",
      value: showAvgPrice ? formatCurrency(stats.avgPrice, moneda) : "",
      icon: DollarSign,
      color: "emerald",
      sub: showAvgM2 ? `${formatCurrency(stats.avgPricePerM2, moneda)}/m²` : "",
    },
    {
      label: "Vendidas / Alquiladas",
      value: `${stats.sold + stats.rented}`,
      icon: TrendingUp,
      color: "indigo",
      sub: `${stats.sold} vendidas · ${stats.rented} alquiladas`,
    },
    {
      label: "Reservadas",
      value: stats.reserved,
      icon: Calendar,
      color: "amber",
      sub: showFeatured ? `${stats.featured} destacadas` : "",
    },
  ];

  const gridCols = {
    2: "grid-cols-1 sm:grid-cols-2",
    3: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
    4: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4",
  };

  return (
    <div className="space-y-4">
      {title && (
        <h3 className="text-lg font-semibold text-foreground">{title}</h3>
      )}
      <div className={cn("grid gap-4", gridCols[columns])}>
        {kpis.map((kpi, idx) => (
          <Card key={idx} className="overflow-hidden border-l-4 border-l-primary/20">
            <CardContent className="p-4 md:p-5">
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    {kpi.label}
                  </p>
                  <p className="text-2xl font-bold">{kpi.value}</p>
                  {kpi.sub && (
                    <p className="text-xs text-muted-foreground">{kpi.sub}</p>
                  )}
                </div>
                <div
                  className={cn(
                    "h-10 w-10 rounded-xl flex items-center justify-center",
                    kpi.color === "blue" && "bg-blue-50 text-blue-600",
                    kpi.color === "emerald" && "bg-emerald-50 text-emerald-600",
                    kpi.color === "indigo" && "bg-indigo-50 text-indigo-600",
                    kpi.color === "amber" && "bg-amber-50 text-amber-600"
                  )}
                >
                  <kpi.icon className="w-5 h-5" />
                </div>
              </div>
              {/* Mini bar */}
              <div className="mt-3 h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full transition-all duration-700",
                    kpi.color === "blue" && "bg-blue-500",
                    kpi.color === "emerald" && "bg-emerald-500",
                    kpi.color === "indigo" && "bg-indigo-500",
                    kpi.color === "amber" && "bg-amber-500"
                  )}
                  style={{
                    width: `${
                      kpi.label === "Total Propiedades" && stats.total > 0
                        ? 100
                        : kpi.label === "Precio Promedio"
                          ? 70
                          : kpi.label === "Vendidas / Alquiladas" && stats.total > 0
                            ? ((stats.sold + stats.rented) / stats.total) * 100
                            : stats.total > 0
                              ? (stats.reserved / stats.total) * 100
                              : 0
                    }%`,
                  }}
                />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

// ─── Widget 2: Distribution Charts ────────────────────────────────────────────

export interface RealEstateChartWidgetProps {
  title?: string;
  chartType?: "operation" | "city" | "both";
}

export const RealEstateChartWidget: React.FC<RealEstateChartWidgetProps> = ({
  title = "Distribución de Propiedades",
  chartType = "both",
}) => {
  const { data, loading, error } = useDashboardStats();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p className="text-lg">{error || "Sin datos"}</p>
      </div>
    );
  }

  const operationData = (data.distribution.byOperation || []).map((d) => ({
    name: d.operation || "Sin especificar",
    value: Number(d.count),
  }));

  const cityData = (data.distribution.byCity || []).map((d) => ({
    name: d.city || "Sin ubicación",
    value: Number(d.count),
  }));

  const showOperation = chartType === "operation" || chartType === "both";
  const showCity = chartType === "city" || chartType === "both";

  return (
    <div className="space-y-4">
      {title && (
        <h3 className="text-lg font-semibold text-foreground">{title}</h3>
      )}
      <div className={cn("grid gap-6", showOperation && showCity ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1")}>
        {showOperation && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Por Tipo de Operación</CardTitle>
            </CardHeader>
            <CardContent className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={operationData.length > 0 ? operationData : [{ name: "Sin datos", value: 1 }]}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {(operationData.length > 0 ? operationData : [{ name: "Sin datos", value: 1 }]).map(
                      (_entry: any, idx: number) => (
                        <Cell
                          key={`cell-${idx}`}
                          fill={COLORS[idx % COLORS.length]}
                          className="hover:opacity-80 transition-opacity"
                        />
                      )
                    )}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      borderRadius: "12px",
                      border: "none",
                      boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)",
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap justify-center gap-3 mt-2">
                {operationData.map((d, idx) => (
                  <div key={d.name} className="flex items-center gap-1.5 text-xs">
                    <div
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: COLORS[idx % COLORS.length] }}
                    />
                    <span className="text-muted-foreground capitalize">{d.name}</span>
                    <span className="font-medium">{d.value}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {showCity && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Por Ciudad / Zona</CardTitle>
            </CardHeader>
            <CardContent className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={cityData.slice(0, 8)}
                  layout="vertical"
                  margin={{ top: 5, right: 20, left: 60, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} className="stroke-muted" />
                  <XAxis type="number" className="text-xs" />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={80}
                    tick={{ fontSize: 10 }}
                    className="text-xs"
                  />
                  <Tooltip
                    contentStyle={{
                      borderRadius: "12px",
                      border: "none",
                      boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)",
                    }}
                  />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                    {cityData.slice(0, 8).map((_entry: any, idx: number) => (
                      <Cell
                        key={`cell-${idx}`}
                        fill={COLORS[idx % COLORS.length]}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

// ─── Widget 3: Recent Properties ──────────────────────────────────────────────

export interface RealEstateRecentWidgetProps {
  title?: string;
  maxItems?: number;
  showLeads?: boolean;
  showVisits?: boolean;
}

export const RealEstateRecentWidget: React.FC<RealEstateRecentWidgetProps> = ({
  title = "Actividad Reciente",
  maxItems = 5,
  showLeads = true,
  showVisits = true,
}) => {
  const { data, loading, error } = useDashboardStats();

  const summaryItems = useMemo(() => {
    if (!data) return [];
    const items = [];
    if (showLeads) {
      items.push({
        icon: Users,
        label: "Leads del mes",
        value: data.leads.thisMonth,
        total: data.leads.total,
        color: "blue",
      });
    }
    if (showVisits) {
      items.push({
        icon: Eye,
        label: "Visitas pendientes",
        value: data.visits.pending,
        total: data.visits.total,
        color: "amber",
      });
    }
    return items;
  }, [data, showLeads, showVisits]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <p>{error || "Sin datos"}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {title && (
        <h3 className="text-lg font-semibold text-foreground">{title}</h3>
      )}

      {/* Mini summary chips */}
      {summaryItems.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {summaryItems.map((item, idx) => (
            <Card key={idx} className="flex-1 min-w-[120px]">
              <CardContent className="p-3 flex items-center gap-3">
                <div
                  className={cn(
                    "h-8 w-8 rounded-lg flex items-center justify-center",
                    item.color === "blue" && "bg-blue-50 text-blue-600",
                    item.color === "amber" && "bg-amber-50 text-amber-600"
                  )}
                >
                  <item.icon className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-lg font-bold leading-none">{item.value}</p>
                  <p className="text-xs text-muted-foreground">{item.label}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Recent properties list */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Propiedades Recientes</CardTitle>
          <CardDescription>Últimas propiedades añadidas</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-border">
            {data.recentProperties.slice(0, maxItems).map((prop) => (
              <div
                key={prop.id}
                className="flex items-center gap-3 p-3 hover:bg-muted/50 transition-colors"
              >
                <div className="h-12 w-16 rounded-lg overflow-hidden flex-shrink-0 bg-muted">
                  {prop.imagen ? (
                    <img
                      src={prop.imagen}
                      alt={prop.nombre}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center">
                      <Home className="w-5 h-5 text-muted-foreground/50" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{prop.nombre}</p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    {prop.ciudad && (
                      <span className="flex items-center gap-0.5">
                        <MapPin className="w-3 h-3" />
                        {prop.ciudad}
                      </span>
                    )}
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                      {prop.tipo_operacion || "—"}
                    </Badge>
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-bold text-primary">
                    {formatCurrency(prop.precioBase, data.moneda)}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {new Date(prop.fechaCreacion).toLocaleDateString("es-ES", {
                      day: "numeric",
                      month: "short",
                    })}
                  </p>
                </div>
              </div>
            ))}
            {data.recentProperties.length === 0 && (
              <div className="text-center py-8 text-muted-foreground text-sm">
                No hay propiedades recientes
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
