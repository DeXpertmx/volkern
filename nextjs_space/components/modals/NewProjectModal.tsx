'use client'

import { useState } from 'react'
import { 
  X, 
  Briefcase, 
  Target, 
  DollarSign, 
  Calendar,
  CheckCircle2,
  Users
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import useSWR, { mutate } from 'swr'
import { toast } from 'sonner'

const fetcher = (url: string) => fetch(url).then(res => res.json())

interface NewProjectModalProps {
  open: boolean
  setOpen: (open: boolean) => void
}

export default function NewProjectModal({ open, setOpen }: NewProjectModalProps) {
  const { data: leads, isLoading: loadingLeads } = useSWR('/api/leads', fetcher)
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    budget: '',
    startDate: new Date().toISOString().split('T')[0],
  })

  if (!open) return null

  const handleSelectLead = (lead: any) => {
    setSelectedLeadId(lead.id)
    setFormData(prev => ({
      ...prev,
      name: `PROYECTO: ${lead.empresa || lead.nombre}`,
      description: lead.contextoProyecto || '',
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.name) return toast.error('El nombre del proyecto es obligatorio')
    
    setLoading(true)
    try {
      const res = await fetch('/api/erp/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          leadId: selectedLeadId,
          status: 'PLANNING'
        })
      })

      if (!res.ok) throw new Error('Error al crear proyecto')

      toast.success('Proyecto creado y Lead vinculado exitosamente')
      mutate('/api/erp/projects')
      setOpen(false)
    } catch (error) {
      toast.error('No se pudo crear el proyecto')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-3xl w-full max-w-4xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden border border-slate-100">
        {/* Header */}
        <div className="p-6 border-b flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-primary/10 rounded-xl">
              <Briefcase className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-black tracking-tight uppercase">Convertir Lead a Proyecto</h2>
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Inicia la ejecución operativa y financiera.</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={() => setOpen(false)} className="rounded-full">
            <X className="w-5 h-5" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Lado Izquierdo: Selección de Lead */}
          <div className="space-y-4">
            <h3 className="text-xs font-black uppercase tracking-[0.2em] text-slate-400 mb-4 flex items-center gap-2">
              <Users className="w-3 h-3" /> Seleccionar Lead Ganado
            </h3>
            
            <div className="space-y-2 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
              {loadingLeads ? (
                <div className="text-center py-10 text-[10px] font-bold uppercase animate-pulse">Cargando Leads...</div>
              ) : (leads && Array.isArray(leads) && leads.length > 0) ? (
                leads.filter((l: any) => l.estado !== 'perdido' && l.estado !== 'ganado').map((lead: any) => (
                  <div 
                    key={lead.id}
                    onClick={() => handleSelectLead(lead)}
                    className={`p-4 rounded-2xl border-2 transition-all cursor-pointer group ${
                      selectedLeadId === lead.id 
                        ? 'border-primary bg-primary/5 shadow-md ring-4 ring-primary/5' 
                        : 'border-slate-100 hover:border-slate-200 bg-white'
                    }`}
                  >
                    <div className="flex justify-between items-start mb-2">
                       <p className="text-sm font-black tracking-tight">{lead.nombre}</p>
                       <Badge variant="outline" className={`rounded-lg border-none text-[8px] font-black uppercase px-2 py-0.5 ${
                         lead.estado === 'ganado' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-50 text-slate-500'
                       }`}>
                         {lead.estado}
                       </Badge>
                    </div>
                    <p className="text-[10px] font-bold text-muted-foreground uppercase">{lead.empresa || 'Empresa no especificada'}</p>
                    {selectedLeadId === lead.id && (
                      <div className="mt-3 flex items-center gap-1 text-[9px] font-black text-primary uppercase animate-in slide-in-from-left-2">
                        <CheckCircle2 className="w-3 h-3" /> Seleccionado para conversión
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <div className="text-center py-10 text-[10px] font-bold uppercase text-slate-400">No hay leads disponibles</div>
              )}
            </div>
          </div>

          {/* Lado Derecho: Formulario del Proyecto */}
          <form onSubmit={handleSubmit} className="space-y-6 bg-slate-50/50 p-6 rounded-3xl border border-slate-100 h-fit sticky top-0">
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">Nombre del Proyecto</label>
                <div className="relative">
                  <Briefcase className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                  <input 
                    type="text" 
                    required
                    placeholder="Ej. Instalación Planta Solar Fase 1"
                    className="w-full pl-10 pr-4 py-3 bg-white border-2 border-slate-100 rounded-xl text-sm font-bold focus:border-primary outline-none transition-all shadow-sm"
                    value={formData.name}
                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">Descripción / Alcance</label>
                <textarea 
                  rows={3}
                  placeholder="Detalla los objetivos principales..."
                  className="w-full px-4 py-3 bg-white border-2 border-slate-100 rounded-xl text-sm font-medium focus:border-primary outline-none transition-all shadow-sm"
                  value={formData.description}
                  onChange={(e) => setFormData({...formData, description: e.target.value})}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">Presupuesto (€)</label>
                  <div className="relative">
                    <DollarSign className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                    <input 
                      type="number" 
                      placeholder="0.00"
                      className="w-full pl-10 pr-4 py-3 bg-white border-2 border-slate-100 rounded-xl text-sm font-bold focus:border-primary outline-none transition-all shadow-sm"
                      value={formData.budget}
                      onChange={(e) => setFormData({...formData, budget: e.target.value})}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 ml-1">Fecha Inicio</label>
                  <div className="relative">
                    <Calendar className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                    <input 
                      type="date" 
                      className="w-full pl-10 pr-4 py-3 bg-white border-2 border-slate-100 rounded-xl text-sm font-bold focus:border-primary outline-none transition-all shadow-sm"
                      value={formData.startDate}
                      onChange={(e) => setFormData({...formData, startDate: e.target.value})}
                    />
                  </div>
                </div>
              </div>
            </div>

            <Button 
              type="submit" 
              disabled={loading || !selectedLeadId}
              className="w-full py-6 rounded-2xl bg-primary text-white font-black uppercase text-xs tracking-[0.2em] shadow-xl shadow-primary/20 hover:translate-y-[-2px] transition-all disabled:opacity-50 disabled:translate-y-0"
            >
              {loading ? 'Creando...' : 'Confirmar Conversión'}
            </Button>
            
            <p className="text-[9px] text-center text-slate-400 font-bold uppercase leading-relaxed px-4">
              Al confirmar, se creará un nuevo silo de proyectos y se mantendrá la trazabilidad histórica con el lead original.
            </p>
          </form>
        </div>
      </div>
    </div>
  )
}
