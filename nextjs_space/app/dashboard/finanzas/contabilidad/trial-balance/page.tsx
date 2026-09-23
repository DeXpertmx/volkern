'use client'

import { useEffect, useState } from 'react'
import { formatearImporte } from '@/lib/moneda'
import { useMonedaTenant } from '@/lib/use-moneda-tenant'
import { FileText, Download, Search } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'

interface TrialBalanceRow {
  code: string
  name: string
  type: string
  group: number
  debit: number
  credit: number
  balance: number
}

interface TrialBalanceReport {
  rows: TrialBalanceRow[]
  totalDebit: number
  totalCredit: number
}

export default function TrialBalancePage() {
  const [data, setData] = useState<TrialBalanceReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const moneda = useMonedaTenant()

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/accounting/reports/trial-balance')
      if (!res.ok) throw new Error('Error al cargar')
      setData(await res.json())
    } catch (err) {
      toast.error('Error al cargar Balance de Comprobación')
    } finally {
      setLoading(false)
    }
  }

  if (loading) return (
    <div className="flex h-[80vh] items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
        <p className="text-sm font-medium text-slate-500 animate-pulse">Calculando Balance de Comprobación...</p>
      </div>
    </div>
  )

  const formatCurrency = (value: number) => formatearImporte(value, moneda)

  const filteredRows = data?.rows.filter(
    (r) =>
      r.code.includes(search) ||
      r.name.toLowerCase().includes(search.toLowerCase())
  ) || []

  const groupLabels: Record<number, string> = {
    1: 'Grupo 1 - Financiación Básica',
    2: 'Grupo 2 - Inmovilizado',
    3: 'Grupo 3 - Existencias',
    4: 'Grupo 4 - Acreedores y Deudores',
    5: 'Grupo 5 - Cuentas Financieras',
    6: 'Grupo 6 - Compras y Gastos',
    7: 'Grupo 7 - Ventas e Ingresos',
    8: 'Grupo 8 - Gastos Patrimonio Neto',
    9: 'Grupo 9 - Ingresos Patrimonio Neto',
  }

  const groupedRows = filteredRows.reduce<Record<number, TrialBalanceRow[]>>((acc, row) => {
    if (!acc[row.group]) acc[row.group] = []
    acc[row.group].push(row)
    return acc
  }, {})

  return (
    <div className="p-8 space-y-8 bg-[#F8FAFC] min-h-screen">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Badge className="bg-indigo-100 text-indigo-700 hover:bg-indigo-100 border-none px-3 py-1 font-bold text-[10px] uppercase tracking-wider">
              Sumas y Saldos
            </Badge>
          </div>
          <h1 className="text-4xl font-black text-slate-900 tracking-tight">Balance de Comprobación</h1>
          <p className="text-slate-500 font-medium">Sumas, saldos deudores y acreedores de todas las cuentas.</p>
        </div>
        <div className="flex gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Buscar cuenta..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 rounded-xl bg-white border-slate-200 w-64"
            />
          </div>
          <Button variant="outline" className="rounded-xl font-bold bg-white" onClick={fetchData}>
            <Download className="w-4 h-4 mr-2" /> Exportar
          </Button>
        </div>
      </header>

      <div className="space-y-6">
        {Object.entries(groupedRows).map(([groupStr, rows]) => {
          const group = parseInt(groupStr)
          const groupDebit = rows.reduce((s, r) => s + r.debit, 0)
          const groupCredit = rows.reduce((s, r) => s + r.credit, 0)

          return (
            <Card key={group} className="rounded-[2rem] border-none shadow-xl shadow-slate-200/50 bg-white overflow-hidden">
              <CardHeader className="p-6 pb-3 border-b border-slate-100">
                <CardTitle className="text-sm font-black uppercase tracking-wider text-slate-700">
                  {groupLabels[group] || `Grupo ${group}`}
                </CardTitle>
                <CardDescription className="text-xs">
                  {rows.length} cuentas · Debe: {formatCurrency(groupDebit)} · Haber: {formatCurrency(groupCredit)}
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50/50">
                        <th className="text-left py-3 px-6 text-[10px] font-black uppercase tracking-widest text-slate-500">Cuenta</th>
                        <th className="text-left py-3 px-6 text-[10px] font-black uppercase tracking-widest text-slate-500">Nombre</th>
                        <th className="text-left py-3 px-6 text-[10px] font-black uppercase tracking-widest text-slate-500">Tipo</th>
                        <th className="text-right py-3 px-6 text-[10px] font-black uppercase tracking-widest text-slate-500">Debe</th>
                        <th className="text-right py-3 px-6 text-[10px] font-black uppercase tracking-widest text-slate-500">Haber</th>
                        <th className="text-right py-3 px-6 text-[10px] font-black uppercase tracking-widest text-slate-500">Saldo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => (
                        <tr key={row.code} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                          <td className="py-2.5 px-6 font-mono font-bold text-slate-900">{row.code}</td>
                          <td className="py-2.5 px-6 font-medium text-slate-700">{row.name}</td>
                          <td className="py-2.5 px-6">
                            <Badge variant="outline" className={`text-[9px] font-black uppercase px-1.5 py-0 ${
                              row.type === 'ACTIVO' ? 'border-indigo-200 text-indigo-600 bg-indigo-50' :
                              row.type === 'PASIVO' ? 'border-amber-200 text-amber-600 bg-amber-50' :
                              row.type === 'GASTO' ? 'border-rose-200 text-rose-600 bg-rose-50' :
                              'border-emerald-200 text-emerald-600 bg-emerald-50'
                            }`}>
                              {row.type === 'ACTIVO' ? 'ACT' : row.type === 'PASIVO' ? 'PAS' : row.type === 'GASTO' ? 'GAS' : 'ING'}
                            </Badge>
                          </td>
                          <td className="py-2.5 px-6 text-right font-mono font-medium text-slate-900">
                            {row.debit > 0 ? formatCurrency(row.debit) : '-'}
                          </td>
                          <td className="py-2.5 px-6 text-right font-mono font-medium text-slate-900">
                            {row.credit > 0 ? formatCurrency(row.credit) : '-'}
                          </td>
                          <td className={`py-2.5 px-6 text-right font-mono font-bold ${
                            row.balance >= 0 ? 'text-slate-900' : 'text-rose-600'
                          }`}>
                            {formatCurrency(row.balance)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Totales */}
      <Card className="rounded-[2rem] border-none shadow-xl shadow-indigo-100 bg-slate-900 text-white">
        <CardContent className="p-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Total Debe</p>
              <p className="text-2xl font-black">{formatCurrency(data?.totalDebit || 0)}</p>
            </div>
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Total Haber</p>
              <p className="text-2xl font-black">{formatCurrency(data?.totalCredit || 0)}</p>
            </div>
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Diferencia</p>
              <p className={`text-2xl font-black ${Math.abs((data?.totalDebit || 0) - (data?.totalCredit || 0)) < 0.01 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {formatCurrency(Math.abs((data?.totalDebit || 0) - (data?.totalCredit || 0)))}
              </p>
              {Math.abs((data?.totalDebit || 0) - (data?.totalCredit || 0)) < 0.01 && (
                <p className="text-[10px] font-bold text-emerald-400/70 uppercase tracking-widest mt-1">✓ Cuadrado</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
