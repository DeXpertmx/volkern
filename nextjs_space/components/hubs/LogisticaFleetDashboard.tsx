'use client';

import { useState } from 'react';
import {
  Truck, Plus, Search, Wrench, MapPin,
  ArrowRight, Loader2, HardDrive, Radio,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import useSWR from 'swr';
import dynamic from 'next/dynamic';
import { motion } from 'framer-motion';
import { AddVehicleDialog } from '@/components/hubs/AddVehicleDialog';
import { VehicleGpsConfigDialog } from '@/components/hubs/VehicleGpsConfigDialog';
import GpsDeviceMappingPanel from '@/components/hubs/GpsDeviceMappingPanel';

// Leaflet map (dynamic import — requires browser APIs)
const FleetLiveMap = dynamic(
  () => import('@/components/hubs/FleetLiveMap'),
  { ssr: false, loading: () => (
    <div className="rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center" style={{ height: '380px' }}>
      <Loader2 className="w-6 h-6 animate-spin text-yellow-400" />
    </div>
  )}
)

const fetcher = (url: string) => fetch(url).then(res => res.json());

const statusStyles: Record<string, string> = {
  ACTIVE: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  MAINTENANCE: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  INACTIVE: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
  RETIRED: 'bg-red-500/20 text-red-400 border-red-500/30',
};

const typeLabels: Record<string, string> = {
  camion: 'Camión',
  furgoneta: 'Furgoneta',
  remolque: 'Remolque',
  turismo: 'Turismo',
  moto: 'Moto',
};

export default function FleetDashboard() {
  const { data, isLoading, mutate } = useSWR('/api/erp/logistics/fleet', fetcher);
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [gpsConfigVehicle, setGpsConfigVehicle] = useState<any | null>(null);
  const [gpsConfigOpen, setGpsConfigOpen] = useState(false);

  const vehicles = data?.vehicles || [];

  const filtered = search
    ? vehicles.filter((v: any) =>
        v.plate.toLowerCase().includes(search.toLowerCase()) ||
        v.brand.toLowerCase().includes(search.toLowerCase()) ||
        v.model.toLowerCase().includes(search.toLowerCase())
      )
    : vehicles;

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
              <h1 className="text-2xl font-black uppercase tracking-tight text-white">Gestión de Flota</h1>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Vehículos, conductores y mantenimiento</p>
            </div>
          </div>
        </div>
        <Button
          onClick={() => setDialogOpen(true)}
          className="bg-yellow-600 hover:bg-yellow-500 text-white font-black uppercase text-[10px] h-10 px-5 rounded-xl gap-2"
        >
          <Plus className="w-4 h-4" />
          Añadir Vehículo
        </Button>
        <AddVehicleDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          onSuccess={() => mutate()}
        />
        <VehicleGpsConfigDialog
          key={gpsConfigVehicle?.id || 'none'}
          open={gpsConfigOpen}
          onOpenChange={setGpsConfigOpen}
          vehicle={gpsConfigVehicle}
          onGpsRegenerated={() => mutate()}
        />
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
        <Input
          placeholder="Buscar por matrícula, marca o modelo..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10 bg-slate-900 border-slate-800 text-white placeholder:text-slate-600 rounded-xl h-11"
        />
      </div>

      {/* Live Map */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <MapPin className="w-4 h-4 text-blue-400" />
          <span className="text-sm font-semibold text-white">Posición de Vehículos en Vivo</span>
          {vehicles.some((v: any) => v.currentLat != null) && (
            <span className="text-[10px] text-slate-500 font-medium">
              ({vehicles.filter((v: any) => v.currentLat != null).length} reportando)
            </span>
          )}
        </div>
        <FleetLiveMap vehicles={vehicles} />
      </div>

      {/* Fleet Table */}
      <Card className="border-none shadow-sm bg-slate-900">
        <CardHeader className="pb-4 border-b border-slate-800">
          <CardTitle className="text-lg font-bold uppercase text-white tracking-tight">
            Vehículos ({filtered.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          {isLoading ? (
            <div className="flex items-center justify-center p-12">
              <Loader2 className="w-6 h-6 animate-spin text-yellow-400" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center p-12 bg-slate-800/50 rounded-2xl border border-slate-700">
              <HardDrive className="w-10 h-10 text-slate-600 mx-auto mb-3" />
              <p className="text-sm text-slate-500 font-medium">
                {search ? 'No hay vehículos que coincidan con la búsqueda' : 'No hay vehículos registrados'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map((v: any, i: number) => (
                <motion.div
                  key={v.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03 }}
                  onClick={() => {
                    setGpsConfigVehicle(v);
                    setGpsConfigOpen(true);
                  }}
                  className="flex items-center justify-between p-4 rounded-xl bg-slate-800/50 border border-slate-700/50 hover:border-yellow-600/30 hover:bg-slate-800 transition-all group cursor-pointer"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-slate-800 flex items-center justify-center border border-slate-700">
                      <Truck className="w-6 h-6 text-slate-400" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-bold text-white text-sm">{v.plate}</h4>
                        <Badge className={`border text-[9px] font-black uppercase px-2 py-0.5 ${statusStyles[v.status] || ''}`}>
                          {v.status === 'ACTIVE' ? 'Activo' : v.status === 'MAINTENANCE' ? 'Mantenimiento' : v.status}
                        </Badge>
                        {/* GPS indicator */}
                        {v.gpsDeviceId && (
                          <div className="flex items-center gap-1" title={v.currentLat != null ? 'GPS en vivo' : 'GPS configurado, esperando señal'}>
                            <div
                              className={
                                'w-1.5 h-1.5 rounded-full ' +
                                (v.currentLat != null
                                  ? 'bg-emerald-400 shadow-[0_0_4px_rgba(52,211,153,0.5)]'
                                  : 'bg-amber-400/60')
                              }
                            />
                            <Radio className="w-2.5 h-2.5 text-slate-500" />
                          </div>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 font-bold mt-0.5">
                        {v.brand} {v.model} • {v.year} • {typeLabels[v.type] || v.type} • {v.currentKm?.toLocaleString()} km
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right hidden md:block">
                      <p className="text-[10px] font-bold uppercase text-slate-500">Capacidad</p>
                      <p className="text-sm font-bold text-white">{v.capacity} {v.capacityUnit}</p>
                    </div>
                    {v.status === 'MAINTENANCE' && (
                      <Wrench className="w-4 h-4 text-amber-400" />
                    )}
                    <Button variant="ghost" size="icon" className="rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
                      <ArrowRight className="w-4 h-4 text-slate-400" />
                    </Button>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* GPS Device Mapping (IMEI → deviceKey) */}
      <GpsDeviceMappingPanel />
    </div>
  );
}
