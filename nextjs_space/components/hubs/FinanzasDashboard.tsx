'use client'

import { useMemo, useState } from 'react'
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Receipt,
  Plus,
  Filter,
  BarChart3,
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
import { resumirConsolidacion } from '@/lib/finance/resumen-financiero'

const fetcher = (url: string) => fetch(url).then(res => res.json())

/**
 * Cockpit financiero: ingresos, gastos, margen y días de caja del tenant.
 *
 * Las cuatro tarjetas enseñaban cifras inventadas (42.500 € de ingresos, un
 * margen del 8,1 %, un burn rate del 42,8 %) que no salían de ningún dato: un
 * tenant sin movimientos veía un negocio próspero. Ahora salen de
 * `/api/erp/finance/consolidation` —facturas cobradas, gastos pagados, nómina y
 * costos de fabricación del periodo— y cuando no hay nada que consolidar la
 * pantalla lo dice en vez de pintar ceros o inventar un trimestre.
 */
export default function FinanzasDashboard() {
  const { data: expenses, isLoading: loadingExpenses } = useSWR('/api/erp/expenses?limit=5', fetcher)
  const { data: consolidacion, isLoading: cargandoConsolidacion } = useSWR('/api/erp/finance/consolidation', fetcher)
  const [period, setPeriod] = useState('Este mes')
  // La divisa de reporte del tenant: el cockpit mostraba euros escritos a mano,
  // así que un tenant con la moneda en pesos veía sus cifras en euros.
  const moneda = useMonedaTenant()

  const resumen = useMemo(() => resumirConsolidacion(consolidacion), [consolidacion])
  const cargando = cargandoConsolidacion && !consolidacion
  const errorConsolidacion = typeof consolidacion?.error === 'string' ? consolidacion.error : null

  const { ingresos, gastos, beneficio, margen } = resumen.cifras
  const { pipelinePonderado, gastoMensual, diasDeCaja } = resumen.proyeccion

  /** Importe del tenant, con `—` cuando el dato no existe y `…` mientras carga. */
  const importe = (valor: number | null) => {
    if (cargando) return '…'
    return valor === null ? '—' : formatearImporte(valor, moneda)
  }
  const dias = () => {
    if (cargando) return '…'
    return diasDeCaja === null ? '—' : `${Math.round(diasDeCaja)} días`
  }

  /** Cuánto de los gastos cubren los ingresos. Sin gastos no hay proporción. */
  const cobertura = ingresos !== null && gastos !== null && gastos > 0 ? (ingresos / gastos) * 100 : null

  const stats = [
    {
      label: 'Ingresos Totales',
      value: importe(ingresos),
      detail: 'Facturas cobradas del periodo',
      icon: TrendingUp,
      color: 'text-emerald-500',
      bg: 'bg-emerald-500/10',
      bar: 'bg-emerald-500',
    },
    {
      label: 'Gastos Operativos',
      value: importe(gastos),
      detail: 'Gastos, nómina y fabricación',
      icon: TrendingDown,
      color: 'text-rose-500',
      bg: 'bg-rose-500/10',
      bar: 'bg-rose-500',
    },
    {
      label: 'Margen Neto',
      value: importe(beneficio),
      detail: cargando
        ? 'Calculando…'
        : margen === null
          ? 'Sin ingresos sobre los que calcularlo'
          : `${margen.toFixed(1)} % sobre ingresos`,
      icon: DollarSign,
      color: 'text-blue-500',
      bg: 'bg-blue-500/10',
      bar: 'bg-blue-500',
    },
    {
      label: 'Días de caja',
      value: dias(),
      detail: 'Pipeline ponderado frente al gasto medio',
      icon: BarChart3,
      color: 'text-amber-500',
      bg: 'bg-amber-500/10',
      bar: 'bg-amber-500',
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
            <div className={`absolute top-0 left-0 w-1 h-full ${stat.bar}`} />
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className={`p-2.5 rounded-xl ${stat.bg} ${stat.color}`}>
                  <stat.icon className="w-5 h-5" />
                </div>
                <Badge variant="outline" className="rounded-full border-none bg-slate-50 dark:bg-slate-900 px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
                  {period}
                </Badge>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{stat.label}</p>
                <p className="text-2xl font-black tracking-tighter">{stat.value}</p>
                <p className="text-[10px] font-medium text-muted-foreground leading-snug">{stat.detail}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Estado de la consolidación: sin datos, o con la causa del fallo */}
      {!cargando && errorConsolidacion && (
        <Card className="border-none shadow-sm border-l-4 border-rose-500 bg-rose-50/50 dark:bg-rose-950/10">
          <CardContent className="p-5 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-sm font-bold text-rose-800 dark:text-rose-300">No se pudo leer la consolidación financiera</p>
              <p className="text-xs text-rose-700/80 dark:text-rose-400/80 leading-relaxed">{errorConsolidacion}</p>
            </div>
          </CardContent>
        </Card>
      )}
      {!cargando && !errorConsolidacion && resumen.hayRespuesta && !resumen.hayDatos && (
        <Card className="border-none shadow-sm border-l-4 border-slate-300 bg-slate-50 dark:bg-slate-900/50">
          <CardContent className="p-5 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-slate-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-sm font-bold text-slate-700 dark:text-slate-200">Sin movimientos en el periodo</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                No hay facturas cobradas ni gastos pagados que consolidar. Cobra una factura o registra un gasto y las
                cifras de arriba aparecerán aquí.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

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

        {/* Salud financiera */}
        <Card className="lg:col-span-3 border-none shadow-sm overflow-hidden bg-gradient-to-br from-white to-slate-50 dark:from-slate-950 dark:to-slate-900">
          <CardHeader>
            <div className="flex items-center gap-2 mb-1">
              <div className={`h-2 w-2 rounded-full animate-pulse ${resumen.hayDatos ? 'bg-emerald-500' : 'bg-slate-300'}`} />
              <CardTitle className="text-lg font-bold">Salud financiera</CardTitle>
            </div>
            <CardDescription>Cifras del periodo en curso y proyección del pipeline.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {!resumen.hayRespuesta ? (
              <p className="text-xs text-muted-foreground leading-relaxed">
                {errorConsolidacion ? 'Sin datos: la consolidación no respondió.' : 'Cargando la consolidación financiera…'}
              </p>
            ) : (
              <>
                <div className="space-y-4">
                  <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider">
                    <span>Ingresos sobre gastos</span>
                    <span className={cobertura !== null && cobertura >= 100 ? 'text-emerald-500' : 'text-slate-400'}>
                      {cobertura === null ? 'Sin gastos registrados' : `${cobertura.toFixed(0)} %`}
                    </span>
                  </div>
                  <Progress value={cobertura === null ? 0 : Math.min(100, cobertura)} className="h-2" />
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {cobertura === null
                      ? 'No hay gastos pagados en el periodo, así que todavía no hay proporción que enseñar.'
                      : `Tus ingresos cubren el ${cobertura.toFixed(0)} % de los gastos del periodo.`}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-2 border-t">
                  <div className="space-y-0.5">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Pipeline ponderado</p>
                    <p className="text-sm font-black tracking-tight">{importe(pipelinePonderado)}</p>
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Gasto mensual medio</p>
                    <p className="text-sm font-black tracking-tight">{importe(gastoMensual)}</p>
                  </div>
                  <div className="space-y-0.5 col-span-2">
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Días de caja</p>
                    <p className="text-sm font-black tracking-tight">{dias()}</p>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Resumen del periodo que redacta la propia consolidación */}
      <Card className="border-none shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg font-bold flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" /> Resumen del periodo
          </CardTitle>
          <CardDescription>Lo que la consolidación calcula con los movimientos del tenant.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800">
            {resumen.resumen ? (
              <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-line">{resumen.resumen}</p>
            ) : (
              <p className="text-xs text-muted-foreground leading-relaxed">
                {errorConsolidacion
                  ? 'No se pudo generar el resumen del periodo.'
                  : cargando
                    ? 'Generando el resumen del periodo…'
                    : 'Todavía no hay movimientos que resumir en este periodo.'}
              </p>
            )}
          </div>

          <Button variant="outline" className="w-full rounded-xl text-xs font-bold uppercase tracking-widest py-6 group">
            <FileText className="w-4 h-4 mr-2 group-hover:rotate-12 transition-transform" /> Descargar Reporte P&L
          </Button>
        </CardContent>
      </Card>

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
              &quot;Utilizando Gemma 4 Vision para procesamiento contable automatizado en tiempo real.&quot;
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
