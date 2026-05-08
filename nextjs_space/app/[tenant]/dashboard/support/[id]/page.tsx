'use client';

import React, { useState } from 'react';
import useSWR from 'swr';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  LifeBuoy, 
  ArrowLeft, 
  User, 
  Clock, 
  MessageSquare, 
  CheckCircle,
  AlertTriangle,
  Send,
  Zap,
  Sparkles,
  BookOpen
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';

const fetcher = (url: string) => fetch(url).then(res => res.json());

export default function TicketDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { data: ticket, mutate } = useSWR(`/api/support/tickets/${params.id}`, fetcher);
  const [note, setNote] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);

  const handleUpdateStatus = async (newStatus: string) => {
    setIsUpdating(true);
    try {
      const res = await fetch(`/api/support/tickets/${params.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus, note })
      });
      if (res.ok) {
        mutate();
        setNote('');
      }
    } finally {
      setIsUpdating(false);
    }
  };

   const handleEscalate = async () => {
    const reason = window.prompt('Razón del escalado (Obligatorio para auditoría):');
    if (!reason) return;

    setIsUpdating(true);
    try {
      const res = await fetch(`/api/support/tickets/${params.id}/escalate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: reason })
      });
      if (res.ok) {
        mutate();
        alert('Ticket escalado correctamente.');
      }
    } finally {
      setIsUpdating(false);
    }
  };

   const handleGemmaHelp = async () => {
    setIsUpdating(true);
    try {
      const res = await fetch(`/api/support/tickets/${params.id}/ai-help`, {
        method: 'POST'
      });
      if (res.ok) {
        mutate();
        alert('Gemma ha generado sugerencias de resolución.');
      }
    } finally {
      setIsUpdating(false);
    }
  };

  const handleHarvestKnowledge = async () => {
    setIsUpdating(true);
    try {
      const res = await fetch(`/api/support/tickets/${params.id}/harvest`, {
        method: 'POST'
      });
      if (res.ok) {
        alert('Resolución guardada en el Knowledge Hub exitosamente.');
      }
    } finally {
      setIsUpdating(false);
    }
  };

  if (!ticket) return <div className="p-20 text-center animate-pulse uppercase font-black text-slate-300">Cargando expediente...</div>;

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-8">
      {/* Navigation */}
      <button 
        onClick={() => router.back()}
        className="flex items-center gap-2 text-[10px] font-black uppercase text-slate-400 hover:text-primary transition-all tracking-widest"
      >
        <ArrowLeft className="w-4 h-4" /> Volver a Taskforce
      </button>

      {/* Ticket Header */}
      <div className="flex items-start justify-between">
        <div className="space-y-4">
           <div className="flex items-center gap-3">
              <Badge className="bg-indigo-50 text-indigo-600 border-none px-4 py-1.5 rounded-full font-black text-[10px] uppercase tracking-widest">
                 Ticket #{ticket.id ? ticket.id.substring(0, 8) : '...'}
              </Badge>
              <Badge className={cn("px-4 py-1.5 rounded-full font-black text-[10px] uppercase tracking-widest", 
                ticket.status === 'OPEN' ? "bg-rose-50 text-rose-600" : "bg-emerald-50 text-emerald-600")}>
                 {ticket.status}
              </Badge>
           </div>
           <h1 className="text-4xl font-black text-slate-900 leading-tight uppercase tracking-tight">
              {ticket.subject}
           </h1>
           <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                 <div className="h-8 w-8 rounded-xl bg-slate-100 flex items-center justify-center text-slate-400">
                    <User className="w-4 h-4" />
                 </div>
                 <div>
                    <p className="text-[8px] font-black text-slate-300 uppercase tracking-widest">Creador</p>
                    <p className="text-[10px] font-black text-slate-700 uppercase">{ticket.creator?.name}</p>
                 </div>
              </div>
              <div className="flex items-center gap-2">
                 <div className="h-8 w-8 rounded-xl bg-slate-100 flex items-center justify-center text-slate-400">
                    <Clock className="w-4 h-4" />
                 </div>
                 <div>
                    <p className="text-[8px] font-black text-slate-300 uppercase tracking-widest">Apertura</p>
                    <p className="text-[10px] font-black text-slate-700 uppercase">{new Date(ticket.createdAt).toLocaleString()}</p>
                 </div>
              </div>
           </div>
        </div>

        <Card className="p-6 bg-slate-900 border-none rounded-[2rem] text-white shadow-2xl">
           <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4">Sugerencia de Gemma</p>
           <div className="flex items-start gap-4">
              <div className="h-10 w-10 rounded-2xl bg-primary flex items-center justify-center shadow-lg shadow-primary/50 shrink-0">
                 <Zap className="w-5 h-5" />
              </div>
              <div className="space-y-3">
                 <p className="text-xs font-medium text-slate-300 leading-relaxed italic">
                    "Basado en el historial de facturación, este error suele resolverse aplicando el ajuste de IVA manual tipo B..."
                 </p>
                 <Button size="sm" className="h-8 rounded-xl bg-white/10 hover:bg-white/20 border-none font-black uppercase text-[8px] tracking-widest text-white">
                    Aplicar Solución
                 </Button>
              </div>
           </div>
        </Card>
      </div>

      <div className="grid grid-cols-3 gap-8">
         {/* Main Content */}
         <div className="col-span-2 space-y-8">
            <Card className="p-8 rounded-[2.5rem] border-slate-100 shadow-sm space-y-6">
               <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
                  <MessageSquare className="w-4 h-4" /> Descripción del Incidente
               </h3>
               <p className="text-base font-medium text-slate-700 leading-loose whitespace-pre-wrap">
                  {ticket.description}
               </p>
            </Card>

            {/* Timeline */}
            <div className="space-y-6">
               <h3 className="text-xs font-black uppercase tracking-widest text-slate-900 flex items-center gap-2 px-4">
                  Timeline de Resolución
               </h3>
               <div className="relative pl-8 space-y-8 before:absolute before:left-[15px] before:top-2 before:bottom-2 before:w-[2px] before:bg-slate-100">
                  {ticket.timeline?.map((item: any) => (
                    <div key={item.id} className="relative">
                       <div className="absolute -left-[33px] top-1 h-6 w-6 rounded-full bg-white border-4 border-slate-100" />
                       <div className="space-y-2">
                          <div className="flex items-center gap-3">
                             <span className="text-[10px] font-black uppercase tracking-widest text-slate-800">
                                {item.actorType === 'GEMMA' ? 'GEMMA INTELLIGENCE' : 'OPERADOR'}
                             </span>
                             <span className="text-[9px] font-bold text-slate-300 uppercase tracking-widest">
                                {new Date(item.createdAt).toLocaleString()}
                             </span>
                             <Badge variant="outline" className="text-[7px] font-black uppercase border-slate-100 text-slate-400">
                                {item.action}
                             </Badge>
                          </div>
                          <p className="text-xs font-medium text-slate-500 bg-slate-50/50 p-4 rounded-2xl border border-slate-100/50">
                             {item.note}
                          </p>
                       </div>
                    </div>
                  ))}
               </div>
            </div>
         </div>

         {/* Sidebar Actions */}
         <div className="space-y-6">
            <Button 
              onClick={handleGemmaHelp}
              disabled={isUpdating}
              className="w-full rounded-[1.5rem] h-14 bg-indigo-600 text-white hover:bg-indigo-700 font-black uppercase text-[10px] tracking-widest shadow-xl shadow-indigo-200"
            >
               <Sparkles className="w-5 h-5 mr-3" />
               Consultar a Gemma
            </Button>

            <Card className="p-6 rounded-[2rem] border-slate-100 shadow-sm space-y-6">
               <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-900">Actualizar Estado</h3>
               <div className="space-y-4">
                  <textarea 
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Escribe una nota interna..."
                    className="w-full h-32 rounded-2xl bg-slate-50 border-none text-[10px] font-bold uppercase p-4 focus:ring-primary/20"
                  />
                  <div className="grid grid-cols-1 gap-2">
                     <Button 
                      disabled={isUpdating}
                      onClick={() => handleUpdateStatus('IN_PROGRESS')}
                      className="rounded-xl h-12 bg-amber-50 text-amber-600 hover:bg-amber-100 border-none font-black uppercase text-[10px] tracking-widest"
                     >
                        En Proceso
                     </Button>
                     <Button 
                      disabled={isUpdating}
                      onClick={() => handleUpdateStatus('RESOLVED')}
                      className="rounded-xl h-12 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 border-none font-black uppercase text-[10px] tracking-widest"
                     >
                        Resolver
                     </Button>
                     <Button 
                      disabled={isUpdating}
                      onClick={() => handleUpdateStatus('CLOSED')}
                      variant="outline"
                      className="rounded-xl h-12 border-slate-100 text-slate-400 font-black uppercase text-[10px] tracking-widest"
                     >
                        Cerrar Ticket
                     </Button>
                  </div>
               </div>
            </Card>

            {(ticket.status === 'RESOLVED' || ticket.status === 'CLOSED') && (
              <Card className="p-6 rounded-[2rem] border-primary/20 bg-primary/5 shadow-xl shadow-primary/5 space-y-4">
                 <div className="flex items-center gap-3">
                    <BookOpen className="w-5 h-5 text-primary" />
                    <h3 className="text-[10px] font-black uppercase tracking-widest text-primary">Memoria de Error</h3>
                 </div>
                 <p className="text-[9px] font-bold text-slate-500 uppercase leading-relaxed">
                    ¿Deseas convertir esta resolución en un artículo de conocimiento para evitar que este problema se repita?
                 </p>
                 <Button 
                  onClick={handleHarvestKnowledge}
                  disabled={isUpdating}
                  className="w-full rounded-xl bg-primary text-white font-black uppercase text-[10px] tracking-widest shadow-lg shadow-primary/20"
                 >
                    Convertir en SOP
                 </Button>
              </Card>
            )}

            <Card className="p-6 rounded-[2rem] border-slate-100 shadow-sm bg-rose-50/30 border-rose-100/50">
               <div className="flex items-center gap-3 mb-4">
                  <AlertTriangle className="w-5 h-5 text-rose-500" />
                  <h3 className="text-[10px] font-black uppercase tracking-widest text-rose-600">Prioridad Crítica</h3>
               </div>
               <p className="text-[9px] font-bold text-rose-400 uppercase leading-relaxed">
                  Este incidente afecta directamente la operación de facturación. Se requiere firma de operador para el cierre.
               </p>
               <Button 
                onClick={handleEscalate}
                disabled={isUpdating}
                className="w-full mt-4 rounded-xl bg-rose-600 text-white font-black uppercase text-[10px] tracking-widest shadow-lg shadow-rose-200"
               >
                  Escalar Ahora
               </Button>
            </Card>
         </div>
      </div>
    </div>
  );
}
