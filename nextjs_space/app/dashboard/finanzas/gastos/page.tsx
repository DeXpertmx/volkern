'use client'

import { useState, useMemo, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Plus, Search, Receipt, Eye, ShieldCheck, Scan, ArrowUp, ArrowDown, ArrowUpDown, FileSpreadsheet } from "lucide-react"
import { 
  Sheet, 
  SheetContent, 
  SheetHeader, 
  SheetTitle, 
  SheetDescription 
} from "@/components/ui/sheet"
import useSWR from "swr"
import ExpenseVerificationDetails from "@/components/finance/ExpenseVerificationDetails"
import { ImportGastosModal } from "@/components/finance/ImportGastosModal"
import { formatearImporte } from '@/lib/moneda'
import { useMonedaTenant } from '@/lib/use-moneda-tenant'

const fetcher = (url: string) => fetch(url).then(res => res.json())

type SortKey = 'date' | 'supplier' | 'base' | 'iva' | 'amount'
type PresenceFilter = 'all' | 'with' | 'without'

function SortIcon({ active, dir }: { active: boolean; dir: 'asc' | 'desc' }) {
  if (!active) return <ArrowUpDown className="w-3 h-3 inline-block ml-1 opacity-40" />
  return dir === 'asc'
    ? <ArrowUp className="w-3 h-3 inline-block ml-1" />
    : <ArrowDown className="w-3 h-3 inline-block ml-1" />
}

