'use client';

import useSWR from 'swr';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { 
  TrendingUp, 
  ArrowUpRight, 
  ArrowDownRight, 
  Calendar,
  DollarSign,
  Info,
  Download
} from 'lucide-react';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer 
} from 'recharts';
import { cn } from '@/lib/utils';

const fetcher = (url: string) => fetch(url).then(res => res.json());

export default function CashflowPage() {
  const { data, isLoading } = useSWR('/api/strategy/snapshot', fetcher);
  const projections = data?.projections || [];

  const chartData = projections.map((p: any) => ({
    date: new Date(p.targetDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
    balance: p.netBalance,
    inflow: p.expectedInflow,
    outflow: p.expectedOutflow
  }));

  if (isLoading) return <div className="p-8 animate-pulse space-y-8">
    <div className="h-10 w-64 bg-slate-100 rounded-full" />
    <div className="h-[400px] bg-slate-50 rounded-[3rem]" />
  </div>;

  return (
    <div className="p-8 space-y-8 bg-[#fafafa] min-h-screen">
      {/* Header */}
      <div className="flex justify-between items-end">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-emerald-600 font-bold uppercase text-[10px] tracking-widest">
            <TrendingUp className="w-4 h-4" />
            Liquidez Proyectada (90 Días)
          </div>
          <h1 className="text-4xl font-black text-slate-900 uppercase tracking-tight">
            Cashflow <span className="text-emerald-600">Forecast</span>
          </h1>
        </div>
        <Button variant="outline" className="rounded-2xl border-slate-200 h-12 font-black uppercase text-[10px] tracking-widest px-6 bg-white shadow-sm">
           <Download className="w-4 h-4 mr-2" /> Exportar Plan de Caja
        </Button>
      </div>

      {/* Main Chart */}
      <Card className="p-8 rounded-[3rem] border-none shadow-xl bg-white">
        <div className="h-[400px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="colorBalance" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis 
                dataKey="date" 
                axisLine={false} 
                tickLine={false} 
                tick={{ fontSize: 10, fontWeight: 700, fill: '#94a3b8' }} 
                dy={10}
              />
              <YAxis 
                axisLine={false} 
                tickLine={false} 
                tick={{ fontSize: 10, fontWeight: 700, fill: '#94a3b8' }} 
                tickFormatter={(value) => `$${value/1000}k`}
              />
              <Tooltip 
                contentStyle={{ borderRadius: '20px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', padding: '20px' }}
                itemStyle={{ fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase' }}
              />
              <Area 
                type="monotone" 
                dataKey="balance" 
                stroke="#10b981" 
                strokeWidth={4} 
                fillOpacity={1} 
                fill="url(#colorBalance)" 
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Breakdowns */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {projections.map((p: any, i: number) => (
          <Card key={i} className="p-8 rounded-[2.5rem] border-none shadow-sm bg-white hover:shadow-lg transition-all border-l-4 border-l-emerald-500">
             <div className="flex justify-between items-start mb-6">
                <div className="h-12 w-12 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-400">
                   <Calendar className="w-6 h-6" />
                </div>
                <div className={cn(
                  "px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest",
                  p.riskLevel === 'LOW' ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"
                )}>
                  Riesgo: {p.riskLevel}
                </div>
             </div>
             <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">
                Horizonte {i === 0 ? '30' : (i === 1 ? '60' : '90')} Días
             </p>
             <h3 className="text-3xl font-black text-slate-900 mb-6">
                ${p.netBalance.toLocaleString()}
             </h3>
             <div className="space-y-3">
                <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-widest">
                   <span className="text-slate-400 flex items-center gap-1"><ArrowUpRight className="w-3 h-3 text-emerald-500" /> Ingresos</span>
                   <span className="text-slate-900">${p.expectedInflow.toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-widest">
                   <span className="text-slate-400 flex items-center gap-1"><ArrowDownRight className="w-3 h-3 text-rose-500" /> Egresos</span>
                   <span className="text-slate-900">${p.expectedOutflow.toLocaleString()}</span>
                </div>
             </div>
          </Card>
        ))}
      </div>
    </div>
  );
}