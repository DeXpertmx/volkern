'use client';

import React from 'react';
import { 
  Phone, 
  PhoneIncoming, 
  PhoneOutgoing, 
  User, 
  Clock, 
  Calendar,
  ExternalLink,
  Search,
  Download,
  Filter,
  Play
} from 'lucide-react';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';

interface CallInteraction {
  id: string;
  tipo: string;
  contenido: string;
  resultado: string | null;
  fechaCreacion: string;
  metadatos: any;
  lead?: {
    id: string;
    nombre: string;
    telefono: string;
  };
  creador?: {
    id: string;
    name: string;
  };
}

export function CallHistoryTable({ calls, loading }: { calls: CallInteraction[], loading: boolean }) {
  const getStatusBadge = (disposition: string) => {
    switch (disposition?.toLowerCase()) {
      case 'answered':
        return <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-200 border-none">Contestada</Badge>;
      case 'no answer':
      case 'missed':
        return <Badge className="bg-rose-100 text-rose-700 hover:bg-rose-200 border-none">Perdida</Badge>;
      case 'busy':
        return <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-200 border-none">Ocupado</Badge>;
      default:
        return <Badge variant="outline">{disposition || 'Desconocido'}</Badge>;
    }
  };

  const formatDuration = (seconds: number) => {
    if (!seconds) return '0s';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins > 0) return `${mins} min, ${secs} seg`;
    return `${secs} segundos`;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="relative w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input 
            placeholder="Buscar por contacto o número..." 
            className="pl-10 h-10 border-slate-200 focus:border-blue-400 focus:ring-blue-400/20"
          />
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="h-10 border-slate-200 gap-2">
            <Filter className="h-4 w-4" /> Filtrar
          </Button>
          <Button variant="outline" size="sm" className="h-10 border-slate-200 gap-2">
            <Download className="h-4 w-4" /> Exportar
          </Button>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
        <Table>
          <TableHeader className="bg-slate-50/50">
            <TableRow>
              <TableHead className="text-[11px] uppercase tracking-wider font-bold">Contacto</TableHead>
              <TableHead className="text-[11px] uppercase tracking-wider font-bold">Línea Telefónica</TableHead>
              <TableHead className="text-[11px] uppercase tracking-wider font-bold">Usuario</TableHead>
              <TableHead className="text-[11px] uppercase tracking-wider font-bold">Status</TableHead>
              <TableHead className="text-[11px] uppercase tracking-wider font-bold">Duración</TableHead>
              <TableHead className="text-[11px] uppercase tracking-wider font-bold">Fecha y Hora</TableHead>
              <TableHead className="text-[11px] uppercase tracking-wider font-bold text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 7 }).map((_, j) => (
                    <TableCell key={j}><div className="h-4 bg-slate-100 animate-pulse rounded" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : calls.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-32 text-center text-slate-500">
                  <div className="flex flex-col items-center gap-2">
                    <Phone className="h-8 w-8 opacity-20" />
                    <p>No se encontraron llamadas registradas</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              calls.map((call) => {
                const meta = call.metadatos || {};
                const direction = meta.direction || 'inbound';
                const isOutbound = direction === 'outbound';

                return (
                  <TableRow key={call.id} className="group hover:bg-blue-50/30 transition-colors">
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          "h-8 w-8 rounded-lg flex items-center justify-center shrink-0",
                          isOutbound ? "bg-violet-100 text-violet-600" : "bg-emerald-100 text-emerald-600"
                        )}>
                          {isOutbound ? <PhoneOutgoing size={14} /> : <PhoneIncoming size={14} />}
                        </div>
                        <div>
                          <p className="font-bold text-sm text-slate-900 leading-none mb-1">
                            {call.lead?.nombre || 'Desconocido'}
                          </p>
                          <p className="text-xs text-slate-500 font-mono">
                            {call.lead?.telefono || meta.from || meta.to || 'No disponible'}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm font-medium text-slate-600">
                      {isOutbound ? meta.from : meta.to || 'Línea Central'}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="h-6 w-6 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-500 border border-slate-200">
                          {call.creador?.name?.charAt(0) || <User size={10} />}
                        </div>
                        <span className="text-sm text-slate-600">{call.creador?.name || 'Sistema'}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {getStatusBadge(meta.disposition || call.resultado)}
                    </TableCell>
                    <TableCell className="text-sm text-slate-600 font-medium">
                      {formatDuration(meta.duration || 0)}
                    </TableCell>
                    <TableCell className="text-sm text-slate-500 whitespace-nowrap">
                      {format(new Date(call.fechaCreacion), "MMMM d, yyyy - h:mm a", { locale: es })}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {meta.recording_url && (
                          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-blue-600" asChild title="Escuchar grabación">
                            <a href={meta.recording_url} target="_blank"><Play size={14} /></a>
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-slate-400 hover:text-blue-600" title="Ver detalle">
                          <ExternalLink size={14} />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
