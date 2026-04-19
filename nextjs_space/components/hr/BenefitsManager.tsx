'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { 
  PlusCircle, 
  Trash2, 
  Calendar, 
  Euro, 
  RefreshCcw,
  CheckCircle2,
  AlertCircle
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'

interface Benefit {
  id: string
  concept: string
  amount: number
  frequency: string
  startDate: string
  endDate?: string
  active: boolean
}

export function BenefitsManager({ employeeId, initialBenefits = [] }: { employeeId: string, initialBenefits?: Benefit[] }) {
  const [benefits, setBenefits] = useState<Benefit[]>(initialBenefits)
  const [isLoading, setIsLoading] = useState(false)
  
  const { register, handleSubmit, reset, setValue, watch } = useForm({
    defaultValues: {
      concept: '',
      amount: '',
      frequency: 'MONTHLY',
      category: 'OTHER',
      requiresAttendanceValidation: false,
      minimumAttendancePercent: 0,
      requiresPhysicalPresence: false,
      startDate: new Date().toISOString().split('T')[0],
      endDate: ''
    }
  })

  const frequency = watch('frequency')

  const onSubmit = async (data: any) => {
    setIsLoading(true)
    try {
      const res = await fetch('/api/erp/hr/benefits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          ...data, 
          employeeId, 
          amount: Number(data.amount),
          minimumAttendancePercent: data.requiresAttendanceValidation ? Number(data.minimumAttendancePercent) : null
        }),
      })
      
      if (!res.ok) throw new Error('Error al guardar el beneficio')
      
      const newBenefit = await res.json()
      setBenefits([newBenefit, ...benefits])
      reset()
      toast.success('Beneficio añadido correctamente')
    } catch (error) {
      toast.error('Error', { description: 'No se pudo guardar el beneficio.' })
    } finally {
      setIsLoading(false)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/erp/hr/benefits/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Error al eliminar')
      
      setBenefits(benefits.filter(b => b.id !== id))
      toast.success('Beneficio eliminado')
    } catch (error) {
      toast.error('Error', { description: 'No se pudo eliminar el beneficio.' })
    }
  }

  return (
    <div className="space-y-6">
      <Card className="border-none shadow-xl bg-white rounded-[2rem] overflow-hidden">
        <CardHeader className="p-8 pb-0">
          <div className="flex items-center gap-2 mb-2">
            <PlusCircle className="w-5 h-5 text-indigo-600" />
            <Badge className="bg-indigo-50 text-indigo-600 border-none font-bold uppercase text-[10px]">Nueva Ayuda Recurrente</Badge>
          </div>
          <CardTitle className="text-2xl font-black text-slate-900">Añadir Beneficio Social</CardTitle>
          <CardDescription>Configura ayudas automáticas que se aplicarán en la nómina según la frecuencia elegida.</CardDescription>
        </CardHeader>
        
        <CardContent className="p-8">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Concepto de la Ayuda</Label>
                <Input 
                  placeholder="Ej: Ayuda Guardería" 
                  {...register('concept', { required: true })} 
                  className="rounded-xl border-slate-100 bg-slate-50 focus:bg-white transition-all"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Categoría</Label>
                <Select onValueChange={(val) => setValue('category', val)} defaultValue="OTHER">
                  <SelectTrigger className="rounded-xl border-slate-100 bg-slate-50">
                    <SelectValue placeholder="Seleccionar..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="TRANSPORT">Transporte</SelectItem>
                    <SelectItem value="MEAL">Alimentación</SelectItem>
                    <SelectItem value="EDUCATION">Educación/Formación</SelectItem>
                    <SelectItem value="HOUSING">Vivienda</SelectItem>
                    <SelectItem value="OTHER">Otros</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Importe Bruto (€)</Label>
                <div className="relative">
                  <Euro className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input 
                    type="number" 
                    step="0.01" 
                    placeholder="0.00" 
                    {...register('amount', { required: true })} 
                    className="pl-10 rounded-xl border-slate-100 bg-slate-50 focus:bg-white transition-all"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Frecuencia de Pago</Label>
                <Select onValueChange={(val) => setValue('frequency', val)} defaultValue="MONTHLY">
                  <SelectTrigger className="rounded-xl border-slate-100 bg-slate-50">
                    <SelectValue placeholder="Seleccionar..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MONTHLY">Mensual</SelectItem>
                    <SelectItem value="QUARTERLY">Trimestral</SelectItem>
                    <SelectItem value="YEARLY">Anual (Enero)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Fecha de Inicio</Label>
                <Input 
                  type="date" 
                  {...register('startDate', { required: true })} 
                  className="rounded-xl border-slate-100 bg-slate-50 focus:bg-white transition-all"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Fecha de Finalización (Opcional)</Label>
                <Input 
                  type="date" 
                  {...register('endDate')} 
                  className="rounded-xl border-slate-100 bg-slate-50 focus:bg-white transition-all"
                />
              </div>
            </div>

            <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100 space-y-6">
              <h4 className="text-[10px] font-black uppercase tracking-widest text-indigo-600">Reglas de Soberanía Operativa (Sniffer)</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="flex items-center justify-between p-4 bg-white rounded-xl border">
                  <div className="space-y-1">
                    <Label className="font-bold text-slate-900">Requiere Presencia Física</Label>
                    <p className="text-[10px] text-slate-500">Incompatible con teletrabajo 100%</p>
                  </div>
                  <input 
                    type="checkbox" 
                    {...register('requiresPhysicalPresence')} 
                    className="w-5 h-5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                </div>

                <div className="flex items-center justify-between p-4 bg-white rounded-xl border">
                  <div className="space-y-1">
                    <Label className="font-bold text-slate-900">Validar Asistencia Mínima</Label>
                    <p className="text-[10px] text-slate-500">Alertar si la asistencia es inferior al %</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Input 
                      type="number" 
                      placeholder="%" 
                      {...register('minimumAttendancePercent')}
                      className="w-16 h-8 text-xs text-center rounded-lg"
                    />
                    <input 
                      type="checkbox" 
                      {...register('requiresAttendanceValidation')} 
                      className="w-5 h-5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end">
              <Button 
                type="submit" 
                disabled={isLoading}
                className="h-12 px-12 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-black text-xs uppercase tracking-widest shadow-xl transition-all active:scale-95 flex items-center gap-2"
              >
                {isLoading ? <RefreshCcw className="w-4 h-4 animate-spin" /> : <PlusCircle className="w-4 h-4" />}
                {isLoading ? 'GUARDANDO...' : 'ACTIVAR BENEFICIO SOCIAL'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {benefits.map((benefit) => (
          <Card key={benefit.id} className="border bg-white shadow-sm rounded-3xl overflow-hidden hover:shadow-md transition-all group">
            <CardContent className="p-6">
              <div className="flex justify-between items-start">
                <div className="flex gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-900">{benefit.concept}</h4>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1 mt-1">
                      <RefreshCcw className="w-3 h-3" /> {benefit.frequency === 'monthly' ? 'Mensual' : benefit.frequency === 'quarterly' ? 'Trimestral' : 'Anual'}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-xl font-black text-slate-900">+{benefit.amount.toFixed(2)}€</span>
                  <div className="mt-1">
                    <Badge variant="outline" className="text-[8px] font-bold border-emerald-100 bg-emerald-50 text-emerald-600 rounded-lg">ACTIVO</Badge>
                  </div>
                </div>
              </div>

              <div className="mt-6 pt-6 border-t border-slate-50 flex items-center justify-between">
                <div className="flex items-center gap-4 text-slate-400">
                  <div className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    <span className="text-[9px] font-bold">{new Date(benefit.startDate).toLocaleDateString()}</span>
                  </div>
                  {benefit.endDate && (
                    <div className="flex items-center gap-1">
                      <ArrowRight className="w-3 h-3" />
                      <span className="text-[9px] font-bold text-red-400">{new Date(benefit.endDate).toLocaleDateString()}</span>
                    </div>
                  )}
                </div>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  onClick={() => handleDelete(benefit.id)}
                  className="w-8 h-8 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-all opacity-0 group-hover:opacity-100"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}

function Badge({ children, className, variant = "default" }: any) {
  return (
    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${className}`}>
      {children}
    </span>
  )
}

function ArrowRight({ className }: any) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
    </svg>
  )
}
