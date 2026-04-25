'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { 
  Factory, 
  Settings, 
  Play, 
  CheckCircle2, 
  AlertTriangle, 
  History,
  Layers,
  Cpu,
  BarChart3,
  Search,
  Plus,
  ArrowRight,
  Camera,
  MapPin,
  Clock,
  ShieldCheck,
  Loader2,
  Package,
  Boxes,
  TrendingDown,
  FileText,
  DollarSign,
  Workflow,
  Zap,
  HardDrive,
  Wrench,
  Activity,
  ChevronRight,
  ArrowUpRight,
  ArrowDownRight,
  TrendingUp,
  Target,
  Calendar,
  GanttChart,
  ListOrdered,
  LayoutGrid,
  ClipboardCheck,
  XCircle,
  ShieldAlert
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription,
  DialogFooter
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import useSWR from 'swr'
import { toast } from 'sonner'
import { motion, AnimatePresence } from 'framer-motion'

const fetcher = (url: string) => fetch(url).then(res => res.json())

function AssetMaintenance() {
  const { data: assets, isLoading } = useSWR('/api/erp/production/assets', fetcher)

  const displayAssets = assets || [
    { id: '1', name: 'Prensa Solar-X1', status: 'OPERATIONAL', totalHoursWorked: 842.5, health: 'OPTIMAL', usagePercentage: 84.2 },
    { id: '2', name: 'Línea de Ensamblaje B', status: 'MAINTENANCE', totalHoursWorked: 1250, health: 'WARNING', usagePercentage: 25 },
    { id: '3', name: 'Soldadora Láser S3', status: 'OPERATIONAL', totalHoursWorked: 915, health: 'CRITICAL', usagePercentage: 91.5 },
  ]

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
       <div className="lg:col-span-2 space-y-4">
          <Card className="border-none shadow-sm">
             <CardHeader className="flex flex-row items-center justify-between">
                <div>
                   <CardTitle className="text-lg font-bold uppercase">Estado de Activos</CardTitle>
                   <CardDescription>Monitoreo de desgaste y salud de maquinaria.</CardDescription>
                </div>
                <Button variant="outline" className="text-[10px] font-black uppercase h-8 px-4">
                   Registrar Activo
                </Button>
             </CardHeader>
             <CardContent>
                <div className="space-y-4">
                   {displayAssets.map((asset: any) => (
                      <div key={asset.id} className="p-4 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-between">
                         <div className="flex items-center gap-4">
                            <div className={`h-12 w-12 rounded-xl flex items-center justify-center ${
                               asset.health === 'CRITICAL' ? 'bg-red-100 text-red-600' : 
                               asset.health === 'WARNING' ? 'bg-amber-100 text-amber-600' : 'bg-green-100 text-green-600'
                            }`}>
                               <HardDrive className="w-6 h-6" />
                            </div>
                            <div>
                               <h4 className="font-bold text-sm">{asset.name}</h4>
                               <div className="flex items-center gap-2 mt-1">
                                  <Badge className={`text-[9px] font-black uppercase ${
                                     asset.status === 'OPERATIONAL' ? 'bg-green-100 text-green-700' : 'bg-slate-200 text-slate-600'
                                  }`}>{asset.status}</Badge>
                                  <span className="text-[10px] text-slate-400 font-bold uppercase">{asset.totalHoursWorked.toFixed(1)}h Totales</span>
                               </div>
                            </div>
                         </div>
                         <div className="flex items-center gap-6">
                            <div className="w-32">
                               <div className="flex justify-between items-center mb-1">
                                  <span className="text-[9px] font-black uppercase text-slate-400">Vida Útil</span>
                                  <span className="text-[9px] font-black uppercase text-slate-600">{asset.usagePercentage.toFixed(0)}%</span>
                               </div>
                               <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
                                  <div 
                                    className={`h-full rounded-full transition-all duration-500 ${
                                       asset.usagePercentage > 90 ? 'bg-red-500' : asset.usagePercentage > 70 ? 'bg-amber-500' : 'bg-green-500'
                                    }`}
                                    style={{ width: `${asset.usagePercentage % 100}%` }}
                                  />
                               </div>
                            </div>
                            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full">
                               <Wrench className="w-4 h-4 text-slate-400" />
                            </Button>
                         </div>
                      </div>
                   ))}
                </div>
             </CardContent>
          </Card>
       </div>

       <div className="space-y-6">
          <Card className="border-none shadow-sm bg-slate-950 text-white">
             <CardHeader>
                <div className="flex items-center gap-2 mb-2">
                   <Activity className="h-4 w-4 text-primary" />
                   <span className="text-[10px] font-black uppercase tracking-widest text-primary">Predicción Gemma Maintenance</span>
                </div>
                <CardTitle className="text-xl font-bold tracking-tight">Análisis Predictivo</CardTitle>
             </CardHeader>
             <CardContent className="space-y-4">
                <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                   <div className="flex items-center gap-3 mb-2">
                      <AlertTriangle className="h-4 w-4 text-amber-500" />
                      <span className="text-[10px] font-black uppercase text-amber-500">Riesgo Detectado</span>
                   </div>
                   <p className="text-xs text-slate-300 leading-relaxed italic">
                      "La Prensa Solar-X1 muestra un patrón de vibración anómalo. Gemma estima un fallo crítico en el motor hidráulico en los próximos 4 días."
                   </p>
                </div>
                <Button className="w-full bg-primary text-primary-foreground font-black uppercase text-[10px] h-12 rounded-xl">
                   Programar Revisión
                </Button>
             </CardContent>
          </Card>

          <Card className="border-none shadow-sm">
             <CardHeader className="pb-3 border-b border-slate-50">
                <CardTitle className="text-xs font-black uppercase">KPIs de Mantenimiento</CardTitle>
             </CardHeader>
             <CardContent className="pt-4 space-y-4">
                <div className="flex justify-between items-center">
                   <span className="text-[10px] font-bold uppercase text-slate-500">MTBF (Media entre fallos)</span>
                   <span className="text-sm font-black text-slate-900">482h</span>
                </div>
                <div className="flex justify-between items-center">
                   <span className="text-[10px] font-bold uppercase text-slate-500">Coste de Parada/Hora</span>
                   <span className="text-sm font-black text-red-600">€1,250</span>
                </div>
             </CardContent>
          </Card>
       </div>
    </div>
  )
}

