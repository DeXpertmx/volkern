'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { Loader2, TrendingUp, Box, Layout, FileText, FileSignature, Users, Mail, HardDrive, Bot, MessageSquare, BookOpen, GraduationCap, Globe, Zap, ArrowLeft, Tag, BarChart3, Send, Workflow, MessageCircle, LineChart, Info } from 'lucide-react'
import { PLANS } from '@/lib/plans'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

// ─── Categorías ──────────────────────────────────────────────────────────────

interface CategoryDef {
  id: string
  label: string
  icon: React.ReactNode
  features: string[]
}

const CATEGORIES: CategoryDef[] = [
  {
    id: 'ventas',
    label: 'Ventas & CRM',
    icon: <BarChart3 className="h-4 w-4" />,
    features: ['leads', 'users', 'catalogo_items', 'invoices', 'contratos_sign'],
  },
  {
    id: 'marketing',
    label: 'Marketing',
    icon: <Send className="h-4 w-4" />,
    features: ['emails_per_month', 'pages', 'published_pages'],
  },
  {
    id: 'academia',
    label: 'Academia',
    icon: <GraduationCap className="h-4 w-4" />,
    features: ['courses', 'students'],
  },
  {
    id: 'automation',
    label: 'Automatización',
    icon: <Workflow className="h-4 w-4" />,
    features: ['automations_count', 'automation_runs'],
  },
  {
    id: 'comunicacion',
    label: 'Comunicación',
    icon: <MessageCircle className="h-4 w-4" />,
    features: ['whatsapp_messages', 'sms_messages'],
  },
]

const EXCLUDED_FEATURES = ['ai_image_generations', 'business_emails', 'business_domains', 'business_email_gb', 'storage_gb']

// ─── Tips por feature (hover tooltip) ───────────────────────────────────────

const FEATURE_TIPS: Record<string, string> = {
  leads: 'Elimina leads inactivos o duplicados para liberar espacio',
  users: 'Revisa usuarios inactivos que puedan darse de baja',
  emails_per_month: 'Segmenta mejor tus campañas para optimizar envíos',
  pages: 'Archiva páginas en desuso o combina contenido',
  published_pages: 'Despublica landing pages que ya no estén activas',
  automations_count: 'Elimina automatizaciones inactivas o duplicadas',
  automation_runs: 'Ajusta la frecuencia de ejecución de automatizaciones',
  whatsapp_messages: 'Agrupa mensajes y evita envíos innecesarios',
  sms_messages: 'Revisa y agrupa mensajes SMS duplicados',
  courses: 'Archiva cursos antiguos que ya no estén activos',
  students: 'Identifica estudiantes inactivos que puedan darse de baja',
  catalogo_items: 'Desactiva productos o servicios que ya no ofrezcas',
  invoices: 'Limpia borradores de facturas que no se vayan a emitir',
  contratos_sign: 'Revisa borradores de contratos pendientes de firmar',
}

// ─── Features de la gráfica ──────────────────────────────────────────────────

const CHART_FEATURES = [
  { key: 'leads', label: 'Leads', color: '#3b82f6' },
  { key: 'invoices', label: 'Facturas', color: '#10b981' },
  { key: 'pages', label: 'Páginas', color: '#8b5cf6' },
  { key: 'courses', label: 'Cursos', color: '#f59e0b' },
  { key: 'students', label: 'Estudiantes', color: '#ec4899' },
  { key: 'catalogo_items', label: 'Productos', color: '#06b6d4' },
  { key: 'contratos_sign', label: 'Contratos', color: '#f97316' },
]

// ─── Página ──────────────────────────────────────────────────────────────────

