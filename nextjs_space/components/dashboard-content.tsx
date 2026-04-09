
'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Users, Calendar, TrendingUp, Clock, ArrowUpRight, Send } from 'lucide-react'
import Link from 'next/link'
import { DashboardStats } from '@/components/dashboard-stats'
import { RecentAppointments } from '@/components/recent-appointments'
import { OnboardingChecklist } from '@/components/onboarding-checklist'
import { UsageLimits } from '@/components/usage-limits'
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { SortableWidget } from '@/components/ui/sortable-widget';

interface DashboardStatsData {
  totalLeads: number
  citasHoy: number
  citasPendientes: number
  ingresosMes: number
  ingresosDiarios: { fecha: string; ingresos: number }[]
  proximasCitas: any[]
  totalCampanas?: number
  campanasActivas?: number
  campanasCompletadas?: number
}

export function DashboardContent() {
  const [stats, setStats] = useState<DashboardStatsData>({
    totalLeads: 0,
    citasHoy: 0,
    citasPendientes: 0,
    ingresosMes: 0,
    ingresosDiarios: [],
    proximasCitas: []
  })
  const [isLoading, setIsLoading] = useState(true)

  // Layout order for the widgets based on their string IDs
  const [widgetOrder, setWidgetOrder] = useState<string[]>([
    'onboarding',
    'stats',
    'limits',
    'charts',
    'actions'
  ])

  // Drag sensors configured
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

        // Persistir en local storage (offline mode)
        if (typeof window !== 'undefined') {
          localStorage.setItem('volkern_dashboard_order', JSON.stringify(newOrder));
        }

        return newOrder;
      });
    }
  };

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedOrder = localStorage.getItem('volkern_dashboard_order');
      if (savedOrder) {
        try {
          const parsed = JSON.parse(savedOrder);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setWidgetOrder(parsed);
          }
        } catch (e) {
          console.error("Error parsing dashboard order from local storage");
        }
      }
    }
  }, []);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const response = await fetch('/api/dashboard')
        if (response.ok) {
          const data = await response.json()
          setStats(data)
        }
      } catch (error) {
        console.error('Error fetching dashboard stats:', error)
      } finally {
        setIsLoading(false)
      }
    }

    fetchStats()
  }, [])

  const StatCard = ({ title, value, description, icon: Icon, href }: {
    title: string
    value: string | number
    description: string
    icon: any
    href?: string
  }) => {
    const content = (
      <Card className="hover:shadow-md transition-shadow cursor-pointer">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">{title}</CardTitle>
          <Icon className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{isLoading ? '...' : value}</div>
          <p className="text-xs text-muted-foreground">{description}</p>
        </CardContent>
      </Card>
    )

    return href ? (
      <Link href={href}>
        {content}
      </Link>
    ) : content
  }

  const renderWidget = (id: string) => {
    switch (id) {
      case 'onboarding':
        return <OnboardingChecklist key="onboarding" />
      case 'stats':
        return (
          <div key="stats" className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <StatCard
              title="Total Leads"
              value={stats.totalLeads}
              description="Leads capturados"
              icon={Users}
              href="/dashboard/leads"
            />
            <StatCard
              title="Citas Hoy"
              value={stats.citasHoy}
              description="Citas programadas hoy"
              icon={Calendar}
              href="/dashboard/citas"
            />
            <StatCard
              title="Campañas Activas"
              value={stats.campanasActivas || 0}
              description="Campañas en ejecución"
              icon={Send}
              href="/dashboard/campanas"
            />
            <StatCard
              title="Ingresos del Mes"
              value={`$${stats.ingresosMes?.toFixed(2) || '0.00'}`}
              description="Revenue generado"
              icon={TrendingUp}
            />
          </div>
        )
      case 'limits':
        return <UsageLimits key="limits" />
      case 'charts':
        return (
          <div key="charts" className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <TrendingUp className="h-5 w-5 mr-2" />
                  Ingresos Diarios
                </CardTitle>
                <CardDescription>
                  Últimos 30 días
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="h-[300px] flex items-center justify-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                  </div>
                ) : (
                  <DashboardStats data={stats.ingresosDiarios || []} />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <div className="flex items-center">
                    <Calendar className="h-5 w-5 mr-2" />
                    Próximas Citas
                  </div>
                  <Link href="/dashboard/citas">
                    <Button variant="ghost" size="sm">
                      Ver todas
                      <ArrowUpRight className="h-4 w-4 ml-1" />
                    </Button>
                  </Link>
                </CardTitle>
                <CardDescription>
                  Próximas citas programadas
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                  </div>
                ) : (
                  <RecentAppointments appointments={stats.proximasCitas || []} />
                )}
              </CardContent>
            </Card>
          </div>
        )
      case 'actions':
        return (
          <Card key="actions">
            <CardHeader>
              <CardTitle>Acciones Rápidas</CardTitle>
              <CardDescription>
                Tareas comunes para gestionar tu CRM
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-4">
                <Link href="/dashboard/leads">
                  <Button variant="outline" className="w-full justify-start">
                    <Users className="h-4 w-4 mr-2" />
                    Gestionar Leads
                  </Button>
                </Link>
                <Link href="/dashboard/citas">
                  <Button variant="outline" className="w-full justify-start">
                    <Calendar className="h-4 w-4 mr-2" />
                    Ver Calendario
                  </Button>
                </Link>
                <Link href="/dashboard/campanas/nueva">
                  <Button variant="outline" className="w-full justify-start">
                    <Send className="h-4 w-4 mr-2" />
                    Nueva Campaña
                  </Button>
                </Link>
                <Link href="/dashboard/servicios">
                  <Button variant="outline" className="w-full justify-start">
                    <TrendingUp className="h-4 w-4 mr-2" />
                    Gestionar Servicios
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        )
      default:
        return null;
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">
            Resumen de tu CRM y métricas clave
          </p>
        </div>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={widgetOrder}
          strategy={verticalListSortingStrategy}
        >
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
