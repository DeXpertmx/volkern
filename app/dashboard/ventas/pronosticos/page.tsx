'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  TrendingUp,
  TrendingDown,
  Minus,
  DollarSign,
  Target,
  Clock,
  BarChart3,
  PieChart,
  ArrowRight,
  Calendar,
  RefreshCw,
  Briefcase,
} from 'lucide-react'
import { toast } from 'sonner'
import Link from 'next/link'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  Legend,
  AreaChart,
  Area,
  Cell,
} from 'recharts'

interface ForecastData {
  resumen: {
    totalPipeline: number
    pronosticoBasico: number
    pronosticoAjustado: number
    dealsActivos: number
    tiempoPromedioCiclo: number
    tendencia: 'positiva' | 'negativa' | 'estable'
    metaMesActual: number | null
    ventasMesActual: number
    progresoMeta: number | null
  }
  proyeccionMensual: Array<{
    mes: string
    mesNumero: number
    anio: number
    valorProyectado: number
    valorPonderado: number
    dealsEstimados: number
    meta?: number
  }>
  ventasHistoricas: Array<{
    mes: string
    valor: number
    cantidad: number
  }>
  prediccionTendencia: Array<{
    mes: string
    valorPredicho: number
  }>
  funnelData: Array<{
    etapa: string
    color: string
    cantidad: number
    valor: number
    valorPonderado: number
    probabilidadTeorica: number
    probabilidadReal: number
  }>
  conversionPorEtapa: Record<string, { total: number; ganados: number; tasa: number }>
  topDeals: Array<{
    id: string
    titulo: string
    valor: number
    valorPonderado: number
    etapa: string
    probabilidad: number
    fechaEstimadaCierre: string | null
  }>
}

