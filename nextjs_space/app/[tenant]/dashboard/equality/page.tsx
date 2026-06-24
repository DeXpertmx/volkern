
'use client';

import React, { useState, useEffect } from 'react';
import useSWR from 'swr';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  ShieldCheck, 
  Search, 
  Filter, 
  FileWarning, 
  Eye, 
  CheckCircle2, 
  Clock, 
  AlertTriangle,
  History,
  Lock,
  Loader2,
  RefreshCw
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const fetcher = (url: string) => fetch(url).then(res => res.json());

export default function EqualityManagementPage() {
  const { data: complaints, mutate, error } = useSWR('/api/equality/complaints', fetcher);
  const [selected, setSelected] = useState<any>(null);
  const [resolutionNote, setResolutionNote] = useState('');
  const [updating, setUpdating] = useState(false);

  const updateStatus = async (status: string) => {
    if (!selected) return;
    setUpdating(true);
    try {
      const res = await fetch(`/api/equality/complaints/${selected.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, resolutionNote })
      });
      if (res.ok) {
        toast.success('Estado actualizado correctamente');
        mutate();
        setSelected(null);
      } else {
        toast.error('Error al actualizar');
      }
    } catch (e) {
      toast.error('Error de conexión');
    } finally {
      setUpdating(false);
    }
  };

  const statusConfig: any = {
    'OPEN': { color: 'bg-rose-50 text-rose-600', icon: AlertTriangle, label: 'Abierta' },
    'IN_PROGRESS': { color: 'bg-amber-50 text-amber-600', icon: Clock, label: 'En Revisión' },
    'RESOLVED': { color: 'bg-emerald-50 text-emerald-600', icon: CheckCircle2, label: 'Resuelta' },
    'DISMISSED': { color: 'bg-slate-50 text-slate-400', icon: History, label: 'Desestimada' },
  };

  if (error) return <div className="p-20 text-center text-rose-500 font-black uppercase">Acceso no autorizado al canal de igualdad</div>;
  if (!complaints) return <div className="p-20 text-center animate-pulse text-slate-300 font-black uppercase">Cargando canal seguro...</div>;

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black uppercase tracking-tight text-slate-900 flex items-center gap-4">
            <ShieldCheck className="w-10 h-10 text-emerald-600" />
            Equality <span className="text-emerald-600 italic">Governance</span>
          </h1>
          <p className="text-xs font-black text-slate-400 uppercase tracking-[0.3em] mt-2">
            Gestión de Denuncias e Integridad de Datos
          </p>
        </div>
        <div className="flex items-center gap-4">
           <div className="p-4 rounded-2xl bg-slate-900 text-white flex items-center gap-4 shadow-xl">
              <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <div className="text-[10px] font-black uppercase tracking-widest">
                 Protocolo de Inmutabilidad Activo
              </div>
           </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Complaints List */}
        <div className="lg:col-span-1 space-y-4">
           <div className="flex items-center justify-between px-2">
              <h3 className="text-[11px] font-black uppercase text-slate-400 tracking-widest">Buzón de Entrada ({complaints.length})</h3>
              <Button variant="ghost" size="sm" onClick={() => mutate()}><RefreshCw className="w-3 h-3" /></Button>
           </div>
           <div className="space-y-3 max-h-[700px] overflow-y-auto pr-2 custom-scrollbar">
              {complaints.map((c: any) => (
                <Card 
                  key={c.id}
                  onClick={() => {
                    setSelected(c);
                    setResolutionNote(c.resolutionNote || '');
                  }}
                  className={cn(
                    "p-5 rounded-2xl border-slate-100 cursor-pointer transition-all hover:shadow-md",
                    selected?.id === c.id ? "ring-2 ring-emerald-500 shadow-lg border-transparent" : "hover:border-slate-200"
                  )}
                >
                   <div className="flex items-center justify-between mb-3">
                      <Badge className={cn("text-[8px] font-black uppercase border", statusConfig[c.status].color)}>
                         {statusConfig[c.status].label}
                      </Badge>
                      <span className="text-[9px] font-bold text-slate-400 uppercase">{new Date(c.createdAt).toLocaleDateString()}</span>
                   </div>
                   <p className="text-sm font-bold text-slate-800 line-clamp-2 leading-relaxed mb-3">
                      {c.description}
                   </p>
                   <div className="flex items-center justify-between pt-3 border-t border-slate-50">
                      <div className="flex items-center gap-2">
                         <div className="h-6 w-6 rounded-lg bg-slate-100 flex items-center justify-center">
                            <Lock className="w-3 h-3 text-slate-400" />
                         </div>
                         <span className="text-[9px] font-black uppercase text-slate-400 tracking-widest">
                            {c.isAnonymous ? 'ANÓNIMO' : c.user?.name}
                         </span>
                      </div>
                      <Badge variant="outline" className="text-[8px] border-emerald-100 text-emerald-600 bg-emerald-50/50">HASH OK</Badge>
                   </div>
                </Card>
              ))}
           </div>
        </div>

        {/* Detail View */}
        <div className="lg:col-span-2">
           {selected ? (
             <Card className="border-none shadow-2xl rounded-[2.5rem] bg-white overflow-hidden animate-in fade-in slide-in-from-right-4 duration-300">
                <div className="h-2 bg-emerald-500" />
                <CardHeader className="p-8 border-b border-slate-50 flex flex-row items-center justify-between">
                   <div>
                      <div className="flex items-center gap-3 mb-2">
                        <Badge className="bg-indigo-50 text-indigo-600 border-none px-4 py-1.5 rounded-full font-black text-[10px] uppercase tracking-widest">
                           Ticket #{selected?.id?.substring(0, 8) || '...'}
                        </Badge>
                        <Badge className={cn("px-4 py-1.5 rounded-full font-black text-[10px] uppercase tracking-widest", statusConfig[selected.status].color)}>
                           {statusConfig[selected.status].label}
                        </Badge>
                      </div>
                      <CardTitle className="text-2xl font-black text-slate-900">Detalles de la Denuncia</CardTitle>
                   </div>
                   <div className="text-right">
                      <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Hash de Integridad</p>
                      <p className="text-[10px] font-mono text-emerald-600 font-bold max-w-[200px] truncate">{selected.hash}</p>
                   </div>
                </CardHeader>
                <CardContent className="p-8 space-y-8">
                   <div className="space-y-4">
                      <span className="text-[11px] font-black uppercase text-slate-400 tracking-widest">Hechos Reportados (Inmutable)</span>
                      <div className="p-6 rounded-3xl bg-slate-50 border border-slate-100 text-slate-700 leading-relaxed font-medium">
                         {selected.description}
                      </div>
                   </div>

                   <div className="grid grid-cols-2 gap-8">
                      <div className="space-y-2">
                         <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Fecha de Registro</p>
                         <p className="text-sm font-bold text-slate-700">{new Date(selected.createdAt).toLocaleString()}</p>
                      </div>
                      <div className="space-y-2">
                         <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Categoría</p>
                         <Badge variant="outline" className="rounded-lg uppercase text-[10px] font-black">{selected.category || 'GENERAL'}</Badge>
                      </div>
                   </div>

                   <div className="pt-8 border-t border-slate-50 space-y-6">
                      <div className="space-y-4">
                         <span className="text-[11px] font-black uppercase text-slate-400 tracking-widest">Notas de Resolución y Seguimiento</span>
                         <textarea 
                           className="w-full min-h-[120px] p-6 rounded-3xl bg-white border border-slate-200 focus:ring-4 focus:ring-emerald-500/10 outline-none transition-all text-sm font-medium"
                           placeholder="Describe las acciones tomadas para resolver este caso..."
                           value={resolutionNote}
                           onChange={(e) => setResolutionNote(e.target.value)}
                         />
                      </div>

                      <div className="flex items-center gap-3">
                         {['IN_PROGRESS', 'RESOLVED', 'DISMISSED'].map((s) => (
                           <Button
                             key={s}
                             onClick={() => updateStatus(s)}
                             disabled={updating}
                             variant={s === 'RESOLVED' ? 'default' : 'outline'}
                             className={cn(
                               "flex-1 h-12 rounded-2xl font-black uppercase text-[10px] tracking-widest transition-all",
                               s === 'RESOLVED' ? "bg-emerald-600 hover:bg-emerald-700 shadow-lg shadow-emerald-200" : "border-slate-200"
                             )}
                           >
                             Marcar como {statusConfig[s].label}
                           </Button>
                         ))}
                      </div>
                   </div>
                </CardContent>
             </Card>
           ) : (
             <div className="h-[600px] flex flex-col items-center justify-center text-center p-12 border-2 border-dashed border-slate-100 rounded-[2.5rem] opacity-30">
                <FileWarning className="w-20 h-20 mb-6" />
                <h3 className="text-2xl font-black uppercase tracking-tight">Selecciona una denuncia</h3>
                <p className="text-sm font-bold uppercase tracking-widest mt-2">Para revisar los hechos y gestionar el caso.</p>
             </div>
           )}
        </div>
      </div>
    </div>
  );
}
