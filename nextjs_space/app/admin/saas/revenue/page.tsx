'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  DollarSign, 
  TrendingUp, 
  TrendingDown, 
  ArrowUpRight, 
  Calendar,
  Download,
  CreditCard,
  PieChart,
  Activity
} from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Cell
} from 'recharts';

export default function GlobalRevenuePage() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    const fetchRevenue = async () => {
      try {
        const res = await fetch('/api/admin/global-pulse');
        if (res.ok) {
          const json = await res.json();
          setData(json);
        }
      } catch (e) {
        console.error('Error fetching revenue:', e);
      } finally {
        setLoading(false);
      }
    };
    fetchRevenue();
  }, []);

  const planData = [
    { name: 'Starter', value: 45, color: '#10b981' },
    { name: 'Growth', value: 30, color: '#3b82f6' },
    { name: 'Pro', value: 15, color: '#8b5cf6' },
    { name: 'Enterprise', value: 10, color: '#1A365D' },
  ];

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
    </div>
  );

  return (
    <div className="space-y-10">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-4xl font-black text-[#1A365D] uppercase tracking-tighter italic">Global Revenue</h1>
          <p className="text-[#4A5568] font-bold text-xs uppercase tracking-widest opacity-60">Monitoreo de Ingresos y Facturacion</p>
        </div>
        <div className="flex gap-4">
          <Button variant="outline" className="rounded-xl h-12 border-slate-200 bg-white text-[10px] font-black uppercase tracking-widest text-[#1A365D] hover:bg-slate-50">
            <Download size={16} className="mr-2" /> Reporte Fiscal
          </Button>
          <Button className="rounded-xl h-12 px-6 bg-[#1A365D] text-white font-black uppercase tracking-widest text-[10px] shadow-lg shadow-indigo-900/10">
             Cerrar Mes Contable
          </Button>
        </div>
      </div>

      {/* Financial Health Snapshot */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="bg-[#1A365D] text-white shadow-2xl rounded-[2.5rem] border-none p-8 relative overflow-hidden group">
          <DollarSign className="absolute top-[-10px] right-[-10px] h-40 w-40 opacity-5 group-hover:scale-110 transition-transform duration-1000" />
          <div className="relative z-10">
             <p className="text-[10px] font-black text-white/50 uppercase tracking-[0.2em] mb-2">Current Total MRR</p>
             <h2 className="text-5xl font-black tracking-tighter mb-4">€{data?.totalMrr?.toLocaleString()}</h2>
             <div className="flex items-center gap-2">
                <Badge className="bg-emerald-500 text-white border-none text-[9px] font-black uppercase tracking-widest">MoM +12.4%</Badge>
                <span className="text-[10px] font-bold text-white/40">vs €{(data?.totalMrr * 0.88).toLocaleString()} last month</span>
             </div>
          </div>
        </Card>

        <div className="grid grid-cols-1 gap-6">
           <Card className="bg-white border-[#E2E8F0] shadow-sm rounded-3xl p-6 flex items-center justify-between group hover:border-[#1A365D]/20 transition-all">
              <div>
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Average Revenue Per Unit (ARPU)</p>
                <h3 className="text-2xl font-black text-[#1A365D] tracking-tight">€142.50</h3>
              </div>
              <div className="p-3 bg-indigo-50 rounded-2xl text-indigo-600 group-hover:scale-110 transition-transform">
                <TrendingUp size={20} />
              </div>
           </Card>
           <Card className="bg-white border-[#E2E8F0] shadow-sm rounded-3xl p-6 flex items-center justify-between group hover:border-[#1A365D]/20 transition-all">
              <div>
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Lifetime Value (LTV)</p>
                <h3 className="text-2xl font-black text-[#1A365D] tracking-tight">€5,240</h3>
              </div>
              <div className="p-3 bg-emerald-50 rounded-2xl text-emerald-600 group-hover:scale-110 transition-transform">
                <TrendingUp size={20} />
              </div>
           </Card>
        </div>

        <Card className="bg-white border-[#E2E8F0] shadow-sm rounded-[2.5rem] overflow-hidden p-8 flex flex-col justify-between">
           <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Plan Distribution (by Revenue)</p>
              <div className="space-y-4">
                 {planData.map(plan => (
                   <div key={plan.name} className="flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: plan.color }} />
                      <div className="flex-1 flex justify-between items-center">
                         <span className="text-[10px] font-bold text-[#1A365D] uppercase">{plan.name}</span>
                         <span className="text-xs font-black text-[#1A365D]">{plan.value}%</span>
                      </div>
                   </div>
                 ))}
              </div>
           </div>
           <div className="mt-6 h-2 w-full bg-slate-50 rounded-full flex overflow-hidden border border-slate-100">
              {planData.map(plan => (
                <div key={plan.name} style={{ width: `${plan.value}%`, backgroundColor: plan.color }} />
              ))}
           </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Revenue Forecast */}
        <Card className="bg-white border-[#E2E8F0] shadow-sm rounded-[2.5rem] lg:col-span-2 overflow-hidden">
           <CardHeader className="p-8">
             <CardTitle className="text-xl font-black text-[#1A365D] uppercase tracking-tighter flex items-center gap-2">
               <Activity size={20} />
               Revenue Forecast (Next 6 Months)
             </CardTitle>
             <CardDescription className="text-xs font-bold text-slate-400 uppercase tracking-widest">Basado en tendencias de crecimiento y renovaciones activas</CardDescription>
           </CardHeader>
           <CardContent className="p-8 pt-0 h-80">
              <ResponsiveContainer width="100%" height="100%">
                 <BarChart data={[
                   { name: 'Jun', revenue: 12400, forecast: 13500 },
                   { name: 'Jul', revenue: 14200, forecast: 15800 },
                   { name: 'Ago', revenue: 16500, forecast: 18200 },
                   { name: 'Sep', revenue: 0, forecast: 21500 },
                   { name: 'Oct', revenue: 0, forecast: 24800 },
                   { name: 'Nov', revenue: 0, forecast: 28500 }
                 ]}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis 
                      dataKey="name" 
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
                      cursor={{ fill: '#f8fafc' }}
                      contentStyle={{ 
                        borderRadius: '16px', 
                        border: 'none', 
                        boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)',
                        fontSize: '12px'
                      }} 
                    />
                    <Bar dataKey="revenue" fill="#1A365D" radius={[6, 6, 0, 0]} />
                    <Bar dataKey="forecast" fill="#1A365D" opacity={0.15} radius={[6, 6, 0, 0]} />
                 </BarChart>
              </ResponsiveContainer>
           </CardContent>
        </Card>

        {/* Quick Billing Status */}
        <Card className="bg-white border-[#E2E8F0] shadow-sm rounded-[2.5rem] overflow-hidden">
           <CardHeader className="p-8">
             <CardTitle className="text-xl font-black text-[#1A365D] uppercase tracking-tighter flex items-center gap-2">
               <CreditCard size={20} />
               Billing Status
             </CardTitle>
           </CardHeader>
           <CardContent className="p-8 pt-0 space-y-6">
              {[
                { label: 'Facturado este mes', amount: '€14,250', status: '85% Cobrado', color: 'bg-emerald-500' },
                { label: 'Pendiente de cobro', amount: '€2,420', status: 'Vence en 48h', color: 'bg-amber-500' },
                { label: 'Facturacion Fallida', amount: '€490', status: 'Reintentando...', color: 'bg-rose-500' }
              ].map((item, i) => (
                <div key={i} className="flex items-center gap-4 p-4 rounded-2xl border border-slate-50 bg-slate-50/50">
                  <div className={`h-2 w-2 rounded-full ${item.color}`} />
                  <div className="flex-1">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{item.label}</p>
                    <p className="text-lg font-black text-[#1A365D]">{item.amount}</p>
                    <p className="text-[9px] font-bold text-slate-500 opacity-60 uppercase">{item.status}</p>
                  </div>
                </div>
              ))}
              
              <Button className="w-full rounded-2xl h-14 bg-slate-900 text-white font-black uppercase tracking-widest text-[10px] hover:bg-black transition-all">
                Abrir Stripe Global Dashboard
              </Button>
           </CardContent>
        </Card>
      </div>
    </div>
  );
}
