'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Loader2, AlertTriangle, TrendingUp, DollarSign, MousePointerClick, Activity, Zap, Clock, FlaskConical, Sun, Moon, ExternalLink, Calendar, Play, Trophy } from 'lucide-react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { AdsPlatformsSection } from '@/components/ads/AdsPlatformsSection'
import { AdsCampaignsList } from '@/components/ads/AdsCampaignsList'
import { AdsInsightsCharts } from '@/components/ads/AdsInsightsCharts'
import { AdsBudgetRulesList } from '@/components/ads/AdsBudgetRulesList'
import { AdsRecommendationsList } from '@/components/ads/AdsRecommendationsList'

interface DashboardMetrics {
  totalCampaigns: number
  activeCampaigns: number
  totalSpend: number
  totalImpressions: number
  totalClicks: number
  totalConversions: number
  averageCtr: number
  averageCpc: number
  averageCpm: number
  activeRules: number
  pendingRecommendations: number
  platformsConnected: number
  activeSchedules: number
  activeABTests: number
}

export function AdsDashboard() {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState('overview')

  useEffect(() => {
    fetchMetrics()
  }, [])

  async function fetchMetrics() {
    try {
      setLoading(true)
      setError(null)
      const [summaryRes, rulesRes, recsRes, campaignsRes, schedulesRes, abTestsRes] = await Promise.all([
        fetch('/api/ads/insights/summary'),
        fetch('/api/ads/watchdog/rules'),
        fetch('/api/ads/recommendations'),
        fetch('/api/ads/campaigns'),
        fetch('/api/ads/schedules'),
        fetch('/api/ads/ab-tests'),
      ])

      const summary = summaryRes.ok ? await summaryRes.json() : {}
      const rulesData = rulesRes.ok ? await rulesRes.json() : {}
      const recsData = recsRes.ok ? await recsRes.json() : {}
      const campaignsData = campaignsRes.ok ? await campaignsRes.json() : {}
      const schedulesData = schedulesRes.ok ? await schedulesRes.json() : []
      const abTestsData = abTestsRes.ok ? await abTestsRes.json() : []

      const rules = Array.isArray(rulesData.rules) ? rulesData.rules : []
      const recommendations = Array.isArray(recsData.recommendations) ? recsData.recommendations : []
      const campaigns = Array.isArray(campaignsData.campaigns) ? campaignsData.campaigns : []
      const schedules = Array.isArray(schedulesData) ? schedulesData : []
      const abTests = Array.isArray(abTestsData) ? abTestsData : []

      const totalImpressions = summary.totalImpressions || 0
      const totalClicks = summary.totalClicks || 0
      const totalSpend = summary.totalSpend || 0

      setMetrics({
        totalCampaigns: campaigns.length,
        activeCampaigns: summary.activeCampaigns ?? campaigns.filter((c: any) => c.status === 'ACTIVE').length,
        totalSpend,
        totalImpressions,
        totalClicks,
        totalConversions: summary.totalConversions || 0,
        averageCtr: totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0,
        averageCpc: totalClicks > 0 ? totalSpend / totalClicks : 0,
        averageCpm: totalImpressions > 0 ? (totalSpend / totalImpressions) * 1000 : 0,
        activeRules: rules.filter((r: any) => r.isActive).length,
        pendingRecommendations: recommendations.length,
        platformsConnected: summary.connectedPlatforms || 0,
        activeSchedules: schedules.filter((s: any) => s.enabled).length,
        activeABTests: abTests.filter((t: any) => t.status === 'RUNNING' || t.status === 'DRAFT').length,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary opacity-20" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="text-center space-y-2">
          <AlertTriangle className="h-8 w-8 text-amber-500 mx-auto" />
          <p className="text-sm text-muted-foreground">{error}</p>
        </div>
      </div>
    )
  }

  const safeMetrics = metrics || {
    totalCampaigns: 0,
    activeCampaigns: 0,
    totalSpend: 0,
    totalImpressions: 0,
    totalClicks: 0,
    totalConversions: 0,
    averageCtr: 0,
    averageCpc: 0,
    averageCpm: 0,
    activeRules: 0,
    pendingRecommendations: 0,
    platformsConnected: 0,
    activeSchedules: 0,
    activeABTests: 0,
  }

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard
          title="INVERSIÓN TOTAL"
          value={`$${safeMetrics.totalSpend.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`}
          icon={DollarSign}
          color="text-emerald-500"
        />
        <KpiCard
          title="IMPRESIONES"
          value={safeMetrics.totalImpressions.toLocaleString('es-MX')}
          icon={Activity}
          color="text-blue-500"
        />
        <KpiCard
          title="CLICS"
          value={safeMetrics.totalClicks.toLocaleString('es-MX')}
          icon={MousePointerClick}
          color="text-purple-500"
        />
        <KpiCard
          title="CTR PROMEDIO"
          value={`${safeMetrics.averageCtr.toFixed(2)}%`}
          icon={TrendingUp}
          color="text-amber-500"
        />
        <KpiCard
          title="CPC PROMEDIO"
          value={`$${safeMetrics.averageCpc.toFixed(2)}`}
          icon={Zap}
          color="text-rose-500"
        />
        <KpiCard
          title="CONVERSIONES"
          value={safeMetrics.totalConversions.toLocaleString('es-MX')}
          icon={() => <span className="text-lg font-bold">✓</span>}
          color="text-green-500"
        />
        <KpiCard
          title="CAMPAÑAS ACTIVAS"
          value={`${safeMetrics.activeCampaigns} / ${safeMetrics.totalCampaigns}`}
          icon={Activity}
          color="text-indigo-500"
        />
        <KpiCard
          title="PROGRAMACIÓN"
          value={`${safeMetrics.activeSchedules}`}
          icon={Clock}
          color="text-violet-500"
        />
        <KpiCard
          title="A/B TESTS"
          value={`${safeMetrics.activeABTests}`}
          icon={FlaskConical}
          color="text-pink-500"
        />
        <KpiCard
          title="PLATAFORMAS"
          value={`${safeMetrics.platformsConnected}`}
          icon={() => <span className="text-lg font-bold">🔗</span>}
          color="text-cyan-500"
        />
      </div>

      {/* Tabs principales */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid grid-cols-2 md:grid-cols-7 gap-1">
          <TabsTrigger value="overview" className="text-xs">Resumen</TabsTrigger>
          <TabsTrigger value="platforms" className="text-xs">Plataformas</TabsTrigger>
          <TabsTrigger value="campaigns" className="text-xs">Campañas</TabsTrigger>
          <TabsTrigger value="schedules" className="text-xs">
            <Clock className="h-3 w-3 mr-1" />
            Prog.
            {safeMetrics.activeSchedules > 0 && (
              <span className="ml-1 inline-flex items-center justify-center w-4 h-4 rounded-full bg-violet-100 text-violet-700 text-[10px] font-bold">
                {safeMetrics.activeSchedules}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="abtesting" className="text-xs">
            <FlaskConical className="h-3 w-3 mr-1" />
            A/B
            {safeMetrics.activeABTests > 0 && (
              <span className="ml-1 inline-flex items-center justify-center w-4 h-4 rounded-full bg-pink-100 text-pink-700 text-[10px] font-bold">
                {safeMetrics.activeABTests}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="rules" className="text-xs">
            Reglas
            {safeMetrics.activeRules > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary/10 text-primary text-[10px] font-bold">
                {safeMetrics.activeRules}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="recommendations" className="text-xs">
            Recomend.
            {safeMetrics.pendingRecommendations > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-bold">
                {safeMetrics.pendingRecommendations}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <AdsInsightsCharts />
        </TabsContent>

        <TabsContent value="platforms" className="space-y-4">
          <AdsPlatformsSection />
        </TabsContent>

        <TabsContent value="campaigns" className="space-y-4">
          <AdsCampaignsList />
        </TabsContent>

        <TabsContent value="rules" className="space-y-4">
          <AdsBudgetRulesList />
        </TabsContent>

        <TabsContent value="schedules" className="space-y-4">
          <SchedulesListView />
        </TabsContent>

        <TabsContent value="abtesting" className="space-y-4">
          <ABTestsListView />
        </TabsContent>

        <TabsContent value="recommendations" className="space-y-4">
          <AdsRecommendationsList />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function SchedulesListView() {
  const [schedules, setSchedules] = useState<any[]>([])
  const [schedLoading, setSchedLoading] = useState(true)

  useEffect(() => {
    fetchSchedules()
  }, [])

  async function fetchSchedules() {
    try {
      setSchedLoading(true)
      const res = await fetch('/api/ads/schedules')
      if (!res.ok) throw new Error('Error al cargar programaciones')
      const data = await res.json()
      setSchedules(Array.isArray(data) ? data : [])
    } catch {
      setSchedules([])
    } finally {
      setSchedLoading(false)
    }
  }

  const DAY_LABELS: Record<string, string> = {
    MON: 'Lun', TUE: 'Mar', WED: 'Mié', THU: 'Jue', FRI: 'Vie', SAT: 'Sáb', SUN: 'Dom',
  }

  return (
    <Card className="border shadow-sm">
      <CardContent className="p-0">
        {schedLoading ? (
          <div className="flex items-center justify-center p-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary opacity-20" />
          </div>
        ) : schedules.length === 0 ? (
          <div className="text-center p-8 text-sm text-muted-foreground">
            <Clock className="h-6 w-6 mx-auto mb-2 opacity-40" />
            No hay programaciones configuradas
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-[11px] font-bold uppercase">Nombre</TableHead>
                <TableHead className="text-[11px] font-bold uppercase">Campaña</TableHead>
                <TableHead className="text-[11px] font-bold uppercase">Días</TableHead>
                <TableHead className="text-[11px] font-bold uppercase">Horario</TableHead>
                <TableHead className="text-[11px] font-bold uppercase">Acción</TableHead>
                <TableHead className="text-[11px] font-bold uppercase">Estado</TableHead>
                <TableHead className="text-[11px] font-bold uppercase">Últ. Ejecución</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {schedules.map(schedule => {
                const days = (Array.isArray(schedule.daysOfWeek) ? schedule.daysOfWeek : [])
                  .map((d: string) => DAY_LABELS[d] || d)
                  .join(' · ')
                return (
                  <TableRow key={schedule.id} className="group">
                    <TableCell className="font-medium text-sm">{schedule.name}</TableCell>
                    <TableCell>
                      <a
                        href={`/dashboard/ads/campaigns/${schedule.campaignId}`}
                        className="flex items-center gap-1 text-sm hover:text-primary transition-colors"
                      >
                        {schedule.campaign?.name || '—'}
                        <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </a>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{days}</TableCell>
                    <TableCell className="text-xs font-mono text-muted-foreground">
                      {schedule.startTime} – {schedule.endTime}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={`text-[10px] ${
                          schedule.action === 'ACTIVATE'
                            ? 'bg-green-50 text-green-700 border-green-200'
                            : 'bg-amber-50 text-amber-700 border-amber-200'
                        }`}
                      >
                        {schedule.action === 'ACTIVATE' ? (
                          <><Sun className="h-3 w-3 mr-1" />Activar</>
                        ) : (
                          <><Moon className="h-3 w-3 mr-1" />Pausar</>
                        )}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {schedule.enabled ? (
                        <span className="inline-flex items-center gap-1 text-xs text-green-600">
                          <span className="h-2 w-2 rounded-full bg-green-500" />
                          Activo
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <span className="h-2 w-2 rounded-full bg-slate-300" />
                          Inactivo
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {schedule.lastTriggeredAt ? (
                        <span className="inline-flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {format(new Date(schedule.lastTriggeredAt), 'd MMM HH:mm', { locale: es })}
                        </span>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}

function ABTestsListView() {
  const [tests, setTests] = useState<any[]>([])
  const [testLoading, setTestLoading] = useState(true)

  useEffect(() => {
    fetchTests()
  }, [])

  async function fetchTests() {
    try {
      setTestLoading(true)
      const res = await fetch('/api/ads/ab-tests')
      if (!res.ok) throw new Error('Error al cargar A/B tests')
      const data = await res.json()
      setTests(Array.isArray(data) ? data : [])
    } catch {
      setTests([])
    } finally {
      setTestLoading(false)
    }
  }

  const STATUS_BADGE: Record<string, { label: string; className: string }> = {
    DRAFT: { label: 'Borrador', className: 'bg-slate-50 text-slate-600 border-slate-200' },
    RUNNING: { label: 'Activo', className: 'bg-green-50 text-green-700 border-green-200' },
    COMPLETED: { label: 'Completado', className: 'bg-blue-50 text-blue-700 border-blue-200' },
    CANCELLED: { label: 'Cancelado', className: 'bg-red-50 text-red-700 border-red-200' },
  }

  return (
    <Card className="border shadow-sm">
      <CardContent className="p-0">
        {testLoading ? (
          <div className="flex items-center justify-center p-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary opacity-20" />
          </div>
        ) : tests.length === 0 ? (
          <div className="text-center p-8 text-sm text-muted-foreground">
            <FlaskConical className="h-6 w-6 mx-auto mb-2 opacity-40" />
            No hay A/B tests configurados
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-[11px] font-bold uppercase">Nombre</TableHead>
                <TableHead className="text-[11px] font-bold uppercase">Campaña</TableHead>
                <TableHead className="text-[11px] font-bold uppercase">Estado</TableHead>
                <TableHead className="text-[11px] font-bold uppercase">Métrica</TableHead>
                <TableHead className="text-[11px] font-bold uppercase">Variantes</TableHead>
                <TableHead className="text-[11px] font-bold uppercase">Significancia</TableHead>
                <TableHead className="text-[11px] font-bold uppercase">Auto</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tests.map(test => {
                const statusInfo = STATUS_BADGE[test.status] || { label: test.status, className: '' }
                return (
                  <TableRow key={test.id} className="group">
                    <TableCell className="font-medium text-sm">{test.name}</TableCell>
                    <TableCell>
                      <a
                        href={`/dashboard/ads/campaigns/${test.campaignId}`}
                        className="flex items-center gap-1 text-sm hover:text-primary transition-colors"
                      >
                        {test.campaign?.name || '—'}
                        <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </a>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`text-[10px] ${statusInfo.className}`}>
                        {test.status === 'RUNNING' && <Play className="h-3 w-3 mr-1" />}
                        {test.status === 'COMPLETED' && <Trophy className="h-3 w-3 mr-1" />}
                        {statusInfo.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{test.metric || '—'}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {Array.isArray(test.variants) ? test.variants.length : 0} vars.
                    </TableCell>
                    <TableCell className="text-xs font-mono text-muted-foreground">
                      {(test.significanceThreshold * 100).toFixed(0)}%
                    </TableCell>
                    <TableCell>
                      {test.autoDeclare ? (
                        <span className="inline-flex items-center gap-1 text-xs text-green-600">
                          <Zap className="h-3 w-3" />
                          Sí
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}

function KpiCard({
  title,
  value,
  icon: Icon,
  color,
}: {
  title: string
  value: string
  icon: React.ComponentType<{ className?: string }> | React.FC<{ className?: string }>
  color: string
}) {
  return (
    <Card className="border shadow-sm bg-white overflow-hidden">
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{title}</p>
            <p className="text-2xl font-light text-slate-800">{value}</p>
          </div>
          <div className={`p-2 rounded-lg bg-opacity-10 ${color.replace('text', 'bg')}/10`}>
            <Icon className={`h-5 w-5 ${color}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
