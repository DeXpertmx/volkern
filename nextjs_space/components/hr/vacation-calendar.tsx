'use client'

import { useState } from 'react'
import { 
  ChevronLeft, 
  ChevronRight, 
  Umbrella,
  Loader2,
  Sparkles,
  Zap,
  Users,
  AlertCircle
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { 
  format, 
  addMonths, 
  subMonths, 
  startOfMonth, 
  endOfMonth, 
  eachDayOfInterval, 
  isSameDay, 
  isWeekend,
  isWithinInterval,
  parseISO
} from 'date-fns'
import { es } from 'date-fns/locale'
import { motion, AnimatePresence } from 'framer-motion'
import useSWR from 'swr'
import { 
  Sheet, 
  SheetContent, 
  SheetHeader, 
  SheetTitle, 
  SheetDescription 
} from '@/components/ui/sheet'
import { Progress } from '@/components/ui/progress'

const fetcher = (url: string) => fetch(url).then(res => res.json())

interface VacationCalendarProps {
  onRequestClick?: (data?: { employeeId: string, from: Date }) => void
}

export function VacationCalendar({ onRequestClick }: VacationCalendarProps) {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedVacation, setSelectedVacation] = useState<any>(null)
  const [isInsightOpen, setIsInsightOpen] = useState(false)
  const [insightData, setInsightData] = useState<any>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  
  const { data: employees, isLoading: loadingEmps } = useSWR('/api/erp/hr/employees', fetcher)
  const { data: vacations, isLoading: loadingVacations } = useSWR('/api/erp/hr/vacations', fetcher)

  const monthStart = startOfMonth(currentDate)
  const monthEnd = endOfMonth(currentDate)
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd })

  const nextMonth = () => setCurrentDate(addMonths(currentDate, 1))
  const prevMonth = () => setCurrentDate(subMonths(currentDate, 1))

  const handleVacationClick = async (vacation: any) => {
    setSelectedVacation(vacation)
    setIsInsightOpen(true)
    setIsAnalyzing(true)
    
    try {
      const response = await fetch('/api/erp/hr/vacations/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId: vacation.employeeId,
          startDate: vacation.startDate,
          endDate: vacation.endDate
        })
      })
      const result = await response.json()
      setInsightData(result)
    } catch (error) {
      console.error('Analysis error:', error)
    } finally {
      setIsAnalyzing(false)
    }
  }

  const getVacationStatus = (employeeId: string, day: Date) => {
    if (!vacations) return null
    return vacations.find((v: any) => {
      const start = parseISO(v.startDate)
      const end = parseISO(v.endDate)
      return v.employeeId === employeeId && isWithinInterval(day, { start, end })
    })
  }

  if (loadingEmps || loadingVacations) {
    return (
      <div className="flex h-[400px] items-center justify-center bg-white/50 backdrop-blur-sm rounded-3xl border">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
      </div>
    )
  }

  const displayEmployees = employees || []

  return (
    <>
      <Card className="border-none shadow-2xl bg-white/80 backdrop-blur-3xl overflow-hidden rounded-[2.5rem]">
        <CardHeader className="flex flex-row items-center justify-between pb-8 px-8 pt-8 border-b border-slate-100/50">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <div className="p-2 bg-primary/10 rounded-xl">
                <Umbrella className="w-6 h-6 text-primary" />
              </div>
              <CardTitle className="text-2xl font-black uppercase tracking-tighter">
                Cuadrante Operativo
              </CardTitle>
            </div>
            <CardDescription className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">
              Gestión Adaptativa de Disponibilidad • {format(currentDate, 'MMMM yyyy', { locale: es })}
            </CardDescription>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex bg-slate-100 p-1 rounded-2xl">
              <Button variant="ghost" size="icon" onClick={prevMonth} className="rounded-xl h-9 w-9 hover:bg-white shadow-sm transition-all">
                <ChevronLeft className="w-5 h-5" />
              </Button>
              <Button 
                variant="ghost" 
                className="text-[10px] font-black uppercase h-9 px-6 hover:bg-white shadow-sm transition-all mx-1"
                onClick={() => setCurrentDate(new Date())}
              >
                Hoy
              </Button>
              <Button variant="ghost" size="icon" onClick={nextMonth} className="rounded-xl h-9 w-9 hover:bg-white shadow-sm transition-all">
                <ChevronRight className="w-5 h-5" />
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <div className="overflow-x-auto scrollbar-hide">
            {displayEmployees.length === 0 ? (
              <div className="p-24 text-center">
                <div className="inline-flex h-16 w-16 items-center justify-center rounded-3xl bg-slate-50 mb-4">
                  <Users className="h-8 w-8 text-slate-300" />
                </div>
                <p className="text-xs font-black uppercase text-slate-400 tracking-widest">No hay colaboradores activos</p>
              </div>
            ) : (
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-slate-50/40">
                    <th className="sticky left-0 z-30 bg-slate-50 p-6 text-left border-r w-72 min-w-[280px] shadow-[10px_0_30px_-15px_rgba(0,0,0,0.1)]">
                      <span className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">Colaborador</span>
                    </th>
                    {days.map(day => (
                      <th key={day.toString()} className={`p-3 text-center border-r min-w-[50px] ${isWeekend(day) ? 'bg-slate-100/30' : ''}`}>
                        <p className="text-[9px] font-black uppercase text-slate-400 opacity-60">
                          {format(day, 'EEE', { locale: es })}
                        </p>
                        <p className={`text-sm font-black mt-0.5 ${isSameDay(day, new Date()) ? 'text-primary' : 'text-slate-900'}`}>
                          {format(day, 'd')}
                        </p>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {displayEmployees.map((emp: any) => (
                    <tr key={emp.id} className="group hover:bg-slate-50/20 transition-all">
                      <td className="sticky left-0 z-30 bg-white/95 backdrop-blur-md p-5 border-r shadow-[10px_0_30px_-15px_rgba(0,0,0,0.05)]">
                        <div className="flex items-center gap-4">
                          <div className="relative group-hover:scale-110 transition-transform cursor-pointer">
                            <div className="h-11 w-11 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-700 shadow-xl flex items-center justify-center text-[11px] font-black text-white">
                              {emp.fullName.split(' ').map((n: string) => n[0]).join('')}
                            </div>
                            <div className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full bg-emerald-500 border-2 border-white" />
                          </div>
                          <div className="overflow-hidden">
                            <p className="text-sm font-bold text-slate-900 leading-tight truncate">{emp.fullName}</p>
                            <p className="text-[10px] font-black uppercase text-slate-400 mt-1 tracking-tighter truncate opacity-70">{emp.role}</p>
                          </div>
                        </div>
                      </td>
                      {days.map(day => {
                        const vacation = getVacationStatus(emp.id, day)
                        const isToday = isSameDay(day, new Date())
                        
                        return (
                          <td 
                            key={day.toString()} 
                            onClick={() => !vacation && onRequestClick?.({ employeeId: emp.id, from: day })}
                            className={`p-1.5 border-r text-center relative cursor-pointer group/cell ${
                              isWeekend(day) ? 'bg-slate-100/10' : ''
                            } ${isToday ? 'bg-primary/5' : ''} hover:bg-primary/10 transition-colors`}
                          >
                            {!vacation && (
                              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/cell:opacity-100 transition-opacity">
                                <span className="text-[10px] font-black text-primary">+</span>
                              </div>
                            )}
                            {vacation && (
                              <motion.div
                                layoutId={vacation.id}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleVacationClick(vacation)
                                }}
                                initial={{ scale: 0.9, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                className={`h-8 w-full rounded-xl flex items-center justify-center shadow-lg cursor-pointer transform hover:scale-105 transition-all ${
                                  vacation.status === 'APPROVED' 
                                    ? 'bg-gradient-to-br from-emerald-500 to-teal-600 shadow-emerald-500/20' 
                                    : 'bg-gradient-to-br from-amber-400 to-orange-500 shadow-amber-500/20'
                                }`}
                              >
                                <span className="text-[9px] font-black text-white drop-shadow-sm">
                                  {vacation.status === 'APPROVED' ? 'VAC' : 'PEND'}
                                </span>
                              </motion.div>
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          
          <div className="p-6 bg-slate-50/30 border-t border-slate-100 flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex gap-8">
              <div className="flex items-center gap-3">
                <div className="h-3 w-3 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 shadow-lg shadow-emerald-500/30" />
                <span className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Aprobado</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="h-3 w-3 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 shadow-lg shadow-amber-500/30" />
                <span className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Pendiente</span>
              </div>
            </div>
            <div className="flex items-center gap-4 px-6 py-3 rounded-2xl bg-white shadow-sm border border-slate-100">
               <div className="flex items-center gap-2">
                  <Zap className="h-4 w-4 text-amber-500" />
                  <span className="text-[10px] font-black uppercase text-slate-700 italic">Pre-Validación MCP Activa</span>
               </div>
               <div className="h-4 w-px bg-slate-100" />
               <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <span className="text-[10px] font-black uppercase text-slate-700 italic">Insights por Gemma 4</span>
               </div>
               <div className="h-4 w-px bg-slate-100" />
               <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-rose-500 animate-pulse" />
                  <span className="text-[10px] font-black uppercase text-slate-700 italic">Detección de Bloqueos Activos</span>
               </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* IA Side-Panel (Insight Panel) */}
      <Sheet open={isInsightOpen} onOpenChange={setIsInsightOpen}>
        <SheetContent className="w-[450px] sm:max-w-[450px] border-none shadow-[-20px_0_50px_rgba(0,0,0,0.1)] rounded-l-[3rem] p-0 overflow-hidden bg-white/95 backdrop-blur-2xl">
          <div className="h-full flex flex-col">
            <div className="h-2 bg-gradient-to-r from-primary via-indigo-500 to-rose-500 w-full" />
            
            <div className="p-10 flex-1 overflow-y-auto space-y-10">
              <SheetHeader className="text-left space-y-4">
                <div className="h-16 w-16 rounded-[1.5rem] bg-primary/10 flex items-center justify-center mb-2">
                  <Sparkles className="h-8 w-8 text-primary" />
                </div>
                <div>
                  <SheetTitle className="text-3xl font-black uppercase tracking-tight">Análisis de IA</SheetTitle>
                  <SheetDescription className="text-xs font-bold uppercase tracking-widest text-muted-foreground mt-1">
                    Predicción de Impacto Operativo • Gemma 4
                  </SheetDescription>
                </div>
              </SheetHeader>

              {isAnalyzing ? (
                <div className="py-20 flex flex-col items-center justify-center space-y-4">
                  <Loader2 className="h-10 w-10 animate-spin text-primary" />
                  <p className="text-[10px] font-black uppercase text-slate-400 animate-pulse tracking-widest">Analizando dependencias de planta...</p>
                </div>
              ) : (
                <AnimatePresence>
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-10"
                  >
                    {/* IA Report Card */}
                    <div className="p-8 rounded-[2rem] bg-slate-900 text-white shadow-2xl relative overflow-hidden">
                      <div className="relative z-10 flex items-start gap-4">
                        <div className="h-10 w-10 shrink-0 rounded-2xl bg-white/10 flex items-center justify-center">
                          <Zap className="h-5 w-5 text-amber-400" />
                        </div>
                        <div className="space-y-3">
                          <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-400">Diagnóstico de Gemma</h4>
                          <p className="text-sm font-medium leading-relaxed text-slate-200">
                             "{insightData?.text}"
                          </p>
                        </div>
                      </div>
                      <div className="absolute top-0 right-0 p-8 opacity-5">
                         <Sparkles className="w-32 h-32" />
                      </div>
                    </div>

                    {/* Team Availability Chart (Visualization) */}
                    <div className="space-y-6">
                      <div className="flex items-center justify-between">
                         <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Disponibilidad del Equipo</h4>
                         <span className="px-3 py-1 bg-emerald-100 text-emerald-700 rounded-full text-[9px] font-black uppercase">Seguro</span>
                      </div>
                      <div className="grid grid-cols-7 gap-1">
                        {[1, 2, 3, 4, 5, 2, 2].map((val, i) => (
                          <div key={i} className="space-y-2">
                             <div className="h-24 bg-slate-100 rounded-xl relative overflow-hidden group">
                                <div 
                                  className="absolute bottom-0 left-0 w-full bg-primary/20 group-hover:bg-primary/40 transition-all rounded-t-lg" 
                                  style={{ height: `${(val / 5) * 100}%` }}
                                />
                             </div>
                             <p className="text-[8px] font-black text-center text-slate-400 uppercase">{['L','M','X','J','V','S','D'][i]}</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Physical/Logistics Alert List */}
                    {insightData?.data_snapshot?.employeeAssets?.length > 0 && (
                      <div className="space-y-4">
                        <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Activos Físicos (Bloqueadores)</h4>
                        <div className="grid grid-cols-1 gap-2">
                          {insightData.data_snapshot.employeeAssets.map((asset: any) => (
                            <div key={asset.id} className="p-4 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <div className="h-8 w-8 rounded-lg bg-white shadow-sm flex items-center justify-center">
                                   <Zap className="h-4 w-4 text-amber-500" />
                                </div>
                                <div>
                                  <p className="text-xs font-bold text-slate-900">{asset.name}</p>
                                  <p className="text-[9px] font-black uppercase text-slate-400">{asset.serialNumber}</p>
                                </div>
                              </div>
                              <span className="text-[8px] font-black bg-rose-100 text-rose-600 px-2 py-0.5 rounded-full uppercase">Bloqueador</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Digital Footprint Alert List */}
                    {insightData?.data_snapshot?.digitalAccess?.length > 0 && (
                      <div className="space-y-4">
                        <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Huella Digital (The Vault)</h4>
                        <div className="grid grid-cols-1 gap-2">
                          {insightData.data_snapshot.digitalAccess.map((access: any) => (
                            <div key={access.id} className="p-4 rounded-[1.5rem] bg-indigo-50 border border-indigo-100 flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <div className="h-8 w-8 rounded-lg bg-white shadow-sm flex items-center justify-center">
                                   <Sparkles className="h-4 w-4 text-indigo-500" />
                                </div>
                                <div>
                                  <p className="text-xs font-bold text-slate-900">{access.resource}</p>
                                  <p className="text-[9px] font-black uppercase text-indigo-400">{access.level} • {access.env}</p>
                                </div>
                              </div>
                              <span className="text-[8px] font-black bg-rose-100 text-rose-600 px-2 py-0.5 rounded-full uppercase">Crítico</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Recommendation Badge */}
                    <div className={`p-6 rounded-3xl border-2 shadow-xl flex items-center justify-between ${
                      insightData?.recommendation === 'APROBACIÓN VIABLE' 
                        ? 'bg-emerald-50 border-emerald-100' 
                        : 'bg-rose-50 border-rose-100'
                    }`}>
                      <div className="flex items-center gap-3">
                        {insightData?.recommendation === 'APROBACIÓN VIABLE' 
                          ? <CheckCircle2 className="h-6 w-6 text-emerald-500" />
                          : <AlertCircle className="h-6 w-6 text-rose-500" />
                        }
                        <span className={`text-xs font-black uppercase ${
                          insightData?.recommendation === 'APROBACIÓN VIABLE' ? 'text-emerald-700' : 'text-rose-700'
                        }`}>
                          {insightData?.recommendation}
                        </span>
                      </div>
                      <Button 
                        size="sm" 
                        className={`rounded-xl h-10 px-6 font-black uppercase text-[9px] ${
                          insightData?.data_snapshot?.hasDigitalRisk ? 'bg-rose-500 hover:bg-rose-600' : 
                          (insightData?.hasLogisticsConflict ? 'bg-amber-500 hover:bg-amber-600' : 'bg-primary')
                        }`}
                      >
                        {insightData?.data_snapshot?.hasDigitalRisk ? 'Aprobar con Handover de Seguridad' : 
                         (insightData?.hasLogisticsConflict ? 'Aprobar con Logística Pendiente' : 'Aprobar')}
                      </Button>
                    </div>
                  </motion.div>
                </AnimatePresence>
              )}
            </div>
            
            <div className="p-8 bg-slate-50 border-t border-slate-100 text-center">
               <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest italic">Análisis Forense Predictivo Volkern v2.0</p>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}

function CheckCircle2(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  )
}
