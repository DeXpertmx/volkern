'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Loader2 } from 'lucide-react'
import { useToast } from '@/components/ui/use-toast'

interface BudgetRule {
  id?: string
  name: string
  description?: string | null
  isActive?: boolean
  scope?: string
  scopeId?: string | null
  condition?: {
    metric: string
    operator: string
    value: number
    window: string
  }
  action?: string
  actionValue?: number | null
  cooldownHours?: number
}

interface AdsBudgetRuleFormProps {
  rule?: BudgetRule
  onSuccess: () => void
  onCancel: () => void
}

const METRICS = [
  { value: 'cpa', label: 'CPA' },
  { value: 'roas', label: 'ROAS' },
  { value: 'ctr', label: 'CTR' },
  { value: 'cpc', label: 'CPC' },
  { value: 'spendPerConversion', label: 'Gasto por conversión' },
  { value: 'conversionRate', label: 'Tasa de conversión' },
  { value: 'impressions', label: 'Impresiones' },
  { value: 'frequency', label: 'Frecuencia' },
]

const OPERATORS = [
  { value: '>', label: '>' },
  { value: '>=', label: '≥' },
  { value: '<', label: '<' },
  { value: '<=', label: '≤' },
  { value: '==', label: '=' },
  { value: '!=', label: '≠' },
]

const WINDOWS = [
  { value: '1h', label: '1 hora' },
  { value: '6h', label: '6 horas' },
  { value: '24h', label: '24 horas' },
  { value: '7d', label: '7 días' },
  { value: '30d', label: '30 días' },
]

const ACTIONS = [
  { value: 'PAUSE', label: 'Pausar campaña' },
  { value: 'REDUCE_BUDGET_PERCENTAGE', label: 'Reducir presupuesto %' },
  { value: 'NOTIFY_ONLY', label: 'Solo notificar' },
]

const SCOPES = [
  { value: 'ACCOUNT', label: 'Toda la cuenta' },
  { value: 'CAMPAIGN', label: 'Campaña específica' },
  { value: 'AD_SET', label: 'Ad set específico' },
  { value: 'AD', label: 'Anuncio específico' },
]

export function AdsBudgetRuleForm({ rule, onSuccess, onCancel }: AdsBudgetRuleFormProps) {
  const isEdit = !!rule?.id
  const { toast } = useToast()
  const [saving, setSaving] = useState(false)

  const [name, setName] = useState(rule?.name || '')
  const [description, setDescription] = useState(rule?.description || '')
  const [isActive, setIsActive] = useState(rule?.isActive ?? true)
  const [scope, setScope] = useState(rule?.scope || 'ACCOUNT')
  const [scopeId, setScopeId] = useState(rule?.scopeId || '')
  const [metric, setMetric] = useState(rule?.condition?.metric || 'cpa')
  const [operator, setOperator] = useState(rule?.condition?.operator || '>')
  const [value, setValue] = useState(String(rule?.condition?.value ?? 50))
  const [window, setWindow] = useState(rule?.condition?.window || '7d')
  const [action, setAction] = useState(rule?.action || 'NOTIFY_ONLY')
  const [actionValue, setActionValue] = useState(String(rule?.actionValue ?? 25))
  const [cooldownHours, setCooldownHours] = useState(String(rule?.cooldownHours ?? 24))

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) {
      toast({ title: 'El nombre es requerido', variant: 'destructive' })
      return
    }

    const payload = {
      name: name.trim(),
      description: description.trim() || null,
      isActive,
      scope,
      scopeId: scope === 'ACCOUNT' ? null : (scopeId || null),
      condition: {
        metric,
        operator,
        value: Number(value),
        window,
      },
      action,
      actionValue: action === 'REDUCE_BUDGET_PERCENTAGE' ? Number(actionValue) : null,
      cooldownHours: Number(cooldownHours) || 24,
    }

    try {
      setSaving(true)
      const url = isEdit ? `/api/ads/watchdog/rules/${rule!.id}` : '/api/ads/watchdog/rules'
      const method = isEdit ? 'PUT' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Error al guardar la regla')
      }
      toast({ title: isEdit ? 'Regla actualizada' : 'Regla creada' })
      onSuccess()
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Error desconocido',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="rule-name">Nombre</Label>
        <Input
          id="rule-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ej: Pausar si CPA &gt; $50"
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="rule-desc">Descripción (opcional)</Label>
        <Textarea
          id="rule-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Describe el propósito de esta regla"
          rows={2}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>Alcance</Label>
          <Select value={scope} onValueChange={setScope}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SCOPES.map((s) => (
                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {scope !== 'ACCOUNT' && (
          <div className="space-y-2">
            <Label htmlFor="scope-id">ID del alcance</Label>
            <Input
              id="scope-id"
              value={scopeId}
              onChange={(e) => setScopeId(e.target.value)}
              placeholder="campaignId / adSetId / adId"
            />
          </div>
        )}
      </div>

      <div className="rounded-lg border p-3 space-y-3 bg-slate-50/50">
        <p className="text-xs font-semibold text-slate-500 uppercase">Condición</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>Métrica</Label>
            <Select value={metric} onValueChange={setMetric}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {METRICS.map((m) => (
                  <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Operador</Label>
            <Select value={operator} onValueChange={setOperator}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OPERATORS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="threshold">Umbral</Label>
            <Input
              id="threshold"
              type="number"
              min={0}
              step="any"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label>Ventana</Label>
            <Select value={window} onValueChange={setWindow}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WINDOWS.map((w) => (
                  <SelectItem key={w.value} value={w.value}>{w.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>Acción</Label>
          <Select value={action} onValueChange={setAction}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ACTIONS.map((a) => (
                <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {action === 'REDUCE_BUDGET_PERCENTAGE' && (
          <div className="space-y-2">
            <Label htmlFor="action-value">Porcentaje a reducir</Label>
            <Input
              id="action-value"
              type="number"
              min={1}
              max={100}
              value={actionValue}
              onChange={(e) => setActionValue(e.target.value)}
            />
          </div>
        )}
        <div className="space-y-2">
          <Label htmlFor="cooldown">Cooldown (horas)</Label>
          <Input
            id="cooldown"
            type="number"
            min={1}
            max={720}
            value={cooldownHours}
            onChange={(e) => setCooldownHours(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2 pt-6">
          <Switch checked={isActive} onCheckedChange={setIsActive} id="rule-active" />
          <Label htmlFor="rule-active">Regla activa</Label>
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>
          Cancelar
        </Button>
        <Button type="submit" disabled={saving}>
          {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
          {isEdit ? 'Guardar cambios' : 'Crear regla'}
        </Button>
      </div>
    </form>
  )
}
