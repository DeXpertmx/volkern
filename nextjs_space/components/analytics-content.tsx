'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import {
  TrendingUp,
  TrendingDown,
  Users,
  Target,
  DollarSign,
  MessageSquare,
  Activity,
  Zap,
  Send,
  BarChart3,
  GraduationCap,
  Calendar,
  RefreshCw
} from 'lucide-react'
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Area,
  AreaChart
} from 'recharts'
import { cn } from '@/lib/utils'
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { SortableWidget } from '@/components/ui/sortable-widget';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899']

interface GeneralMetrics {
  leads: { total: number; nuevosEsteMes: number; cambio: number }
  conversiones: { total: number; esteMes: number; cambio: number }
  ingresos: { total: number; esteMes: number; cambio: number }
  engagement: { mensajes: number; conversaciones: number; cambio: number }
}

export function AnalyticsContent() {
  const [dateRange, setDateRange] = useState(30)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [generalMetrics, setGeneralMetrics] = useState<GeneralMetrics | null>(null)
  const [conversionMetrics, setConversionMetrics] = useState<any>(null)
  const [automationMetrics, setAutomationMetrics] = useState<any>(null)
  const [campaignMetrics, setCampaignMetrics] = useState<any>(null)
  const [channelMetrics, setChannelMetrics] = useState<any>(null)
  const [cohortMetrics, setCohortMetrics] = useState<any>(null)
  const [courseMetrics, setCourseMetrics] = useState<any>(null)

  const [widgetOrder, setWidgetOrder] = useState<string[]>(['kpis', 'tabs'])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setWidgetOrder((items) => {
        const oldIndex = items.indexOf(active.id as string);
        const newIndex = items.indexOf(over.id as string);
        const newOrder = arrayMove(items, oldIndex, newIndex);
        if (typeof window !== 'undefined') {
          localStorage.setItem('volkern_analytics_order', JSON.stringify(newOrder));
        }
        return newOrder;
      });
    }
  };

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedOrder = localStorage.getItem('volkern_analytics_order');
      if (savedOrder) {
        try {
          const parsed = JSON.parse(savedOrder);
          if (Array.isArray(parsed)) setWidgetOrder(parsed);
        } catch (e) { }
      }
    }
    loadAllMetrics()
  }, [dateRange])

  const loadAllMetrics = async () => {
    setLoading(true)
    try {
      await Promise.all([
        loadGeneralMetrics(),
        loadConversionMetrics(),
        loadAutomationMetrics(),
        loadCampaignMetrics(),
        loadChannelMetrics(),
        loadCohortMetrics(),
        loadCourseMetrics()
      ])
    } catch (error) {
      console.error('Error al cargar métricas:', error)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  const loadGeneralMetrics = async () => {
    const res = await fetch('/api/analytics/dashboard')
    if (res.ok) setGeneralMetrics(await res.json())
  }
  const loadConversionMetrics = async () => {
    const res = await fetch(`/api/analytics/conversion?days=${dateRange}`)
    if (res.ok) setConversionMetrics(await res.json())
  }
  const loadAutomationMetrics = async () => {
    const res = await fetch(`/api/analytics/automations?days=${dateRange}`)
    if (res.ok) setAutomationMetrics(await res.json())
  }
  const loadCampaignMetrics = async () => {
    const res = await fetch(`/api/analytics/campaigns?days=${dateRange}`)
    if (res.ok) setCampaignMetrics(await res.json())
  }
  const loadChannelMetrics = async () => {
    const res = await fetch(`/api/analytics/channels?days=${dateRange}`)
    if (res.ok) setChannelMetrics(await res.json())
  }
  const loadCohortMetrics = async () => {
    const res = await fetch('/api/analytics/cohorts')
    if (res.ok) setCohortMetrics(await res.json())
  }
  const loadCourseMetrics = async () => {
    const res = await fetch(`/api/analytics/courses?days=${dateRange}`)
    if (res.ok) setCourseMetrics(await res.json())
  }

  const handleRefresh = () => {
    setRefreshing(true)
    loadAllMetrics()
  }

  const renderWidget = (id: string) => {
    switch (id) {
      case 'kpis':
        return generalMetrics && (
          <div key="kpis" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Leads Totales
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{generalMetrics.leads.total.toLocaleString()}</div>
                <div className="flex items-center gap-1 text-xs mt-1">
                  <span className="text-muted-foreground">{generalMetrics.leads.nuevosEsteMes} este mes</span>
                  {generalMetrics.leads.cambio !== 0 && (
                    <span className={cn("flex items-center", generalMetrics.leads.cambio > 0 ? "text-green-600" : "text-red-600")}>
                      {generalMetrics.leads.cambio > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                      {Math.abs(generalMetrics.leads.cambio).toFixed(1)}%
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Target className="h-4 w-4" />
                  Conversiones
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{generalMetrics.conversiones.total.toLocaleString()}</div>
                <div className="flex items-center gap-1 text-xs mt-1">
                  <span className="text-muted-foreground">{generalMetrics.conversiones.esteMes} este mes</span>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <DollarSign className="h-4 w-4" />
                  Ingresos
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">${generalMetrics.ingresos.total.toLocaleString()}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <MessageSquare className="h-4 w-4" />
                  Engagement
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{generalMetrics.engagement.mensajes.toLocaleString()}</div>
              </CardContent>
            </Card>
          </div>
        )
      case 'tabs':
        return (
          <Tabs key="tabs" defaultValue="conversion" className="space-y-4">
            <TabsList className="grid w-full grid-cols-3 lg:grid-cols-6">
              <TabsTrigger value="conversion">Conversión</TabsTrigger>
              <TabsTrigger value="automations">Automatizaciones</TabsTrigger>
              <TabsTrigger value="campaigns">Campañas</TabsTrigger>
              <TabsTrigger value="channels">Canales</TabsTrigger>
              <TabsTrigger value="cohorts">Cohortes</TabsTrigger>
              <TabsTrigger value="courses">Cursos</TabsTrigger>
            </TabsList>
            <TabsContent value="conversion" className="space-y-4">
              {conversionMetrics && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <Card>
                    <CardHeader><CardTitle>Leads por Día</CardTitle></CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={300}>
                        <AreaChart data={conversionMetrics.leadsPorDia}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="fecha" />
                          <YAxis />
                          <Tooltip />
                          <Area type="monotone" dataKey="count" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.3} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader><CardTitle>Distribución por Estado</CardTitle></CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={300}>
                        <PieChart>
                          <Pie data={conversionMetrics.leadsPorEstado} dataKey="count" nameKey="estado" cx="50%" cy="50%" outerRadius={80} label>
                            {conversionMetrics.leadsPorEstado.map((_: any, i: number) => <Cell key={`cell-${i}`} fill={COLORS[i % COLORS.length]} />)}
                          </Pie>
                          <Tooltip />
                          <Legend />
                        </PieChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                </div>
              )}
            </TabsContent>
            <TabsContent value="automations">
              {automationMetrics && (
                <Card>
                  <CardHeader><CardTitle>Ejecuciones por Día</CardTitle></CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={automationMetrics.ejecutadosPorDia}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="fecha" />
                        <YAxis />
                        <Tooltip />
                        <Bar dataKey="count" fill="#3b82f6" name="Total" />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}
            </TabsContent>
          </Tabs>
        )
      default: return null
    }
  }

  if (loading && !generalMetrics) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <RefreshCw className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold uppercase tracking-tight">Analíticas Avanzadas</h1>
          <p className="text-muted-foreground mt-1">Configura y visualiza tus métricas clave</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleRefresh}>
            <RefreshCw className={cn("h-4 w-4 mr-2", refreshing && "animate-spin")} />
            Actualizar
          </Button>
          <select value={dateRange} onChange={(e) => setDateRange(parseInt(e.target.value))} className="border rounded-md px-3 py-2 text-sm bg-background">
            <option value={7}>7 días</option>
            <option value={30}>30 días</option>
            <option value={90}>90 días</option>
          </select>
        </div>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={widgetOrder} strategy={verticalListSortingStrategy}>
          {widgetOrder.map((id) => (
            <SortableWidget key={id} id={id}>
              {renderWidget(id)}
            </SortableWidget>
          ))}
        </SortableContext>
      </DndContext>
    </div>
  )
}
