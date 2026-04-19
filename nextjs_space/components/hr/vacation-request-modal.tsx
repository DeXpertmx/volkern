'use client'

import { useState, useEffect } from 'react'
import { Umbrella, Calendar as CalendarIcon, Loader2, AlertTriangle, CheckCircle2, Info } from 'lucide-react'
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription,
  DialogFooter
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select'
import { DateRangePicker } from '@/components/ui/date-range-picker'
import { DateRange } from 'react-day-picker'
import { toast } from 'sonner'
import useSWR from 'swr'
import { motion, AnimatePresence } from 'framer-motion'

const fetcher = (url: string) => fetch(url).then(res => res.json())

interface VacationRequestModalProps {
  open: boolean
  setOpen: (open: boolean) => void
  onSuccess?: () => void
  initialData?: {
    employeeId?: string
    from?: Date
    to?: Date
  }
}

export function VacationRequestModal({ open, setOpen, onSuccess, initialData }: VacationRequestModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isValidating, setIsValidating] = useState(false)
  const [employeeId, setEmployeeId] = useState<string>('')
  const [dateRange, setDateRange] = useState<DateRange | undefined>()
  const [type, setType] = useState('VACATION')
  const [reason, setReason] = useState('')
  const [validationResult, setValidationResult] = useState<any>(null)

  const { data: employees } = useSWR('/api/erp/hr/employees', fetcher)

  // Pre-cargar datos si vienen del calendario
  useEffect(() => {
    if (initialData?.employeeId) setEmployeeId(initialData.employeeId)
    if (initialData?.from) {
      setDateRange({ from: initialData.from, to: initialData.to || initialData.from })
    }
  }, [initialData, open])

  // Silent Checker: Validación en tiempo real
  useEffect(() => {
    const validate = async () => {
      if (!employeeId || !dateRange?.from || !dateRange?.to) {
        setValidationResult(null)
        return
      }

      setIsValidating(true)
      try {
        const response = await fetch('/api/erp/hr/vacations/validate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            employeeId,
            startDate: dateRange.from,
            endDate: dateRange.to
          })
        })
        const result = await response.json()
        setValidationResult(result)
      } catch (error) {
        console.error('Validation error:', error)
      } finally {
        setIsValidating(false)
      }
    }

    const timer = setTimeout(validate, 500)
    return () => clearTimeout(timer)
  }, [employeeId, dateRange])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!employeeId || !dateRange?.from || !dateRange?.to) {
      toast.error('Por favor, completa los campos obligatorios.')
      return
    }

    setIsSubmitting(true)
    try {
      const response = await fetch('/api/erp/hr/vacations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId,
          startDate: dateRange.from,
          endDate: dateRange.to,
          type,
          reason
        })
      })

      if (!response.ok) throw new Error('Error al solicitar vacaciones')

      toast.success('Solicitud enviada correctamente')
      setOpen(false)
      // Reset
      setEmployeeId('')
      setDateRange(undefined)
      setReason('')
      setValidationResult(null)
      onSuccess?.()
    } catch (error) {
      toast.error('Hubo un problema al procesar la solicitud.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-[550px] border-none shadow-2xl rounded-[2.5rem] overflow-hidden bg-white/95 backdrop-blur-xl">
        <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-primary via-indigo-500 to-rose-500" />
        
        <DialogHeader className="pt-10 px-10 pb-4">
          <div className="flex items-center justify-between">
            <div className="h-14 w-14 rounded-[1.25rem] bg-primary/10 flex items-center justify-center mb-6">
              <Umbrella className="h-7 w-7 text-primary" />
            </div>
            {isValidating && (
              <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-slate-100 animate-pulse">
                <Loader2 className="h-3 w-3 animate-spin text-slate-400" />
                <span className="text-[10px] font-black uppercase text-slate-500">Volkern Silent Validating...</span>
              </div>
            )}
          </div>
          <DialogTitle className="text-3xl font-black uppercase tracking-tight leading-none">Nueva Ausencia</DialogTitle>
          <DialogDescription className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground mt-2">
            Gestión Adaptativa • Validación en Tiempo Real
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="px-10 pb-10 space-y-8">
          {/* Silent Checker Feedback Banner */}
          <AnimatePresence mode="wait">
            {validationResult && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className={`p-4 rounded-3xl border-2 flex gap-4 ${
                  !validationResult.isViable ? 'bg-rose-50 border-rose-100' : 'bg-emerald-50 border-emerald-100'
                }`}>
                  <div className={`h-10 w-10 shrink-0 rounded-2xl flex items-center justify-center ${
                    !validationResult.isViable ? 'bg-rose-500 text-white' : 'bg-emerald-500 text-white'
                  }`}>
                    {!validationResult.isViable ? <AlertTriangle className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}
                  </div>
                  <div>
                    <h5 className={`text-[10px] font-black uppercase tracking-widest ${
                      !validationResult.isViable ? 'text-rose-600' : 'text-emerald-600'
                    }`}>
                      {!validationResult.isViable ? 'Advertencia Operativa' : 'Validación Superada'}
                    </h5>
                    <p className="text-xs font-bold text-slate-700 mt-1">
                      {validationResult.quotaAlert || (validationResult.criticalMilestones.length > 0 ? 
                        `Conflicto con ${validationResult.criticalMilestones.length} hito(s) crítico(s).` : 
                        "Solicitud viable y dentro de saldo.")}
                    </p>
                    {validationResult.criticalMilestones.length > 0 && (
                      <div className="mt-2 text-[9px] font-black uppercase text-rose-400">
                        {validationResult.criticalMilestones.map((m: any) => m.name).join(', ')}
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-2 col-span-2 md:col-span-1">
              <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Tipo de Ausencia</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger className="rounded-2xl h-14 border-2 bg-slate-50/50 hover:bg-white transition-all">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-2xl">
                  <SelectItem value="VACATION" className="text-xs font-bold uppercase">🌴 Vacaciones</SelectItem>
                  <SelectItem value="PERSONAL" className="text-xs font-bold uppercase">☕ Día Personal</SelectItem>
                  <SelectItem value="SICKNESS" className="text-xs font-bold uppercase">🤒 Enfermedad</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2 col-span-2 md:col-span-1">
              <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Colaborador</Label>
              <Select value={employeeId} onValueChange={setEmployeeId}>
                <SelectTrigger className="rounded-2xl h-14 border-2 bg-slate-50/50">
                  <SelectValue placeholder="Seleccionar..." />
                </SelectTrigger>
                <SelectContent className="rounded-2xl">
                  {employees?.map((emp: any) => (
                    <SelectItem key={emp.id} value={emp.id} className="text-xs font-medium">
                      {emp.fullName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2 col-span-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Período Seleccionado</Label>
              <DateRangePicker 
                value={dateRange as any} 
                onChange={(range) => setDateRange(range as any)} 
                className="w-full"
              />
            </div>

            <div className="space-y-2 col-span-2">
              <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Notas de Justificación</Label>
              <Input 
                value={reason} 
                onChange={(e) => setReason(e.target.value)}
                placeholder="Indica el motivo si es necesario..." 
                className="rounded-2xl h-14 border-2 bg-slate-50/50"
              />
            </div>
          </div>

          <DialogFooter className="pt-6 border-t border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2 text-slate-400">
               <Info className="h-4 w-4" />
               <span className="text-[9px] font-black uppercase tracking-widest italic">Soberanía de Mando Bruno OK</span>
            </div>
            <div className="flex gap-2">
              <Button 
                type="button" 
                variant="ghost" 
                onClick={() => setOpen(false)}
                className="rounded-2xl font-black uppercase text-[10px] h-12 px-6"
              >
                Cancelar
              </Button>
              <Button 
                type="submit" 
                disabled={isSubmitting}
                className={`rounded-2xl font-black uppercase text-[10px] h-12 px-10 shadow-xl transition-all ${
                   validationResult && !validationResult.isViable ? 'bg-amber-500 hover:bg-amber-600' : 'bg-primary'
                }`}
              >
                {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Confirmar Solicitud'}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
