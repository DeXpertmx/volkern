'use client';

import React from 'react';
import useSWR from 'swr';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Radar, 
  Globe, 
  TrendingUp, 
  Zap, 
  Search, 
  AlertCircle,
  ExternalLink,
  Target,
  ArrowRight,
  Sparkles
} from 'lucide-react';
import { cn } from '@/lib/utils';

const fetcher = (url: string) => fetch(url).then(res => res.json());

export default function DiscoverHubPage() {
  const { data, isLoading } = useSWR('/api/discover/signals', fetcher);
  
  const signals = data?.signals || [];
  const observations = data?.observations || [];

  const getSourceIcon = (source: string) => {
    switch (source) {
      case 'LINKEDIN': return <Target className="w-4 h-4" />;
      case 'NEWS_FEED': return <Globe className="w-4 h-4" />;
      case 'GOOGLE_SEARCH': return <Search className="w-4 h-4" />;
      default: return <Radar className="w-4 h-4" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'NEW': return 'bg-indigo-50 text-indigo-600';
      case 'ANALYZED': return 'bg-amber-50 text-amber-600';
      case 'CONVERTED': return 'bg-emerald-50 text-emerald-600';
      default: return 'bg-slate-50 text-slate-500';
    }
  };

  return (
    <div className="p-8 space-y-10 bg-[#fafafa] min-h-screen">
      {/* Header */}
      <div className="flex justify-between items-end">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-indigo-600 font-bold uppercase text-[10px] tracking-[0.2em]">
            <Radar className="w-4 h-4 animate-pulse" />
            Volkern Discover Hub
          </div>
          <h1 className="text-5xl font-black text-slate-900 tracking-tight uppercase">
            Market <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-violet-600">Signals</span>
          </h1>
        </div>
        <div className="flex gap-4">
           <Button variant="outline" className="rounded-2xl h-12 px-6 font-black uppercase text-[10px] tracking-widest bg-white">
              <Search className="w-4 h-4 mr-2" /> Nueva Búsqueda
           </Button>
           <Button className="rounded-2xl h-12 px-8 font-black uppercase text-[10px] tracking-widest bg-slate-900 shadow-xl shadow-slate-200">
              <Zap className="w-4 h-4 mr-2" /> Forzar Radar AI
           </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Main Signals Feed */}
        <div className="lg:col-span-2 space-y-6">
           <div className="flex items-center justify-between">
              <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest">
                {data?.fallback ? "Observaciones Base (Modo Degradado)" : "Oportunidades y Señales"}
              </h3>
              <Badge className="bg-indigo-50 text-indigo-600 border-none font-black text-[10px] uppercase">{signals.length} Activas</Badge>
           </div>
           
           {isLoading ? (
             <div className="flex justify-center p-12">
               <Radar className="w-8 h-8 text-indigo-300 animate-spin" />
             </div>
           ) : signals.length === 0 ? (
             <Card className="p-12 text-center rounded-[3rem] border-none shadow-sm bg-white">
               <Radar className="w-12 h-12 text-slate-200 mx-auto mb-4" />
               <h3 className="text-xl font-black text-slate-900 uppercase">Radar Limpio</h3>
               <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-2">No hay nuevas señales en este momento.</p>
             </Card>
           ) : (
             <div className="space-y-4">
               {signals.map((signal: any) => (
                 <Card key={signal.id} className="p-6 rounded-[2rem] border border-slate-50 shadow-sm bg-white hover:shadow-xl transition-all group relative overflow-hidden">
                   <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-indigo-50 to-transparent rounded-bl-full opacity-50" />
                   
                   <div className="relative z-10 flex flex-col md:flex-row gap-6">
                     <div className="flex-1 space-y-4">
                       <div className="flex items-center gap-3">
                         <div className="h-8 w-8 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600">
                           {getSourceIcon(signal.source)}
                         </div>
                         <Badge className={cn("border-none px-3 py-1 rounded-md font-black text-[8px] uppercase tracking-widest", getStatusColor(signal.status))}>
                           {signal.status}
                         </Badge>
                         <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                           {signal.entityType.replace('_', ' ')}
                         </span>
                       </div>
                       
                       <div>
                         <h4 className="text-lg font-black text-slate-900 leading-tight">{signal.headline}</h4>
                         <p className="text-sm text-slate-500 mt-2 leading-relaxed">{signal.summary}</p>
                       </div>
                     </div>
                     
                     <div className="flex flex-col justify-between items-end min-w-[120px]">
                       <div className="text-right">
                         <div className="text-3xl font-black text-indigo-600">{signal.score.toFixed(0)}</div>
                         <div className="text-[8px] font-black text-slate-400 uppercase tracking-widest">AI Score</div>
                       </div>
                       <Button className="rounded-xl h-10 px-6 font-black uppercase text-[10px] tracking-widest bg-indigo-600 hover:bg-indigo-700 shadow-md">
                         Analizar <ArrowRight className="w-3 h-3 ml-2" />
                       </Button>
                     </div>
                   </div>
                 </Card>
               ))}
             </div>
           )}
        </div>

        {/* Sidebar Insights */}
        <div className="space-y-6">
          <Card className="p-8 rounded-[3rem] border-none shadow-2xl bg-indigo-600 text-white overflow-hidden relative">
            <div className="absolute top-0 right-0 p-8 opacity-10">
              <Sparkles className="w-32 h-32 text-indigo-300" />
            </div>
            <div className="relative z-10 space-y-6">
              <div className="flex items-center gap-2 text-indigo-200 font-black uppercase text-[10px] tracking-widest">
                <Sparkles className="w-4 h-4" />
                {data?.fallback ? "Fallback Mode" : "Gemma Discovery AI"}
              </div>
              <h3 className="text-2xl font-black leading-tight uppercase">
                {data?.fallback ? "Servicio Offline" : "Tendencia Detectada"}
              </h3>
              <p className="text-sm font-medium text-indigo-100 leading-relaxed">
                {data?.fallback ? "La inteligencia artificial predictiva no está disponible temporalmente. La telemetría manual sigue activa." : "El 45% de las señales recientes apuntan a un incremento en la adopción de herramientas de IA en el sector de manufactura."}
              </p>
              <Button className="w-full h-12 rounded-2xl bg-white text-indigo-600 hover:bg-indigo-50 font-black uppercase text-[10px] tracking-widest border-none shadow-lg shadow-indigo-900/20">
                Generar Informe
              </Button>
            </div>
          </Card>

          <Card className="p-8 rounded-[3rem] border-none shadow-sm bg-white space-y-6">
             <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em]">Market Observations</h3>
             <div className="space-y-4">
                {observations.map((obs: any) => (
                  <div key={obs.id} className="p-4 rounded-2xl bg-slate-50 group hover:bg-indigo-50 transition-colors cursor-pointer">
                    <div className="flex justify-between items-start mb-2">
                       <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest">{obs.category}</span>
                       <Badge className={cn(
                         "border-none text-[8px] uppercase",
                         obs.trendDirection === 'RISING' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'
                       )}>
                         {obs.trendDirection}
                       </Badge>
                    </div>
                    <p className="text-xs font-bold text-slate-700 group-hover:text-indigo-900 leading-tight">
                       {obs.observation}
                    </p>
                  </div>
                ))}
                {observations.length === 0 && (
                  <div className="text-[10px] font-bold text-slate-400 uppercase text-center py-4">No hay observaciones</div>
                )}
             </div>
          </Card>
        </div>

      </div>
    </div>
  );
}
