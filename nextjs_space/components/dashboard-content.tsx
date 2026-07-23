'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Users, Calendar, TrendingUp, Send, Lock, Unlock, GripVertical, Rocket, ShieldCheck, X, Plus } from 'lucide-react'
import { ResponsiveGridLayout as RGL, useContainerWidth } from 'react-grid-layout';
import type { ResponsiveLayouts } from 'react-grid-layout';

const ResponsiveGridLayout = RGL as any;
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { DashboardStats } from '@/components/dashboard-stats'
import { DayNavigationAppointments } from '@/components/day-navigation-appointments'
import { UsageLimits } from '@/components/usage-limits'
import { IntegrityGraph } from '@/components/sovereignty/integrity-graph'
import { InventoryWatchdog } from '@/components/operations/inventory-watchdog'
import { OperationalMap } from '@/components/operations/operational-map'
import { TrustProtocolLogs } from '@/components/sovereignty/trust-protocol-logs'
import { QuickActions } from '@/components/dashboard/quick-actions'
import { DashboardSkeleton } from '@/components/dashboard-skeleton'

const LS_KEY = 'volkern_dashboard_data'

function lsSave(data: object) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(data)) } catch {}
}
function lsLoad(): Record<string, any> | null {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || 'null') } catch { return null }
}

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

const ALL_WIDGET_IDS = [
  'actions', 'stat-leads', 'stat-citas', 'stat-campanas', 'stat-ingresos',
  'limits', 'integrity', 'charts', 'appointments', 'inventory', 'map', 'audit'
]

const WIDGET_LABELS: Record<string, string> = {
  actions: 'Acciones Rápidas',
  'stat-leads': 'Total Leads',
  'stat-citas': 'Citas Hoy',
  'stat-campanas': 'Campañas Activas',
  'stat-ingresos': 'Ingresos del Mes',
  limits: 'Límites de Uso',
  integrity: 'Gráfica de Integridad',
  charts: 'Ingresos Diarios',
  appointments: 'Próximas Citas',
  inventory: 'Inventario',
  map: 'Mapa Operativo',
  audit: 'Logs de Protocolo',
}

const defaultLayouts: ResponsiveLayouts = {
  lg: [
    { i: 'actions', x: 0, y: 0, w: 12, h: 2, static: false },
    { i: 'stat-leads', x: 0, y: 2, w: 3, h: 2 },
    { i: 'stat-citas', x: 3, y: 2, w: 3, h: 2 },
    { i: 'stat-campanas', x: 6, y: 2, w: 3, h: 2 },
    { i: 'stat-ingresos', x: 9, y: 2, w: 3, h: 2 },
    { i: 'limits', x: 0, y: 4, w: 12, h: 2.5 },
    { i: 'integrity', x: 0, y: 6.5, w: 6, h: 8, minW: 3, minH: 6 },
    { i: 'charts', x: 6, y: 6.5, w: 6, h: 4 },
    { i: 'appointments', x: 6, y: 10.5, w: 6, h: 4 },
    { i: 'inventory', x: 0, y: 14.5, w: 6, h: 4 },
    { i: 'map', x: 6, y: 14.5, w: 6, h: 4 },
    { i: 'audit', x: 0, y: 18.5, w: 12, h: 4 },
  ]
};

