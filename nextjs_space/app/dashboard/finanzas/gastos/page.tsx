'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Plus, Search, Receipt, Filter, Eye, ShieldCheck, AlertTriangle, Scan } from "lucide-react"
import { 
  Sheet, 
  SheetContent, 
  SheetHeader, 
  SheetTitle, 
  SheetDescription 
} from "@/components/ui/sheet"
import useSWR from "swr"
import ExpenseVerificationDetails from "@/components/finance/ExpenseVerificationDetails"

const fetcher = (url: string) => fetch(url).then(res => res.json())

export default function GastosPage() {
  const { data, isLoading } = useSWR('/api/erp/expenses', fetcher)
  const [selectedExpense, setSelectedExpense] = useState<any>(null)

  const expenses = data?.expenses || []
  const tenantConfig = data?.tenantConfig || { baseLatitude: 40.416775, baseLongitude: -3.703790 }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black tracking-tight uppercase">Listado de Gastos</h1>
          <p className="text-muted-foreground">Control detallado de cada egreso operativo.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/dashboard/finanzas/gastos/escanear">
            <Button variant="outline" className="rounded-xl font-bold uppercase text-xs tracking-wider">
              <Scan className="w-4 h-4 mr-2" /> Escanear
            </Button>
          </Link>
          <Button className="rounded-xl font-bold uppercase text-xs tracking-wider">
            <Plus className="w-4 h-4 mr-2" /> Registrar Gasto
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input className="w-full bg-slate-100 dark:bg-slate-900 border-none rounded-xl pl-10 pr-4 py-3 text-sm" placeholder="Buscar por descripción..." />
        </div>
        <div className="md:col-span-2 flex gap-2">
            <Button variant="outline" className="rounded-xl border-none bg-slate-100 dark:bg-slate-900 font-bold text-xs uppercase"><Filter className="w-3 h-3 mr-2"/> Categoría</Button>
            <Button variant="outline" className="rounded-xl border-none bg-slate-100 dark:bg-slate-900 font-bold text-xs uppercase"><Filter className="w-3 h-3 mr-2"/> Estado</Button>
        </div>
      </div>

      <Card className="border-none shadow-sm">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b bg-slate-50/50">
                  <th className="px-6 py-4 text-[10px] font-black uppercase text-muted-foreground tracking-widest">Fecha</th>
                  <th className="px-6 py-4 text-[10px] font-black uppercase text-muted-foreground tracking-widest">Descripción</th>
                  <th className="px-6 py-4 text-[10px] font-black uppercase text-muted-foreground tracking-widest">Proveedor</th>
                  <th className="px-6 py-4 text-[10px] font-black uppercase text-muted-foreground tracking-widest">Estado</th>
                  <th className="px-6 py-4 text-[10px] font-black uppercase text-muted-foreground tracking-widest text-center">Verifactu</th>
                  <th className="px-6 py-4 text-[10px] font-black uppercase text-muted-foreground tracking-widest text-right">Monto</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {isLoading ? (
                  <tr><td colSpan={6} className="px-6 py-10 text-center text-muted-foreground font-medium">Cargando datos...</td></tr>
                ) : (expenses && expenses.length > 0) ? (
                  expenses.map((expense: any) => (
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
                      <td className="px-6 py-4 text-sm font-medium text-slate-600">{expense.supplier?.name}</td>
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
                           <span className="text-sm font-black tracking-tighter">-€{expense.amount.toFixed(2)}</span>
                           <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
                              <Eye className="w-4 h-4" />
                           </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                   <tr><td colSpan={6} className="px-6 py-20 text-center font-medium text-slate-400">No se encontraron gastos registrados.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

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
