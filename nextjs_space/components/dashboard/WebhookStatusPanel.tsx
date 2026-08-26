'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Radio, RefreshCw, ShieldAlert, MessageSquare, Smartphone, RotateCcw } from 'lucide-react'

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

interface WebhookMetrics {
  today: { telegram: number; evolution: number; total: number }
  topChats: ChatMetric[]
  byDay: DayMetric[]
  lastRejectedAt: string | null
  lastRejectedChannel: 'telegram' | 'evolution' | null
}

interface WebhookStatusResponse {
  metrics: WebhookMetrics
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
  const [resetting, setResetting] = useState(false)

  const fetchStatus = async () => {
    try {
      setLoading(true)
      const res = await fetch('/api/webhook-status')
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
    try {
      const res = await fetch('/api/webhook-status', { method: 'POST' })
      if (res.ok) {
        await fetchStatus()
      } else {
        setError(`Reset: HTTP ${res.status}`)
      }
    } catch (e) {
      setError('Error al reiniciar')
    } finally {
      setResetting(false)
    }
  }

  useEffect(() => {
    fetchStatus()
    const interval = setInterval(fetchStatus, 30000) // refresh cada 30s
    return () => clearInterval(interval)
  }, [])

  const metrics = data?.metrics
  const maxDay = metrics?.byDay.reduce((max, d) => Math.max(max, d.total), 0) || 1

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
                Mensajes rechazados con 429 por chat y día
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
              onClick={fetchStatus}
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
            {metrics.lastRejectedAt && (
              <div className="flex items-center gap-2 text-[10px] text-slate-400 font-mono px-1">
                <span>Último rechazo:</span>
                <ChannelIcon channel={metrics.lastRejectedChannel} />
                <span>{timeAgo(metrics.lastRejectedAt)}</span>
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
