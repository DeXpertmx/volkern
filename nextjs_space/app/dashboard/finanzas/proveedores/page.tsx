'use client'

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Plus, Search, Building2, Phone, Mail, Globe } from "lucide-react"
import useSWR from "swr"

const fetcher = (url: string) => fetch(url).then(res => res.json())

export default function ProveedoresPage() {
  const { data: suppliers, isLoading } = useSWR('/api/erp/suppliers', fetcher)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black tracking-tight uppercase">Base de Proveedores</h1>
          <p className="text-muted-foreground">Directorio centralizado de partners y suministradores.</p>
        </div>
        <Button className="rounded-xl font-bold uppercase text-xs tracking-wider">
          <Plus className="w-4 h-4 mr-2" /> Nuevo Proveedor
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="md:col-span-2 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input className="w-full bg-slate-100 dark:bg-slate-900 border-none rounded-xl pl-10 pr-4 py-3 text-sm" placeholder="Buscar por nombre o identificación..." />
        </div>
        <div>
           <select className="w-full bg-slate-100 dark:bg-slate-900 border-none rounded-xl px-4 py-3 text-sm font-bold appearance-none outline-none">
             <option>Todas las categorías</option>
             <option>Software</option>
             <option>Marketing</option>
             <option>Logística</option>
           </select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {isLoading ? (
          <div className="col-span-full text-center py-20 text-muted-foreground font-medium uppercase tracking-widest text-xs">Cargando proveedores...</div>
        ) : (suppliers && suppliers.length > 0) ? (
          suppliers.map((supplier: any) => (
            <Card key={supplier.id} className="border-none shadow-sm hover:shadow-md transition-all group relative overflow-hidden">
               <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                 <Building2 className="w-20 h-20 -mr-6 -mt-6 rotate-12" />
               </div>
               <CardHeader className="pb-2">
                 <div className="flex justify-between items-start mb-2">
                    <Badge variant="outline" className="rounded-lg text-[10px] font-bold uppercase border-none bg-primary/10 text-primary">{supplier.category}</Badge>
                    <Badge variant="secondary" className="rounded-full h-2 w-2 p-0 bg-emerald-500" />
                 </div>
                 <CardTitle className="text-xl font-bold tracking-tight">{supplier.name}</CardTitle>
                 <CardDescription className="text-[10px] font-black uppercase tracking-widest">{supplier.taxId || 'SIN ID FISCAL'}</CardDescription>
               </CardHeader>
               <CardContent className="space-y-4">
                 <div className="space-y-2">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Mail className="w-3 h-3" /> {supplier.email || 'No especificado'}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Phone className="w-3 h-3" /> {supplier.phone || 'No especificado'}
                    </div>
                 </div>
                 
                 <div className="pt-4 border-t flex items-center justify-between">
                    <div>
                       <p className="text-[10px] font-bold text-muted-foreground uppercase">Balance Pendiente</p>
                       <p className={`text-lg font-black tracking-tighter ${supplier.balance > 0 ? 'text-rose-500' : 'text-emerald-600'}`}>
                         €{supplier.balance.toFixed(2)}
                       </p>
                    </div>
                    <Button variant="ghost" size="sm" className="rounded-lg text-primary font-bold">Detalle</Button>
                 </div>
               </CardContent>
            </Card>
          ))
        ) : (
          <div className="col-span-full py-20 bg-slate-50 rounded-2xl border border-dashed border-slate-200 flex flex-col items-center justify-center space-y-2">
             <Building2 className="w-8 h-8 text-slate-300" />
             <p className="text-sm font-medium text-slate-500 uppercase tracking-tight">No hay proveedores en tu directorio</p>
          </div>
        )}
      </div>
    </div>
  )
}
