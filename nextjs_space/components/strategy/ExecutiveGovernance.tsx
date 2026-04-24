'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  ShieldCheck, 
  Zap, 
  TrendingDown, 
  TrendingUp, 
  AlertCircle, 
  CheckCircle2,
  Lock,
  Eye,
  Rocket,
  Activity
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

export function ExecutiveGovernance() {
  const [actions, setActions] = useState([
    { id: '1', title: 'Reclamación de Cobro (Factura #442)', cat: 'FINANCE', priority: 'HIGH', confidence: 92, desc: 'Detectado retraso de 5 días. Propuesta: Enviar recordatorio nivel 2.' },
    { id: '2', title: 'Ajuste de Stock: Tornillería ISO', cat: 'SUPPLY', priority: 'MEDIUM', confidence: 88, desc: 'Stock bajo el umbral de seguridad. Propuesta: Generar Orden de Compra #991.' },
  ]);

  const handleApprove = (id: string) => {
    toast.success('Acción aprobada y sellada', {
      description: 'Se ha registrado la firma digital en el Trust Protocol.'
    });
    setActions(actions.filter(a => a.id !== id));
  };

  return (
    <div className="p-8 space-y-12 max-w-7xl mx-auto animate-in fade-in duration-700">
      {/* Header Estratégico */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-8">
        <div className="space-y-4">
          <div className="flex items-center gap-3 text-primary font-black uppercase tracking-[0.3em] text-[10px]">
            <Rocket className="h-4 w-4 fill-primary" />
            Control de Misión v3.0
          </div>
          <h1 className="text-6xl font-black tracking-tighter uppercase leading-none">
            Executive <span className="text-primary italic">Governance</span>
          </h1>
          <p className="text-xl text-muted-foreground font-medium max-w-2xl">
            Gobernanza por excepción. Volkern Autopilot anticipa, tú decides.
          </p>
        </div>

        <div className="flex gap-4 p-2 bg-slate-100 rounded-3xl">
           <div className="px-6 py-4 bg-white rounded-2xl shadow-lg flex items-center gap-4">
              <div className="h-3 w-3 bg-emerald-500 rounded-full animate-pulse" />
              <div>
                 <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 leading-none mb-1">Health Score</p>
                 <p className="text-xl font-black">94%</p>
              </div>
           </div>
        </div>
      </div>

      {/* Semáforos de Salud Táctica */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
         {[
           { label: 'Margen Bruto', value: '32.4%', status: 'HEALTHY', icon: TrendingUp },
           { label: 'Cashflow (90d)', value: 'Critically Low', status: 'DANGER', icon: TrendingDown },
           { label: 'Adopción', value: 'High', status: 'HEALTHY', icon: Activity },
           { label: 'Compliance', value: '100%', status: 'HEALTHY', icon: ShieldCheck },
         ].map((stat, i) => (
           <Card key={i} className="border-none shadow-xl rounded-[2.5rem] overflow-hidden group">
              <CardContent className="p-8 flex flex-col gap-4">
                 <div className={cn(
                   "h-14 w-14 rounded-2xl flex items-center justify-center transition-all",
                   stat.status === 'HEALTHY' ? "bg-emerald-50 text-emerald-500" : "bg-rose-50 text-rose-500"
                 )}>
                    <stat.icon className="h-7 w-7" />
                 </div>
                 <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">{stat.label}</p>
                    <p className={cn(
                      "text-2xl font-black uppercase",
                      stat.status === 'DANGER' && "text-rose-600"
                    )}>{stat.value}</p>
                 </div>
              </CardContent>
           </Card>
         ))}
      </div>

      {/* Autopilot Action Center */}
      <div className="space-y-6">
         <div className="flex items-center justify-between">
            <h3 className="text-3xl font-black uppercase tracking-tight italic text-slate-800">Autopilot <span className="text-primary underline">Proposals</span></h3>
            <Badge className="bg-primary/10 text-primary px-4 py-1 rounded-xl text-[10px] font-black tracking-widest">
               {actions.length} PENDIENTES
            </Badge>
         </div>

         <div className="grid grid-cols-1 gap-6">
            {actions.map((action) => (
              <Card key={action.id} className="border-none shadow-2xl rounded-[2.5rem] bg-white group hover:scale-[1.01] transition-all">
                 <CardContent className="p-10 flex flex-col md:flex-row items-center justify-between gap-8">
                    <div className="flex items-center gap-8 flex-1">
                       <div className="h-20 w-20 bg-slate-900 rounded-3xl flex items-center justify-center text-white relative">
                          <Zap className="h-10 w-10 fill-primary text-primary" />
                          <div className="absolute -top-2 -right-2 h-8 w-8 bg-primary rounded-full flex items-center justify-center text-[10px] font-black border-4 border-white">
                             {action.confidence}%
                          </div>
                       </div>
                       <div className="space-y-2">
                          <div className="flex items-center gap-3">
                             <Badge variant="outline" className="text-[10px] font-black uppercase tracking-widest py-1 border-slate-200">
                                {action.cat}
                             </Badge>
                             <span className="text-[10px] font-bold text-rose-500 uppercase flex items-center gap-1">
                                <AlertCircle className="h-3 w-3" /> {action.priority}
                             </span>
                          </div>
                          <h4 className="text-2xl font-black uppercase tracking-tight">{action.title}</h4>
                          <p className="text-slate-500 font-medium max-w-xl">{action.desc}</p>
                       </div>
                    </div>

                    <div className="flex items-center gap-4">
                       <Button variant="outline" className="h-16 px-8 rounded-2xl border-slate-200 font-bold uppercase tracking-widest gap-2">
                          <Eye className="h-5 w-5" /> Revisar
                       </Button>
                       <Button 
                         onClick={() => handleApprove(action.id)}
                         className="h-16 px-8 rounded-2xl bg-primary hover:bg-primary/90 text-white font-black uppercase tracking-widest gap-2 shadow-xl shadow-primary/20"
                       >
                          <CheckCircle2 className="h-5 w-5" /> Firmar y Ejecutar
                       </Button>
                    </div>
                 </CardContent>
              </Card>
            ))}
         </div>
      </div>

      {/* Trust Protocol Governance */}
      <div className="p-10 rounded-[3rem] bg-slate-900 text-white relative overflow-hidden group">
         <Lock className="absolute -right-8 -bottom-8 h-64 w-64 text-white/5 group-hover:scale-110 transition-transform duration-700" />
         <div className="relative z-10 space-y-6">
            <div className="flex items-center gap-4">
               <ShieldCheck className="h-10 w-10 text-primary" />
               <h4 className="text-2xl font-black uppercase tracking-tight">Gobernanza Trust Protocol</h4>
            </div>
            <p className="text-slate-400 font-medium max-w-2xl leading-relaxed">
               Cada acción de Autopilot requiere una firma digital SHA-256. Ninguna automatización es soberana; el control final reside en la supervisión humana sellada.
            </p>
         </div>
      </div>
    </div>
  );
}
