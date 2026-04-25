'use client';

import React from 'react';
import useSWR from 'swr';
import { cn } from '@/lib/utils';

import { Card } from '@/components/ui/card';
import { 
  LineChart as ReLineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar
} from 'recharts';
import { 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  Target, 
  Activity, 
  Zap,
  ArrowRight,
  Sparkles,
  AlertTriangle
} from 'lucide-react';
import { Button } from '@/components/ui/button';

const fetcher = (url: string) => fetch(url).then(res => res.json());

export default function StrategyDashboard() {
  const { data: snapshot } = useSWR('/api/strategy/snapshot', fetcher);
  const { data: alerts } = useSWR('/api/strategy/alerts', fetcher);

  const cashflowData = snapshot?.projections?.map((p: any) => ({
    name: new Date(p.targetDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
    balance: p.netBalance
  })) || [
    { name: 'Hoy', balance: 50000 },
    { name: '30d', balance: 58000 },
    { name: '60d', balance: 52000 },
    { name: '90d', balance: 65000 },
  ];

  const profitabilityData = snapshot?.profitability?.map((p: any) => ({
    name: p.entityId.substring(0, 8),
    margin: p.margin,
    support: Math.floor(p.operationalCost / 50) || 10,
  })) || [
    { name: 'Proyecto A', margin: 45, support: 10 },
    { name: 'Proyecto B', margin: -12, support: 45 },
    { name: 'Proyecto C', margin: 28, support: 15 },
    { name: 'Proyecto D', margin: 60, support: 5 },
  ];

  const activeAlert = alerts?.[0] || null;

  return (
    <div className="p-8 space-y-10 bg-[#fafafa] min-h-screen">
      {/* Header */}
      <div className="flex justify-between items-end">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-indigo-600 font-bold uppercase text-[10px] tracking-[0.2em]">
            <Sparkles className="w-4 h-4" />
            Volkern Strategy Hub
          </div>
          <h1 className="text-5xl font-black text-slate-900 tracking-tight uppercase">
            Executive <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-violet-600">Snapshot</span>
          </h1>
        </div>
        <div className="flex gap-4">
           <Button className="rounded-2xl h-12 px-8 font-black uppercase text-[10px] tracking-widest bg-slate-900 shadow-xl shadow-slate-200">
              Generar Reporte Q2
           </Button>
        </div>
      </div>

      {/* Main KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {[
          { label: 'Margen Global', value: '32.4%', sub: '+4.2%', icon: Target, color: 'indigo' },
          { label: 'Caja Proyectada (90d)', value: '$65,000', sub: 'Tendencia estable', icon: DollarSign, color: 'emerald' },
          { label: 'Churn Rate', value: '1.2%', sub: '-0.5%', icon: TrendingDown, color: 'rose' },
          { label: 'Health Score', value: '88/100', sub: 'Excelente', icon: Activity, color: 'violet' }
        ].map((kpi, i) => (
          <Card key={i} className="p-6 rounded-[2.5rem] border-none shadow-sm bg-white hover:shadow-xl transition-all group">
            <div className={`h-12 w-12 rounded-2xl bg-${kpi.color}-50 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform`}>
              <kpi.icon className={`w-6 h-6 text-${kpi.color}-600`} />
            </div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{kpi.label}</p>
            <div className="flex items-end gap-3">
              <h3 className="text-3xl font-black text-slate-900">{kpi.value}</h3>
              <span className={`text-[10px] font-bold pb-1 ${kpi.sub.includes('+') ? 'text-emerald-500' : 'text-rose-500'}`}>
                {kpi.sub}
              </span>
            </div>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Cashflow Projection Chart */}
        <Card className="lg:col-span-2 p-8 rounded-[3rem] border-none shadow-sm bg-white">
          <div className="flex justify-between items-center mb-8">
            <div className="space-y-1">
              <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">Proyección de Flujo de Caja</h3>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Horizonte de 90 días basado en Pipeline</p>
            </div>
            <Badge className="bg-emerald-50 text-emerald-600 border-none font-black text-[10px] uppercase px-4 py-2 rounded-full">
              Riesgo Bajo
            </Badge>
          </div>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={cashflowData}>
                <defs>
                  <linearGradient id="colorBalance" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#4f46e5" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 10, fontWeight: 900, fill: '#94a3b8'}} />
                <YAxis axisLine={false} tickLine={false} tick={{fontSize: 10, fontWeight: 900, fill: '#94a3b8'}} />
                <Tooltip 
                  contentStyle={{borderRadius: '20px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)'}}
                />
                <Area type="monotone" dataKey="balance" stroke="#4f46e5" strokeWidth={4} fillOpacity={1} fill="url(#colorBalance)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Alerts & Insights */}
        <div className="space-y-6">
          <Card className="p-8 rounded-[3rem] border-none shadow-2xl bg-slate-900 text-white overflow-hidden relative">
            <div className="absolute top-0 right-0 p-8 opacity-10">
              <Zap className="w-32 h-32 text-indigo-400" />
            </div>
            <div className="relative z-10 space-y-6">
              <div className="flex items-center gap-2 text-indigo-400 font-black uppercase text-[10px] tracking-widest">
                <Zap className="w-4 h-4" />
                {activeAlert?.fallback ? "Sistema Degradado" : "Gemma Strategic AI"}
              </div>
              <h3 className="text-2xl font-black leading-tight uppercase">
                {activeAlert ? activeAlert.message : "Detectada anomalía de rentabilidad"}
              </h3>
              <p className="text-sm font-medium text-slate-400 leading-relaxed">
                {activeAlert?.fallback ? "La IA estratégica está temporalmente inactiva. Mostrando métricas base." : (activeAlert ? "La IA ha determinado un riesgo estratégico. Requiere revisión inmediata por el comité ejecutivo." : "El Proyecto B ha superado el umbral de soporte operativo en un 400% respecto al mes anterior.")}
              </p>
              <Button className="w-full h-12 rounded-2xl bg-indigo-600 hover:bg-indigo-500 font-black uppercase text-[10px] tracking-widest border-none shadow-lg shadow-indigo-500/20">
                Ver Análisis Detallado
              </Button>
            </div>
          </Card>

          <Card className="p-8 rounded-[3rem] border-none shadow-sm bg-white space-y-6">
             <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em]">Top Riesgos Q2</h3>
             <div className="space-y-4">
                {[
                  { label: 'Exceso de Horas Soporte', value: 'Alta', color: 'rose' },
                  { label: 'Vencimiento Licencias IT', value: 'Media', color: 'amber' },
                  { label: 'Churn Riesgo Cliente #10', value: 'Baja', color: 'indigo' }
                ].map((item, i) => (
                  <div key={i} className="flex items-center justify-between p-4 rounded-2xl bg-slate-50">
                    <span className="text-[10px] font-black text-slate-700 uppercase">{item.label}</span>
                    <span className={`text-[8px] font-black uppercase px-2 py-1 rounded-md bg-${item.color}-100 text-${item.color}-600`}>
                      {item.value}
                    </span>
                  </div>
                ))}
             </div>
          </Card>
        </div>
      </div>

      {/* Profitability Sniffer Preview */}
      <Card className="p-8 rounded-[3rem] border-none shadow-sm bg-white">
        <div className="flex justify-between items-center mb-10">
          <div className="space-y-1">
            <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">Profitability Sniffer</h3>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Análisis cruzado de ingresos vs. carga operativa</p>
          </div>
          <Button variant="ghost" className="text-[10px] font-black uppercase tracking-widest text-indigo-600">
            Ver Todos <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {profitabilityData.map((item, i) => (
            <div key={i} className="p-6 rounded-[2rem] border border-slate-50 space-y-6">
              <div className="flex justify-between items-start">
                 <div className="h-10 w-10 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400">
                    <Activity className="w-5 h-5" />
                 </div>
                 <div className={`px-3 py-1 rounded-full text-[8px] font-black uppercase ${item.margin > 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                    Margin: {item.margin}%
                 </div>
              </div>
              <div>
                 <p className="text-[10px] font-black text-slate-900 uppercase mb-1">{item.name}</p>
                 <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                    <div className="bg-indigo-600 h-full" style={{ width: `${item.support}%` }} />
                 </div>
                 <p className="text-[8px] font-bold text-slate-400 uppercase mt-2">Uso Soporte: {item.support}h</p>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function Badge({ children, className }: { children: React.ReactNode, className?: string }) {
  return (
    <span className={cn("px-2 py-1 rounded-md text-[8px] font-black uppercase", className)}>
      {children}
    </span>
  );
}