export default function UsagePage() {
  const [usage, setUsage] = useState<any[]>([])
  const [usageLoading, setUsageLoading] = useState(true)
  const [status, setStatus] = useState<any>(null)
  const [upgradeInfo, setUpgradeInfo] = useState<{ suggestedPlan: string | null; nearLimitCount: number; message: string } | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [activeCategory, setActiveCategory] = useState<string>('todas')
  const [history, setHistory] = useState<any[]>([])
  const [historyLoading, setHistoryLoading] = useState(true)
  const [activeChartFeatures, setActiveChartFeatures] = useState<Set<string>>(new Set(['leads', 'invoices']))

  useEffect(() => {
    fetchStatus()
    fetchUsage()
    fetchHistory()
  }, [])

  const fetchUsage = async () => {
    try {
      setUsageLoading(true)
      const response = await fetch('/api/subscriptions/usage')
      if (response.ok) {
        const data = await response.json()
        setUsage(data.usage || [])
        if (data.upgrade) setUpgradeInfo(data.upgrade)
      }
    } catch (error) {
      console.error('Error fetching usage:', error)
    } finally {
      setUsageLoading(false)
    }
  }

  const fetchStatus = async () => {
    try {
      const response = await fetch('/api/subscriptions/status')
      if (response.ok) {
        const data = await response.json()
        setStatus(data)
      }
    } catch (error) {
      console.error('Error fetching status:', error)
    }
  }

  const fetchHistory = async () => {
    try {
      setHistoryLoading(true)
      const response = await fetch('/api/subscriptions/usage/history')
      if (response.ok) {
        const data = await response.json()
        setHistory(data.history || [])
        // Pre-select first 2 features that have data
        if (data.features) {
          const withData = data.features
            .filter((f: any) => data.history.some((h: any) => (h[f.key] || 0) > 0))
            .slice(0, 2)
            .map((f: any) => f.key)
          if (withData.length > 0) setActiveChartFeatures(new Set(withData))
        }
      }
    } catch (error) {
      console.error('Error fetching history:', error)
    } finally {
      setHistoryLoading(false)
    }
  }

  const toggleChartFeature = (key: string) => {
    setActiveChartFeatures(prev => {
      const next = new Set(prev)
      if (next.has(key)) {
        if (next.size > 1) next.delete(key) // Keep at least one
      } else {
        next.add(key)
      }
      return next
    })
  }

  const featureIcons: Record<string, React.ReactNode> = {
    leads: <Users className="h-4 w-4" />,
    users: <Users className="h-4 w-4" />,
    emails_per_month: <Mail className="h-4 w-4" />,
    pages: <Layout className="h-4 w-4" />,
    published_pages: <Globe className="h-4 w-4" />,
    automations_count: <Zap className="h-4 w-4" />,
    automation_runs: <Bot className="h-4 w-4" />,
    whatsapp_messages: <MessageSquare className="h-4 w-4" />,
    sms_messages: <MessageSquare className="h-4 w-4" />,
    courses: <BookOpen className="h-4 w-4" />,
    students: <GraduationCap className="h-4 w-4" />,
    catalogo_items: <Box className="h-4 w-4" />,
    invoices: <FileText className="h-4 w-4" />,
    contratos_sign: <FileSignature className="h-4 w-4" />,
  }

  const getBarColor = (percentage: number, status: string) => {
    if (status === 'exceeded' || percentage >= 100) return 'bg-red-500'
    if (status === 'warning' || percentage >= 80) return 'bg-amber-500'
    if (percentage >= 60) return 'bg-emerald-500'
    return 'bg-primary'
  }

  const PLAN_DISPLAY: Record<string, string> = {
    esencial: 'Esencial',
    profesional: 'Profesional',
    infinity: 'Infinity',
  }

  const NEXT_PLAN_MAP: Record<string, string> = {
    trial: PLANS.ESENCIAL,
    esencial: PLANS.PROFESIONAL,
    profesional: PLANS.INFINITY,
  }

  const isNearLimit = (f: any) => f.status === 'warning' || f.status === 'exceeded'

  const handleQuickUpgrade = async () => {
    const currentPlan = status?.plan?.toLowerCase() || 'trial'
    const nextPlan = upgradeInfo?.suggestedPlan || NEXT_PLAN_MAP[currentPlan]

    if (!nextPlan) {
      window.open('https://dexpert.mx/contacto', '_blank')
      return
    }

    setActionLoading(true)
    try {
      const response = await fetch('/api/subscriptions/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPlanId: nextPlan })
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Error al cambiar plan')
      toast.success(data.message || 'Plan actualizado exitosamente')
      await fetchStatus()
      await fetchUsage()
    } catch (error: any) {
      console.error('Error:', error)
      toast.error(error.message || 'Error al cambiar el plan')
    } finally {
      setActionLoading(false)
    }
  }

  // Filtrar features según categoría activa
  const filteredUsage = usage.filter(f => !EXCLUDED_FEATURES.includes(f.feature) && (activeCategory === 'todas' || CATEGORIES.find(c => c.id === activeCategory)?.features.includes(f.feature)))

  // Agrupar por categoría
  const groupedByCategory = activeCategory === 'todas'
    ? CATEGORIES.map(cat => ({
        ...cat,
        items: filteredUsage.filter(f => cat.features.includes(f.feature)),
      })).filter(g => g.items.length > 0)
    : [{ id: activeCategory, label: CATEGORIES.find(c => c.id === activeCategory)?.label || activeCategory, icon: CATEGORIES.find(c => c.id === activeCategory)?.icon || <Tag className="h-4 w-4" />, items: filteredUsage }]

  // Tooltip personalizado para la gráfica
  const ChartTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null
    return (
      <div className="bg-background border border-border rounded-lg shadow-xl px-4 py-3 text-sm">
        <p className="font-semibold text-foreground mb-2">{label}</p>
        {payload.map((p: any) => (
          <div key={p.dataKey} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: p.color }} />
              {p.name}
            </span>
            <span className="font-mono font-medium">{p.value}</span>
          </div>
        ))}
      </div>
    )
  }

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/dashboard/configuracion">
          <Button variant="ghost" size="icon" className="shrink-0">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold">Uso y Límites</h1>
          <p className="text-gray-500 mt-1">Consumo actual de tu plan y recursos disponibles</p>
        </div>
      </div>

      {/* Plan resumen */}
      {status && (
        <div className="flex items-center gap-3 p-4 bg-muted/30 rounded-xl border flex-wrap">
          <span className="text-sm text-muted-foreground">Plan actual:</span>
          <span className="font-semibold capitalize">{status.plan || 'Trial'}</span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
            {status.status === 'trial' ? 'Prueba Gratuita' : status.status}
          </span>
          {status.trial && (
            <span className="text-xs text-muted-foreground">
              · {status.trial.daysRemaining} días restantes
            </span>
          )}
        </div>
      )}

      {/* ── Gráfica de tendencia mensual ── */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap">
          <div>
            <CardTitle className="flex items-center gap-2">
              <LineChart className="h-5 w-5 text-primary" />
              Tendencia Mensual
            </CardTitle>
            <CardDescription>Evolución de los últimos 6 meses</CardDescription>
          </div>
          {!historyLoading && history.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {CHART_FEATURES.map(feat => {
                const hasData = history.some((h: any) => (h[feat.key] || 0) > 0)
                if (!hasData) return null
                return (
                  <button
                    key={feat.key}
                    onClick={() => toggleChartFeature(feat.key)}
                    className={cn(
                      'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium transition-all border',
                      activeChartFeatures.has(feat.key)
                        ? 'text-white border-transparent shadow-sm'
                        : 'text-muted-foreground border-border hover:border-muted-foreground/30'
                    )}
                    style={activeChartFeatures.has(feat.key) ? { backgroundColor: feat.color } : {}}
                  >
                    {feat.label}
                  </button>
                )
              })}
            </div>
          )}
        </CardHeader>
        <CardContent>
          {historyLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : history.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <LineChart className="h-10 w-10 mb-3 opacity-30" />
              <p className="text-sm">No hay datos históricos disponibles</p>
            </div>
          ) : (
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={history} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                  <defs>
                    {CHART_FEATURES.map(feat => (
                      <linearGradient key={feat.key} id={`gradient_${feat.key}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={feat.color} stopOpacity={0.3} />
                        <stop offset="95%" stopColor={feat.color} stopOpacity={0} />
                      </linearGradient>
                    ))}
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" vertical={false} />
                  <XAxis
                    dataKey="month"
                    tick={{ fontSize: 12 }}
                    tickLine={false}
                    axisLine={false}
                    className="text-muted-foreground"
                    tickFormatter={(v: string) => {
                      const [, m] = v.split('-')
                      const months = ['E', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D']
                      return months[parseInt(m) - 1]
                    }}
                  />
                  <YAxis
                    tick={{ fontSize: 12 }}
                    tickLine={false}
                    axisLine={false}
                    className="text-muted-foreground"
                    allowDecimals={false}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  {CHART_FEATURES.map(feat =>
                    activeChartFeatures.has(feat.key) ? (
                      <Area
                        key={feat.key}
                        type="monotone"
                        dataKey={feat.key}
                        name={feat.label}
                        stroke={feat.color}
                        fill={`url(#gradient_${feat.key})`}
                        strokeWidth={2}
                        dot={{ r: 3, fill: feat.color, strokeWidth: 0 }}
                        activeDot={{ r: 5, strokeWidth: 2, stroke: 'white' }}
                      />
                    ) : null
                  )}
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Filtro por categoría */}
      {!usageLoading && usage.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setActiveCategory('todas')}
            className={cn(
              'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all border',
              activeCategory === 'todas'
                ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                : 'bg-background text-muted-foreground border-border hover:border-primary/50 hover:text-foreground'
            )}
          >
            <Tag className="h-3.5 w-3.5" />
            Todas
          </button>
          {CATEGORIES.map(cat => {
            const hasFeatures = usage.some(f => cat.features.includes(f.feature) && !EXCLUDED_FEATURES.includes(f.feature))
            if (!hasFeatures) return null
            return (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={cn(
                  'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all border',
                  activeCategory === cat.id
                    ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                    : 'bg-background text-muted-foreground border-border hover:border-primary/50 hover:text-foreground'
                )}
              >
                {cat.icon}
                {cat.label}
              </button>
            )
          })}
        </div>
      )}

      {/* Usage Indicators agrupados */}
      {usageLoading ? (
        <Card>
          <CardContent className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </CardContent>
        </Card>
      ) : filteredUsage.length === 0 ? (
        <Card>
          <CardContent className="py-8">
            <p className="text-sm text-muted-foreground text-center">
              {usage.length === 0
                ? 'No hay información de uso disponible.'
                : 'No hay features en esta categoría.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        groupedByCategory.map(group => (
          <Card key={group.id}>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                {group.icon}
                {group.label}
              </CardTitle>
              <CardDescription>
                {activeCategory === 'todas'
                  ? `Consumo actual vs límite de tu plan`
                  : `Features de ${group.label.toLowerCase()}`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-5 sm:grid-cols-2">
                {group.items.map((f: any) => (
                  <div key={f.feature} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="flex-shrink-0 text-muted-foreground">
                          {featureIcons[f.feature] || <Zap className="h-4 w-4" />}
                        </span>
                        <span className="text-sm font-medium truncate">{f.label}</span>
                          {FEATURE_TIPS[f.feature] && (
                            <span
                              className="inline-flex items-center flex-shrink-0 text-muted-foreground/50 hover:text-muted-foreground cursor-help"
                              title={FEATURE_TIPS[f.feature]}
                            >
                              <Info className="h-3 w-3" />
                            </span>
                          )}
                      </div>
                      <span className={`text-xs font-mono flex-shrink-0 ml-2 ${
                        f.status === 'exceeded' ? 'text-red-600 font-bold' :
                        f.status === 'warning' ? 'text-amber-600 font-bold' :
                        'text-muted-foreground'
                      }`}>
                        {f.unlimited ? (
                          <span className="text-muted-foreground">∞</span>
                        ) : (
                          <>{f.current.toLocaleString()} / {f.limit.toLocaleString()}</>
                        )}
                      </span>
                    </div>
                    {!f.unlimited && (
                      <div className="relative h-2 w-full rounded-full bg-muted overflow-hidden">
                        <div
                          className={`absolute inset-y-0 left-0 rounded-full transition-all duration-500 ${getBarColor(f.percentage, f.status)}`}
                          style={{ width: `${Math.min(f.percentage, 100)}%` }}
                        />
                      </div>
                    )}
                    {f.unlimited && (
                      <div className="relative h-2 w-full rounded-full bg-muted/50 overflow-hidden">
                        <div className="absolute inset-y-0 left-0 rounded-full bg-primary/20 w-full" />
                      </div>
                    )}
                    {isNearLimit(f) && (
                      <div className="pt-2">
                        <button
                          onClick={handleQuickUpgrade}
                          disabled={actionLoading}
                          className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-md transition-all
                            bg-gradient-to-r from-blue-600 to-indigo-600 text-white
                            hover:from-blue-500 hover:to-indigo-500 hover:shadow-md hover:shadow-blue-500/25
                            active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {actionLoading ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <TrendingUp className="h-3 w-3" />
                          )}
                          {upgradeInfo?.suggestedPlan
                            ? `Upgrade a ${PLAN_DISPLAY[upgradeInfo.suggestedPlan] || upgradeInfo.suggestedPlan}`
                            : status?.plan === 'infinity'
                              ? 'Contáctanos'
                              : 'Hacer Upgrade'}
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))
      )}

      {/* Sugerencia de upgrade */}
      {upgradeInfo && upgradeInfo.nearLimitCount > 0 && (
        <Card className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-xl shadow-blue-500/20 border-none rounded-2xl overflow-hidden relative">
          <div className="absolute top-0 right-0 -m-8 opacity-10 pointer-events-none">
            <TrendingUp className="w-64 h-64" />
          </div>
          <CardContent className="p-8 md:p-12 relative z-10 flex flex-col md:flex-row items-center justify-between gap-8">
            <div className="space-y-4 max-w-xl">
              <h2 className="text-3xl md:text-4xl font-black tracking-tight">
                {upgradeInfo.suggestedPlan
                  ? `Upgrade a ${PLAN_DISPLAY[upgradeInfo.suggestedPlan] || upgradeInfo.suggestedPlan}`
                  : 'Lleva tu negocio al siguiente nivel'}
              </h2>
              <p className="text-blue-100 text-lg leading-relaxed">
                {upgradeInfo.message}
              </p>
            </div>
            <Button
              size="lg"
              className="bg-white text-blue-600 hover:bg-slate-50 font-bold rounded-full px-8 py-6 h-auto text-lg shadow-2xl transition-transform hover:scale-105 shrink-0"
              onClick={() => window.location.href = '/dashboard/configuracion/billing'}
            >
              Ver Planes
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