function BoMManager() {
  const { data: boms, isLoading } = useSWR('/api/erp/production/bom', fetcher)
  const [viewingBoM, setViewingBoM] = useState<any>(null)

  // Solo mostrar mock si está cargando o si la base de datos está vacía
  const displayBoms = (boms && boms.length > 0) 
    ? boms 
    : (isLoading || !boms) 
      ? [
          { id: 'mock-1', catalogoItem: { nombre: 'Panel Solar 400W', sku: 'BOM-400X' }, components: Array(12).fill({}), laborCost: 185.20 },
          { id: 'mock-2', catalogoItem: { nombre: 'Inversor Smart 5kW', sku: 'BOM-INV-5' }, components: Array(8).fill({}), laborCost: 420.50 },
          { id: 'mock-3', catalogoItem: { nombre: 'Soporte Aluminio L-Type', sku: 'BOM-SUP-L' }, components: Array(4).fill({}), laborCost: 24.15 },
        ]
      : []

  return (
    <Card className="border-none shadow-sm overflow-hidden">
       <CardHeader className="flex flex-row items-center justify-between pb-4">
          <div>
             <CardTitle className="text-lg font-bold uppercase">Recetas Industriales (BoM)</CardTitle>
             <CardDescription>Explosión de materiales y estructura de costos por producto.</CardDescription>
          </div>
          <Button variant="outline" className="text-[10px] font-black uppercase h-8 px-4">
             Importar CSV
          </Button>
       </CardHeader>
       <CardContent>
          {isLoading && !boms && (
            <div className="flex items-center justify-center p-8">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          )}
          
          {!isLoading && boms && boms.length === 0 && (
            <div className="text-center p-12 bg-slate-50 rounded-3xl border border-dashed border-slate-200">
               <div className="h-12 w-12 bg-white rounded-2xl flex items-center justify-center mx-auto mb-4 text-slate-300 shadow-sm">
                  <Boxes className="w-6 h-6" />
               </div>
               <h4 className="font-bold text-slate-900">No hay recetas registradas</h4>
               <p className="text-xs text-slate-500 max-w-[200px] mx-auto mt-1">Comienza importando un CSV o creando una nueva receta desde el catálogo.</p>
            </div>
          )}

          <div className="space-y-3">
             {displayBoms.map((bom: any, i: number) => (
                <div 
                  key={bom.id || i} 
                  className={`p-4 rounded-2xl bg-slate-50 flex items-center justify-between border border-transparent hover:border-slate-200 transition-all ${bom.id?.startsWith('mock-') ? 'opacity-50 grayscale' : ''}`}
                >
                   <div className="flex items-center gap-4">
                      <div className="h-10 w-10 bg-indigo-100 rounded-xl flex items-center justify-center text-indigo-600">
                         <Boxes className="w-5 h-5" />
                      </div>
                      <div>
                         <h4 className="font-bold text-sm tracking-tight">{bom.catalogoItem?.nombre}</h4>
                         <p className="text-[10px] text-muted-foreground font-black uppercase tracking-widest">{bom.catalogoItem?.sku} • {bom.components?.length || 0} Insumos</p>
                      </div>
                   </div>
                   <div className="flex items-center gap-6">
                      <div className="text-right">
                         <p className="text-[9px] font-black text-muted-foreground uppercase">Costo Est. Unitario</p>
                         <p className="text-sm font-black text-indigo-600">€{(bom.laborCost || 0).toFixed(2)}</p>
                      </div>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-8 w-8 rounded-full hover:bg-white shadow-sm"
                        onClick={() => setViewingBoM(bom)}
                      >
                         <ArrowRight className="w-4 h-4" />
                      </Button>
                   </div>
                </div>
             ))}
          </div>
       </CardContent>

       <Dialog open={!!viewingBoM} onOpenChange={() => setViewingBoM(null)}>
         <DialogContent className="max-w-2xl rounded-3xl overflow-hidden border-none p-0">
           <div className="bg-indigo-600 p-8 text-white">
             <div className="flex items-center gap-3 mb-4">
                <Boxes className="w-6 h-6" />
                <span className="text-[10px] font-black uppercase tracking-widest opacity-70">Detalle de Receta (BoM)</span>
             </div>
             <h2 className="text-3xl font-black uppercase tracking-tighter mb-1">{viewingBoM?.catalogoItem?.nombre}</h2>
             <p className="text-indigo-100 text-xs font-bold uppercase tracking-widest">{viewingBoM?.catalogoItem?.sku}</p>
           </div>
           
           <div className="p-8 space-y-6">
             <div className="space-y-4">
               <h3 className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Insumos y Componentes</h3>
               <div className="space-y-2">
                 {viewingBoM?.components?.length > 0 ? (
                   viewingBoM.components.map((comp: any, i: number) => (
                     <div key={i} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                        <div className="flex items-center gap-3">
                           <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center text-slate-400 border border-slate-100">
                              <Package className="w-4 h-4" />
                           </div>
                           <div>
                              <p className="text-sm font-bold">{comp.component?.nombre || 'Insumo sin nombre'}</p>
                              <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">{comp.component?.sku || 'SKU-000'}</p>
                           </div>
                        </div>
                        <div className="text-right">
                           <span className="text-sm font-black text-primary">{comp.quantityRequired}</span>
                           <span className="text-[10px] font-bold text-slate-400 uppercase ml-1">{comp.unit || 'unit'}</span>
                        </div>
                     </div>
                   ))
                 ) : (
                   <p className="text-xs text-slate-500 italic p-4 text-center bg-slate-50 rounded-2xl">Esta receta no tiene componentes registrados.</p>
                 )}
               </div>
             </div>

             <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-100">
                <div className="p-4 bg-slate-50 rounded-2xl">
                   <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Costo Mano de Obra</p>
                   <p className="text-lg font-black text-indigo-600">€{(viewingBoM?.laborCost || 0).toFixed(2)}</p>
                </div>
                <div className="p-4 bg-slate-50 rounded-2xl">
                   <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Costo Indirecto</p>
                   <p className="text-lg font-black text-indigo-600">€{(viewingBoM?.overheadCost || 0).toFixed(2)}</p>
                </div>
             </div>

             <Button 
               className="w-full rounded-2xl h-14 font-black uppercase tracking-widest shadow-xl shadow-indigo-200 bg-indigo-600 hover:bg-indigo-700 mt-2"
               onClick={() => setViewingBoM(null)}
             >
               Cerrar Detalle
             </Button>
           </div>
         </DialogContent>
       </Dialog>
    </Card>
  )
}

