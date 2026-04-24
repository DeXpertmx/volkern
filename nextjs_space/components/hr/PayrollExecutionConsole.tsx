'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Play, 
  Search, 
  Filter, 
  Download, 
  ShieldCheck, 
  Lock,
  Clock,
  AlertOctagon,
  FileText,
  User,
  MoreVertical
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

export function PayrollExecutionConsole() {
  const [isRunning, setIsRunning] = useState(false);
  const [selectedEmployees, setSelectedEmployees] = useState<string[]>([]);

  const handleRunPayroll = async () => {
    setIsRunning(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 3000));
      toast.success('Cálculo de nóminas completado', {
        description: 'Se han generado 24 borradores de nómina para el periodo Abril 2026.'
      });
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="p-6 space-y-10 max-w-7xl mx-auto">
      {/* Header Premium con Stats */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-8">
        <div className="space-y-4">
          <div className="flex items-center gap-3 text-primary font-black uppercase tracking-[0.3em] text-[10px]">
            <Lock className="h-4 w-4 fill-primary" />
            Soberanía Financiera Volkern
          </div>
          <h1 className="text-6xl font-black tracking-tighter uppercase leading-none">
            Mesa de <span className="text-primary italic">Nóminas</span>
          </h1>
          <p className="text-xl text-muted-foreground font-medium max-w-2xl">
            Ejecución masiva, corrección supervisada y sellado de nóminas españolas (ES).
          </p>
        </div>

        <div className="flex gap-4">
           <Card className="bg-slate-900 text-white border-none p-6 shadow-2xl">
              <div className="flex items-center gap-4">
                 <div className="p-3 bg-white/10 rounded-2xl text-emerald-400">
                   <ShieldCheck className="h-6 w-6" />
                 </div>
                 <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Vigencia Legal</p>
                    <p className="text-lg font-bold">Tablas 2024 (v1.4)</p>
                 </div>
              </div>
           </Card>
        </div>
      </div>

      {/* Toolbar y Filtros */}
      <div className="flex items-center justify-between p-2 bg-slate-100/50 rounded-2xl border border-slate-200">
         <div className="flex items-center gap-2">
            <Button variant="ghost" className="rounded-xl font-bold bg-white shadow-sm border border-slate-200">
               Periodo: Abril 2026 <Clock className="h-4 w-4 ml-2" />
            </Button>
            <div className="w-px h-6 bg-slate-300 mx-2" />
            <div className="flex gap-1">
               <Badge className="bg-slate-900 px-4 py-2 rounded-xl">Borradores (24)</Badge>
               <Badge variant="outline" className="px-4 py-2 rounded-xl border-slate-300">Pendientes (1)</Badge>
               <Badge variant="outline" className="px-4 py-2 rounded-xl border-slate-300">Selladas (0)</Badge>
            </div>
         </div>
         <div className="flex gap-2">
            <Button variant="outline" className="rounded-xl border-slate-300 font-bold">
               <Download className="h-4 w-4 mr-2" /> Exportar Remesa
            </Button>
            <Button 
              onClick={handleRunPayroll}
              disabled={isRunning}
              className="bg-primary hover:bg-primary/90 text-white rounded-xl px-8 font-black uppercase tracking-wide shadow-xl shadow-primary/20"
            >
               {isRunning ? <Clock className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2 fill-white" />}
               Ejecutar Cálculo
            </Button>
         </div>
      </div>

      {/* Lista de Empleados / Nóminas */}
      <Card className="border-none shadow-2xl bg-white overflow-hidden rounded-3xl">
         <table className="w-full">
            <thead className="bg-slate-50/50 border-b">
               <tr className="text-left">
                  <th className="p-6 text-[10px] font-black uppercase tracking-widest text-slate-500">Empleado</th>
                  <th className="p-6 text-[10px] font-black uppercase tracking-widest text-slate-500">Tramo / Vigencia</th>
                  <th className="p-6 text-[10px] font-black uppercase tracking-widest text-slate-500">Bruto</th>
                  <th className="p-6 text-[10px] font-black uppercase tracking-widest text-slate-500">B. Cotización</th>
                  <th className="p-6 text-[10px] font-black uppercase tracking-widest text-slate-500">Neto</th>
                  <th className="p-6 text-[10px] font-black uppercase tracking-widest text-slate-500">Estado</th>
                  <th className="p-6"></th>
               </tr>
            </thead>
            <tbody>
               {[
                 { name: 'Carlos Martinez', role: 'Dev Sr', tramos: 1, gross: 4200, base: 4500, net: 2950, status: 'DRAFT' },
                 { name: 'Elena Rodriguez', role: 'Project Manager', tramos: 2, gross: 3800, base: 3800, net: 2680, status: 'DRAFT', warn: 'Cambio de jornada' },
                 { name: 'Juan García', role: 'Support Specialist', tramos: 1, gross: 2200, base: 2200, net: 1750, status: 'LOCKED' },
               ].map((emp, i) => (
                 <tr key={i} className="border-b last:border-none hover:bg-slate-50/50 transition-colors">
                    <td className="p-6">
                       <div className="flex items-center gap-4">
                          <div className="h-10 w-10 bg-slate-200 rounded-xl flex items-center justify-center text-slate-500">
                             <User className="h-5 w-5" />
                          </div>
                          <div>
                             <p className="font-bold text-slate-900">{emp.name}</p>
                             <p className="text-[10px] text-slate-400 font-bold uppercase">{emp.role}</p>
                          </div>
                       </div>
                    </td>
                    <td className="p-6">
                       <div className="flex flex-col gap-1">
                          <Badge variant="outline" className="w-fit text-[10px] border-slate-200">{emp.tramos} tramo(s)</Badge>
                          {emp.warn && <p className="text-[10px] text-amber-600 font-bold flex items-center gap-1">
                            <AlertOctagon className="h-3 w-3" /> {emp.warn}
                          </p>}
                       </div>
                    </td>
                    <td className="p-6 font-black tracking-tighter">{emp.gross.toFixed(2)}€</td>
                    <td className="p-6 font-bold text-slate-500 tracking-tighter">{emp.base.toFixed(2)}€</td>
                    <td className="p-6 font-black text-primary text-xl tracking-tighter">{emp.net.toFixed(2)}€</td>
                    <td className="p-6">
                       <Badge className={cn(
                         "px-3 py-1 rounded-lg text-[10px] font-black tracking-widest",
                         emp.status === 'DRAFT' ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"
                       )}>
                          {emp.status}
                       </Badge>
                    </td>
                    <td className="p-6 text-right">
                       <div className="flex justify-end gap-2">
                          <Button variant="ghost" size="icon" className="rounded-xl hover:bg-white hover:shadow-md">
                             <FileText className="h-4 w-4 text-slate-400" />
                          </Button>
                          <Button variant="ghost" size="icon" className="rounded-xl hover:bg-white hover:shadow-md">
                             <MoreVertical className="h-4 w-4 text-slate-400" />
                          </Button>
                       </div>
                    </td>
                 </tr>
               ))}
            </tbody>
         </table>
      </Card>

      {/* Advisory section */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
         <Card className="bg-slate-900 text-white border-none p-8 rounded-3xl shadow-2xl relative overflow-hidden group">
            <div className="relative z-10 space-y-4">
               <div className="h-12 w-12 bg-white/10 rounded-2xl flex items-center justify-center text-primary">
                 <ShieldCheck className="h-6 w-6" />
               </div>
               <h3 className="text-xl font-black uppercase tracking-tight">Trust Protocol</h3>
               <p className="text-xs text-white/60 leading-relaxed font-medium">
                  Cada nómina generada y sellada en Volkern es inmutable. El sistema guarda un snapshot completo de las reglas y datos usados en el cálculo.
               </p>
            </div>
         </Card>
         <Card className="bg-primary text-white border-none p-8 rounded-3xl shadow-2xl relative overflow-hidden group">
            <div className="relative z-10 space-y-4">
               <div className="h-12 w-12 bg-white/10 rounded-2xl flex items-center justify-center text-white">
                 <Lock className="h-6 w-6" />
               </div>
               <h3 className="text-xl font-black uppercase tracking-tight">Soberanía Humana</h3>
               <p className="text-xs text-white/80 leading-relaxed font-medium">
                  El motor permite correcciones manuales, pero exige una justificación (operatorNote) que queda registrada permanentemente para auditoría.
               </p>
            </div>
         </Card>
         <Card className="bg-white border border-slate-200 p-8 rounded-3xl shadow-lg space-y-4">
            <div className="h-12 w-12 bg-slate-100 rounded-2xl flex items-center justify-center text-slate-600">
               <FileText className="h-6 w-6" />
            </div>
            <h3 className="text-xl font-black uppercase tracking-tight text-slate-900">Validación Legal</h3>
            <p className="text-xs text-slate-500 leading-relaxed font-medium">
               Cumplimiento estricto con el Estatuto de los Trabajadores y las bases de cotización vigentes actualizadas por el motor de reglas.
            </p>
         </Card>
      </div>
    </div>
  );
}