export default function GastosPage() {
  const router = useRouter()
  const { data, isLoading, mutate } = useSWR('/api/erp/expenses', fetcher)
  // La divisa del gasto es la suya y, si no la tiene, la del tenant: la tabla
  // escribía euros a mano.
  const moneda = useMonedaTenant()
  const [selectedExpense, setSelectedExpense] = useState<any>(null)
  const [importOpen, setImportOpen] = useState(false)

  // ─── Filtros y ordenación ──────────────────────────────────────────────
  const [supplierFilter, setSupplierFilter] = useState('all')
  const [baseFilter, setBaseFilter] = useState<PresenceFilter>('all')
  const [ivaFilter, setIvaFilter] = useState<PresenceFilter>('all')
  const [sortKey, setSortKey] = useState<SortKey>('date')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  // Filtro de proveedor desde la URL (?proveedor=ID), p. ej. desde su ficha
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const id = params.get('proveedor')
    if (id) setSupplierFilter(id)
  }, [])

  const changeSupplierFilter = (id: string) => {
    setSupplierFilter(id)
    router.replace(id === 'all' ? '/dashboard/finanzas/gastos' : `/dashboard/finanzas/gastos?proveedor=${id}`, { scroll: false })
  }

  const expenses = data?.expenses || []
  const tenantConfig = data?.tenantConfig || { baseLatitude: 40.416775, baseLongitude: -3.703790 }

  // Proveedores únicos presentes en los gastos (para el filtro)
  const suppliers = useMemo(() => {
    const map = new Map<string, any>()
    expenses.forEach((e: any) => { if (e.supplier?.id) map.set(e.supplier.id, e.supplier) })
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name))
  }, [expenses])

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir(key === 'supplier' ? 'asc' : 'desc')
    }
  }

  const filteredExpenses = useMemo(() => {
    const list = [...expenses]
    list.sort((a: any, b: any) => {
      let cmp = 0
      switch (sortKey) {
        case 'date': cmp = new Date(a.date).getTime() - new Date(b.date).getTime(); break
        case 'supplier': cmp = (a.supplier?.name || '').localeCompare(b.supplier?.name || ''); break
        case 'base': cmp = (a.taxableBase ?? -1) - (b.taxableBase ?? -1); break
        case 'iva': cmp = (a.vatAmount ?? -1) - (b.vatAmount ?? -1); break
        case 'amount': cmp = a.amount - b.amount; break
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
    return list.filter((e: any) =>
      (supplierFilter === 'all' || e.supplier?.id === supplierFilter) &&
      (baseFilter === 'all' || (baseFilter === 'with' ? e.taxableBase != null : e.taxableBase == null)) &&
      (ivaFilter === 'all' || (ivaFilter === 'with' ? e.vatAmount != null : e.vatAmount == null))
    )
  }, [expenses, sortKey, sortDir, supplierFilter, baseFilter, ivaFilter])

  const thBase = "px-6 py-4 text-[10px] font-black uppercase text-muted-foreground tracking-widest"
  const thButton = "inline-flex items-center gap-1 uppercase tracking-widest hover:text-foreground transition-colors"

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black tracking-tight uppercase">Listado de Gastos</h1>
          <p className="text-muted-foreground">Control detallado de cada egreso operativo.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="rounded-xl font-bold uppercase text-xs tracking-wider" onClick={() => setImportOpen(true)}>
            <FileSpreadsheet className="w-4 h-4 mr-2 text-emerald-600" /> Importar Excel
          </Button>
          <Link href="/dashboard/finanzas/gastos/escanear">
            <Button variant="outline" className="rounded-xl font-bold uppercase text-xs tracking-wider">
              <Scan className="w-4 h-4 mr-2" /> Escanear
            </Button>
          </Link>
          <Link href="/dashboard/finanzas/gastos/escanear?manual=1">
            <Button className="rounded-xl font-bold uppercase text-xs tracking-wider">
              <Plus className="w-4 h-4 mr-2" /> Registrar Gasto
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input className="w-full bg-slate-100 dark:bg-slate-900 border-none rounded-xl pl-10 pr-4 py-3 text-sm" placeholder="Buscar por descripción..." />
        </div>
        <select
          value={supplierFilter}
          onChange={e => changeSupplierFilter(e.target.value)}
          className="w-full bg-slate-100 dark:bg-slate-900 border-none rounded-xl px-4 py-3 text-sm font-bold appearance-none outline-none cursor-pointer"
        >
          <option value="all">Todos los proveedores</option>
          {suppliers.map(s => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        <select
          value={baseFilter}
          onChange={e => setBaseFilter(e.target.value as PresenceFilter)}
          className="w-full bg-slate-100 dark:bg-slate-900 border-none rounded-xl px-4 py-3 text-sm font-bold appearance-none outline-none cursor-pointer"
        >
          <option value="all">Base: todas</option>
          <option value="with">Base: solo con dato</option>
          <option value="without">Base: sin dato</option>
        </select>
        <select
          value={ivaFilter}
          onChange={e => setIvaFilter(e.target.value as PresenceFilter)}
          className="w-full bg-slate-100 dark:bg-slate-900 border-none rounded-xl px-4 py-3 text-sm font-bold appearance-none outline-none cursor-pointer"
        >
          <option value="all">IVA: todo</option>
          <option value="with">IVA: solo con cuota</option>
          <option value="without">IVA: sin cuota</option>
        </select>
      </div>

      <Card className="border-none shadow-sm">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b bg-slate-50/50">
                  <th className={thBase}>
                    <button onClick={() => toggleSort('date')} className={thButton}>
                      Fecha <SortIcon active={sortKey === 'date'} dir={sortDir} />
                    </button>
                  </th>
                  <th className={thBase}>Descripción</th>
                  <th className={thBase}>
                    <button onClick={() => toggleSort('supplier')} className={thButton}>
                      Proveedor <SortIcon active={sortKey === 'supplier'} dir={sortDir} />
                    </button>
                  </th>
                  <th className={`${thBase} text-right`}>
                    <button onClick={() => toggleSort('base')} className={`${thButton} justify-end`}>
                      Base <SortIcon active={sortKey === 'base'} dir={sortDir} />
                    </button>
                  </th>
                  <th className={`${thBase} text-right`}>
                    <button onClick={() => toggleSort('iva')} className={`${thButton} justify-end`}>
                      IVA <SortIcon active={sortKey === 'iva'} dir={sortDir} />
                    </button>
                  </th>
                  <th className={`${thBase} text-right`}>Retención</th>
                  <th className={thBase}>Estado</th>
                  <th className={`${thBase} text-center`}>Verifactu</th>
                  <th className={`${thBase} text-right`}>
                    <button onClick={() => toggleSort('amount')} className={`${thButton} justify-end`}>
                      Monto <SortIcon active={sortKey === 'amount'} dir={sortDir} />
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {isLoading ? (
                  <tr><td colSpan={9} className="px-6 py-10 text-center text-muted-foreground font-medium">Cargando datos...</td></tr>
                ) : (filteredExpenses.length > 0) ? (
                  filteredExpenses.map((expense: any) => (
                    <tr 
                      key={expense.id} 
                      className="hover:bg-indigo-50/30 transition-colors group cursor-pointer"
                      onClick={() => setSelectedExpense(expense)}
                    >
                      <td className="px-6 py-4 text-sm font-medium">{new Date(expense.date).toLocaleDateString()}</td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <Receipt className="w-4 h-4 text-slate-400" />
                          <span className="text-sm font-bold tracking-tight">{expense.description}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {expense.supplier ? (
                          <Link
                            href={`/dashboard/finanzas/proveedores?proveedor=${expense.supplier.id}`}
                            onClick={e => e.stopPropagation()}
                            className="block group/sup hover:text-primary transition-colors"
                          >
                            <span className="text-sm font-bold text-slate-700 group-hover/sup:text-primary">{expense.supplier.name}</span>
                            {expense.supplier.taxId && (
                              <span className="block text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mt-0.5">{expense.supplier.taxId}</span>
                            )}
                          </Link>
                        ) : (
                          <span className="text-sm font-medium text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className="text-xs font-semibold text-slate-600">
                          {expense.taxableBase != null ? formatearImporte(expense.taxableBase, expense.currency || moneda) : '—'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className="text-xs font-semibold text-slate-600">
                          {expense.vatAmount != null
                            ? `${formatearImporte(expense.vatAmount, expense.currency || moneda)}${expense.vatRate != null ? ` (${expense.vatRate}%)` : ''}`
                            : '—'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        {(expense.metadata?.irpfAmount != null || expense.metadata?.ivaRetentionAmount != null) ? (
                          <div className="flex flex-col items-end gap-0.5">
                            {expense.metadata?.irpfAmount != null && (
                              <span className="text-xs font-bold text-amber-600 tabular-nums">
                                IRPF {expense.metadata.irpfAmount.toFixed(2)}{expense.metadata.irpfRate != null ? ` (${expense.metadata.irpfRate}%)` : ''}
                              </span>
                            )}
                            {expense.metadata?.ivaRetentionAmount != null && (
                              <span className="text-xs font-bold text-amber-600 tabular-nums">
                                IVA {expense.metadata.ivaRetentionAmount.toFixed(2)}{expense.metadata.ivaRetentionRate != null ? ` (${expense.metadata.ivaRetentionRate}%)` : ''}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-slate-300">—</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <Badge className={`rounded-lg text-[10px] font-bold uppercase border-none ${expense.status === 'PAID' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                          {expense.status}
                        </Badge>
                      </td>
                      <td className="px-6 py-4 text-center">
                         <div className="flex justify-center">
                            {expense.fingerprint ? (
                               <ShieldCheck className={`w-4 h-4 ${expense.isAnomaly ? 'text-amber-500' : 'text-emerald-500'}`} />
                            ) : (
                               <div className="w-4 h-4 rounded-full border-2 border-slate-200 border-t-indigo-500 animate-spin" />
                            )}
                         </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-3 text-right">
                           <span className="text-sm font-black tracking-tighter">-{formatearImporte(expense.amount, expense.currency || moneda)}</span>
                           <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
                              <Eye className="w-4 h-4" />
                           </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                   <tr><td colSpan={9} className="px-6 py-20 text-center font-medium text-slate-400">No se encontraron gastos que coincidan con los filtros.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Modal de importación masiva desde Excel */}
      <ImportGastosModal
        open={importOpen}
        onOpenChange={setImportOpen}
        onSuccess={() => mutate()}
      />

      {/* Verification Detailed Side Panel */}
      <Sheet open={!!selectedExpense} onOpenChange={(open) => !open && setSelectedExpense(null)}>
        <SheetContent className="sm:max-w-4xl overflow-y-auto border-none shadow-2xl">
          <SheetHeader className="mb-8">
            <SheetTitle className="text-2xl font-black uppercase tracking-tight">Detalle de Verificación Operativa</SheetTitle>
            <SheetDescription>Análisis forense de integridad, ubicación y validez fiscal.</SheetDescription>
          </SheetHeader>
          
          {selectedExpense && (
             <ExpenseVerificationDetails 
                expense={selectedExpense} 
                tenantConfig={tenantConfig} 
             />
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}
