'use client'

import { useEffect, useState, useRef, useMemo } from 'react'
import {
  MapContainer, TileLayer, Marker, Popup, Tooltip, useMap,
} from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { Loader2, Truck, Radio, WifiOff } from 'lucide-react'

// ─── Custom marker icon for fleet vehicles ───
function createVehicleIcon(status: string, hasGps: boolean): L.DivIcon {
  const bgColor = status === 'ACTIVE' ? '#22c55e' : status === 'MAINTENANCE' ? '#f59e0b' : '#64748b'
  const pulse = hasGps ? 'animation: pulse-fleet 2s ease-in-out infinite;' : ''
  return L.divIcon({
    className: 'fleet-vehicle-marker',
    html: `<div style="
      width: 36px; height: 36px;
      background: ${bgColor};
      border: 3px solid rgba(255,255,255,0.95);
      border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      font-size: 16px;
      box-shadow: 0 0 0 6px ${status === 'ACTIVE' ? 'rgba(34,197,94,0.25)' : 'rgba(245,158,11,0.25)'}, 0 2px 8px rgba(0,0,0,0.4);
      ${pulse}
    ">🚛</div>`,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    popupAnchor: [0, -22],
  })
}

// ─── Auto-fit bounds ───
function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap()
  const hasFitted = useRef(false)

  useEffect(() => {
    if (hasFitted.current || points.length === 0) return
    hasFitted.current = true

    if (points.length === 1) {
      map.setView(points[0], 13)
      return
    }
    const bounds = L.latLngBounds(points.map(p => p))
    map.fitBounds(bounds, { padding: [40, 40] })
  }, [points, map])

  return null
}

interface FleetVehicleMarker {
  id: string
  plate: string
  brand: string
  model: string
  status: string
  type: string
  lat: number
  lng: number
  currentKm: number
  lastGpsUpdate?: string
  lastSpeed?: number
  currentTemp?: number
  gpsDeviceId?: string
}

interface FleetLiveMapProps {
  vehicles: any[]
  height?: string
}

