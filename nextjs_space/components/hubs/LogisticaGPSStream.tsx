'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import {
  MapPin, Truck, Navigation, Clock, Radio,
  Play, Square, Activity, AlertTriangle, CheckCircle2,
  Loader2, Zap, RefreshCw, Maximize2, Minimize2,
  Gauge, Thermometer, TrendingUp,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import 'leaflet/dist/leaflet.css'

import LogisticaTrackMap from './LogisticaTrackMap'
import type { RouteLine } from './LogisticaTrackMap'
import { haversineKm } from '@/lib/geo'

// ── Types ──
interface StreamEvent {
  id: string
  shipmentId: string
  batchNumber: string
  type: string
  title: string
  description: string
  location: string
  timestamp: string
  icon: string
  color: string
}

interface StreamStats {
  total: number
  inTransit: number
  delivered: number
  pending: number
}

interface StreamData {
  routes: RouteLine[]
  events: StreamEvent[]
  stats: StreamStats
  timestamp: string
}

// ── Toast icons (extracted to avoid SWC parser issue with JSX in useEffect) ──
const toastIconCheck = <CheckCircle2 className="w-4 h-4 text-emerald-400" />
const toastIconTruck = <Truck className="w-4 h-4 text-blue-400" />

// ── Helpers ──
function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  if (m === 0) return s + 's'
  return m + 'm ' + s + 's'
}

function formatMinutes(totalMinutes: number): string {
  if (totalMinutes <= 0) return '0m'
  if (totalMinutes >= 1440) {
    const d = Math.floor(totalMinutes / 1440)
    const h = Math.round((totalMinutes % 1440) / 60)
    return d + 'd ' + h + 'h'
  }
  if (totalMinutes >= 60) {
    const h = Math.floor(totalMinutes / 60)
    const m = totalMinutes % 60
    return h + 'h ' + m + 'm'
  }
  return totalMinutes + 'm'
}

// ── Event icon map ──
const eventIconMap: Record<string, React.ReactNode> = {
  Truck: <Truck className="w-3.5 h-3.5" />,
  CheckCircle2: <CheckCircle2 className="w-3.5 h-3.5" />,
  MapPin: <MapPin className="w-3.5 h-3.5" />,
  Clock: <Clock className="w-3.5 h-3.5" />,
  Navigation: <Navigation className="w-3.5 h-3.5" />,
}

const eventColorMap: Record<string, string> = {
  'text-blue-400': 'bg-blue-500/20 text-blue-400',
  'text-emerald-400': 'bg-emerald-500/20 text-emerald-400',
  'text-amber-400': 'bg-amber-500/20 text-amber-400',
  'text-slate-400':  'bg-muted text-muted-foreground dark:bg-white/10 dark:text-white/40',
}

