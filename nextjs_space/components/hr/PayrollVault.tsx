'use client'

import { useState } from 'react'
import useSWR from 'swr'
import { 
  FileText, 
  Search, 
  Eye, 
  Fingerprint, 
  AlertCircle, 
  ArrowRight,
  TrendingDown,
  Info,
  CheckCircle2,
  Clock,
  PlusCircle,
  TrendingUp,
  History,
  Trash2,
  ShieldCheck, 
  Lock, 
  Filter, 
  Download, 
  Calculator, 
  UserCog
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription,
  DialogFooter
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { EmployeePayrollConfig } from './EmployeePayrollConfig'
import { PayrollExecutionConsole } from './PayrollExecutionConsole'
import { ScrollArea } from '@/components/ui/scroll-area'
import { toast } from 'sonner'

const MOCK_PAYROLLS = [
  {
    id: 'pay_001',
    employee: 'Ana García',
    role: 'Senior Developer',
    salary: 4500,
    month: 'Abril 2026',
    status: 'DRAFT',
    absences: 2
  },
  {
    id: 'pay_002',
    employee: 'Carlos Ruiz',
    role: 'UI/UX Designer',
    salary: 3200,
    month: 'Abril 2026',
    status: 'SIGNED',
    absences: 0
  }
]

export function PayrollVault() {
  const [selectedPayroll, setSelectedPayroll] = useState<any>(null)
  const [isPreviewOpen, setIsPreviewOpen] = useState(false)
  const [isSigning, setIsSigning] = useState(false)
  const [manualBonuses, setManualBonuses] = useState<{concept: string, amount: number}[]>([])
  const [operatorNote, setOperatorNote] = useState('')
  const [isJustified, setIsJustified] = useState(false)

  const totalBonus = manualBonuses.reduce((acc, b) => acc + Number(b.amount || 0), 0)

  const { data: payrolls = MOCK_PAYROLLS, mutate } = useSWR('/api/erp/payroll/pending?month=4&year=2026', async (url) => {
    const res = await fetch(url)
    if (!res.ok) throw new Error('Error fetching payrolls')
    return res.json()
  })

  const handlePreview = (payroll: any) => {
    const audit = payroll.attendanceAudit;
    setSelectedPayroll({
      ...payroll,
      calculation: audit || {
        baseSalary: payroll.salary || 0,
        absentDays: payroll.absences || 0,
        deductions: (payroll.salary || 0) / 30 * (payroll.absences || 0),
        commissionAmount: 0,
        bonusAmount: 0,
        irpfRate: 0,
        ssRate: 0,
        commissionsDetails: []
      }
    })
    setIsPreviewOpen(true)
  }

  const calculateFinalNet = (calc: any) => {
    const rawNet = (calc.baseSalary - calc.deductions) + calc.commissionAmount + totalBonus;
    const irpf = rawNet * (calc.irpfRate / 100);
    const ss = rawNet * (calc.ssRate / 100);
    return {
      irpf,
      ss,
      net: rawNet - irpf - ss
    }
  }

  const handleSign = async () => {
    setIsSigning(true)
    
    try {
      const { net } = calculateFinalNet(selectedPayroll.calculation)
      const res = await fetch(`/api/erp/payroll/sign/${selectedPayroll.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          bonuses: manualBonuses, 
          finalNet: net,
          operatorNote: selectedPayroll.calculation.flaggedBenefits.length > 0 ? operatorNote : null
        })
      })

      if (!res.ok) throw new Error('Error al sellar nómina')

      const result = await res.json()
      
      toast.success('Nómina Sellada Inmutablemente', {
        description: `Se ha generado el registro con Hash: ${result.hash}`
      })
      
      mutate() // Recargar lista
    } catch (error) {
      toast.error('Error', { description: 'Hubo un problema al sellar la nómina.' })
    } finally {
      setIsSigning(false)
      setIsPreviewOpen(false)
    }
  }

  const calculateTotal = (salary: number, absences: number) => {
    const dailyRate = salary / 30
    const deductions = absences * dailyRate
    return {
      deductions,
      total: salary - deductions
    }
  }

  return (
    <div className="space-y-6">
      <Tabs defaultValue="vault" className="w-full">
        <div className="flex items-center justify-between mb-8">
           <div className="relative w-full max-w-md">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input 
                type="text" 
                placeholder="Buscar colaborador..." 
                className="w-full pl-12 pr-4 py-3 bg-white border border-slate-200 rounded-2xl text-sm focus:ring-2 focus:ring-primary/20 transition-all outline-none"
              />
           </div>
           
           <TabsList className="bg-slate-100 p-1 rounded-2xl w-full md:w-auto">
             <TabsTrigger value="vault" className="rounded-xl px-6 data-[state=active]:bg-white">Caja de Nóminas</TabsTrigger>
             <TabsTrigger value="execution" className="rounded-xl px-6 data-[state=active]:bg-white">Mesa de Nóminas (ES)</TabsTrigger>
             <TabsTrigger value="config" className="rounded-xl px-6 data-[state=active]:bg-white">Configuración Laboral</TabsTrigger>
           </TabsList>

           <div className="flex gap-2">
              <Badge variant="outline" className="px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest bg-slate-50 border-slate-200">
                 Abril 2026
              </Badge>
           </div>
        </div>

        <TabsContent value="vault">
          <div className="grid grid-cols-1 gap-4">
            {payrolls.map((p: any) => (
              <Card key={p.id} className="group border shadow-sm hover:shadow-xl hover:border-primary/20 transition-all rounded-[1.5rem] bg-white overflow-hidden">
                <CardContent className="p-0">
                   <div className="flex items-center justify-between p-6">
                      <div className="flex items-center gap-4">
                         <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-500 group-hover:bg-primary/10 group-hover:text-primary transition-all">
                            <FileText className="w-6 h-6" />
                         </div>
                         <div>
                            <h4 className="font-bold text-slate-900">{p.employeeName || p.employee}</h4>
                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{p.role}</p>
                         </div>
                      </div>

                      <div className="flex items-center gap-12">
                         <div className="text-right">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Estado</p>
                            {p.status === 'SIGNED' ? (
                               <Badge className="bg-emerald-500/10 text-emerald-600 border-none shadow-none rounded-lg font-bold">
                                  SELLADO QR
                               </Badge>
                            ) : (
                               <Badge variant="outline" className="text-amber-500 border-amber-200 bg-amber-50 rounded-lg font-bold">
                                  BORRADOR
                               </Badge>
                            )}
                         </div>

                         <div className="text-right">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Neto</p>
                            <span className="text-lg font-black text-slate-900">
                               {p.status === 'SIGNED' ? p.salary : calculateTotal(p.salary, p.absences).total.toFixed(0)}€
                            </span>
                         </div>

                         <div className="flex gap-2">
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              onClick={() => handlePreview(p)}
                              className="w-10 h-10 rounded-xl hover:bg-slate-100 transition-all"
                            >
                               <Eye className="w-4 h-4 text-slate-600" />
                            </Button>
                            <Button 
                              variant="outline" 
                              disabled={p.status === 'SIGNED'}
                              onClick={() => handlePreview(p)}
                              className="h-10 px-6 rounded-xl font-bold text-[10px] border-slate-200 hover:bg-slate-900 hover:text-white transition-all"
                            >
                               AUDITAR & FIRMAR
                            </Button>
                         </div>
                      </div>
                   </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="execution" className="animate-in fade-in slide-in-from-bottom-4 duration-500">
          <PayrollExecutionConsole />
        </TabsContent>

        <TabsContent value="config" className="animate-in fade-in slide-in-from-bottom-4 duration-500">
          <EmployeePayrollConfig />
        </TabsContent>
      </Tabs>

      {/* MODAL DE VISTA PREVIA & FIRMA */}
      <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
        <DialogContent className="max-w-xl rounded-[2.5rem] border-none shadow-2xl p-0 overflow-hidden bg-slate-50">
          <DialogHeader className="p-8 pb-0">
            <div className="flex items-center gap-3 mb-4">
               <Badge className="bg-indigo-600 text-white rounded-lg px-3 py-1 font-bold">AUDITORÍA PRE-FIRMA</Badge>
               <Badge variant="outline" className="border-indigo-200 text-indigo-600 font-bold uppercase text-[9px]">Soberanía Opción C</Badge>
            </div>
            <DialogTitle className="text-3xl font-black text-slate-900 tracking-tight">
               Detalle de Nómina: {selectedPayroll?.employee}
            </DialogTitle>
            <DialogDescription className="font-medium text-slate-500">
               Revisa los cálculos de asistencia y faltas antes de generar el sello inmutable.
            </DialogDescription>
          </DialogHeader>

          <div className="p-8 space-y-6">
            <div className="grid grid-cols-2 gap-4">
               <Card className="border shadow-none rounded-3xl bg-white p-6">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Devengos Fijos (Salario Base)</p>
                  <span className="text-2xl font-black text-slate-900">{selectedPayroll?.salary}€</span>
               </Card>
               <Card className="border border-indigo-100 shadow-none rounded-3xl bg-indigo-50/20 p-6">
                  <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-2">Ingresos Variables (Comisiones)</p>
                  <div className="flex items-center justify-between">
                     <span className="text-2xl font-black text-indigo-600">
                        +{selectedPayroll?.calculation?.commissionAmount || 0}€
                     </span>
                     {selectedPayroll?.calculation?.commissionsDetails?.length > 0 && (
                        <Badge className="bg-indigo-100 text-indigo-600 border-none font-bold text-[8px]">
                           {selectedPayroll.calculation.commissionsDetails.length} DEALS
                        </Badge>
                     )}
                  </div>
               </Card>
            </div>

            <div className="grid grid-cols-2 gap-4">
               <Card className="border border-red-100 shadow-none rounded-3xl bg-red-50/50 p-6">
                  <p className="text-[10px] font-black text-red-400 uppercase tracking-widest mb-2">Deducciones (Faltas)</p>
                  <div className="flex items-center justify-between">
                     <span className="text-2xl font-black text-red-600">
                        -{selectedPayroll?.calculation?.deductions?.toFixed(0)}€
                     </span>
                     <Badge className="bg-red-100 text-red-600 border-none font-bold">
                        {selectedPayroll?.absences} DÍAS
                     </Badge>
                  </div>
               </Card>
               <Card className="border border-emerald-100 shadow-none rounded-3xl bg-emerald-50/20 p-6 flex flex-col">
                  <div className="flex items-center justify-between mb-4">
                    <Label className="text-[10px] font-black text-emerald-600 uppercase tracking-widest block">Incentivos Adicionales</Label>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => setManualBonuses([...manualBonuses, { concept: '', amount: 0 }])}
                      className="h-6 px-2 text-[10px] font-bold text-emerald-600 bg-emerald-100 hover:bg-emerald-200 rounded-lg"
                    >
                      <PlusCircle className="w-3 h-3 mr-1" /> AÑADIR
                    </Button>
                  </div>
                  
                  <div className="space-y-2 flex-1 max-h-[120px] overflow-y-auto pr-1">
                    {manualBonuses.length === 0 && (
                      <p className="text-xs font-medium text-emerald-600/50 text-center py-4">Sin bonos manuales</p>
                    )}
                    {manualBonuses.map((bonus, idx) => (
                      <div key={idx} className="flex items-center gap-2 bg-white rounded-xl p-2 border border-emerald-100">
                        <Input 
                          placeholder="Concepto..."
                          value={bonus.concept}
                          onChange={(e) => {
                            const newBonuses = [...manualBonuses];
                            newBonuses[idx].concept = e.target.value;
                            setManualBonuses(newBonuses);
                          }}
                          className="h-7 text-xs border-none shadow-none focus-visible:ring-0 px-2 font-medium text-slate-700 bg-transparent flex-1"
                        />
                        <div className="flex items-center w-24">
                          <Input 
                            type="number"
                            placeholder="0"
                            value={bonus.amount || ''}
                            onChange={(e) => {
                              const newBonuses = [...manualBonuses];
                              newBonuses[idx].amount = Number(e.target.value);
                              setManualBonuses(newBonuses);
                            }}
                            className="h-7 text-xs border-none shadow-none focus-visible:ring-0 px-1 font-bold text-emerald-700 text-right bg-transparent w-full"
                          />
                          <span className="text-xs font-bold text-emerald-600 mr-2">€</span>
                        </div>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          onClick={() => {
                            const newBonuses = [...manualBonuses];
                            newBonuses.splice(idx, 1);
                            setManualBonuses(newBonuses);
                          }}
                          className="h-6 w-6 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                  
                  {manualBonuses.length > 0 && (
                    <div className="mt-4 pt-3 border-t border-emerald-200 flex justify-between items-center">
                      <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Total Bonos</span>
                      <span className="text-xl font-black text-emerald-700">+{totalBonus}€</span>
                    </div>
                  )}
               </Card>
            </div>

            <div className="bg-white rounded-3xl border p-6 space-y-4">
               <h5 className="font-bold text-slate-900 flex items-center gap-2">
                  <TrendingDown className="w-4 h-4 text-red-500" />
                  Retenciones Fiscales (VeriFactu Ready)
               </h5>
               <div className="space-y-2">
                  <div className="flex justify-between text-sm py-2">
                    <span className="text-slate-500 font-medium">IRPF ({selectedPayroll?.calculation?.irpfRate}%)</span>
                    <span className="font-bold text-red-500">
                      -{selectedPayroll ? calculateFinalNet(selectedPayroll.calculation).irpf.toFixed(2) : 0}€
                    </span>
                  </div>
                  <div className="flex justify-between text-sm py-2 border-t border-slate-50">
                    <span className="text-slate-500 font-medium">Seguridad Social ({selectedPayroll?.calculation?.ssRate}%)</span>
                    <span className="font-bold text-red-500">
                      -{selectedPayroll ? calculateFinalNet(selectedPayroll.calculation).ss.toFixed(2) : 0}€
                    </span>
                  </div>
                  
                  {selectedPayroll?.calculation?.commissionsDetails?.map((c: any) => (
                    <div key={c.id} className="mt-4 p-3 bg-indigo-50/50 rounded-2xl border border-indigo-100/50">
                      <p className="text-[8px] font-black text-indigo-400 uppercase tracking-widest flex items-center gap-1">
                        <History className="w-3 h-3" /> Trazabilidad de Comisión
                      </p>
                      <p className="text-xs font-bold text-indigo-700 mt-1">{c.metodo}</p>
                    </div>
                  ))}
               </div>
            </div>

            {/* SNIFFER ANOMALY PANEL */}
            {selectedPayroll?.calculation?.flaggedBenefits?.length > 0 && (
               <div className="bg-amber-50 rounded-3xl border border-amber-200 p-6 space-y-4">
                 <div className="flex items-center gap-2 text-amber-600">
                    <AlertCircle className="w-5 h-5" />
                    <h5 className="font-black text-[10px] uppercase tracking-widest">Alertas de Integridad Detectadas</h5>
                 </div>
                 
                 <div className="space-y-3">
                   {selectedPayroll.calculation.flaggedBenefits.map((flag: any, idx: number) => (
                     <div key={idx} className="bg-white rounded-2xl p-4 border border-amber-100 flex items-start justify-between">
                        <div>
                          <p className="text-xs font-black text-slate-900 uppercase tracking-tight">{flag.concept}</p>
                          <p className="text-[10px] font-medium text-amber-600 mt-1">{flag.reason}</p>
                        </div>
                        <Badge className={`border-none rounded-lg text-[8px] font-bold ${
                          flag.severity === 'high' ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-600'
                        }`}>
                          SEVERIDAD: {flag.severity.toUpperCase()}
                        </Badge>
                     </div>
                   ))}

                   {selectedPayroll.calculation.excludedBenefits.map((ex: any, idx: number) => (
                     <div key={`ex-${idx}`} className="bg-slate-100 rounded-2xl p-4 border border-slate-200 flex items-start justify-between opacity-60">
                        <div>
                          <p className="text-xs font-black text-slate-500 uppercase tracking-tight line-through">{ex.concept}</p>
                          <p className="text-[10px] font-medium text-slate-400 mt-1">{ex.reason}</p>
                        </div>
                        <Badge className="bg-slate-200 text-slate-600 border-none rounded-lg text-[8px] font-bold">
                          EXCLUIDO
                        </Badge>
                     </div>
                   ))}
                 </div>

                 <div className="pt-4 border-t border-amber-200">
                   <Label className="text-[10px] font-black text-amber-700 uppercase tracking-widest mb-2 block">Justificación de Auditoría (Obligatoria)</Label>
                   <textarea 
                     value={operatorNote}
                     onChange={(e) => setOperatorNote(e.target.value)}
                     placeholder="Escribe el motivo por el cual autorizas este pago a pesar de la anomalía..."
                     className="w-full h-20 p-3 text-xs bg-white border border-amber-200 rounded-xl focus:ring-2 focus:ring-amber-200 transition-all outline-none text-slate-700 font-medium"
                   />
                   <div className="flex items-center gap-2 mt-3">
                     <input 
                       type="checkbox" 
                       id="justified" 
                       checked={isJustified}
                       onChange={(e) => setIsJustified(e.target.checked)}
                       className="w-4 h-4 rounded border-amber-300 text-amber-600 focus:ring-amber-200"
                     />
                     <label htmlFor="justified" className="text-[10px] font-bold text-amber-800 uppercase tracking-tight">
                        Confirmo que he revisado las anomalías y procedo bajo mi responsabilidad
                     </label>
                   </div>
                 </div>
               </div>
             )}

            <div className="flex items-center justify-between bg-slate-900 rounded-3xl p-8 text-white">
               <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 text-emerald-400">Total Neto Posterior a Impuestos</p>
                  <span className="text-4xl font-black">
                     {selectedPayroll ? calculateFinalNet(selectedPayroll.calculation).net.toFixed(0) : 0}€
                  </span>
               </div>
               <div className="text-right">
                  <Badge className="bg-white/10 text-white border-none mb-2 font-bold">VERIFACTU COMPLIANT</Badge>
                  <p className="text-[10px] text-white/40 font-bold uppercase tracking-widest">Soberanía Industrial OK</p>
               </div>
            </div>
          </div>

          <DialogFooter className="p-8 bg-white border-t flex items-center justify-between sm:justify-between">
            <div className="flex items-center gap-2 text-slate-400">
               <Info className="w-4 h-4" />
               <span className="text-[10px] font-bold uppercase tracking-widest">Sello Inmutable requerido</span>
            </div>
            <div className="flex gap-3">
               <Button variant="ghost" onClick={() => setIsPreviewOpen(false)} className="rounded-xl font-bold text-[10px] uppercase">
                  CANCELAR
               </Button>
               <Button 
                 onClick={handleSign}
                 disabled={isSigning || (selectedPayroll?.calculation?.flaggedBenefits?.length > 0 && !isJustified)}
                 className="rounded-xl font-black text-[10px] uppercase px-8 bg-indigo-600 hover:bg-indigo-700 text-white shadow-xl shadow-indigo-100 transition-all active:scale-95 flex items-center gap-2"
               >
                  {isSigning ? <Clock className="w-4 h-4 animate-spin" /> : <Fingerprint className="w-4 h-4" />}
                  {isSigning ? 'SELLANDO...' : 'GENERAR SELLO DEL CEO'}
               </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
