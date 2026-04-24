'use client';

import React, { useState } from 'react';
import useSWR from 'swr';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  LifeBuoy, 
  Clock, 
  AlertCircle, 
  CheckCircle2, 
  User, 
  Filter,
  Search,
  Kanban as KanbanIcon,
  List as ListIcon,
  ChevronRight,
  AlertOctagon,
  Activity
} from 'lucide-react';
import { cn } from '@/lib/utils';

const fetcher = (url: string) => fetch(url).then(res => res.json());

export default function SupportTaskforcePage() {
  const [view, setView] = useState<'list' | 'kanban'>('list');
  const [filter, setFilter] = useState('OPEN');
  
  const { data: tickets, mutate } = useSWR(`/api/support/tickets${filter ? `?status=${filter}` : ''}`, fetcher);
  const { data: metrics } = useSWR('/api/support/metrics', fetcher);

  const statusColors: any = {
    'OPEN': 'bg-rose-50 text-rose-600 border-rose-100',
    'IN_PROGRESS': 'bg-amber-50 text-amber-600 border-amber-100',
    'RESOLVED': 'bg-emerald-50 text-emerald-600 border-emerald-100',
    'CLOSED': 'bg-slate-50 text-slate-400 border-slate-100'
  };

  const priorityColors: any = {
    'LOW': 'text-slate-400',
    'MEDIUM': 'text-indigo-400',
    'HIGH': 'text-orange-500',
    'CRITICAL': 'text-rose-600 animate-pulse'
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black uppercase tracking-tight text-slate-900 flex items-center gap-4">
            <LifeBuoy className="w-10 h-10 text-primary" />
            Volkern <span className="text-primary italic">Taskforce</span>
          </h1>
          <p className="text-xs font-black text-slate-400 uppercase tracking-[0.3em] mt-2">
            Gestión de Excepciones Operativas y Soporte
          </p>
        </div>

        <div className="flex items-center gap-4">
           <div className="flex bg-slate-100 p-1 rounded-2xl">
              <button 
                onClick={() => setView('list')}
                className={cn(
                  "p-2 rounded-xl transition-all",
                  view === 'list' ? "bg-white shadow-sm text-primary" : "text-slate-400"
                )}
              >
                <ListIcon className="w-5 h-5" />
              </button>
              <button 
                onClick={() => setView('kanban')}
                className={cn(
                  "p-2 rounded-xl transition-all",
                  view === 'kanban' ? "bg-white shadow-sm text-primary" : "text-slate-400"
                )}
              >
                <KanbanIcon className="w-5 h-5" />
              </button>
           </div>
           <Button className="rounded-2xl font-black uppercase text-[10px] tracking-widest px-6 h-12 shadow-xl shadow-primary/20">
              Nuevo Ticket
           </Button>
        </div>
      </div>

      {/* Stats QuickView */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
         {[
           { label: 'SLA Cumplimiento', count: `${metrics?.slaCompliance || 0}%`, color: 'text-emerald-600' },
           { label: 'MTTR (Resolución)', count: `${metrics?.mttr || 0}h`, color: 'text-indigo-600' },
           { label: 'MTTD (Detección)', count: `${metrics?.mttd || 0}h`, color: 'text-amber-600' },
           { label: 'Backlog Crítico', count: metrics?.backlog?.CRITICAL || 0, color: 'text-rose-600' }
         ].map((stat, i) => (
           <Card key={i} className="p-6 rounded-[2rem] border-slate-100 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">{stat.label}</p>
                <h3 className={cn("text-2xl font-black mt-1", stat.color)}>{stat.count}</h3>
              </div>
              <div className="h-10 w-10 rounded-2xl bg-slate-50 flex items-center justify-center text-slate-300">
                 <Activity className="w-5 h-5" />
              </div>
           </Card>
         ))}
      </div>

      {/* Critical SLA Alerts */}
      {tickets?.some((t:any) => t.priority === 'CRITICAL' && t.slaState !== 'ON_TIME') && (
        <div className="bg-rose-600 p-6 rounded-[2rem] text-white flex items-center justify-between shadow-2xl shadow-rose-200 animate-in slide-in-from-top duration-500">
           <div className="flex items-center gap-6">
              <div className="h-14 w-14 rounded-2xl bg-white/20 flex items-center justify-center animate-pulse">
                 <AlertOctagon className="w-8 h-8" />
              </div>
              <div>
                 <h2 className="text-xl font-black uppercase tracking-tight">Alerta de Incumplimiento Crítico</h2>
                 <p className="text-xs font-bold text-rose-100 uppercase tracking-widest mt-1">Hay tickets críticos que requieren acción inmediata para evitar breach de SLA.</p>
              </div>
           </div>
           <Button className="bg-white text-rose-600 hover:bg-rose-50 rounded-2xl font-black uppercase text-[10px] tracking-widest px-8">
              Atender Ahora
           </Button>
        </div>
      )}

      {/* Main View */}
      <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-2xl overflow-hidden min-h-[600px]">
         {/* Toolbar */}
         <div className="p-6 border-b border-slate-50 flex items-center justify-between bg-slate-50/50">
            <div className="flex items-center gap-6">
               <div className="flex gap-2">
                 {['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'].map((s) => (
                   <button 
                    key={s}
                    onClick={() => setFilter(s)}
                    className={cn(
                      "px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                      filter === s ? "bg-primary text-white shadow-lg shadow-primary/20" : "text-slate-400 hover:bg-slate-100"
                    )}
                   >
                     {s.replace('_', ' ')}
                   </button>
                 ))}
               </div>
            </div>
            <div className="flex items-center gap-4">
               <div className="relative">
                  <Search className="w-4 h-4 text-slate-300 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input 
                    type="text" 
                    placeholder="BUSCAR TICKET..."
                    className="h-11 w-64 pl-10 rounded-2xl bg-white border-slate-100 text-[10px] font-bold uppercase tracking-widest focus:ring-primary/20"
                  />
               </div>
               <Button variant="outline" className="rounded-2xl border-slate-200">
                  <Filter className="w-4 h-4" />
               </Button>
            </div>
         </div>

         {/* Content */}
         <div className="p-6">
            {!tickets ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="w-10 h-10 animate-spin text-primary/20" />
              </div>
            ) : tickets.length === 0 ? (
              <div className="text-center py-20 opacity-30">
                 <CheckCircle2 className="w-20 h-20 mx-auto mb-4" />
                 <h3 className="text-xl font-black uppercase">No hay tickets pendientes</h3>
                 <p className="text-[10px] font-bold uppercase tracking-widest mt-2">Todo bajo control en el horizonte.</p>
              </div>
            ) : (
              <div className="space-y-4">
                 {tickets.map((ticket: any) => (
                   <Card 
                    key={ticket.id} 
                    className="p-5 rounded-[1.5rem] border-slate-100 hover:border-primary/20 hover:shadow-xl transition-all group cursor-pointer"
                   >
                     <div className="flex items-center justify-between">
                        <div className="flex items-center gap-5">
                           <div className={cn("h-12 w-12 rounded-2xl bg-slate-50 flex items-center justify-center transition-all group-hover:bg-primary/5")}>
                              <AlertCircle className={cn("w-6 h-6", priorityColors[ticket.priority])} />
                           </div>
                           <div>
                              <div className="flex items-center gap-3">
                                 <h4 className="text-sm font-black uppercase text-slate-800 tracking-tight">{ticket.subject}</h4>
                                 <Badge className={cn("text-[8px] font-black uppercase border", statusColors[ticket.status])}>
                                    {ticket.status}
                                 </Badge>
                                 {ticket.slaState !== 'ON_TIME' && (
                                   <Badge className={cn("text-[8px] font-black uppercase border", 
                                     ticket.slaState === 'BREACHED' ? "bg-rose-500 text-white border-none" : "bg-orange-50 text-orange-600 border-orange-200")}>
                                     SLA: {ticket.slaState}
                                   </Badge>
                                 )}
                              </div>
                              <div className="flex items-center gap-4 mt-1.5">
                                 <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                                    <User className="w-3 h-3" /> {ticket.creator?.name}
                                 </span>
                                 <span className="text-[9px] font-bold text-slate-300 uppercase tracking-widest">•</span>
                                 <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                                    <Clock className="w-3 h-3" /> {new Date(ticket.createdAt).toLocaleDateString()}
                                 </span>
                                 {ticket.slaDueAt && (
                                   <>
                                     <span className="text-[9px] font-bold text-slate-300 uppercase tracking-widest">•</span>
                                     <span className={cn("text-[9px] font-black uppercase tracking-widest", 
                                       ticket.slaState === 'BREACHED' ? "text-rose-600" : "text-slate-400")}>
                                       Vence: {new Date(ticket.slaDueAt).toLocaleString()}
                                     </span>
                                   </>
                                 )}
                              </div>
                           </div>
                        </div>
                        <div className="flex items-center gap-6">
                           <div className="text-right">
                              <p className="text-[8px] font-black text-slate-300 uppercase tracking-widest mb-1">Asignado a</p>
                              <div className="flex items-center gap-2 justify-end">
                                 <span className="text-[10px] font-black uppercase text-slate-600">{ticket.assignee?.name || 'SIN ASIGNAR'}</span>
                                 <div className="h-6 w-6 rounded-lg bg-slate-100 flex items-center justify-center">
                                    <User className="w-3 h-3 text-slate-400" />
                                 </div>
                              </div>
                           </div>
                           <ChevronRight className="w-5 h-5 text-slate-200 group-hover:text-primary transition-all" />
                        </div>
                     </div>
                   </Card>
                 ))}
              </div>
            )}
         </div>
      </div>
    </div>
  );
}

function Loader2({ className }: { className?: string }) {
  return <Clock className={cn("animate-spin", className)} />;
}
