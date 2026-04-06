
'use client'

import dynamic from 'next/dynamic'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

const ChartContainer = dynamic(
  () => Promise.resolve(({ children }: { children: React.ReactNode }) => <div>{children}</div>),
  { ssr: false }
)

interface DashboardStatsProps {
  data: { fecha: string; ingresos: number }[]
}

export function DashboardStats({ data }: DashboardStatsProps) {
  if (!data || data.length === 0) {
    return (
      <div className="h-[300px] flex items-center justify-center text-muted-foreground">
        No hay datos disponibles
      </div>
    )
  }

  // Formatear datos para el gráfico
  const chartData = data?.map((item) => ({
    ...item,
    fechaFormateada: format(new Date(item.fecha), 'dd MMM', { locale: es }),
  })) || []

  return (
    <ChartContainer>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis 
            dataKey="fechaFormateada" 
            tick={{ fontSize: 10 }}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis 
            tick={{ fontSize: 10 }}
            tickLine={false}
            tickFormatter={(value) => `$${value}`}
          />
          <Tooltip
            content={({ active, payload, label }) => {
              if (active && payload && payload.length) {
                return (
                  <div className="rounded-lg border bg-background p-3 shadow-md">
                    <p className="font-medium">{label}</p>
                    <p className="text-sm text-primary">
                      Ingresos: ${Number(payload[0]?.value || 0).toFixed(2)}
                    </p>
                  </div>
                )
              }
              return null
            }}
          />
          <Line
            type="monotone"
            dataKey="ingresos"
            stroke="hsl(var(--primary))"
            strokeWidth={2}
            dot={{ fill: 'hsl(var(--primary))', r: 3 }}
            activeDot={{ r: 5, fill: 'hsl(var(--primary))' }}
          />
        </LineChart>
      </ResponsiveContainer>
    </ChartContainer>
  )
}
