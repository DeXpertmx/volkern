'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { 
  TrendingUp, 
  TrendingDown, 
  Users, 
  DollarSign, 
  ArrowUpRight, 
  ArrowDownRight,
  Activity,
  BarChart3,
  PieChart
} from 'lucide-react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  AreaChart,
  Area
} from 'recharts';

export default function SaaSMetricsPage() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        const res = await fetch('/api/admin/global-pulse');
        if (res.ok) {
          const json = await res.json();
          setData(json);
        }
      } catch (e) {
        console.error('Error fetching metrics:', e);
      } finally {
        setLoading(false);
      }
    };
    fetchMetrics();
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#1A365D]"></div>
    </div>
  );

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-4xl font-black text-[#1A365D] uppercase tracking-tighter italic">SaaS Command Center</h1>
        <p className="text-[#4A5568] font-bold text-xs uppercase tracking-widest opacity-60">Metricas Vitales de la Plataforma Volkern</p>
      </div>

      {/* Main KPI Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card className="bg-white border-[#E2E8F0] shadow-sm rounded-3xl overflow-hidden group hover:shadow-xl transition-all duration-500">
          <CardContent className="pt-8">
            <div className="flex justify-between items-start mb-4">
              <div className="p-3 bg-emerald-50 rounded-2xl text-emerald-600">
                <DollarSign size={20} />
              </div>
              <div className="flex items-center gap-1 text-emerald-600 font-bold text-xs bg-emerald-50 px-2 py-1 rounded-full">
                <ArrowUpRight size={12} />
                +12%
              </div>
            </div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total MRR</p>
            <h2 className="text-3xl font-black text-[#1A365D] tracking-tighter">€{data?.totalMrr?.toLocaleString()}</h2>
          </CardContent>
        </Card>

        <Card className="bg-white border-[#E2E8F0] shadow-sm rounded-3xl overflow-hidden group hover:shadow-xl transition-all duration-500">
          <CardContent className="pt-8">
            <div className="flex justify-between items-start mb-4">
              <div className="p-3 bg-indigo-50 rounded-2xl text-indigo-600">
                <Users size={20} />
              </div>
              <div className="flex items-center gap-1 text-indigo-600 font-bold text-xs bg-indigo-50 px-2 py-1 rounded-full">
                <ArrowUpRight size={12} />
                +5
              </div>
            </div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Active Tenants</p>
            <h2 className="text-3xl font-black text-[#1A365D] tracking-tighter">84</h2>
          </CardContent>
        </Card>

        <Card className="bg-white border-[#E2E8F0] shadow-sm rounded-3xl overflow-hidden group hover:shadow-xl transition-all duration-500">
          <CardContent className="pt-8">
            <div className="flex justify-between items-start mb-4">
              <div className="p-3 bg-rose-50 rounded-2xl text-rose-600">
                <TrendingDown size={20} />
              </div>
              <div className="flex items-center gap-1 text-rose-600 font-bold text-xs bg-rose-50 px-2 py-1 rounded-full">
                <TrendingDown size={12} />
                2.1%
              </div>
            </div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Logo Churn</p>
            <h2 className="text-3xl font-black text-[#1A365D] tracking-tighter">2.4%</h2>
          </CardContent>
        </Card>

        <Card className="bg-white border-[#E2E8F0] shadow-sm rounded-3xl overflow-hidden group hover:shadow-xl transition-all duration-500">
          <CardContent className="pt-8">
            <div className="flex justify-between items-start mb-4">
              <div className="p-3 bg-amber-50 rounded-2xl text-amber-600">
                <Activity size={20} />
              </div>
              <div className="flex items-center gap-1 text-emerald-600 font-bold text-xs bg-emerald-50 px-2 py-1 rounded-full">
                <TrendingUp size={12} />
                92%
              </div>
            </div>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">LTV:CAC Ratio</p>
            <h2 className="text-3xl font-black text-[#1A365D] tracking-tighter">4.2x</h2>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Revenue Growth Chart */}
        <Card className="bg-white border-[#E2E8F0] shadow-sm rounded-[2.5rem] overflow-hidden">
          <CardHeader className="p-8">
            <CardTitle className="text-xl font-black text-[#1A365D] uppercase tracking-tighter flex items-center gap-2">
              <BarChart3 size={20} />
              Revenue Evolution
            </CardTitle>
            <CardDescription className="text-xs font-bold text-slate-400 uppercase tracking-widest">Growth MoM (Last 7 Days Pulse)</CardDescription>
          </CardHeader>
          <CardContent className="p-8 pt-0 h-80">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data?.history || []}>
                <defs>
                  <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#1A365D" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#1A365D" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis 
                  dataKey="date" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 10, fontWeight: 'bold', fill: '#94a3b8' }} 
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 10, fontWeight: 'bold', fill: '#94a3b8' }} 
                />
                <Tooltip 
                  contentStyle={{ 
                    borderRadius: '16px', 
                    border: 'none', 
                    boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)',
                    fontSize: '12px',
                    fontWeight: 'bold'
                  }} 
                />
                <Area type="monotone" dataKey="value" stroke="#1A365D" strokeWidth={3} fillOpacity={1} fill="url(#colorValue)" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Churn Prediction Hub */}
        <Card className="bg-white border-[#E2E8F0] shadow-sm rounded-[2.5rem] overflow-hidden">
          <CardHeader className="p-8">
            <CardTitle className="text-xl font-black text-[#1A365D] uppercase tracking-tighter flex items-center gap-2">
              <PieChart size={20} />
              Churn Analysis
            </CardTitle>
            <CardDescription className="text-xs font-bold text-slate-400 uppercase tracking-widest">Predictive Health Score Aggregation</CardDescription>
          </CardHeader>
          <CardContent className="p-8 pt-0">
            <div className="space-y-6">
              {[
                { label: 'High Risk Tenants', count: 3, color: 'bg-rose-500', percentage: 4 },
                { label: 'Medium Risk Tenants', count: 12, color: 'bg-amber-500', percentage: 15 },
                { label: 'Healthy Growth', count: 69, color: 'bg-emerald-500', percentage: 81 }
              ].map((item) => (
                <div key={item.label} className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">{item.label}</span>
                    <span className="text-xs font-black text-[#1A365D]">{item.count} Accounts ({item.percentage}%)</span>
                  </div>
                  <div className="h-3 w-full bg-slate-50 rounded-full overflow-hidden border border-slate-100 p-0.5">
                    <div className={`${item.color} h-full rounded-full transition-all duration-1000`} style={{ width: `${item.percentage}%` }} />
                  </div>
                </div>
              ))}
            </div>
            
            <div className="mt-8 p-6 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
               <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2 text-center">Gemma Insight</p>
               <p className="text-xs text-center text-[#1A365D] font-bold">
                 "La salud global de las bóvedas se mantiene en un {data?.healthScore}%. Se detecta una oportunidad de expansión en el 15% de los tenants actuales."
               </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
