'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Loader2, ArrowLeft, Pause, Play, RefreshCw, AlertTriangle, DollarSign, MousePointerClick, Eye, Clock, FlaskConical } from 'lucide-react'
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts'
import { useToast } from '@/components/ui/use-toast'
import { AdScheduleCalendar } from './AdScheduleCalendar'
import { AdABTestManager } from './AdABTestManager'

interface CampaignDetail {
  id: string
  externalId: string | null
  name: string
  platform: string
  status: string
  objective: string | null
  dailyBudget: number | null
  lifetimeBudget: number | null
  startDate: string | null
  endDate: string | null
  createdAt: string
  updatedAt: string
  platformConnection: {
    platform: string
    accountName: string | null
    accountId: string | null
  } | null
  adSets: Array<{
    id: string
    name: string
    status: string
  }>
  _count: {
    adSets: number
    ads: number
    insights: number
  }
}

interface InsightPoint {
  date: string
  spend: number
  impressions: number
  clicks: number
  conversions: number
  ctr: number
  cpc: number
}

export function AdsCampaignDetail({ campaignId, onBack }: { campaignId: string; onBack: () => void }) {
  const [campaign, setCampaign] = useState<CampaignDetail | null>(null)
  const [insights, setInsights] = useState<InsightPoint[]>([])
  const [insightsLoading, setInsightsLoading] = useState(true)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [activeTab, setActiveTab] = useState('overview')
  const { toast } = useToast()

  useEffect(() => {
    fetchCampaign()
    fetchInsights()
  }, [campaignId])

  async function fetchCampaign() {
    try {
      setLoading(true)
      const res = await fetch(`/api/ads/campaigns/${campaignId}`)
      if (!res.ok) throw new Error('Error al cargar campaña')
      const data = await res.json()
      const raw = data.campaign || data
      setCampaign({
        ...raw,
        platformConnection: raw.platformConnection || raw.platform || null,
        adSets: (raw.adSets || []).map((as: any) => ({
          id: as.id,
          name: as.name,
          status: as.status,
        })),
        _count: raw._count || {
          adSets: (raw.adSets || []).length,
          ads: (raw.adSets || []).reduce((s: number, as: any) => s + (as.ads?.length || 0), 0),
          insights: (raw.adInsights || []).length,
        },
      })
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Error desconocido',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  async function fetchInsights() {
    try {
      setInsightsLoading(true)
      const res = await fetch(`/api/ads/insights/daily?campaignId=${campaignId}&days=30`)
      if (!res.ok) throw new Error('Error al cargar insights')
      const data = await res.json()
      const points = Array.isArray(data) ? data : data.records || data.insights || []
      setInsights(
        points.map((p: any) => {
          const impressions = p.impressions || 0
          const clicks = p.clicks || 0
          const spend = p.spend || 0
          return {
            date: p.date || p.dateStart,
            spend,
            impressions,
            clicks,
            conversions: p.conversions || 0,
            ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
            cpc: clicks > 0 ? spend / clicks : 0,
          }
        })
      )
    } catch {
      setInsights([])
    } finally {
      setInsightsLoading(false)
    }
  }

  async function handlePause() {
    try {
      setActionLoading(true)
      const res = await fetch(`/api/ads/campaigns/${campaignId}/pause`, { method: 'POST' })
      if (!res.ok) throw new Error('Error al pausar')
      toast({ title: 'Campaña pausada' })
      fetchCampaign()
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Error desconocido',
        variant: 'destructive',
      })
    } finally {
      setActionLoading(false)
    }
  }

  async function handleResume() {
    try {
      setActionLoading(true)
      const res = await fetch(`/api/ads/campaigns/${campaignId}/resume`, { method: 'POST' })
      if (!res.ok) throw new Error('Error al reanudar')
      toast({ title: 'Campaña reanudada' })
      fetchCampaign()
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Error desconocido',
        variant: 'destructive',
      })
    } finally {
      setActionLoading(false)
    }
  }

  async function handleSync() {
    try {
      setActionLoading(true)
      const res = await fetch(`/api/ads/campaigns/${campaignId}/sync`, { method: 'POST' })
      if (!res.ok) throw new Error('Error al sincronizar')
      toast({ title: 'Sincronización iniciada' })
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Error desconocido',
        variant: 'destructive',
      })
    } finally {
      setActionLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary opacity-20" />
      </div>
    )
  }

  if (!campaign) {
    return (
      <div className="text-center p-12">
        <AlertTriangle className="h-8 w-8 text-amber-500 mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">Campaña no encontrada</p>
        <Button variant="outline" size="sm" className="mt-4" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Volver
        </Button>
      </div>
    )
  }

  const totalSpend = insights.reduce((sum, p) => sum + (p.spend || 0), 0)
  const totalImpressions = insights.reduce((sum, p) => sum + (p.impressions || 0), 0)
  const totalClicks = insights.reduce((sum, p) => sum + (p.clicks || 0), 0)
  const totalConversions = insights.reduce((sum, p) => sum + (p.conversions || 0), 0)
  const avgCtr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0
  const avgCpc = totalClicks > 0 ? totalSpend / totalClicks : 0

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h2 className="text-xl font-bold">{campaign.name}</h2>
            <p className="text-xs text-muted-foreground">
              ID externo: {campaign.externalId || '—'} · Creada: {new Date(campaign.createdAt).toLocaleDateString('es-MX')}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {campaign.status === 'ACTIVE' ? (
            <Button variant="outline" size="sm" onClick={handlePause} disabled={actionLoading}>
              {actionLoading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Pause className="h-4 w-4 mr-1" />}
              Pausar
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={handleResume} disabled={actionLoading}>
              {actionLoading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Play className="h-4 w-4 mr-1" />}
              Reanudar
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={handleSync} disabled={actionLoading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${actionLoading ? 'animate-spin' : ''}`} />
            Sincronizar
          </Button>
        </div>
      </div>

      {/* KPIs de campaña */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <DetailKpi title="Inversión" value={`$${totalSpend.toFixed(2)}`} icon={DollarSign} color="text-emerald-500" />
        <DetailKpi title="Impresiones" value={totalImpressions.toLocaleString('es-MX')} icon={Eye} color="text-blue-500" />
        <DetailKpi title="Clics" value={totalClicks.toLocaleString('es-MX')} icon={MousePointerClick} color="text-purple-500" />
        <DetailKpi title="CTR" value={`${avgCtr.toFixed(2)}%`} icon={() => <span className="text-lg font-bold">%</span>} color="text-amber-500" />
        <DetailKpi title="CPC" value={`$${avgCpc.toFixed(2)}`} icon={() => <span className="text-lg font-bold">¢</span>} color="text-rose-500" />
        <DetailKpi title="Conversiones" value={totalConversions.toLocaleString('es-MX')} icon={() => <span className="text-lg font-bold">✓</span>} color="text-green-500" />
        <DetailKpi title="Ad Sets" value={`${campaign._count.adSets}`} icon={() => <span className="text-lg font-bold">⊞</span>} color="text-indigo-500" />
        <DetailKpi title="Anuncios" value={`${campaign._count.ads}`} icon={() => <span className="text-lg font-bold">⊟</span>} color="text-cyan-500" />
      </div>

      {/* Detalles de campaña */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="border shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-bold uppercase text-slate-500">Información General</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Plataforma</span>
              <span className="font-medium">{campaign.platformConnection?.accountName || campaign.platform}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Estado</span>
              <Badge variant="outline" className={
                campaign.status === 'ACTIVE' ? 'bg-green-50 text-green-700' :
                campaign.status === 'PAUSED' ? 'bg-amber-50 text-amber-700' :
                'bg-slate-50 text-slate-500'
              }>
                {campaign.status}
              </Badge>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Objetivo</span>
              <span>{campaign.objective || '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Presupuesto diario</span>
              <span className="font-mono">{campaign.dailyBudget ? `$${campaign.dailyBudget.toFixed(2)}` : '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Presupuesto total</span>
              <span className="font-mono">{campaign.lifetimeBudget ? `$${campaign.lifetimeBudget.toFixed(2)}` : '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Inicio</span>
              <span>{campaign.startDate ? new Date(campaign.startDate).toLocaleDateString('es-MX') : '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Fin</span>
              <span>{campaign.endDate ? new Date(campaign.endDate).toLocaleDateString('es-MX') : '—'}</span>
            </div>
          </CardContent>
        </Card>

        <Card className="border shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-bold uppercase text-slate-500">Ad Sets</CardTitle>
          </CardHeader>
          <CardContent>
            {campaign.adSets.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin ad sets</p>
            ) : (
              <div className="space-y-1">
                {campaign.adSets.map(as => (
                  <div key={as.id} className="flex justify-between items-center py-1">
                    <span className="text-sm">{as.name}</span>
                    <Badge variant="outline" className="text-[10px]">
                      {as.status}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Gráficos de insights */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview" className="text-xs">Visión General</TabsTrigger>
          <TabsTrigger value="spend" className="text-xs">Inversión</TabsTrigger>
          <TabsTrigger value="performance" className="text-xs">Rendimiento</TabsTrigger>
          <TabsTrigger value="schedule" className="text-xs">
            <Clock className="h-3 w-3 mr-1" />
            Programación
          </TabsTrigger>
          <TabsTrigger value="abtesting" className="text-xs">
            <FlaskConical className="h-3 w-3 mr-1" />
            A/B Tests
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4 pt-4">
          {insightsLoading ? (
            <div className="flex items-center justify-center p-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary opacity-20" />
            </div>
          ) : insights.length === 0 ? (
            <div className="text-center p-8 text-sm text-muted-foreground">
              No hay datos de insights disponibles
            </div>
          ) : (
            <Card className="border shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-bold uppercase text-slate-500">Inversión e Impresiones (30 días)</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={insights}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(v) => {
                      const d = new Date(v)
                      return `${d.getDate()}/${d.getMonth() + 1}`
                    }} />
                    <YAxis yAxisId="left" tick={{ fontSize: 10 }} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} />
                    <Tooltip contentStyle={{ fontSize: 12 }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar yAxisId="left" dataKey="spend" name="Inversión ($)" fill="#3b82f6" radius={[2, 2, 0, 0]} barSize={16} />
                    <Bar yAxisId="right" dataKey="impressions" name="Impresiones" fill="#93c5fd" radius={[2, 2, 0, 0]} barSize={16} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="spend" className="space-y-4 pt-4">
          {insights.length > 0 && (
            <Card className="border shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-bold uppercase text-slate-500">Inversión Diaria</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={250}>
                  <AreaChart data={insights}>
                    <defs>
                      <linearGradient id="spendGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.05} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(v) => {
                      const d = new Date(v)
                      return `${d.getDate()}/${d.getMonth() + 1}`
                    }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip contentStyle={{ fontSize: 12 }} />
                    <Area type="monotone" dataKey="spend" name="Inversión ($)" stroke="#3b82f6" strokeWidth={2} fill="url(#spendGradient)" />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="performance" className="space-y-4 pt-4">
          {insights.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card className="border shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-bold uppercase text-slate-500">CTR Diario (%)</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={200}>
                    <AreaChart data={insights}>
                      <defs>
                        <linearGradient id="ctrGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.3} />
                          <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0.05} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(v) => {
                        const d = new Date(v)
                        return `${d.getDate()}/${d.getMonth() + 1}`
                      }} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip contentStyle={{ fontSize: 12 }} />
                      <Area type="monotone" dataKey="ctr" name="CTR (%)" stroke="#8b5cf6" strokeWidth={2} fill="url(#ctrGradient)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
              <Card className="border shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-bold uppercase text-slate-500">CPC Diario ($)</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={200}>
                    <AreaChart data={insights}>
                      <defs>
                        <linearGradient id="cpcGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.3} />
                          <stop offset="100%" stopColor="#f59e0b" stopOpacity={0.05} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(v) => {
                        const d = new Date(v)
                        return `${d.getDate()}/${d.getMonth() + 1}`
                      }} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip contentStyle={{ fontSize: 12 }} />
                      <Area type="monotone" dataKey="cpc" name="CPC ($)" stroke="#f59e0b" strokeWidth={2} fill="url(#cpcGradient)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        <TabsContent value="schedule" className="space-y-4 pt-4">
          <AdScheduleCalendar campaignId={campaign.id} />
        </TabsContent>

        <TabsContent value="abtesting" className="space-y-4 pt-4">
          <AdABTestManager campaignId={campaign.id} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function DetailKpi({
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
    <Card className="border shadow-sm bg-white">
      <CardContent className="p-3">
        <div className="flex items-start justify-between">
          <div className="space-y-0.5">
            <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">{title}</p>
            <p className="text-lg font-light text-slate-800">{value}</p>
          </div>
          <div className={`p-1.5 rounded-lg bg-opacity-10 ${color.replace('text', 'bg')}/10`}>
            <Icon className={`h-4 w-4 ${color}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