// ── Main component ──
export default function LogisticaGPSStream() {
  const [streamData, setStreamData] = useState<StreamData | null>(null)
  const [connected, setConnected] = useState(false)
  const [reconnecting, setReconnecting] = useState(false)
  const eventSourceRef = useRef<EventSource | null>(null)
  const connectionAttemptRef = useRef(0)

  // Simulation state
  const [simulating, setSimulating] = useState(false)
  const [simMinutes, setSimMinutes] = useState(15)
  const [simulationResult, setSimulationResult] = useState<{
    updated: number
    completed: number
    message: string
    timestamp: string
  } | null>(null)
  const simMinutesRef = useRef(simMinutes)
  simMinutesRef.current = simMinutes

  // Auto-play state
  const [isAutoPlaying, setIsAutoPlaying] = useState(false)
  const [autoPlayCount, setAutoPlayCount] = useState(0)
  const [autoPlayElapsed, setAutoPlayElapsed] = useState(0)
  const [totalSimulatedMinutes, setTotalSimulatedMinutes] = useState(0)
  const autoPlayIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const elapsedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Toast dedup refs
  const prevCompletedRef = useRef<number | null>(null)
  const prevInTransitRef = useRef<number | null>(null)

  // Fullscreen state
  const [isFullscreen, setIsFullscreen] = useState(false)
  const mapContainerRef = useRef<HTMLDivElement>(null)

  const toggleFullscreen = useCallback(async () => {
    if (!document.fullscreenElement) {
      try {
        await mapContainerRef.current?.requestFullscreen()
      } catch {
        // Fullscreen API not supported or denied
      }
    } else {
      await document.exitFullscreen()
    }
  }, [])

  // ── Connect to SSE ──
  const connect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
    }

    const es = new EventSource('/api/erp/logistics/gps/stream')
    eventSourceRef.current = es

    es.onopen = () => {
      setConnected(true)
      setReconnecting(false)
      connectionAttemptRef.current = 0
    }

    es.addEventListener('data', (ev: MessageEvent) => {
      try {
        const data = JSON.parse(ev.data) as StreamData
        setStreamData(data)
      } catch {
        // ignore parse errors
      }
    })

    es.onerror = () => {
      es.close()
      setConnected(false)
      setReconnecting(true)
      connectionAttemptRef.current += 1
      const delay = Math.min(1000 * 2 ** connectionAttemptRef.current, 30000)
      setTimeout(() => connect(), delay)
    }
  }, [])

  // ── Stop auto-play ──
  const stopAutoPlay = useCallback(() => {
    if (autoPlayIntervalRef.current) {
      clearInterval(autoPlayIntervalRef.current)
      autoPlayIntervalRef.current = null
    }
    if (elapsedTimerRef.current) {
      clearInterval(elapsedTimerRef.current)
      elapsedTimerRef.current = null
    }
    setIsAutoPlaying(false)
    setAutoPlayCount(0)
    setAutoPlayElapsed(0)
    setTotalSimulatedMinutes(0)
  }, [])

  // ── Simulate GPS ──
  const simulateGPS = useCallback(async (minutes: number) => {
    setSimulating(true)
    setSimulationResult(null)
    try {
      const res = await fetch('/api/erp/logistics/gps/realtime', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ minutes }),
      })
      if (!res.ok) throw new Error('Error ' + res.status)
      const data = await res.json()
      setSimulationResult(data)
      return data
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error de conexion'
      setSimulationResult({ updated: 0, completed: 0, message: msg, timestamp: new Date().toISOString() })
      return null
    } finally {
      setSimulating(false)
    }
  }, [])

  // ── Toggle auto-play ──
  const toggleAutoPlay = useCallback(() => {
    if (isAutoPlaying) {
      stopAutoPlay()
      return
    }

    // Start
    setIsAutoPlaying(true)
    setAutoPlayCount(1)
    setAutoPlayElapsed(0)
    setTotalSimulatedMinutes(simMinutesRef.current)

    // Fire immediately
    simulateGPS(simMinutesRef.current)

    // Elapsed timer
    elapsedTimerRef.current = setInterval(() => {
      setAutoPlayElapsed((s) => s + 1)
    }, 1000)

    // Every 10s
    autoPlayIntervalRef.current = setInterval(() => {
      setAutoPlayCount((c) => c + 1)
      setTotalSimulatedMinutes((m) => m + simMinutesRef.current)
      simulateGPS(simMinutesRef.current)
    }, 10000)
  }, [isAutoPlaying, simulateGPS, stopAutoPlay])

  // ── Auto-stop when all delivered ──
  useEffect(() => {
    if (
      isAutoPlaying &&
      streamData?.stats?.inTransit === 0 &&
      (streamData?.stats?.total ?? 0) > 0
    ) {
      stopAutoPlay()
    }
  }, [isAutoPlaying, streamData?.stats?.inTransit, streamData?.stats?.total, stopAutoPlay])

  // ── Listen for fullscreen changes ──
  useEffect(() => {
    const handler = () => {
      setIsFullscreen(!!document.fullscreenElement)
    }
    document.addEventListener('fullscreenchange', handler)
    return () => document.removeEventListener('fullscreenchange', handler)
  }, [])

  // ── Connect on mount, cleanup on unmount ──
  useEffect(() => {
    connect()
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
      }
      if (autoPlayIntervalRef.current) {
        clearInterval(autoPlayIntervalRef.current)
      }
      if (elapsedTimerRef.current) {
        clearInterval(elapsedTimerRef.current)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Toast: partial deliveries during auto-play ──
  useEffect(() => {
    if (
      !isAutoPlaying ||
      !simulationResult ||
      simulationResult.completed <= 0
    )
      return

    const completed = simulationResult.completed
    if (completed === prevCompletedRef.current) return
    prevCompletedRef.current = completed

    toast.success(
      completed + ' vehiculo' + (completed === 1 ? '' : 's') + ' entregado' + (completed === 1 ? '' : 's'),
      {
        icon: toastIconCheck,
        description:
          simulationResult.updated +
          ' actualizados en ' +
          formatMinutes(totalSimulatedMinutes || simMinutes),
      }
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAutoPlaying, simulationResult])

  // ── Toast: all vehicles delivered ──
  useEffect(() => {
    if (
      !isAutoPlaying ||
      streamData?.stats?.inTransit == null ||
      streamData.stats.inTransit > 0
    )
      return

    const inTransit = streamData.stats.inTransit
    if (prevInTransitRef.current === 0 && inTransit === 0) return
    prevInTransitRef.current = inTransit

    toast.success('Todos los vehiculos entregados!', {
      icon: toastIconTruck,
      description:
        autoPlayCount +
        ' iteraciones | ' +
        formatMinutes(totalSimulatedMinutes) +
        ' simulados',
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAutoPlaying, streamData?.stats?.inTransit])

  // ── Reset toast refs when auto-play stops ──
  useEffect(() => {
    if (!isAutoPlaying) {
      prevCompletedRef.current = null
      prevInTransitRef.current = null
    }
  }, [isAutoPlaying])

  // ── Memoized stats ──
  const stats = useMemo(() => {
    if (!streamData?.stats) return null
    return streamData.stats
  }, [streamData?.stats])

  // ── Derived stats from routes ──
  const derivedStats = useMemo(() => {
    const routes = streamData?.routes ?? []
    if (routes.length === 0) return null

    const inTransit = routes.filter(r => r.status === 'SHIPPED')
    const delivered = routes.filter(r => r.status === 'DELIVERED')
    const withGps = routes.filter(r => r.currentCoords != null)

    // Average progress across in-transit
    const avgProgress = inTransit.length > 0
      ? Math.round(inTransit.reduce((sum, r) => sum + (r.gpsProgress ?? 0), 0) / inTransit.length * 100)
      : 0

    // Fleet utilization
    const utilization = routes.length > 0
      ? Math.round((inTransit.length / routes.length) * 100)
      : 0

    // Estimated avg speed for in-transit vehicles that have dispatchedAt
    let avgSpeedKmh = 0
    let speedCount = 0
    for (const r of inTransit) {
      if (r.dispatchedAt && r.gpsProgress && r.gpsProgress > 0.05 && r.originCoords && r.destinationCoords) {
        const elapsedHours = (Date.now() - new Date(r.dispatchedAt).getTime()) / (1000 * 60 * 60)
        if (elapsedHours > 0) {
          const totalKm = haversineKm(
            r.originCoords[0], r.originCoords[1],
            r.destinationCoords[0], r.destinationCoords[1]
          )
          const traveledKm = totalKm * r.gpsProgress
          const speed = traveledKm / elapsedHours
          if (speed > 0 && speed < 200) { // sanity check: max 200 km/h
            avgSpeedKmh += speed
            speedCount++
          }
        }
      }
    }
    const estimatedSpeed = speedCount > 0 ? Math.round(avgSpeedKmh / speedCount) : 0

    // Temperature stats from routes that have cargoTemp
    const temps = routes.filter(r => r.cargoTemp != null).map(r => r.cargoTemp as number)
    const avgTemp = temps.length > 0
      ? Math.round(temps.reduce((sum, t) => sum + t, 0) / temps.length * 10) / 10
      : null
    const minTemp = temps.length > 0 ? Math.round(Math.min(...temps) * 10) / 10 : null
    const maxTemp = temps.length > 0 ? Math.round(Math.max(...temps) * 10) / 10 : null

    // Hot temperature alerts (cargoTemp > 28°C)
    const HOT_THRESHOLD = 28
    const hotRoutes = routes.filter(r => r.cargoTemp != null && (r.cargoTemp as number) > HOT_THRESHOLD)
    const hotTempCount = hotRoutes.length
    const hotTempRoutes = hotRoutes.map(r => ({
      batchNumber: r.batchNumber,
      temp: r.cargoTemp as number,
      status: r.status,
      origin: r.origin,
      destination: r.destination,
      currentCoords: r.currentCoords,
    }))

    return {
      avgProgress,
      utilization,
      gpsActiveCount: withGps.length,
      estimatedSpeed,
      totalRoutes: routes.length,
      deliveredCount: delivered.length,
      inTransitCount: inTransit.length,
      avgTemp,
      minTemp,
      maxTemp,
      tempCount: temps.length,
      hotTempCount,
      hotTempRoutes,
    }
  }, [streamData?.routes])

  // ── Render ──
  return (
    <div className="space-y-6 bg-card dark:bg-slate-900 rounded-2xl p-6">
      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-xl font-semibold text-foreground dark:text-white flex items-center gap-2">
            <Radio className="w-5 h-5 text-emerald-400" />
            GPS en Vivo
          </h2>
          <p className="text-sm text-muted-foreground dark:text-white/50 mt-0.5">
            Posiciones de vehiculos actualizadas via Server-Sent Events
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Connection status */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted/50 dark:bg-white/5 border border-border dark:border-white/10">
            <div
              className={
                'w-2 h-2 rounded-full ' +
                (connected
                  ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.5)]'
                  : reconnecting
                    ? 'bg-amber-400 animate-pulse'
                    : 'bg-red-400')
              }
            />
            <span className="text-xs text-muted-foreground dark:text-white/60">
              {connected
                ? 'Conectado'
                : reconnecting
                  ? 'Reconectando...'
                  : 'Desconectado'}
            </span>
          </div>
          {reconnecting && (
            <button
              onClick={() => connect()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-muted dark:bg-white/10 text-muted-foreground dark:text-white/70 hover:bg-accent dark:hover:bg-white/15 transition-colors"
            >
              <RefreshCw className="w-3 h-3" />
              Reconectar
            </button>
          )}
        </div>
      </div>

      {/* ── Stats cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">          {[
          { label: 'Total Envios', value: stats?.total ?? 0, color: 'text-foreground dark:text-white' },
          { label: 'En Transito', value: stats?.inTransit ?? 0, color: 'text-amber-400' },
          { label: 'Entregados', value: stats?.delivered ?? 0, color: 'text-emerald-400' },
          { label: 'Pendientes', value: stats?.pending ?? 0, color: 'text-blue-400' },
          {
            label: 'Ultima Actualizacion',
            value: streamData?.timestamp
              ? new Date(streamData.timestamp).toLocaleTimeString()
              : '--:--:--',
            color: 'text-muted-foreground dark:text-white/60',
          },
        ].map((s, i) => (
          <div
            key={i}
            className="p-4 rounded-xl bg-muted/50 dark:bg-white/5 border border-border dark:border-white/10"
          >
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground dark:text-white/40 mb-1">
              {s.label}
            </div>
            <div className={'text-xl font-semibold tabular-nums ' + s.color}>
              {s.value}
            </div>
          </div>
        ))}
      </div>

      {/* ── Simulation Controls ── */}
      <div className="p-5 rounded-xl bg-muted/30 dark:bg-white/[0.03] border border-border dark:border-white/10">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-foreground dark:text-white flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-400" />
              Simulacion GPS
            </h3>
            <p className="text-xs text-muted-foreground dark:text-white/40 mt-0.5">
              Avanza vehiculos en transito para probar el movimiento en tiempo real
            </p>
          </div>
          {/* Auto-play indicator */}
          <AnimatePresence>
            {isAutoPlaying && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20"
              >
                <div className="relative w-2.5 h-2.5">
                  <div className="absolute inset-0 rounded-full bg-emerald-400 animate-ping opacity-40" />
                  <div className="absolute inset-0 rounded-full bg-emerald-400" />
                </div>
                <span className="text-xs font-medium text-emerald-400 whitespace-nowrap">
                  #{autoPlayCount}
                </span>
                <div className="w-px h-3 bg-white/10" />
                <Clock className="w-3 h-3 text-white/50" />
                <span className="text-xs text-white/50 tabular-nums">
                  {formatElapsed(autoPlayElapsed)}
                </span>
                <div className="w-px h-3 bg-white/10" />
                <span className="text-xs text-white/40">
                  +{formatMinutes(totalSimulatedMinutes)}
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Preset minute buttons */}
        <div className="flex items-center gap-2 mb-4">
          <span className="text-xs text-muted-foreground dark:text-white/40 mr-1">Avance:</span>
          {[5, 15, 30, 60].map((m) => (
            <button
              key={m}
              disabled={simulating || isAutoPlaying}
              onClick={() => setSimMinutes(m)}
              className={
                'px-3 py-1.5 rounded-lg text-xs font-medium transition-all ' +
                (simMinutes === m
                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                  : 'bg-muted/50 dark:bg-white/5 text-muted-foreground dark:text-white/50 border border-border dark:border-white/10 hover:bg-accent dark:hover:bg-white/10')
              }
            >
              {m} min
            </button>
          ))}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-3">
          <button
            disabled={simulating || isAutoPlaying}
            onClick={() => simulateGPS(simMinutes)}
            className={
              'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ' +
              (simulating || isAutoPlaying
                ? 'bg-muted/30 dark:bg-white/5 text-muted-foreground/50 dark:text-white/30 cursor-not-allowed'
                : 'bg-amber-500/20 text-amber-400 border border-amber-500/30 hover:bg-amber-500/30')
            }
          >
            {simulating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Simulando...
              </>
            ) : (
              <>
                <Zap className="w-4 h-4" />
                Avanzar {simMinutes} min
              </>
            )}
          </button>

          <button
            disabled={simulating}
            onClick={toggleAutoPlay}
            className={
              'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ' +
              (simulating
                ? 'bg-white/5 text-white/30 cursor-not-allowed'
                : isAutoPlaying
                  ? 'bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30'
                  : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30')
            }
          >
            {isAutoPlaying ? (
              <>
                <Square className="w-4 h-4" />
                Detener
              </>
            ) : (
              <>
                <Play className="w-4 h-4" />
                Auto cada 10s
              </>
            )}
          </button>
        </div>

        {/* Results */}
        <AnimatePresence>
          {simulationResult && !simulating && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className={
                'mt-4 p-3 rounded-xl flex items-start gap-3 text-sm ' +
                (simulationResult.message?.includes('Error')
                  ? 'bg-red-500/10 border border-red-500/20'
                  : simulationResult.message?.toLowerCase().includes('no hay')
                    ? 'bg-white/5 border border-white/10'
                    : 'bg-emerald-500/10 border border-emerald-500/20')
              }
            >
              {/* Icon */}
              <div
                className={
                  'w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ' +
                  (simulationResult.message?.includes('Error')
                    ? 'bg-red-500/20 text-red-400'
                    : simulationResult.message?.toLowerCase().includes('no hay')
                      ? 'bg-white/10 text-white/40'
                      : 'bg-emerald-500/20 text-emerald-400')
                }
              >
                {simulationResult.message?.includes('Error') ? (
                  <AlertTriangle className="w-4 h-4" />
                ) : simulationResult.updated > 0 ? (
                  <Navigation className="w-4 h-4" />
                ) : (
                  <Truck className="w-4 h-4" />
                )}
              </div>
              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="text-white/80 font-medium">
                  {simulationResult.message}
                </div>
                {(simulationResult.updated > 0 ||
                  simulationResult.completed > 0) && (
                  <div className="flex items-center gap-4 mt-1 text-xs text-white/40">
                    <span>
                      <Navigation className="w-3 h-3 inline mr-1" />
                      {simulationResult.updated} actualizados
                    </span>
                    {simulationResult.completed > 0 && (
                      <span>
                        <CheckCircle2 className="w-3 h-3 inline mr-1" />
                        {simulationResult.completed} entregados
                      </span>
                    )}
                    <span>
                      <Clock className="w-3 h-3 inline mr-1" />
                      {new Date(simulationResult.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Live Activity Indicator ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="relative w-2.5 h-2.5">
            <div className="absolute inset-0 rounded-full bg-emerald-400 animate-ping opacity-40" />
            <div className="absolute inset-0 rounded-full bg-emerald-400" />
          </div>
          <span className="text-xs font-medium text-emerald-400 uppercase tracking-wider">
            En Vivo
          </span>
          {streamData?.routes && (
            <span className="text-xs text-muted-foreground/50 dark:text-white/30 ml-2">
              {streamData.routes.length} vehiculo
              {streamData.routes.length !== 1 ? 's' : ''} en ruta
            </span>
          )}
        </div>
        {streamData?.timestamp && (
          <span className="text-xs text-muted-foreground/50 dark:text-white/30 tabular-nums">
            {new Date(streamData.timestamp).toLocaleTimeString()}
          </span>
        )}
      </div>

      {/* ── Real Map ── */}
      <div
        ref={mapContainerRef}
        className={
          'rounded-xl bg-muted/30 dark:bg-white/[0.03] border border-border dark:border-white/10 overflow-hidden transition-all ' +
          (isFullscreen ? '!fixed !inset-0 !z-[9999] !rounded-none !border-0' : '')
        }
      >          <div className="p-4 border-b border-border/5 dark:border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-blue-400" />
            <span className="text-sm font-medium text-foreground dark:text-white">Mapa de Rastreo</span>
          </div>
          <button
            onClick={toggleFullscreen}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-muted dark:bg-white/10 text-muted-foreground dark:text-white/60 hover:bg-accent dark:hover:bg-white/20 hover:text-foreground dark:hover:text-white transition-all"
            title={isFullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}
          >
            {isFullscreen ? (
              <Minimize2 className="w-3.5 h-3.5" />
            ) : (
              <Maximize2 className="w-3.5 h-3.5" />
            )}
            <span className="hidden sm:inline">{isFullscreen ? 'Salir' : 'Pantalla Completa'}</span>
          </button>
        </div>
        <div className="p-0 relative">
          {connected && streamData ? (
            <LogisticaTrackMap
              routes={streamData.routes ?? []}
              events={streamData.events ?? []}
              height={isFullscreen ? '100vh' : '500px'}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-48 gap-3 text-muted-foreground/40 dark:text-white/30">
              <Activity className="w-8 h-8" />
              <p className="text-sm">
                {reconnecting
                  ? 'Reconectando al stream...'
                  : 'Esperando conexion...'}
              </p>
              {reconnecting && (
                <button
                  onClick={() => connect()}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-muted dark:bg-white/10 text-muted-foreground dark:text-white/50 hover:bg-accent dark:hover:bg-white/15 transition-colors"
                >
                  <RefreshCw className="w-3 h-3" />
                  Reconectar ahora
                </button>
              )}
            </div>
          )}

          {/* Floating overlay when in fullscreen */}
          {isFullscreen && (
            <div className="absolute top-4 left-4 right-4 flex items-start justify-between pointer-events-none z-10">
              {/* Stats panel */}
              <div className="pointer-events-auto flex items-center gap-4 px-4 py-2.5 rounded-xl bg-slate-900/80 backdrop-blur-md border border-white/10">
                {/* Connection */}
                <div className="flex items-center gap-2">
                  <div
                    className={
                      'w-2 h-2 rounded-full ' +
                      (connected
                        ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.5)]'
                        : 'bg-red-400')
                    }
                  />
                  <span className="text-xs font-medium text-white/80">
                    {connected ? 'En Vivo' : 'Offline'}
                  </span>
                </div>
                <div className="w-px h-5 bg-white/10" />

                {/* In transit */}
                <div className="flex items-center gap-1.5">
                  <Navigation className="w-3.5 h-3.5 text-amber-400" />
                  <span className="text-xs text-amber-400 font-medium tabular-nums">
                    {derivedStats?.inTransitCount ?? stats?.inTransit ?? 0}
                  </span>
                  <span className="text-[10px] text-white/50">en ruta</span>
                </div>
                <div className="w-px h-5 bg-white/10" />

                {/* Delivered */}
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-xs text-emerald-400 font-medium tabular-nums">
                    {derivedStats?.deliveredCount ?? stats?.delivered ?? 0}
                  </span>
                  <span className="text-[10px] text-white/50">entregados</span>
                </div>
                <div className="w-px h-5 bg-white/10" />

                {/* Avg progress */}
                <div className="flex items-center gap-1.5">
                  <TrendingUp className="w-3.5 h-3.5 text-blue-400" />
                  <span className="text-xs text-blue-400 font-medium tabular-nums">
                    {derivedStats?.avgProgress ?? 0}%
                  </span>
                  <span className="text-[10px] text-white/50">progreso</span>
                </div>
                <div className="w-px h-5 bg-white/10" />

                {/* GPS Active */}
                <div className="flex items-center gap-1.5">
                  <Radio className="w-3.5 h-3.5 text-violet-400" />
                  <span className="text-xs text-violet-400 font-medium tabular-nums">
                    {derivedStats?.gpsActiveCount ?? 0}
                  </span>
                  <span className="text-[10px] text-white/50">GPS</span>
                </div>
                <div className="w-px h-5 bg-white/10" />

                {/* Avg Speed */}
                {derivedStats && derivedStats.estimatedSpeed > 0 && (
                  <>
                    <div className="flex items-center gap-1.5">
                      <Gauge className="w-3.5 h-3.5 text-cyan-400" />
                      <span className="text-xs text-cyan-400 font-medium tabular-nums">
                        {derivedStats.estimatedSpeed} km/h
                      </span>
                    </div>
                    <div className="w-px h-5 bg-white/10" />
                  </>
                )}

                {/* Fleet utilization */}
                <div className="flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5 text-white/50" />
                  <span className="text-xs text-white/60 font-medium tabular-nums">
                    {derivedStats?.utilization ?? 0}%
                  </span>
                  <span className="text-[10px] text-white/50">flota</span>
                </div>
                <div className="w-px h-5 bg-white/10" />

                {/* Temperature + Alerts */}
                <div className="flex items-center gap-1.5 group relative">
                  <Thermometer className="w-3.5 h-3.5 text-white/40" />
                  <span className="text-xs tabular-nums font-medium"
                    style={{
                      color: derivedStats?.avgTemp != null
                        ? derivedStats.avgTemp > 28 ? '#f87171'
                          : derivedStats.avgTemp < 10 ? '#60a5fa'
                          : '#34d399'
                        : 'rgb(255 255 255 / 0.4)'
                    }}
                  >
                    {derivedStats?.avgTemp != null
                      ? derivedStats.avgTemp + '°C'
                      : '---'}
                  </span>
                  {derivedStats?.avgTemp != null && (
                    <span className="text-[10px] text-white/50">
                      avg
                    </span>
                  )}
                  {/* Hot temperature alert badge */}
                  {(derivedStats?.hotTempCount ?? 0) > 0 && (
                    <>
                      <div className="w-px h-5 bg-white/10" />
                      <div className="flex items-center gap-1.5">
                        <div className="relative">
                          <div className="absolute inset-0 rounded-full bg-red-400 animate-ping opacity-50" />
                          <AlertTriangle className="relative w-3.5 h-3.5 text-red-400" />
                        </div>
                        <span className="text-xs font-bold text-red-400 tabular-nums">
                          {derivedStats!.hotTempCount}
                        </span>
                        <span className="text-[10px] text-red-400/70">
                          &gt;28°C
                        </span>
                        {/* Tooltip on hover with affected routes */}
                        <div className="absolute top-full left-0 mt-2 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 pointer-events-none z-20">
                          <div className="bg-slate-900/95 backdrop-blur-md border border-red-500/30 rounded-xl p-3 min-w-[200px] shadow-2xl">
                            <div className="flex items-center gap-2 mb-2 pb-2 border-b border-white/10">
                              <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                              <span className="text-xs font-bold text-red-400 uppercase tracking-wider">
                                Alerta de Temperatura
                              </span>
                            </div>
                            <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
                              {derivedStats!.hotTempRoutes.map((r, i) => (
                                <div key={i} className="flex items-center justify-between gap-2 text-[10px]">
                                  <span className="font-medium text-white/80 truncate">
                                    {r.batchNumber}
                                  </span>
                                  <span className="font-bold text-red-400 tabular-nums whitespace-nowrap">
                                    {r.temp.toFixed(1)}°C
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </div>
                <div className="w-px h-5 bg-white/10" />

                {/* Timestamp */}
                <div className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-white/40" />
                  <span className="text-xs text-white/40 tabular-nums">
                    {streamData?.timestamp
                      ? new Date(streamData.timestamp).toLocaleTimeString()
                      : '--:--:--'}
                  </span>
                </div>
              </div>

              {/* Exit button */}
              <button
                onClick={toggleFullscreen}
                className="pointer-events-auto flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-500/20 border border-red-500/30 text-red-400 hover:bg-red-500/30 transition-all text-sm font-medium"
              >
                <Minimize2 className="w-4 h-4" />
                Salir
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Events feed ── */}
      {streamData?.events && streamData.events.length > 0 && (
        <div className="rounded-xl bg-muted/30 dark:bg-white/[0.03] border border-border dark:border-white/10 overflow-hidden">
          <div className="p-4 border-b border-border/5 dark:border-white/5">
            <div className="text-sm font-medium text-foreground dark:text-white">Eventos Recientes</div>
          </div>
          <div className="divide-y divide-border/5 dark:divide-white/5 max-h-64 overflow-y-auto">
            {streamData.events.slice(0, 20).map((ev) => {
              const icon = eventIconMap[ev.icon] || <Clock className="w-3.5 h-3.5" />
              const colorClass = eventColorMap[ev.color] || 'bg-white/10 text-white/40'
              return (
                <div key={ev.id} className="p-3 flex items-start gap-3">
                  <div
                    className={'w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ' + colorClass}
                  >
                    {icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-foreground/80 dark:text-white/80">{ev.description}</div>
                    <div className="text-[10px] text-muted-foreground/50 dark:text-white/30 mt-0.5">
                      {ev.location && <span>{ev.location} &middot; </span>}
                      {new Date(ev.timestamp).toLocaleTimeString()}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
