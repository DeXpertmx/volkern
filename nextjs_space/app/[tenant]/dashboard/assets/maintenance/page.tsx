'use client';

import useSWR from 'swr';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Activity,
  Package, 
  Calendar,
  Tool,
  Wrench,
  AlertTriangle,
  CheckCircle2
} from 'lucide-react';
import { cn } from '@/lib/utils';

const fetcher = (url: string) => fetch(url).then(res => res.json());

export default function MaintenancePage() {
  const { data: maintenance, isLoading } = useSWR('/api/assets/maintenance', fetcher);

  if (isLoading) return (
    <div className="p-8 space-y-8 animate-pulse">
      <div className="h-10 w-64 bg-slate-100 rounded-full" />
      <div className="space-y-4">
        {Array(4).fill(0).map((_, i) => (
          <div key={i} className="h-24 bg-slate-50 rounded-[2rem]" />
        ))}
      </div>
    </div>
  );

  return (
    <div className="p-8 space-y-8 bg-[#fafafa] min-h-screen">
      {/* Header */}
      <div className="flex justify-between items-end">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-amber-600 font-bold uppercase text-[10px] tracking-widest">
            <Wrench className="w-4 h-4" />
            Servicios y Salud de Planta
          </div>
          <h1 className="text-4xl font-black text-slate-900 uppercase tracking-tight">
            Historial de <span className="text-amber-600">Mantenimiento</span>
          </h1>
        </div>
        <div className="flex gap-3">
          <Button className="rounded-2xl h-12 px-8 font-black uppercase text-[10px] tracking-widest bg-slate-900 shadow-xl shadow-slate-200">
            Programar Servicio
          </Button>
        </div>
      </div>

      {/* List */}
      <div className="space-y-4">
        {(maintenance || []).length > 0 ? (
          maintenance.map((item: any, i: number) => (
            <Card key={i} className="p-6 rounded-[2rem] border-none shadow-sm bg-white hover:shadow-md transition-all flex items-center gap-6">
              <div className={cn(
                "h-14 w-14 rounded-2xl flex items-center justify-center",
                item.type === 'CORRECTIVE' ? "bg-rose-50 text-rose-500" : "bg-amber-50 text-amber-500"
              )}>
                <Wrench className="w-6 h-6" />
              </div>
              
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-1">
                  <h3 className="font-black text-slate-900 uppercase text-sm tracking-tight">{item.description}</h3>
                  <Badge variant="outline" className="rounded-full text-[8px] font-black uppercase px-3 py-1 border-slate-100 text-slate-400">
                    {item.type}
                  </Badge>
                </div>
                <div className="flex items-center gap-4">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1">
                    <Package className="w-3 h-3" /> {item.asset.name} (SN: {item.asset.serialNumber})
                  </p>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1">
                    <Calendar className="w-3 h-3" /> {new Date(item.date).toLocaleDateString()}
                  </p>
                </div>
              </div>

              <div className="text-right">
                <p className="text-[10px] font-black text-slate-900 uppercase tracking-widest mb-1">Costo Estimado</p>
                <p className="text-lg font-black text-slate-900">${item.cost?.toLocaleString() || '0'}</p>
              </div>

              <div className="h-10 w-10 rounded-full bg-emerald-50 text-emerald-500 flex items-center justify-center">
                 <CheckCircle2 className="w-6 h-6" />
              </div>
            </Card>
          ))
        ) : (
          <div className="py-20 text-center space-y-4 opacity-40">
             <Activity className="w-16 h-16 mx-auto text-slate-300" />
             <p className="text-sm font-black uppercase tracking-widest text-slate-400">No hay registros de mantenimiento</p>
          </div>
        )}
      </div>
    </div>
  );
}