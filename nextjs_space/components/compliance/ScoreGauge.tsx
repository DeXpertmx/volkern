'use client'

import {
  RadialBarChart,
  RadialBar,
  PolarAngleAxis,
  ResponsiveContainer,
} from 'recharts'

interface ScoreGaugeProps {
  score: number
  size?: 'sm' | 'md' | 'lg'
}

const getScoreColor = (score: number) => {
  if (score >= 90) return '#059669' // emerald-600
  if (score >= 70) return '#65A30D' // lime-600
  if (score >= 50) return '#D97706' // amber-600
  return '#DC2626' // red-600
}

const getScoreLabel = (score: number) => {
  if (score >= 90) return 'Excelente'
  if (score >= 70) return 'Bueno'
  if (score >= 50) return 'Regular'
  return 'Crítico'
}

const getScoreBg = (score: number) => {
  if (score >= 90) return 'bg-emerald-50 text-emerald-700 border-emerald-200'
  if (score >= 70) return 'bg-lime-50 text-lime-700 border-lime-200'
  if (score >= 50) return 'bg-amber-50 text-amber-700 border-amber-200'
  return 'bg-red-50 text-red-700 border-red-200'
}

export function ScoreGauge({ score, size = 'md' }: ScoreGaugeProps) {
  const color = getScoreColor(score)
  const label = getScoreLabel(score)
  const bg = getScoreBg(score)

  const data = [{ name: 'Score', value: score, fill: color }]

  const dimensions = {
    sm: { height: 160, innerRadius: 60, outerRadius: 80, fontSize: 28 },
    md: { height: 220, innerRadius: 80, outerRadius: 110, fontSize: 36 },
    lg: { height: 280, innerRadius: 100, outerRadius: 140, fontSize: 48 },
  }[size]

  return (
    <div className="flex flex-col items-center">
      <div style={{ width: '100%', height: dimensions.height }}>
        <ResponsiveContainer width="100%" height="100%">
          <RadialBarChart
            cx="50%"
            cy="50%"
            innerRadius={dimensions.innerRadius}
            outerRadius={dimensions.outerRadius}
            barSize={12}
            data={data}
            startAngle={180}
            endAngle={0}
          >
            <PolarAngleAxis
              type="number"
              domain={[0, 100]}
              angleAxisId={0}
              tick={false}
            />
            <RadialBar
              background
              dataKey="value"
              cornerRadius={12}
              fill={color}
            />
            <text
              x="50%"
              y="50%"
              textAnchor="middle"
              dominantBaseline="middle"
              style={{ fontSize: dimensions.fontSize, fontWeight: 900 }}
              fill={color}
            >
              {score}%
            </text>
            <text
              x="50%"
              y="58%"
              textAnchor="middle"
              dominantBaseline="middle"
              style={{ fontSize: 11, fontWeight: 700 }}
              fill="#94A3B8"
            >
              Cumplimiento
            </text>
          </RadialBarChart>
        </ResponsiveContainer>
      </div>

      <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border ${bg}`}>
        <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} />
        {label}
      </span>
    </div>
  )
}

export default ScoreGauge
