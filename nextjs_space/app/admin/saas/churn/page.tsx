'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Users, 
  TrendingDown, 
  AlertTriangle, 
  ShieldAlert, 
  Clock, 
  ArrowRight,
  Frown,
  Activity
} from 'lucide-react';
import { toast } from 'sonner';

export default function ChurnManagementPage() {
  const [loading, setLoading] = useState(true);
  const [tenantsAtRisk, setTenantsAtRisk] = useState<any[]>([]);

  useEffect(() => {
    const fetchRiskData = async () => {
      try {
        const res = await fetch('/api/admin/tenants?status=activo&limit=100');
        if (res.ok) {
          const data = await res.json();
          // Simulate risk assessment
          const risky = data.tenants
            .filter((t: any) => t.mrr < 100 || t._count.leads < 10)
            .map((t: any) => ({
              ...t,
              riskScore: Math.floor(Math.random() * 40) + 60, // 60-99%
              lastLogin: 'Hace 4 días'
            }));
          setTenantsAtRisk(risky);
        }
      } catch (err) {
        toast.error('Error al cargar radar de churn');
      } finally {
        setLoading(false);
      }
    };
    fetchRiskData();
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Activity className="h-10 w-10 animate-spin text-rose-500" />
    </div>
  );

  return (
    <div className="space-y-10">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-4xl font-black text-[#1A365D] uppercase tracking-tighter italic">Churn Radar</h1>
          <p className="text-[#4A5568] font-bold text-xs uppercase tracking-widest opacity-60">Prevencion Proactiva de Cancelaciones</p>
        </div>
        <Badge className="bg-rose-500 text-white font-black text-[10px] uppercase px-4 py-1 animate-pulse border-none">
          Alerta: 3 Cuentas en Riesgo Crítico
        </Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="bg-white border-rose-100 shadow-sm rounded-3xl overflow-hidden">
          <CardContent className="pt-8">
             <div className="flex items-center gap-3 mb-4">
               <div className="p-3 bg-rose-50 rounded-2xl text-rose-600">
                 <Frown size={24} />
               </div>
               <div>
                 <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">Net Revenue Churn</p>
                 <h2 className="text-3xl font-black text-rose-600 tracking-tighter">1.8%</h2>
               </div>
             </div>
             <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">MoM Evolution: <span className="text-emerald-500">-0.2% Improved</span></p>
          </CardContent>
        </Card>

        <Card className="bg-white border-amber-100 shadow-sm rounded-3xl overflow-hidden">
          <CardContent className="pt-8">
             <div className="flex items-center gap-3 mb-4">
               <div className="p-3 bg-amber-50 rounded-2xl text-amber-600">
                 <ShieldAlert size={24} />
               </div>
               <div>
                 <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">Accounts at Risk</p>
                 <h2 className="text-3xl font-black text-amber-600 tracking-tighter">{tenantsAtRisk.length}</h2>
               </div>
             </div>
             <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Exposure: €{(tenantsAtRisk.length * 99).toLocaleString()} MRR</p>
          </CardContent>
        </Card>

        <Card className="bg-[#1A365D] text-white shadow-xl rounded-3xl overflow-hidden border-none relative group">
           <CardContent className="pt-8">
              <TrendingDown className="absolute top-[-10px] right-[-10px] h-32 w-32 opacity-10 group-hover:rotate-12 transition-transform duration-700" />
              <p className="text-[10px] font-black text-white/50 uppercase tracking-widest mb-1">Gemma Health Score</p>
              <h2 className="text-3xl font-black text-white tracking-tighter">92.4%</h2>
              <div className="mt-6 flex gap-2">
                <Button className="flex-1 bg-white/10 hover:bg-white/20 border-none text-[9px] font-black uppercase tracking-widest rounded-xl h-9">Ejecutar Campaña Rescate</Button>
              </div>
           </CardContent>
        </Card>
      </div>

      <div className="bg-white border border-[#E2E8F0] shadow-sm rounded-[2.5rem] overflow-hidden">
        <div className="p-8 border-b border-slate-50">
          <h3 className="text-xl font-black text-[#1A365D] uppercase tracking-tighter">Radar de Inactividad y Riesgo</h3>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Tenants con baja actividad en los ultimos 7 dias</p>
        </div>
        <div className="divide-y divide-slate-50">
          {tenantsAtRisk.map((tenant) => (
            <div key={tenant.id} className="p-6 hover:bg-slate-50 transition-all flex flex-col md:flex-row items-center justify-between gap-6 group">
              <div className="flex items-center gap-4 flex-1">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black text-white shadow-lg ${
                  tenant.riskScore > 80 ? 'bg-rose-500' : 'bg-amber-500'
                }`}>
                  {tenant.riskScore}%
                </div>
                <div>
                  <h4 className="font-black text-[#1A365D] uppercase tracking-tight group-hover:text-primary transition-colors">{tenant.nombre}</h4>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{tenant.plan} • Last login: {tenant.lastLogin}</p>
                </div>
              </div>
              
              <div className="grid grid-cols-2 md:grid-cols-3 gap-8 items-center">
                 <div className="text-center">
                   <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">MRR en Riesgo</p>
                   <p className="text-sm font-black text-[#1A365D]">€{tenant.mrr}</p>
                 </div>
                 <div className="text-center">
                   <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Actividad</p>
                   <div className="flex items-center justify-center gap-1">
                      {[...Array(5)].map((_, i) => (
                        <div key={i} className={`h-1.5 w-1.5 rounded-full ${i < 2 ? 'bg-rose-500' : 'bg-slate-200'}`} />
                      ))}
                   </div>
                 </div>
                 <Button 
                   variant="ghost" 
                   className="rounded-xl h-10 px-4 text-[#1A365D] font-black uppercase text-[9px] hover:bg-white border border-transparent hover:border-slate-200"
                   onClick={() => window.location.href = `/admin/saas/tenants/${tenant.id}`}
                 >
                   Intervenir <ArrowRight size={12} className="ml-2" />
                 </Button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
