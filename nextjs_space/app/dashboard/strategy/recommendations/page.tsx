'use client';

import useSWR from 'swr';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Sparkles,
  Zap,
  Target,
  TrendingUp,
  AlertTriangle,
  Lightbulb,
  ArrowRight,
  ShieldCheck,
  BrainCircuit
} from 'lucide-react';
import { cn } from '@/lib/utils';

const fetcher = (url: string) => fetch(url).then(res => res.json());

export default function RecommendationsPage() {
  const { data: alerts, isLoading } = useSWR('/api/strategy/alerts', fetcher);

  if (isLoading) return <div className="p-8 animate-pulse space-y-8">
    <div className="h-10 w-64 bg-slate-100 rounded-full" />
    <div className="space-y-6">
       {Array(3).fill(0).map((_, i) => (
         <div key={i} className="h-40 bg-slate-50 rounded-[3rem]" />
       ))}
    </div>
  </div>;

  return (
    <div className="p-8 space-y-10 bg-[#fafafa] min-h-screen">
      {/* Header AI Style */}
      <div className="flex justify-between items-end">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-violet-600 font-bold uppercase text-[10px] tracking-widest">
            <BrainCircuit className="w-4 h-4" />
            Gemma AI Strategic Engine
          </div>
          <h1 className="text-4xl font-black text-slate-900 uppercase tracking-tight">
            Strategic <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-600 to-indigo-600">Recommendations</span>
          </h1>
        </div>
        <Button className="rounded-2xl h-12 px-8 font-black uppercase text-[10px] tracking-widest bg-slate-900 text-white shadow-xl shadow-slate-200">
           Generar Nuevo Insight
        </Button>
      </div>

      {/* Main Recommendations */}
      <div className="space-y-6">
        {(alerts || []).length > 0 ? (
          alerts.map((alert: any, i: number) => (
            <Card key={i} className="p-10 rounded-[3rem] border-none shadow-sm bg-white hover:shadow-2xl transition-all group overflow-hidden relative">
              <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-20 transition-opacity">
                 <Sparkles className="w-40 h-40 text-violet-600" />
              </div>

              <div className="flex flex-col md:flex-row gap-10 items-center">
                <div className="h-24 w-24 rounded-[2rem] bg-violet-50 flex items-center justify-center text-violet-600 shrink-0">
                   <Lightbulb className="w-12 h-12" />
                </div>
                
                <div className="flex-1 space-y-4">
                   <div className="flex items-center gap-3">
                      <Badge className="bg-violet-600 text-white border-none px-4 py-1.5 rounded-full font-black text-[9px] uppercase tracking-widest">
                        {alert.category}
                      </Badge>
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                        Gravedad: {alert.severity}
                      </span>
                   </div>
                   
                   <h2 className="text-3xl font-black text-slate-900 leading-tight uppercase tracking-tight">
                      {alert.message}
                   </h2>
                   
                   <div className="flex gap-4 pt-4">
                      <Button className="rounded-2xl bg-indigo-600 hover:bg-indigo-700 h-12 px-8 font-black uppercase text-[10px] tracking-widest">
                         Ejecutar Acción Sugerida
                      </Button>
                      <Button variant="ghost" className="rounded-2xl h-12 px-8 font-black uppercase text-[10px] tracking-widest text-slate-400">
                         Ignorar
                      </Button>
                   </div>
                </div>
              </div>
            </Card>
          ))
        ) : (
          <div className="py-20 text-center space-y-4 opacity-40">
             <Zap className="w-16 h-16 mx-auto text-slate-300" />
             <p className="text-sm font-black uppercase tracking-widest text-slate-400">Gemma está analizando tus datos...</p>
          </div>
        )}

        {/* Global Strategy Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-6">
           <Card className="p-8 rounded-[2.5rem] bg-slate-900 text-white border-none">
              <div className="flex items-center gap-4 mb-6">
                 <div className="h-12 w-12 rounded-2xl bg-indigo-500/20 flex items-center justify-center text-indigo-400">
                    <Target className="w-6 h-6" />
                 </div>
                 <h3 className="font-black uppercase tracking-tight">Estrategia de Expansión</h3>
              </div>
              <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mb-8 leading-relaxed">
                 Basado en el margen actual del 32%, Gemma sugiere aumentar la inversión en proyectos del sector industrial durante el Q3.
              </p>
              <Button className="w-full rounded-2xl bg-white text-slate-900 font-black uppercase text-[10px] tracking-widest h-12">
                 Ver Plan Detallado
              </Button>
           </Card>

           <Card className="p-8 rounded-[2.5rem] bg-indigo-600 text-white border-none">
              <div className="flex items-center gap-4 mb-6">
                 <div className="h-12 w-12 rounded-2xl bg-white/20 flex items-center justify-center text-white">
                    <ShieldCheck className="w-6 h-6" />
                 </div>
                 <h3 className="font-black uppercase tracking-tight">Mitigación de Riesgos</h3>
              </div>
              <p className="text-xs text-white/60 font-bold uppercase tracking-widest mb-8 leading-relaxed">
                 La proyección de flujo de caja muestra una posible tensión de liquidez en 75 días. Se recomienda adelantar facturación.
              </p>
              <Button variant="secondary" className="w-full rounded-2xl bg-white/10 hover:bg-white/20 border-none text-white font-black uppercase text-[10px] tracking-widest h-12">
                 Ver Alertas Críticas
              </Button>
           </Card>
        </div>
      </div>
    </div>
  );
}