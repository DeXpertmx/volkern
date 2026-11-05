'use client'

import { useState, useEffect, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Radio,
  RefreshCw,
  ShieldAlert,
  MessageSquare,
  Smartphone,
  RotateCcw,
  Unlock,
  Search,
  X,
} from 'lucide-react'

interface ChatMetric {
  chatId: string
  name?: string
  count: number
}

interface DayMetric {
  date: string
  telegram: number
  evolution: number
  total: number
}

interface LastRejected {
  chatId: string | null
  name: string | null
  channel: 'telegram' | 'evolution' | null
  at: string | null
}

interface WebhookMetrics {
  today: { telegram: number; evolution: number; total: number }
  topChats: ChatMetric[]
  byDay: DayMetric[]
  lastRejectedAt: string | null
  lastRejectedChannel: 'telegram' | 'evolution' | null
  lastRejected?: LastRejected | null
}

interface IpSecretLimitEntry {
  ip: string
  fallos: number
  /** Segundos restantes del bloqueo o de la ventana de fallos. */
  restanteSegundos: number | null
}

interface SecretLimitMetrics {
  bloqueadas: IpSecretLimitEntry[]
  fallos: IpSecretLimitEntry[]
  totalBloqueadas: number
  totalFallos: number
}

interface AccionReciente {
  id: string
  accion: 'telegram_secret_ip_desbloqueada' | 'webhook_metrics_reset'
  /** IP desbloqueada, o 'rate-limit' en los reinicios. */
  objetivo: string
  descripcion: string
  autor: string | null
  fallosDescartados: number
  fecha: string
}

type FiltroAccion = 'todo' | 'desbloqueo' | 'reinicio'

const OPCIONES_FILTRO: { valor: FiltroAccion; etiqueta: string }[] = [
  { valor: 'todo', etiqueta: 'Todo' },
  { valor: 'desbloqueo', etiqueta: 'Desbloqueos' },
  { valor: 'reinicio', etiqueta: 'Reinicios' },
]

interface WebhookStatusResponse {
  metrics: WebhookMetrics
  /** Cortafuegos por IP de los secrets inválidos del webhook de Telegram. */
  secretLimit?: SecretLimitMetrics
  /** Desbloqueos y reinicios recientes leídos del audit log. */
  historial?: AccionReciente[]
  /** Cursor para pedir la página siguiente; `null` en la última. */
  historialCursor?: string | null
  /** Hay más páginas después de esta. */
  historialHayMas?: boolean
  /** Filtros que el servidor aplicó de verdad al historial. */
  historialFiltros?: { accion: string | null; autor: string | null }
  isAdmin?: boolean
  processUptime: number
  processPid: number
  timestamp: string
}

function timeAgo(iso: string | null): string {
  if (!iso) return 'Nunca'
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Hace instantes'
  if (mins < 60) return `Hace ${mins} min`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `Hace ${hours}h ${mins % 60}min`
  const days = Math.floor(hours / 24)
  return `Hace ${days}d ${hours % 24}h`
}

function formatDate(date: string): string {
  // date viene en YYYY-MM-DD (UTC); se muestra tal cual con el día
  const [, m, d] = date.split('-')
  return `${d}/${m}`
}

function restante(segundos: number | null): string {
  if (segundos === null) return '—'
  if (segundos < 60) return `${segundos} s`
  const mins = Math.ceil(segundos / 60)
  return mins >= 60 ? `${Math.floor(mins / 60)} h ${mins % 60} min` : `${mins} min`
}

function shortChat(chatId: string): string {
  if (chatId.length <= 16) return chatId
  return `${chatId.slice(0, 10)}…${chatId.slice(-4)}`
}

function chatLabel(chat: ChatMetric): { title: string; subtitle: string } {
  const raw = chat.chatId
  const hasName = chat.name && chat.name !== raw
  return {
    title: hasName ? String(chat.name) : `ID ${shortChat(raw)}`,
    subtitle: hasName ? shortChat(raw) : chatIdKind(raw),
  }
}

function chatIdKind(chatId: string): string {
  const isWhatsApp = /^\d{10,}$/.test(chatId) && chatId.startsWith('52')
  return isWhatsApp ? 'WhatsApp' : 'Telegram'
}

function ChannelIcon({ channel }: { channel: 'telegram' | 'evolution' | null }) {
  if (channel === 'evolution') return <Smartphone className="h-3.5 w-3.5 text-emerald-500" />
  return <MessageSquare className="h-3.5 w-3.5 text-sky-500" />
}

