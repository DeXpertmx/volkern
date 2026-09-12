'use client'

import { useState } from 'react'
import { 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  Receipt, 
  Building2, 
  Plus, 
  ArrowUpRight, 
  ArrowDownRight,
  Filter,
  BarChart3,
  Calendar,
  AlertTriangle,
  FileText
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import useSWR from 'swr'
import { formatearImporte } from '@/lib/moneda'
import { useMonedaTenant } from '@/lib/use-moneda-tenant'

const fetcher = (url: string) => fetch(url).then(res => res.json())

export default function FinanzasDashboard() {
  const { data: expenses, isLoading: loadingExpenses } = useSWR('/api/erp/expenses?limit=5', fetcher)
  const [period, setPeriod] = useState('Este mes')
  // La divisa de reporte del tenant: el cockpit mostraba euros escritos a mano,
  // así que un tenant con la moneda en pesos veía sus cifras en euros.
  const moneda = useMonedaTenant()

  // Mock de datos financieros para la demo del Cockpit
  // En producción esto vendría de un endpoint de agregación /api/erp/finance/summary
  const stats = [
    { 
      label: 'Ingresos Totales', 
      value: formatearImporte(42500, moneda), 
      change: '+12.5%', 
      trend: 'up', 
      icon: TrendingUp,
      color: 'text-emerald-500',
      bg: 'bg-emerald-500/10' 
    },
    { 
      label: 'Gastos Operativos', 
      value: formatearImporte(18200, moneda), 
      change: '+4.2%', 
      trend: 'down', 
      icon: TrendingDown,
      color: 'text-rose-500',
      bg: 'bg-rose-500/10' 
    },
    { 
      label: 'Margen Neto', 
      value: formatearImporte(24300, moneda), 
      change: '+8.1%', 
      trend: 'up', 
      icon: DollarSign,
      color: 'text-blue-500',
      bg: 'bg-blue-500/10' 
    },
    { 
      label: 'Burn Rate', 
      value: '42.8%', 
      change: '-2.1%', 
      trend: 'up', 
      icon: BarChart3,
      color: 'text-amber-500',
      bg: 'bg-amber-500/10' 
    },
  ]

  return (
    <div className="space-y-8 pb-10">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-black tracking-tight uppercase">Financial Cockpit</h1>
          <p className="text-muted-foreground font-medium">Análisis de rentabilidad y control de egresos 360°.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="rounded-xl font-bold uppercase text-xs tracking-wider">
            <Filter className="w-4 h-4 mr-2" /> Filtros
          </Button>
          <Button className="rounded-xl font-bold uppercase text-xs tracking-wider shadow-lg shadow-primary/20" onClick={() => (window as any).location.href = '/dashboard/finanzas/gastos'}>
            <Plus className="w-4 h-4 mr-2" /> Nuevo Gasto
          </Button>
          <Button 
            variant="outline" 
            className="rounded-xl font-bold uppercase text-xs tracking-wider border-primary text-primary hover:bg-primary/5"
            onClick={() => (window as any).location.href = '/dashboard/finanzas/facturacion'}
          >
            <Receipt className="w-4 h-4 mr-2" /> Mesa de Facturación
          </Button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, i) => (
          <Card key={i} className="border-none shadow-sm bg-white dark:bg-slate-950 overflow-hidden relative group hover:shadow-md transition-all duration-300">
             <div className={`absolute top-0 left-0 w-1 h-full ${stat.trend === 'up' ? 'bg-emerald-500' : 'bg-rose-500'}`} />
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className={`p-2.5 rounded-xl ${stat.bg} ${stat.color}`}>
                  <stat.icon className="w-5 h-5" />
                </div>
                <Badge variant="outline" className={`rounded-full border-none px-2 py-0.5 text-[10px] font-bold ${stat.trend === 'up' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                  {stat.trend === 'up' ? <ArrowUpRight className="w-3 h-3 mr-1" /> : <ArrowDownRight className="w-3 h-3 mr-1" />}
                  {stat.change}
                </Badge>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{stat.label}</p>
                <p className="text-2xl font-black tracking-tighter">{stat.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-7 gap-6">
        {/* Main Chart Area (Mockup for now) */}
        <Card className="lg:col-span-4 border-none shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-7">
            <div>
              <CardTitle className="text-lg font-bold">Flujo de Caja vs Gastos</CardTitle>
              <CardDescription>Comparativa mensual de ingresos y egresos operativos.</CardDescription>
            </div>
            <select className="bg-slate-100 dark:bg-slate-800 border-none rounded-lg text-xs font-bold p-2 focus:ring-1 ring-primary/20 outline-none">
              <option>Últimos 6 meses</option>
              <option>Último año</option>
            </select>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] w-full bg-slate-50 dark:bg-slate-900/50 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 flex items-center justify-center">
              <div className="text-center space-y-2">
                <BarChart3 className="w-8 h-8 text-slate-300 mx-auto" />
                <p className="text-sm text-slate-400 font-medium tracking-tight">Gráfico interactivo de rentabilidad activa</p>
                <div className="flex gap-4 mt-4">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-primary" />
                    <span className="text-[10px] uppercase font-bold text-muted-foreground">Ingresos</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-rose-500" />
                    <span className="text-[10px] uppercase font-bold text-muted-foreground">Gastos</span>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Burn Rate Analysis */}
        <Card className="lg:col-span-3 border-none shadow-sm overflow-hidden bg-gradient-to-br from-white to-slate-50 dark:from-slate-950 dark:to-slate-900">
          <CardHeader>
            <div className="flex items-center gap-2 mb-1">
              <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <CardTitle className="text-lg font-bold">Análisis de Salud</CardTitle>
            </div>
            <CardDescription>Criterio de IA Gemma 4 sobre el Burn Rate actual.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider">
                <span>Capacidad Operativa</span>
                <span className="text-emerald-500">Saludable</span>
              </div>
              <Progress value={68} className="h-2" />
              <p className="text-xs text-muted-foreground leading-relaxed">
                Tus ingresos cubren el 240% de tus gastos fijos. Tienes un "runway" proyectado de <span className="font-bold text-foreground">14 meses</span> manteniendo el ritmo actual.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-900/20">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/30 text-amber-600">
                  <AlertTriangle className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-xs font-bold text-amber-800 dark:text-amber-400 mb-1">ALERTA DE PROACTIVIDAD</p>
                  <p className="text-[11px] text-amber-700/80 dark:text-amber-500/80 leading-snug">
                    Se detectó un aumento del 15% en 'Suscripciones Software'. Revisa licencias inactivas para optimizar {formatearImporte(400, moneda)}/mes.
                  </p>
                </div>
              </div>
            </div>

            <Button variant="outline" className="w-full rounded-xl text-xs font-bold uppercase tracking-widest py-6 group">
              <FileText className="w-4 h-4 mr-2 group-hover:rotate-12 transition-transform" /> Descargar Reporte P&L
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity & Quick Capture */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Expenses */}
        <Card className="border-none shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
             <div>
              <CardTitle className="text-lg font-bold">Egresos Recientes</CardTitle>
              <CardDescription>Últimos movimientos registrados en el sistema.</CardDescription>
            </div>
            <Button variant="ghost" size="sm" className="text-xs text-primary font-bold">Ver todos</Button>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {loadingExpenses ? (
                 <div className="text-center py-10 text-muted-foreground">Cargando gastos...</div>
              ) : (expenses && expenses.length > 0) ? (
                expenses.map((exp: any) => (
                  <div key={exp.id} className="flex items-center justify-between p-3 rounded-xl hover:bg-slate-50 transition-colors group">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 bg-slate-100 rounded-xl flex items-center justify-center text-slate-500 group-hover:bg-white transition-colors">
                        <Receipt className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="text-sm font-bold tracking-tight">{exp.description}</p>
                        <p className="text-[10px] text-muted-foreground uppercase font-medium">{exp.supplier?.name || 'Proveedor Desconocido'} • {exp.category}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-black tracking-tight">-{formatearImporte(exp.amount, exp.currency || moneda)}</p>
                      <p className="text-[10px] text-muted-foreground">{new Date(exp.date).toLocaleDateString()}</p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-10 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                  <Receipt className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <p className="text-sm text-slate-500 font-medium">Aún no hay gastos registrados.</p>
                  <p className="text-[10px] text-slate-400">Tus tickets aparecerán aquí.</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Quick Receipt Capture (Vision AI) */}
        <Card className="border-none shadow-sm bg-primary/5 border border-primary/10 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-8 text-primary/5">
             <Receipt className="w-32 h-32 rotate-12" />
          </div>
          <CardHeader>
            <CardTitle className="text-lg font-bold flex items-center gap-2">
              <Plus className="w-5 h-5 bg-primary text-white rounded-md p-0.5" />
              Captura Rápida AI
            </CardTitle>
            <CardDescription>Sube un ticket o factura y Gemma 4 extraerá los datos automáticamente.</CardDescription>
          </CardHeader>
          <CardContent>
             <div className="h-48 rounded-2xl border-2 border-dashed border-primary/20 bg-background/50 flex flex-col items-center justify-center space-y-4 group cursor-pointer hover:border-primary/40 transition-all">
                <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
                   <Plus className="w-6 h-6" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-bold tracking-tight">Suelta aquí tu factura o haz click</p>
                  <p className="text-[10px] text-muted-foreground uppercase font-medium">Soporte JPG, PNG, PDF (Máx 5MB)</p>
                </div>
             </div>
             <p className="mt-4 text-[10px] text-center text-muted-foreground italic">
               "Utilizando Gemma 4 Vision para procesamiento contable automatizado en tiempo real."
             </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