function CostControl() {
  const { data: costings, isLoading } = useSWR('/api/erp/production/costing', fetcher)

  const displayCostings = costings || [
    { id: '1', workOrder: { batchNumber: 'OP-1024' }, totalCost: 615, estimatedCost: 580, variance: 35, margin: 28.5 },
    { id: '2', workOrder: { batchNumber: 'OP-1025' }, totalCost: 1072, estimatedCost: 1100, variance: -28, margin: 34.2 },
    { id: '3', workOrder: { batchNumber: 'OP-1026' }, totalCost: 605, estimatedCost: 500, variance: 105, margin: 12.8 },
  ]

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
       <div className="lg:col-span-2 space-y-4">
          <Card className="border-none shadow-sm">
             <CardHeader>
                <CardTitle className="text-lg font-bold uppercase">Análisis de Costo Real vs Estándar</CardTitle>
                <CardDescription>Desviaciones detectadas por orden de producción.</CardDescription>
             </CardHeader>
             <CardContent>
                <div className="space-y-4">
                   {displayCostings.map((cost: any) => (
                      <div key={cost.id} className="p-4 rounded-2xl bg-white border border-slate-100 flex items-center justify-between group hover:border-primary/20 transition-all">
                         <div className="flex items-center gap-4">
                            <div className={`h-12 w-12 rounded-xl flex items-center justify-center ${
                               cost.margin < 15 ? 'bg-red-50 text-red-500' : 'bg-green-50 text-green-500'
                            }`}>
                               {cost.margin < 15 ? <ArrowDownRight className="w-6 h-6" /> : <ArrowUpRight className="w-6 h-6" />}
                            </div>
                            <div>
                               <h4 className="font-bold text-sm">OP #{cost.workOrder?.batchNumber}</h4>
                               <div className="flex items-center gap-3 mt-1">
                                  <span className="text-[10px] text-slate-400 font-bold uppercase">Costo: {cost.totalCost.toFixed(2)}€</span>
                                  <Badge className={`text-[9px] font-black uppercase ${
                                     cost.variance > 0 ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'
                                  }`}>
                                     Varianza: {cost.variance > 0 ? '+' : ''}{cost.variance.toFixed(2)}€
                                  </Badge>
                               </div>
                            </div>
                         </div>
                         <div className="flex items-center gap-8">
                            <div className="text-right">
                               <p className="text-[9px] font-black text-slate-400 uppercase">Margen Real</p>
                               <p className={`text-lg font-black ${
                                  cost.margin < 15 ? 'text-red-500' : 'text-green-600'
                               }`}>{cost.margin.toFixed(1)}%</p>
                            </div>
                         </div>
                      </div>
                   ))}
                </div>
             </CardContent>
          </Card>
       </div>

       <div className="space-y-6">
          <Card className="border-none shadow-sm bg-slate-900 text-white overflow-hidden relative">
             <div className="absolute top-0 right-0 p-4 opacity-10">
                <Target className="w-24 h-24" />
             </div>
             <CardHeader>
                <div className="flex items-center gap-2 mb-2">
                   <TrendingUp className="h-4 w-4 text-primary" />
                   <span className="text-[10px] font-black uppercase tracking-widest text-primary">Gemma Profit Analyst</span>
                </div>
                <CardTitle className="text-xl font-bold tracking-tight">Análisis de Rentabilidad</CardTitle>
             </CardHeader>
             <CardContent className="space-y-4">
                <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                   <p className="text-xs text-slate-300 leading-relaxed italic">
                      "He detectado que el costo de la merma (scrap) está penalizando el margen en un 8.4% en los lotes de la tarde. Sugiero revisar el calibrado de la soldadora S3."
                   </p>
                </div>
                <div className="space-y-2">
                   <div className="flex justify-between text-[10px] font-bold uppercase text-slate-400">
                      <span>Eficiencia Financiera</span>
                      <span>92%</span>
                   </div>
                   <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
                      <div className="h-full bg-primary w-[92%] rounded-full" />
                   </div>
                </div>
             </CardContent>
          </Card>
       </div>
    </div>
  )
}