export function WebhookStatusPanel() {
  const [data, setData] = useState<WebhookStatusResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Error de una acción (reset, desbloqueo): se muestra sin ocultar los datos,
  // porque el estado cargado sigue siendo válido.
  const [accionError, setAccionError] = useState<string | null>(null)
  const [resetting, setResetting] = useState(false)
  const [desbloqueando, setDesbloqueando] = useState<string | null>(null)
  const [filtroAccion, setFiltroAccion] = useState<FiltroAccion>('todo')
  const [filtroAutor, setFiltroAutor] = useState('')
  // Pila de cursores ya usados: `cursores[i]` es el cursor con el que se pidió la
  // página i+1, así que la página actual es `cursores.length + 1`.
  const [cursores, setCursores] = useState<string[]>([])
  const cursorActual = cursores.length > 0 ? cursores[cursores.length - 1] : null

  // Los filtros y el cursor viajan al servidor: filtrar en el cliente la página
  // ya recortada no encontraría casi nada. El ref permite que el sondeo
  // periódico (creado una sola vez) use siempre la consulta vigente.
  const consultaRef = useRef<{ accion: FiltroAccion; autor: string; cursor: string | null }>({
    accion: 'todo',
    autor: '',
    cursor: null,
  })
  const primerRender = useRef(true)

  useEffect(() => {
    consultaRef.current = { accion: filtroAccion, autor: filtroAutor, cursor: cursorActual }
  }, [filtroAccion, filtroAutor, cursorActual])

  const urlEstado = () => {
    const { accion, autor, cursor } = consultaRef.current
    const params = new URLSearchParams()
    if (accion !== 'todo') params.set('accion', accion)
    const texto = autor.trim()
    if (texto) params.set('autor', texto)
    if (cursor) params.set('cursor', cursor)
    const qs = params.toString()
    return qs ? `/api/webhook-status?${qs}` : '/api/webhook-status'
  }

  const fetchStatus = async (silencioso = false) => {
    try {
      if (!silencioso) setLoading(true)
      const res = await fetch(urlEstado())
      if (res.ok) {
        const json = await res.json()
        setData(json)
        setError(null)
      } else {
        setError(`HTTP ${res.status}`)
      }
    } catch (e) {
      setError('Error de conexión')
    } finally {
      setLoading(false)
    }
  }

  const resetMetrics = async () => {
    if (!confirm('¿Reiniciar las métricas de rate-limit de hoy? Esta acción no se puede deshacer.')) return
    setResetting(true)
    setAccionError(null)
    try {
      const res = await fetch('/api/webhook-status', { method: 'POST' })
      if (res.ok) {
        await fetchStatus()
      } else {
        setAccionError(`Reset: HTTP ${res.status}`)
      }
    } catch (e) {
      setAccionError('Error al reiniciar')
    } finally {
      setResetting(false)
    }
  }

  const desbloquearIp = async (ip: string) => {
    if (
      !confirm(
        `¿Desbloquear ${ip}? Volverá a poder enviar updates; si insiste con secrets inválidos se bloqueará otra vez.`
      )
    )
      return
    setDesbloqueando(ip)
    setAccionError(null)
    try {
      const res = await fetch(`/api/webhook-status?ip=${encodeURIComponent(ip)}`, {
        method: 'DELETE',
      })
      if (res.ok) {
        await fetchStatus()
      } else {
        setAccionError(`Desbloquear: HTTP ${res.status}`)
      }
    } catch (e) {
      setAccionError('Error al desbloquear')
    } finally {
      setDesbloqueando(null)
    }
  }

  useEffect(() => {
    fetchStatus()
    const interval = setInterval(() => fetchStatus(true), 30000) // refresh cada 30s
    return () => clearInterval(interval)
  }, [])

  // Al cambiar filtro o página se recarga sin parpadeo (el texto, con un
  // pequeño retardo para no pedir en cada tecla). El primer render ya cargó.
  useEffect(() => {
    if (primerRender.current) {
      primerRender.current = false
      return
    }
    const t = setTimeout(() => fetchStatus(true), filtroAutor ? 350 : 0)
    return () => clearTimeout(t)
  }, [filtroAccion, filtroAutor, cursores])

  // Cambiar de filtro invalida la paginación: los cursores son de otra lista.
  const elegirFiltroAccion = (valor: FiltroAccion) => {
    setCursores([])
    setFiltroAccion(valor)
  }

  const cambiarAutor = (valor: string) => {
    setCursores([])
    setFiltroAutor(valor)
  }

  const quitarFiltros = () => {
    setCursores([])
    setFiltroAccion('todo')
    setFiltroAutor('')
  }

  const paginaSiguiente = () => {
    const cursor = data?.historialCursor
    if (!cursor) return
    setCursores((prev) => [...prev, cursor])
  }

  const paginaAnterior = () => {
    setCursores((prev) => prev.slice(0, -1))
  }

  const metrics = data?.metrics
  const maxDay = metrics?.byDay.reduce((max, d) => Math.max(max, d.total), 0) || 1
  const hayFiltrosHistorial = filtroAccion !== 'todo' || filtroAutor.trim() !== ''
  const numeroPagina = cursores.length + 1
  const hayPaginaSiguiente = Boolean(data?.historialHayMas && data?.historialCursor)

  return (
    <Card className="border-none shadow-xl ring-1 ring-border/50 overflow-hidden">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-slate-100 rounded-lg">
              <Radio className="h-5 w-5 text-slate-600" />
            </div>
            <div>
              <CardTitle className="text-base font-bold">Estado del Webhook</CardTitle>
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">
                Rechazos 429 por chat y bloqueos por IP
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {data?.isAdmin && (
              <Button
                variant="ghost"
                size="sm"
                onClick={resetMetrics}
                disabled={resetting || loading}
                title="Reiniciar métricas del día (solo admin)"
                className="h-8 px-2 text-rose-500 hover:text-rose-600 hover:bg-rose-50"
              >
                <RotateCcw className={`h-4 w-4 ${resetting ? 'animate-spin' : ''}`} />
                <span className="text-[10px] font-semibold">Reset</span>
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => fetchStatus()}
              disabled={loading}
              className="h-8 w-8 p-0"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {error ? (
          <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-center">
            <p className="text-red-600 text-sm font-medium">{error}</p>
          </div>
        ) : !metrics ? (
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="h-5 w-5 animate-spin text-slate-400" />
          </div>
        ) : (
          <div className="space-y-4">
            {accionError && (
              <div className="p-2.5 bg-red-50 border border-red-200 rounded-xl">
                <p className="text-red-600 text-[11px] font-medium">{accionError}</p>
              </div>
            )}

            {/* Resumen de hoy */}
            <div className="grid grid-cols-3 gap-3">
              <div className="p-3 bg-slate-50 rounded-xl text-center">
                <div className="flex items-center justify-center gap-1 mb-1">
                  <ShieldAlert className="h-3.5 w-3.5 text-slate-400" />
                  <span className="text-[10px] text-slate-500 font-bold uppercase">Total hoy</span>
                </div>
                <p className="text-2xl font-extrabold text-slate-800">
                  {metrics.today.total}
                </p>
              </div>
              <div className="p-3 bg-sky-50 rounded-xl text-center">
                <div className="flex items-center justify-center gap-1 mb-1">
                  <MessageSquare className="h-3.5 w-3.5 text-sky-500" />
                  <span className="text-[10px] text-sky-600 font-bold uppercase">Telegram</span>
                </div>
                <p className="text-2xl font-extrabold text-sky-700">{metrics.today.telegram}</p>
              </div>
              <div className="p-3 bg-emerald-50 rounded-xl text-center">
                <div className="flex items-center justify-center gap-1 mb-1">
                  <Smartphone className="h-3.5 w-3.5 text-emerald-500" />
                  <span className="text-[10px] text-emerald-600 font-bold uppercase">WhatsApp</span>
                </div>
                <p className="text-2xl font-extrabold text-emerald-700">{metrics.today.evolution}</p>
              </div>
            </div>

            {/* Último rechazo */}
            {(() => {
              const last = metrics.lastRejected
              const at = last?.at ?? metrics.lastRejectedAt
              const channel = last?.channel ?? metrics.lastRejectedChannel
              const chatId = last?.chatId
              if (!at) return null
              const hasName = last?.name && last.name !== chatId
              return (
                <div className="flex items-center gap-2 text-[10px] px-1">
                  <span className="text-slate-400 font-medium">Último rechazo:</span>
                  <ChannelIcon channel={channel} />
                  {chatId && (
                    <span className="font-semibold text-slate-600">
                      {hasName ? last!.name : `ID ${shortChat(chatId)}`}
                    </span>
                  )}
                  {chatId && hasName && (
                    <span className="text-slate-400 font-mono">{shortChat(chatId)}</span>
                  )}
                  <span className="text-slate-400 font-mono">· {timeAgo(at)}</span>
                </div>
              )
            })()}

            {/* Cortafuegos de secret por IP */}
            <div>
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-2 px-1">
                Secret del webhook (por IP)
              </p>
              {!data?.secretLimit ||
              (data.secretLimit.bloqueadas.length === 0 && data.secretLimit.fallos.length === 0) ? (
                <p className="text-xs text-slate-400 px-1">
                  Sin secrets inválidos ni IPs bloqueadas.
                </p>
              ) : (
                <div className="space-y-2">
                  {data.secretLimit.bloqueadas.map((entry) => (
                    <div
                      key={`bloqueada-${entry.ip}`}
                      className="flex items-center gap-3 p-2.5 bg-rose-50 rounded-xl"
                    >
                      <ShieldAlert className="h-4 w-4 text-rose-500 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-rose-700 font-mono truncate">
                          {entry.ip}
                        </p>
                        <p className="text-[10px] text-rose-500/80">
                          bloqueada tras {entry.fallos} secrets inválidos
                        </p>
                      </div>
                      <Badge
                        variant="outline"
                        className="bg-rose-100 text-rose-700 border-rose-200 text-[10px] font-semibold whitespace-nowrap"
                      >
                        {restante(entry.restanteSegundos)}
                      </Badge>
                      {data?.isAdmin && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => desbloquearIp(entry.ip)}
                          disabled={desbloqueando === entry.ip}
                          title={`Desbloquear ${entry.ip} (solo admin)`}
                          className="h-7 px-2 text-rose-600 hover:text-rose-700 hover:bg-rose-100 shrink-0"
                        >
                          <Unlock
                            className={`h-3.5 w-3.5 ${desbloqueando === entry.ip ? 'animate-pulse' : ''}`}
                          />
                          <span className="text-[10px] font-semibold">Desbloquear</span>
                        </Button>
                      )}
                    </div>
                  ))}
                  {data.secretLimit.fallos.map((entry) => (
                    <div
                      key={`fallos-${entry.ip}`}
                      className="flex items-center gap-3 p-2.5 bg-slate-50 rounded-xl"
                    >
                      <ShieldAlert className="h-4 w-4 text-amber-500 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-slate-700 font-mono truncate">
                          {entry.ip}
                        </p>
                        <p className="text-[10px] text-slate-400">
                          aún sin bloquear · ventana {restante(entry.restanteSegundos)}
                        </p>
                      </div>
                      <Badge
                        variant="outline"
                        className="bg-amber-50 text-amber-700 border-amber-200 text-[10px] font-semibold whitespace-nowrap"
                      >
                        {entry.fallos} fallo{entry.fallos === 1 ? '' : 's'}
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Últimas acciones del panel (audit log) */}
            {data?.historial &&
              (data.historial.length > 0 || hayFiltrosHistorial || Boolean(cursorActual)) && (
              <div>
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-2 px-1">
                  Últimas acciones (auditoría)
                </p>

                <div className="flex flex-wrap items-center gap-1.5 mb-2 px-1">
                  {OPCIONES_FILTRO.map((opcion) => {
                    const activo = filtroAccion === opcion.valor
                    return (
                      <button
                        key={opcion.valor}
                        type="button"
                        onClick={() => elegirFiltroAccion(opcion.valor)}
                        aria-pressed={activo}
                        className={`px-2 py-1 rounded-lg text-[10px] font-semibold transition-colors ${
                          activo
                            ? 'bg-slate-800 text-white'
                            : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                        }`}
                      >
                        {opcion.etiqueta}
                      </button>
                    )
                  })}
                  <div className="relative flex-1 min-w-[8rem]">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400" />
                    <input
                      value={filtroAutor}
                      onChange={(e) => cambiarAutor(e.target.value)}
                      placeholder="Filtrar por autor…"
                      aria-label="Filtrar el historial por autor"
                      className="w-full pl-7 pr-6 h-7 rounded-lg bg-slate-100 text-[11px] text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-300"
                    />
                    {filtroAutor && (
                      <button
                        type="button"
                        onClick={() => cambiarAutor('')}
                        aria-label="Limpiar el filtro por autor"
                        className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-600"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </div>

                {data.historial.length === 0 ? (
                  <div className="flex items-center justify-between gap-2 p-2.5 bg-slate-50 rounded-xl">
                    <p className="text-[11px] text-slate-400">
                      {hayFiltrosHistorial
                        ? 'Sin acciones con esos filtros.'
                        : 'Sin acciones en esta página.'}
                    </p>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={quitarFiltros}
                      className="h-7 px-2 text-slate-600 hover:bg-slate-200 shrink-0"
                    >
                      <span className="text-[10px] font-semibold">Quitar filtros</span>
                    </Button>
                  </div>
                ) : (
                <div className="space-y-2">
                  {data.historial.map((accion) => {
                    const esDesbloqueo = accion.accion === 'telegram_secret_ip_desbloqueada'
                    return (
                      <div
                        key={accion.id}
                        className="flex items-center gap-3 p-2.5 bg-slate-50 rounded-xl"
                      >
                        <div
                          className={`p-1.5 rounded-lg shrink-0 ${
                            esDesbloqueo ? 'bg-sky-50' : 'bg-amber-50'
                          }`}
                        >
                          {esDesbloqueo ? (
                            <Unlock className="h-3.5 w-3.5 text-sky-600" />
                          ) : (
                            <RotateCcw className="h-3.5 w-3.5 text-amber-600" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-slate-700 truncate">
                            {esDesbloqueo
                              ? `Desbloqueo de ${accion.objetivo}`
                              : 'Reinicio de métricas'}
                          </p>
                          <p className="text-[10px] text-slate-400 truncate">
                            {accion.autor ?? 'Autor no registrado'}
                            {esDesbloqueo && accion.fallosDescartados > 0
                              ? ` · ${accion.fallosDescartados} fallo${
                                  accion.fallosDescartados === 1 ? '' : 's'
                                } descartado${accion.fallosDescartados === 1 ? '' : 's'}`
                              : ''}
                          </p>
                        </div>
                        <span className="text-[10px] text-slate-400 font-mono whitespace-nowrap">
                          {timeAgo(accion.fecha)}
                        </span>
                      </div>
                    )
                  })}
                </div>
                )}

                {(hayPaginaSiguiente || numeroPagina > 1) && (
                  <div className="flex items-center justify-between gap-2 mt-2 px-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={paginaAnterior}
                      disabled={numeroPagina === 1}
                      aria-label="Página anterior del historial"
                      className="h-7 px-2 text-slate-600 hover:bg-slate-200 disabled:opacity-40"
                    >
                      <span className="text-[10px] font-semibold">‹ Anterior</span>
                    </Button>
                    <span className="text-[10px] text-slate-400 font-mono">
                      Página {numeroPagina}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={paginaSiguiente}
                      disabled={!hayPaginaSiguiente}
                      aria-label="Página siguiente del historial"
                      className="h-7 px-2 text-slate-600 hover:bg-slate-200 disabled:opacity-40"
                    >
                      <span className="text-[10px] font-semibold">Siguiente ›</span>
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* Top chats */}
            <div>
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-2 px-1">
                Chats con más rechazos (hoy)
              </p>
              {metrics.topChats.length === 0 ? (
                <p className="text-xs text-slate-400 px-1">Sin rechazos hoy — todos los mensajes pasan sin límite.</p>
              ) : (
                <div className="space-y-2">
                  {metrics.topChats.map((chat) => {
                    const label = chatLabel(chat)
                    return (
                    <div
                      key={chat.chatId}
                      className="flex items-center gap-3 p-2.5 bg-slate-50 rounded-xl hover:bg-slate-100 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-slate-700 truncate">{label.title}</p>
                        <p className="text-[10px] text-slate-400 font-mono truncate">{label.subtitle}</p>
                        <div className="h-1.5 bg-slate-200 rounded-full mt-1.5 overflow-hidden">
                          <div
                            className="h-full bg-amber-400 rounded-full"
                            style={{ width: `${Math.min(100, (chat.count / Math.max(1, metrics.topChats[0].count)) * 100)}%` }}
                          />
                        </div>
                      </div>
                      <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-[10px] font-semibold">
                        {chat.count}× 429
                      </Badge>
                    </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Histórico por día */}
            <div>
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-2 px-1">
                Últimos 7 días
              </p>
              <div className="flex items-end gap-1.5 h-20 px-1">
                {[...metrics.byDay].reverse().map((day) => (
                  <div key={day.date} className="flex-1 flex flex-col items-center gap-1 min-w-0">
                    <div className="w-full flex items-end justify-center flex-1">
                      {day.total > 0 && (
                        <div
                          className="w-full max-w-8 bg-amber-400 rounded-t-md"
                          style={{ height: `${Math.max(6, (day.total / maxDay) * 56)}px` }}
                          title={`${day.date}: ${day.total} rechazos`}
                        />
                      )}
                    </div>
                    <span className="text-[9px] text-slate-400 font-mono">{formatDate(day.date)}</span>
                  </div>
                ))}
              </div>
            </div>

            {data && data.processUptime > 0 && (
              <div className="flex items-center gap-2 text-[10px] text-slate-400 font-mono px-1 pt-1 border-t border-slate-100">
                <span>PID {data.processPid}</span>
                <span>·</span>
                <span>Uptime: {Math.floor(data.processUptime / 3600)}h {Math.floor((data.processUptime % 3600) / 60)}min</span>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
