'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Loader2, Plus, AlertTriangle, Edit3, Trash2, Eye } from 'lucide-react'
import { useToast } from '@/components/ui/use-toast'
import { AdsBudgetRuleForm } from './AdsBudgetRuleForm'

interface BudgetRule {
  id: string
  name: string
  description: string | null
  isActive: boolean
  scope: string
  scopeId: string | null
  condition: {
    metric?: string
    operator?: string
    value?: number
    window?: string
  }
  action: string
  actionValue: number | null
  cooldownHours: number
  lastTriggeredAt: string | null
  executionCount?: number
  createdAt: string
  _count?: { executions: number }
}

const ACTION_LABELS: Record<string, { label: string; className: string }> = {
  PAUSE: { label: 'Pausar', className: 'bg-red-50 text-red-700 border-red-200' },
  REDUCE_BUDGET_PERCENTAGE: { label: 'Reducir presupuesto', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  NOTIFY_ONLY: { label: 'Solo notificar', className: 'bg-blue-50 text-blue-700 border-blue-200' },
}

const SCOPE_LABELS: Record<string, string> = {
  ACCOUNT: 'Cuenta',
  CAMPAIGN: 'Campaña',
  AD_SET: 'Ad Set',
  AD: 'Anuncio',
}

export function AdsBudgetRulesList() {
  const [rules, setRules] = useState<BudgetRule[]>([])
  const [loading, setLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [editingRule, setEditingRule] = useState<BudgetRule | null>(null)
  const [logs, setLogs] = useState<any[]>([])
  const [showLogs, setShowLogs] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    fetchRules()
  }, [])

  async function fetchRules() {
    try {
      setLoading(true)
      const res = await fetch('/api/ads/watchdog/rules')
      if (!res.ok) throw new Error('Error al cargar reglas')
      const data = await res.json()
      setRules(Array.isArray(data.rules) ? data.rules : Array.isArray(data) ? data : [])
    } catch {
      setRules([])
    } finally {
      setLoading(false)
    }
  }

  async function fetchLogs() {
    try {
      const res = await fetch('/api/ads/watchdog/logs?limit=20')
      if (!res.ok) throw new Error('Error al cargar logs')
      const data = await res.json()
      setLogs(Array.isArray(data) ? data : data.logs || data.executions || [])
    } catch {
      setLogs([])
    }
  }

  async function handleToggle(ruleId: string, currentEnabled: boolean) {
    try {
      const res = await fetch(`/api/ads/watchdog/rules/${ruleId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !currentEnabled }),
      })
      if (!res.ok) throw new Error('Error al actualizar')
      toast({ title: `Regla ${currentEnabled ? 'desactivada' : 'activada'}` })
      fetchRules()
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Error desconocido',
        variant: 'destructive',
      })
    }
  }

  async function handleDelete(ruleId: string) {
    if (!confirm('¿Eliminar esta regla definitivamente?')) return
    try {
      const res = await fetch(`/api/ads/watchdog/rules/${ruleId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Error al eliminar')
      toast({ title: 'Regla eliminada' })
      fetchRules()
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Error desconocido',
        variant: 'destructive',
      })
    }
  }

  async function handleEvaluate() {
    try {
      toast({ title: 'Evaluando reglas...' })
      const res = await fetch('/api/ads/watchdog/evaluate', { method: 'POST' })
      if (!res.ok) throw new Error('Error al evaluar')
      const data = await res.json()
      toast({
        title: 'Evaluación completada',
        description: `${data.triggered ?? data.count ?? 0} reglas activadas`,
      })
      fetchRules()
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Error desconocido',
        variant: 'destructive',
      })
    }
  }

  function formatCondition(condition: BudgetRule['condition']): string {
    if (!condition || typeof condition !== 'object') return '—'
    const metric = condition.metric || '?'
    const op = condition.operator || '?'
    const val = condition.value ?? '?'
    const win = condition.window || ''
    return `${metric} ${op} ${val}${win ? ` (${win})` : ''}`
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-primary opacity-20" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-4 w-4 mr-1" /> Nueva Regla
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Nueva Regla de Presupuesto</DialogTitle>
              <DialogDescription>
                Define una condición que monitoreará el watchdog automáticamente.
              </DialogDescription>
            </DialogHeader>
            <AdsBudgetRuleForm
              onSuccess={() => {
                setCreateOpen(false)
                fetchRules()
              }}
              onCancel={() => setCreateOpen(false)}
            />
          </DialogContent>
        </Dialog>

        <Button variant="outline" size="sm" onClick={handleEvaluate}>
          <AlertTriangle className="h-4 w-4 mr-1" /> Evaluar Ahora
        </Button>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setShowLogs(true)
            fetchLogs()
          }}
        >
          <Eye className="h-4 w-4 mr-1" /> Historial
        </Button>
      </div>

      {rules.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            No hay reglas de presupuesto configuradas. Crea una regla para monitorear automáticamente tus campañas.
          </CardContent>
        </Card>
      ) : (
        <Card className="border shadow-sm">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[11px] font-bold uppercase">Nombre</TableHead>
                  <TableHead className="text-[11px] font-bold uppercase">Alcance</TableHead>
                  <TableHead className="text-[11px] font-bold uppercase">Condición</TableHead>
                  <TableHead className="text-[11px] font-bold uppercase">Acción</TableHead>
                  <TableHead className="text-[11px] font-bold uppercase">Activa</TableHead>
                  <TableHead className="text-[11px] font-bold uppercase text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rules.map((rule) => {
                  const actionInfo = ACTION_LABELS[rule.action] || { label: rule.action, className: '' }
                  return (
                    <TableRow key={rule.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium text-sm">{rule.name}</p>
                          {rule.description && (
                            <p className="text-[10px] text-muted-foreground line-clamp-1">{rule.description}</p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px]">
                          {SCOPE_LABELS[rule.scope] || rule.scope}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className="text-xs font-mono">{formatCondition(rule.condition)}</span>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-[10px] ${actionInfo.className}`}>
                          {actionInfo.label}
                          {rule.action === 'REDUCE_BUDGET_PERCENTAGE' && rule.actionValue
                            ? ` ${rule.actionValue}%`
                            : ''}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={rule.isActive}
                          onCheckedChange={() => handleToggle(rule.id, rule.isActive)}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            onClick={() => setEditingRule(rule)}
                          >
                            <Edit3 className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                            onClick={() => handleDelete(rule.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {editingRule && (
        <Dialog open={!!editingRule} onOpenChange={(open) => !open && setEditingRule(null)}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Editar Regla</DialogTitle>
              <DialogDescription>Modifica los parámetros de la regla.</DialogDescription>
            </DialogHeader>
            <AdsBudgetRuleForm
              rule={{
                id: editingRule.id,
                name: editingRule.name,
                description: editingRule.description,
                isActive: editingRule.isActive,
                scope: editingRule.scope,
                scopeId: editingRule.scopeId,
                condition: {
                  metric: editingRule.condition?.metric || 'cpa',
                  operator: editingRule.condition?.operator || '>',
                  value: editingRule.condition?.value ?? 0,
                  window: editingRule.condition?.window || '7d',
                },
                action: editingRule.action,
                actionValue: editingRule.actionValue,
                cooldownHours: editingRule.cooldownHours,
              }}
              onSuccess={() => {
                setEditingRule(null)
                fetchRules()
              }}
              onCancel={() => setEditingRule(null)}
            />
          </DialogContent>
        </Dialog>
      )}

      {showLogs && (
        <Dialog open={showLogs} onOpenChange={setShowLogs}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Historial de Ejecuciones</DialogTitle>
              <DialogDescription>Últimas ejecuciones del watchdog.</DialogDescription>
            </DialogHeader>
            {logs.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">Sin ejecuciones registradas</p>
            ) : (
              <div className="space-y-2">
                {logs.map((log: any, i: number) => (
                  <Card key={log.id || i} className="border shadow-sm">
                    <CardContent className="p-3 text-xs space-y-1">
                      <div className="flex justify-between">
                        <span className="font-medium">{log.rule?.name || log.ruleId || 'Regla'}</span>
                        <span className="text-muted-foreground">
                          {new Date(log.createdAt || log.timestamp || Date.now()).toLocaleString('es-MX')}
                        </span>
                      </div>
                      <p className="text-muted-foreground">
                        {log.message || log.details || `Métrica: ${log.metricCurrent ?? '—'} / umbral ${log.metricThreshold ?? '—'}`}
                      </p>
                      {log.action && (
                        <Badge variant="outline" className="text-[10px]">
                          {log.action}
                        </Badge>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
