'use client'

import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { History, ArrowRightLeft, ArrowUpCircle, ArrowDownCircle, Search, Filter } from "lucide-react"
import useSWR from "swr"

const fetcher = (url: string) => fetch(url).then(res => res.json())

export default function MovimientosPage() {
  // Nota: En una app real, este endpoint debería soportar paginación y filtros
  const { data: movements, isLoading } = useSWR('/api/erp/inventory/movements', fetcher)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black tracking-tight uppercase">Historial de Movimientos</h1>
          <p className="text-muted-foreground font-medium">Auditoría completa de transacciones de inventario.</p>
        </div>
      </div>

      <div className="flex gap-4">
        <div className="flex-1 relative">
           <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
           <input className="w-full bg-slate-100 border-none rounded-xl pl-10 pr-4 py-3 text-sm font-medium" placeholder="Filtrar por SKU o referencia..." />
        </div>
        <Button variant="outline" className="rounded-xl border-none bg-slate-100 font-bold text-xs uppercase"><Filter className="w-3 h-3 mr-2"/> Todo el historial</Button>
      </div>

      <Card className="border-none shadow-sm overflow-hidden">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b bg-slate-50/50">
                  <th className="px-6 py-4 text-[10px] font-black uppercase text-muted-foreground tracking-widest text-center">Tipo</th>
                  <th className="px-6 py-4 text-[10px] font-black uppercase text-muted-foreground tracking-widest">Fecha</th>
                  <th className="px-6 py-4 text-[10px] font-black uppercase text-muted-foreground tracking-widest">Producto</th>
                  <th className="px-6 py-4 text-[10px] font-black uppercase text-muted-foreground tracking-widest">Almacén</th>
                  <th className="px-6 py-4 text-[10px] font-black uppercase text-muted-foreground tracking-widest text-right">Cantidad</th>
                  <th className="px-6 py-4 text-[10px] font-black uppercase text-muted-foreground tracking-widest">Motivo</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {isLoading ? (
                  <tr><td colSpan={6} className="px-6 py-10 text-center font-bold uppercase text-muted-foreground text-xs">Cargando historial...</td></tr>
                ) : (movements && movements.length > 0) ? (
                  movements.map((m: any) => (
                    <tr key={m.id} className="hover:bg-slate-50 transition-colors group">
                      <td className="px-6 py-4">
                        <div className="flex justify-center">
                           {m.type === 'IN' && <ArrowUpCircle className="w-5 h-5 text-emerald-500" />}
                           {m.type === 'OUT' && <ArrowDownCircle className="w-5 h-5 text-rose-500" />}
                           {m.type === 'TRANSFER' && <ArrowRightLeft className="w-5 h-5 text-blue-500" />}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-xs font-bold text-slate-500 uppercase">{new Date(m.createdAt).toLocaleString()}</td>
                      <td className="px-6 py-4">
                         <div className="flex flex-col">
                           <span className="text-sm font-bold tracking-tight">{m.catalogoItem?.nombre}</span>
                           <span className="text-[10px] font-black text-muted-foreground uppercase">{m.catalogoItem?.sku}</span>
                         </div>
                      </td>
                      <td className="px-6 py-4">
                         <Badge variant="outline" className="rounded-lg border-none bg-slate-100 text-slate-600 font-bold uppercase text-[9px]">
                           {m.warehouse?.name}
                         </Badge>
                      </td>
                      <td className="px-6 py-4 text-right">
                         <span className={`text-sm font-black tracking-tighter ${m.type === 'IN' ? 'text-emerald-600' : 'text-rose-500'}`}>
                           {m.type === 'IN' ? '+' : '-'}{m.quantity}
                         </span>
                      </td>
                      <td className="px-6 py-4 text-xs font-medium text-slate-500 max-w-xs truncate">{m.reason || '-'}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="px-6 py-20 text-center flex flex-col items-center justify-center space-y-2">
                       <History className="w-8 h-8 text-slate-300 mx-auto" />
                       <p className="text-sm font-bold text-slate-400 uppercase tracking-tight italic">No hay registros de movimientos aún</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

import { Button } from "@/components/ui/button"
