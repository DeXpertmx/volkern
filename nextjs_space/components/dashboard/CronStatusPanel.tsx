'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Clock, CheckCircle2, XCircle, MinusCircle, RefreshCw, Timer } from 'lucide-react'

interface CronJobStatus {
  id: string
  label: string
  schedule: string
  lastRunAt: string | null
  lastResult: 'success' | 'error' | 'skipped' | null
  lastMessage: string | null
  lastDurationMs: number | null
}

interface CronStatusResponse {
  jobs: CronJobStatus[]
  processUptime: number
  processPid: number
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

function formatDuration(ms: number | null): string {
  if (ms === null) return '—'
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function ResultIcon({ result }: { result: CronJobStatus['lastResult'] }) {
  switch (result) {
    case 'success':
      return <CheckCircle2 className="h-4 w-4 text-emerald-500" />
    case 'error':
      return <XCircle className="h-4 w-4 text-red-500" />
    case 'skipped':
      return <MinusCircle className="h-4 w-4 text-slate-400" />
    default:
      return <Clock className="h-4 w-4 text-slate-300" />
  }
}

function ResultBadge({ result }: { result: CronJobStatus['lastResult'] }) {
  const variants: Record<string, string> = {
    success: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    error: 'bg-red-50 text-red-700 border-red-200',
    skipped: 'bg-slate-50 text-slate-500 border-slate-200',
  }
  const labels: Record<string, string> = {
    success: 'OK',
    error: 'Error',
    skipped: 'Skip',
  }
  if (!result) {
    return (
      <Badge variant="outline" className="bg-slate-50 text-slate-400 border-slate-200 text-[10px]">
        Pendiente
      </Badge>
    )
  }
  return (
    <Badge variant="outline" className={`${variants[result]} text-[10px] font-semibold`}>
      {labels[result]}
    </Badge>
  )
}

export function CronStatusPanel() {
  const [data, setData] = useState<CronStatusResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchStatus = async () => {
    try {
      setLoading(true)
      const res = await fetch('/api/cron-status')
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

  useEffect(() => {
    fetchStatus()
    const interval = setInterval(fetchStatus, 30000) // refresh cada 30s
    return () => clearInterval(interval)
  }, [])

  return (
    <Card className="border-none shadow-xl ring-1 ring-border/50 overflow-hidden">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-slate-100 rounded-lg">
              <Timer className="h-5 w-5 text-slate-600" />
            </div>
            <div>
              <CardTitle className="text-base font-bold">Tareas Programadas</CardTitle>
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">
                Estado de los cron jobs del sistema
              </p>
            </div>
          </div>
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
      </CardHeader>
      <CardContent>
        {error ? (
          <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-center">
            <p className="text-red-600 text-sm font-medium">{error}</p>
          </div>
        ) : !data ? (
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="h-5 w-5 animate-spin text-slate-400" />
          </div>
        ) : (
          <div className="space-y-3">
            {data.processUptime > 0 && (
              <div className="flex items-center gap-2 text-[10px] text-slate-400 font-mono px-1 mb-4">
                <span>PID {data.processPid}</span>
                <span>·</span>
                <span>Uptime: {Math.floor(data.processUptime / 3600)}h {Math.floor((data.processUptime % 3600) / 60)}min</span>
              </div>
            )}
            {data.jobs.map((job) => (
              <div
                key={job.id}
                className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl hover:bg-slate-100 transition-colors"
              >
                <ResultIcon result={job.lastResult} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm text-slate-800 truncate">
                      {job.label}
                    </span>
                    <ResultBadge result={job.lastResult} />
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-[10px] text-slate-500 font-mono">
                    <span>{job.schedule}</span>
                    <span>·</span>
                    <span>{timeAgo(job.lastRunAt)}</span>
                    {job.lastDurationMs !== null && (
                      <>
                        <span>·</span>
                        <span>{formatDuration(job.lastDurationMs)}</span>
                      </>
                    )}
                  </div>
                  {job.lastMessage && job.lastResult === 'error' && (
                    <p className="text-[10px] text-red-500 mt-1 truncate">{job.lastMessage}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
