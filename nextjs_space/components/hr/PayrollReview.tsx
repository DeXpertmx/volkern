'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { 
  ShieldCheck, 
  Lock, 
  AlertTriangle, 
  Save, 
  History,
  FileText,
  Edit3,
  CheckCircle2
} from 'lucide-react';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

export function PayrollReview({ payrollId }: { payrollId: string }) {
  const [isEditing, setIsEditing] = useState(false);
  const [operatorNote, setOperatorNote] = useState('');
  const [hasOverrides, setHasOverrides] = useState(false);
  const [status, setStatus] = useState('DRAFT');

  const handleOverride = () => {
    setHasOverrides(true);
    toast.info('Ajuste manual detectado', {
      description: 'Se requiere una nota del operador para sellar esta nómina.'
    });
  };

  const handleSeal = () => {
    if (hasOverrides && !operatorNote) {
      toast.error('Justificación obligatoria', {
        description: 'Debes incluir una nota del operador para sellar ajustes manuales.'
      });
      return;
    }
    setStatus('SEALED');
    toast.success('Nómina Sellada Criptográficamente', {
      description: 'Hash SHA-256 generado y registrado en el Trust Protocol.'
    });
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-4xl font-black tracking-tighter uppercase">Revisión de <span className="text-primary italic">Soberanía</span></h2>
          <p className="text-slate-500 font-medium">Validación forense del cálculo vs. ejecución manual.</p>
        </div>
        <Badge className={cn(
          "px-6 py-2 rounded-2xl text-sm font-black tracking-widest",
          status === 'SEALED' ? "bg-emerald-500" : "bg-amber-500"
        )}>
          {status}
        </Badge>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Panel de Comparación */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="border-none shadow-2xl overflow-hidden rounded-[2.5rem] bg-white">
            <CardHeader className="bg-slate-50/50 border-b p-8">
               <div className="flex justify-between items-center">
                  <CardTitle className="text-xl font-bold flex items-center gap-2">
                    <FileText className="h-5 w-5 text-primary" /> Desglose de Nómina (Abril 2026)
                  </CardTitle>
                  <Button variant="outline" size="sm" onClick={() => setIsEditing(!isEditing)} className="rounded-xl border-slate-200">
                    <Edit3 className="h-4 w-4 mr-2" /> {isEditing ? 'Finalizar Edición' : 'Activar Override'}
                  </Button>
               </div>
            </CardHeader>
            <CardContent className="p-0">
               <table className="w-full">
                  <thead className="text-[10px] font-black uppercase tracking-widest text-slate-400 bg-slate-50/30">
                     <tr>
                        <th className="p-6 text-left">Concepto</th>
                        <th className="p-6 text-right">Cálculo IA</th>
                        <th className="p-6 text-right">Ajuste Manual</th>
                     </tr>
                  </thead>
                  <tbody>
                     {[
                       { code: '101', name: 'Salario Base', ai: 2500, manual: 2500 },
                       { code: '102', name: 'Plus Convenio', ai: 300.50, manual: 300.50 },
                       { code: '801', name: 'Retención IRPF (15%)', ai: -420, manual: -420, isOverride: true },
                     ].map((item, i) => (
                       <tr key={i} className="border-b last:border-none group hover:bg-slate-50/50 transition-all">
                          <td className="p-6 font-bold text-slate-900">
                             <div className="flex items-center gap-3">
                                <span className="text-[10px] text-slate-300">#{item.code}</span>
                                {item.name}
                             </div>
                          </td>
                          <td className="p-6 text-right font-medium text-slate-400 italic">
                             {item.ai.toFixed(2)}€
                          </td>
                          <td className={cn(
                            "p-6 text-right transition-all",
                            isEditing && "bg-amber-50/30"
                          )}>
                             {isEditing ? (
                               <Input 
                                 defaultValue={item.manual} 
                                 onChange={handleOverride}
                                 className="h-10 w-32 ml-auto bg-white border-amber-200 text-right font-black" 
                               />
                             ) : (
                               <span className={cn(
                                 "font-black text-lg",
                                 item.ai !== item.manual ? "text-amber-600" : "text-slate-900"
                               )}>
                                 {item.manual.toFixed(2)}€
                               </span>
                             )}
                          </td>
                       </tr>
                     ))}
                  </tbody>
               </table>
            </CardContent>
          </Card>
        </div>

        {/* Panel de Sellado Trust Protocol */}
        <div className="space-y-6">
           <Card className="border-none shadow-2xl bg-slate-900 text-white rounded-[2.5rem] p-8 space-y-6 relative overflow-hidden group">
              <ShieldCheck className="absolute -right-8 -bottom-8 h-48 w-48 text-white/5 group-hover:scale-110 transition-transform duration-700" />
              
              <div className="space-y-4 relative z-10">
                 <div className="h-12 w-12 bg-primary/20 rounded-2xl flex items-center justify-center text-primary">
                    <Lock className="h-6 w-6" />
                 </div>
                 <h3 className="text-2xl font-black uppercase tracking-tight">Trust Protocol</h3>
                 <p className="text-xs text-slate-400 font-medium leading-relaxed">
                    El sellado generará un snapshot inmutable de todos los datos maestros, tablas legales aplicadas y cualquier ajuste manual realizado.
                 </p>
              </div>

              <div className="space-y-4 relative z-10 pt-4">
                 <Label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Nota del Operador (Obligatorio si hay Override)</Label>
                 <Textarea 
                   value={operatorNote}
                   onChange={(e) => setOperatorNote(e.target.value)}
                   placeholder="Justifica los cambios realizados..." 
                   className={cn(
                     "bg-white/5 border-white/10 rounded-2xl text-xs font-medium focus:border-primary/50 transition-all min-h-[100px]",
                     hasOverrides && !operatorNote && "border-amber-500/50"
                   )}
                 />
                 {hasOverrides && !operatorNote && (
                   <p className="text-[10px] text-amber-500 font-bold flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" /> Justificación requerida para sellado.
                   </p>
                 )}
              </div>

              <Button 
                onClick={handleSeal}
                disabled={status === 'SEALED'}
                className="w-full h-14 bg-primary hover:bg-primary/90 text-white rounded-2xl font-black uppercase tracking-widest shadow-xl shadow-primary/20 group relative z-10"
              >
                 {status === 'SEALED' ? (
                   <><CheckCircle2 className="h-5 w-5 mr-2" /> Nómina Sellada</>
                 ) : (
                   <><ShieldCheck className="h-5 w-5 mr-2" /> Generar Sello Digital</>
                 )}
              </Button>
           </Card>

           <div className="p-6 rounded-3xl border-2 border-dashed border-slate-200 flex items-center gap-4">
              <History className="h-6 w-6 text-slate-300" />
              <div>
                 <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Huella Digital</p>
                 <p className="text-[10px] font-mono text-slate-300 truncate max-w-[150px]">
                    SHA256: 8f9a2b...3c4d5e
                 </p>
              </div>
           </div>
        </div>
      </div>
    </div>
  );
}
