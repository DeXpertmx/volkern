'use client'

import { useEffect, useState } from 'react'
import {
  LineChart,
  TrendingUp,
  TrendingDown,
  Wallet,
  Receipt,
  Building2,
  Loader2,
  ArrowUpRight,
  ArrowDownRight,
  AlertCircle,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

const fetcher = (url: string) => fetch(url).then(res => res.json())

export default function GlobalCockpitDashboard() {
  const [data, setData] = useState<any>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    fetcher('/api/v1/finance/global')
      .then(setData)
      .catch(() => setError(true))
  }, [])

  if (!data && !error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 space-y-4">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground font-medium">Consolidando finanzas...</p>
      </div>
    )
  }

  if (error) {
    return (
      <Card className="border-none shadow-xl ring-1 ring-slate-200">
        <CardContent className="py-16 text-center">
          <AlertCircle className="w-10 h-10 text-rose-400 mx-auto mb-4" />
          <h3 className="text-lg font-bold text-slate-700 mb-2">No se pudo cargar el Global Cockpit</h3>
          <p className="text-sm text-slate-500">Recarga la página o inténtalo de nuevo.</p>
        </CardContent>
      </Card>
    )
  }

  const fmt = (n: number) =>
    new Intl.NumberFormat('es-ES', { style: 'currency', currency: data.currency || 'EUR' }).format(n || 0)

  const isAgency = data.scope === 'AGENCY'
  const totals = data.totals || {}
  const netMargin = (totals.netMargin ?? 0)
  const entities = data.entities || []
  const monthly = data.monthly || []
  const recent = data.recent || []

  const kpis = [
    { label: 'Ingresos', value: fmt(totals.totalIncome), icon: TrendingUp, color: 'text-emerald-600', bg: 'bg-emerald-500/10', accent: 'bg-emerald-500' },
    { label: 'Gastos', value: fmt(totals.totalExpenses), icon: TrendingDown, color: 'text-rose-600', bg: 'bg-rose-500/10', accent: 'bg-rose-500' },
    { label: 'Margen Neto', value: fmt(netMargin), icon: Wallet, color: netMargin >= 0 ? 'text-blue-600' : 'text-amber-600', bg: 'bg-blue-500/10', accent: netMargin >= 0 ? 'bg-blue-500' : 'bg-amber-500' },
    { label: 'Operaciones', value: `${(totals.invoiceCount || 0) + (totals.expenseCount || 0)}`, icon: Receipt, color: 'text-purple-600', bg: 'bg-purple-500/10', accent: 'bg-purple-500' },
  ]

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-indigo-100 rounded-2xl text-indigo-600">
            <LineChart className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-black tracking-tight">Global Cockpit</h2>
            <p className="text-xs text-muted-foreground font-bold uppercase tracking-widest">
              Consolidación financiera y cash flow
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge className={cn(
            'rounded-full border-none px-3 py-1 text-[10px] font-black uppercase tracking-wider',
            isAgency ? 'bg-indigo-100 text-indigo-700' : 'bg-emerald-100 text-emerald-700'
          )}>
            <Building2 className="w-3 h-3 mr-1" />
            {isAgency ? `Agencia · ${entities.length} empresas` : 'Empresa'}
          </Badge>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((k, i) => (
          <Card key={i} className="border-none shadow-sm bg-white overflow-hidden relative group hover:shadow-md transition-all duration-300">
            <div className={cn('absolute top-0 left-0 w-1 h-full', k.accent)} />
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className={cn('p-2.5 rounded-xl', k.bg, k.color)}>
                  <k.icon className="w-5 h-5" />
                </div>
              </div>
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{k.label}</p>
              <p className="text-2xl font-black tracking-tighter mt-1">{k.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Desglose por empresa (solo agencias) */}
      {isAgency && entities.length > 1 && (
        <Card className="border-none shadow-xl ring-1 ring-slate-200 overflow-hidden">
          <CardHeader className="bg-indigo-50/50 border-b border-slate-100 py-5">
            <CardTitle className="text-base font-black">Consolidación por Empresa</CardTitle>
            <CardDescription className="font-medium text-xs">
              Actividad de los últimos 12 meses de cada empresa del despacho
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-400 font-black uppercase text-[10px] tracking-widest">
                  <tr>
                    <th className="px-5 py-3 text-left">Empresa</th>
                    <th className="px-5 py-3 text-right">Facturas</th>
                    <th className="px-5 py-3 text-right">Gastos</th>
                    <th className="px-5 py-3 text-right">Proveedores</th>
                    <th className="px-5 py-3 text-right">Ingresos</th>
                    <th className="px-5 py-3 text-right">Gastos €</th>
                    <th className="px-5 py-3 text-right">Margen</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {entities.map((e: any) => (
                    <tr key={e.id} className="hover:bg-indigo-50/30 transition-colors">
                      <td className="px-5 py-3 font-bold text-slate-800">{e.nombre}</td>
                      <td className="px-5 py-3 text-right font-medium">{e.invoiceCount}</td>
                      <td className="px-5 py-3 text-right font-medium">{e.expenseCount}</td>
                      <td className="px-5 py-3 text-right font-medium">{e.supplierCount || 0}</td>
                      <td className="px-5 py-3 text-right font-bold text-emerald-700">{fmt(e.totalIncome)}</td>
                      <td className="px-5 py-3 text-right font-bold text-rose-700">{fmt(e.totalExpenses)}</td>
                      <td className={cn('px-5 py-3 text-right font-black', e.netMargin >= 0 ? 'text-slate-900' : 'text-amber-600')}>
                        {fmt(e.netMargin)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Flujo mensual */}
      <Card className="border-none shadow-xl ring-1 ring-slate-200 overflow-hidden">
        <CardHeader className="bg-slate-50/50 border-b border-slate-100 py-5">
          <CardTitle className="text-base font-black">Flujo de Caja Mensual</CardTitle>
          <CardDescription className="font-medium text-xs">Últimos 6 meses consolidados</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-400 font-black uppercase text-[10px] tracking-widest">
                <tr>
                  <th className="px-5 py-3 text-left">Mes</th>
                  <th className="px-5 py-3 text-right">Ingresos</th>
                  <th className="px-5 py-3 text-right">Gastos</th>
                  <th className="px-5 py-3 text-right">Neto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {monthly.map((m: any) => (
                  <tr key={m.key} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-5 py-3">
                      <span className="font-black text-slate-800 capitalize">{m.label}</span>
                    </td>
                    <td className="px-5 py-3 text-right font-medium text-emerald-700">{fmt(m.income)}</td>
                    <td className="px-5 py-3 text-right font-medium text-rose-700">{fmt(m.expenses)}</td>
                    <td className={cn('px-5 py-3 text-right font-black', m.net >= 0 ? 'text-slate-900' : 'text-amber-600')}>
                      {fmt(m.net)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Transacciones recientes */}
      <Card className="border-none shadow-xl ring-1 ring-slate-200 overflow-hidden">
        <CardHeader className="bg-slate-50/50 border-b border-slate-100 py-5">
          <CardTitle className="text-base font-black">Transacciones Recientes</CardTitle>
          <CardDescription className="font-medium text-xs">Últimas facturas y gastos del periodo</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-400 font-black uppercase text-[10px] tracking-widest">
                <tr>
                  <th className="px-5 py-3 text-left">Fecha</th>
                  <th className="px-5 py-3 text-left">Descripción</th>
                  <th className="px-5 py-3 text-left">Contraparte</th>
                  {isAgency && <th className="px-5 py-3 text-left">Empresa</th>}
                  <th className="px-5 py-3 text-right">Importe</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recent.length === 0 ? (
                  <tr>
                    <td colSpan={isAgency ? 5 : 4} className="px-5 py-10 text-center text-slate-400 font-medium">
                      Sin transacciones en los últimos 12 meses
                    </td>
                  </tr>
                ) : (
                  recent.map((t: any) => (
                    <tr key={t.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-5 py-3 font-mono text-xs">
                        {new Date(t.date).toLocaleDateString('es-ES')}
                      </td>
                      <td className="px-5 py-3 font-bold text-slate-700">{t.description}</td>
                      <td className="px-5 py-3 text-slate-500">{t.counterparty}</td>
                      {isAgency && <td className="px-5 py-3 text-slate-500">{t.tenantName}</td>}
                      <td className={cn(
                        'px-5 py-3 text-right font-black flex items-center justify-end gap-1',
                        t.type === 'income' ? 'text-emerald-700' : 'text-rose-700'
                      )}>
                        {t.type === 'income'
                          ? <ArrowUpRight className="w-4 h-4" />
                          : <ArrowDownRight className="w-4 h-4" />}
                        {fmt(t.amount)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