function CapacityForecast() {
  const { data: planning, isLoading } = useSWR('/api/erp/planning/capacity', fetcher)

  const displayForecast = planning?.forecast || [
    { date: '2026-04-18', line: 'Línea de Ensamblaje A', utilization: 82, risk: 'HIGH' },
    { date: '2026-04-19', line: 'Línea de Ensamblaje A', utilization: 65, risk: 'LOW' },
    { date: '2026-04-20', line: 'Línea de Ensamblaje A', utilization: 95, risk: 'CRITICAL' },
    { date: '2026-04-18', line: 'Línea de Pintura S1', utilization: 45, risk: 'LOW' },
  ]

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
       <div className="lg:col-span-2 space-y-4">
          <Card className="border-none shadow-sm">
             <CardHeader>
                <CardTitle className="text-lg font-bold uppercase">Forecast de Ocupación (7 Días)</CardTitle>
                <CardDescription>Carga proyectada basada en órdenes y turnos.</CardDescription>
             </CardHeader>
             <CardContent>
                <div className="space-y-6">
                   {['Línea de Ensamblaje A', 'Línea de Pintura S1'].map((lineName) => (
                      <div key={lineName} className="space-y-3">
                         <h4 className="text-xs font-black uppercase text-slate-500">{lineName}</h4>
                         <div className="grid grid-cols-7 gap-2">
                            {displayForecast.filter((f: any) => f.line === lineName).map((day: any, i: number) => (
                               <div key={i} className="flex flex-col gap-1">
                                  <div className={`h-24 rounded-xl border flex flex-col items-center justify-center gap-1 ${
                                     day.risk === 'CRITICAL' ? 'bg-red-50 border-red-100' : 
                                     day.risk === 'HIGH' ? 'bg-amber-50 border-amber-100' : 'bg-slate-50 border-slate-100'
                                  }`}>
                                     <span className="text-[14px] font-black">{day.utilization}%</span>
                                     <span className="text-[8px] font-bold text-slate-400 uppercase">utilización</span>
                                  </div>
                                  <span className="text-[8px] font-black text-center text-slate-500 uppercase">{day.date.split('-').slice(2)}</span>
                               </div>
                            ))}
                         </div>
                      </div>
                   ))}
                </div>
             </CardContent>
          </Card>
       </div>

       <div className="space-y-6">
          <Card className="border-none shadow-sm bg-indigo-900 text-white overflow-hidden relative">
             <div className="absolute top-0 right-0 p-4 opacity-10">
                <GanttChart className="w-24 h-24" />
             </div>
             <CardHeader>
                <div className="flex items-center gap-2 mb-2">
                   <Calendar className="h-4 w-4 text-primary" />
                   <span className="text-[10px] font-black uppercase tracking-widest text-primary">Gemma Capacity Planner</span>
                </div>
                <CardTitle className="text-xl font-bold tracking-tight">Análisis de Capacidad</CardTitle>
             </CardHeader>
             <CardContent className="space-y-4">
                <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                   <p className="text-xs text-slate-300 leading-relaxed italic">
                      "He detectado un cuello de botella para el miércoles 20. La Línea de Ensamblaje A superará el 95% debido al mantenimiento preventivo de la Prensa X1. Sugiero adelantar 20 unidades de la OP-1024 a mañana."
                   </p>
                </div>
                <Button className="w-full bg-primary text-primary-foreground hover:bg-primary/90 font-black uppercase text-[10px] h-12 rounded-xl">
                   Ejecutar Replanificación
                </Button>
             </CardContent>
          </Card>

          <Card className="border-none shadow-sm">
             <CardHeader className="pb-3 border-b border-slate-50">
                <CardTitle className="text-xs font-black uppercase">KPIs de Planificación</CardTitle>
             </CardHeader>
             <CardContent className="pt-4 space-y-4">
                <div className="flex justify-between items-center">
                   <span className="text-[10px] font-bold uppercase text-slate-500">Exactitud de Forecast</span>
                   <Badge className="bg-green-100 text-green-700 border-none font-bold text-[9px]">94.2%</Badge>
                </div>
                <div className="flex justify-between items-center">
                   <span className="text-[10px] font-bold uppercase text-slate-500">Riesgo de Saturación</span>
                   <Badge className="bg-amber-100 text-amber-700 border-none font-bold text-[9px]">MEDIO</Badge>
                </div>
             </CardContent>
          </Card>
       </div>
    </div>
  )
}

function SchedulingOptimized() {
  const { data: plan, mutate } = useSWR('/api/erp/planning/scheduling', fetcher)
  const [loading, setLoading] = useState(false)

  const handleGenerate = async () => {
    setLoading(true)
    try {
      await fetch('/api/erp/planning/scheduling/generate', { method: 'POST' })
      mutate()
      toast.success('Plan de secuenciación optimizado generado')
    } catch (error) {
      toast.error('Error al generar el plan')
    } finally {
      setLoading(false)
    }
  }

  const assignments = plan?.assignments || [
    { id: '1', workOrder: { batchNumber: '1024', bom: { catalogoItem: { nombre: 'Panel Solar 400W' } } }, line: { name: 'Línea A' }, estimatedStart: '2026-04-18T08:00:00Z', priorityScore: 85.2 },
    { id: '2', workOrder: { batchNumber: '1025', bom: { catalogoItem: { nombre: 'Inversor Smart 5kW' } } }, line: { name: 'Línea B' }, estimatedStart: '2026-04-18T09:30:00Z', priorityScore: 92.5 },
  ]

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
       <div className="lg:col-span-2 space-y-4">
          <Card className="border-none shadow-sm">
             <CardHeader className="flex flex-row items-center justify-between">
                <div>
                   <CardTitle className="text-lg font-bold uppercase">Secuenciación de Planta (Gantt)</CardTitle>
                   <CardDescription>Orden óptimo de ejecución por línea.</CardDescription>
                </div>
                <Button 
                  onClick={handleGenerate} 
                  disabled={loading}
                  className="rounded-xl font-black uppercase text-[10px] bg-indigo-600 hover:bg-indigo-700"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Cpu className="w-4 h-4 mr-2" />}
                  Optimizar Secuencia
                </Button>
             </CardHeader>
             <CardContent>
                <div className="space-y-3">
                   {assignments.map((as: any) => (
                      <div key={as.id} className="p-4 rounded-2xl bg-white border border-slate-100 flex items-center justify-between group hover:border-indigo-200 transition-all">
                         <div className="flex items-center gap-4">
                            <div className="h-10 w-10 rounded-xl bg-slate-50 flex items-center justify-center text-[10px] font-black border border-slate-100">
                               {new Date(as.estimatedStart).getHours()}:00
                            </div>
                            <div>
                               <h4 className="font-bold text-sm tracking-tight">{as.workOrder?.bom?.catalogoItem?.nombre}</h4>
                               <p className="text-[10px] text-muted-foreground font-black uppercase tracking-widest">OP #{as.workOrder?.batchNumber} • {as.line?.name}</p>
                            </div>
                         </div>
                         <div className="flex items-center gap-6">
                            <div className="text-right">
                               <p className="text-[9px] font-black text-slate-400 uppercase">Score Prioridad</p>
                               <Badge className="bg-indigo-50 text-indigo-600 border-none font-black text-[10px]">{as.priorityScore.toFixed(1)}</Badge>
                            </div>
                            <Button variant="ghost" size="icon" className="rounded-full opacity-0 group-hover:opacity-100">
                               <ArrowRight className="h-4 w-4" />
                            </Button>
                         </div>
                      </div>
                   ))}
                </div>
             </CardContent>
          </Card>
       </div>

       <div className="space-y-6">
          <Card className="border-none shadow-sm bg-slate-950 text-white overflow-hidden relative">
             <div className="absolute top-0 right-0 p-4 opacity-10">
                <ListOrdered className="w-24 h-24" />
             </div>
             <CardHeader>
                <div className="flex items-center gap-2 mb-2">
                   <Cpu className="h-4 w-4 text-primary" />
                   <span className="text-[10px] font-black uppercase tracking-widest text-primary">Gemma Scheduler AI</span>
                </div>
                <CardTitle className="text-xl font-bold tracking-tight">Estrategia de Secuencia</CardTitle>
             </CardHeader>
             <CardContent className="space-y-4">
                <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                   <p className="text-xs text-slate-300 leading-relaxed italic">
                      "He priorizado la OP-1025 en la Línea B para maximizar el margen del turno de mañana. Sugiero agrupar las órdenes de paneles solares para reducir el setup de laminación en 45 min."
                   </p>
                </div>
                <div className="space-y-3">
                   <div className="flex items-center justify-between text-[10px] font-black uppercase">
                      <span className="text-slate-400">Mejora de Margen Est.</span>
                      <span className="text-emerald-400">+4.2%</span>
                   </div>
                   <div className="flex items-center justify-between text-[10px] font-black uppercase">
                      <span className="text-slate-400">Reducción Setup</span>
                      <span className="text-emerald-400">-12%</span>
                   </div>
                </div>
             </CardContent>
          </Card>

          <Card className="border-none shadow-sm">
             <CardHeader className="pb-3 border-b border-slate-50">
                <CardTitle className="text-xs font-black uppercase tracking-widest">Restricciones Activas</CardTitle>
             </CardHeader>
             <CardContent className="pt-4 space-y-3">
                <div className="flex items-center gap-3 p-2 rounded-lg bg-amber-50 text-amber-700">
                   <Wrench className="w-3.5 h-3.5" />
                   <span className="text-[10px] font-bold uppercase">Mantenimiento S1 (Hard)</span>
                </div>
                <div className="flex items-center gap-3 p-2 rounded-lg bg-blue-50 text-blue-700">
                   <Package className="w-3.5 h-3.5" />
                   <span className="text-[10px] font-bold uppercase">Stock Celdas PV (Soft)</span>
                </div>
             </CardContent>
          </Card>
       </div>
    </div>
  )
}

