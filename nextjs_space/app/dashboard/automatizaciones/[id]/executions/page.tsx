'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, Play, CheckCircle2, XCircle, PauseCircle, Clock, RefreshCw, ChevronDown, ChevronRight, AlertCircle } from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'

interface ExecutionLog {
  id: string
  nodeId: string
  nodeType: string
  status: string
  message: string
  data?: any
  externalWorkflowId?: string
  externalStatus?: string
  externalResponse?: any
  duration?: number
  fechaCreacion: string
}

interface Execution {
  id: string
  automationId: string
  estado: string
  contextData: any
  errorMessage?: string
  fechaInicio: string
  fechaFin?: string
  currentNodeId?: string
  logs: ExecutionLog[]
}

interface Stats {
  totalExecutions: number
  completedExecutions: number
  errorExecutions: number
  pausedExecutions: number
  successRate: number
  recentExecutions: { id: string; estado: string; fechaInicio: string; fechaFin?: string; errorMessage?: string }[]
}

const estadoConfig: Record<string, { label: string; icon: any; color: string; bg: string }> = {
  ejecutando: { label: 'Ejecutando', icon: Play, color: 'text-blue-600', bg: 'bg-blue-100' },
  completado: { label: 'Completado', icon: CheckCircle2, color: 'text-green-600', bg: 'bg-green-100' },
  error: { label: 'Error', icon: XCircle, color: 'text-red-600', bg: 'bg-red-100' },
  pausado: { label: 'Pausado', icon: PauseCircle, color: 'text-yellow-600', bg: 'bg-yellow-100' },
}

const nodeTypeLabels: Record<string, string> = {
  trigger: 'Trigger',
  action: 'Acción',
  condition: 'Condición',
  delay: 'Delay',
  external_workflow: 'Workflow Externo',
}

export default function AutomationExecutionsPage() {
  const params = useParams()
  const router = useRouter()
  const automationId = params.id as string

  const [executions, setExecutions] = useState<Execution[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [expandedExecution, setExpandedExecution] = useState<string | null>(null)
  const [page, setPage] = useState(0)
  const [total, setTotal] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const pageSize = 20

  useEffect(() => {
    fetchData()
  }, [automationId, page])

  const fetchData = async () => {
    try {
      setLoading(true)
      const [execRes, statsRes] = await Promise.all([
        fetch(`/api/automatizaciones/${automationId}/executions?limit=${pageSize}&offset=${page * pageSize}`),
        fetch(`/api/automatizaciones/${automationId}/stats`),
      ])

      if (!execRes.ok || !statsRes.ok) throw new Error('Error al cargar datos')

      const execData = await execRes.json()
      const statsData = await statsRes.json()

      setExecutions(execData.executions)
      setTotal(execData.total)
      setStats(statsData)
    } catch (error) {
      console.error('Error:', error)
      toast.error('Error al cargar ejecuciones')
    } finally {
      setLoading(false)
    }
  }

  const handleRefresh = async () => {
    setRefreshing(true)
    await fetchData()
    setRefreshing(false)
  }

  const formatDuration = (start: string, end?: string) => {
    if (!end) return null
    const ms = new Date(end).getTime() - new Date(start).getTime()
    if (ms < 1000) return `${ms}ms`
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
    return `${(ms / 60000).toFixed(1)}min`
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('es-MX', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/dashboard/automatizaciones">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">Historial de Ejecuciones</h1>
            <p className="text-muted-foreground">
              Registro detallado de todas las ejecuciones de esta automatización
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
          <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
          Actualizar
        </Button>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid gap-4 grid-cols-2 md:grid-cols-5">
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">{stats.totalExecutions}</div>
              <p className="text-xs text-muted-foreground">Total Ejecuciones</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-green-600">{stats.completedExecutions}</div>
              <p className="text-xs text-muted-foreground">Completadas</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-red-600">{stats.errorExecutions}</div>
              <p className="text-xs text-muted-foreground">Con Error</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-yellow-600">{stats.pausedExecutions}</div>
              <p className="text-xs text-muted-foreground">Pausadas</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">{stats.successRate}%</div>
              <p className="text-xs text-muted-foreground">Tasa de Éxito</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Executions List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="pt-6">
                <div className="h-6 bg-muted rounded w-3/4 mb-2"></div>
                <div className="h-4 bg-muted rounded w-1/2"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : executions.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Clock className="h-16 w-16 text-muted-foreground mb-4" />
            <h3 className="text-xl font-semibold mb-2">Sin ejecuciones</h3>
            <p className="text-muted-foreground text-center max-w-md">
              Esta automatización aún no ha sido ejecutada.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {executions.map((execution) => {
            const config = estadoConfig[execution.estado] || { label: execution.estado, icon: Clock, color: 'text-gray-600', bg: 'bg-gray-100' }
            const Icon = config.icon
            const isExpanded = expandedExecution === execution.id
            const duration = formatDuration(execution.fechaInicio, execution.fechaFin)

            return (
              <Card key={execution.id} className="overflow-hidden">
                <div
                  className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => setExpandedExecution(isExpanded ? null : execution.id)}
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <Icon className={`h-5 w-5 ${config.color}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">
                          {formatDate(execution.fechaInicio)}
                        </span>
                        {duration && (
                          <span className="text-xs text-muted-foreground">
                            ({duration})
                          </span>
                        )}
                      </div>
                      {execution.errorMessage && (
                        <p className="text-xs text-red-500 truncate">
                          {execution.errorMessage}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className={`${config.bg} ${config.color} border-0`}>
                      {config.label}
                    </Badge>
                    {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </div>
                </div>

                {isExpanded && execution.logs && execution.logs.length > 0 && (
                  <div className="border-t bg-muted/20">
                    <div className="p-4 space-y-2">
                      <h4 className="text-sm font-medium mb-3">Log de Ejecución</h4>
                      {execution.logs.map((log, idx) => (
                        <div
                          key={log.id}
                          className={`flex items-start gap-3 p-3 rounded-lg text-sm ${
                            log.status === 'error' ? 'bg-red-50 border border-red-100' : 'bg-background border'
                          }`}
                        >
                          <div className="flex-shrink-0 w-6 h-6 rounded-full bg-muted flex items-center justify-center text-xs font-medium">
                            {idx + 1}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="text-xs">
                                {nodeTypeLabels[log.nodeType] || log.nodeType}
                              </Badge>
                              {log.status === 'error' ? (
                                <AlertCircle className="h-3 w-3 text-red-500" />
                              ) : (
                                <CheckCircle2 className="h-3 w-3 text-green-500" />
                              )}
                              {log.duration && (
                                <span className="text-xs text-muted-foreground">
                                  {log.duration}ms
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">
                              {log.message}
                            </p>
                            {log.status === 'error' && log.message && (
                              <p className="text-xs text-red-600 mt-1 font-mono">
                                {log.message}
                              </p>
                            )}
                            {log.externalWorkflowId && (
                              <p className="text-xs text-muted-foreground mt-1">
                                Workflow: {log.externalWorkflowId} ({log.externalStatus})
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </Card>
            )
          })}

          {/* Pagination */}
          {total > pageSize && (
            <div className="flex items-center justify-between pt-4">
              <p className="text-sm text-muted-foreground">
                Mostrando {page * pageSize + 1}-{Math.min((page + 1) * pageSize, total)} de {total}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page === 0}
                  onClick={() => setPage(p => p - 1)}
                >
                  Anterior
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={(page + 1) * pageSize >= total}
                  onClick={() => setPage(p => p + 1)}
                >
                  Siguiente
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
