'use client'

import { 
  Megaphone, 
  Layout, 
  MousePointer2, 
  Users, 
  Eye, 
  ArrowUpRight,
  Plus,
  Search,
  CheckCircle2,
  PieChart
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { toast } from "sonner"
import { useState } from 'react'

export default function MarketingAdminPage() {
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleCreateTemplate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setIsSubmitting(true)

    const formData = new FormData(e.currentTarget)
    const data = {
      nombre: formData.get('nombre'),
      categoria: formData.get('categoria'),
      descripcion: formData.get('descripcion'),
      etiquetas: (formData.get('etiquetas') as string)?.split(',').map(s => s.trim()).filter(Boolean) || []
    }

    try {
      const res = await fetch('/api/admin/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      })

      if (res.ok) {
        toast.success("Plantilla global creada exitosamente")
        setShowCreateDialog(false)
      } else {
        const err = await res.json()
        toast.error(err.error || "Error al crear la plantilla")
      }
    } catch (err) {
      toast.error("Error de conexión con el servidor")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="space-y-10">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-4xl font-black text-[#1A365D] uppercase tracking-tighter italic">Marketing Industrial</h1>
          <p className="text-[#4A5568] font-bold text-xs uppercase tracking-widest opacity-60">Smart Landing & Lead Gen Engine</p>
        </div>
        <Button 
          onClick={() => setShowCreateDialog(true)}
          className="rounded-xl h-12 px-6 bg-[#1A365D] hover:bg-[#1A365D]/90 text-white font-black uppercase tracking-widest text-[10px] shadow-lg shadow-indigo-900/10"
        >
          <Plus size={16} className="mr-2" />
          Nueva Plantilla Global
        </Button>
      </div>

      {/* Modal de Creación */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-md rounded-3xl border-none shadow-2xl">
          <DialogHeader className="space-y-3">
            <DialogTitle className="text-2xl font-black text-[#1A365D] uppercase tracking-tighter italic">Nueva Estructura Global</DialogTitle>
            <DialogDescription className="text-xs font-bold text-[#4A5568] opacity-60 uppercase tracking-widest">
              Define los cimientos de una nueva plantilla para el ecosistema Volkern.
            </DialogDescription>
          </DialogHeader>
          
          <form onSubmit={handleCreateTemplate} className="space-y-6 pt-4">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="nombre" className="text-[10px] font-black uppercase tracking-widest text-slate-400">Nombre de la Plantilla</Label>
                <Input id="nombre" name="nombre" placeholder="Ej: Landing Industrial v2" required className="h-12 rounded-xl bg-slate-50 border-none shadow-inner text-sm font-bold" />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="categoria" className="text-[10px] font-black uppercase tracking-widest text-slate-400">Vertical Industrial</Label>
                <Select name="categoria" required defaultValue="marketing">
                  <SelectTrigger className="h-12 rounded-xl bg-slate-50 border-none shadow-inner text-xs font-bold uppercase tracking-widest">
                    <SelectValue placeholder="Selecciona categoría" />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl border-[#E2E8F0]">
                    <SelectItem value="industrial">🏭 Industrial / Manufacturing</SelectItem>
                    <SelectItem value="renewable">☀️ Energy / Solar</SelectItem>
                    <SelectItem value="marketing">🚀 Marketing / Leads</SelectItem>
                    <SelectItem value="academy">🎓 Education / Academy</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="descripcion" className="text-[10px] font-black uppercase tracking-widest text-slate-400">Descripción Estratégica</Label>
                <Input id="descripcion" name="descripcion" placeholder="Explica el objetivo de esta plantilla..." className="h-12 rounded-xl bg-slate-50 border-none shadow-inner text-sm font-bold" />
              </div>
            </div>

            <DialogFooter className="pt-4">
              <Button 
                type="submit" 
                disabled={isSubmitting}
                className="w-full h-12 bg-[#1A365D] hover:bg-slate-800 text-white rounded-xl font-black uppercase tracking-widest text-xs transition-all shadow-lg shadow-indigo-900/10"
              >
                {isSubmitting ? 'Provisionando...' : 'Generar Plantilla Global'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Métricas de Conversión - GRIS MATE STYLE */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {[
          { label: 'Visitas Globales', val: '284.5k', trend: '+18.2%', icon: Eye },
          { label: 'Conversion Rate', val: '4.2%', trend: '+0.5%', icon: MousePointer2 },
          { label: 'Leads Generados', val: '12,840', trend: '+12%', icon: Users },
          { label: 'Costo por Lead', val: '€1.42', trend: '-€0.12', icon: PieChart }
        ].map((stat, i) => (
          <Card key={i} className="border border-[#E2E8F0] shadow-sm rounded-3xl bg-white p-6">
            <div className="flex items-center justify-between mb-4">
              <p className="text-[10px] font-black uppercase text-[#4A5568] tracking-widest">{stat.label}</p>
              <stat.icon size={16} className="text-[#1A365D]" />
            </div>
            <p className="text-3xl font-black text-[#1A365D] tracking-tighter">{stat.val}</p>
            <p className="text-[10px] font-bold text-emerald-500 mt-2">{stat.trend} vs anterior</p>
          </Card>
        ))}
      </div>

      {/* Smart Landings Gallery */}
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-black text-[#1A365D] uppercase tracking-tight">Smart Landings Activas</h2>
          <div className="relative w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
            <Input placeholder="Buscar campañas..." className="pl-10 h-10 rounded-xl border-slate-100 bg-white text-xs" />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {[
            { name: 'Campaña Solar Premium', tenant: 'SolarTech Mexico', conv: '5.8%', img: 'indigo' },
            { name: 'Lead Gen Maquinaria', tenant: 'Energia Vital', conv: '3.1%', img: 'slate' },
            { name: 'Inscripción Cursos v4', tenant: 'Volkern Academy', conv: '8.4%', img: 'blue' }
          ].map((item, i) => (
            <Card key={i} className="border border-[#E2E8F0] shadow-sm rounded-3xl overflow-hidden bg-white group hover:shadow-2xl transition-all duration-500">
              <div className={cn("h-48 relative overflow-hidden bg-slate-100 flex items-center justify-center")}>
                {/* Mock Preview Miniatura */}
                <div className="absolute inset-0 opacity-10 group-hover:opacity-20 transition-opacity bg-gradient-to-br from-[#1A365D] to-indigo-500" />
                <Layout className="text-[#1A365D]/20 group-hover:scale-110 transition-transform duration-700" size={64} />
                <div className="absolute top-4 right-4 group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform">
                  <div className="bg-white p-2 rounded-xl shadow-lg">
                    <ArrowUpRight size={14} className="text-[#1A365D]" />
                  </div>
                </div>
              </div>
              <CardContent className="p-6 space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-[10px] font-black text-[#4A5568] uppercase tracking-widest opacity-60">{item.tenant}</p>
                    <Badge className="bg-emerald-50 text-emerald-600 border-none font-black text-[9px] px-2">{item.conv} CR</Badge>
                  </div>
                  <h3 className="text-lg font-black text-[#1A365D] tracking-tight">{item.name}</h3>
                </div>
                <div className="flex items-center gap-2 pt-2">
                  <div className="h-1.5 flex-1 bg-slate-50 rounded-full overflow-hidden border border-slate-100">
                    <div className="h-full bg-[#1A365D] rounded-full" style={{ width: '75%' }} />
                  </div>
                  <span className="text-[9px] font-black text-[#1A365D] uppercase tracking-widest">75% Goal</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Marketing Engine Settings */}
      <Card className="border border-[#E2E8F0] shadow-sm rounded-3xl overflow-hidden bg-white">
        <CardHeader className="p-8 border-b border-slate-50">
          <CardTitle className="text-xl font-black text-[#1A365D] uppercase tracking-tighter italic text-center">Marketing Integration Layer</CardTitle>
        </CardHeader>
        <CardContent className="p-12">
          <div className="max-w-3xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-12">
            {[
              { title: 'Email Auto-Provisioning', desc: 'Sincronización automática de bandejas de entrada para nuevos operarios.', active: true },
              { title: 'Global Pixels', desc: 'Inyección de scripts de tracking (Meta, Google) a nivel plataforma.', active: false }
            ].map((feature, i) => (
              <div key={i} className="flex gap-4 group">
                <div className={cn(
                  "w-12 h-12 shrink-0 rounded-2xl flex items-center justify-center transition-all",
                  feature.active ? "bg-emerald-50 text-emerald-500 shadow-lg shadow-emerald-500/10" : "bg-slate-50 text-slate-300"
                )}>
                  {feature.active ? <CheckCircle2 size={24} /> : <Megaphone size={24} />}
                </div>
                <div className="space-y-1">
                  <h4 className="text-sm font-black text-[#1A365D] uppercase tracking-tight">{feature.title}</h4>
                  <p className="text-xs text-[#4A5568] font-bold opacity-60 leading-relaxed">{feature.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function cn(...inputs: any[]) {
  return inputs.filter(Boolean).join(' ')
}
