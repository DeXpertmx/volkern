'use client';

import { useState } from 'react';
import {
  Truck, Package, MapPin, BarChart3, TrendingUp,
  AlertTriangle, CheckCircle2, Ship, Wrench, ArrowRight, Loader2,
  Activity, HardDrive, Zap,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import useSWR from 'swr';
import { motion } from 'framer-motion';
import { AddVehicleDialog } from '@/components/hubs/AddVehicleDialog';

const fetcher = (url: string) => fetch(url).then(res => res.json());

function FleetStatusPanel() {
  const { data, isLoading } = useSWR('/api/erp/logistics/dashboard', fetcher);

  const kpis = data?.kpis || {
    totalShipments: 0,
    deliveredShipments: 0,
    inTransit: 0,
    monthlyShipments: 0,
    activeWarehouses: 0,
    deliveryRate: 0,
    totalStockUnits: 0,
  };

  const stats = [
    { label: 'Envíos Totales', value: kpis.totalShipments.toString(), icon: Ship, color: 'text-blue-400', bg: 'bg-blue-500/10' },
    { label: 'En Tránsito', value: kpis.inTransit.toString(), icon: Truck, color: 'text-amber-400', bg: 'bg-amber-500/10' },
    { label: 'Entregados', value: kpis.deliveredShipments.toString(), icon: CheckCircle2, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
    { label: 'Tasa Entrega', value: `${kpis.deliveryRate}%`, icon: TrendingUp, color: 'text-indigo-400', bg: 'bg-indigo-500/10' },
    { label: 'Almacenes', value: kpis.activeWarehouses.toString(), icon: Package, color: 'text-purple-400', bg: 'bg-purple-500/10' },
    { label: 'Unidades Stock', value: (kpis.totalStockUnits || 0).toLocaleString(), icon: HardDrive, color: 'text-cyan-400', bg: 'bg-cyan-500/10' },
  ];

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {[...Array(6)].map((_, i) => (
          <Card key={i} className="border-none shadow-sm animate-pulse">
            <CardContent className="p-6"><div className="h-16 bg-muted dark:bg-slate-100 rounded-xl" /></CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
      {stats.map((stat, i) => {
        const Icon = stat.icon;
        return (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: i * 0.05 }}
          >
            <Card className="border-none shadow-sm bg-card dark:bg-slate-900 hover:bg-accent dark:hover:bg-slate-800 transition-colors">
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className={`w-10 h-10 rounded-xl ${stat.bg} flex items-center justify-center`}>
                    <Icon className={`w-5 h-5 ${stat.color}`} />
                  </div>
                </div>
                <p className="text-2xl font-black text-foreground dark:text-white tracking-tight">{stat.value}</p>
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground dark:text-slate-500 mt-1">{stat.label}</p>
              </CardContent>
            </Card>
          </motion.div>
        );
      })}
    </div>
  );
}

function RecentShipments() {
  const { data, isLoading } = useSWR('/api/erp/logistics/shipments?limit=5', fetcher);

  const shipments = data?.shipments || [];

  const statusColor: Record<string, string> = {
    PREPARING: 'bg-slate-100 text-slate-600',
    SHIPPED: 'bg-blue-100 text-blue-600',
    DELIVERED: 'bg-emerald-100 text-emerald-600',
    CANCELLED: 'bg-red-100 text-red-600',
  };

  return (
    <Card className="border-none shadow-sm bg-card dark:bg-slate-900">
      <CardHeader className="flex flex-row items-center justify-between pb-4">
        <div>
          <CardTitle className="text-lg font-bold uppercase text-foreground dark:text-white tracking-tight">Envíos Recientes</CardTitle>
          <CardDescription className="text-muted-foreground dark:text-slate-400">Últimos movimientos logísticos</CardDescription>
        </div>
        <Button variant="outline" size="sm" className="text-[10px] font-black uppercase h-8 border-border text-foreground/80 dark:border-slate-700 dark:text-slate-300">
          Ver Todos
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center p-8">
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
          </div>
        ) : shipments.length === 0 ? (
          <div className="text-center p-8 bg-muted/50 dark:bg-slate-800/50 rounded-2xl border border-border dark:border-slate-700">
            <Truck className="w-8 h-8 text-muted-foreground/40 dark:text-slate-600 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground dark:text-slate-500 font-medium">No hay envíos registrados</p>
          </div>
        ) : (
          <div className="space-y-3">
            {shipments.map((s: any) => (
              <div key={s.id} className="flex items-center justify-between p-4 rounded-xl bg-muted/50 dark:bg-slate-800/50 border border-border/50 dark:border-slate-700/50 hover:border-primary/30 dark:hover:border-slate-600 transition-all">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-muted dark:bg-slate-800 flex items-center justify-center">
                    <Package className="w-5 h-5 text-muted-foreground dark:text-slate-400" />
                  </div>
                  <div>
                    <p className="font-bold text-sm text-foreground dark:text-white">{s.batchNumber}</p>
                    <p className="text-[10px] text-muted-foreground dark:text-slate-500 font-bold uppercase tracking-widest">
                      {s.carrier || 'Sin transportista'} • {s.trackingNumber || 'Sin tracking'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <Badge className={`border-none text-[9px] font-black uppercase px-2.5 py-1 ${statusColor[s.status] || 'bg-muted text-muted-foreground dark:bg-slate-100 dark:text-slate-600'}`}>
                    {s.status === 'PREPARING' ? 'Preparando' : s.status === 'SHIPPED' ? 'En tránsito' : s.status === 'DELIVERED' ? 'Entregado' : s.status}
                  </Badge>
                  <ArrowRight className="w-4 h-4 text-muted-foreground/40 dark:text-slate-600" />
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AIInsights() {
  const insights = [
    {
      icon: Wrench,
      title: 'Mantenimiento Preventivo',
      description: '2 vehículos requieren mantenimiento programado esta semana. Revisa el calendario de flota.',
      color: 'text-amber-400',
      bg: 'bg-amber-500/10',
      border: 'border-amber-500/20',
    },
    {
      icon: TrendingUp,
      title: 'Optimización de Rutas',
      description: 'Agrupar entregas en zona norte puede reducir un 15% los costes de combustible esta semana.',
      color: 'text-emerald-400',
      bg: 'bg-emerald-500/10',
      border: 'border-emerald-500/20',
    },
    {
      icon: AlertTriangle,
      title: 'Alertas de Capacidad',
      description: 'El almacén central está al 85% de capacidad. Considera rotar stock de baja rotación.',
      color: 'text-orange-400',
      bg: 'bg-orange-500/10',
      border: 'border-orange-500/20',
    },
  ];

  return (
    <Card className="border-none shadow-sm bg-gradient-to-br from-slate-900 to-slate-950 overflow-hidden relative">
      <div className="absolute top-0 right-0 p-4 opacity-5">
        <Zap className="w-32 h-32" />
      </div>
      <CardHeader>
        <div className="flex items-center gap-2 mb-2">
          <Activity className="h-4 w-4 text-primary" />
          <span className="text-[10px] font-black uppercase tracking-widest text-primary">Gemma Logistics AI</span>
        </div>
        <CardTitle className="text-xl font-bold text-white tracking-tight">Insights Logísticos</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {insights.map((insight, i) => {
          const Icon = insight.icon;
          return (
            <div key={i} className={`p-4 rounded-xl ${insight.bg} ${insight.border} border`}>
              <div className="flex items-center gap-3 mb-2">
                <Icon className={`w-4 h-4 ${insight.color}`} />
                <span className={`text-[10px] font-black uppercase ${insight.color}`}>{insight.title}</span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed italic">"{insight.description}"</p>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function FleetOverview() {
  const { data, isLoading, mutate } = useSWR('/api/erp/logistics/fleet', fetcher);
  const [dialogOpen, setDialogOpen] = useState(false);

  const vehicles = data?.vehicles || [];

  const statusStyles: Record<string, string> = {
    ACTIVE: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    MAINTENANCE: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    INACTIVE: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
    RETIRED: 'bg-red-500/20 text-red-400 border-red-500/30',
  };

  return (
    <Card className="border-none shadow-sm bg-card dark:bg-slate-900">
      <CardHeader className="flex flex-row items-center justify-between pb-4">
        <div>
          <CardTitle className="text-lg font-bold uppercase text-foreground dark:text-white tracking-tight">Flota Activa</CardTitle>
          <CardDescription className="text-muted-foreground dark:text-slate-400">Vehículos y estado operativo</CardDescription>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setDialogOpen(true)}
          className="text-[10px] font-black uppercase h-8 border-border text-foreground/80 dark:border-slate-700 dark:text-slate-300"
        >
          <Truck className="w-3.5 h-3.5 mr-1.5" />
          Añadir Vehículo
        </Button>
        <AddVehicleDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          onSuccess={() => mutate()}
        />
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center p-8">
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
          </div>
        ) : vehicles.length === 0 ? (
          <div className="text-center p-8 bg-muted/50 dark:bg-slate-800/50 rounded-2xl border border-border dark:border-slate-700">
            <HardDrive className="w-8 h-8 text-muted-foreground/40 dark:text-slate-600 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground dark:text-slate-500 font-medium">No hay vehículos registrados</p>
          </div>
        ) : (
          <div className="space-y-3">
            {vehicles.slice(0, 5).map((v: any) => (
              <div key={v.id} className="flex items-center justify-between p-3 rounded-xl bg-muted/50 dark:bg-slate-800/50 border border-border/50 dark:border-slate-700/50 hover:border-primary/30 dark:hover:border-slate-600 transition-all">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-muted dark:bg-slate-800 flex items-center justify-center">
                    <Truck className="w-5 h-5 text-muted-foreground dark:text-slate-400" />
                  </div>
                  <div>
                    <p className="font-bold text-sm text-foreground dark:text-white">{v.plate}</p>
                    <p className="text-[10px] text-muted-foreground dark:text-slate-500 font-bold uppercase tracking-widest">{v.brand} {v.model} • {v.year}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-[10px] text-muted-foreground dark:text-slate-500 font-bold">{v.currentKm?.toLocaleString()} km</span>
                  <Badge className={`border text-[9px] font-black uppercase px-2 py-0.5 ${statusStyles[v.status] || 'bg-slate-500/20 text-slate-400'}`}>
                    {v.status === 'ACTIVE' ? 'Activo' : v.status === 'MAINTENANCE' ? 'Mantenimiento' : v.status === 'INACTIVE' ? 'Inactivo' : v.status}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function LogisticaDashboard() {
  return (
    <div className="space-y-8 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-yellow-500/10 border border-yellow-500/20 flex items-center justify-center">
              <Truck className="w-5 h-5 text-yellow-400" />
            </div>
            <div>
              <h1 className="text-2xl font-black uppercase tracking-tight text-foreground dark:text-white">Logística Hub</h1>
              <p className="text-xs font-bold text-muted-foreground dark:text-slate-500 uppercase tracking-widest">Control de flota, almacenes y envíos</p>
            </div>
          </div>
        </div>
        <div className="flex gap-3">
          <Badge className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-black uppercase px-3 py-1">
            <Activity className="w-3 h-3 mr-1.5" /> En Vivo
          </Badge>
        </div>
      </div>

      {/* KPIs */}
      <FleetStatusPanel />

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Shipments */}
        <div className="lg:col-span-2">
          <RecentShipments />
        </div>

        {/* AI Insights */}
        <div>
          <AIInsights />
        </div>
      </div>

      {/* Fleet + Map Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Fleet Overview */}
        <div className="lg:col-span-2">
          <FleetOverview />
        </div>

        {/* Quick Actions */}
        <Card className="border-none shadow-sm bg-gradient-to-b from-card to-muted dark:from-slate-900 dark:to-slate-950">
          <CardHeader>
            <CardTitle className="text-lg font-bold uppercase text-foreground dark:text-white tracking-tight">Acciones Rápidas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button className="w-full justify-start bg-muted hover:bg-accent dark:bg-slate-800 dark:hover:bg-slate-700 text-foreground dark:text-white border-none h-12 rounded-xl font-bold text-xs">
              <Package className="w-4 h-4 mr-3 text-yellow-400" />
              Registrar Recepción
            </Button>
            <Button className="w-full justify-start bg-muted hover:bg-accent dark:bg-slate-800 dark:hover:bg-slate-700 text-foreground dark:text-white border-none h-12 rounded-xl font-bold text-xs">
              <Ship className="w-4 h-4 mr-3 text-blue-400" />
              Crear Envío
            </Button>
            <Button className="w-full justify-start bg-muted hover:bg-accent dark:bg-slate-800 dark:hover:bg-slate-700 text-foreground dark:text-white border-none h-12 rounded-xl font-bold text-xs">
              <MapPin className="w-4 h-4 mr-3 text-emerald-400" />
              Tracking GPS
            </Button>
            <Button className="w-full justify-start bg-muted hover:bg-accent dark:bg-slate-800 dark:hover:bg-slate-700 text-foreground dark:text-white border-none h-12 rounded-xl font-bold text-xs">
              <Wrench className="w-4 h-4 mr-3 text-amber-400" />
              Programar Mantenimiento
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
