'use client';

import useSWR from 'swr';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Users, 
  Package, 
  ArrowRight,
  Search,
  Calendar,
  UserCheck
} from 'lucide-react';
import { cn } from '@/lib/utils';

const fetcher = (url: string) => fetch(url).then(res => res.json());

export default function AssignmentsPage() {
  const { data: assignments, isLoading } = useSWR('/api/assets/assignments', fetcher);

  if (isLoading) return (
    <div className="p-8 space-y-8 animate-pulse">
      <div className="h-10 w-64 bg-slate-100 rounded-full" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {Array(4).fill(0).map((_, i) => (
          <div key={i} className="h-40 bg-slate-50 rounded-[2rem]" />
        ))}
      </div>
    </div>
  );

  return (
    <div className="p-8 space-y-8 bg-[#fafafa] min-h-screen">
      {/* Header */}
      <div className="flex justify-between items-end">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-primary font-bold uppercase text-[10px] tracking-widest">
            <UserCheck className="w-4 h-4" />
            Control de Responsiva
          </div>
          <h1 className="text-4xl font-black text-slate-900 uppercase tracking-tight">
            Asignaciones de <span className="text-primary">Activos</span>
          </h1>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" className="rounded-2xl border-slate-200 h-12 font-black uppercase text-[10px] tracking-widest px-6 bg-white">
            Nueva Asignación
          </Button>
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {(assignments || []).length > 0 ? (
          assignments.map((assignment: any, i: number) => (
            <Card key={i} className="overflow-hidden rounded-[2.5rem] border-none shadow-sm bg-white hover:shadow-xl transition-all duration-300">
              <div className="p-8 flex items-center justify-between gap-6">
                <div className="flex items-center gap-4 flex-1">
                  <div className="h-16 w-16 rounded-3xl bg-indigo-50 flex items-center justify-center text-indigo-500">
                    <Package className="w-8 h-8" />
                  </div>
                  <div>
                    <h3 className="font-black text-slate-900 uppercase text-sm leading-tight line-clamp-1">{assignment.asset.name}</h3>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">SN: {assignment.asset.serialNumber}</p>
                  </div>
                </div>

                <div className="flex items-center gap-4 flex-1 justify-end">
                   <ArrowRight className="w-5 h-5 text-slate-200" />
                   <div className="text-right">
                      <h3 className="font-black text-slate-900 uppercase text-sm leading-tight">{assignment.employee.fullName}</h3>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{assignment.employee.email}</p>
                   </div>
                   <div className="h-16 w-16 rounded-3xl bg-emerald-50 flex items-center justify-center text-emerald-500">
                    <Users className="w-8 h-8" />
                  </div>
                </div>
              </div>

              <div className="px-8 py-4 bg-slate-50 flex justify-between items-center">
                 <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    <Calendar className="w-4 h-4" />
                    Asignado el {new Date(assignment.assignedAt).toLocaleDateString()}
                 </div>
                 <Badge className="bg-emerald-100 text-emerald-700 border-none font-black text-[9px] uppercase tracking-widest px-4 py-1 rounded-full">
                    Activo
                 </Badge>
              </div>
            </Card>
          ))
        ) : (
          <div className="col-span-full py-20 text-center space-y-4 opacity-40">
             <Users className="w-16 h-16 mx-auto text-slate-300" />
             <p className="text-sm font-black uppercase tracking-widest text-slate-400">No hay asignaciones activas</p>
          </div>
        )}
      </div>
    </div>
  );
}