'use client';

import { useState, useCallback, useMemo } from 'react';
import {
  MapPin, Truck, Package, Search, Loader2,
  Navigation, Clock, CheckCircle2, Globe, FileText,
  Layers, Filter,
} from 'lucide-react';
import dynamic from 'next/dynamic';

// Dynamic import for LogisticaTrackMap (Leaflet needs window object)
const LogisticaTrackMap = dynamic(
  () => import('./LogisticaTrackMap'),
  {
    ssr: false,
    loading: () => (
      <div className="aspect-[21/9] rounded-2xl bg-muted dark:bg-slate-800 border border-border dark:border-slate-700 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-yellow-400" />
      </div>
    ),
  }
);
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import useSWR from 'swr';
import { motion } from 'framer-motion';

const fetcher = (url: string) => fetch(url).then(res => res.json());

const ICON_MAP: Record<string, React.ComponentType<any>> = {
  Truck,
  CheckCircle2,
  Navigation,
  Package,
  FileText,
};

const COLOR_MAP: Record<string, string> = {
  'text-blue-400': 'text-blue-400',
  'text-emerald-400': 'text-emerald-400',
  'text-amber-400': 'text-amber-400',
  'text-violet-400': 'text-violet-400',
  'text-slate-400': 'text-slate-400',
};

