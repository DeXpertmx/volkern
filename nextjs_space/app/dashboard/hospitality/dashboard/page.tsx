'use client';

import { useEffect, useState, useCallback } from 'react';
import { toast } from 'sonner';
import {
  LayoutDashboard,
  Loader2,
  BedDouble,
  ArrowDownToLine,
  ArrowUpFromLine,
  TrendingUp,
  DollarSign,
  CalendarCheck2,
  XCircle,
  Sparkles,
  Wrench,
  Moon,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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
import { channelStyle, statusLabel } from '@/lib/hospitality/calendar';

interface Kpis {
  totalUnidades: number;
  unidadesPorEstado: Record<string, number>;
  ocupacionHoy: number;
  ocupadasHoy: number;
  llegadasHoy: number;
  salidasHoy: number;
  reservasActivas: number;
  cancelaciones: number;
  ingresos: number;
  nochesVendidas: number;
  adr: number | null;
}

interface CanalMix {
  canal: string;
  reservas: number;
  ingresos: number;
}

interface DiaOcupacion {
  fecha: string;
  dia: number;
  mes: string;
  ocupadas: number;
  total: number;
  ocupacion: number;
}

interface DashboardData {
  kpis: Kpis;
  mixCanales: CanalMix[];
  proximos7: DiaOcupacion[];
  operaciones: {
    limpieza: Record<string, number>;
    mantenimiento: Record<string, number>;
  };
}

const PIE_COLORS = ['#FF5A5F', '#003580', '#00355F', '#DF7A00', '#4F46E5', '#64748B', '#059669', '#D97706'];

function pct(v: number): string {
  return `${Math.round(v * 100)}%`;
}

function money(v: number): string {
  return v.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 });
}

