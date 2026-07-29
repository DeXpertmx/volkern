'use client'

import { useState, useEffect, useMemo } from 'react'
import {
  BarChart3,
  Users,
  Eye,
  Heart,
  TrendingUp,
  TrendingDown,
  Share2,
  Loader2,
  AlertTriangle,
  Facebook,
  Instagram,
  Linkedin,
  Youtube,
  Music,
  ExternalLink,
  RefreshCw,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  AreaChart, Area,
  BarChart, Bar,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Line, LineChart,
} from 'recharts'

interface PlatformData {
  platform: string
  profileName: string | null
  profileImage: string | null
  followers: number
  reach: number
  impressions: number
  engagement: number
  engagementRate: number
  postsCount: number
  trend: number
}

interface OverviewData {
  totalReach: number
  totalImpressions: number
  totalEngagement: number
  totalFollowers: number
  avgEngagementRate: number
  periodComparison: {
    reachChange: number
    impressionsChange: number
    engagementChange: number
    followersChange: number
  }
}

interface PostPerf {
  id: string
  platform: string
  content: string
  mediaUrl: string | null
  publishedAt: string
  views: number
  likes: number
  comments: number
  shares: number
  clicks: number
  engagementRate: number
}

interface AnalyticsData {
  overview: OverviewData
  byPlatform: PlatformData[]
  recentPosts: PostPerf[]
  lastSyncedAt: string | null
}

const PLATFORM_CONFIG: Record<string, { name: string; Icon: any; color: string; bg: string }> = {
  facebook: { name: 'Facebook', Icon: Facebook, color: '#1877F2', bg: 'bg-blue-50' },
  instagram: { name: 'Instagram', Icon: Instagram, color: '#E4405F', bg: 'bg-pink-50' },
  linkedin: { name: 'LinkedIn', Icon: Linkedin, color: '#0A66C2', bg: 'bg-sky-50' },
  youtube: { name: 'YouTube', Icon: Youtube, color: '#FF0000', bg: 'bg-red-50' },
  tiktok: { name: 'TikTok', Icon: Music, color: '#010101', bg: 'bg-slate-50' },
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return n.toLocaleString('es-MX')
}

function TrendBadge({ value, label }: { value: number; label?: string }) {
  const isPositive = value >= 0
  return (
    <Badge
      className={`text-[9px] font-black px-1.5 py-0.5 gap-0.5 border-none ${
        isPositive
          ? 'bg-green-50 text-green-700'
          : 'bg-red-50 text-red-600'
      }`}
    >
      {isPositive ? <TrendingUp className="h-2.5 w-2.5" /> : <TrendingDown className="h-2.5 w-2.5" />}
      {Math.abs(value).toFixed(1)}%
      {label && <span className="opacity-60 ml-0.5">{label}</span>}
    </Badge>
  )
}

// ─── Metric Card ──────────────────────────────────────────────────────────
function MetricCard({
  label,
  value,
  sublabel,
  icon: Icon,
  trend,
  color,
}: {
  label: string
  value: string
  sublabel?: string
  icon: any
  trend?: number
  color: string
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200/60 p-5 shadow-sm hover:shadow-md transition-all duration-300 group">
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</p>
          <p className="text-3xl font-black text-slate-900 tracking-tighter">{value}</p>
          {sublabel && (
            <p className="text-[10px] font-bold text-slate-400">{sublabel}</p>
          )}
        </div>
        <div className={`h-10 w-10 rounded-xl ${color} bg-opacity-10 flex items-center justify-center group-hover:scale-110 transition-transform`}>
          <Icon className={`h-5 w-5 ${color}`} />
        </div>
      </div>
      {trend !== undefined && (
        <div className="mt-3">
          <TrendBadge value={trend} label="vs periodo anterior" />
        </div>
      )}
    </div>
  )
}

