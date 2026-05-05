'use client';

import useSWR from 'swr';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  ShieldCheck,
  Lock,
  History,
  FileText,
  Search,
  ExternalLink,
  Cpu,
  Fingerprint
} from 'lucide-react';
import { cn } from '@/lib/utils';

const fetcher = (url: string) => fetch(url).then(res => res.json());

export default function TrustPage() {
  const { data: events, isLoading } = useSWR('/api/assets/events', fetcher);

  if (isLoading) return (
    <div className="p-8 space-y-8 animate-pulse">
      <div className="h-10 w-64 bg-slate-100 rounded-full" />
      <div className="space-y-4">
        {Array(5).fill(0).map((_, i) => (
          <div key={i} className="h-20 bg-slate-50 rounded-2xl" />
        ))}
      </div>
    </div>
  );

  return (
    <div className="p-8 space-y-10 bg-slate-900 min-h-screen text-slate-100">
      {/* Header Premium */}
      <div className="flex justify-between items-end">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-primary font-bold uppercase text-[10px] tracking-widest">
            <Lock className="w-4 h-4" />
            Integridad & Sellado Criptográfico
          </div>
          <h1 className="text-5xl font-black tracking-tight uppercase">
            Protocolo <span className="text-primary">Trust</span>
          </h1>
          <p className="text-slate-400 max-w-xl text-xs uppercase font-bold tracking-widest">
            Registro inmutable de la cadena de custodia de activos institucionales.
          </p>
        </div>
        <div className="flex gap-4">
           <div className="text-right">
              <p className="text-[10px] font-black text-slate-500 uppercase">Estado del Libro</p>
              <p className="text-emerald-500 font-black uppercase text-xs">Sincronizado & Sellado</p>
           </div>
        </div>
      </div>

      {/* Audit Log */}
      <div className="space-y-2">
        <div className="grid grid-cols-12 px-8 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-800">
          <div className="col-span-2">Timestamp</div>
          <div className="col-span-2">Evento</div>
          <div className="col-span-3">Activo</div>
          <div className="col-span-3">Descripción</div>
          <div className="col-span-2 text-right">Hash SHA-256</div>
        </div>

        {(events || []).length > 0 ? (
          events.map((event: any, i: number) => (
            <div key={i} className="grid grid-cols-12 px-8 py-6 items-center gap-4 hover:bg-slate-800/50 transition-colors border-b border-slate-800/50 group">
              <div className="col-span-2">
                <p className="text-[10px] font-bold text-slate-400">{new Date(event.createdAt).toLocaleDateString()}</p>
                <p className="text-xs font-black">{new Date(event.createdAt).toLocaleTimeString()}</p>
              </div>
              
              <div className="col-span-2">
                <Badge className={cn(
                  "border-none px-3 py-1 rounded-full font-black text-[8px] uppercase",
                  event.eventType === 'CREATION' ? "bg-indigo-500/10 text-indigo-400" : 
                  event.eventType === 'ASSIGNMENT' ? "bg-emerald-500/10 text-emerald-400" :
                  "bg-amber-500/10 text-amber-400"
                )}>
                  {event.eventType}
                </Badge>
              </div>

              <div className="col-span-3 flex items-center gap-3">
                 <div className="h-10 w-10 rounded-xl bg-slate-800 flex items-center justify-center text-slate-500 group-hover:text-primary transition-colors">
                    <Cpu className="w-5 h-5" />
                 </div>
                 <div>
                    <p className="text-xs font-black uppercase tracking-tight">{event.asset.name}</p>
                    <p className="text-[9px] font-bold text-slate-500">SN: {event.asset.serialNumber}</p>
                 </div>
              </div>

              <div className="col-span-3">
                 <p className="text-xs text-slate-300 italic">"{event.description}"</p>
              </div>

              <div className="col-span-2 text-right">
                 <div className="flex items-center justify-end gap-2 text-slate-600 group-hover:text-emerald-500 transition-colors">
                    <Fingerprint className="w-4 h-4" />
                    <span className="text-[8px] font-mono truncate max-w-[80px]">{event.hash}</span>
                 </div>
              </div>
            </div>
          ))
        ) : (
          <div className="py-40 text-center space-y-6 opacity-30">
             <ShieldCheck className="w-20 h-20 mx-auto text-slate-600" />
             <p className="text-sm font-black uppercase tracking-widest">Protocolo Trust Inicializado</p>
          </div>
        )}
      </div>

      {/* Footer Info */}
      <Card className="bg-slate-800/50 border-slate-700 p-8 rounded-[2.5rem]">
         <div className="flex items-center gap-6">
            <div className="h-16 w-16 rounded-3xl bg-primary/20 flex items-center justify-center text-primary">
               <ShieldCheck className="w-8 h-8" />
            </div>
            <div className="space-y-1">
               <h3 className="font-black uppercase tracking-tight">Verificación de Integridad H2-2024</h3>
               <p className="text-xs text-slate-400 uppercase tracking-widest font-bold">
                  Todos los registros han sido sellados criptográficamente. La cadena de bloques interna garantiza la no repudiación de las asignaciones de activos.
               </p>
            </div>
            <Button variant="outline" className="ml-auto rounded-2xl border-slate-700 hover:bg-slate-700 text-slate-300 font-black uppercase text-[10px] tracking-widest px-8">
               Descargar Informe Forense
            </Button>
         </div>
      </Card>
    </div>
  );
}