'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { 
  Calculator, 
  Calendar, 
  ShieldCheck, 
  History,
  AlertCircle,
  Save,
  Plus,
  ArrowRight
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

export function EmployeePayrollConfig() {
  const [activeTab, setActiveTab] = useState('contract');
  const [loading, setLoading] = useState(false);

  const handleSaveVersion = async () => {
    setLoading(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 1500));
      toast.success('Nueva vigencia salarial creada', {
        description: 'Los cambios se aplicarán a partir del próximo periodo de cálculo.'
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 max-w-7xl mx-auto">
      {/* Sidebar de Navegación Local */}
      <div className="lg:col-span-3 space-y-4">
        <div className="p-6 rounded-3xl bg-slate-900 text-white space-y-6 shadow-2xl">
           <div className="flex items-center gap-3">
              <div className="h-10 w-10 bg-primary/20 rounded-2xl flex items-center justify-center text-primary">
                <Calculator className="h-6 w-6" />
              </div>
              <h2 className="font-black uppercase tracking-tight text-lg leading-tight">Nómina<br/>España (ES)</h2>
           </div>
           
           <nav className="space-y-1">
              {[
                { id: 'contract', label: 'Contrato y SS', icon: ShieldCheck },
                { id: 'salary', label: 'Salario y Convenio', icon: Calculator },
                { id: 'tax', label: 'IRPF y Fiscalidad', icon: AlertCircle },
                { id: 'history', label: 'Historial Vigencias', icon: History }
              ].map((item) => (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={cn(
                    "w-full flex items-center gap-3 p-3 rounded-xl text-sm font-bold transition-all",
                    activeTab === item.id ? "bg-white/10 text-primary" : "text-slate-400 hover:text-white hover:bg-white/5"
                  )}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </button>
              ))}
           </nav>
        </div>

        <Card className="bg-amber-50 border-amber-200 p-6 rounded-3xl">
           <div className="flex items-start gap-4">
              <AlertCircle className="h-6 w-6 text-amber-600 shrink-0" />
              <div>
                <p className="text-sm font-bold text-amber-900 mb-1">Cálculo por Vigencia</p>
                <p className="text-xs text-amber-800/70 leading-relaxed font-medium">
                  Cualquier cambio aquí generará una nueva versión. Volkern calculará la nómina por tramos si el cambio ocurre a mitad de mes.
                </p>
              </div>
           </div>
        </Card>
      </div>

      {/* Contenedor de Formularios */}
      <div className="lg:col-span-9 space-y-8">
        {activeTab === 'contract' && (
          <Card className="border-none shadow-2xl bg-white/80 backdrop-blur-xl animate-in fade-in slide-in-from-bottom-4">
            <CardHeader>
              <CardTitle className="text-3xl font-black uppercase tracking-tighter">Configuración Laboral</CardTitle>
              <CardDescription>Datos maestros para cotización a la Seguridad Social</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label className="text-[10px] font-bold uppercase text-slate-500">Grupo de Cotización</Label>
                <select className="w-full h-12 bg-slate-50 border-none rounded-xl px-4 text-sm font-bold focus:ring-2 focus:ring-primary/20">
                  <option>Grupo 1 - Ingenieros y Licenciados</option>
                  <option>Grupo 2 - Peritos e Ingenieros Técnicos</option>
                  <option>Grupo 3 - Jefes Administrativos</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-bold uppercase text-slate-500">Tipo de Contrato</Label>
                <Input placeholder="100 - Indefinido T.C." className="h-12 bg-slate-50 border-none rounded-xl font-bold" />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-bold uppercase text-slate-500">Porcentaje de Jornada (%)</Label>
                <Input type="number" defaultValue={100} className="h-12 bg-slate-50 border-none rounded-xl font-bold" />
              </div>
              <div className="space-y-2">
                <Label className="text-[10px] font-bold uppercase text-slate-500">Régimen SS</Label>
                <Badge variant="secondary" className="h-12 w-full flex items-center justify-center rounded-xl bg-slate-100 text-slate-600 font-black tracking-widest border-none">
                  GENERAL (0111)
                </Badge>
              </div>
            </CardContent>
            <CardFooter className="flex justify-end p-6 border-t bg-slate-50/50 rounded-b-3xl">
               <Button onClick={handleSaveVersion} disabled={loading} className="rounded-2xl px-8 font-bold gap-2">
                  {loading ? <History className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Guardar nueva vigencia
               </Button>
            </CardFooter>
          </Card>
        )}

        {activeTab === 'salary' && (
          <Card className="border-none shadow-2xl bg-white/80 backdrop-blur-xl animate-in fade-in slide-in-from-bottom-4">
            <CardHeader>
              <CardTitle className="text-3xl font-black uppercase tracking-tighter">Retribuciones y Convenio</CardTitle>
              <CardDescription>Estructura salarial vinculada a tablas de convenio</CardDescription>
            </CardHeader>
            <CardContent className="space-y-8">
              <div className="p-6 rounded-3xl bg-primary/5 border border-primary/10 flex items-center justify-between">
                 <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-primary mb-1">Convenio Aplicable</p>
                    <p className="text-xl font-bold text-slate-900">Consultoría y Estudios de Mercado (TIC)</p>
                 </div>
                 <Button variant="ghost" className="rounded-xl text-primary font-bold">Cambiar Convenio <ArrowRight className="h-4 w-4 ml-2" /></Button>
              </div>

              <div className="grid grid-cols-2 gap-8">
                <div className="space-y-4">
                   <Label className="text-sm font-black uppercase tracking-tight text-slate-900">Conceptos Fijos</Label>
                   <div className="space-y-4">
                      <div className="flex items-end gap-4">
                         <div className="flex-1 space-y-2">
                            <Label className="text-[10px] font-bold uppercase text-slate-500">Salario Base</Label>
                            <Input type="number" defaultValue={2500} className="h-12 bg-slate-50 border-none rounded-xl font-black" />
                         </div>
                         <Badge variant="outline" className="h-12 px-4 rounded-xl text-xs font-bold border-emerald-100 text-emerald-600 bg-emerald-50">Cotizable</Badge>
                      </div>
                      <div className="flex items-end gap-4">
                         <div className="flex-1 space-y-2">
                            <Label className="text-[10px] font-bold uppercase text-slate-500">Plus Transporte</Label>
                            <Input type="number" defaultValue={150} className="h-12 bg-slate-50 border-none rounded-xl font-black" />
                         </div>
                         <Badge variant="outline" className="h-12 px-4 rounded-xl text-xs font-bold border-amber-100 text-amber-600 bg-amber-50">Exento</Badge>
                      </div>
                   </div>
                </div>

                <div className="space-y-4">
                   <Label className="text-sm font-black uppercase tracking-tight text-slate-900">Configuración Pagas</Label>
                   <div className="p-6 rounded-3xl bg-slate-50 space-y-4 border border-slate-100">
                      <div className="flex justify-between items-center">
                         <span className="text-sm font-bold text-slate-600">Prorrata Pagas Extra</span>
                         <Badge className="bg-emerald-500">ACTIVA</Badge>
                      </div>
                      <div className="flex justify-between items-center text-xs">
                         <span className="text-slate-400 font-medium">Cómputo anual</span>
                         <span className="font-bold text-slate-900">14 Pagas</span>
                      </div>
                   </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Auditoría de Seguridad Social Snapshot */}
        <div className="p-8 rounded-3xl bg-slate-50 border border-slate-200 flex items-center justify-between">
           <div className="flex items-center gap-4">
              <div className="h-12 w-12 bg-emerald-100 rounded-2xl flex items-center justify-center text-emerald-600">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <div>
                 <p className="text-sm font-black uppercase tracking-tight">Trust Protocol: Nómina ES</p>
                 <p className="text-xs text-slate-400 font-medium italic">Estado: Listo para cálculo. Último snapshot: Hoy, 14:30</p>
              </div>
           </div>
           <Button variant="outline" className="rounded-xl border-slate-200 font-bold">Verificar Integridad</Button>
        </div>
      </div>
    </div>
  );
}
