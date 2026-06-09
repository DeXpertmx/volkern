'use client'

import { useEffect, useState, useRef, useMemo, Fragment, useId } from 'react'
import {
  MapContainer, TileLayer, Marker, Popup, Polyline, Tooltip, useMap,
} from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import MarkerClusterGroup from '@changey/react-leaflet-markercluster'
import '@changey/react-leaflet-markercluster/dist/styles.min.css'
import { Loader2, Clock, Truck, CheckCircle2, Navigation, FileText } from 'lucide-react'
import PolylineDecorator from './PolylineDecorator'

const EVENT_ICONS: Record<string, React.ReactNode> = {
  DISPATCH: <Truck className="w-3 h-3 text-blue-400" />,
  TRANSIT: <Navigation className="w-3 h-3 text-amber-400" />,
  DELIVERY: <CheckCircle2 className="w-3 h-3 text-emerald-400" />,
  CONFIRMATION: <FileText className="w-3 h-3 text-violet-400" />,
  POD: <FileText className="w-3 h-3 text-violet-400" />,
  CREATED: <Clock className="w-3 h-3 text-slate-400" />,
}

// ─── Custom marker icons for each marker type ───
function createMarkerIcon(color: string, label: string): L.DivIcon {
  return L.divIcon({
    className: 'custom-marker-icon',
    html: `<div style="
      width: 32px; height: 32px;
      background: ${color};
      border: 3px solid rgba(255,255,255,0.9);
      border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      font-size: 11px; font-weight: 900; color: white;
      box-shadow: 0 2px 8px rgba(0,0,0,0.4);
    ">${label}</div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -20],
  })
}

// ─── Mini temperature timeline chart (inline SVG) ───
function TempTimelineChart({ waypoints }: { waypoints: Array<{ lat: number; lng: number; cargoTemp?: number }> }) {
  const tempId = useId()
  const tempWps = waypoints.filter(w => w.cargoTemp != null)
  if (tempWps.length < 2) {
    // Show single value or placeholder
    if (tempWps.length === 1 && tempWps[0].cargoTemp != null) {
      const t = tempWps[0].cargoTemp
      return (
        <div className="flex items-center gap-2 mt-2 pt-2 border-t border-white/10">
          <span className="text-[10px] font-bold uppercase tracking-wider text-white/40">Temp</span>
          <span
            className="text-xs font-bold tabular-nums"
            style={{
              color: t > 28 ? '#f87171' : t < 10 ? '#60a5fa' : '#34d399'
            }}
          >
            {t.toFixed(1)}°C
          </span>
          <span className="text-[9px] text-white/30">(1 lectura)</span>
        </div>
      )
    }
    return null
  }

  const temps = tempWps.map(w => w.cargoTemp as number)
  const min = Math.min(...temps)
  const max = Math.max(...temps)
  const range = Math.max(max - min, 0.5)
  const svgWidth = 200
  const svgHeight = 52
  const padX = 4
  const padY = 4
  const chartW = svgWidth - padX * 2
  const chartH = svgHeight - padY * 2

  // Build polyline points
  const points = tempWps.map((_, i) => {
    const x = padX + (i / Math.max(tempWps.length - 1, 1)) * chartW
    const y = padY + chartH - ((temps[i] - min) / range) * chartH
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')

  // Color based on average
  const avg = temps.reduce((a, b) => a + b, 0) / temps.length
  const lineColor = avg > 28 ? '#f87171' : avg < 10 ? '#60a5fa' : '#34d399'

  return (
    <div className="mt-2 pt-2 border-t border-white/10">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-bold uppercase tracking-wider text-white/40">
          Temperatura Histórica
        </span>
        <span className="text-[9px] text-white/30">
          {tempWps.length} lecturas
        </span>
      </div>
      <svg
        width="100%"
        height={svgHeight}
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        className="overflow-visible"
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Gradient fill under line */}
        <defs>
          <linearGradient id={`temp-grad-${tempId}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={lineColor} stopOpacity="0.25" />
            <stop offset="100%" stopColor={lineColor} stopOpacity="0.04" />
          </linearGradient>
        </defs>
        {/* Area fill */}
        <polyline
          points={`${padX},${padY + chartH} ${points} ${padX + chartW},${padY + chartH}`}
          fill={`url(#temp-grad-${tempId})`}
        />
        {/* Line */}
        <polyline
          points={points}
          fill="none"
          stroke={lineColor}
          strokeWidth="1.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {/* Dots */}
        {tempWps.map((w, i) => {
          const x = padX + (i / Math.max(tempWps.length - 1, 1)) * chartW
          const y = padY + chartH - ((temps[i] - min) / range) * chartH
          const dotColor = temps[i] > 28 ? '#f87171' : temps[i] < 10 ? '#60a5fa' : '#34d399'
          return (
            <circle
              key={i}
              cx={x}
              cy={y}
              r="2.5"
              fill={dotColor}
              stroke="#0f172a"
              strokeWidth="1"
            >
              <title>{`${temps[i].toFixed(1)}°C`}</title>
            </circle>
          )
        })}
        {/* Min label */}
        <text
          x={padX}
          y={height + 8}
          fill="rgb(148 163 184)"
          fontSize="8"
          fontFamily="monospace"
        >
          {min.toFixed(1)}°
        </text>
        {/* Max label */}
        <text
          x={svgWidth - padX}
          y={svgHeight + 8}
          fill="rgb(148 163 184)"
          fontSize="8"
          fontFamily="monospace"
          textAnchor="end"
        >
          {max.toFixed(1)}°
        </text>
      </svg>
    </div>
  )
}

export interface RouteLine {
  shipmentId: string
  batchNumber: string
  status: string
  carrier?: string
  origin: string
  destination: string
  originCoords: [number, number]
  destinationCoords: [number, number]
  currentCoords?: [number, number] | null
  gpsProgress?: number
  cargoTemp?: number | null
  dispatchedAt?: string
  deliveredAt?: string
  lastGpsUpdate?: string
  routeWaypoints?: Array<{ lat: number; lng: number; cargoTemp?: number }>
}

interface RouteMarker {
  id: string
  type: 'origin' | 'destination'
  lat: number
  lng: number
  route: RouteLine
  events: any[]
}

export type StatusFilter = 'all' | 'in_transit' | 'delivered' | 'pending'

interface LogisticaTrackMapProps {
  events: any[]
  routes?: RouteLine[]
  height?: string
  statusFilter?: StatusFilter
}

// ─── Component to auto-fit bounds ───
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
    map.fitBounds(bounds, { padding: [50, 50] })
  }, [points, map])

  return null
}

