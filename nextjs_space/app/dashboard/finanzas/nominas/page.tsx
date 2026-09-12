'use client'

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Plus, Users, Calendar, DollarSign, Search, Filter } from "lucide-react"
import useSWR from "swr"
import { formatearImporte } from '@/lib/moneda'
import { useMonedaTenant } from '@/lib/use-moneda-tenant'

const fetcher = (url: string) => fetch(url).then(res => res.json())

export default function NominasPage() {
  const { data: payroll, isLoading } = useSWR('/api/erp/finance/payroll', fetcher)
  // La divisa de la nómina es la del tenant: la pantalla escribía euros a mano.
  const moneda = useMonedaTenant()

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black tracking-tight uppercase">Gestión de Nóminas</h1>
          <p className="text-muted-foreground font-medium">Control de pagos a personal y costos de capital humano.</p>
        </div>
        <Button className="rounded-xl font-bold uppercase text-xs tracking-wider">
          <Plus className="w-4 h-4 mr-2" /> Registrar Pago
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input className="w-full bg-slate-100 border-none rounded-xl pl-10 pr-4 py-3 text-sm font-medium" placeholder="Buscar empleado..." />
        </div>
        <input className="bg-slate-100 border-none rounded-xl px-4 py-3 text-sm font-bold" type="month" defaultValue="2026-04" />
        <Button variant="outline" className="rounded-xl border-none bg-slate-100 font-bold text-xs uppercase"><Filter className="w-3 h-3 mr-2"/> Todos los periodos</Button>
      </div>

      <Card className="border-none shadow-sm overflow-hidden">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b bg-slate-50/50">
                  <th className="px-6 py-4 text-[10px] font-black uppercase text-muted-foreground tracking-widest">Periodo</th>
                  <th className="px-6 py-4 text-[10px] font-black uppercase text-muted-foreground tracking-widest">Colaborador</th>
                  <th className="px-6 py-4 text-[10px] font-black uppercase text-muted-foreground tracking-widest">Fecha Pago</th>
                  <th className="px-6 py-4 text-[10px] font-black uppercase text-muted-foreground tracking-widest">Estado</th>
                  <th className="px-6 py-4 text-[10px] font-black uppercase text-muted-foreground tracking-widest text-right">Monto Bruto</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {isLoading ? (
                  <tr><td colSpan={5} className="px-6 py-10 text-center font-bold uppercase text-muted-foreground text-xs">Cargando nóminas...</td></tr>
                ) : (payroll && payroll.length > 0) ? (
                  payroll.map((p: any) => (
                    <tr key={p.id} className="hover:bg-slate-50 transition-colors group">
                      <td className="px-6 py-4 text-sm font-bold text-primary">{p.period}</td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                           <div className="h-8 w-8 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-500">{p.employeeName.charAt(0)}</div>
                           <span className="text-sm font-bold tracking-tight">{p.employeeName}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-xs font-medium text-slate-500">{new Date(p.date).toLocaleDateString()}</td>
                      <td className="px-6 py-4">
                        <Badge className={`rounded-lg border-none text-[9px] font-black uppercase ${p.status === 'PAID' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                          {p.status}
                        </Badge>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className="text-sm font-black tracking-tighter">{formatearImporte(p.amount, p.currency || moneda)}</span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="px-6 py-20 text-center flex flex-col items-center justify-center space-y-2">
                       <Users className="w-8 h-8 text-slate-200" />
                       <p className="text-sm font-bold text-slate-400 uppercase tracking-tight italic">No hay registros de nómina en este periodo</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