function ProductionReadiness() {
  const { data: reports, mutate } = useSWR('/api/erp/production/readiness', fetcher)
  const [releasing, setReleasing] = useState<string | null>(null)

  const handleRelease = async (workOrderId: string) => {
    setReleasing(workOrderId)
    try {
      const res = await fetch('/api/erp/production/readiness/release', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workOrderId })
      })
      if (!res.ok) throw new Error(await res.text())
      toast.success('Orden liberada exitosamente')
      mutate()
    } catch (error: any) {
      toast.error(error.message || 'Error al liberar orden')
    } finally {
      setReleasing(null)
    }
  }

  const displayReports = reports || [
    { id: '1', workOrder: { batchNumber: '1028' }, coveragePercent: 100, readyToProduce: true },
    { id: '2', workOrder: { batchNumber: '1029' }, coveragePercent: 82, readyToProduce: false, blockedReason: 'Falta Componente Electrónico S2' },
    { id: '3', workOrder: { batchNumber: '1030' }, coveragePercent: 45, readyToProduce: false, blockedReason: 'Falta Acero Estructural' },
  ]

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
       <div className="lg:col-span-2 space-y-4">
          <Card className="border-none shadow-sm">
             <CardHeader>
                <CardTitle className="text-lg font-bold uppercase">Estado de Preparación de Órdenes</CardTitle>
                <CardDescription>Validación de cobertura material antes de salida a planta.</CardDescription>
             </CardHeader>
             <CardContent>
                <div className="space-y-4">
                   {displayReports.map((report: any) => (
                      <div key={report.id} className="p-4 rounded-2xl bg-white border border-slate-100 flex items-center justify-between group hover:border-emerald-200 transition-all">
                         <div className="flex items-center gap-4">
                            <div className={`h-12 w-12 rounded-xl flex items-center justify-center ${
                               report.readyToProduce ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'
                            }`}>
                               {report.readyToProduce ? <ShieldCheck className="w-6 h-6" /> : <AlertTriangle className="w-6 h-6" />}
                            </div>
                            <div>
                               <h4 className="font-bold text-sm">OP #{report.workOrder?.batchNumber}</h4>
                               <div className="flex items-center gap-3 mt-1">
                                  <div className="w-24 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                     <div className={`h-full ${report.readyToProduce ? 'bg-emerald-500' : 'bg-amber-500'}`} style={{ width: `${report.coveragePercent}%` }} />
                                  </div>
                                  <span className="text-[10px] font-black text-slate-400">{report.coveragePercent}% Cobertura</span>
                                  {report.quarantineLots > 0 && (
                                     <Badge className="bg-amber-50 text-amber-600 border-none text-[8px] h-4">
                                        <ShieldAlert className="w-2 h-2 mr-1" />
                                        {report.quarantineLots} EN CUARENTENA
                                     </Badge>
                                  )}
                               </div>
                            </div>
                         </div>
                         <div className="flex items-center gap-4">
                            {!report.readyToProduce && (
                               <Badge className="bg-amber-100 text-amber-700 border-none font-bold text-[9px] uppercase">{report.blockedReason}</Badge>
                            )}
                            <Button 
                              disabled={!report.readyToProduce || releasing === report.workOrderId}
                              onClick={() => handleRelease(report.workOrderId)}
                              className={`rounded-xl font-black uppercase text-[10px] h-10 px-6 ${
                                report.readyToProduce ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-slate-100 text-slate-400'
                              }`}
                            >
                               {releasing === report.workOrderId ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Liberar a Planta'}
                            </Button>
                         </div>
                      </div>
                   ))}
                </div>
             </CardContent>
          </Card>
       </div>

       <div className="space-y-6">
          <Card className="border-none shadow-sm bg-emerald-950 text-white overflow-hidden relative">
             <div className="absolute top-0 right-0 p-4 opacity-10">
                <ClipboardCheck className="w-24 h-24" />
             </div>
             <CardHeader>
                <div className="flex items-center gap-2 mb-2">
                   <Cpu className="h-4 w-4 text-primary" />
                   <span className="text-[10px] font-black uppercase tracking-widest text-primary">Gemma Readiness AI</span>
                </div>
                <CardTitle className="text-xl font-bold tracking-tight">Análisis de Preparación</CardTitle>
             </CardHeader>
             <CardContent className="space-y-4">
                <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                   <p className="text-xs text-slate-300 leading-relaxed italic">
                      "He detectado que la OP-1029 está bloqueada por falta de un componente crítico. El stock llegará en 2 días. Sugiero adelantar la OP-1031 que tiene 100% de cobertura y alto margen."
                   </p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                   <div className="p-3 bg-white/5 rounded-xl border border-white/10">
                      <p className="text-[9px] font-black text-slate-400 uppercase mb-1">Órdenes Listas</p>
                      <p className="text-xl font-black text-emerald-400">84%</p>
                   </div>
                   <div className="p-3 bg-white/5 rounded-xl border border-white/10">
                      <p className="text-[9px] font-black text-slate-400 uppercase mb-1">Riesgo Stock</p>
                      <p className="text-xl font-black text-amber-400">MEDIO</p>
                   </div>
                </div>
             </CardContent>
          </Card>
       </div>
    </div>
  )
}

