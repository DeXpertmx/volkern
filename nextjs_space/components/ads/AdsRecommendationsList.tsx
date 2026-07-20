'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, Sparkles, Check, X, AlertTriangle, TrendingUp, Target, Palette, Clock, Share2 } from 'lucide-react'
import { useToast } from '@/components/ui/use-toast'

interface Recommendation {
  id: string
  campaignId: string | null
  adSetId: string | null
  adId: string | null
  type: string
  title: string
  description: string
  impact: string
  confidence: number
  metric: string
  projectedValue: number
  currentValue: number
  implementation: unknown
  isApplied: boolean
  isDismissed: boolean
  createdAt: string
}

const TYPE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  BUDGET: TrendingUp,
  TARGETING: Target,
  CREATIVE: Palette,
  BID: TrendingUp,
  SCHEDULE: Clock,
  PLATFORM: Share2,
}

const IMPACT_STYLES: Record<string, string> = {
  HIGH: 'bg-red-50 text-red-700 border-red-200',
  MEDIUM: 'bg-amber-50 text-amber-700 border-amber-200',
  LOW: 'bg-blue-50 text-blue-700 border-blue-200',
}

const TYPE_LABELS: Record<string, string> = {
  BUDGET: 'Presupuesto',
  TARGETING: 'Audiencia',
  CREATIVE: 'Creativo',
  BID: 'Puja',
  SCHEDULE: 'Horario',
  PLATFORM: 'Plataforma',
}

export function AdsRecommendationsList() {
  const [recommendations, setRecommendations] = useState<Recommendation[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [actionId, setActionId] = useState<string | null>(null)
  const { toast } = useToast()

  useEffect(() => {
    fetchRecommendations()
  }, [])

  async function fetchRecommendations() {
    try {
      setLoading(true)
      const res = await fetch('/api/ads/recommendations')
      if (!res.ok) throw new Error('Error al cargar recomendaciones')
      const data = await res.json()
      setRecommendations(Array.isArray(data.recommendations) ? data.recommendations : Array.isArray(data) ? data : [])
    } catch {
      setRecommendations([])
    } finally {
      setLoading(false)
    }
  }

  async function handleGenerate() {
    try {
      setGenerating(true)
      toast({ title: 'Generando recomendaciones con IA...' })
      const res = await fetch('/api/ads/recommendations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      if (!res.ok) throw new Error('Error al generar')
      const data = await res.json()
      toast({
        title: 'Recomendaciones generadas',
        description: `${(data.recommendations || []).length} nuevas recomendaciones`,
      })
      fetchRecommendations()
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Error desconocido',
        variant: 'destructive',
      })
    } finally {
      setGenerating(false)
    }
  }

  async function handleApply(id: string) {
    try {
      setActionId(id)
      const res = await fetch(`/api/ads/recommendations/${id}/apply`, { method: 'POST' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Error al aplicar')
      }
      toast({ title: 'Recomendación aplicada' })
      fetchRecommendations()
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Error desconocido',
        variant: 'destructive',
      })
    } finally {
      setActionId(null)
    }
  }

  async function handleDismiss(id: string) {
    try {
      setActionId(id)
      const res = await fetch(`/api/ads/recommendations/${id}/dismiss`, { method: 'POST' })
      if (!res.ok) throw new Error('Error al descartar')
      toast({ title: 'Recomendación descartada' })
      fetchRecommendations()
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Error desconocido',
        variant: 'destructive',
      })
    } finally {
      setActionId(null)
    }
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
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Sugerencias de optimización generadas por IA a partir de tus métricas.
        </p>
        <Button size="sm" onClick={handleGenerate} disabled={generating}>
          {generating ? (
            <Loader2 className="h-4 w-4 animate-spin mr-1" />
          ) : (
            <Sparkles className="h-4 w-4 mr-1" />
          )}
          Generar con IA
        </Button>
      </div>

      {recommendations.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-8 text-center space-y-3">
            <AlertTriangle className="h-8 w-8 mx-auto text-muted-foreground opacity-40" />
            <p className="text-sm text-muted-foreground">
              No hay recomendaciones pendientes. Genera nuevas con IA o sincroniza más datos de campañas.
            </p>
            <Button variant="outline" size="sm" onClick={handleGenerate} disabled={generating}>
              <Sparkles className="h-4 w-4 mr-1" /> Generar ahora
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {recommendations.map((rec) => {
            const Icon = TYPE_ICONS[rec.type] || Sparkles
            const impactClass = IMPACT_STYLES[rec.impact] || IMPACT_STYLES.MEDIUM
            const confidencePct = Math.round((rec.confidence || 0) * 100)

            return (
              <Card key={rec.id} className="border shadow-sm hover:shadow-md transition-shadow">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className="p-2 rounded-lg bg-primary/10">
                        <Icon className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <CardTitle className="text-sm font-semibold leading-tight">{rec.title}</CardTitle>
                        <div className="flex gap-1.5 mt-1 flex-wrap">
                          <Badge variant="outline" className="text-[10px]">
                            {TYPE_LABELS[rec.type] || rec.type}
                          </Badge>
                          <Badge variant="outline" className={`text-[10px] ${impactClass}`}>
                            Impacto {rec.impact}
                          </Badge>
                          <Badge variant="outline" className="text-[10px] bg-slate-50">
                            {confidencePct}% confianza
                          </Badge>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-xs text-muted-foreground leading-relaxed">{rec.description}</p>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-md bg-slate-50 p-2">
                      <p className="text-[10px] text-muted-foreground uppercase">Actual</p>
                      <p className="font-mono font-medium">{formatMetric(rec.metric, rec.currentValue)}</p>
                    </div>
                    <div className="rounded-md bg-emerald-50 p-2">
                      <p className="text-[10px] text-muted-foreground uppercase">Proyectado</p>
                      <p className="font-mono font-medium text-emerald-700">{formatMetric(rec.metric, rec.projectedValue)}</p>
                    </div>
                  </div>

                  <div className="flex gap-2 pt-1">
                    <Button
                      size="sm"
                      className="flex-1"
                      onClick={() => handleApply(rec.id)}
                      disabled={actionId === rec.id}
                    >
                      {actionId === rec.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                      ) : (
                        <Check className="h-3.5 w-3.5 mr-1" />
                      )}
                      Aplicar
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1"
                      onClick={() => handleDismiss(rec.id)}
                      disabled={actionId === rec.id}
                    >
                      <X className="h-3.5 w-3.5 mr-1" />
                      Descartar
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}

function formatMetric(metric: string, value: number): string {
  if (value == null || Number.isNaN(value)) return '—'
  const m = (metric || '').toLowerCase()
  if (m.includes('cpa') || m.includes('cpc') || m.includes('spend') || m.includes('budget')) {
    return `$${Number(value).toFixed(2)}`
  }
  if (m.includes('ctr') || m.includes('rate') || m.includes('roas')) {
    return m.includes('roas') ? Number(value).toFixed(2) + 'x' : Number(value).toFixed(2) + '%'
  }
  return Number(value).toLocaleString('es-MX', { maximumFractionDigits: 2 })
}
