'use client'

import React, { useState } from 'react'
import { 
  ShoppingCart, 
  Package, 
  Truck, 
  CheckCircle2, 
  Clock, 
  AlertTriangle, 
  Plus, 
  Search, 
  Filter, 
  ArrowRight, 
  MoreVertical,
  Cpu,
  ShieldCheck,
  User,
  Calendar,
  DollarSign,
  Loader2,
  FileText,
  MapPin,
  Barcode
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import useSWR from 'swr'
import { toast } from 'sonner'
import { motion, AnimatePresence } from 'framer-motion'

const fetcher = (url: string) => fetch(url).then(res => {
  if (!res.ok) throw new Error('Failed to fetch')
  return res.json()
})

export default function VentasDashboard() {
  const [section, setSection] = useState('pedidos')
  const { data: orders, mutate } = useSWR('/api/erp/sales/orders', fetcher)

  const stats = [
    { label: 'Pedidos Hoy', value: '14', icon: ShoppingCart, color: 'text-blue-600', bg: 'bg-blue-50' },
    { label: 'En Producción', value: '8', icon: Cpu, color: 'text-indigo-600', bg: 'bg-indigo-50' },
    { label: 'Listos Despacho', value: '12', icon: Package, color: 'text-emerald-600', bg: 'bg-emerald-50' },
    { label: 'En Ruta', value: '5', icon: Truck, color: 'text-amber-600', bg: 'bg-amber-50' },
  ]

  return (
    <div className="p-6 space-y-8 bg-[#f8fafc] min-h-screen">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-slate-900 uppercase">Hub de Ventas y Orquestación</h1>
          <p className="text-slate-500 font-medium">Gestión E2E: Desde el pedido hasta la entrega final.</p>
        </div>
        <div className="flex items-center gap-3">
           <Button className="rounded-xl font-black uppercase text-[10px] bg-white text-slate-900 border-slate-200 hover:bg-slate-50 shadow-sm">
             <FileText className="w-4 h-4 mr-2" />
             Reporte Margen
           </Button>
           <Button className="rounded-xl font-black uppercase text-[10px] bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-200">
             <Plus className="w-4 h-4 mr-2" />
             Nuevo Pedido
           </Button>
        </div>
      </div>

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

      <div className="flex bg-slate-100 p-1 rounded-2xl w-fit">
        {[
          { id: 'pedidos', label: 'Pedidos Activos', icon: ShoppingCart },
          { id: 'orquestacion', label: 'Orquestador IA', icon: Cpu },
          { id: 'logistica', label: 'Despachos', icon: Truck },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setSection(tab.id)}
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
          {section === 'pedidos' && <SalesOrderList orders={orders} />}
          {section === 'orquestacion' && <OrchestrationMonitor orders={orders} />}
          {section === 'logistica' && <LogisticsMonitor />}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

function SalesOrderList({ orders }: { orders: any[] }) {
  const displayOrders = Array.isArray(orders) ? orders : [
    { 
      id: '1', 
      batchNumber: 'SO-8921', 
      contact: { nombre: 'TechCorp Solutions' }, 
      totalPrice: 12500, 
      status: 'PROCESSING', 
      priority: 'URGENT', 
      createdAt: new Date().toISOString(), 
      grossMargin: 24.5,
      marginAlert: false,
      promise: { promisedDate: new Date(Date.now() + 259200000).toISOString(), confidenceScore: 0.98 } 
    },
    { 
      id: '2', 
      batchNumber: 'SO-8922', 
      contact: { nombre: 'Solar Dynamics' }, 
      totalPrice: 4500, 
      status: 'QUOTED', 
      priority: 'NORMAL', 
      createdAt: new Date().toISOString(), 
      grossMargin: 8.2,
      marginAlert: true,
      promise: { promisedDate: new Date(Date.now() + 86400000).toISOString(), confidenceScore: 0.92 } 
    },
  ]

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      <Card className="lg:col-span-8 border-none shadow-sm">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg font-bold uppercase">Cartera de Pedidos</CardTitle>
              <CardDescription>Seguimiento de cumplimiento y compromisos.</CardDescription>
            </div>
            <div className="flex gap-2">
              <Input placeholder="Buscar pedido..." className="w-64 h-9 rounded-xl text-xs" />
              <Button variant="outline" size="icon" className="h-9 w-9 rounded-xl"><Filter className="w-4 h-4" /></Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {displayOrders.map((order: any) => (
              <div key={order.id} className="p-5 rounded-2xl bg-white border border-slate-100 group hover:border-indigo-200 hover:shadow-lg hover:shadow-indigo-50/50 transition-all">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="h-12 w-12 rounded-xl bg-slate-50 flex items-center justify-center text-primary font-black border border-slate-100 shadow-sm">
                      {order.batchNumber.split('-')[1]}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-bold text-sm tracking-tight">{order.contact?.nombre}</h4>
                        <Badge className={`text-[8px] font-black uppercase ${
                          order.priority === 'URGENT' ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'
                        }`}>{order.priority}</Badge>
                      </div>
                      <p className="text-[10px] text-muted-foreground font-black uppercase tracking-widest mt-0.5">
                        Pedido #{order.batchNumber} • {new Date(order.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-8">
                    {order.promise && (
                      <div className="hidden xl:block">
                        <p className="text-[9px] font-black text-slate-400 uppercase">Promesa Entrega</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-[10px] font-black text-slate-900">{new Date(order.promise.promisedDate).toLocaleDateString()}</span>
                          <Badge className="bg-emerald-50 text-emerald-600 border-none text-[8px] h-4">
                            {(order.promise.confidenceScore * 100).toFixed(0)}% CONF.
                          </Badge>
                        </div>
                      </div>
                    )}
                    <div className="text-right">
                       <p className="text-[9px] font-black text-slate-400 uppercase">Margen Est.</p>
                       <div className="flex items-center gap-2">
                          <p className={`text-sm font-black ${order.marginAlert ? 'text-rose-500' : 'text-emerald-500'}`}>
                             {order.grossMargin?.toFixed(1)}%
                          </p>
                          {order.marginAlert && (
                            <AlertTriangle className="w-3.5 h-3.5 text-rose-500 animate-pulse" />
                          )}
                       </div>
                    </div>
                    <div className="text-right min-w-[100px]">
                       <p className="text-[9px] font-black text-slate-400 uppercase">Total Pedido</p>
                       <p className="text-sm font-black text-slate-900">${order.totalPrice.toLocaleString()}</p>
                    </div>
                    <div className="flex items-center gap-3">
                       <Badge className={`rounded-full px-3 py-1 font-black text-[9px] uppercase border-none ${
                         order.status === 'SHIPPED' ? 'bg-emerald-50 text-emerald-600' : 'bg-indigo-50 text-indigo-600'
                       }`}>
                         {order.status === 'SHIPPED' ? <Truck className="w-3 h-3 mr-1" /> : <Clock className="w-3 h-3 mr-1" />}
                         {order.status}
                       </Badge>
                       <Button variant="ghost" size="icon" className="rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
                         <MoreVertical className="w-4 h-4" />
                       </Button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="lg:col-span-4 space-y-6">
        <Card className="border-none shadow-sm bg-indigo-950 text-white overflow-hidden relative">
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <Cpu className="w-24 h-24" />
          </div>
          <CardHeader>
             <div className="flex items-center gap-2 mb-2">
                <Cpu className="h-4 w-4 text-primary" />
                <span className="text-[10px] font-black uppercase tracking-widest text-primary">Gemma Sales Orchestrator</span>
             </div>
             <CardTitle className="text-xl font-bold tracking-tight">Análisis de Demanda</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
             <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                <p className="text-xs text-slate-300 leading-relaxed italic">
                   "He detectado un pico de demanda en Inversores Smart. Sugiero adelantar la producción de 20 unidades antes del viernes para evitar retrasos en SO-8921."
                </p>
             </div>
             <div className="space-y-3">
                <div className="flex items-center justify-between text-[10px] font-black uppercase">
                   <span className="text-slate-400">Nivel de Servicio Est.</span>
                   <span className="text-emerald-400">98.2%</span>
                </div>
                <div className="flex items-center justify-between text-[10px] font-black uppercase">
                   <span className="text-slate-400">Riesgo de Quiebre</span>
                   <span className="text-red-400">BAJO</span>
                </div>
             </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function OrchestrationMonitor({ orders }: { orders: any[] }) {
  const allItems = (Array.isArray(orders) ? orders : []).flatMap(order => 
    (order.items || []).map((item: any) => ({
      ...item,
      orderBatch: order.batchNumber
    }))
  ).filter((item: any) => item.orchestrationStrategy);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <Card className="lg:col-span-2 border-none shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg font-bold uppercase">Motor de Decisión Operativa</CardTitle>
          <CardDescription>Visualización de la estrategia de cumplimiento por ítem.</CardDescription>
        </CardHeader>
        <CardContent>
           <div className="space-y-6">
              {allItems.length === 0 ? (
                <p className="text-sm text-slate-500">No hay ítems con orquestación activa.</p>
              ) : allItems.map((item: any, i: number) => (
                <div key={item.id || i} className="relative pl-8 border-l-2 border-slate-100 pb-6 last:pb-0">
                  <div className="absolute left-[-9px] top-0 h-4 w-4 rounded-full bg-white border-2 border-indigo-600 shadow-sm" />
                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 flex items-center justify-between">
                    <div>
                      <h4 className="font-bold text-sm">{item.catalogItem?.nombre || 'Ítem'}</h4>
                      <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">
                        Pedido {item.orderBatch} • Cantidad: {item.quantity} unidades
                      </p>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="text-[9px] font-black text-slate-400 uppercase">Estrategia</p>
                        <Badge className={`text-[9px] font-black ${
                          item.orchestrationStrategy === 'STOCK' ? 'bg-emerald-50 text-emerald-600' : 'bg-indigo-50 text-indigo-600'
                        } border-none`}>{item.orchestrationStrategy}</Badge>
                      </div>
                      <div className="h-10 w-10 rounded-xl bg-white border border-slate-100 flex items-center justify-center">
                        {item.orchestrationStrategy === 'STOCK' ? <Barcode className="w-5 h-5 text-emerald-600" /> : <Cpu className="w-5 h-5 text-indigo-600" />}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
           </div>
        </CardContent>
      </Card>
      
      <div className="space-y-6">
        <Card className="border-none shadow-sm bg-slate-950 text-white p-6">
           <div className="flex items-center gap-3 mb-6">
              <ShieldCheck className="w-8 h-8 text-primary" />
              <div>
                <h4 className="font-bold text-sm">Garantía de Suministro</h4>
                <p className="text-[10px] text-slate-400 font-black uppercase">Filtro de integridad</p>
              </div>
           </div>
           <p className="text-xs text-slate-300 leading-relaxed mb-6">
             El orquestador solo permite prometer ítems que tienen lotes en estado <b>AVAILABLE</b> o capacidad de línea confirmada para la semana en curso.
           </p>
           <div className="space-y-4">
              <div className="flex items-center gap-2 text-[10px] font-black uppercase text-emerald-400">
                <CheckCircle2 className="w-3 h-3" /> Bloqueo Atómico Activo
              </div>
              <div className="flex items-center gap-2 text-[10px] font-black uppercase text-emerald-400">
                <CheckCircle2 className="w-3 h-3" /> Validación Calidad E2E
              </div>
           </div>
        </Card>
      </div>
    </div>
  )
}

function LogisticsMonitor() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <Card className="lg:col-span-2 border-none shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg font-bold uppercase">Monitor de Despachos</CardTitle>
          <CardDescription>Preparación de salida y seguimiento de ruta.</CardDescription>
        </CardHeader>
        <CardContent>
           <div className="space-y-4">
              {[
                { id: 'SHP-1234', order: 'SO-8921', carrier: 'Volkern Fleet', status: 'SHIPPED', dest: 'Veracruz, MX' },
                { id: 'SHP-1235', order: 'SO-8922', carrier: 'DHL Express', status: 'DELIVERED', dest: 'Madrid, ES' },
              ].map((shp, i) => (
                <div key={i} className="p-4 rounded-2xl bg-white border border-slate-100 flex items-center justify-between group">
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-400">
                       <Truck className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="font-bold text-sm tracking-tight">{shp.id}</h4>
                      <p className="text-[10px] text-muted-foreground font-black uppercase tracking-widest">Pedido {shp.order} • {shp.dest}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="text-right hidden md:block">
                       <p className="text-[9px] font-black text-slate-400 uppercase">Transportista</p>
                       <p className="text-[10px] font-bold text-slate-900">{shp.carrier}</p>
                    </div>
                    <Badge className={`text-[9px] font-black uppercase ${
                      shp.status === 'DELIVERED' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'
                    }`}>{shp.status}</Badge>
                    <Button variant="ghost" size="icon" className="rounded-full"><ArrowRight className="w-4 h-4" /></Button>
                  </div>
                </div>
              ))}
           </div>
        </CardContent>
      </Card>
      
      <div className="space-y-6">
        <Card className="border-none shadow-sm overflow-hidden">
           <div className="h-32 bg-slate-200 relative">
              <div className="absolute inset-0 flex items-center justify-center text-slate-400 flex-col gap-2">
                 <MapPin className="w-6 h-6" />
                 <span className="text-[9px] font-black uppercase">Mapa de Entregas Activo</span>
              </div>
           </div>
           <CardContent className="p-6">
              <h4 className="font-bold text-sm mb-2">Zonas de Mayor Actividad</h4>
              <div className="space-y-3">
                 <div className="flex items-center justify-between text-[10px] font-black uppercase">
                    <span className="text-slate-400">Ciudad de México</span>
                    <span>42%</span>
                 </div>
                 <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-indigo-500 w-[42%]" />
                 </div>
              </div>
           </CardContent>
        </Card>
      </div>
    </div>
  )
}
