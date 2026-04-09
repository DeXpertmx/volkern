'use client'

import { useState, useEffect } from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { RefreshCw, ExternalLink, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

interface N8nWorkflow {
  id: string
  n8nWorkflowId: string
  nombre: string
  descripcion: string | null
  trigger: string | null
  webhookUrl: string | null
  activo: boolean
  totalEjecuciones: number
  ejecucionesExitosas: number
  ejecucionesFallidas: number
  ultimaEjecucion: string | null
}

interface WorkflowSelectorProps {
  value: string
  onChange: (workflowId: string, workflow?: N8nWorkflow) => void
  placeholder?: string
  showStats?: boolean
  filterByTrigger?: string
  disabled?: boolean
}

export function WorkflowSelector({
  value,
  onChange,
  placeholder = 'Selecciona un workflow...',
  showStats = false,
  filterByTrigger,
  disabled = false,
}: WorkflowSelectorProps) {
  const [workflows, setWorkflows] = useState<N8nWorkflow[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchWorkflows = async () => {
    try {
      setLoading(true)
      setError(null)
      
      let url = '/api/automation/external/workflows'
      if (filterByTrigger) {
        url += `?trigger=${encodeURIComponent(filterByTrigger)}`
      }
      
      const res = await fetch(url)
      if (!res.ok) {
        throw new Error('Error al cargar workflows')
      }
      
      const data = await res.json()
      setWorkflows(data.workflows || [])
    } catch (err: any) {
      console.error('Error fetching workflows:', err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const syncWorkflows = async () => {
    try {
      setSyncing(true)
      const res = await fetch('/api/automation/external/sync', {
        method: 'POST',
      })
      
      if (!res.ok) {
        const errData = await res.json()
        throw new Error(errData.error || 'Error al sincronizar')
      }
      
      const data = await res.json()
      toast.success(`Sincronizado: ${data.synced || 0} workflows`)
      await fetchWorkflows()
    } catch (err: any) {
      toast.error(err.message)
    } finally {
      setSyncing(false)
    }
  }

  useEffect(() => {
    fetchWorkflows()
  }, [filterByTrigger])

  const selectedWorkflow = workflows.find(w => w.id === value)

  const getSuccessRate = (workflow: N8nWorkflow) => {
    if (workflow.totalEjecuciones === 0) return 'N/A'
    const rate = (workflow.ejecucionesExitosas / workflow.totalEjecuciones) * 100
    return `${rate.toFixed(0)}%`
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Cargando workflows...
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
        <Button variant="outline" size="sm" onClick={fetchWorkflows}>
          <RefreshCw className="h-3 w-3 mr-1" />
          Reintentar
        </Button>
      </div>
    )
  }

  const activeWorkflows = workflows.filter(w => w.activo)
  const inactiveWorkflows = workflows.filter(w => !w.activo)

  const handleSelect = (val: string) => {
    console.log('[WorkflowSelector] Selected value:', val)
    const wf = workflows.find(w => w.id === val)
    console.log('[WorkflowSelector] Found workflow:', wf)
    onChange(val, wf)
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Select value={value || ''} onValueChange={handleSelect} disabled={disabled}>
          <SelectTrigger className="flex-1">
            <SelectValue placeholder={placeholder}>
              {selectedWorkflow ? selectedWorkflow.nombre : placeholder}
            </SelectValue>
          </SelectTrigger>
          <SelectContent position="popper" sideOffset={4}>
            {workflows.length === 0 ? (
              <div className="p-4 text-center text-sm text-muted-foreground">
                No hay workflows registrados.
                <br />
                <span className="text-xs">Sincroniza desde n8n primero.</span>
              </div>
            ) : (
              <>
                {activeWorkflows.length > 0 && (
                  <SelectGroup>
                    <SelectLabel>Workflows Activos</SelectLabel>
                    {activeWorkflows.map((workflow) => (
                      <SelectItem 
                        key={workflow.id} 
                        value={workflow.id}
                        className="cursor-pointer"
                      >
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="h-3 w-3 text-green-500 flex-shrink-0" />
                          <span className="truncate">{workflow.nombre}</span>
                          {workflow.totalEjecuciones > 0 && (
                            <span className="text-xs text-muted-foreground flex-shrink-0">
                              ({workflow.totalEjecuciones})
                            </span>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectGroup>
                )}
                
                {inactiveWorkflows.length > 0 && (
                  <SelectGroup>
                    <SelectLabel className="text-muted-foreground">Inactivos</SelectLabel>
                    {inactiveWorkflows.map((workflow) => (
                      <SelectItem 
                        key={workflow.id} 
                        value={workflow.id} 
                        className="opacity-60 cursor-pointer"
                      >
                        <div className="flex items-center gap-2">
                          <AlertCircle className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                          <span className="truncate">{workflow.nombre}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectGroup>
                )}
              </>
            )}
          </SelectContent>
        </Select>
        
        <Button
          variant="outline"
          size="icon"
          onClick={syncWorkflows}
          disabled={syncing}
          title="Sincronizar workflows desde n8n"
        >
          <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {/* Estadísticas del workflow seleccionado */}
      {showStats && selectedWorkflow && (
        <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-md border text-xs space-y-1">
          <div className="font-medium text-sm">{selectedWorkflow.nombre}</div>
          {selectedWorkflow.descripcion && (
            <div className="text-muted-foreground">{selectedWorkflow.descripcion}</div>
          )}
          <div className="flex items-center gap-4 mt-2 pt-2 border-t">
            <div>
              <span className="text-muted-foreground">Ejecuciones:</span>{' '}
              <span className="font-medium">{selectedWorkflow.totalEjecuciones}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Éxito:</span>{' '}
              <span className="font-medium text-green-600">{getSuccessRate(selectedWorkflow)}</span>
            </div>
            {selectedWorkflow.ultimaEjecucion && (
              <div>
                <span className="text-muted-foreground">Última:</span>{' '}
                <span className="font-medium">
                  {new Date(selectedWorkflow.ultimaEjecucion).toLocaleDateString()}
                </span>
              </div>
            )}
          </div>
          {selectedWorkflow.webhookUrl && (
            <div className="flex items-center gap-1 text-blue-600 mt-1">
              <ExternalLink className="h-3 w-3" />
              <span className="truncate">{selectedWorkflow.webhookUrl}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