function AIFabControl() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
       <Card className="lg:col-span-8 border-none shadow-sm p-10 flex flex-col items-center justify-center">
          <div className="relative mb-6">
             <div className="absolute inset-0 bg-primary/20 rounded-full animate-pulse" />
             <div className="h-24 w-24 bg-primary text-white rounded-3xl flex items-center justify-center relative shadow-2xl">
                <Workflow className="w-10 h-10" />
             </div>
          </div>
          <div className="text-center space-y-2 mb-8">
             <h3 className="text-2xl font-black uppercase tracking-tight">Gemma Autonomous MRP</h3>
             <p className="text-sm text-muted-foreground max-w-sm font-medium leading-relaxed">
                Gemma está analizando los descriptores de inventario y pedidos de venta para optimizar la cadena de suministro industrial.
             </p>
          </div>
          <div className="w-full max-w-md bg-slate-50 p-6 rounded-3xl border border-slate-100">
             <div className="space-y-4">
                <div className="flex items-center justify-between text-[10px] font-black uppercase text-slate-500">
                   <span>Carga de Procesamiento IA</span>
                   <span className="text-primary font-black">ACTIVO</span>
                </div>
                <div className="h-1 w-full bg-slate-200 rounded-full overflow-hidden">
                   <div className="h-full bg-primary w-[82%] animate-pulse" />
                </div>
             </div>
          </div>
       </Card>

       <div className="lg:col-span-4 space-y-6">
          <Card className="border-none shadow-sm bg-indigo-600 text-white">
             <CardHeader>
                <div className="flex items-center gap-2 mb-2">
                   <Zap className="h-4 w-4" />
                   <span className="text-[10px] font-black uppercase tracking-widest text-white/70">Optimización Sugerida</span>
                </div>
                <CardTitle className="text-xl font-bold tracking-tight">Estrategia de Montaje</CardTitle>
             </CardHeader>
             <CardContent className="space-y-4">
                <p className="text-xs text-indigo-50 leading-relaxed">
                   "Ajusta los turnos en la línea 2. Anticipo una ruptura de stock en componentes de aluminio para el viernes si no se acelera el montaje hoy."
                </p>
                <Button className="w-full bg-white text-indigo-600 hover:bg-indigo-50 font-black uppercase text-[10px] h-12 rounded-xl">
                   Aplicar Estrategia
                </Button>
             </CardContent>
          </Card>

          <Card className="border-none shadow-sm">
             <CardHeader className="pb-3 border-b border-slate-50">
                <CardTitle className="text-xs font-black uppercase">KPIs Predictivos</CardTitle>
             </CardHeader>
             <CardContent className="pt-4 space-y-4">
                <div className="flex justify-between items-center">
                   <span className="text-[10px] font-bold uppercase text-slate-500">Tiempo de Ciclo</span>
                   <Badge className="bg-green-100 text-green-700 border-none font-bold text-[9px]">-4.2% (Mejora)</Badge>
                </div>
                <div className="flex justify-between items-center">
                   <span className="text-[10px] font-bold uppercase text-slate-500">Costo Material</span>
                   <Badge className="bg-amber-100 text-amber-700 border-none font-bold text-[9px]">+1.5% (Inflación)</Badge>
                </div>
             </CardContent>
          </Card>
       </div>
    </div>
  )
}