export default function FleetLiveMap({ vehicles, height = '380px' }: FleetLiveMapProps) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  // ─── Build markers from vehicles with GPS positions ───
  const markers = useMemo(() => {
    const result: FleetVehicleMarker[] = []
    for (const v of vehicles) {
      if (v.currentLat != null && v.currentLng != null) {
        result.push({
          id: v.id,
          plate: v.plate,
          brand: v.brand,
          model: v.model,
          status: v.status,
          type: v.type,
          lat: v.currentLat,
          lng: v.currentLng,
          currentKm: v.currentKm || 0,
          lastGpsUpdate: v.lastGpsUpdate,
          lastSpeed: v.lastSpeed,
          currentTemp: v.currentTemp,
          gpsDeviceId: v.gpsDeviceId,
        })
      }
    }
    return result
  }, [vehicles])

  const boundsPoints = useMemo(() =>
    markers.map(m => [m.lat, m.lng] as [number, number]),
    [markers]
  )

  const defaultCenter: [number, number] =
    markers.length > 0
      ? [markers[0].lat, markers[0].lng]
      : [36.7213, -4.4214]

  if (!mounted) {
    return (
      <div
        className="rounded-xl bg-muted dark:bg-slate-800 border border-border dark:border-slate-700 flex items-center justify-center"
        style={{ height }}
      >
        <Loader2 className="w-6 h-6 animate-spin text-yellow-400" />
      </div>
    )
  }

  if (markers.length === 0) {
    return (
      <div
        className="rounded-xl bg-muted/50 dark:bg-slate-800/50 border border-border dark:border-slate-700 flex flex-col items-center justify-center gap-3"
        style={{ height }}
      >
        <div className="w-12 h-12 rounded-xl bg-muted dark:bg-slate-800 flex items-center justify-center border border-border dark:border-slate-700">
          <WifiOff className="w-6 h-6 text-muted-foreground dark:text-slate-500" />
        </div>
        <p className="text-sm text-muted-foreground dark:text-slate-500 font-medium">Ningún vehículo con GPS activo</p>
        <p className="text-xs text-muted-foreground/60 dark:text-slate-600">Los vehículos aparecerán aquí cuando reporten su posición GPS</p>
      </div>
    )
  }

  const gpsActive = markers.length
  const totalVehicles = vehicles.length

  return (
    <div className="space-y-3">
      {/* Mini stats header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="relative w-2 h-2">
              <div className="absolute inset-0 rounded-full bg-emerald-400 animate-ping opacity-40" />
              <div className="absolute inset-0 rounded-full bg-emerald-400" />
            </div>
            <span className="text-xs font-medium text-emerald-400 tabular-nums">
              {gpsActive} GPS activo{gpsActive !== 1 ? 's' : ''}
            </span>
          </div>
          <span className="text-xs text-muted-foreground dark:text-slate-500">
            de {totalVehicles} vehículo{totalVehicles !== 1 ? 's' : ''}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-500" />
          <span className="text-[10px] text-muted-foreground dark:text-slate-500 uppercase tracking-wider font-bold">Activo</span>
          <div className="w-2 h-2 rounded-full bg-amber-500" />
          <span className="text-[10px] text-muted-foreground dark:text-slate-500 uppercase tracking-wider font-bold">Mantenimiento</span>
        </div>
      </div>

      {/* Map */}
      <div className="rounded-xl overflow-hidden border border-border dark:border-slate-700" style={{ height }}>
        <MapContainer
          center={defaultCenter}
          zoom={6}
          className="h-full w-full"
          style={{ background: '#0f172a' }}
          zoomControl={true}
          scrollWheelZoom={false}
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          />

          <FitBounds points={boundsPoints} />

          {markers.map((m) => (
            <Marker
              key={m.id}
              position={[m.lat, m.lng]}
              icon={createVehicleIcon(m.status, true)}
            >
              <Tooltip
                permanent
                direction="top"
                offset={[0, -20]}
                className="!bg-slate-900/90 !border !border-slate-700 !text-[10px] !font-black !text-white !uppercase !tracking-wider !px-2 !py-1 !rounded-lg !shadow-lg !backdrop-blur-sm"
              >
                🚛 {m.plate}
              </Tooltip>

              <Popup>
                <div className="min-w-[220px] font-sans p-2 bg-slate-900/95 backdrop-blur-sm">
                  {/* Header */}
                  <div className="flex items-center gap-2 mb-2 pb-2 border-b border-white/10">
                    <div className="w-8 h-8 rounded-lg bg-yellow-500/10 border border-yellow-500/20 flex items-center justify-center">
                      <Truck className="w-4 h-4 text-yellow-400" />
                    </div>
                    <div>
                      <span className="font-black text-xs uppercase tracking-wider text-white/70">
                        {m.plate}
                      </span>
                      <p className="text-[10px] font-bold text-white/40">
                        {m.brand} {m.model}
                      </p>
                    </div>
                  </div>

                  {/* Details */}
                  <div className="space-y-1.5 text-[11px] text-white/60">
                    <p className="flex items-center gap-2">
                      <Radio className="w-3 h-3 text-emerald-400" />
                      <span className="text-emerald-400 font-medium">GPS en vivo</span>
                    </p>
                    <p>
                      <span className="font-bold text-white/80">Posición:</span>{' '}
                      {m.lat.toFixed(4)}, {m.lng.toFixed(4)}
                    </p>
                    {m.lastSpeed != null && (
                      <p>
                        <span className="font-bold text-white/80">Velocidad:</span>{' '}
                        <span className="text-cyan-400 font-medium">{m.lastSpeed} km/h</span>
                      </p>
                    )}
                    {m.currentTemp != null && (
                      <p>
                        <span className="font-bold text-white/80">Temperatura:</span>{' '}
                        <span
                          className="font-medium"
                          style={{
                            color: m.currentTemp > 28 ? '#f87171' : m.currentTemp < 10 ? '#60a5fa' : '#34d399'
                          }}
                        >
                          {m.currentTemp.toFixed(1)}°C
                        </span>
                      </p>
                    )}
                    <p>
                      <span className="font-bold text-white/80">Kilometraje:</span>{' '}
                      {m.currentKm.toLocaleString()} km
                    </p>
                    {m.lastGpsUpdate && (
                      <p>
                        <span className="font-bold text-white/80">Última actualización:</span>{' '}
                        {new Date(m.lastGpsUpdate).toLocaleString('es-ES')}
                      </p>
                    )}
                  </div>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>
    </div>
  )
}
