'use client'

import { useEffect, useState } from 'react'
import { TrendingUp, TrendingDown, FileText, Download, Equal } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'

interface AccountLine {
  code: string
  name: string
  balance: number
}

interface PyGSection {
  label: string
  accounts: AccountLine[]
  total: number
}

interface PyGReport {
  sections: PyGSection[]
  totalGastos: number
  totalIngresos: number
  resultadoEjercicio: number
}

export default function PyGPage() {
  const [data, setData] = useState<PyGReport | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/accounting/reports/pyg')
      if (!res.ok) throw new Error('Error al cargar')
      setData(await res.json())
    } catch (err) {
      toast.error('Error al cargar Cuenta de Resultados')
    } finally {
      setLoading(false)
    }
  }

  if (loading) return (
    <div className="flex h-[80vh] items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
        <p className="text-sm font-medium text-slate-500 animate-pulse">Calculando Pérdidas y Ganancias...</p>
      </div>
    </div>
  )

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(value)

  const isPositive = (data?.resultadoEjercicio || 0) >= 0

  return (
    <div className="p-8 space-y-8 bg-[#F8FAFC] min-h-screen">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Badge className="bg-indigo-100 text-indigo-700 hover:bg-indigo-100 border-none px-3 py-1 font-bold text-[10px] uppercase tracking-wider">
              Ejercicio Económico
            </Badge>
          </div>
          <h1 className="text-4xl font-black text-slate-900 tracking-tight">Cuenta de Resultados</h1>
          <p className="text-slate-500 font-medium">Pérdidas y Ganancias del periodo — PyG analítica.</p>
        </div>
        <Button variant="outline" className="rounded-xl font-bold bg-white" onClick={fetchData}>
          <Download className="w-4 h-4 mr-2" /> Exportar
        </Button>
      </header>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="rounded-[2rem] border-none shadow-lg shadow-slate-200/40 bg-white">
          <CardContent className="p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-emerald-600" />
              </div>
              <p className="text-sm font-bold text-slate-500 uppercase tracking-wider">Ingresos</p>
            </div>
            <p className="text-3xl font-black text-emerald-600">{formatCurrency(data?.totalIngresos || 0)}</p>
          </CardContent>
        </Card>

        <Card className="rounded-[2rem] border-none shadow-lg shadow-slate-200/40 bg-white">
          <CardContent className="p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-rose-50 rounded-xl flex items-center justify-center">
                <TrendingDown className="w-5 h-5 text-rose-600" />
              </div>
              <p className="text-sm font-bold text-slate-500 uppercase tracking-wider">Gastos</p>
            </div>
            <p className="text-3xl font-black text-rose-600">{formatCurrency(data?.totalGastos || 0)}</p>
          </CardContent>
        </Card>

        <Card className={`rounded-[2rem] border-none shadow-lg shadow-slate-200/40 ${isPositive ? 'bg-emerald-900' : 'bg-rose-900'} text-white`}>
          <CardContent className="p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center">
                <Equal className="w-5 h-5 text-white" />
              </div>
              <p className="text-sm font-bold text-white/70 uppercase tracking-wider">Resultado del Ejercicio</p>
            </div>
            <p className="text-3xl font-black text-white">{formatCurrency(data?.resultadoEjercicio || 0)}</p>
            <Badge className={`mt-2 border-none ${isPositive ? 'bg-emerald-700 text-emerald-100' : 'bg-rose-700 text-rose-100'} font-black text-[10px] uppercase tracking-widest`}>
              {isPositive ? 'BENEFICIO' : 'PÉRDIDA'}
            </Badge>
          </CardContent>
        </Card>
      </div>

      {/* Detail sections */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {data?.sections.map((section) => (
          <Card key={section.label} className="rounded-[2rem] border-none shadow-xl shadow-slate-200/50 bg-white overflow-hidden">
            <CardHeader className={`p-8 pb-4 border-b border-slate-100 ${section.accounts.length > 0 && section.accounts[0]?.balance >= 0 ? '' : ''}`}>
              <CardTitle className="text-xl font-black">{section.label}</CardTitle>
              <CardDescription className="font-medium">
                {section.accounts.length} cuentas con movimiento
              </CardDescription>
            </CardHeader>
            <CardContent className="p-8 pt-6">
              <div className="space-y-1">
                {section.accounts.length === 0 && (
                  <p className="text-xs text-slate-400 italic py-4 text-center">Sin movimientos en este grupo</p>
                )}
                {section.accounts.map((acc) => (
                  <div key={acc.code} className="flex items-center justify-between py-1.5 px-3 rounded-lg hover:bg-slate-50 transition-colors">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-bold text-slate-400">{acc.code}</span>
                      <span className="text-sm font-medium text-slate-700">{acc.name}</span>
                    </div>
                    <span className={`text-sm font-black ${acc.balance >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {formatCurrency(acc.balance)}
                    </span>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between py-3 px-3 mt-4 bg-slate-100 rounded-xl">
                <span className="text-xs font-black uppercase tracking-widest text-slate-600">Total {section.label}</span>
                <span className="text-sm font-black text-slate-900">{formatCurrency(section.total)}</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Resultado final */}
      <Card className="rounded-[2rem] border-none shadow-xl shadow-slate-200/50 bg-white overflow-hidden">
        <CardContent className="p-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ${isPositive ? 'bg-emerald-50' : 'bg-rose-50'}`}>
                <Equal className={`w-7 h-7 ${isPositive ? 'text-emerald-600' : 'text-rose-600'}`} />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-500">Resultado del Ejercicio (Ingresos - Gastos)</p>
                <p className={`text-2xl font-black ${isPositive ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {formatCurrency(data?.resultadoEjercicio || 0)}
                </p>
              </div>
            </div>
            <Badge className={`px-4 py-2 border-none font-black text-xs uppercase tracking-widest ${isPositive ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
              {isPositive ? 'BENEFICIO' : 'PÉRDIDA'}
            </Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
