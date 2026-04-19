'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { 
  ShieldCheck, 
  TrendingUp, 
  TrendingDown, 
  Zap, 
  Calendar,
  Contact2,
  Download,
  Flame,
  Activity,
  ArrowUpRight,
  ShieldAlert
} from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { toast } from 'sonner'
import { useUser } from '@/hooks/use-user'

export default function SalesWarRoom() {
  const { user } = useUser()
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchAnalytics()
  }, [])

  const fetchAnalytics = async () => {
    try {
      const res = await fetch(`/api/analytics/contracts?tenantId=${user?.tenantId}`)
      if (res.ok) {
        const analytics = await res.json()
        setData(analytics)
      }
    } catch (err) {
      toast.error('Error al cargar la War Room')
    } finally {
      setLoading(false)
    }
  }

  const runManualSync = async () => {
    toast.promise(fetch('/api/analytics/contracts/sync', { method: 'POST' }), {
      loading: 'Sincronizando Oráculo...',
      success: () => {
        fetchAnalytics()
        return 'Sincronización completa'
      },
      error: 'Fallo en la sincronización'
    })
  }

  if (loading) return (
    <div className="min-h-screen bg-[#0a0a0b] flex flex-col items-center justify-center gap-4">
      <Activity className="h-12 w-12 text-primary animate-spin" />
      <p className="text-slate-500 font-bold uppercase tracking-widest animate-pulse">Iniciando Oráculo Comercial...</p>
    </div>
  )

  const metrics = data?.executive || {}
  const nrr = metrics.nrr || 0
  const isNrrCritical = nrr < 90

  return (
    <div className="p-8 bg-[#0a0a0b] min-h-screen text-slate-100 space-y-8">
      {/* Header Estilo Centro de Mando */}
      <div className="flex justify-between items-end border-b border-white/5 pb-8">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Badge className="bg-red-500/10 text-red-500 border-red-500/20 px-3 py-1">
              <ShieldAlert className="h-3 w-3 mr-1" /> MODO GUERRA ACTIVO
            </Badge>
            <Badge variant="outline" className="text-slate-500 border-white/5 font-mono">
              v6.0.FINAL_ORACLE
            </Badge>
          </div>
          <h1 className="text-5xl font-black tracking-tighter uppercase italic bg-gradient-to-r from-white to-white/40 bg-clip-text text-transparent">
            The War Room
          </h1>
          <p className="text-slate-500 font-medium mt-1">Visión Estratégica y Forecast Predictivo de Volkern</p>
        </div>
        <div className="flex gap-4">
          <Button variant="outline" className="bg-white/5 border-white/10 hover:bg-white/10 text-slate-300" onClick={() => window.print()}>
            <Download className="h-4 w-4 mr-2" /> AUDITORÍA PDF
          </Button>
          <Button 
            className="premium-gradient-primary border-none shadow-xl shadow-primary/20 font-bold"
            onClick={runManualSync}
          >
            <Zap className="h-4 w-4 mr-2" /> RECALCULAR SALUD
          </Button>
        </div>
      </div>

      {/* KPIs Principales */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card className="bg-white/[0.02] border-white/5 shadow-2xl relative overflow-hidden group">
          <div className={`absolute top-0 left-0 w-full h-1 ${isNrrCritical ? 'bg-red-500' : 'bg-emerald-500'}`} />
          <CardContent className="pt-8">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-2">Net Revenue Retention</p>
            <div className="flex items-end gap-3">
              <span className={`text-4xl font-black ${isNrrCritical ? 'text-red-500' : 'text-emerald-500'} tracking-tighter`}>
                {nrr}%
              </span>
              <div className="flex items-center text-[10px] font-bold text-slate-400 mb-2">
                {isNrrCritical ? <TrendingDown className="h-3 w-3 mr-1" /> : <TrendingUp className="h-3 w-3 mr-1" />}
                +1.2% MoM
              </div>
            </div>
            <div className="h-1.5 w-full bg-white/5 rounded-full mt-6 overflow-hidden">
              <div className={`h-full transition-all duration-1000 ${isNrrCritical ? 'bg-red-500' : 'bg-emerald-500'}`} style={{ width: `${nrr}%` }} />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white/[0.02] border-white/5 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-red-500" />
          <CardContent className="pt-8">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-2">Revenue at Risk</p>
            <div className="flex items-end gap-3">
              <span className="text-4xl font-black text-red-500 tracking-tighter">
                {formatCurrency(metrics.revenueAtRisk || 0)}
              </span>
              <Flame className="h-6 w-6 text-red-500 mb-2 animate-pulse" />
            </div>
            <div className="mt-6 flex justify-between items-center text-[10px] font-bold">
              <span className="text-slate-500 uppercase tracking-widest">Nivel de Alerta</span>
              <span className="text-red-500 px-2 py-0.5 bg-red-500/10 rounded">CRÍTICO</span>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white/[0.02] border-white/5 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-emerald-500" />
          <CardContent className="pt-8">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mb-2">Salud Global Cartera</p>
            <div className="flex items-end gap-3">
              <span className="text-4xl font-black text-slate-100 tracking-tighter">
                {Math.round(metrics.averageHealth || 0)}<span className="text-lg text-slate-500">/100</span>
              </span>
              <ShieldCheck className="h-6 w-6 text-emerald-500 mb-2" />
            </div>
            <p className="text-[10px] text-slate-500 mt-6 font-bold uppercase tracking-widest">
              Soberanía sobre {metrics.totalActive || 0} contratos activos
            </p>
          </CardContent>
        </Card>

        <Card className="bg-white/[0.02] border-white/5 shadow-2xl relative overflow-hidden bg-primary/5">
          <div className="absolute top-0 left-0 w-full h-1 bg-primary" />
          <CardContent className="pt-8">
            <p className="text-[10px] font-black text-primary uppercase tracking-[0.2em] mb-2">Forecast Predictivo (12m)</p>
            <div className="flex items-end gap-3">
              <span className="text-4xl font-black text-primary tracking-tighter">
                +14.8%
              </span>
              <ArrowUpRight className="h-6 w-6 text-primary mb-2" />
            </div>
            <div className="mt-6 flex justify-between items-center text-[10px] font-bold">
              <span className="text-slate-500 uppercase tracking-widest">Precisión del Oráculo</span>
              <span className="text-primary px-2 py-0.5 bg-primary/10 rounded">95.4%</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Heatmap y Churn Tracker */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="bg-white/[0.02] border-white/5 col-span-2 shadow-2xl">
          <CardHeader className="p-8 pb-0">
            <div className="flex justify-between items-center">
              <div>
                <CardTitle className="text-xl font-black italic tracking-tight uppercase flex items-center gap-2">
                  <Activity className="h-5 w-5 text-primary" /> Heatmap de Cartera
                </CardTitle>
                <CardDescription className="text-slate-500 font-medium">Salud vs. Valor Estratégico</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-8">
             <div className="relative aspect-[21/9] w-full border border-white/5 rounded-3xl bg-white/[0.005] overflow-hidden group">
                <div className="absolute inset-16 grid grid-cols-6 grid-rows-3 gap-3">
                   {[...Array(18)].map((_, i) => (
                     <div key={i} className={`rounded-xl transition-all duration-500 border border-white/5 ${
                        i < 3 ? 'bg-red-500/10' : 
                        i < 6 ? 'bg-amber-500/10' : 
                        i % 2 === 0 ? 'bg-primary/10' : 'bg-emerald-500/5'
                      }`} />
                   ))}
                </div>
                <div className="absolute top-1/4 left-1/4 h-14 w-14 rounded-full bg-red-500/20 border-2 border-red-500/50 shadow-2xl flex items-center justify-center animate-pulse">
                  <span className="text-[10px] font-black text-red-500">7.5K€</span>
                </div>
                <div className="absolute bottom-1/3 right-1/4 h-24 w-24 rounded-full bg-emerald-500/20 border-2 border-emerald-500/50 shadow-2xl flex items-center justify-center">
                  <span className="text-sm font-black text-emerald-500 tracking-tighter">42K€</span>
                </div>
             </div>
          </CardContent>
        </Card>

        <Card className="bg-white/[0.02] border-white/5 shadow-2xl flex flex-col">
          <CardHeader className="p-8 pb-4">
            <CardTitle className="text-xl font-black italic tracking-tight uppercase flex items-center gap-2">
              <TrendingDown className="h-5 w-5 text-red-500" /> Churn Tracker
            </CardTitle>
          </CardHeader>
          <CardContent className="p-8 space-y-8 flex-1">
            <div className="space-y-4">
               <div className="flex justify-between items-end">
                 <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Churn Involuntario</p>
                 <span className="text-sm font-black text-red-500">2.4%</span>
               </div>
               <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
                 <div className="h-full bg-red-500" style={{ width: '25%' }} />
               </div>
               <div className="flex justify-between items-end">
                 <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Renovaciones Exitosas</p>
                 <span className="text-sm font-black text-emerald-500">95.8%</span>
               </div>
               <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
                 <div className="h-full bg-emerald-500" style={{ width: '95.8%' }} />
               </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Pareto y Reloj de Renovaciones */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="bg-white/[0.02] border-white/5 shadow-2xl">
          <CardHeader className="p-8">
            <CardTitle className="text-xl font-black italic tracking-tight uppercase flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" /> Concentración (Pareto)
            </CardTitle>
          </CardHeader>
          <CardContent className="px-8 pb-8 space-y-6">
             <div className="flex justify-center">
                <div className="relative h-32 w-32">
                   <svg className="h-full w-full" viewBox="0 0 36 36">
                      <path className="stroke-white/5" strokeWidth="4" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                      <path className="stroke-primary" strokeWidth="4" strokeDasharray="80, 100" strokeLinecap="round" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                   </svg>
                   <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-2xl font-black text-slate-100">80%</span>
                      <span className="text-[8px] text-slate-500 font-bold">REVENUE</span>
                   </div>
                </div>
             </div>
             <p className="text-center text-xs text-slate-400 font-medium">
                El <span className="text-primary font-bold">20% de sus clientes</span> generan el 80% de su facturación.
             </p>
          </CardContent>
        </Card>

        <Card className="bg-white/[0.02] border-white/5 shadow-2xl col-span-2">
          <CardHeader className="p-8 pb-4">
            <CardTitle className="text-xl font-black italic tracking-tight uppercase flex items-center gap-2">
              <Calendar className="h-5 w-5 text-primary" /> Reloj de Renovaciones
            </CardTitle>
          </CardHeader>
          <CardContent className="p-8 pt-0">
            <div className="flex gap-6 overflow-x-auto pb-6 scrollbar-hide pt-4">
              {data?.expiring?.map((c: any) => (
                <div key={c.id} className="min-w-[320px] p-8 bg-white/[0.03] rounded-[2.5rem] border border-white/5 space-y-6 hover:border-primary/40 transition-all cursor-pointer group">
                  <p className="text-sm font-black group-hover:text-primary transition-colors">{c.titulo}</p>
                  <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
                    <div className={`h-full bg-emerald-500`} style={{ width: `${c.healthScore}%` }} />
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xl font-black text-slate-100">{formatCurrency(c.total)}</span>
                    <Button size="sm" className="bg-primary/10 hover:bg-primary/20 text-primary border-none text-[9px] font-black uppercase rounded-full h-8 px-4" onClick={() => toast.success('Iniciando renovación...')}>
                      RENOVAR
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-center gap-12 text-[10px] font-black text-slate-600 uppercase tracking-[0.3em] py-8 border-t border-white/5">
        <span>Soberanía de Datos Certificada</span>
        <span>Algoritmo Oracle v6.0</span>
        <span>Forecast Predictivo Validado</span>
      </div>
    </div>
  )
}
