'use client';

import { DirectInvoiceForm } from '@/components/finance/DirectInvoiceForm';
import { FiscalPreviewer } from '@/components/finance/FiscalPreviewer';
import { 
  Receipt, 
  ShieldCheck, 
  Zap, 
  HelpCircle,
  ArrowUpRight,
  TrendingUp,
  FileSearch
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default function DirectBillingPage() {
  return (
    <div className="p-8 space-y-12 max-w-7xl mx-auto">
      {/* Header Premium */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-8">
        <div className="space-y-4">
          <div className="flex items-center gap-3 text-primary font-black uppercase tracking-[0.3em] text-[10px] animate-in fade-in slide-in-from-left-4">
            <Zap className="h-4 w-4 fill-primary" />
            Zero-Stripe Invoicing Engine
          </div>
          <h1 className="text-6xl font-black tracking-tighter uppercase leading-none">
            Mesa de <span className="text-primary italic">Facturación</span> Directa
          </h1>
          <p className="text-xl text-muted-foreground font-medium max-w-2xl">
            Emite CFDI 4.0 legales en segundos. Orquestación directa con Stripe MX sin salir de tu centro operativo.
          </p>
        </div>

        <div className="flex gap-4">
          <Card className="bg-slate-900 text-white border-none p-6 shadow-2xl">
             <div className="flex items-center gap-4">
                <div className="p-3 bg-white/10 rounded-2xl text-emerald-400">
                  <ShieldCheck className="h-6 w-6" />
                </div>
                <div>
                   <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Estado de Timbrado</p>
                   <p className="text-lg font-bold">SAT Conectado</p>
                </div>
             </div>
          </Card>
        </div>
      </div>

      <Tabs defaultValue="nueva" className="space-y-8">
        <div className="flex items-center justify-between border-b pb-4">
          <TabsList className="bg-transparent gap-8 p-0">
            <TabsTrigger value="nueva" className="text-xl font-bold uppercase tracking-tight p-0 data-[state=active]:text-primary border-none bg-transparent">
              Nueva Factura
            </TabsTrigger>
            <TabsTrigger value="historial" className="text-xl font-bold uppercase tracking-tight p-0 data-[state=active]:text-primary border-none bg-transparent opacity-40 hover:opacity-100">
              Historial Fiscal
            </TabsTrigger>
          </TabsList>
          
          <div className="flex items-center gap-4 text-[10px] font-black uppercase tracking-widest text-slate-400">
             <ArrowUpRight className="h-4 w-4" /> 
             Stripe Tax API v2024
          </div>
        </div>

        <TabsContent value="nueva" className="animate-in fade-in duration-500">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
            <div className="lg:col-span-8">
              <DirectInvoiceForm />
            </div>
            
            <div className="lg:col-span-4 space-y-8">
              <Card className="bg-primary text-white border-none p-8 rounded-3xl shadow-2xl shadow-primary/20 relative overflow-hidden group">
                <TrendingUp className="absolute -right-8 -bottom-8 h-48 w-48 text-white/10 group-hover:scale-110 transition-transform duration-700" />
                <CardContent className="p-0 space-y-6 relative z-10">
                  <div className="p-3 bg-white/20 rounded-2xl w-fit">
                    <Zap className="h-6 w-6" />
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-2xl font-black uppercase tracking-tight">Guía Fiscal Volkern</h3>
                    <p className="text-sm text-white/80 leading-relaxed font-medium">
                      El sistema detecta automáticamente discrepancias entre el RFC y el Código Postal del cliente antes de enviar al SAT.
                    </p>
                  </div>
                  <Button variant="outline" className="w-full rounded-2xl border-white/20 bg-white/10 hover:bg-white/20 text-white border-none font-bold">
                    Ver manual de cumplimiento
                  </Button>
                </CardContent>
              </Card>

              <div className="p-8 rounded-3xl border-2 border-dashed border-slate-100 flex flex-col items-center text-center space-y-4">
                 <div className="p-4 bg-slate-50 rounded-2xl text-slate-300">
                    <FileSearch className="h-8 w-8" />
                 </div>
                 <div>
                    <p className="font-bold uppercase text-xs tracking-widest text-slate-400">Previsualización de Documentos</p>
                    <p className="text-[10px] text-slate-300 font-medium mt-1">
                      El visor fiscal se activará automáticamente al completar los datos del receptor.
                    </p>
                 </div>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="historial">
          <div className="h-96 flex flex-col items-center justify-center text-slate-300 border-2 border-dashed rounded-3xl gap-4">
             <Receipt className="h-12 w-12 opacity-20" />
             <p className="font-bold uppercase tracking-widest text-sm">Cargando Historial Fiscal...</p>
          </div>
        </TabsContent>
      </Tabs>

      {/* Advisory section */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
         {[
           { icon: ShieldCheck, title: 'Cifrado Forense', text: 'Cada CFDI se integra al Trust Protocol con hash SHA-256.', color: 'emerald' },
           { icon: Zap, title: 'Inmediatez MX', text: 'Timbrado en < 2 segundos gracias a la infraestructura de Stripe.', color: 'blue' },
           { icon: Receipt, title: 'Stripe Tax API', text: 'Manejo automático de IVA, retenciones y exenciones fiscales.', color: 'primary' },
           { icon: HelpCircle, title: 'Soporte Directo', text: 'Validación en vivo contra los catálogos del SAT 2024.', color: 'amber' },
         ].map((item, i) => (
           <Card key={i} className="border-none shadow-lg hover:shadow-2xl transition-all duration-300 group">
              <CardContent className="p-6 space-y-4">
                 <div className={cn(
                   "p-3 rounded-2xl w-fit transition-transform group-hover:scale-110",
                   item.color === 'emerald' ? 'bg-emerald-50 text-emerald-600' : 
                   item.color === 'blue' ? 'bg-blue-50 text-blue-600' : 
                   item.color === 'amber' ? 'bg-amber-50 text-amber-600' : 
                   'bg-primary/10 text-primary'
                 )}>
                    <item.icon className="h-5 w-5" />
                 </div>
                 <div className="space-y-1">
                    <p className="font-black uppercase tracking-tight text-xs">{item.title}</p>
                    <p className="text-[10px] font-medium text-muted-foreground leading-relaxed">{item.text}</p>
                 </div>
              </CardContent>
           </Card>
         ))}
      </div>
    </div>
  );
}
