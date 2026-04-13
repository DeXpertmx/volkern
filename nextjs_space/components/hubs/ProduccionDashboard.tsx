'use client'

import { useState } from 'react'
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
  Loader2
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

const fetcher = (url: string) => fetch(url).then(res => res.json())

export default function ProduccionDashboard() {
  const { data: workOrders, mutate } = useSWR('/api/erp/production/work-orders', fetcher)
  const [selectedWO, setSelectedWO] = useState<any>(null)
  const [isReporting, setIsReporting] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [qty, setQty] = useState('')

  const handleReportScrap = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!qty || isNaN(Number(qty))) return toast.error('Cantidad inválida')

    setUploading(true)
    try {
      // 1. OBTENER GPS EN TIEMPO REAL
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject)
      })

      // 2. SIMULACIÓN DE SUBIDA DE IMAGEN (Vision-Lock requiere URL)
      // En producción aquí iría un upload a S3/Cloudinary
      const mockEvidence = `https://cdn.volkern.app/evidence/scrap_${selectedWO.id}_${Date.now()}.jpg`

      // 3. ENVIAR A API CON VISION-LOCK
      const res = await fetch('/api/erp/production/report-waste', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workOrderId: selectedWO.id,
          itemId: selectedWO.bom?.productId, // Simplificación
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
    <div className="space-y-8 pb-10">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-black tracking-tight uppercase">Producción Hub (MRP)</h1>
          <p className="text-muted-foreground font-medium text-sm">Gestión de manufactura, BoM e integridad de planta.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="rounded-xl font-bold uppercase text-xs">
            <Layers className="w-4 h-4 mr-2" /> Recetas (BoM)
          </Button>
          <Button className="rounded-xl font-bold uppercase text-xs shadow-lg shadow-primary/20">
            <Plus className="w-4 h-4 mr-2" /> Nueva Orden
          </Button>
        </div>
      </div>

      {/* Stats Grid */}
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
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{stat.label}</p>
                <p className="text-2xl font-black tracking-tighter">{stat.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Active Work Orders */}
        <Card className="lg:col-span-8 border-none shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg font-bold uppercase">Órdenes de Fabricación</CardTitle>
            <CardDescription>Seguimiento en tiempo real de la planta.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {(workOrders || [1, 2, 3]).map((wo: any, i: number) => (
                <div key={wo.id || i} className="p-4 rounded-2xl bg-slate-50 border border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="h-12 w-12 bg-white rounded-xl shadow-sm flex items-center justify-center text-primary font-bold">
                       #{wo.batchNumber || (1024 + i)}
                    </div>
                    <div>
                      <h4 className="font-bold text-sm">{wo.bom?.catalogoItem?.nombre || 'Producto en proceso'}</h4>
                      <p className="text-[10px] text-muted-foreground font-black uppercase">Batch: {wo.batchNumber}</p>
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
                    <Badge className="bg-blue-50 text-blue-600 border-none px-3 font-black uppercase text-[9px]">EN CURSO</Badge>
                    <Button 
                      size="icon" 
                      variant="ghost" 
                      className="rounded-full hover:bg-white"
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

        {/* AI & Quality Control Sidebar */}
        <div className="lg:col-span-4 space-y-6">
          <Card className="border-none shadow-sm bg-slate-950 text-white overflow-hidden relative">
            <CardHeader className="relative z-10 pb-2">
              <div className="flex items-center gap-2 mb-1">
                <Cpu className="w-4 h-4 text-primary" />
                <span className="text-[10px] font-black uppercase tracking-widest text-primary">Gemma Fab-Control</span>
              </div>
              <CardTitle className="text-lg font-bold">Optimización MRP</CardTitle>
            </CardHeader>
            <CardContent className="relative z-10 space-y-4">
              <div className="p-4 rounded-xl bg-white/5 border border-white/10 text-xs text-slate-300 leading-relaxed italic">
                "Basado en las Órdenes de Venta de esta mañana, sugiero adelantar el proyecto de Energía Solar para evitar paros en la línea 2."
              </div>
            </CardContent>
          </Card>

          <Card className="border-none shadow-sm overflow-hidden">
             <div className="bg-amber-500 h-1 w-full" />
             <CardHeader className="pb-2">
                <CardTitle className="text-sm font-black uppercase flex items-center gap-2">
                   <ShieldCheck className="w-4 h-4 text-amber-500" />
                   Vision-Lock Security
                </CardTitle>
             </CardHeader>
             <CardContent className="space-y-3">
                <div className="flex items-center gap-3 text-[10px] font-bold text-muted-foreground uppercase">
                   <div className="flex items-center gap-1"><MapPin className="w-3 h-3" /> GPS Match</div>
                   <div className="flex items-center gap-1"><Clock className="w-3 h-3" /> EXIF Sync</div>
                   <div className="flex items-center gap-1"><Camera className="w-3 h-3" /> Camera API</div>
                </div>
                <p className="text-[11px] text-slate-500 leading-tight">
                   El sistema bloquea automáticamente cualquier reporte fuera de rango o con fotos de galería.
                </p>
             </CardContent>
          </Card>
        </div>
      </div>

      {/* SECURE CAPTURE MODAL */}
      <Dialog open={isReporting} onOpenChange={setIsReporting}>
        <DialogContent className="sm:max-w-[425px] rounded-3xl overflow-hidden border-none p-0">
          <div className="bg-slate-950 p-6 text-white">
            <DialogHeader>
               <div className="flex items-center gap-2 mb-2">
                  <Badge className="bg-primary/20 text-primary border-none text-[9px] font-black uppercase px-2 py-0.5">Filtro de Veracidad Activo</Badge>
               </div>
              <DialogTitle className="text-2xl font-black uppercase italic tracking-tighter">Reporte Vision-Lock</DialogTitle>
              <DialogDescription className="text-slate-400 text-xs">
                Captura la evidencia visual de la merma. Solo se permite captura en vivo.
              </DialogDescription>
            </DialogHeader>
          </div>

          <form onSubmit={handleReportScrap} className="p-6 space-y-6">
            <div className="space-y-4">
              <div className="grid w-full items-center gap-1.5">
                <Label htmlFor="qty" className="text-[10px] font-black uppercase text-slate-500">Cantidad Desperdiciada</Label>
                <Input 
                  id="qty" 
                  placeholder="Ej: 5" 
                  value={qty}
                  onChange={(e) => setQty(e.target.value)}
                  className="rounded-xl border-slate-100 bg-slate-50 font-bold focus:ring-primary h-12"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase text-slate-500">Evidencia Visual (Cámara)</Label>
                <div className="relative group cursor-pointer">
                  <input 
                    type="file" 
                    accept="image/*" 
                    capture="camera"
                    className="absolute inset-0 opacity-0 z-20 cursor-pointer"
                    required
                  />
                  <div className="border-2 border-dashed border-slate-200 rounded-2xl p-8 flex flex-col items-center justify-center gap-2 group-hover:border-primary/50 transition-colors bg-slate-50">
                    <Camera className="w-8 h-8 text-slate-400 group-hover:text-primary" />
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Abrir Cámara</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-slate-50 rounded-2xl p-4 space-y-3">
               <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                     <MapPin className="w-3 h-3 text-emerald-500" />
                     <span className="text-[10px] font-bold uppercase">Ubicación GPS</span>
                  </div>
                  <Badge variant="outline" className="text-[9px] border-emerald-100 text-emerald-600 bg-emerald-50">Detectando...</Badge>
               </div>
               <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                     <Clock className="w-3 h-3 text-blue-500" />
                     <span className="text-[10px] font-bold uppercase">EXIF Timestamp</span>
                  </div>
                  <Badge variant="outline" className="text-[9px] border-blue-100 text-blue-600 bg-blue-50">Sync Sincronizado</Badge>
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