const STATUS_FILTER_MAP: Record<StatusFilter, string[]> = {
  all: [],
  in_transit: ['SHIPPED'],
  delivered: ['DELIVERED'],
  pending: ['PENDING', 'PREPARING', 'PROCESSING'],
}

export default function LogisticaTrackMap({ events, routes = [], height = '400px', statusFilter = 'all' }: LogisticaTrackMapProps) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  // ─── Group events by shipmentId ───
  const eventsByShipment = useMemo(() => {
    const map: Record<string, any[]> = {}
    for (const evt of events || []) {
      const sid = evt.shipmentId || 'unknown'
      if (!map[sid]) map[sid] = []
      map[sid].push(evt)
    }
    return map
  }, [events])

  // ─── Filter routes by status ───
  const filteredRoutes = useMemo(() => {
    const allowed = STATUS_FILTER_MAP[statusFilter]
    if (statusFilter === 'all' || allowed.length === 0) return routes
    return routes.filter(r => allowed.includes(r.status))
  }, [routes, statusFilter])

  // ─── Build markers from filtered routes: 1 origin + 1 destination per route ───
  const markers: RouteMarker[] = useMemo(() => {
    const result: RouteMarker[] = []
    for (const r of filteredRoutes) {
      const shipmentEvents = eventsByShipment[r.shipmentId] || []
      result.push({
        id: `${r.shipmentId}-origin`,
        type: 'origin',
        lat: r.originCoords[0],
        lng: r.originCoords[1],
        route: r,
        events: shipmentEvents.filter((e: any) =>
          e.type === 'DISPATCH' || e.type === 'CREATED'
        ),
      })
      result.push({
        id: `${r.shipmentId}-dest`,
        type: 'destination',
        lat: r.destinationCoords[0],
        lng: r.destinationCoords[1],
        route: r,
        events: shipmentEvents.filter((e: any) =>
          e.type === 'DELIVERY' || e.type === 'CONFIRMATION' || e.type === 'POD' || e.type === 'TRANSIT'
        ),
      })
    }
    return result
  }, [filteredRoutes, eventsByShipment])

  // ─── Points for FitBounds ───
  const boundsPoints = useMemo(() =>
    markers.map(m => [m.lat, m.lng] as [number, number]),
    [markers]
  )

  // ─── Build route positions with waypoints ───
  const routePositions = useMemo(() => {
    return filteredRoutes.map(r => {
      const coords: [number, number][] = [r.originCoords]
      if (r.routeWaypoints && r.routeWaypoints.length > 0) {
        for (const wp of r.routeWaypoints) {
          coords.push([wp.lat, wp.lng])
        }
      }
      coords.push(r.destinationCoords)
      return { shipmentId: r.shipmentId, positions: coords }
    })
  }, [filteredRoutes])

  // ─── Color por estado del envío ───
  const routeColor = (status: string): string => {
    if (status === 'DELIVERED') return '#22c55e'
    if (status === 'SHIPPED') return '#f59e0b'
    return '#3b82f6'
  }

  const defaultCenter: [number, number] =
    markers.length > 0
      ? [markers[0].lat, markers[0].lng]
      : [36.7213, -4.4214]

  // ─── Render vehicle GPS marker for in-transit shipments ───
  function renderVehicleMarker(r: RouteLine) {
    if (!r.currentCoords || r.status !== 'SHIPPED') return null
    return (
      <Marker
        key={`gps-${r.shipmentId}`}
        position={r.currentCoords}
        icon={L.divIcon({
          className: 'vehicle-gps-marker',
          html: `<div style="
            width: 28px; height: 28px;
            background: #f59e0b;
            border: 3px solid rgba(255,255,255,0.95);
            border-radius: 50%;
            display: flex; align-items: center; justify-content: center;
            font-size: 13px; font-weight: 900; color: white;
            box-shadow: 0 0 0 6px rgba(245,158,11,0.25), 0 2px 8px rgba(0,0,0,0.4);
            animation: pulse-gps 2s ease-in-out infinite;
          ">🚛</div>`,
          iconSize: [28, 28],
          iconAnchor: [14, 14],
          popupAnchor: [0, -18],
        })}
      >
        <Tooltip
          permanent
          direction="top"
          offset={[0, -16]}
          className="!bg-amber-500/90 !border !border-amber-600 !text-[9px] !font-black !text-white !uppercase !tracking-wider !px-2 !py-1 !rounded-lg !shadow-lg !backdrop-blur-sm"
        >
          🚛 {r.batchNumber}
        </Tooltip>

        <Popup>
          <div className="min-w-[220px] font-sans p-2 bg-slate-900/95 backdrop-blur-sm">
            <div className="flex items-center gap-2 mb-2 pb-2 border-b border-white/10">
              <Navigation className="w-4 h-4 text-amber-500" />
              <div>
                <span className="font-black text-xs uppercase tracking-wider text-white/70">
                  Vehículo en ruta
                </span>
                <p className="text-[10px] font-bold text-white/40">
                  {r.batchNumber} • {r.carrier || 'Sin transportista'}
                </p>
              </div>
            </div>
            <div className="space-y-1 text-[11px] text-white/60">
              <p><span className="font-bold text-white/80">Origen:</span> {r.originCoords[0].toFixed(4)}, {r.originCoords[1].toFixed(4)}</p>
              <p><span className="font-bold text-white/80">Destino:</span> {r.destinationCoords[0].toFixed(4)}, {r.destinationCoords[1].toFixed(4)}</p>
              {r.lastGpsUpdate && (
                <p><span className="font-bold text-white/80">Última actualización:</span> {new Date(r.lastGpsUpdate).toLocaleString('es-ES')}</p>
              )}
            </div>
            {/* Temperature timeline */}
            {r.routeWaypoints && r.routeWaypoints.length > 0 && (
              <TempTimelineChart waypoints={r.routeWaypoints} />
            )}
          </div>
        </Popup>
      </Marker>
    )
  }

  // ─── Render individual marker with Tooltip and Popup ───
  function renderMarker(m: RouteMarker) {
    const isOrigin = m.type === 'origin'
    const color = isOrigin ? '#3b82f6' :
      m.route.status === 'DELIVERED' ? '#22c55e' : '#f59e0b'
    const label = isOrigin ? 'O' : 'D'

    return (
      <Marker
        key={m.id}
        position={[m.lat, m.lng]}
        icon={createMarkerIcon(color, label)}
      >
        <Tooltip
          permanent
          direction="top"
          offset={[0, -18]}
          className="!bg-slate-900/90 !border !border-slate-700 !text-[10px] !font-black !text-white !uppercase !tracking-wider !px-2 !py-1 !rounded-lg !shadow-lg !backdrop-blur-sm"
        >
          {m.route.batchNumber}
        </Tooltip>

        <Popup>
          <div className="min-w-[220px] font-sans p-2 bg-slate-900/95 backdrop-blur-sm">
            {/* Header */}
            <div className="flex items-center gap-2 mb-2 pb-2 border-b border-white/10">
              <div
                className="w-3 h-3 rounded-full"
                style={{ background: color }}
              />
              <div>
                <span className="font-black text-xs uppercase tracking-wider text-white/70">
                  {isOrigin ? 'Origen' : 'Destino'} — {isOrigin ? m.route.origin : m.route.destination}
                </span>
                <p className="text-[10px] font-bold text-white/40 uppercase tracking-wider">
                  {m.route.batchNumber} • {m.route.carrier || 'Sin transportista'}
                </p>
              </div>
            </div>

            {/* Event Timeline */}
            {m.events.length === 0 ? (
              <p className="text-xs text-white/40 italic">Sin eventos registrados</p>
            ) : (
              <div className="space-y-2">
                {m.events
                  .sort((a: any, b: any) =>
                    new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
                  )
                  .map((evt: any, i: number) => (
                    <div key={i} className="flex items-start gap-2">
                      <div className="mt-0.5">
                        {EVENT_ICONS[evt.type] || <Clock className="w-3 h-3 text-white/40" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-bold text-white/80">{evt.title}</p>
                        <p className="text-[10px] text-white/50 line-clamp-2">{evt.description}</p>
                        {evt.timestamp && (
                          <p className="text-[9px] font-bold text-white/40 mt-0.5">
                            {new Date(evt.timestamp).toLocaleString('es-ES', {
                              day: '2-digit',
                              month: 'short',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            )}

            {/* Temperature timeline */}
            {m.route.routeWaypoints && m.route.routeWaypoints.length > 0 && (
              <TempTimelineChart waypoints={m.route.routeWaypoints} />
            )}
          </div>
        </Popup>
      </Marker>
    )
  }

  if (!mounted) {
    return (
      <div
        className="rounded-2xl bg-muted dark:bg-slate-800 border border-border dark:border-slate-700 flex items-center justify-center"
        style={{ height }}
      >
        <Loader2 className="w-6 h-6 animate-spin text-yellow-400" />
      </div>
    )
  }

  return (
    <div className="rounded-2xl overflow-hidden border border-border dark:border-slate-700" style={{ height }}>
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

        {/* Route Polylines con waypoints (curvas) + decoradores de flecha */}
        {filteredRoutes.map((r) => {
          const rp = routePositions.find(p => p.shipmentId === r.shipmentId)
          const positions = rp?.positions || [r.originCoords, r.destinationCoords]
          const color = routeColor(r.status)
          return (
            <Fragment key={r.shipmentId}>
              <Polyline
                positions={positions}
                pathOptions={{
                  color,
                  weight: 2.5,
                  opacity: 0.6,
                  dashArray: r.status === 'DELIVERED' ? undefined : '8, 6',
                }}
              />
              <PolylineDecorator
                positions={positions}
                color={color}
              />
            </Fragment>
          )
        })}

        {/* Markers: 1 origen + 1 destino por envío */}
        {/* Usamos MarkerClusterGroup cuando hay más de 10 marcadores */}
        {markers.length > 10 ? (
          <MarkerClusterGroup
            chunkedLoading
            maxClusterRadius={60}
            spiderfyOnMaxZoom
            showCoverageOnHover={false}
            disableClusteringAtZoom={15}
          >
            {markers.map((m) => renderMarker(m))}
            {filteredRoutes.map((r) => renderVehicleMarker(r))}
          </MarkerClusterGroup>
        ) : (
          <>
            {markers.map((m) => renderMarker(m))}
            {filteredRoutes.map((r) => renderVehicleMarker(r))}
          </>
        )}
      </MapContainer>
    </div>
  )
}