export default function PronosticosPage() {
  const [data, setData] = useState<ForecastData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchForecast()
  }, [])

  const fetchForecast = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/deals/forecast')
      if (response.ok) {
        const forecastData = await response.json()
        setData(forecastData)
      } else {
        toast.error('Error al cargar pronósticos')
      }
    } catch (error) {
      console.error('Error:', error)
      toast.error('Error al cargar pronósticos')
    } finally {
      setLoading(false)
    }
  }

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value)
  }

  const getTendenciaIcon = (tendencia: string) => {
    switch (tendencia) {
      case 'positiva':
        return <TrendingUp className="h-5 w-5 text-green-500" />
      case 'negativa':
        return <TrendingDown className="h-5 w-5 text-red-500" />
      default:
        return <Minus className="h-5 w-5 text-gray-500" />
    }
  }

  const getTendenciaColor = (tendencia: string) => {
    switch (tendencia) {
      case 'positiva':
        return 'text-green-600'
      case 'negativa':
        return 'text-red-600'
      default:
        return 'text-gray-600'
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Calculando pronósticos...</p>
        </div>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-2">Sin datos</h2>
          <p className="text-muted-foreground mb-4">No hay datos suficientes para generar pronósticos</p>
          <Button onClick={fetchForecast}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Reintentar
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 space-y-6 p-4 md:p-8 pt-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <BarChart3 className="h-8 w-8" />
            Pronósticos de Venta
          </h2>
          <p className="text-muted-foreground mt-1">
            Análisis predictivo basado en datos históricos y pipeline actual
          </p>
        </div>
        <Button variant="outline" onClick={fetchForecast}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Actualizar
        </Button>
      </div>

      {/* Resumen Ejecutivo */}
      <div className="grid gap-4 md:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pipeline Total</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(data.resumen.totalPipeline)}</div>
            <p className="text-xs text-muted-foreground">{data.resumen.dealsActivos} deals activos</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pronóstico Básico</CardTitle>
            <Target className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{formatCurrency(data.resumen.pronosticoBasico)}</div>
            <p className="text-xs text-muted-foreground">Por probabilidad teórica</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pronóstico Ajustado</CardTitle>
            <Target className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{formatCurrency(data.resumen.pronosticoAjustado)}</div>
            <p className="text-xs text-muted-foreground">Por conversión histórica</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ciclo Promedio</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.resumen.tiempoPromedioCiclo} días</div>
            <p className="text-xs text-muted-foreground">Tiempo de cierre</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Tendencia</CardTitle>
            {getTendenciaIcon(data.resumen.tendencia)}
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold capitalize ${getTendenciaColor(data.resumen.tendencia)}`}>
              {data.resumen.tendencia}
            </div>
            <p className="text-xs text-muted-foreground">Basado en últimos 12 meses</p>
          </CardContent>
        </Card>
      </div>

      {/* Progreso de Meta (si existe) */}
      {data.resumen.metaMesActual && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Progreso de Meta del Mes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <div className="flex justify-between mb-2">
                  <span className="text-sm font-medium">Ventas: {formatCurrency(data.resumen.ventasMesActual)}</span>
                  <span className="text-sm text-muted-foreground">Meta: {formatCurrency(data.resumen.metaMesActual)}</span>
                </div>
                <div className="h-3 bg-muted rounded-full overflow-hidden">
                  <div 
                    className={`h-full transition-all ${data.resumen.progresoMeta && data.resumen.progresoMeta >= 100 ? 'bg-green-500' : 'bg-primary'}`}
                    style={{ width: `${Math.min(data.resumen.progresoMeta || 0, 100)}%` }}
                  />
                </div>
              </div>
              <div className="text-2xl font-bold">
                {data.resumen.progresoMeta}%
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Gráficos */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Ventas Históricas vs Proyección */}
        <Card className="col-span-2">
          <CardHeader>
            <CardTitle>Ventas Históricas y Predicción</CardTitle>
            <CardDescription>Evolución de ventas y proyección basada en tendencia</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={[
                    ...data.ventasHistoricas.map(v => ({ ...v, tipo: 'historico' })),
                    ...data.prediccionTendencia.map(p => ({ mes: p.mes.substring(0, 3), valor: p.valorPredicho, tipo: 'prediccion' }))
                  ]}
                  margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="colorHistorico" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8}/>
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorPrediccion" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.8}/>
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="mes" className="text-xs" />
                  <YAxis tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`} className="text-xs" />
                  <Tooltip 
                    formatter={(value) => [formatCurrency(Number(value) || 0), 'Valor']}
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
                  />
                  <Area 
                    type="monotone" 
                    dataKey="valor" 
                    stroke="#3b82f6" 
                    fillOpacity={1} 
                    fill="url(#colorHistorico)" 
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Proyección Mensual */}
        <Card>
          <CardHeader>
            <CardTitle>Proyección Próximos 6 Meses</CardTitle>
            <CardDescription>Deals con fecha de cierre estimada</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.proyeccionMensual}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="mes" tickFormatter={(value) => value.substring(0, 3)} className="text-xs" />
                  <YAxis tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`} className="text-xs" />
                  <Tooltip 
                    formatter={(value, name) => [
                      formatCurrency(Number(value) || 0), 
                      name === 'valorProyectado' ? 'Valor Total' : name === 'valorPonderado' ? 'Ponderado' : 'Meta'
                    ]}
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
                  />
                  <Legend />
                  <Bar dataKey="valorProyectado" name="Valor Total" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="valorPonderado" name="Ponderado" fill="#10b981" radius={[4, 4, 0, 0]} />
                  {data.proyeccionMensual.some(p => p.meta) && (
                    <Bar dataKey="meta" name="Meta" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                  )}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Funnel por Etapa */}
        <Card>
          <CardHeader>
            <CardTitle>Embudo de Ventas</CardTitle>
            <CardDescription>Valor por etapa del pipeline</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.funnelData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis type="number" tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`} className="text-xs" />
                  <YAxis type="category" dataKey="etapa" width={100} className="text-xs" />
                  <Tooltip 
                    formatter={(value) => [formatCurrency(Number(value) || 0), 'Valor']}
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
                  />
                  <Bar dataKey="valor" radius={[0, 4, 4, 0]}>
                    {data.funnelData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Conversión por Etapa y Top Deals */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Tasas de Conversión */}
        <Card>
          <CardHeader>
            <CardTitle>Tasas de Conversión por Etapa</CardTitle>
            <CardDescription>Comparación entre probabilidad teórica e histórica</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {data.funnelData.map((stage) => (
                <div key={stage.etapa} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="h-3 w-3 rounded-full" style={{ backgroundColor: stage.color }} />
                      <span className="font-medium text-sm">{stage.etapa}</span>
                      <Badge variant="secondary" className="text-xs">{stage.cantidad} deals</Badge>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-medium">{stage.probabilidadReal.toFixed(0)}%</span>
                      <span className="text-xs text-muted-foreground ml-1">
                        (teórico: {stage.probabilidadTeorica}%)
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-1 h-2">
                    <div 
                      className="bg-primary/30 rounded-full"
                      style={{ width: `${stage.probabilidadTeorica}%` }}
                    />
                    <div 
                      className="rounded-full"
                      style={{ 
                        width: `${Math.max(0, stage.probabilidadReal - stage.probabilidadTeorica)}%`,
                        backgroundColor: stage.probabilidadReal > stage.probabilidadTeorica ? '#10b981' : '#ef4444'
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Top Deals */}
        <Card>
          <CardHeader>
            <CardTitle>Top 10 Deals por Cerrar</CardTitle>
            <CardDescription>Ordenados por valor ponderado</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {data.topDeals.length === 0 ? (
                <p className="text-center text-muted-foreground py-4">No hay deals activos</p>
              ) : (
                data.topDeals.map((deal, index) => (
                  <Link key={deal.id} href={`/dashboard/pipeline/${deal.id}`}>
                    <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted transition-colors cursor-pointer">
                      <span className="text-lg font-bold text-muted-foreground w-6">{index + 1}</span>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium text-sm truncate">{deal.titulo}</h4>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Badge variant="outline" className="text-xs">{deal.etapa}</Badge>
                          <span>{deal.probabilidad}%</span>
                          {deal.fechaEstimadaCierre && (
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {new Date(deal.fechaEstimadaCierre).toLocaleDateString('es-MX', { month: 'short', day: 'numeric' })}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-sm">{formatCurrency(deal.valor)}</div>
                        <div className="text-xs text-green-600">{formatCurrency(deal.valorPonderado)}</div>
                      </div>
                      <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </Link>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Predicción por Tendencia */}
      <Card>
        <CardHeader>
          <CardTitle>Predicción Basada en Tendencia</CardTitle>
          <CardDescription>
            Estimación para los próximos 3 meses usando regresión lineal sobre datos históricos
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            {data.prediccionTendencia.map((pred, index) => (
              <Card key={index} className="bg-muted/30">
                <CardContent className="pt-6">
                  <div className="text-center">
                    <p className="text-sm text-muted-foreground capitalize">{pred.mes}</p>
                    <p className="text-3xl font-bold text-primary mt-2">
                      {formatCurrency(pred.valorPredicho)}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">Predicción de ventas</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          <p className="text-xs text-muted-foreground text-center mt-4">
            * Las predicciones se basan en el análisis de tendencia de los últimos 12 meses. 
            Los resultados reales pueden variar según las condiciones del mercado.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}