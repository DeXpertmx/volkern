'use client'

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Map as MapIcon, Users, MapPin, Zap } from 'lucide-react';
import dynamic from 'next/dynamic';
import 'leaflet/dist/leaflet.css';

// Importar el mapa completo de forma dinámica para evitar errores de SSR
const MapComponent = dynamic(
  () => import('@/components/operations/map-component'),
  { 
    ssr: false,
    loading: () => <div className="h-full w-full bg-muted/20 animate-pulse flex items-center justify-center">Inicializando motor de mapas...</div>
  }
);

interface TechLocation {
  id: string;
  technician: string;
  role: string;
  lat: number;
  lng: number;
  status: string;
  timestamp: string;
}

export function OperationalMap() {
  const [techs, setTechs] = useState<TechLocation[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchActivity = async () => {
      try {
        const response = await fetch('/api/v1/operations/activity');
        const json = await response.json();
        if (json.success && json.activeTechs) setTechs(json.activeTechs);
      } catch (e) {
        console.error('Error fetching operational activity:', e);
      } finally {
        setIsLoading(false);
      }
    };
    fetchActivity();
  }, []);

  // Mock data si no hay datos reales aún
  const activeTechs = techs.length > 0 ? techs : [
    { id: '1', technician: 'Juan Pérez', role: 'Técnico Senior', lat: 36.7213, lng: -4.4214, status: 'CLOCK_IN', timestamp: new Date().toISOString() },
    { id: '2', technician: 'Elena Soler', role: 'Supervisora QC', lat: 36.7196, lng: -4.4549, status: 'CLOCK_IN', timestamp: new Date().toISOString() }
  ];

  if (isLoading) return <div className="h-full flex items-center justify-center animate-pulse bg-muted/20 rounded-lg">Cargando dashboard operativo...</div>;

  return (
    <Card className="h-full flex flex-col border-primary/20 bg-background/50 backdrop-blur-sm overflow-hidden">
      <CardHeader className="drag-header shrink-0 pb-2">
        <div className="flex justify-between items-center">
          <div>
            <CardTitle className="flex items-center gap-2">
              <MapIcon className="h-5 w-5 text-blue-500" />
              Operational Activity Map
            </CardTitle>
            <CardDescription>Ubicación de técnicos en campo (VISION-LOCK)</CardDescription>
          </div>
          <div className="flex items-center gap-2 text-xs font-semibold text-primary bg-primary/10 px-2 py-1 rounded-full">
            <Users className="h-3 w-3" />
            {activeTechs.length} activos
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex-1 p-0 relative">
        <div className="absolute inset-0 z-0">
          <MapComponent activeTechs={activeTechs} />
        </div>
        
        {/* Overlay Info */}
        <div className="absolute bottom-4 left-4 z-10 p-3 bg-background/80 backdrop-blur-md border rounded-lg shadow-xl pointer-events-none">
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider mb-2 opacity-70">
            <Zap className="h-3 w-3 text-yellow-500 fill-yellow-500" /> VISION-LOCK Activo
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <span>Sede Central: Málaga Tech</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