// ─── Platform Mini Card ───────────────────────────────────────────────────
function PlatformMiniCard({ data }: { data: PlatformData }) {
  const cfg = PLATFORM_CONFIG[data.platform] || { name: data.platform, Icon: Share2, color: '#666', bg: 'bg-slate-50' }
  const { Icon } = cfg

  return (
    <div className="flex items-center gap-4 p-4 rounded-2xl border border-slate-100 bg-white hover:border-slate-200 hover:shadow-sm transition-all group">
      <div className={`h-12 w-12 rounded-xl ${cfg.bg} flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform`}>
        <Icon className={`h-6 w-6`} style={{ color: cfg.color }} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-xs font-black uppercase tracking-tight text-slate-900">{cfg.name}</p>
          {data.followers > 0 && (
            <p className="text-[10px] font-bold text-slate-400">{formatNumber(data.followers)} seg.</p>
          )}
        </div>
        <p className="text-[9px] text-slate-400 font-bold truncate">{data.profileName || 'Sin nombre'}</p>
        <div className="flex items-center gap-4 mt-1.5">
          <span className="text-[10px] font-bold text-slate-600">{formatNumber(data.reach)} alcance</span>
          <span className="text-[10px] font-bold text-emerald-600">{data.engagementRate.toFixed(1)}% engagement</span>
        </div>
      </div>
      <div className="text-right shrink-0">
        <div className="flex items-center gap-1 justify-end">
          <Badge className={`text-[9px] font-black px-1.5 py-0.5 border-none ${data.trend >= 0 ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
            {data.trend >= 0 ? '+' : ''}{data.trend.toFixed(1)}%
          </Badge>
        </div>
        <p className="text-[9px] text-slate-400 font-bold mt-0.5">{data.postsCount} publicaciones</p>
      </div>
    </div>
  )
}

// ─── Engagement Trend Chart ───────────────────────────────────────────────
function EngagementTrendChart({ posts }: { posts: PostPerf[] }) {
  const chartData = useMemo(() => {
    const grouped: Record<string, { date: string; views: number; likes: number; comments: number; shares: number; count: number }> = {}

    for (const p of posts) {
      const date = p.publishedAt.slice(0, 10)
      if (!grouped[date]) {
        grouped[date] = { date, views: 0, likes: 0, comments: 0, shares: 0, count: 0 }
      }
      grouped[date].views += p.views
      grouped[date].likes += p.likes
      grouped[date].comments += p.comments
      grouped[date].shares += p.shares
      grouped[date].count += 1
    }

    return Object.values(grouped)
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-14)
      .map((d) => ({
        date: d.date.slice(5), // MM-DD
        views: d.views,
        likes: d.likes,
        comments: d.comments,
        engagement: d.likes + d.comments + d.shares,
      }))
  }, [posts])

  if (chartData.length === 0) return null

  return (
    <Card className="rounded-3xl border-slate-200/60 shadow-sm overflow-hidden">
      <CardHeader className="border-b border-slate-100 bg-slate-50/50 pb-3">
        <CardTitle className="text-xs font-black uppercase tracking-tighter flex items-center gap-2">
          <BarChart3 className="h-3.5 w-3.5 text-indigo-500" />
          Tendencia de Engagement
        </CardTitle>
        <CardDescription className="text-[10px]">Últimos 14 días con actividad</CardDescription>
      </CardHeader>
      <CardContent className="p-5">
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="engageGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#6366f1" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#6366f1" stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="viewsGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#06b6d4" stopOpacity={0.2} />
                <stop offset="100%" stopColor="#06b6d4" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="date" tick={{ fontSize: 9 }} stroke="#94a3b8" />
            <YAxis tick={{ fontSize: 9 }} stroke="#94a3b8" />
            <Tooltip
              contentStyle={{ fontSize: 11, borderRadius: 12, border: '1px solid #e2e8f0' }}
            />
            <Area type="monotone" dataKey="engagement" name="Engagement" stroke="#6366f1" strokeWidth={2} fill="url(#engageGrad)" />
            <Area type="monotone" dataKey="views" name="Vistas" stroke="#06b6d4" strokeWidth={1.5} fill="url(#viewsGrad)" />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}

// ─── Platform Comparison Bars ─────────────────────────────────────────────
function PlatformComparisonChart({ platforms }: { platforms: PlatformData[] }) {
  const chartData = platforms
    .filter((p) => p.impressions > 0 || p.followers > 0)
    .map((p) => ({
      name: PLATFORM_CONFIG[p.platform]?.name || p.platform,
      Alcance: p.reach,
      Impresiones: p.impressions,
      Engagement: p.engagement,
      Seguidores: p.followers,
    }))

  if (chartData.length === 0) return null

  return (
    <Card className="rounded-3xl border-slate-200/60 shadow-sm overflow-hidden">
      <CardHeader className="border-b border-slate-100 bg-slate-50/50 pb-3">
        <CardTitle className="text-xs font-black uppercase tracking-tighter flex items-center gap-2">
          <BarChart3 className="h-3.5 w-3.5 text-indigo-500" />
          Comparativa por Plataforma
        </CardTitle>
        <CardDescription className="text-[10px]">Alcance e impresiones agregadas</CardDescription>
      </CardHeader>
      <CardContent className="p-5">
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 9 }} />
            <Tooltip contentStyle={{ fontSize: 11, borderRadius: 12 }} />
            <Bar dataKey="Alcance" fill="#6366f1" radius={[4, 4, 0, 0]} maxBarSize={32} />
            <Bar dataKey="Impresiones" fill="#06b6d4" radius={[4, 4, 0, 0]} maxBarSize={32} />
            <Bar dataKey="Seguidores" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={32} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}

// ─── Recent Posts Table ───────────────────────────────────────────────────
function RecentPostsTable({ posts }: { posts: PostPerf[] }) {
  if (posts.length === 0) {
    return (
      <div className="p-10 text-center flex flex-col items-center gap-3">
        <Share2 className="h-8 w-8 text-slate-200" />
        <p className="text-xs text-slate-400 italic">No hay publicaciones con métricas aún</p>
      </div>
    )
  }

  return (
    <div className="divide-y divide-slate-100">
      {posts.slice(0, 10).map((post) => {
        const cfg = PLATFORM_CONFIG[post.platform] || { Icon: Share2 }
        const { Icon } = cfg
        return (
          <div key={post.id} className="flex items-center gap-3 p-3 hover:bg-slate-50/50 transition-colors">
            <div className="h-8 w-8 rounded-lg bg-slate-100 flex items-center justify-center shrink-0 overflow-hidden">
              {post.mediaUrl ? (
                <img src={post.mediaUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <Icon className="h-4 w-4 text-slate-400" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-bold text-slate-800 truncate">{post.content.slice(0, 80)}</p>
              <div className="flex items-center gap-3 mt-0.5">
                <span className="text-[9px] text-slate-400 font-bold uppercase">{new Date(post.publishedAt).toLocaleDateString()}</span>
                <span className="text-[9px] text-slate-400">{post.views.toLocaleString()} vistas</span>
                <span className="text-[9px] text-rose-400">{post.likes} likes</span>
                {post.engagementRate > 0 && (
                  <span className="text-[9px] text-emerald-500">{post.engagementRate.toFixed(1)}% eng.</span>
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── Loading Skeleton ─────────────────────────────────────────────────────
function AnalyticsSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-32 rounded-2xl" />
        ))}
      </div>
      <Skeleton className="h-48 rounded-3xl" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Skeleton className="h-64 rounded-3xl" />
        <Skeleton className="h-64 rounded-3xl" />
      </div>
    </div>
  )
}

// ─── Main Widget ──────────────────────────────────────────────────────────
export function SocialAnalyticsWidget({ onRefresh }: { onRefresh?: () => void }) {
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchAnalytics = async () => {
    try {
      setLoading(true)
      setError(null)
      const res = await fetch('/api/social/analytics')
      const json = await res.json()
      if (json.success) {
        setData({
          overview: json.overview,
          byPlatform: json.byPlatform || [],
          recentPosts: json.recentPosts || [],
          lastSyncedAt: json.lastSyncedAt,
        })
      } else {
        setError(json.error || 'Error al cargar analíticas')
      }
    } catch {
      setError('Error de conexión')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchAnalytics()
  }, [])

  if (loading) return <AnalyticsSkeleton />
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-12 gap-4">
        <AlertTriangle className="h-10 w-10 text-amber-400" />
        <p className="text-sm text-slate-500">{error}</p>
        <Button
          onClick={fetchAnalytics}
          variant="outline"
          size="sm"
          className="rounded-xl text-xs font-bold gap-1.5"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Reintentar
        </Button>
      </div>
    )
  }

  if (!data) return null

  const { overview, byPlatform, recentPosts } = data
  const connectedCount = byPlatform.length

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-xl bg-indigo-100 flex items-center justify-center">
            <BarChart3 className="h-4 w-4 text-indigo-600" />
          </div>
          <div>
            <h3 className="text-sm font-black uppercase tracking-tight text-slate-800">Estadísticas en Vivo</h3>
            <p className="text-[9px] font-bold text-slate-400">
              {connectedCount} plataforma{connectedCount !== 1 ? 's' : ''} conectada{connectedCount !== 1 ? 's' : ''}
              {data.lastSyncedAt && ` · Actualizado ${new Date(data.lastSyncedAt).toLocaleTimeString()}`}
            </p>
          </div>
        </div>
        <Button
          onClick={() => { fetchAnalytics(); onRefresh?.() }}
          variant="ghost"
          size="sm"
          className="text-[10px] font-bold text-slate-400 gap-1 hover:text-indigo-600 h-7 rounded-lg"
        >
          <RefreshCw className="h-3 w-3" />
          Sincronizar
        </Button>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard
          label="Alcance Total"
          value={formatNumber(overview.totalReach)}
          sublabel="últimos 7 días"
          icon={Eye}
          trend={overview.periodComparison.reachChange}
          color="text-indigo-500"
        />
        <MetricCard
          label="Impresiones"
          value={formatNumber(overview.totalImpressions)}
          sublabel="totales acumuladas"
          icon={BarChart3}
          trend={overview.periodComparison.impressionsChange}
          color="text-cyan-500"
        />
        <MetricCard
          label="Engagement"
          value={formatNumber(overview.totalEngagement)}
          sublabel={`${overview.avgEngagementRate.toFixed(1)}% tasa promedio`}
          icon={Heart}
          trend={overview.periodComparison.engagementChange}
          color="text-rose-500"
        />
        <MetricCard
          label="Seguidores"
          value={formatNumber(overview.totalFollowers)}
          sublabel="totales en todas las plataformas"
          icon={Users}
          trend={overview.periodComparison.followersChange}
          color="text-emerald-500"
        />
      </div>

      {/* Platform Breakdown */}
      {byPlatform.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
            Rendimiento por Plataforma
          </p>
          <div className="grid grid-cols-1 gap-2">
            {byPlatform.map((p) => (
              <PlatformMiniCard key={p.platform} data={p} />
            ))}
          </div>
        </div>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <EngagementTrendChart posts={recentPosts} />
        <PlatformComparisonChart platforms={byPlatform} />
      </div>

      {/* Recent Posts Performance */}
      <Card className="rounded-3xl border-slate-200/60 shadow-sm overflow-hidden">
        <CardHeader className="border-b border-slate-100 bg-slate-50/50 pb-3">
          <CardTitle className="text-xs font-black uppercase tracking-tighter flex items-center gap-2">
            <Share2 className="h-3.5 w-3.5 text-indigo-500" />
            Rendimiento de Publicaciones
          </CardTitle>
          <CardDescription className="text-[10px]">Métricas de las últimas publicaciones</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <RecentPostsTable posts={recentPosts} />
        </CardContent>
      </Card>
    </div>
  )
}
