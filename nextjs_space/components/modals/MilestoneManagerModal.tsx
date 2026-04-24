'use client'

import { useState } from 'react'
import { 
  X, 
  Flag, 
  Calendar,
  CheckCircle2,
  Plus,
  Trash2,
  AlertCircle
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { mutate } from 'swr'
import { toast } from 'sonner'

interface MilestoneManagerModalProps {
  open: boolean
  setOpen: (open: boolean) => void
  project: any
}

export default function MilestoneManagerModal({ open, setOpen, project }: MilestoneManagerModalProps) {
  const [loading, setLoading] = useState(false)
  const [newMilestone, setNewMilestone] = useState<any>({
    name: '',
    dueDate: new Date().toISOString().split('T')[0],
    isCritical: false,
    billingPercentage: 0
  })

  if (!open || !project) return null

  const handleAddMilestone = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newMilestone.name) return
    
    setLoading(true)
    try {
      const res = await fetch(`/api/erp/projects/${project.id}/milestones`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newMilestone)
      })

      if (!res.ok) throw new Error()
      
      toast.success('Hito añadido')
      setNewMilestone({ name: '', dueDate: new Date().toISOString().split('T')[0], isCritical: false, billingPercentage: 0 })
      mutate('/api/erp/projects')
    } catch (error) {
      toast.error('Error al añadir hito')
    } finally {
      setLoading(false)
    }
  }

  const handleToggleStatus = async (milestone: any) => {
    const newStatus = milestone.status === 'COMPLETED' ? 'PENDING' : 'COMPLETED'
    try {
      const res = await fetch(`/api/erp/projects/${project.id}/milestones/${milestone.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      })

      if (!res.ok) throw new Error()
      mutate('/api/erp/projects')
      toast.success(`Hito ${newStatus === 'COMPLETED' ? 'completado' : 'reabierto'}`)
    } catch (error) {
      toast.error('Error al actualizar hito')
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('¿Eliminar este hito?')) return
    try {
      const res = await fetch(`/api/erp/projects/${project.id}/milestones/${id}`, {
        method: 'DELETE'
      })
      if (!res.ok) throw new Error()
      mutate('/api/erp/projects')
      toast.success('Hito eliminado')
    } catch (error) {
      toast.error('Error al eliminar hito')
    }
  }

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden border border-slate-100">
        <div className="p-6 border-b flex items-center justify-between bg-slate-50/50">
          <div>
            <h2 className="text-xl font-black tracking-tight uppercase">Gestión de Hitos</h2>
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{project.name}</p>
          </div>
          <Button variant="ghost" size="icon" onClick={() => setOpen(false)} className="rounded-full">
            <X className="w-5 h-5" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Listado de Hitos Actuales */}
          <div className="space-y-3">
             {project.milestones?.length > 0 ? project.milestones.map((m: any) => (
                <div key={m.id} className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 border border-slate-100 group">
                   <div className="flex items-center gap-4">
                      <button 
                        onClick={() => handleToggleStatus(m)}
                        className={`h-6 w-6 rounded-lg border-2 flex items-center justify-center transition-all ${
                          m.status === 'COMPLETED' ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-200 bg-white hover:border-primary'
                        }`}
                      >
                         {m.status === 'COMPLETED' && <CheckCircle2 className="w-4 h-4" />}
                      </button>
                      <div>
                         <p className={`text-sm font-bold ${m.status === 'COMPLETED' ? 'line-through text-slate-400' : 'text-slate-900'}`}>{m.name}</p>
                         <div className="flex items-center gap-3 mt-1">
                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1">
                               <Calendar className="w-3 h-3" /> {new Date(m.dueDate).toLocaleDateString()}
                            </span>
                            {m.isCritical && (
                               <Badge className="bg-rose-50 text-rose-600 border-none text-[8px] font-black uppercase px-1.5 h-4">Crítico</Badge>
                            )}
                         </div>
                      </div>
                   </div>
                   <Button 
                     variant="ghost" 
                     size="icon" 
                     onClick={() => handleDelete(m.id)}
                     className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-rose-500 transition-all"
                   >
                      <Trash2 className="w-4 h-4" />
                   </Button>
                </div>
             )) : (
                <div className="text-center py-10 text-slate-400">
                   <Flag className="w-8 h-8 mx-auto mb-2 opacity-20" />
                   <p className="text-[10px] font-black uppercase tracking-widest">No hay hitos definidos</p>
                </div>
             )}
          </div>

          {/* Formulario Añadir Nuevo */}
          <form onSubmit={handleAddMilestone} className="pt-6 border-t border-dashed space-y-4">
             <h3 className="text-[10px] font-black uppercase tracking-widest text-primary flex items-center gap-2">
                <Plus className="w-3 h-3" /> Añadir Nuevo Hito
             </h3>
             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <input 
                   type="text" 
                   placeholder="Nombre del hito..."
                   className="w-full px-4 py-2.5 bg-slate-50 border-2 border-slate-100 rounded-xl text-xs font-bold outline-none focus:border-primary transition-all"
                   value={newMilestone.name}
                   onChange={(e) => setNewMilestone({...newMilestone, name: e.target.value})}
                />
                <input 
                   type="date" 
                   className="w-full px-4 py-2.5 bg-slate-50 border-2 border-slate-100 rounded-xl text-xs font-bold outline-none focus:border-primary transition-all"
                   value={newMilestone.dueDate}
                   onChange={(e) => setNewMilestone({...newMilestone, dueDate: e.target.value})}
                />
                <div className="flex gap-2">
                   <div className="relative flex-1">
                      <input 
                        type="number" 
                        placeholder="% Factura"
                        className="w-full px-4 py-2.5 bg-slate-50 border-2 border-slate-100 rounded-xl text-xs font-bold outline-none focus:border-primary transition-all pr-8"
                        value={newMilestone.billingPercentage || ''}
                        onChange={(e) => setNewMilestone({...newMilestone, billingPercentage: parseFloat(e.target.value)})}
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-black text-slate-400">%</span>
                   </div>
                   <Button 
                     type="button"
                     variant={newMilestone.isCritical ? 'destructive' : 'outline'}
                     onClick={() => setNewMilestone({...newMilestone, isCritical: !newMilestone.isCritical})}
                     className="rounded-xl h-10 px-3"
                     title="Hito Crítico"
                   >
                      <AlertCircle className="w-4 h-4" />
                   </Button>
                </div>
             </div>
             <Button 
               type="submit" 
               disabled={loading || !newMilestone.name}
               className="w-full rounded-xl bg-slate-900 text-white font-black uppercase text-[10px] h-10"
             >
                Registrar Hito Operativo
             </Button>
          </form>
        </div>
      </div>
    </div>
  )
}
