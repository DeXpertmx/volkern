'use client'

import { useState, useEffect, useMemo } from 'react'
import { Sparkles, Zap, Users, ShieldCheck, Loader2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { motion, AnimatePresence } from 'framer-motion'
import useSWR from 'swr'
import debounce from 'lodash.debounce'

const fetcher = (url: string) => fetch(url).then(res => res.json())

export function IATeamAnalytics() {
  const [analysis, setAnalysis] = useState<string>('Analizando patrones del equipo en Dimension eXpert...')
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  
  // Realizar fetch de datos generales para el widget
  const { data: vacations } = useSWR('/api/erp/hr/vacations', fetcher)
  const { data: employees } = useSWR('/api/erp/hr/employees', fetcher)

  // Simular análisis regenerativo cuando cambian los datos
  useEffect(() => {
    if (!vacations || !employees) return;
    
    setIsAnalyzing(true)
    const timer = setTimeout(() => {
      const pendingCount = vacations.filter((v: any) => v.status === 'PENDING').length
      setAnalysis(`Gemma detectó ${pendingCount} solicitudes de ausencia pendientes. La capacidad operativa se mantiene al 92%. No se detectan cuellos de botella críticos para la próxima semana.`)
      setIsAnalyzing(false)
    }, 1500)

    return () => clearTimeout(timer)
  }, [vacations, employees])

  // Mini-gráfico de disponibilidad (Simulado con 7 días)
  const availabilityData = [5, 5, 4, 3, 5, 2, 2]; // Empleados disponibles por día

  return (
    <Card className="h-full border-none shadow-2xl bg-slate-900 text-white rounded-[2rem] overflow-hidden flex flex-col">
      <CardHeader className="drag-handle pb-4 shrink-0">
        <div className="flex items-center justify-between">
          <div className="h-10 w-10 rounded-xl bg-white/10 flex items-center justify-center">
            <Sparkles className="h-5 w-5 text-primary" />
          </div>
          <div className="px-3 py-1 bg-primary/20 rounded-full border border-primary/30">
            <span className="text-[9px] font-black uppercase text-primary tracking-widest">Gemma 4 Activa</span>
          </div>
        </div>
        <CardTitle className="text-xl font-black uppercase tracking-tight mt-4 flex items-center gap-2">
          IA Team Analytics
        </CardTitle>
        <CardDescription className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
          Diagnóstico Adaptativo de Disponibilidad
        </CardDescription>
      </CardHeader>
      
      <CardContent className="flex-1 space-y-6 overflow-y-auto scrollbar-hide py-2">
        <div className="relative p-6 rounded-2xl bg-white/5 border border-white/10">
          <AnimatePresence mode="wait">
            {isAnalyzing ? (
              <motion.div 
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex items-center gap-3"
              >
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <span className="text-xs font-medium text-slate-400">Sincronizando con The Vault...</span>
              </motion.div>
            ) : (
              <motion.div
                key="content"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-3"
              >
                <div className="flex items-center gap-2">
                  <Zap className="h-3 w-3 text-amber-400" />
                  <span className="text-[9px] font-black uppercase text-amber-400 tracking-widest">Insight de hoy</span>
                </div>
                <p className="text-sm font-medium leading-relaxed italic">
                  "{analysis}"
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-[9px] font-black uppercase tracking-widest text-slate-500">Disponibilidad de Planta (7d)</h4>
            <div className="flex items-center gap-1">
              <Users className="h-3 w-3 text-emerald-400" />
              <span className="text-[9px] font-black text-emerald-400">OPTIMO</span>
            </div>
          </div>
          
          <div className="grid grid-cols-7 gap-2">
            {availabilityData.map((val, i) => (
              <div key={i} className="space-y-2">
                <div className="h-16 bg-white/5 rounded-lg relative overflow-hidden group">
                  <motion.div 
                    initial={{ height: 0 }}
                    animate={{ height: `${(val / 5) * 100}%` }}
                    className="absolute bottom-0 left-0 w-full bg-primary/40 group-hover:bg-primary/60 transition-all rounded-t-sm"
                  />
                </div>
                <p className="text-[8px] font-black text-center text-slate-500 uppercase">{['L','M','X','J','V','S','D'][i]}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="pt-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-emerald-500" />
            <span className="text-[9px] font-black uppercase text-slate-400">Soberanía Industrial OK</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
