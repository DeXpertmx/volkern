'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Loader2, AlertTriangle, TrendingUp, DollarSign, MousePointerClick, Activity, Zap } from 'lucide-react'
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
      const [summaryRes, rulesRes, recsRes, campaignsRes] = await Promise.all([
        fetch('/api/ads/insights/summary'),
        fetch('/api/ads/watchdog/rules'),
        fetch('/api/ads/recommendations'),
        fetch('/api/ads/campaigns'),
      ])

      const summary = summaryRes.ok ? await summaryRes.json() : {}
      const rulesData = rulesRes.ok ? await rulesRes.json() : {}
      const recsData = recsRes.ok ? await recsRes.json() : {}
      const campaignsData = campaignsRes.ok ? await campaignsRes.json() : {}

      const rules = Array.isArray(rulesData.rules) ? rulesData.rules : []
      const recommendations = Array.isArray(recsData.recommendations) ? recsData.recommendations : []
      const campaigns = Array.isArray(campaignsData.campaigns) ? campaignsData.campaigns : []

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
          title="PLATAFORMAS"
          value={`${safeMetrics.platformsConnected}`}
          icon={() => <span className="text-lg font-bold">🔗</span>}
          color="text-cyan-500"
        />
      </div>

      {/* Tabs principales */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid grid-cols-2 md:grid-cols-5 gap-2">
          <TabsTrigger value="overview" className="text-xs">Resumen</TabsTrigger>
          <TabsTrigger value="platforms" className="text-xs">Plataformas</TabsTrigger>
          <TabsTrigger value="campaigns" className="text-xs">Campañas</TabsTrigger>
          <TabsTrigger value="rules" className="text-xs">
            Reglas
            {safeMetrics.activeRules > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary/10 text-primary text-[10px] font-bold">
                {safeMetrics.activeRules}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="recommendations" className="text-xs">
            Recomendaciones
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

        <TabsContent value="recommendations" className="space-y-4">
          <AdsRecommendationsList />
        </TabsContent>
      </Tabs>
    </div>
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