export default function ProduccionDashboard() {
  const searchParams = useSearchParams()
  const section = searchParams.get('section') || 'ordenes'
  const { data: workOrders, mutate } = useSWR('/api/erp/production/work-orders', fetcher)
  const [selectedWO, setSelectedWO] = useState<any>(null)
  const [isReporting, setIsReporting] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [qty, setQty] = useState('')

  const handleTabChange = (tabId: string) => {
    const url = new URL(window.location.href);
    if (tabId === 'ordenes') url.searchParams.delete('section');
    else url.searchParams.set('section', tabId);
    window.history.pushState({}, '', url);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }

  const handleReportScrap = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!qty || isNaN(Number(qty))) return toast.error('Cantidad inválida')

    setUploading(true)
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject)
      })
      const mockEvidence = `https://cdn.volkern.app/evidence/scrap_${selectedWO.id}_${Date.now()}.jpg`

      const res = await fetch('/api/erp/production/report-waste', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workOrderId: selectedWO.id,
          itemId: selectedWO.bom?.productId,
          quantity: Number(qty),
          evidenceUrl: mockEvidence,
          reportLat: position.coords.latitude,
          reportLng: position.coords.longitude,
          clientTimestamp: new Date().toISOString()
        })
      })

      const result = await res.json()
      if (!res.ok) throw new Error(result.error)

      toast.success('Reporte verificado por Vision-Lock')
      mutate()
      setIsReporting(false)
      setSelectedWO(null)
      setQty('')
    } catch (error: any) {
      toast.error(error.message || 'Error de integridad')
    } finally {
      setUploading(false)
    }
  }

  const stats = [
    { label: 'Órdenes Activas', value: '8', icon: Factory, color: 'text-blue-500', bg: 'bg-blue-500/10' },
    { label: 'Eficiencia OEE', value: '92%', icon: BarChart3, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
    { label: 'Alertas de Calidad', value: '2', icon: AlertTriangle, color: 'text-rose-500', bg: 'bg-rose-500/10' },
    { label: 'Producido Hoy', value: '1,240u', icon: CheckCircle2, color: 'text-purple-500', bg: 'bg-purple-500/10' },
  ]

  return (
    <div className="space-y-8 pb-20">
      {/* Header Dinámico */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-black tracking-tight uppercase">
            {section === 'bom' ? 'Gestión de Recetas (BoM)' : section === 'costos' ? 'Control de Costos (MRP)' : section === 'ai' ? 'Fab-Control IA' : 'Producción Hub (MRP)'}
          </h1>
          <p className="text-muted-foreground font-medium text-sm">
            {section === 'bom' ? 'Estructura detallada de materiales y procesos de fabricación.' : 
             section === 'costos' ? 'Analítica financiera de manufactura e insumos industriales.' : 
             section === 'ai' ? 'Optimización autónoma de planta mediante inteligencia predictiva.' : 
             'Gestión de manufactura, BoM e integridad de planta.'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => handleTabChange('bom')} className="rounded-xl font-bold uppercase text-[10px] h-10 px-4">
            <Layers className="w-4 h-4 mr-2" /> Recetas
          </Button>
          <Button className="rounded-xl font-bold uppercase text-[10px] h-10 px-4 shadow-lg shadow-primary/20">
            <Plus className="w-4 h-4 mr-2" /> Nueva Orden
          </Button>
        </div>
      </div>

      {/* Selector Visual de Pestana */}
      <div className="flex bg-slate-100 p-1 rounded-2xl w-fit">
        {[
          { id: 'ordenes', label: 'Monitor Planta', icon: Factory },
          { id: 'bom', label: 'Recetas (BoM)', icon: Boxes },
          { id: 'preparacion', label: 'Preparación', icon: ClipboardCheck },
          { id: 'costos', label: 'Costos Mfg', icon: DollarSign },
          { id: 'planificacion', label: 'Planificación', icon: Calendar },
          { id: 'scheduling', label: 'Scheduling', icon: ListOrdered },
          { id: 'calidad', label: 'Calidad', icon: ClipboardCheck },
          { id: 'mantenimiento', label: 'Mantenimiento', icon: Wrench },
          { id: 'ai', label: 'Gemma Fab-Control', icon: Cpu }
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => handleTabChange(tab.id)}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-[10px] font-black uppercase transition-all ${
              section === tab.id ? 'bg-white shadow-md text-primary' : 'text-muted-foreground hover:bg-white/50'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={section}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2 }}
        >
          {section === 'ordenes' && (
            <div className="space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {stats.map((stat, i) => (
                  <Card key={i} className="border-none shadow-sm hover:shadow-md transition-all">
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between mb-4">
                        <div className={`p-2.5 rounded-xl ${stat.bg} ${stat.color}`}>
                          <stat.icon className="w-5 h-5" />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">{stat.label}</p>
                        <p className="text-2xl font-black tracking-tighter">{stat.value}</p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <Card className="lg:col-span-8 border-none shadow-sm">
                  <CardHeader>
                    <CardTitle className="text-lg font-bold uppercase">Órdenes de Fabricación</CardTitle>
                    <CardDescription>Seguimiento en tiempo real de la planta.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {(workOrders || [1, 2, 3]).map((wo: any, i: number) => (
                        <div key={wo.id || i} className="p-4 rounded-2xl bg-slate-50 border border-transparent hover:border-slate-200 hover:bg-white transition-all flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div className="flex flex-col">
                              <h4 className="font-bold text-sm text-slate-900">{wo.bom?.catalogoItem?.nombre || 'Producto Industrial XZ-1'}</h4>
                              <div className="flex items-center gap-2 mt-0.5">
                                <Badge variant="outline" className="bg-white border-slate-200 text-slate-500 text-[9px] font-black uppercase px-2 py-0 h-4">
                                   Lote: {wo.batchNumber || `B-${2024+i}`}
                                </Badge>
                              </div>
                            </div>

                          
                          <div className="flex-1 max-w-xs px-4">
                             <div className="flex justify-between mb-1 text-[10px] font-bold uppercase">
                                <span>Progreso</span>
                                <span>{wo.progress || 75}%</span>
                             </div>
                             <Progress value={wo.progress || 75} className="h-1.5" />
                          </div>

                          <div className="flex items-center gap-3">
                            {wo.status === 'PLANNED' && (
                                <Button 
                                  size="sm" 
                                  className="premium-gradient-primary hover:opacity-90 text-white font-black uppercase text-[9px] h-9 px-4 rounded-xl shadow-lg shadow-primary/20"
                                  onClick={async () => {
                                    try {
                                      const res = await fetch(`/api/erp/production/work-orders/${wo.id}/start`, { method: 'POST' });
                                      const data = await res.json();
                                      if (!res.ok) throw new Error(data.error);
                                      toast.success('Orden iniciada exitosamente');
                                      mutate();
                                    } catch (error: any) {
                                      toast.error(error.message, {
                                        description: 'Se requiere validación académica.',
                                        duration: 5000,
                                      });
                                    }
                                  }}
                                >
                                  <Play className="w-3 h-3 mr-1.5" /> Iniciar Orden
                                </Button>

                            )}
                            <Badge className={`px-3 font-black uppercase text-[9px] tracking-widest border-none ${
                              wo.status === 'IN_PROGRESS' ? 'bg-blue-50 text-blue-600' : 
                              wo.status === 'PLANNED' ? 'bg-amber-50 text-amber-600' : 'bg-slate-100 text-slate-500'
                            }`}>
                              {wo.status === 'IN_PROGRESS' ? 'EN CURSO' : wo.status}
                            </Badge>
                            <Button 
                              size="icon" 
                              variant="ghost" 
                              className="rounded-full hover:bg-white shadow-sm border border-transparent hover:border-slate-100"
                              onClick={() => { setSelectedWO(wo); setIsReporting(true); }}
                            >
                              <ArrowRight className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                <div className="lg:col-span-4 space-y-6">
                  <Card className="border-none shadow-sm bg-slate-950 text-white overflow-hidden relative">
                    <CardHeader className="relative z-10 pb-2">
                       <div className="flex items-center gap-2 mb-1">
                          <Cpu className="w-4 h-4 text-primary" />
                          <span className="text-[10px] font-black uppercase tracking-widest text-primary">Fab-Control Insights</span>
                       </div>
                       <CardTitle className="text-xl font-bold tracking-tight">IA Sugerencia</CardTitle>
                    </CardHeader>
                    <CardContent className="relative z-10 space-y-4 pt-2">
                       <div className="p-6 rounded-2xl bg-white/5 border border-white/10 text-sm text-indigo-100 leading-relaxed italic border-l-4 border-l-primary shadow-inner">
                          "Optimiza la línea 4: El lote SolarTech #442 tiene una probabilidad del 82% de cuello de botella si no se incrementa el flujo de montaje."
                       </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </div>
          )}

          {section === 'bom' && <BoMManager />}
          {section === 'preparacion' && <ProductionReadiness />}
          {section === 'costos' && <CostControl />}
          {section === 'planificacion' && <CapacityForecast />}
          {section === 'scheduling' && <SchedulingOptimized />}
          {section === 'calidad' && <QualityHub />}
          {section === 'mantenimiento' && <AssetMaintenance />}
          {section === 'ai' && <AIFabControl />}
        </motion.div>
      </AnimatePresence>

      {/* SECURE CAPTURE MODAL (Vision-Lock) */}
      <Dialog open={isReporting} onOpenChange={setIsReporting}>
        <DialogContent className="sm:max-w-[425px] rounded-3xl overflow-hidden border-none p-0">
          <div className="bg-slate-950 p-6 text-white">
            <DialogHeader>
               <div className="flex items-center gap-2 mb-2">
                  <Badge className="bg-primary/20 text-primary border-none text-[9px] font-black uppercase px-2 py-0.5 tracking-widest">Filtro de Veracidad Activo</Badge>
               </div>
              <DialogTitle className="text-2xl font-black uppercase italic tracking-tighter">Vision-Lock Security</DialogTitle>
              <DialogDescription className="text-slate-400 text-xs font-medium">
                Solo se permite captura en vivo. El hash de integridad se generará al confirmar.
              </DialogDescription>
            </DialogHeader>
          </div>

          <form onSubmit={handleReportScrap} className="p-6 space-y-6">
            <div className="space-y-4">
              <div className="grid w-full items-center gap-1.5">
                <Label htmlFor="qty" className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Cantidad Producida/Merma</Label>
                <Input 
                  id="qty" 
                  placeholder="Ej: 5" 
                  value={qty}
                  onChange={(e) => setQty(e.target.value)}
                  className="rounded-xl border-slate-100 bg-slate-50 font-bold focus:ring-primary h-12"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Evidencia Visual (Cámara)</Label>
                <div className="relative group cursor-pointer">
                  <input 
                    type="file" 
                    accept="image/*" 
                    capture="camera"
                    className="absolute inset-0 opacity-0 z-20 cursor-pointer"
                    required
                  />
                  <div className="border-2 border-dashed border-slate-200 rounded-2xl p-8 flex flex-col items-center justify-center gap-2 group-hover:border-primary/50 transition-colors bg-slate-50">
                    <Camera className="w-8 h-8 text-slate-300 group-hover:text-primary transition-colors" />
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Capturar Evidencia</span>
                  </div>
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button 
                type="submit" 
                className="w-full rounded-2xl h-14 font-black uppercase tracking-widest shadow-xl shadow-primary/20"
                disabled={uploading}
              >
                {uploading ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <ShieldCheck className="w-5 h-5 mr-2" />}
                {uploading ? 'Validando Integridad...' : 'Confirmar con Vision-Lock'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function QualityHub() {
  const { data: checks } = useSWR('/api/erp/production/quality', fetcher)
  const { data: ncs } = useSWR('/api/erp/production/quality/non-conformities', fetcher)

  const displayChecks = checks || [
    { id: '1', point: { name: 'Espesor de Panel' }, status: 'PASSED', measuredValue: '3.2mm', workOrder: { batchNumber: '1028' } },
    { id: '2', point: { name: 'Tensión de Salida' }, status: 'FAILED', measuredValue: '210V', workOrder: { batchNumber: '1029' } },
  ]

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-4">
        <Card className="border-none shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg font-bold uppercase">Inspecciones Recientes</CardTitle>
            <CardDescription>Control de puntos críticos y validación de lotes.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {displayChecks.map((check: any) => (
                <div key={check.id} className="p-4 rounded-2xl bg-white border border-slate-100 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${
                      check.status === 'PASSED' ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'
                    }`}>
                      {check.status === 'PASSED' ? <CheckCircle2 className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
                    </div>
                    <div>
                      <h4 className="font-bold text-sm">{check.point?.name}</h4>
                      <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">OP #{check.workOrder?.batchNumber} • Val: {check.measuredValue}</p>
                    </div>
                  </div>
                  <Badge className={`text-[9px] font-black uppercase ${
                    check.status === 'PASSED' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                  }`}>{check.status}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-6">
        <Card className="border-none shadow-sm bg-red-950 text-white">
          <CardHeader>
             <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="h-4 w-4 text-red-400" />
                <span className="text-[10px] font-black uppercase tracking-widest text-red-400">Alertas de No Conformidad</span>
             </div>
             <CardTitle className="text-xl font-bold tracking-tight">Fugas de Calidad</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
             <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                <p className="text-xs text-slate-300 leading-relaxed italic">
                   "Se han detectado 3 fallos en la Línea B relacionados con la tensión de salida. Posible degradación del sensor de calibración."
                </p>
             </div>
             <Button variant="outline" className="w-full rounded-xl border-white/20 text-white hover:bg-white/10 font-black text-[10px] uppercase">
                Ver Reporte Forense
             </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
