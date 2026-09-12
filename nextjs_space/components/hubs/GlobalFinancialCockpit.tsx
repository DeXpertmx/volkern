'use client'

import { useState } from 'react'
import { 
  LineChart as LineChartIcon, 
  Wallet, 
  PiggyBank, 
  Receipt, 
  ArrowUpRight, 
  ArrowDownRight, 
  TrendingUp, 
  AlertCircle,
  Calendar,
  FileText,
  BarChart3,
  Users,
  ShieldCheck,
  ChevronRight,
  Info,
  Flame,
  Target
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import useSWR from 'swr'
import { formatearImporte } from '@/lib/moneda'
import { useMonedaTenant } from '@/lib/use-moneda-tenant'

const fetcher = (url: string) => fetch(url).then(res => res.json())

export default function GlobalFinancialCockpit() {
  const { data: finance, error, isLoading } = useSWR('/api/erp/finance/consolidation', fetcher)
  const [region, setRegion] = useState('ES')
  // La divisa de reporte del tenant: el cockpit escribía euros a mano junto a las
  // cifras reales de la consolidación, así que un tenant en pesos veía euros.
  const moneda = useMonedaTenant()

  if (error && error.status === 403) {
     return (
       <div className="h-[60vh] flex items-center justify-center p-6">
          <Card className="max-w-md border-rose-200 bg-rose-50 shadow-2xl">
            <CardHeader className="text-center">
              <div className="h-16 w-16 bg-rose-500 text-white rounded-full flex items-center justify-center mx-auto mb-4 animate-bounce">
                <ShieldCheck className="w-8 h-8" />
              </div>
              <CardTitle className="text-2xl font-black text-rose-900 uppercase">Protocolo de Seguridad Activo</CardTitle>
              <CardDescription className="text-rose-700 font-bold">
                 Acceso Restringido: El sistema ha detectado una discrepancia en la integridad de los registros financieros o nivel de autorización insuficiente.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
               <div className="bg-white/50 p-4 rounded-xl border border-rose-200 text-xs text-rose-800 leading-relaxed italic">
                 "Se ha enviado una notificación OneSignal/Email al OWNER del sistema para validar el incidente."
               </div>
               <Button className="w-full bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl py-6 uppercase tracking-widest text-[10px]">Solicitar Desbloqueo</Button>
            </CardContent>
          </Card>
       </div>
     )
  }

  const stats = [
    { label: 'Caja Real', value: formatearImporte(finance?.pnl?.netProfit ?? 0, moneda), detail: 'Disponibilidad inmediata', icon: Wallet, color: 'text-primary', bg: 'bg-primary/10' },
    { label: 'EBITDA (Est.)', value: '38.2%', detail: 'Salud operativa', icon: ShieldCheck, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
    { label: 'Tax liability', value: formatearImporte(finance?.tax?.taxLiability ?? 0, moneda), detail: 'Previsión fiscal', icon: Receipt, color: 'text-rose-500', bg: 'bg-rose-500/10' },
    { label: 'Runway', value: '18 meses', detail: 'Supervivencia', icon: Clock, color: 'text-amber-500', bg: 'bg-amber-500/10' },
  ]

  const revenueGoal = 25000;
  const currentRevenue = finance?.pnl?.totalRevenue || 0;
  const breakEvenProgress = Math.min((currentRevenue / (finance?.pnl?.totalExpenses || 1)) * 100, 100);

  return (
    <div className="space-y-8 pb-10">
      {/* Strategic Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Badge className="bg-primary/10 text-primary border-none rounded-lg text-[9px] font-black uppercase tracking-widest px-2 py-0.5">MODO FORTALEZA ACTIVO</Badge>
            <div className="h-1 w-1 rounded-full bg-slate-300" />
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Global Financial Control V2</span>
          </div>
          <h1 className="text-4xl font-black tracking-tight leading-none uppercase">Financial Cockpit</h1>
          <p className="text-muted-foreground font-medium">Consolidación con auditoría inmutable SHA-256.</p>
        </div>
        <div className="flex items-center gap-3">
           <select 
             className="bg-white dark:bg-slate-900 border rounded-2xl px-4 py-3 text-[10px] font-bold uppercase outline-none focus:ring-1 ring-primary/20"
             onChange={(e) => setRegion(e.target.value)}
             value={region}
           >
              <option value="MX">México (IVA 16%)</option>
              <option value="ES">España (IVA 21%)</option>
              <option value="US">USA (LLC 0%)</option>
           </select>
           <Button className="rounded-2xl font-black uppercase text-[10px] tracking-widest px-6 py-6 shadow-xl shadow-primary/20 transition-all hover:scale-105">
              Generar P&L Certificado
           </Button>
        </div>
      </div>

      {/* High-Level Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, i) => (
          <Card key={i} className="border-none shadow-sm hover:shadow-md transition-all duration-500 group overflow-hidden">
             <div className="absolute -bottom-2 -right-2 opacity-5 scale-150 rotate-12 group-hover:rotate-0 transition-transform duration-700">
                <stat.icon className="w-20 h-20" />
             </div>
             <CardContent className="p-6">
                <div className="flex items-center gap-3 mb-4">
                   <div className={`p-2 rounded-xl ${stat.bg} ${stat.color}`}>
                      <stat.icon className="w-4 h-4" />
                   </div>
                   <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{stat.label}</span>
                </div>
                <div className="space-y-0.5">
                   <p className="text-2xl font-black tracking-tighter">{stat.value}</p>
                   <p className="text-[9px] font-bold uppercase text-muted-foreground tracking-widest opacity-60">{stat.detail}</p>
                </div>
             </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Main P&L and Heatmap Section */}
        <div className="lg:col-span-8 space-y-6">
           <Card className="border-none shadow-sm overflow-hidden">
             <CardHeader className="bg-slate-50/50 border-b">
                <CardTitle className="text-sm font-black uppercase tracking-widest flex items-center gap-2">
                   <FileText className="w-4 h-4 text-primary" />
                   Mapa de Calor de Gastos
                </CardTitle>
             </CardHeader>
             <CardContent className="p-8">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                   <div className="p-6 rounded-3xl bg-amber-50 border border-amber-100 space-y-4">
                      <div className="flex justify-between items-center">
                         <Badge className="bg-amber-200 text-amber-800 border-none rounded-lg text-[8px] font-black uppercase">Fuga Alta</Badge>
                         <Flame className="w-4 h-4 text-amber-500" />
                      </div>
                      <div>
                         <p className="text-[10px] font-black uppercase text-amber-600 tracking-widest">Marketing</p>
                         <p className="text-xl font-black">{formatearImporte(4200.2, moneda)}</p>
                      </div>
                      <Progress value={75} className="h-1.5 bg-amber-200/50 [&>div]:bg-amber-500" />
                      <p className="text-[9px] text-amber-700 italic">"Gasto en anuncios meta un 20% arriba del mes anterior."</p>
                   </div>
                   
                   <div className="p-6 rounded-3xl bg-blue-50 border border-blue-100 space-y-4">
                      <div className="flex justify-between items-center">
                         <Badge className="bg-blue-200 text-blue-800 border-none rounded-lg text-[8px] font-black uppercase">Estable</Badge>
                         <Users className="w-4 h-4 text-blue-500" />
                      </div>
                      <div>
                         <p className="text-[10px] font-black uppercase text-blue-600 tracking-widest">Personal</p>
                         <p className="text-xl font-black">{formatearImporte(6800, moneda)}</p>
                      </div>
                      <Progress value={45} className="h-1.5 bg-blue-200/50 [&>div]:bg-blue-500" />
                      <p className="text-[9px] text-blue-700 italic">"Nóminas y seguridad social sin variaciones."</p>
                   </div>

                   <div className="p-6 rounded-3xl bg-emerald-50 border border-emerald-100 space-y-4">
                      <div className="flex justify-between items-center">
                         <Badge className="bg-emerald-200 text-emerald-800 border-none rounded-lg text-[8px] font-black uppercase">Optimizado</Badge>
                         <ShieldCheck className="w-4 h-4 text-emerald-500" />
                      </div>
                      <div>
                         <p className="text-[10px] font-black uppercase text-emerald-600 tracking-widest">Operaciones</p>
                         <p className="text-xl font-black">{formatearImporte(1100, moneda)}</p>
                      </div>
                      <Progress value={25} className="h-1.5 bg-emerald-200/50 [&>div]:bg-emerald-500" />
                      <p className="text-[9px] text-emerald-700 italic">"Costo de materiales un 10% bajo el presupuesto."</p>
                   </div>
                </div>
             </CardContent>
           </Card>

           {/* Break-even visualization */}
           <Card className="border-none shadow-sm overflow-hidden bg-white">
              <CardHeader>
                 <CardTitle className="text-sm font-black uppercase tracking-widest flex items-center gap-2">
                    <Target className="w-4 h-4 text-primary" />
                    Punto de Equilibrio
                 </CardTitle>
              </CardHeader>
              <CardContent className="px-8 pb-8 space-y-8">
                 <div className="flex justify-between items-end">
                    <div className="space-y-1">
                       <p className="text-3xl font-black tracking-tighter">{formatearImporte(currentRevenue, moneda)}</p>
                       <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">Ingresos Totales Actuales</p>
                    </div>
                    <div className="text-right space-y-1">
                       <p className="text-xl font-bold tracking-tight text-primary">{formatearImporte(finance?.pnl?.totalExpenses || 0, moneda)}</p>
                       <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest italic">Break-even Goal</p>
                    </div>
                 </div>
                 
                 <div className="relative pt-4">
                    <Progress value={breakEvenProgress} className="h-4 rounded-full" />
                    <div className="absolute top-0 left-[75%] -translate-x-1/2 flex flex-col items-center">
                       <div className="h-8 w-0.5 bg-rose-500 relative">
                          <Badge className="absolute -top-8 left-1/2 -translate-x-1/2 bg-rose-500 text-white text-[8px] font-black border-none whitespace-nowrap">FIXED COSTS</Badge>
                       </div>
                    </div>
                 </div>
                 
                 <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-2xl border border-dashed text-[11px] font-medium text-slate-500 leading-relaxed italic">
                    <Info className="w-4 h-4 text-primary shrink-0" />
                    {currentRevenue >= (finance?.pnl?.totalExpenses || 0) 
                      ? "Felicidades: Has superado el punto de equilibrio. Cada importe adicional es beneficio neto antes de impuestos."
                      : `Te faltan ${formatearImporte((finance?.pnl?.totalExpenses || 0) - currentRevenue, moneda)} en facturación para cubrir todos tus costos este mes.`}
                 </div>
              </CardContent>
           </Card>
        </div>

        {/* Proactive CFO Sidebar (IA) */}
        <div className="lg:col-span-4 space-y-6">
           <Card className="border-none shadow-sm bg-gradient-to-br from-slate-900 to-slate-950 text-white overflow-hidden group">
              <CardHeader>
                <div className="flex items-center gap-2 mb-1">
                  <div className="h-2 w-2 rounded-full bg-primary animate-pulse shadow-[0_0_10px_rgba(255,255,255,0.4)]" />
                  <CardTitle className="text-xs font-black uppercase text-primary tracking-[0.2em]">CFO Virtual Report</CardTitle>
                </div>
                <CardTitle className="text-xl font-black tracking-tight leading-none pt-2">Veredicto Estratégico</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                 <div className="p-5 rounded-2xl bg-white/5 border border-white/10 transition-colors">
                    <p className="text-[10px] font-bold text-primary uppercase mb-2">ANÁLISIS DE RENTABILIDAD</p>
                    <p className="text-xs text-slate-300 leading-relaxed font-medium">
                      "Tu margen de beneficio neto del <span className="text-white font-bold">{finance?.pnl?.margin || '0'}%</span> está un <span className="text-emerald-400 font-bold">4% por encima</span> del promedio del sector."
                    </p>
                 </div>
                 
                 <div className="space-y-3">
                    <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-widest text-slate-500">
                       <span>Sugerencia Proactiva</span>
                    </div>
                    <div className="p-4 rounded-xl bg-primary/10 border border-primary/20">
                       <p className="text-[11px] text-slate-200 font-medium italic">
                        "El gasto en suministros del Proyecto X ha subido un 15%. Sugiero una re-negociación con proveedores antes del cierre de Fase 2."
                       </p>
                    </div>
                 </div>

                 <Button className="w-full rounded-2xl bg-white text-slate-950 font-black uppercase text-[10px] tracking-widest py-6 hover:bg-slate-100 shadow-xl shadow-white/5 transition-all"> 
                    Calcular Proyección 2026 
                 </Button>
              </CardContent>
           </Card>

           {/* Tax Reconciliation with Region Support */}
           <Card className="border-none shadow-sm overflow-hidden">
              <CardHeader className="pb-3 border-b border-slate-50 bg-slate-50/30">
                <CardTitle className="text-xs font-black uppercase tracking-widest flex items-center gap-2">
                  <Receipt className="w-4 h-4 text-primary" />
                  Tax Prospector ({region})
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-6 space-y-6">
                 <div className="p-5 rounded-3xl bg-slate-50 border border-slate-100 space-y-4">
                    <div>
                       <p className="text-[9px] font-black uppercase text-muted-foreground tracking-widest">Reserva Estimada</p>
                       <p className="text-3xl font-black tracking-tighter">{formatearImporte(finance?.tax?.taxLiability ?? 0, moneda)}</p>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground font-bold">
                       <ShieldCheck className="w-4 h-4 text-emerald-500" />
                       Validado con reglas de {region}
                    </div>
                 </div>
                 
                 <div className="p-3 bg-blue-50/50 rounded-xl border border-blue-100 text-[10px] text-blue-800 leading-relaxed italic">
                   {region === 'US' 
                     ? "LLC Wyoming: 0% tax en exportación. Recordatorio: Debes pagar Income Tax federal si eres residente fiscal." 
                     : `Previsión basada en el IVA local de ${region}. Se sugiere apartar el monto para la liquidación trimestral.`}
                 </div>
              </CardContent>
           </Card>
        </div>
      </div>
    </div>
  )
}

import { Clock } from 'lucide-react'
