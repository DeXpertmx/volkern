'use client'

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Plus, Search, Warehouse as WarehouseIcon, MapPin, Box, Info } from "lucide-react"
import useSWR from "swr"

const fetcher = (url: string) => fetch(url).then(res => res.json())

export default function AlmacenesPage() {
  const { data: warehouses, isLoading } = useSWR('/api/erp/warehouses', fetcher)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black tracking-tight uppercase">Gestión de Almacenes</h1>
          <p className="text-muted-foreground font-medium">Configuración de nodos logísticos y centros de distribución.</p>
        </div>
        <Button className="rounded-xl font-bold uppercase text-xs tracking-wider">
          <Plus className="w-4 h-4 mr-2" /> Nuevo Almacén
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {isLoading ? (
          <div className="col-span-full py-20 text-center font-bold uppercase text-muted-foreground tracking-widest text-xs">Cargando almacenes...</div>
        ) : (warehouses && warehouses.length > 0) ? (
          warehouses.map((wh: any) => (
            <Card key={wh.id} className="border-none shadow-sm hover:shadow-md transition-all group overflow-hidden relative">
               <div className="absolute top-0 right-0 p-8 opacity-5">
                 <WarehouseIcon className="w-24 h-24 rotate-12" />
               </div>
               <CardHeader>
                  <div className="flex justify-between items-start mb-2">
                     <Badge className="bg-emerald-50 text-emerald-600 border-none rounded-lg text-[10px] font-black uppercase tracking-wider">Activo</Badge>
                     <div className="p-2 rounded-xl bg-slate-100 text-slate-500 group-hover:bg-primary group-hover:text-white transition-all duration-500">
                        <WarehouseIcon className="w-5 h-5" />
                     </div>
                  </div>
                  <CardTitle className="text-xl font-bold">{wh.name}</CardTitle>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
                     <MapPin className="w-3 h-3" /> {wh.location || 'Ubicación no especificada'}
                  </div>
               </CardHeader>
               <CardContent className="space-y-4">
                  <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                    {wh.description || 'Sin descripción adicional para este centro de distribución.'}
                  </p>
                  
                  <div className="pt-4 border-t flex items-center justify-between">
                     <div className="flex items-center gap-2">
                        <Box className="w-4 h-4 text-primary" />
                        <span className="text-sm font-black italic">SKUs Vinculados</span>
                     </div>
                     <span className="text-sm font-black text-slate-900 tracking-tighter">{wh._count?.stockLevels || 0} Items</span>
                  </div>
                  
                  <div className="flex gap-2 pt-2">
                     <Button variant="outline" className="flex-1 rounded-xl text-[10px] font-black uppercase tracking-widest py-5">Auditoría</Button>
                     <Button variant="ghost" className="flex-1 rounded-xl text-[10px] font-black uppercase tracking-widest py-5 border">Editar</Button>
                  </div>
               </CardContent>
            </Card>
          ))
        ) : (
          <div className="col-span-full py-20 bg-slate-50 rounded-2xl border border-dashed border-slate-200 flex flex-col items-center justify-center space-y-3">
             <Info className="w-8 h-8 text-slate-300" />
             <p className="text-sm font-bold text-slate-500 uppercase tracking-tight italic">No se han detectado almacenes secundarios</p>
             <p className="text-xs text-slate-400">El Almacén Central se genera automáticamente al primer ajuste.</p>
          </div>
        )}
      </div>
    </div>
  )
}
