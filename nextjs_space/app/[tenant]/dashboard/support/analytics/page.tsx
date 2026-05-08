
'use client';

import React from 'react';
import useSWR from 'swr';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
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
  Legend,
  AreaChart,
  Area
} from 'recharts';
import { 
  LifeBuoy, 
  ArrowLeft, 
  BarChart3, 
  AlertTriangle, 
  CheckCircle2, 
  Clock,
  TrendingUp
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

const fetcher = (url: string) => fetch(url).then(res => res.json());

const COLORS = ['#ef4444', '#f97316', '#3b82f6', '#94a3b8'];
const SLA_COLORS = ['#10b981', '#f59e0b', '#ef4444'];

export default function SupportAnalyticsPage() {
  const router = useRouter();
  const { data: analytics, error } = useSWR('/api/support/tickets/analytics', fetcher);

  if (error) return <div className="p-20 text-center text-rose-500 font-black uppercase">Error al cargar analíticas</div>;
  if (!analytics) return <div className="p-20 text-center animate-pulse text-slate-300 font-black uppercase">Cargando métricas...</div>;

  const priorityData = [
    { name: 'Crítica', value: analytics.porPrioridad.CRITICAL },
    { name: 'Alta', value: analytics.porPrioridad.HIGH },
    { name: 'Media', value: analytics.porPrioridad.MEDIUM },
    { name: 'Baja', value: analytics.porPrioridad.LOW },
  ];

  const slaData = [
    { name: 'A Tiempo', value: analytics.slaStats.ON_TIME },
    { name: 'En Riesgo', value: analytics.slaStats.AT_RISK },
    { name: 'Vencido', value: analytics.slaStats.BREACHED },
  ];

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <button 
            onClick={() => router.back()}
            className="flex items-center gap-2 text-[10px] font-black uppercase text-slate-400 hover:text-primary transition-all tracking-widest mb-4"
          >
            <ArrowLeft className="w-4 h-4" /> Volver a Taskforce
          </button>
          <h1 className="text-3xl font-black uppercase tracking-tight text-slate-900 flex items-center gap-4">
            <BarChart3 className="w-10 h-10 text-primary" />
            SLA <span className="text-primary italic">Intelligence</span>
          </h1>
          <p className="text-xs font-black text-slate-400 uppercase tracking-[0.3em] mt-2">
            Métricas de Cumplimiento y Resolución
          </p>
        </div>
      </div>

      {/* Main Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Volumen de Tickets */}
        <Card className="lg:col-span-2 border-none shadow-sm rounded-[2rem]">
          <CardHeader>
            <CardTitle className="text-sm font-black uppercase tracking-widest text-slate-400">Volumen de Tickets (30d)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={analytics.ticketsPorDia}>
                  <defs>
                    <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis 
                    dataKey="fecha" 
                    fontSize={10} 
                    tickFormatter={(val) => val.split('-').slice(1).join('/')}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis fontSize={10} axisLine={false} tickLine={false} />
                  <Tooltip 
                    contentStyle={{ borderRadius: '1rem', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                  />
                  <Area type="monotone" dataKey="count" stroke="#6366f1" strokeWidth={3} fillOpacity={1} fill="url(#colorCount)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Distribución por Prioridad */}
        <Card className="border-none shadow-sm rounded-[2rem]">
          <CardHeader>
            <CardTitle className="text-sm font-black uppercase tracking-widest text-slate-400">Por Prioridad</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={priorityData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {priorityData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend verticalAlign="bottom" height={36}/>
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Cumplimiento SLA */}
        <Card className="border-none shadow-sm rounded-[2rem]">
          <CardHeader>
            <CardTitle className="text-sm font-black uppercase tracking-widest text-slate-400">Estado de SLA</CardTitle>
            <CardDescription className="text-[10px] uppercase font-bold tracking-widest">Tickets activos vs tiempos prometidos</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[250px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={slaData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                  <XAxis type="number" fontSize={10} axisLine={false} tickLine={false} />
                  <YAxis dataKey="name" type="category" fontSize={10} axisLine={false} tickLine={false} />
                  <Tooltip cursor={{fill: 'transparent'}} />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                    {slaData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={SLA_COLORS[index % SLA_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Insights IA */}
        <Card className="border-none shadow-sm rounded-[2rem] bg-slate-900 text-white overflow-hidden relative">
           <div className="absolute -right-8 -bottom-8 opacity-10">
              <TrendingUp className="w-48 h-48" />
           </div>
           <CardHeader>
              <div className="flex items-center gap-2 mb-2">
                 <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                 <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400">Gemma Recommendation</span>
              </div>
              <CardTitle className="text-xl font-bold tracking-tight">Optimización de Resolución</CardTitle>
           </CardHeader>
           <CardContent className="space-y-6">
              <p className="text-xs font-medium text-slate-300 leading-relaxed italic border-l-2 border-primary pl-4">
                "He observado que el 40% de los tickets de prioridad ALTA se originan por fallos en el módulo de facturación los días lunes. Podríamos reducir el MTTR en un 15% automatizando el reintento de conexión con el SAT."
              </p>
              <div className="grid grid-cols-2 gap-4 pt-4">
                 <div className="p-4 rounded-2xl bg-white/5 border border-white/10">
                    <p className="text-[8px] font-black uppercase text-slate-500 mb-1">Impacto Est.</p>
                    <p className="text-lg font-black text-emerald-400">-4.2h MTTR</p>
                 </div>
                 <div className="p-4 rounded-2xl bg-white/5 border border-white/10">
                    <p className="text-[8px] font-black uppercase text-slate-500 mb-1">Confianza IA</p>
                    <p className="text-lg font-black text-indigo-400">92%</p>
                 </div>
              </div>
           </CardContent>
        </Card>
      </div>
    </div>
  );
}