export default function HospitalityDashboardPage() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<DashboardData | null>(null);

  const cargar = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/hospitality/dashboard');
      if (res.ok) {
        const d = await res.json();
        setData(d);
      } else {
        toast.error('Error al cargar el dashboard');
      }
    } catch {
      toast.error('Error al cargar el dashboard');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No se pudo cargar el dashboard
          </CardContent>
        </Card>
      </div>
    );
  }

  const { kpis, mixCanales, proximos7, operaciones } = data;
  const limpiezaPendiente = (operaciones.limpieza.pending || 0) + (operaciones.limpieza.in_progress || 0);
  const mantenimientoAbierto = (operaciones.mantenimiento.abierta || 0) + (operaciones.mantenimiento.en_proceso || 0);

  const kpiCards = [
    {
      label: 'Ocupación hoy',
      value: pct(kpis.ocupacionHoy),
      sub: `${kpis.ocupadasHoy} de ${kpis.totalUnidades} unidades`,
      icon: BedDouble,
      color: 'text-indigo-600 bg-indigo-50',
    },
    {
      label: 'Llegadas hoy',
      value: String(kpis.llegadasHoy),
      sub: 'Check-ins del día',
      icon: ArrowDownToLine,
      color: 'text-emerald-600 bg-emerald-50',
    },
    {
      label: 'Salidas hoy',
      value: String(kpis.salidasHoy),
      sub: 'Check-outs del día',
      icon: ArrowUpFromLine,
      color: 'text-amber-600 bg-amber-50',
    },
    {
      label: 'Reservas activas',
      value: String(kpis.reservasActivas),
      sub: `${kpis.cancelaciones} canceladas en el período`,
      icon: CalendarCheck2,
      color: 'text-sky-600 bg-sky-50',
    },
    {
      label: 'Ingresos (30 días)',
      value: kpis.ingresos > 0 ? money(kpis.ingresos) : '—',
      sub: `${kpis.nochesVendidas} noches vendidas`,
      icon: DollarSign,
      color: 'text-emerald-600 bg-emerald-50',
    },
    {
      label: 'ADR',
      value: kpis.adr != null ? money(kpis.adr) : '—',
      sub: kpis.adr != null ? 'Ingreso medio por noche' : 'Sin base para calcular',
      icon: TrendingUp,
      color: 'text-violet-600 bg-violet-50',
    },
  ];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <LayoutDashboard className="h-8 w-8 text-primary" />
          Dashboard de Hospitalidad
        </h1>
        <p className="text-muted-foreground mt-1">
          Ocupación, ingresos y operaciones de tus propiedades alojativas
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        {kpiCards.map((k) => (
          <Card key={k.label}>
            <CardContent className="p-4">
              <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${k.color}`}>
                <k.icon className="h-5 w-5" />
              </div>
              <p className="text-2xl font-bold mt-3">{k.value}</p>
              <p className="text-xs font-medium text-muted-foreground">{k.label}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">{k.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Mix de canales + próximos 7 días */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Mix de canales</CardTitle>
          </CardHeader>
          <CardContent>
            {mixCanales.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                Sin reservas en el período para calcular el mix de canales
              </p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <RePieChart>
                      <Pie
                        data={mixCanales.map((c) => ({ name: channelStyle(c.canal).label, value: c.reservas }))}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={40}
                        outerRadius={75}
                        paddingAngle={2}
                      >
                        {mixCanales.map((_, i) => (
                          <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </RePieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-2">
                  {mixCanales.map((c, i) => (
                    <div key={c.canal} className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                        {channelStyle(c.canal).label}
                      </span>
                      <span className="text-muted-foreground">
                        {c.reservas} res.
                        {c.ingresos > 0 && <> · {money(c.ingresos)}</>}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Ocupación próximos 7 días</CardTitle>
          </CardHeader>
          <CardContent>
            {proximos7.every((d) => d.total === 0) ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                Sin unidades registradas para proyectar ocupación
              </p>
            ) : (
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={proximos7}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis
                      dataKey={(d) => `${d.dia} ${d.mes}`}
                      tick={{ fontSize: 11 }}
                      interval={0}
                    />
                    <YAxis
                      tick={{ fontSize: 11 }}
                      domain={[0, Math.max(1, ...proximos7.map((d) => d.total))]}
                      allowDecimals={false}
                      width={24}
                    />
                    <Tooltip
                      formatter={(value, _name, item: any) => [
                        `${value} / ${item?.payload?.total} unidades`,
                        'Ocupadas',
                      ]}
                    />
                    <Bar dataKey="ocupadas" fill="#4F46E5" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Operaciones */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-emerald-600" /> Limpieza
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="rounded-lg bg-emerald-50 p-3">
                <p className="text-2xl font-bold text-emerald-700">{operaciones.limpieza.pending || 0}</p>
                <p className="text-xs text-muted-foreground">Pendientes</p>
              </div>
              <div className="rounded-lg bg-sky-50 p-3">
                <p className="text-2xl font-bold text-sky-700">{operaciones.limpieza.in_progress || 0}</p>
                <p className="text-xs text-muted-foreground">En curso</p>
              </div>
              <div className="rounded-lg bg-slate-50 p-3">
                <p className="text-2xl font-bold text-slate-700">{operaciones.limpieza.completed || 0}</p>
                <p className="text-xs text-muted-foreground">Completadas</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Wrench className="h-4 w-4 text-amber-600" /> Mantenimiento
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="rounded-lg bg-amber-50 p-3">
                <p className="text-2xl font-bold text-amber-700">{operaciones.mantenimiento.abierta || 0}</p>
                <p className="text-xs text-muted-foreground">Abiertas</p>
              </div>
              <div className="rounded-lg bg-sky-50 p-3">
                <p className="text-2xl font-bold text-sky-700">{operaciones.mantenimiento.en_proceso || 0}</p>
                <p className="text-xs text-muted-foreground">En proceso</p>
              </div>
              <div className="rounded-lg bg-slate-50 p-3">
                <p className="text-2xl font-bold text-slate-700">{operaciones.mantenimiento.resuelta || 0}</p>
                <p className="text-xs text-muted-foreground">Resueltas</p>
              </div>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              {limpiezaPendiente > 0 || mantenimientoAbierto > 0
                ? `${limpiezaPendiente} limpieza(s) y ${mantenimientoAbierto} incidencia(s) requieren atención`
                : 'Todo al día: sin limpiezas ni incidencias pendientes'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Estado de unidades */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Estado de unidades</CardTitle>
        </CardHeader>
        <CardContent>
          {kpis.totalUnidades === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              Crea unidades en Inicio → Propiedades para ver su estado aquí
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {Object.entries(kpis.unidadesPorEstado).map(([estado, count]) => (
                <Badge key={estado} className="bg-slate-100 text-slate-700 border-0 text-xs">
                  <Moon className="h-3 w-3 mr-1" />
                  {count} {estado === 'available' ? 'disponible(s)' : estado === 'occupied' ? 'ocupada(s)' : estado === 'cleaning' ? 'en limpieza' : estado === 'dirty' ? 'por limpiar' : estado === 'maintenance' ? 'en mantenimiento' : estado}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}