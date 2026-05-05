'use client';

import Link from 'next/link';
import useSWR from 'swr';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Activity, 
  Target, 
  TrendingUp, 
  TrendingDown,
  Search,
  Filter,
  BarChart3,
  AlertCircle,
  Briefcase
} from 'lucide-react';
import { cn } from '@/lib/utils';

const fetcher = (url: string) => fetch(url).then(res => res.json());

export default function ProfitabilityPage() {
  const { data, isLoading } = useSWR('/api/strategy/snapshot', fetcher);
  const profitability = data?.profitability || [];

  if (isLoading) return <div className="p-8 animate-pulse space-y-8">
    <div className="h-10 w-64 bg-slate-100 rounded-full" />
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {Array(4).fill(0).map((_, i) => (
        <div key={i} className="h-60 bg-slate-50 rounded-[3rem]" />
      ))}
    </div>
  </div>;

  return (
    <div className="p-8 space-y-8 bg-[#fafafa] min-h-screen">
      {/* Header */}
      <div className="flex justify-between items-end">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-indigo-600 font-bold uppercase text-[10px] tracking-widest">
            <Target className="w-4 h-4" />
            Análisis de Rentabilidad por Proyecto
          </div>
          <h1 className="text-4xl font-black text-slate-900 uppercase tracking-tight">
            Profitability <span className="text-indigo-600">Sniffer</span>
          </h1>
        </div>
        <div className="flex gap-3">
          <Button className="rounded-2xl h-12 px-8 font-black uppercase text-[10px] tracking-widest bg-slate-900 shadow-xl shadow-slate-200">
            Escaneo Profundo (AI)
          </Button>
        </div>
      </div>

      {/* Table-like Grid */}
      <div className="space-y-4">
        {(profitability || []).length > 0 ? (
          profitability.map((item: any, i: number) => (
            <Card key={i} className="overflow-hidden rounded-[2.5rem] border-none shadow-sm bg-white hover:shadow-xl transition-all duration-500">
              <div className="p-8 flex items-center gap-8">
                <div className="h-16 w-16 rounded-3xl bg-slate-50 flex items-center justify-center text-slate-400">
                   <Briefcase className="w-8 h-8" />
                </div>
                
                <div className="flex-1 space-y-1">
                   <div className="flex items-center gap-3">
                      <h3 className="font-black text-xl text-slate-900 uppercase tracking-tight line-clamp-1">{item.entityName || item.entityId}</h3>
                      <Badge className={cn(
                        "border-none px-4 py-1 rounded-full font-black text-[9px] uppercase tracking-widest",
                        item.margin > 20 ? "bg-emerald-50 text-emerald-600" : (item.margin > 0 ? "bg-amber-50 text-amber-600" : "bg-rose-50 text-rose-600")
                      )}>
                        Margen: {item.margin}%
                      </Badge>
                   </div>
                   <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Periodo: {item.period}</p>
                </div>

                <div className="grid grid-cols-2 gap-8 text-right px-8 border-l border-slate-50">
                   <div>
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Costo Op.</p>
                      <p className="text-lg font-black text-slate-900">${item.operationalCost.toLocaleString()}</p>
                   </div>
                   <div>
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Health Score</p>
                      <p className={cn("text-lg font-black", item.score > 80 ? "text-emerald-500" : "text-amber-500")}>
                        {item.score}/100
                      </p>
                   </div>
                </div>

                <div className="flex flex-col gap-2">
                   <Link href={`/dashboard/proyectos?section=costos&projectId=${item.entityId}`}>
                     <Button variant="ghost" className="h-10 w-10 p-0 rounded-xl hover:bg-slate-50">
                        <TrendingUp className="w-5 h-5 text-indigo-500" />
                     </Button>
                   </Link>
                </div>
              </div>
              
              <div className="px-8 py-4 bg-indigo-50/30 flex justify-between items-center border-t border-indigo-50/50">
                 <p className="text-[9px] font-black text-indigo-400 uppercase tracking-widest flex items-center gap-2">
                    <AlertCircle className="w-4 h-4" /> Recomendación: {item.margin < 15 ? 'Optimizar costos operativos' : 'Mantener estrategia actual'}
                 </p>
                 <Link 
                   href={`/dashboard/proyectos?section=costos&projectId=${item.entityId}`}
                   className="text-[9px] font-black uppercase text-indigo-600 hover:underline"
                 >
                   Ver Desglose Completo
                 </Link>
              </div>
            </Card>
          ))
        ) : (
          <div className="py-20 text-center space-y-4 opacity-40">
             <BarChart3 className="w-16 h-16 mx-auto text-slate-300" />
             <p className="text-sm font-black uppercase tracking-widest text-slate-400">No hay datos de rentabilidad escaneados</p>
          </div>
        )}
      </div>
    </div>
  );
}