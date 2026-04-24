'use client'

import { useState } from 'react'
import { 
  Package, 
  Warehouse as WarehouseIcon, 
  ArrowUpRight, 
  ArrowDownRight,
  TrendingUp,
  AlertTriangle,
  History,
  Box,
  Truck,
  Plus,
  BarChart3,
  Search,
  Filter,
  CheckCircle2,
  Clock
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import useSWR from 'swr'

const fetcher = (url: string) => fetch(url).then(res => res.json())

export default function InventarioDashboard() {
  const { data: stockLevels, isLoading: loadingStock, error: stockError } = useSWR('/api/erp/inventory', fetcher)
  const [filter, setFilter] = useState('')

  // Cálculo de estadísticas dinámicas
  const isStockArray = Array.isArray(stockLevels)
  const totalUnits = isStockArray ? stockLevels.reduce((acc: number, item: any) => acc + item.quantity, 0) : 0
  const totalValue = isStockArray ? stockLevels.reduce((acc: number, item: any) => acc + (item.quantity * (item.catalogoItem?.precioBase || 0)), 0) : 0
  const activeWarehouses = isStockArray ? new Set(stockLevels.map((item: any) => item.warehouseId)).size : 0
  const lowStockCount = isStockArray ? stockLevels.filter((item: any) => item.quantity <= (item.minStock || 0)).length : 0

  const stats = [
    { 
      label: 'Existencias Totales', 
      value: totalUnits.toLocaleString(), 
      detail: 'Unidades físicas',
      icon: Box, 
      color: 'text-blue-500', 
      bg: 'bg-blue-500/10' 
    },
    { 
      label: 'Valor de Inventario', 
      value: `€${totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 
      detail: 'Costo total estimado',
      icon: TrendingUp, 
      color: 'text-emerald-500', 
      bg: 'bg-emerald-500/10' 
    },
    { 
      label: 'Almacenes Activos', 
      value: activeWarehouses.toString(), 
      detail: 'Sedes operativas',
      icon: WarehouseIcon, 
      color: 'text-purple-500', 
      bg: 'bg-purple-500/10' 
    },
    { 
      label: 'Ruptura de Stock', 
      value: lowStockCount.toString(), 
      detail: 'Items críticos',
      icon: AlertTriangle, 
      color: 'text-rose-500', 
      bg: 'bg-rose-500/10' 
    },
  ]

  const criticalAlerts = isStockArray ? stockLevels.filter((item: any) => item.quantity <= (item.minStock || 0))
    .slice(0, 3)
    .map((item: any) => ({
      name: item.catalogoItem.nombre,
      sku: item.catalogoItem.sku,
      current: item.quantity,
      min: item.minStock || 0,
      warehouse: item.warehouse.name
    })) : []

  return (
    <div className="space-y-8 pb-10">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-black tracking-tight uppercase">Inventario Hub</h1>
          <p className="text-muted-foreground font-medium">Control de existencias y logística multi-almacén.</p>
        </div>
        <div className="flex items-center gap-2">
           <Button variant="outline" className="rounded-xl font-bold uppercase text-xs tracking-wider">
            <Filter className="w-4 h-4 mr-2" /> Filtros
          </Button>
          <Button className="rounded-xl font-bold uppercase text-xs tracking-wider shadow-lg shadow-primary/20">
            <Plus className="w-4 h-4 mr-2" /> Ajustar Stock
          </Button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, i) => (
          <Card key={i} className="border-none shadow-sm group hover:shadow-md transition-all duration-300 overflow-hidden relative">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className={`p-2.5 rounded-xl ${stat.bg} ${stat.color}`}>
                  <stat.icon className="w-5 h-5" />
                </div>
                {stat.label.includes('Ruptura') && (
                   <div className="animate-ping h-2 w-2 rounded-full bg-rose-500" />
                )}
              </div>
              <div className="space-y-1">
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{stat.label}</p>
                <p className="text-2xl font-black tracking-tighter">{stat.value}</p>
                <p className="text-[10px] text-muted-foreground uppercase font-black opacity-50">{stat.detail}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Main Stock Table */}
        <Card className="lg:col-span-8 border-none shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-lg font-bold uppercase">Existencias Consolidadas</CardTitle>
              <CardDescription>Resumen de cantidades por almacén y producto.</CardDescription>
            </div>
            <div className="relative w-48">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input 
                className="w-full bg-slate-50 border-none rounded-lg pl-9 py-2 text-xs font-medium focus:ring-1 ring-primary/20" 
                placeholder="Buscar SKU o nombre..."
                onChange={(e) => setFilter(e.target.value)}
              />
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b bg-slate-50/50">
                    <th className="px-4 py-3 text-[10px] font-black uppercase text-muted-foreground tracking-widest leading-none">Producto</th>
                    <th className="px-4 py-3 text-[10px] font-black uppercase text-muted-foreground tracking-widest leading-none">Almacén</th>
                    <th className="px-4 py-3 text-[10px] font-black uppercase text-muted-foreground tracking-widest leading-none text-right">Cantidad</th>
                    <th className="px-4 py-3 text-[10px] font-black uppercase text-muted-foreground tracking-widest leading-none text-center">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                   {loadingStock ? (
                      <tr><td colSpan={4} className="px-4 py-10 text-center text-xs font-bold uppercase text-muted-foreground">Cargando existencias...</td></tr>
                   ) : stockError ? (
                      <tr><td colSpan={4} className="px-4 py-10 text-center text-xs font-bold uppercase text-rose-500">Error al cargar existencias</td></tr>
                   ) : (isStockArray && stockLevels.length > 0) ? (
                     stockLevels
                       .filter((item: any) => 
                         (item.catalogoItem?.nombre?.toLowerCase() || '').includes(filter.toLowerCase()) || 
                         (item.catalogoItem?.sku?.toLowerCase() || '').includes(filter.toLowerCase())
                       )
                       .map((item: any) => (
                       <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                         <td className="px-4 py-4">
                           <div className="flex flex-col">
                             <span className="text-sm font-bold tracking-tight">{item.catalogoItem.nombre}</span>
                             <span className="text-[10px] font-black text-muted-foreground uppercase">{item.catalogoItem.sku}</span>
                           </div>
                         </td>
                         <td className="px-4 py-4">
                            <div className="flex items-center gap-2">
                              <WarehouseIcon className="w-3 h-3 text-slate-400" />
                              <span className="text-xs font-bold text-slate-600 uppercase">{item.warehouse.name}</span>
                            </div>
                         </td>
                         <td className="px-4 py-4 text-right">
                            <span className="text-sm font-black tracking-tighter">{item.quantity} {item.catalogoItem.unidad}</span>
                         </td>
                         <td className="px-4 py-4">
                            <div className="flex justify-center">
                               <Badge variant="outline" className={`rounded-full border-none px-2 py-0.5 text-[9px] font-black uppercase ${item.quantity <= (item.minStock || 0) ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'}`}>
                                 {item.quantity <= (item.minStock || 0) ? 'Bajo Stock' : 'Disponible'}
                               </Badge>
                            </div>
                         </td>
                       </tr>
                     ))
                   ) : (
                     <tr>
                        <td colSpan={4} className="px-4 py-10 text-center">
                           <p className="text-sm font-medium text-slate-500">No hay existencias registradas.</p>
                        </td>
                     </tr>
                   )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Proactive Logistics (Gemma AI) */}
        <div className="lg:col-span-4 space-y-6">
           {/* Demand Prediction */}
           <Card className="border-none shadow-sm bg-slate-950 text-white overflow-hidden relative">
              <CardHeader className="relative z-10">
                <div className="flex items-center gap-2 mb-1">
                  <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                  <CardTitle className="text-sm font-bold uppercase tracking-widest text-primary">Gemma Predictions</CardTitle>
                </div>
                <CardTitle className="text-lg font-bold">Proyección de Ruptura</CardTitle>
              </CardHeader>
              <CardContent className="relative z-10 space-y-4">
                 <div className="p-4 rounded-xl bg-white/5 border border-white/10 space-y-3">
                    <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider">
                       <span>Velocidad de Venta</span>
                       <span className="text-primary">+24%</span>
                    </div>
                    <Progress value={85} className="h-1.5 bg-white/10 [&>div]:bg-primary" />
                    <p className="text-[11px] text-slate-400 leading-relaxed italic">
                      "La tendencia actual sugiere que <span className="text-white font-bold">3 items</span> críticos se agotarán en menos de <span className="text-primary font-bold">48 horas</span>."
                    </p>
                 </div>
                 <Button className="w-full rounded-xl text-[10px] font-bold uppercase tracking-widest py-5 bg-primary text-white hover:bg-primary/90"> Generar Orden de Compra Sugerida </Button>
              </CardContent>
              {/* Abstract Background for AI section */}
              <div className="absolute -bottom-10 -right-10 opacity-20">
                 <BarChart3 className="w-48 h-48 text-primary" />
              </div>
           </Card>

           {/* Critical Items Alerts */}
           <Card className="border-none shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-black uppercase tracking-wider flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-500" />
                  Alertas de Reposición
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                 {criticalAlerts.map((alert, i) => (
                   <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-rose-50 border border-rose-100 group">
                      <div className="flex flex-col">
                        <span className="text-xs font-bold text-rose-900 leading-tight">{alert.name}</span>
                        <span className="text-[10px] font-black text-rose-600 uppercase opacity-70">{alert.sku}</span>
                      </div>
                      <div className="text-right">
                         <span className="text-xs font-black text-rose-500">{alert.current}/{alert.min}u</span>
                      </div>
                   </div>
                 ))}
                 <Button variant="ghost" className="w-full text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:bg-slate-50">Gestionar Todo el Silo</Button>
              </CardContent>
           </Card>
        </div>
      </div>
    </div>
  )
}
