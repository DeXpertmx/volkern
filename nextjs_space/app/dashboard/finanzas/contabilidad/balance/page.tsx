'use client'

import { useEffect, useState } from 'react'
import { formatearImporte } from '@/lib/moneda'
import { useMonedaTenant } from '@/lib/use-moneda-tenant'
import { Scale, Wallet, TrendingDown, TrendingUp, FileText, Download } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'

interface AccountLine {
  code: string
  name: string
  balance: number
}

interface BalanceSection {
  label: string
  accounts: AccountLine[]
  total: number
}

interface BalanceReport {
  activo: { sections: BalanceSection[]; total: number }
  pasivo: { sections: BalanceSection[]; total: number }
}

export default function BalanceSheetPage() {
  const [data, setData] = useState<BalanceReport | null>(null)
  const [loading, setLoading] = useState(true)
  const moneda = useMonedaTenant()

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/accounting/reports/balance-sheet')
      if (!res.ok) throw new Error('Error al cargar')
      setData(await res.json())
    } catch (err) {
      toast.error('Error al cargar Balance de Situación')
    } finally {
      setLoading(false)
    }
  }

  if (loading) return (
    <div className="flex h-[80vh] items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
        <p className="text-sm font-medium text-slate-500 animate-pulse">Calculando Balance de Situación...</p>
      </div>
    </div>
  )

  // El importe y la divisa van juntos: la divisa la pone el tenant y el formato
  // lo decide el módulo de dinero.
  const formatCurrency = (value: number) => formatearImporte(value, moneda)

  return (
    <div className="p-8 space-y-8 bg-[#F8FAFC] min-h-screen">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Badge className="bg-indigo-100 text-indigo-700 hover:bg-indigo-100 border-none px-3 py-1 font-bold text-[10px] uppercase tracking-wider">
              Artículo 35 Código de Comercio
            </Badge>
          </div>
          <h1 className="text-4xl font-black text-slate-900 tracking-tight">Balance de Situación</h1>
          <p className="text-slate-500 font-medium">Activo, Pasivo y Patrimonio Neto a fecha de cierre.</p>
        </div>
        <Button variant="outline" className="rounded-xl font-bold bg-white" onClick={fetchData}>
          <Download className="w-4 h-4 mr-2" /> Exportar
        </Button>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* ACTIVO */}
        <Card className="rounded-[2rem] border-none shadow-xl shadow-slate-200/50 bg-white overflow-hidden">
          <CardHeader className="p-8 pb-4 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-indigo-600" />
              </div>
              <div>
                <CardTitle className="text-2xl font-black">Activo</CardTitle>
                <CardDescription className="font-medium">Bienes y derechos de la empresa</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-8 pt-6">
            <div className="space-y-6">
              {data?.activo.sections.map((section) => (
                <div key={section.label}>
                  <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider mb-3">{section.label}</h3>
                  <div className="space-y-1">
                    {section.accounts.length === 0 && (
                      <p className="text-xs text-slate-400 italic py-2">Sin movimientos</p>
                    )}
                    {section.accounts.map((acc) => (
                      <div key={acc.code} className="flex items-center justify-between py-1.5 px-3 rounded-lg hover:bg-slate-50 transition-colors">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono font-bold text-slate-400">{acc.code}</span>
                          <span className="text-sm font-medium text-slate-700">{acc.name}</span>
                        </div>
                        <span className="text-sm font-black text-slate-900">{formatCurrency(acc.balance)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center justify-between py-2 px-3 mt-2 bg-indigo-50 rounded-xl">
                    <span className="text-xs font-black uppercase tracking-widest text-indigo-600">Total {section.label}</span>
                    <span className="text-sm font-black text-indigo-600">{formatCurrency(section.total)}</span>
                  </div>
                </div>
              ))}
              <div className="flex items-center justify-between py-3 px-4 bg-slate-900 rounded-2xl mt-4">
                <span className="text-sm font-black uppercase tracking-widest text-white">Total Activo</span>
                <span className="text-lg font-black text-white">{formatCurrency(data?.activo.total || 0)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* PASIVO + PATRIMONIO NETO */}
        <Card className="rounded-[2rem] border-none shadow-xl shadow-slate-200/50 bg-white overflow-hidden">
          <CardHeader className="p-8 pb-4 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center">
                <TrendingDown className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <CardTitle className="text-2xl font-black">Pasivo + Patrimonio Neto</CardTitle>
                <CardDescription className="font-medium">Obligaciones y fondos propios</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-8 pt-6">
            <div className="space-y-6">
              {data?.pasivo.sections.map((section) => (
                <div key={section.label}>
                  <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider mb-3">{section.label}</h3>
                  <div className="space-y-1">
                    {section.accounts.length === 0 && (
                      <p className="text-xs text-slate-400 italic py-2">Sin movimientos</p>
                    )}
                    {section.accounts.map((acc) => (
                      <div key={acc.code} className="flex items-center justify-between py-1.5 px-3 rounded-lg hover:bg-slate-50 transition-colors">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono font-bold text-slate-400">{acc.code}</span>
                          <span className="text-sm font-medium text-slate-700">{acc.name}</span>
                        </div>
                        <span className="text-sm font-black text-slate-900">{formatCurrency(acc.balance)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center justify-between py-2 px-3 mt-2 bg-amber-50 rounded-xl">
                    <span className="text-xs font-black uppercase tracking-widest text-amber-600">Total {section.label}</span>
                    <span className="text-sm font-black text-amber-600">{formatCurrency(section.total)}</span>
                  </div>
                </div>
              ))}
              <div className="flex items-center justify-between py-3 px-4 bg-slate-900 rounded-2xl mt-4">
                <span className="text-sm font-black uppercase tracking-widest text-white">Total Pasivo + Patrimonio Neto</span>
                <span className="text-lg font-black text-white">{formatCurrency(data?.pasivo.total || 0)}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-[2rem] border-none shadow-xl shadow-slate-200/50 bg-white overflow-hidden">
        <CardContent className="p-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-emerald-50 rounded-xl flex items-center justify-center">
                <Scale className="w-6 h-6 text-emerald-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-500">Cuadre Contable</p>
                <p className="text-lg font-black text-slate-900">
                  {Math.abs((data?.activo.total || 0) - (data?.pasivo.total || 0)) < 0.01
                    ? '✓ Balance Cuadrado'
                    : '✗ Diferencia: ' + formatCurrency(Math.abs((data?.activo.total || 0) - (data?.pasivo.total || 0)))
                  }
                </p>
              </div>
            </div>
            <Badge className={Math.abs((data?.activo.total || 0) - (data?.pasivo.total || 0)) < 0.01
              ? 'bg-emerald-100 text-emerald-700 border-none px-3 py-1.5 font-black text-[10px] uppercase tracking-wider'
              : 'bg-rose-100 text-rose-700 border-none px-3 py-1.5 font-black text-[10px] uppercase tracking-wider'
            }>
              {Math.abs((data?.activo.total || 0) - (data?.pasivo.total || 0)) < 0.01 ? 'CUADRADO' : 'DESCUADRADO'}
            </Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
