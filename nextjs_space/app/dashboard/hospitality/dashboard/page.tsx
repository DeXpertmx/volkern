'use client';

import { useEffect, useState, useCallback } from 'react';
import { toast } from 'sonner';
import {
  LayoutDashboard,
  Loader2,
  BedDouble,
  ArrowDownToLine,
  ArrowUpFromLine,
  CalendarClock,
  TrendingUp,
  DollarSign,
  CalendarCheck2,
  XCircle,
  Sparkles,
  Wrench,
  Moon,
  Building2,
  LineChart as LineChartIcon,
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
  LineChart,
  Line,
  AreaChart,
  Area,
  Legend,
} from 'recharts';
import { channelStyle, statusLabel } from '@/lib/hospitality/calendar';
import { formatearImporte } from '@/lib/moneda';
import AvisoIncidenciasConectividad from '@/components/hospitality/aviso-incidencias-conectividad';

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

interface OcupacionPropiedad {
  propertyId: string;
  nombre: string;
  totalUnidades: number;
  ocupacionMedia: number;
  puntos: Array<{ fecha: string; ocupadas: number; total: number; ocupacion: number }>;
}

interface IngresoCanalSerie {
  canal: string;
  total: number;
  puntos: Array<{ fecha: string; ingresos: number }>;
}

interface DashboardData {
  /** Divisa con la que se escriben los importes (la de las reservas del período
   *  y, si no hay, la moneda de reporte del tenant). La resuelve la API. */
  moneda: string;
  kpis: Kpis;
  mixCanales: CanalMix[];
  proximos7: DiaOcupacion[];
  ocupacionPropiedades: OcupacionPropiedad[];
  ingresosPorCanal: IngresoCanalSerie[];
  operaciones: {
    limpieza: Record<string, number>;
    mantenimiento: Record<string, number>;
  };
  /** Tablón para preparar el día siguiente (auxiliar: puede no venir). */
  movimientoManana?: {
    llegadas: Array<{ id: string; huesped: string; unidad: string; propiedad: string }>;
    salidas: Array<{ id: string; huesped: string; unidad: string; propiedad: string }>;
  } | null;
}

const PIE_COLORS = ['#FF5A5F', '#003580', '#00355F', '#DF7A00', '#4F46E5', '#64748B', '#059669', '#D97706'];

function pct(v: number): string {
  return `${Math.round(v * 100)}%`;
}