export default function TrackingDashboard() {
  const [search, setSearch] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'in_transit' | 'delivered' | 'pending'>('all');

  const { data, isLoading } = useSWR(
    searchQuery
      ? `/api/erp/logistics/tracking?search=${encodeURIComponent(searchQuery)}`
      : '/api/erp/logistics/tracking',
    fetcher
  );

  const handleSearch = useCallback(() => {
    setSearchQuery(search.trim());
  }, [search]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch();
  }, [handleSearch]);

  const events = data?.events || [];
  const foundShipment = data?.found;
  const pagination = data?.pagination;

  // Summary stats from events
  const inTransit = events.filter((e: any) => e.type === 'TRANSIT' || e.type === 'DISPATCH').length;
  const delivered = events.filter((e: any) => e.type === 'DELIVERY' || e.type === 'CONFIRMATION').length;

  // ─── Count filtered routes ───
  const routesCountLabel = useMemo(() => {
    const allRoutes = data?.routes || []
    if (statusFilter === 'all') return `${allRoutes.length} rutas`
    const statusMap: Record<string, string[]> = {
      in_transit: ['SHIPPED'],
      delivered: ['DELIVERED'],
      pending: ['PENDING', 'PREPARING', 'PROCESSING'],
    }
    const allowed = statusMap[statusFilter] || []
    const count = allRoutes.filter((r: any) => allowed.includes(r.status)).length
    return `${count} rutas`
  }, [data?.routes, statusFilter])

  return (
    <div className="space-y-8 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-yellow-500/10 border border-yellow-500/20 flex items-center justify-center">
              <MapPin className="w-5 h-5 text-yellow-400" />
            </div>
            <div>
              <h1 className="text-2xl font-black uppercase tracking-tight text-foreground dark:text-white">Tracking GPS</h1>
              <p className="text-xs font-bold text-muted-foreground dark:text-slate-500 uppercase tracking-widest">Localización de envíos y vehículos en tiempo real</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tracking Search */}
      <Card className="border-none shadow-sm bg-gradient-to-br from-card to-muted dark:from-slate-900 dark:to-slate-950 overflow-hidden">
        <CardHeader>
          <CardTitle className="text-xl font-bold text-foreground dark:text-white tracking-tight">Seguimiento de Envíos</CardTitle>
          <CardDescription className="text-muted-foreground dark:text-slate-400">Ingresa el número de tracking o referencia del pedido</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <Input
                placeholder="Número de tracking o referencia..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={handleKeyDown}
                className="pl-10 bg-muted dark:bg-slate-800 border-border dark:border-slate-700 text-foreground dark:text-white placeholder:text-muted-foreground/60 dark:placeholder:text-slate-600 rounded-xl h-12 text-sm"
              />
            </div>
            <Button
              onClick={handleSearch}
              className="bg-yellow-600 hover:bg-yellow-500 text-white font-black uppercase text-[10px] h-12 px-6 rounded-xl gap-2"
            >
              <Navigation className="w-4 h-4" />
              Rastrear
            </Button>
          </div>

          {/* Search Result */}
          {searchQuery && !isLoading && data && (
            <div className="mt-4 p-4 rounded-xl bg-muted/50 dark:bg-slate-800/50 border border-border/50 dark:border-slate-700/50">
              {foundShipment ? (
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                  <div>
                    <p className="text-sm font-bold text-foreground dark:text-white">
                      Envío {data.shipment?.batchNumber || data.shipment?.trackingNumber} encontrado
                    </p>
                    <p className="text-[10px] font-bold text-muted-foreground dark:text-slate-500 uppercase tracking-wider">
                      {data.shipment?.status} {data.shipment?.carrier ? `— ${data.shipment.carrier}` : ''}
                    </p>
                  </div>
                  <Badge className="ml-auto bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[9px] font-black uppercase">
                    {events.length} eventos
                  </Badge>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <Search className="w-5 h-5 text-amber-400" />
                  <p className="text-sm font-bold text-amber-400">
                    {data.message || 'No se encontró ningún envío con ese número de tracking.'}
                  </p>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'En tránsito', value: isLoading ? '...' : inTransit, icon: Navigation, color: 'text-amber-400' },
          { label: 'Entregados', value: isLoading ? '...' : delivered, icon: CheckCircle2, color: 'text-emerald-400' },
          { label: 'Total Tracking', value: isLoading ? '...' : pagination?.total || events.length, icon: MapPin, color: 'text-blue-400' },
        ].map((stat, i) => {
          const Icon = stat.icon;
          return (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <Card className="border-none shadow-sm bg-card dark:bg-slate-900">
                <CardContent className="p-5">
                  <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-xl bg-muted dark:bg-slate-800 flex items-center justify-center border border-border dark:border-slate-700 ${stat.color}`}>
                      <Icon className="w-6 h-6" />
                    </div>
                    <div>
                      <p className={`text-2xl font-black tracking-tight ${stat.color}`}>{stat.value}</p>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground dark:text-slate-500">{stat.label}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>

      {/* Status Filter Bar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-2 p-1 bg-muted/80 dark:bg-slate-800/80 rounded-xl border border-border/50 dark:border-slate-700/50">
          <Filter className="w-3.5 h-3.5 text-slate-500 ml-2" />
          {[
            { key: 'all' as const, label: 'Todas', color: 'bg-slate-500' },
            { key: 'in_transit' as const, label: 'En tránsito', color: 'bg-amber-500' },
            { key: 'delivered' as const, label: 'Entregadas', color: 'bg-emerald-500' },
            { key: 'pending' as const, label: 'Pendientes', color: 'bg-blue-500' },
          ].map((opt) => (
            <button
              key={opt.key}
              onClick={() => setStatusFilter(opt.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all duration-150 ${
                statusFilter === opt.key
                  ? 'bg-yellow-500/20 text-yellow-400 shadow-sm'
                  : 'text-muted-foreground dark:text-slate-500 hover:text-foreground dark:hover:text-slate-300 hover:bg-accent dark:hover:bg-slate-700/50'
              }`}
            >
              <div className={`w-2 h-2 rounded-full ${opt.color}`} />
              {opt.label}
            </button>
          ))}
        </div>
        <div className="text-[9px] font-bold text-muted-foreground/60 dark:text-slate-600 uppercase tracking-wider">
          {routesCountLabel}
        </div>
      </div>

      {/* Live Tracking Map */}
      <Card className="border-none shadow-sm bg-card dark:bg-slate-900 overflow-hidden">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg font-bold uppercase text-foreground dark:text-white tracking-tight flex items-center gap-2">
                <Layers className="w-4 h-4 text-yellow-400" />
                Mapa de Tracking en Vivo
              </CardTitle>
              <CardDescription className="text-muted-foreground dark:text-slate-400 text-[11px]">
                {events.length > 0
                  ? `${events.filter((e: any) => e.type === 'TRANSIT' || e.type === 'DISPATCH').length} vehículos en ruta`
                  : 'Visualización de rutas y posiciones en tiempo real'
                }
              </CardDescription>
            </div>
            <div className="hidden md:flex items-center gap-2">
              {/* Legend */}
              {[
                { label: 'Despachado', color: '#3b82f6' },
                { label: 'Tránsito', color: '#f59e0b' },
                { label: 'Entregado', color: '#22c55e' },
                { label: 'POD', color: '#a855f7' },
              ].map((item) => (
                <div key={item.label} className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ background: item.color }} />
                  <span className="text-[9px] font-bold uppercase text-muted-foreground dark:text-slate-500 tracking-wider">{item.label}</span>
                </div>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <LogisticaTrackMap
            events={events}
            routes={data?.routes}
            height="420px"
            statusFilter={statusFilter}
          />
        </CardContent>
      </Card>

      {/* Recent Tracking Events */}
      <Card className="border-none shadow-sm bg-card dark:bg-slate-900">
        <CardHeader className="pb-4 border-b border-border dark:border-slate-800">
          <CardTitle className="text-lg font-bold uppercase text-foreground dark:text-white tracking-tight">
            Eventos de Tracking Recientes
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          {isLoading ? (
            <div className="flex items-center justify-center p-12">
              <Loader2 className="w-6 h-6 animate-spin text-yellow-400" />
            </div>
          ) : events.length === 0 ? (
            <div className="text-center p-12 bg-muted/50 dark:bg-slate-800/50 rounded-2xl border border-border dark:border-slate-700">
              <Globe className="w-10 h-10 text-muted-foreground/40 dark:text-slate-600 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground dark:text-slate-500 font-medium">No hay eventos de tracking recientes</p>
            </div>
          ) : (
            <div className="space-y-4">
              {events.slice(0, 10).map((evt: any, i: number) => {
                const Icon = ICON_MAP[evt.icon] || Package;
                const colorClass = COLOR_MAP[evt.color] || 'text-slate-400';
                return (
                  <motion.div
                    key={evt.id || i}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.03 }}
                    className="flex items-center gap-4 p-4 rounded-xl bg-muted/50 dark:bg-slate-800/50 border border-border/50 dark:border-slate-700/50"
                  >
                    <div className={`w-10 h-10 rounded-xl bg-muted dark:bg-slate-800 flex items-center justify-center ${colorClass}`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-foreground dark:text-white truncate">{evt.title}</p>
                      <p className="text-[10px] text-muted-foreground dark:text-slate-500 font-bold mt-0.5 truncate">
                        {evt.batchNumber && `${evt.batchNumber} • `}{evt.description}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground dark:text-slate-500 font-bold shrink-0">
                      <Clock className="w-3 h-3" />
                      {evt.timestamp ? new Date(evt.timestamp).toLocaleDateString('es-ES', {
                        day: '2-digit',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      }) : '—'}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
