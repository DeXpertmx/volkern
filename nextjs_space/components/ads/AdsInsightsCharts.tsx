'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Loader2, AlertTriangle } from 'lucide-react'
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts'

interface DailyInsight {
  date: string
  spend: number
  impressions: number
  clicks: number
  conversions: number
  ctr: number
  cpc: number
  cpm: number
}

interface PlatformSummary {
  platform: string
  spend: number
  impressions: number
  clicks: number
  conversions: number
}

const PLATFORM_COLORS: Record<string, string> = {
  meta: '#1877F2',
  google: '#34A853',
  linkedin: '#0A66C2',
  tiktok: '#FE2C55',
}

const PLATFORM_NAMES: Record<string, string> = {
  meta: 'Meta Ads',
  google: 'Google Ads',
  linkedin: 'LinkedIn Ads',
  tiktok: 'TikTok Ads',
}

export function AdsInsightsCharts() {
  const [dailyData, setDailyData] = useState<DailyInsight[]>([])
  const [platformData, setPlatformData] = useState<PlatformSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [granularity, setGranularity] = useState('daily')
  const [chartMetric, setChartMetric] = useState('spend')

  useEffect(() => {
    fetchData()
  }, [granularity])

  async function fetchData() {
    try {
      setLoading(true)
      const endpoint = granularity === 'daily' ? '/api/ads/insights/daily?days=30' : '/api/ads/insights'
      const res = await fetch(endpoint)
      if (!res.ok) throw new Error('Error al cargar insights')
      const data = await res.json()
      const points = Array.isArray(data) ? data : data.records || data.insights || []
      setDailyData(
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
            ctr: p.ctr ?? (impressions > 0 ? (clicks / impressions) * 100 : 0),
            cpc: p.cpc ?? (clicks > 0 ? spend / clicks : 0),
            cpm: p.cpm ?? (impressions > 0 ? (spend / impressions) * 1000 : 0),
          }
        })
      )

      const summaryRes = await fetch('/api/ads/insights/summary')
      if (summaryRes.ok) {
        const summary = await summaryRes.json()
        const breakdown = summary.platformBreakdown || summary.byPlatform || []
        setPlatformData(
          breakdown.map((p: any) => ({
            platform: String(p.platform || '').toLowerCase(),
            spend: p.totalSpend ?? p.spend ?? 0,
            impressions: p.totalImpressions ?? p.impressions ?? 0,
            clicks: p.totalClicks ?? p.clicks ?? 0,
            conversions: p.totalConversions ?? p.conversions ?? 0,
          }))
        )
      }
    } catch {
      setDailyData([])
      setPlatformData([])
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-6 w-6 animate-spin text-primary opacity-20" />
      </div>
    )
  }

  const chartLabel = chartMetric === 'spend' ? 'Inversión ($)' :
    chartMetric === 'impressions' ? 'Impresiones' :
    chartMetric === 'clicks' ? 'Clics' : 'Conversiones'

  const pieChartData = platformData
    .filter(p => p.spend > 0)
    .map(p => ({
      name: PLATFORM_NAMES[p.platform] || p.platform,
      value: p.spend,
      color: PLATFORM_COLORS[p.platform] || '#888888',
    }))

  return (
    <div className="space-y-6">
      {/* Selector de granularidad y métrica */}
      <div className="flex gap-3">
        <Tabs value={granularity} onValueChange={setGranularity}>
          <TabsList className="h-8">
            <TabsTrigger value="daily" className="text-xs">Diario</TabsTrigger>
            <TabsTrigger value="summary" className="text-xs">Resumen</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {dailyData.length === 0 ? (
        <div className="text-center p-8 text-sm text-muted-foreground">
          <AlertTriangle className="h-6 w-6 mx-auto mb-2 opacity-40" />
          No hay datos de insights disponibles. Conecta una plataforma y sincroniza campañas.
        </div>
      ) : (
        <>
          {/* Gráfico principal de métrica seleccionada */}
          <Card className="border shadow-sm">
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-xs font-bold uppercase text-slate-500">Evolución {chartLabel}</CardTitle>
              <div className="flex gap-1">
                {['spend', 'impressions', 'clicks', 'conversions'].map(metric => (
                  <button
                    key={metric}
                    onClick={() => setChartMetric(metric)}
                    className={`px-2 py-1 text-[10px] rounded-md transition-colors ${
                      chartMetric === metric
                        ? 'bg-primary/10 text-primary font-semibold'
                        : 'text-muted-foreground hover:bg-slate-100'
                    }`}
                  >
                    {metric === 'spend' ? '$' : metric === 'impressions' ? 'Impr' : metric === 'clicks' ? 'Clics' : 'Conv'}
                  </button>
                ))}
              </div>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={dailyData}>
                  <defs>
                    <linearGradient id="metricGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10 }}
                    tickFormatter={(v) => {
                      const d = new Date(v)
                      return `${d.getDate()}/${d.getMonth() + 1}`
                    }}
                    interval="preserveStartEnd"
                  />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip
                    contentStyle={{ fontSize: 12, borderRadius: 8 }}
                    formatter={(value) => [
                      chartMetric === 'spend'
                        ? `$${Number(value).toFixed(2)}`
                        : Number(value).toLocaleString('es-MX'),
                      chartLabel,
                    ] as [string, string]}
                  />
                  <Area
                    type="monotone"
                    dataKey={chartMetric}
                    name={chartLabel}
                    stroke="#3b82f6"
                    strokeWidth={2}
                    fill="url(#metricGradient)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Distribución por plataforma */}
          {pieChartData.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card className="border shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-bold uppercase text-slate-500">Inversión por Plataforma</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={250}>
                    <PieChart>
                      <Pie
                        data={pieChartData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={90}
                        paddingAngle={3}
                        dataKey="value"
                      >
                        {pieChartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{ fontSize: 12, borderRadius: 8 }}
                        formatter={(value) => [`$${Number(value).toFixed(2)}`, 'Inversión'] as [string, string]}
                      />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card className="border shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xs font-bold uppercase text-slate-500">Métricas por Plataforma</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {platformData.filter(p => p.spend > 0).map(p => (
                      <div key={p.platform} className="space-y-1">
                        <div className="flex justify-between items-center">
                          <div className="flex items-center gap-2">
                            <div
                              className="w-3 h-3 rounded-full"
                              style={{ backgroundColor: PLATFORM_COLORS[p.platform] || '#888' }}
                            />
                            <span className="text-sm font-medium">{PLATFORM_NAMES[p.platform] || p.platform}</span>
                          </div>
                          <span className="text-sm font-mono">${p.spend.toFixed(2)}</span>
                        </div>
                        <div className="flex gap-4 text-[10px] text-muted-foreground pl-5">
                          <span>{p.impressions.toLocaleString('es-MX')} imp.</span>
                          <span>{p.clicks.toLocaleString('es-MX')} clics</span>
                          <span>{p.conversions} conv.</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Comparativa CTR y CPC */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="border shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-bold uppercase text-slate-500">CTR Diario (%)</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={dailyData}>
                    <defs>
                      <linearGradient id="ctrGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0.05} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(v) => {
                      const d = new Date(v)
                      return `${d.getDate()}/${d.getMonth() + 1}`
                    }} />
                    <YAxis tick={{ fontSize: 10 }} domain={[0, 'auto']} />
                    <Tooltip contentStyle={{ fontSize: 12 }} formatter={(value) => [`${Number(value).toFixed(2)}%`, 'CTR'] as [string, string]} />
                    <Area type="monotone" dataKey="ctr" stroke="#8b5cf6" strokeWidth={2} fill="url(#ctrGrad)" />
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
                  <AreaChart data={dailyData}>
                    <defs>
                      <linearGradient id="cpcGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="#f59e0b" stopOpacity={0.05} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(v) => {
                      const d = new Date(v)
                      return `${d.getDate()}/${d.getMonth() + 1}`
                    }} />
                    <YAxis tick={{ fontSize: 10 }} domain={[0, 'auto']} />
                    <Tooltip contentStyle={{ fontSize: 12 }} formatter={(value) => [`$${Number(value).toFixed(2)}`, 'CPC'] as [string, string]} />
                    <Area type="monotone" dataKey="cpc" stroke="#f59e0b" strokeWidth={2} fill="url(#cpcGrad)" />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  )
}