function money(v: number, moneda: string): string {
  return formatearImporte(v, moneda, 0);
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

  const { kpis, mixCanales, proximos7, ocupacionPropiedades, ingresosPorCanal, operaciones, movimientoManana, moneda } = data;
  const limpiezaPendiente = (operaciones.limpieza.pending || 0) + (operaciones.limpieza.in_progress || 0);
  const mantenimientoAbierto = (operaciones.mantenimiento.abierta || 0) + (operaciones.mantenimiento.en_proceso || 0);

  // ── Drill-down: ocupación por propiedad (filas por fecha, una serie por propiedad) ──
  // Claves posicionales (s0, s1...): constantes por fila para recharts y sin
  // depender del nombre/propertyId (evita colisiones y puntos en la ruta).
  const ocupPropData = (ocupacionPropiedades[0]?.puntos || []).map((p, i) => {
    const row: Record<string, number | string> = {
      fecha: p.fecha.slice(8), // "DD" para el eje
      fechaCompleta: p.fecha,
    };
    ocupacionPropiedades.forEach((s, si) => {
      row[`s${si}`] = Math.round((s.puntos[i]?.ocupacion || 0) * 100);
    });
    return row;
  });
  const ocupPropSeries = ocupacionPropiedades.map((s, si) => ({
    key: `s${si}`,
    nombre: s.nombre,
    media: s.ocupacionMedia,
    total: s.totalUnidades,
  }));

  // ── Drill-down: tendencia de ingresos por canal (área apilada) ──
  const ingresoCanalData = (ingresosPorCanal[0]?.puntos || []).map((p, i) => {
    const row: Record<string, number | string> = {
      fecha: p.fecha.slice(8),
      fechaCompleta: p.fecha,
    };
    ingresosPorCanal.forEach((s, ci) => {
      row[`c${ci}`] = Math.round(s.puntos[i]?.ingresos || 0);
    });
    return row;
  });
  const ingresoCanalSeries = ingresosPorCanal.map((s, ci) => ({
    key: `c${ci}`,
    canal: s.canal,
    label: channelStyle(s.canal).label,
    total: s.total,
    color: PIE_COLORS[ci % PIE_COLORS.length],
  }));
  const ingresoCanalTotal = ingresoCanalSeries.reduce((a, s) => a + s.total, 0);

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
      value: kpis.ingresos > 0 ? money(kpis.ingresos, moneda) : '—',
      sub: `${kpis.nochesVendidas} noches vendidas`,
      icon: DollarSign,
      color: 'text-emerald-600 bg-emerald-50',
    },
    {
      label: 'ADR',
      value: kpis.adr != null ? money(kpis.adr, moneda) : '—',
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

      {/* Reservas de canal que no se pudieron registrar (aviso, no un KPI) */}
      <AvisoIncidenciasConectividad />

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

      {/* Movimiento de mañana: el tablón para PREPARAR el día siguiente —
          quién llega, a qué unidad (asignación) y quién sale (limpieza).
          Con nombre, unidad y propiedad, no solo el recuento; si no hay nada
          para mañana, lo dice — un tablón vacío también es información. */}
      {movimientoManana && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <CalendarClock className="h-4 w-4 text-primary" />
              Movimiento de mañana
              <span className="text-xs font-normal text-muted-foreground">
                {movimientoManana.llegadas.length} llegada{movimientoManana.llegadas.length === 1 ? '' : 's'} ·{' '}
                {movimientoManana.salidas.length} salida{movimientoManana.salidas.length === 1 ? '' : 's'} — para asignar unidades y planificar limpiezas
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {movimientoManana.llegadas.length === 0 && movimientoManana.salidas.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">
                Sin movimientos para mañana: ni llegadas ni salidas previstas.
              </p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-emerald-700 mb-2 flex items-center gap-1.5">
                    <ArrowDownToLine className="h-3.5 w-3.5" /> Llegadas ({movimientoManana.llegadas.length})
                  </p>
                  {movimientoManana.llegadas.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-2">Ninguna llegada prevista.</p>
                  ) : (
                    <ul className="divide-y">
                      {movimientoManana.llegadas.map((m) => (
                        <li key={m.id} className="py-2 text-sm flex items-baseline justify-between gap-3">
                          <span className="font-medium truncate">{m.huesped}</span>
                          <span className="text-xs text-muted-foreground truncate text-right">
                            {m.unidad} · {m.propiedad}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-amber-700 mb-2 flex items-center gap-1.5">
                    <ArrowUpFromLine className="h-3.5 w-3.5" /> Salidas ({movimientoManana.salidas.length})
                  </p>
                  {movimientoManana.salidas.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-2">Ninguna salida prevista.</p>
                  ) : (
                    <ul className="divide-y">
                      {movimientoManana.salidas.map((m) => (
                        <li key={m.id} className="py-2 text-sm flex items-baseline justify-between gap-3">
                          <span className="font-medium truncate">{m.huesped}</span>
                          <span className="text-xs text-muted-foreground truncate text-right">
                            {m.unidad} · {m.propiedad}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

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
                        {c.ingresos > 0 && <> · {money(c.ingresos, moneda)}</>}
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

      {/* Drill-downs (30 días) */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="h-4 w-4 text-indigo-600" /> Ocupación por propiedad · 30 días
            </CardTitle>
          </CardHeader>
          <CardContent>
            {ocupPropData.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                Crea propiedades con unidades para ver su ocupación diaria
              </p>
            ) : (
              <>
                <div className="h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={ocupPropData} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="fecha" tick={{ fontSize: 10 }} interval={4} />
                      <YAxis tick={{ fontSize: 10 }} domain={[0, 100]} unit="%" width={40} />
                      <Tooltip
                        labelFormatter={(_, payload: any) => payload?.[0]?.payload?.fechaCompleta || ''}
                        formatter={(value: any, name: any) => [`${value}%`, String(name)]}
                      />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      {ocupPropSeries.map((s, i) => (
                        <Line
                          key={s.key}
                          type="monotone"
                          dataKey={s.key}
                          name={s.nombre}
                          stroke={PIE_COLORS[i % PIE_COLORS.length]}
                          strokeWidth={2}
                          dot={false}
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {ocupPropSeries.map((s) => (
                    <Badge key={s.key} className="bg-indigo-50 text-indigo-700 border-0 text-xs">
                      {s.nombre}: {Math.round(s.media * 100)}% medio · {s.total} ud.
                    </Badge>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <LineChartIcon className="h-4 w-4 text-emerald-600" /> Ingresos por canal · 30 días
            </CardTitle>
          </CardHeader>
          <CardContent>
            {ingresoCanalData.length === 0 || ingresoCanalTotal === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                Sin ingresos en el período para mostrar la tendencia por canal
              </p>
            ) : (
              <>
                <div className="h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={ingresoCanalData} margin={{ top: 4, right: 8, bottom: 0, left: -8 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="fecha" tick={{ fontSize: 10 }} interval={4} />
                      <YAxis tick={{ fontSize: 10 }} width={48} tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))} />
                      <Tooltip
                        labelFormatter={(_, payload: any) => payload?.[0]?.payload?.fechaCompleta || ''}
                        formatter={(value: any, name: any) => [money(Number(value), moneda), String(name)]}
                      />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      {ingresoCanalSeries.map((s) => (
                        <Area
                          key={s.key}
                          type="monotone"
                          dataKey={s.key}
                          name={s.label}
                          stackId="1"
                          stroke={s.color}
                          fill={s.color}
                          fillOpacity={0.35}
                          strokeWidth={2}
                        />
                      ))}
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {ingresoCanalSeries.map((s) => (
                    <Badge key={s.key} className="bg-emerald-50 text-emerald-700 border-0 text-xs">
                      {s.label}: {money(s.total, moneda)}
                    </Badge>
                  ))}
                </div>
              </>
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