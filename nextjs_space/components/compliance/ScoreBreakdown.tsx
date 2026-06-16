'use client'

import {
  ShieldCheck,
  FileText,
  Workflow,
  Users,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Minus,
} from 'lucide-react'

interface ScoreDetail {
  label: string
  value: string | number
  status: 'good' | 'warning' | 'critical'
}

interface ScoreCategory {
  id: string
  name: string
  description: string
  icon: string
  weight: number
  score: number
  maxScore: number
  details: ScoreDetail[]
}

interface ScoreBreakdownProps {
  categories: ScoreCategory[]
  trend: 'up' | 'down' | 'stable'
  trendDelta: number
}

const ICON_MAP: Record<string, any> = {
  ShieldCheck,
  FileText,
  Workflow,
  Users,
  AlertTriangle,
}

const STATUS_STYLES = {
  good: {
    bar: 'bg-emerald-500',
    text: 'text-emerald-700',
    bg: 'bg-emerald-50',
    dot: 'bg-emerald-500',
  },
  warning: {
    bar: 'bg-amber-400',
    text: 'text-amber-700',
    bg: 'bg-amber-50',
    dot: 'bg-amber-400',
  },
  critical: {
    bar: 'bg-red-500',
    text: 'text-red-700',
    bg: 'bg-red-50',
    dot: 'bg-red-500',
  },
}

export function ScoreBreakdown({ categories, trend, trendDelta }: ScoreBreakdownProps) {
  const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus
  const trendColor = trend === 'up' ? 'text-emerald-600' : trend === 'down' ? 'text-red-600' : 'text-slate-400'

  return (
    <div className="space-y-6">
      {/* Tendencia */}
      <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 border border-slate-100">
        <div className="flex items-center gap-3">
          <TrendIcon className={`h-5 w-5 ${trendColor}`} />
          <div>
            <p className="text-xs font-black text-slate-700 uppercase tracking-wider">Tendencia</p>
            <p className="text-[10px] text-slate-400 font-medium">
              {trend === 'up' ? 'Mejorando' : trend === 'down' ? 'Empeorando' : 'Estable'}
              {trendDelta !== 0 && (
                <span className={trendColor}> ({trendDelta > 0 ? '+' : ''}{trendDelta} pts)</span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1 text-[10px] font-bold text-slate-400">
          <span className="h-2 w-4 rounded bg-emerald-500 inline-block" /> Excelente
          <span className="h-2 w-4 rounded bg-amber-400 inline-block ml-2" /> Regular
          <span className="h-2 w-4 rounded bg-red-500 inline-block ml-2" /> Crítico
        </div>
      </div>

      {/* Categorías */}
      {categories.map((cat) => {
        const CatIcon = ICON_MAP[cat.icon] || ShieldCheck
        const barColor =
          cat.score >= 90 ? 'bg-emerald-500' :
          cat.score >= 70 ? 'bg-lime-500' :
          cat.score >= 50 ? 'bg-amber-400' :
          'bg-red-500'

        return (
          <div key={cat.id} className="bg-white rounded-2xl border border-slate-200/60 shadow-sm overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className={`h-10 w-10 rounded-xl flex items-center justify-center bg-slate-100 text-slate-600`}>
                  <CatIcon className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-black text-slate-800 uppercase tracking-tight">{cat.name}</p>
                    <span className="text-[10px] text-slate-400 font-medium bg-slate-100 px-2 py-0.5 rounded-full">
                      {(cat.weight * 100)}%
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-400 font-medium">{cat.description}</p>
                </div>
              </div>

              <div className="text-right">
                <p className={`text-2xl font-black tracking-tight ${
                  cat.score >= 90 ? 'text-emerald-600' :
                  cat.score >= 70 ? 'text-lime-600' :
                  cat.score >= 50 ? 'text-amber-600' :
                  'text-red-600'
                }`}>
                  {cat.score}%
                </p>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Score</p>
              </div>
            </div>

            {/* Barra de progreso */}
            <div className="px-4 pt-3 pb-1">
              <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-1000 ease-out ${barColor}`}
                  style={{ width: `${cat.score}%` }}
                />
              </div>
            </div>

            {/* Detalles */}
            <div className="px-4 pb-4 pt-2 space-y-2">
              {cat.details.map((detail, i) => {
                const s = STATUS_STYLES[detail.status]
                return (
                  <div key={i} className="flex items-center justify-between py-1">
                    <div className="flex items-center gap-2">
                      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
                      <p className="text-[11px] text-slate-600 font-medium">{detail.label}</p>
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${s.bg} ${s.text}`}>
                      {detail.value}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default ScoreBreakdown