export function DashboardContent() {
  const [stats, setStats] = useState<DashboardStatsData>({
    totalLeads: 0,
    citasHoy: 0,
    citasPendientes: 0,
    ingresosMes: 0,
    ingresosDiarios: [],
    proximasCitas: []
  })
  const [isLocked, setIsLocked] = useState(() => {
    const saved = lsLoad()
    return typeof saved?.isLocked === 'boolean' ? saved.isLocked : true
  })
  const [layouts, setLayouts] = useState<ResponsiveLayouts>(() => {
    const saved = lsLoad()
    return saved?.layout || defaultLayouts
  })
  const [visibleWidgets, setVisibleWidgets] = useState<string[]>(() => {
    const saved = lsLoad()
    if (Array.isArray(saved?.visibleWidgets) && saved.visibleWidgets.length > 0) return saved.visibleWidgets
    return ALL_WIDGET_IDS
  })
  const [mounted, setMounted] = useState(false)
  const [statsLoaded, setStatsLoaded] = useState(false)

  const layoutsRef = useRef(layouts)
  useEffect(() => { layoutsRef.current = layouts }, [layouts])

  const visibleRef = useRef(visibleWidgets)
  useEffect(() => { visibleRef.current = visibleWidgets }, [visibleWidgets])

  const isLockedRef = useRef(isLocked)
  useEffect(() => { isLockedRef.current = isLocked }, [isLocked])

  const skipNextLayoutSave = useRef(true)

  const { width, containerRef } = useContainerWidth() as { width: number | undefined; containerRef: React.RefObject<HTMLDivElement | null> };

  useEffect(() => {
    Promise.all([
      fetch('/api/dashboard'),
      fetch('/api/v1/user/layout')
    ]).then(async ([statsRes, layoutRes]) => {
      if (statsRes.ok) {
        const data = await statsRes.json();
        setStats(data);
      }
      if (layoutRes.ok) {
        const { layout, isLocked: savedLocked, visibleWidgets: savedVisible } = await layoutRes.json();
        if (layout) { setLayouts(layout); lsSave({ layout, isLocked: savedLocked, visibleWidgets: savedVisible }) }
        if (typeof savedLocked === 'boolean') { setIsLocked(savedLocked); isLockedRef.current = savedLocked }
        if (Array.isArray(savedVisible) && savedVisible.length > 0) setVisibleWidgets(savedVisible);
      }
    }).catch(error => {
      console.error('Error fetching dashboard data:', error);
    }).finally(() => {
      setStatsLoaded(true)
      skipNextLayoutSave.current = false
    })

    setMounted(true)
  }, [])

  const persist = useCallback((data: { layout?: any; isLocked?: boolean; visibleWidgets?: string[] }) => {
    lsSave(data)
    fetch('/api/v1/user/layout', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    }).catch(e => console.error('Error al persistir layout:', e))
  }, [])

  const onLayoutChange = useCallback((_currentLayout: any, allLayouts: ResponsiveLayouts) => {
    if (skipNextLayoutSave.current) return
    if (!isLockedRef.current) {
      setLayouts(allLayouts);
      persist({ layout: allLayouts, isLocked: isLockedRef.current, visibleWidgets: visibleRef.current });
    }
  }, [persist]);

  const toggleLock = useCallback(() => {
    const next = !isLockedRef.current;
    setIsLocked(next);
    persist({ layout: layoutsRef.current, isLocked: next, visibleWidgets: visibleRef.current });
  }, [persist])

  const hideWidget = useCallback((id: string) => {
    const next = visibleRef.current.filter(w => w !== id);
    setVisibleWidgets(next);
    persist({ layout: layoutsRef.current, isLocked: isLockedRef.current, visibleWidgets: next });
  }, [persist])

  const showWidget = useCallback((id: string) => {
    const next = [...visibleRef.current, id];
    setVisibleWidgets(next);
    persist({ layout: layoutsRef.current, isLocked: isLockedRef.current, visibleWidgets: next });
  }, [persist])

  const WidgetWrapper = ({ id, children, noPadding = false }: { id: string, children: React.ReactNode, noPadding?: boolean }) => (
    <div key={id} className={`group relative h-full w-full ${noPadding ? '' : 'overflow-hidden'}`}>
      {!isLocked && (
        <>
          <div className="drag-handle absolute top-2 left-2 z-[60] opacity-0 group-hover:opacity-100 bg-background/90 shadow-lg border-2 border-primary/20 rounded-md p-1.5 transition-all cursor-grab active:cursor-grabbing hover:scale-110 active:scale-95">
            <GripVertical className="h-4 w-4 text-primary" />
          </div>
          <button
            onClick={() => hideWidget(id)}
            className="absolute top-2 right-2 z-[60] opacity-0 group-hover:opacity-100 bg-destructive/90 text-destructive-foreground rounded-md p-1 transition-all hover:scale-110 active:scale-95"
            title="Ocultar widget"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </>
      )}
      {children}
    </div>
  );

  const StatCard = ({ title, value, description, icon: Icon, colorClass, borderClass }: any) => (
    <Card className={`h-full border-2 transition-all hover:shadow-lg ${borderClass || 'border-primary/5'} bg-background/50 backdrop-blur-sm`}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{title}</CardTitle>
        <div className={`p-2 rounded-lg ${colorClass || 'bg-primary/10'} shadow-inner`}>
          <Icon className="h-4 w-4 text-primary-foreground mix-blend-difference" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-black">{statsLoaded ? value : '...'}</div>
        <p className="text-[10px] text-muted-foreground font-medium mt-1">{description}</p>
      </CardContent>
    </Card>
  );

  const hiddenWidgets = useMemo(
    () => ALL_WIDGET_IDS.filter(id => !visibleWidgets.includes(id)),
    [visibleWidgets]
  );

  if (!mounted) return <DashboardSkeleton />;

  return (
    <div className="space-y-6" ref={containerRef as React.Ref<HTMLDivElement>}>
      <div className="flex justify-between items-center mb-6">
        <div className="space-y-1">
          <h1 className="text-4xl font-black tracking-tight bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
            Dashboard
          </h1>
          <p className="text-sm text-muted-foreground font-medium flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-emerald-500" />
            Resumen de tu CRM y métricas de soberanía operativa
          </p>
        </div>
        <div className="flex items-center gap-3">
          {!isLocked && (
            <div className="flex items-center gap-2 text-[10px] font-bold text-emerald-500 animate-pulse bg-emerald-500/10 px-3 py-1.5 rounded-full border border-emerald-500/20">
              <Rocket className="h-3 w-3" /> MODO EDICIÓN ACTIVO
            </div>
          )}
          {!isLocked && hiddenWidgets.length > 0 && (
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="secondary" size="sm" className="gap-1.5 shadow-xl hover:scale-105 transition-transform text-xs">
                  <Plus className="h-3.5 w-3.5" />
                  Añadir Widget
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-56 p-2">
                <p className="text-xs font-semibold text-muted-foreground px-2 pb-2">Widgets ocultos</p>
                {hiddenWidgets.map(id => (
                  <button
                    key={id}
                    onClick={() => showWidget(id)}
                    className="w-full text-left px-2 py-1.5 text-sm rounded hover:bg-accent transition-colors"
                  >
                    {WIDGET_LABELS[id] || id}
                  </button>
                ))}
              </PopoverContent>
            </Popover>
          )}
          <Button 
            variant={isLocked ? "outline" : "default"}
            onClick={toggleLock}
            className="gap-2 shadow-xl hover:scale-105 transition-transform"
          >
            {isLocked ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
            {isLocked ? "Ajustar Bento Box" : "Bloquear Layout"}
          </Button>
        </div>
      </div>

      <div className={isLocked ? 'touch-none select-none' : ''}>
        <ResponsiveGridLayout
          className="layout"
          layouts={layouts}
          breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
          cols={{ lg: 12, md: 10, sm: 6, xs: 4, xxs: 2 }}
          rowHeight={100}
          width={width || 1280}
          draggableHandle={isLocked ? undefined : ".drag-handle"}
          isDraggable={!isLocked}
          isResizable={!isLocked}
          onLayoutChange={onLayoutChange}
          margin={[20, 20]}
          compactType="vertical"
        >
          {visibleWidgets.includes('actions') && (
            <div key="actions">
              <WidgetWrapper id="actions"><QuickActions /></WidgetWrapper>
            </div>
          )}

          {visibleWidgets.includes('stat-leads') && (
            <div key="stat-leads">
              <WidgetWrapper id="stat-leads">
                <StatCard title="Total Leads" value={stats.totalLeads} description="Leads capturados" icon={Users} colorClass="bg-blue-500/20" borderClass="hover:border-blue-500/30" />
              </WidgetWrapper>
            </div>
          )}

          {visibleWidgets.includes('stat-citas') && (
            <div key="stat-citas">
              <WidgetWrapper id="stat-citas">
                <StatCard title="Citas Hoy" value={stats.citasHoy} description="Citas programadas hoy" icon={Calendar} colorClass="bg-purple-500/20" borderClass="hover:border-purple-500/30" />
              </WidgetWrapper>
            </div>
          )}

          {visibleWidgets.includes('stat-campanas') && (
            <div key="stat-campanas">
              <WidgetWrapper id="stat-campanas">
                <StatCard title="Campañas Activas" value={stats.campanasActivas || 0} description="Campañas en ejecución" icon={Send} colorClass="bg-emerald-500/20" borderClass="hover:border-emerald-500/30" />
              </WidgetWrapper>
            </div>
          )}

          {visibleWidgets.includes('stat-ingresos') && (
            <div key="stat-ingresos">
              <WidgetWrapper id="stat-ingresos">
                <StatCard title="Ingresos del Mes" value={`$${stats.ingresosMes?.toFixed(2) || '0.00'}`} description="Revenue generado" icon={TrendingUp} colorClass="bg-orange-500/20" borderClass="hover:border-orange-500/30" />
              </WidgetWrapper>
            </div>
          )}

          {visibleWidgets.includes('limits') && (
            <div key="limits">
              <WidgetWrapper id="limits"><UsageLimits /></WidgetWrapper>
            </div>
          )}

          {visibleWidgets.includes('integrity') && (
            <div key="integrity">
              <WidgetWrapper id="integrity"><IntegrityGraph /></WidgetWrapper>
            </div>
          )}

          {visibleWidgets.includes('charts') && (
            <div key="charts">
              <WidgetWrapper id="charts">
                <Card className="h-full border-2 border-primary/5 bg-background/50 backdrop-blur-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-bold flex items-center gap-2">
                      <TrendingUp className="h-4 w-4 text-emerald-500" />
                      Ingresos Diarios (30d)
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="h-full pb-10">
                    <DashboardStats data={stats.ingresosDiarios || []} />
                  </CardContent>
                </Card>
              </WidgetWrapper>
            </div>
          )}

          {visibleWidgets.includes('appointments') && (
            <div key="appointments">
              <WidgetWrapper id="appointments">
                <Card className="h-full overflow-hidden border-2 border-primary/5 bg-background/50 backdrop-blur-sm">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-bold flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-purple-500" />
                      Próximas Citas
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="scrollbar-thin">
                    <DayNavigationAppointments />
                  </CardContent>
                </Card>
              </WidgetWrapper>
            </div>
          )}

          {visibleWidgets.includes('inventory') && (
            <div key="inventory">
              <WidgetWrapper id="inventory"><InventoryWatchdog /></WidgetWrapper>
            </div>
          )}

          {visibleWidgets.includes('map') && (
            <div key="map">
              <WidgetWrapper id="map"><OperationalMap /></WidgetWrapper>
            </div>
          )}

          {visibleWidgets.includes('audit') && (
            <div key="audit">
              <WidgetWrapper id="audit"><TrustProtocolLogs /></WidgetWrapper>
            </div>
          )}
        </ResponsiveGridLayout>
      </div>
    </div>
  )
}
