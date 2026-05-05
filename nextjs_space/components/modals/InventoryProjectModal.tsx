'use client'

import { useState, useEffect } from 'react'
import { 
  X, 
  Package, 
  Search,
  Plus,
  Trash2,
  AlertTriangle,
  ArrowDownRight,
  Warehouse
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import useSWR, { mutate } from 'swr'
import { toast } from 'sonner'

const fetcher = (url: string) => fetch(url).then(res => res.json())

interface InventoryProjectModalProps {
  open: boolean
  setOpen: (open: boolean) => void
  project: any
}

export default function InventoryProjectModal({ open, setOpen, project }: InventoryProjectModalProps) {
  const { data: catalogue } = useSWR('/api/erp/inventory', fetcher)
  const { data: warehouses } = useSWR('/api/erp/warehouses', fetcher)
  const { data: consumption, mutate: mutateConsumption } = useSWR(project ? `/api/erp/projects/${project.id}/inventory` : null, fetcher)
  
  const [loading, setLoading] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedItem, setSelectedItem] = useState<any>(null)
  const [formData, setFormData] = useState({
    warehouseId: '',
    quantity: 1,
    reason: ''
  })

  if (!open || !project) return null

  const filteredCatalogue = catalogue?.filter((item: any) => 
    item.nombre.toLowerCase().includes(searchTerm.toLowerCase()) || 
    item.sku?.toLowerCase().includes(searchTerm.toLowerCase())
  ) || []

  const handleRegisterConsumption = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedItem || !formData.warehouseId || !formData.quantity) {
      toast.error('Completa todos los campos')
      return
    }

    setLoading(true)
    try {
      const res = await fetch(`/api/erp/projects/${project.id}/inventory`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          catalogoItemId: selectedItem.id,
          warehouseId: formData.warehouseId,
          quantity: formData.quantity,
          reason: formData.reason
        })
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Error al registrar')
      }

      toast.success('Material asignado al proyecto')
      setSelectedItem(null)
      setFormData({ warehouseId: '', quantity: 1, reason: '' })
      mutateConsumption()
    } catch (error: any) {
      toast.error(error.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-3xl w-full max-w-4xl shadow-2xl flex flex-col h-[85vh] overflow-hidden border border-slate-100">
        <div className="p-6 border-b flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-3">
             <div className="p-2 bg-indigo-500 rounded-xl text-white">
                <Package className="w-5 h-5" />
             </div>
             <div>
                <h2 className="text-xl font-black tracking-tight uppercase">Suministros del Proyecto</h2>
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{project.name}</p>
             </div>
          </div>
          <Button variant="ghost" size="icon" onClick={() => setOpen(false)} className="rounded-full">
            <X className="w-5 h-5" />
          </Button>
        </div>

        <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
          {/* Panel Izquierdo: Buscador de Materiales */}
          <div className="w-full md:w-1/2 border-r flex flex-col bg-slate-50/30">
             <div className="p-4 border-b">
                <div className="relative">
                   <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                   <input 
                     type="text" 
                     placeholder="Buscar en catálogo (SKU o Nombre)..."
                     className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold outline-none focus:border-indigo-500 transition-all"
                     value={searchTerm}
                     onChange={(e) => setSearchTerm(e.target.value)}
                   />
                </div>
             </div>
             <div className="flex-1 overflow-y-auto p-4 space-y-2">
                {filteredCatalogue.map((item: any) => (
                   <div 
                     key={item.id}
                     onClick={() => setSelectedItem(item)}
                     className={`p-4 rounded-2xl border transition-all cursor-pointer ${
                       selectedItem?.id === item.id ? 'bg-indigo-500 border-indigo-600 text-white shadow-lg shadow-indigo-200' : 'bg-white border-slate-100 hover:border-indigo-300 text-slate-900'
                     }`}
                   >
                      <div className="flex justify-between items-start">
                         <h4 className="text-xs font-black uppercase tracking-tight">{item.nombre}</h4>
                         <Badge className={`${selectedItem?.id === item.id ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'} border-none text-[8px] font-black`}>
                            {item.sku || 'S/SKU'}
                         </Badge>
                      </div>
                      <p className={`text-[10px] mt-1 font-bold ${selectedItem?.id === item.id ? 'text-white/70' : 'text-slate-400'}`}>
                         Stock Disponible: {item.stockActual || 0} {item.unidadMedida}
                      </p>
                   </div>
                ))}
             </div>
          </div>

          {/* Panel Derecho: Consumo Actual y Registro */}
          <div className="w-full md:w-1/2 flex flex-col bg-white">
             {selectedItem ? (
                <div className="p-6 border-b bg-indigo-50/50">
                   <h3 className="text-[10px] font-black uppercase tracking-widest text-indigo-600 mb-4 flex items-center gap-2">
                      <ArrowDownRight className="w-4 h-4" /> Registrar Consumo
                   </h3>
                   <form onSubmit={handleRegisterConsumption} className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                         <div className="space-y-1.5">
                            <label className="text-[9px] font-black uppercase text-slate-400 ml-1">Almacén Origen</label>
                            <select 
                              className="w-full px-4 py-2 bg-white border-2 border-slate-100 rounded-xl text-xs font-bold outline-none focus:border-indigo-500"
                              value={formData.warehouseId}
                              onChange={(e) => setFormData({...formData, warehouseId: e.target.value})}
                            >
                               <option value="">Seleccionar...</option>
                               {warehouses?.map((w: any) => (
                                  <option key={w.id} value={w.id}>{w.nombre}</option>
                               ))}
                            </select>
                         </div>
                         <div className="space-y-1.5">
                            <label className="text-[9px] font-black uppercase text-slate-400 ml-1">Cantidad</label>
                            <input 
                              type="number" 
                              className="w-full px-4 py-2 bg-white border-2 border-slate-100 rounded-xl text-xs font-bold outline-none focus:border-indigo-500"
                              value={formData.quantity}
                              onChange={(e) => setFormData({...formData, quantity: parseFloat(e.target.value)})}
                            />
                         </div>
                      </div>
                      <div className="space-y-1.5">
                         <label className="text-[9px] font-black uppercase text-slate-400 ml-1">Nota de Uso</label>
                         <input 
                           type="text" 
                           placeholder="Ej: Instalación fase inicial..."
                           className="w-full px-4 py-2 bg-white border-2 border-slate-100 rounded-xl text-xs font-bold outline-none focus:border-indigo-500"
                           value={formData.reason}
                           onChange={(e) => setFormData({...formData, reason: e.target.value})}
                         />
                      </div>
                      <div className="flex gap-2">
                         <Button type="submit" disabled={loading} className="flex-1 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-black uppercase text-[10px] h-11">
                            {loading ? 'Procesando...' : 'Confirmar Asignación'}
                         </Button>
                         <Button type="button" onClick={() => setSelectedItem(null)} variant="outline" className="rounded-xl font-black uppercase text-[10px] h-11 px-4">
                            Cancelar
                         </Button>
                      </div>
                   </form>
                </div>
             ) : (
                <div className="p-6 flex-1 flex flex-col">
                   <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-4">Materiales Asignados</h3>
                   <div className="flex-1 overflow-y-auto space-y-3">
                      {consumption?.length > 0 ? consumption.map((move: any) => (
                         <div key={move.id} className="p-4 rounded-2xl border border-slate-50 bg-slate-50/30 flex justify-between items-center">
                            <div>
                               <p className="text-xs font-black uppercase text-slate-900">{move.catalogoItem?.nombre}</p>
                               <div className="flex items-center gap-2 mt-1">
                                  <Badge variant="outline" className="text-[8px] font-black border-slate-200">
                                     <Warehouse className="w-2.5 h-2.5 mr-1" /> {move.warehouse?.nombre}
                                  </Badge>
                                  <span className="text-[9px] font-bold text-slate-400 uppercase">{new Date(move.createdAt).toLocaleDateString()}</span>
                               </div>
                            </div>
                            <div className="text-right">
                               <p className="text-sm font-black text-indigo-600 tracking-tighter">{Math.abs(move.quantity)} UN</p>
                               <p className="text-[8px] font-black uppercase text-slate-400 tracking-widest mt-1">Consumido</p>
                            </div>
                         </div>
                      )) : (
                         <div className="h-full flex flex-col items-center justify-center text-center p-10">
                            <div className="p-4 bg-slate-50 rounded-3xl text-slate-300 mb-4">
                               <AlertTriangle className="w-8 h-8" />
                            </div>
                            <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">No hay suministros registrados</p>
                            <p className="text-[9px] text-slate-300 mt-2 uppercase max-w-[200px]">Selecciona un material de la izquierda para registrar su consumo en obra.</p>
                         </div>
                      )}
                   </div>
                </div>
             )}
          </div>
        </div>
      </div>
    </div>
  )
}
