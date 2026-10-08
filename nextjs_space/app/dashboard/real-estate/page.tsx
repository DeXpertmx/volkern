/**
 * Volkern Dashboard — Real Estate Analytics
 *
 * Página principal del dashboard inmobiliario con métricas en tiempo real,
 * gráficos de distribución, propiedades recientes y resumen de actividad.
 */

'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatearImporte } from '@/lib/moneda';
import {
  Home,
  DollarSign,
  TrendingUp,
  Building2,
  Calendar,
  MapPin,
  Loader2,
  Eye,
  Star,
  Users,
  RefreshCw,
  Activity,
  Sparkles,
  Download,
  PieChart,
  Banknote,
  Landmark,
  ArrowUpRight,
  Wallet,
  Store,
  ChevronDown,
  ChevronRight,
  FileSignature,
  Tag,
} from 'lucide-react';
import Link from 'next/link';
import { RealEstateModuleNav } from '@/components/real-estate/RealEstateModuleNav';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart as RePieChart,
  Pie,
  Cell,
} from 'recharts';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DashboardStats {
  /** Divisa de reporte del tenant, tal como la devuelve la API. */
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
  leads: { thisMonth: number; total: number };
  visits: { pending: number; completed: number; total: number };
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

const COMMISSION_COLORS = ['#8b5cf6', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#84cc16'];

interface CommissionOffice {
  tenantId: string;
  tenantNombre: string;
  totalComisiones: number;
  pendientes: number;
  pagadas: number;
  moneda: string;
  desglose: Array<{
    dealId: string;
    dealTitulo: string;
    agente: string;
    monto: number;
    estado: string;
    fecha: Date;
  }>;
}

interface FranchiseData {
  globalStats: {
    totalProperties: number;
    totalDeals: number;
    totalLeads: number;
    totalComisiones: number;
    totalComisionesCount: number;
    childTenants: Array<{ id: string; nombre: string; moneda: string }>;
  };
  commissions: CommissionOffice[];
  topProperties: Array<{
    id: string;
    nombre: string;
    precio: number;
    oficina: string;
    ciudad: string;
    imagen: string;
    fechaCreacion: string;
  }>;
  recentLeads: Array<{
    id: string;
    nombre: string;
    email: string;
    empresa: string;
    oficina: string;
    fechaCreacion: string;
  }>;
  dealsByStage: Array<{
    etapa: string;
    cantidad: number;
    valorTotal: number;
  }>;
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

const formatCurrency = (value: number, moneda?: string) =>
  formatearImporte(value, moneda || '', 0);

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function RealEstateDashboardPage() {
  const [data, setData] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [franchiseData, setFranchiseData] = useState<FranchiseData | null>(null);
  const [franchiseAvailable, setFranchiseAvailable] = useState(false);
  // Divisa de reporte del tenant: la misma con la que el servidor calcula los
  // importes. Antes el panel los escribía siempre en euros.
  const moneda = data?.moneda ?? '';

  const fetchData = async () => {
    setLoading(true);
    setFranchiseData(null);
    setFranchiseAvailable(false);
    try {
      const [statsRes, franchiseRes] = await Promise.allSettled([
        fetch('/api/real-estate/dashboard-stats'),
        fetch('/api/real-estate/franchise/overview'),
      ]);

      if (statsRes.status === 'fulfilled' && statsRes.value.ok) {
        const json = await statsRes.value.json();
        setData(json);
      }

      if (franchiseRes.status === 'fulfilled' && franchiseRes.value.ok) {
        const json = await franchiseRes.value.json();
        setFranchiseData(json);
        setFranchiseAvailable(true);
      }
    } catch (err) {
      console.error('[RealEstateDashboard] Error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto" />
          <p className="mt-4 text-muted-foreground">Cargando dashboard inmobiliario...</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-2">Sin datos</h2>
          <p className="text-muted-foreground mb-4">No hay datos disponibles para el dashboard</p>
          <Button onClick={fetchData}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Reintentar
          </Button>
        </div>
      </div>
    );
  }

  const { stats, leads, visits, recentProperties, distribution } = data;
  const operationData = (distribution.byOperation || []).map((d) => ({
    name: d.operation || 'Sin especificar',
    value: Number(d.count),
  }));
  const cityData = (distribution.byCity || []).map((d) => ({
    name: d.city || 'Sin ubicación',
    value: Number(d.count),
  }));

  return (
    <div className="flex-1 space-y-6 p-4 md:p-8 pt-6">
      <RealEstateModuleNav />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Building2 className="h-8 w-8 text-primary" />
            Dashboard Inmobiliario
          </h2>
          <p className="text-muted-foreground mt-1">
            Métricas en tiempo real de tu portafolio de propiedades
          </p>
        </div>
        <Button variant="outline" onClick={fetchData}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Actualizar
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="border-l-4 border-l-blue-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Propiedades</CardTitle>
            <Home className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
            <p className="text-xs text-muted-foreground">
              {stats.available} disponibles
            </p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-emerald-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Precio Promedio</CardTitle>
            <DollarSign className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(stats.avgPrice, moneda)}</div>
            <p className="text-xs text-muted-foreground">
              {formatCurrency(stats.avgPricePerM2, moneda)} / m²
            </p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-indigo-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Transacciones</CardTitle>
            <TrendingUp className="h-4 w-4 text-indigo-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.sold + stats.rented}</div>
            <p className="text-xs text-muted-foreground">
              <span className="text-blue-600">{stats.sold} vendidas</span>
              {' · '}
              <span className="text-emerald-600">{stats.rented} alquiladas</span>
            </p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-amber-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Reservadas</CardTitle>
            <Calendar className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.reserved}</div>
            <p className="text-xs text-muted-foreground">
              {stats.featured} destacadas
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Secondary KPIs */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Leads (Portal)</CardTitle>
            <Users className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold">{leads.thisMonth}</span>
              <span className="text-xs text-muted-foreground">este mes</span>
            </div>
            <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full"
                style={{
                  width: `${leads.total > 0 ? (leads.thisMonth / leads.total) * 100 : 0}%`,
                }}
              />
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {leads.total} leads totales
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Visitas Agendadas</CardTitle>
            <Eye className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold">{visits.pending}</span>
              <span className="text-xs text-muted-foreground">pendientes</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {visits.completed} completadas · {visits.total} total
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Destacadas</CardTitle>
            <Star className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold">{stats.featured}</span>
              <span className="text-xs text-muted-foreground">propiedades</span>
            </div>
            <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-amber-500 rounded-full"
                style={{
                  width: `${stats.total > 0 ? (stats.featured / stats.total) * 100 : 0}%`,
                }}
              />
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {stats.total > 0
                ? `${((stats.featured / stats.total) * 100).toFixed(0)}% del total`
                : '0% del total'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Operation Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PieChart className="h-5 w-5" />
              Por Tipo de Operación
            </CardTitle>
            <CardDescription>Distribución de propiedades por operación</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <RePieChart>
                  <Pie
                    data={operationData.length > 0 ? operationData : [{ name: 'Sin datos', value: 1 }]}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {(operationData.length > 0 ? operationData : [{ name: 'Sin datos', value: 1 }]).map(
                      (_entry: any, idx: number) => (
                        <Cell key={`cell-${idx}`} fill={COLORS[idx % COLORS.length]} />
                      )
                    )}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      borderRadius: '12px',
                      border: 'none',
                      boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                    }}
                  />
                </RePieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-wrap justify-center gap-4 mt-2">
              {operationData.map((d, idx) => (
                <div key={d.name} className="flex items-center gap-1.5 text-sm">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: COLORS[idx % COLORS.length] }}
                  />
                  <span className="capitalize">{d.name}</span>
                  <span className="font-bold">{d.value}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* City Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              Por Ciudad / Zona
            </CardTitle>
            <CardDescription>Top 10 ubicaciones con más propiedades</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={cityData.slice(0, 10)}
                  layout="vertical"
                  margin={{ top: 5, right: 20, left: 70, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} className="stroke-muted" />
                  <XAxis type="number" className="text-xs" />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={80}
                    tick={{ fontSize: 11 }}
                    className="text-xs"
                  />
                  <Tooltip
                    contentStyle={{
                      borderRadius: '12px',
                      border: 'none',
                      boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                    }}
                  />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                    {cityData.slice(0, 10).map((_entry: any, idx: number) => (
                      <Cell key={`cell-${idx}`} fill={COLORS[idx % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Franchise / Commission Section ── */}
      {franchiseAvailable && franchiseData && franchiseData.commissions.length > 0 && (
        <CommissionSection
          franchiseData={franchiseData}
          formatCurrency={(v: number) => formatCurrency(v, moneda)}
        />
      )}

      {/* Status Distribution + Recent Properties */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Status Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Estado de Propiedades
            </CardTitle>
            <CardDescription>Distribución general del inventario</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[
                { label: 'Disponibles', value: stats.available, color: 'bg-blue-500', textColor: 'text-blue-600' },
                { label: 'Reservadas', value: stats.reserved, color: 'bg-amber-500', textColor: 'text-amber-600' },
                { label: 'Vendidas', value: stats.sold, color: 'bg-emerald-500', textColor: 'text-emerald-600' },
                { label: 'Alquiladas', value: stats.rented, color: 'bg-indigo-500', textColor: 'text-indigo-600' },
              ].map((item) => (
                <div key={item.label} className="space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{item.label}</span>
                    <span className={cn('font-bold', item.textColor)}>
                      {item.value}
                      <span className="text-xs text-muted-foreground font-normal ml-1">
                        ({stats.total > 0 ? ((item.value / stats.total) * 100).toFixed(0) : 0}%)
                      </span>
                    </span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className={cn('h-full rounded-full transition-all', item.color)}
                      style={{
                        width: `${stats.total > 0 ? (item.value / stats.total) * 100 : 0}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Recent Properties */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Home className="h-5 w-5" />
              Propiedades Recientes
            </CardTitle>
            <CardDescription>Últimas 10 propiedades añadidas</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {recentProperties.slice(0, 8).map((prop) => (
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
                        {prop.tipo_operacion || '—'}
                      </Badge>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-bold text-primary">
                      {formatCurrency(prop.precioBase, moneda)}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {new Date(prop.fechaCreacion).toLocaleDateString('es-ES', {
                        day: 'numeric',
                        month: 'short',
                      })}
                    </p>
                  </div>
                </div>
              ))}
              {recentProperties.length === 0 && (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  No hay propiedades recientes
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card className="bg-gradient-to-r from-primary/5 via-primary/10 to-primary/5 border-primary/20">
        <CardContent className="p-6 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="space-y-1">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Acciones Rápidas
            </h3>
            <p className="text-sm text-muted-foreground">
              Gestiona tu portafolio inmobiliario desde un solo lugar
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button variant="default" asChild>
              <Link href="/dashboard/real-estate/properties">
                <Home className="h-4 w-4 mr-2" />
                Inmuebles
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/dashboard/real-estate/captaciones">
                <FileSignature className="h-4 w-4 mr-2" />
                Captaciones
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/dashboard/catalogo?tipo=inmueble">
                <Tag className="h-4 w-4 mr-2" />
                Catálogo
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/api/real-estate/export">
                <Download className="h-4 w-4 mr-2" />
                Exportar
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/p/propiedades">
                <Eye className="h-4 w-4 mr-2" />
                Portal Público
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Commission Section ────────────────────────────────────────────────────────

function CommissionSection({
  franchiseData,
  formatCurrency,
}: {
  franchiseData: FranchiseData;
  formatCurrency: (v: number) => string;
}) {
  const { globalStats, commissions } = franchiseData;
  const [expandedOffice, setExpandedOffice] = useState<string | null>(null);
  const [showAllCommissions, setShowAllCommissions] = useState(false);

  const totalAllCommissions = commissions.reduce((s, c) => s + c.totalComisiones, 0);
  const totalPendientes = commissions.reduce((s, c) => s + c.pendientes, 0);
  const totalPagadas = commissions.reduce((s, c) => s + c.pagadas, 0);

  // Datos para el gráfico de distribución por oficina
  const officeChartData = commissions.map((c, i) => ({
    name: c.tenantNombre,
    value: c.totalComisiones,
    fill: COMMISSION_COLORS[i % COMMISSION_COLORS.length],
  }));

  const displayedCommissions = showAllCommissions
    ? commissions
    : commissions.slice(0, 6);

  return (
    <div className="space-y-6">
      {/* Section Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Landmark className="h-7 w-7 text-purple-500" />
            Comisiones por Oficina
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            Resumen de comisiones consolidadas de todas las oficinas de la franquicia
          </p>
        </div>
        <Badge variant="secondary" className="gap-1.5">
          <Store className="h-3.5 w-3.5" />
          {globalStats.childTenants.length} oficinas
        </Badge>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="border-l-4 border-l-purple-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Comisiones</CardTitle>
            <Banknote className="h-4 w-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalAllCommissions)}</div>
            <p className="text-xs text-muted-foreground">
              {globalStats.totalComisionesCount} transacciones comisionadas
            </p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-amber-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pendientes</CardTitle>
            <Wallet className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">
              {formatCurrency(totalPendientes)}
            </div>
            <p className="text-xs text-muted-foreground">
              {totalAllCommissions > 0
                ? `${((totalPendientes / totalAllCommissions) * 100).toFixed(0)}% del total`
                : '0% del total'}
            </p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-emerald-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pagadas</CardTitle>
            <ArrowUpRight className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">
              {formatCurrency(totalPagadas)}
            </div>
            <p className="text-xs text-muted-foreground">
              {totalAllCommissions > 0
                ? `${((totalPagadas / totalAllCommissions) * 100).toFixed(0)}% del total`
                : '0% del total'}
            </p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-blue-500">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Propiedades</CardTitle>
            <Home className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{globalStats.totalProperties}</div>
            <p className="text-xs text-muted-foreground">
              {globalStats.totalDeals} deals activos
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Commission Charts Row */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Distribution by Office (Donut) */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PieChart className="h-5 w-5" />
              Distribución por Oficina
            </CardTitle>
            <CardDescription>Proporción de comisiones entre oficinas</CardDescription>
          </CardHeader>
          <CardContent>
            {officeChartData.length > 0 ? (
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <RePieChart>
                    <Pie
                      data={officeChartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {officeChartData.map((_entry: any, idx: number) => (
                        <Cell key={`cell-${idx}`} fill={COMMISSION_COLORS[idx % COMMISSION_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={((value: number) => [formatCurrency(value), 'Comisiones']) as any}
                      contentStyle={{
                        borderRadius: '12px',
                        border: 'none',
                        boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                      }}
                    />
                  </RePieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-72 flex items-center justify-center text-muted-foreground">
                Sin datos de comisiones
              </div>
            )}
            <div className="flex flex-wrap justify-center gap-3 mt-2">
              {officeChartData.map((d, idx) => (
                <div key={d.name} className="flex items-center gap-1.5 text-sm">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: COMMISSION_COLORS[idx % COMMISSION_COLORS.length] }}
                  />
                  <span className="truncate max-w-[100px]">{d.name}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Pending vs Paid by Office (Bar) */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Pendientes vs Pagadas
            </CardTitle>
            <CardDescription>Comparativa por oficina</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={displayedCommissions.map(c => ({
                    name: c.tenantNombre.split(' ').slice(0, 2).join(' '),
                    Pendientes: c.pendientes,
                    Pagadas: c.pagadas,
                  }))}
                  margin={{ top: 5, right: 10, left: 10, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 10 }}
                    angle={-20}
                    textAnchor="end"
                    height={60}
                  />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip
                    formatter={((value: number) => [formatCurrency(value), '']) as any}
                    contentStyle={{
                      borderRadius: '12px',
                      border: 'none',
                      boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                    }}
                  />
                  <Bar dataKey="Pendientes" radius={[4, 4, 0, 0]} fill="#f59e0b" />
                  <Bar dataKey="Pagadas" radius={[4, 4, 0, 0]} fill="#10b981" />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="flex items-center justify-center gap-6 mt-2 text-sm">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded bg-amber-500" />
                <span>Pendientes</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded bg-emerald-500" />
                <span>Pagadas</span>
              </div>
            </div>
            {commissions.length > 6 && (
              <div className="text-center mt-3">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowAllCommissions(!showAllCommissions)}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  {showAllCommissions ? (
                    <>Mostrar menos <ChevronDown className="h-3 w-3 ml-1" /></>
                  ) : (
                    <>Mostrar todas ({commissions.length} oficinas) <ChevronRight className="h-3 w-3 ml-1" /></>
                  )}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Per-Office Cards */}
      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {commissions.map((office, idx) => (
          <Card
            key={office.tenantId}
            className={cn(
              'overflow-hidden transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5',
              expandedOffice === office.tenantId && 'ring-2 ring-purple-400/50'
            )}
            style={{ borderTop: `3px solid ${COMMISSION_COLORS[idx % COMMISSION_COLORS.length]}` }}
          >
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold shrink-0"
                    style={{ backgroundColor: COMMISSION_COLORS[idx % COMMISSION_COLORS.length] }}
                  >
                    {office.tenantNombre.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <CardTitle className="text-sm font-semibold truncate">
                      {office.tenantNombre}
                    </CardTitle>
                    <CardDescription className="text-xs">
                      {office.desglose.length} transacción(es)
                    </CardDescription>
                  </div>
                </div>
                <Badge
                  variant={office.pendientes > 0 ? 'outline' : 'secondary'}
                  className={cn(
                    'text-[10px] shrink-0',
                    office.pendientes > 0
                      ? 'border-amber-300 text-amber-700 bg-amber-50'
                      : 'text-emerald-700 bg-emerald-50 border-emerald-300'
                  )}
                >
                  {office.pendientes > 0
                    ? `${office.pendientes === office.totalComisiones ? '100%' : ((office.pendientes / office.totalComisiones) * 100).toFixed(0)}% pendiente`
                    : 'Al día'}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="pb-4">
              <div className="grid grid-cols-3 gap-3 mb-3">
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Total</p>
                  <p className="text-sm font-bold">{formatCurrency(office.totalComisiones)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Pendiente</p>
                  <p className="text-sm font-bold text-amber-600">
                    {formatCurrency(office.pendientes)}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Pagado</p>
                  <p className="text-sm font-bold text-emerald-600">
                    {formatCurrency(office.pagadas)}
                  </p>
                </div>
              </div>

              {/* Progress bar */}
              <div className="h-1.5 bg-muted rounded-full overflow-hidden mb-3">
                {office.totalComisiones > 0 && (
                  <div className="flex h-full">
                    <div
                      className="h-full bg-amber-400 rounded-l-full transition-all"
                      style={{
                        width: `${(office.pendientes / office.totalComisiones) * 100}%`,
                      }}
                    />
                    <div
                      className="h-full bg-emerald-500 rounded-r-full transition-all"
                      style={{
                        width: `${(office.pagadas / office.totalComisiones) * 100}%`,
                      }}
                    />
                  </div>
                )}
              </div>

              {/* Expandable desglose */}
              {office.desglose.length > 0 && (
                <div>
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedOffice(
                        expandedOffice === office.tenantId ? null : office.tenantId
                      )
                    }
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors w-full"
                  >
                    {expandedOffice === office.tenantId ? (
                      <ChevronDown className="h-3 w-3" />
                    ) : (
                      <ChevronRight className="h-3 w-3" />
                    )}
                    Ver detalle ({office.desglose.length} transacciones)
                  </button>

                  {expandedOffice === office.tenantId && (
                    <div className="mt-2 space-y-1.5 max-h-48 overflow-y-auto">
                      {office.desglose.slice(0, 10).map((d) => (
                        <div
                          key={d.dealId}
                          className="flex items-center justify-between text-xs py-1 px-2 rounded bg-muted/50"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-medium">{d.dealTitulo}</p>
                            <p className="text-muted-foreground">{d.agente}</p>
                          </div>
                          <div className="text-right shrink-0 ml-2">
                            <p className="font-medium">{formatCurrency(d.monto)}</p>
                            <Badge
                              variant="outline"
                              className={cn(
                                'text-[9px] px-1 py-0',
                                d.estado === 'pagada'
                                  ? 'border-emerald-300 text-emerald-700'
                                  : d.estado === 'aprobada'
                                  ? 'border-blue-300 text-blue-700'
                                  : 'border-amber-300 text-amber-700'
                              )}
                            >
                              {d.estado}
                            </Badge>
                          </div>
                        </div>
                      ))}
                      {office.desglose.length > 10 && (
                        <p className="text-[10px] text-muted-foreground text-center pt-1">
                          +{office.desglose.length - 10} transacciones más
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Stats Footer */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="bg-gradient-to-br from-purple-50 to-white border-purple-100">
          <CardContent className="p-4 flex items-center gap-3">
            <Building2 className="h-8 w-8 text-purple-500" />
            <div>
              <p className="text-xs text-muted-foreground">Total Propiedades</p>
              <p className="text-xl font-bold">{globalStats.totalProperties}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-blue-50 to-white border-blue-100">
          <CardContent className="p-4 flex items-center gap-3">
            <Users className="h-8 w-8 text-blue-500" />
            <div>
              <p className="text-xs text-muted-foreground">Leads (Portal)</p>
              <p className="text-xl font-bold">{globalStats.totalLeads}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-indigo-50 to-white border-indigo-100">
          <CardContent className="p-4 flex items-center gap-3">
            <TrendingUp className="h-8 w-8 text-indigo-500" />
            <div>
              <p className="text-xs text-muted-foreground">Deals Activos</p>
              <p className="text-xl font-bold">{globalStats.totalDeals}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
