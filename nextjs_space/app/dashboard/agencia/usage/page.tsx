'use client'

import { useState, useEffect } from 'react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { 
  Cpu, 
  History, 
  Activity,
  Zap,
  MousePointer2,
  PieChart
} from 'lucide-react'
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Cell
} from 'recharts'

export default function AgencyUsagePage() {
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<any>(null)

  useEffect(() => {
    fetch('/api/v1/agency/analytics/usage')
      .then(res => res.json())
      .then(json => {
        if (json.success) {
          setData(json)
        }
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  if (loading) return <div className="p-8 text-center text-muted-foreground animate-pulse">Analizando consumo global...</div>

  const COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444']

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight uppercase italic text-[#1A365D]">Métricas de Uso</h1>
          <p className="text-muted-foreground font-bold text-xs uppercase tracking-widest opacity-60">Consumo agregado de IA y Recursos</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="bg-[#1A365D] text-white border-none shadow-xl rounded-3xl overflow-hidden relative group">
           <Zap className="absolute top-[-10px] right-[-10px] h-32 w-32 opacity-10 group-hover:rotate-12 transition-transform duration-700" />
           <CardContent className="pt-8 relative z-10">
              <p className="text-[10px] font-black text-white/50 uppercase tracking-widest mb-1">Total IA Calls</p>
              <h2 className="text-5xl font-black tracking-tighter">{data?.stats?.totalCalls || 0}</h2>
              <p className="text-[10px] font-bold text-white/40 mt-4 uppercase">Consumo de todos los slots</p>
           </CardContent>
        </Card>

        <Card className="bg-white border-primary/10 shadow-lg rounded-3xl">
           <CardContent className="pt-8">
              <div className="flex items-center gap-3 mb-4">
                 <div className="p-3 bg-indigo-50 rounded-2xl text-indigo-600">
                    <Cpu size={24} />
                 </div>
                 <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">Skills más usados</p>
                    <h2 className="text-2xl font-black text-[#1A365D] tracking-tight">{data?.stats?.breakdown?.[0]?.skill || 'N/A'}</h2>
                 </div>
              </div>
              <div className="flex items-center justify-between mt-6">
                 <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Actividad IA</span>
                 <span className="text-xs font-black text-indigo-600">Health: Excellent</span>
              </div>
           </CardContent>
        </Card>

        <Card className="bg-white border-primary/10 shadow-lg rounded-3xl">
           <CardContent className="pt-8">
              <div className="flex items-center gap-3 mb-4">
                 <div className="p-3 bg-emerald-50 rounded-2xl text-emerald-600">
                    <Activity size={24} />
                 </div>
                 <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">Promedio por Slot</p>
                    <h2 className="text-2xl font-black text-[#1A365D] tracking-tight">
                       {data?.stats?.totalSlots > 0 ? Math.round(data.stats.totalCalls / data.stats.totalSlots) : 0} calls
                    </h2>
                 </div>
              </div>
              <div className="flex items-center justify-between mt-6">
                 <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Saturación</span>
                 <span className="text-xs font-black text-emerald-600">Baja</span>
              </div>
           </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
         <Card className="border-primary/10 shadow-xl rounded-[2.5rem] overflow-hidden">
            <CardHeader className="bg-slate-50/50 p-8 border-b border-slate-100">
               <CardTitle className="text-xl font-black text-[#1A365D] uppercase tracking-tighter flex items-center gap-2">
                  <PieChart size={20} /> Distribución de Habilidades
               </CardTitle>
               <CardDescription className="text-xs font-bold text-slate-400 uppercase tracking-widest">Uso de herramientas por IA Gemma</CardDescription>
            </CardHeader>
            <CardContent className="p-8 h-80">
               <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data?.stats?.breakdown || []}>
                     <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                     <XAxis 
                       dataKey="skill" 
                       axisLine={false} 
                       tickLine={false} 
                       tick={{ fontSize: 10, fontWeight: 'bold', fill: '#94a3b8' }} 
                     />
                     <YAxis 
                       axisLine={false} 
                       tickLine={false} 
                       tick={{ fontSize: 10, fontWeight: 'bold', fill: '#94a3b8' }} 
                     />
                     <Tooltip 
                       cursor={{ fill: '#f8fafc' }}
                       contentStyle={{ 
                         borderRadius: '16px', 
                         border: 'none', 
                         boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)',
                         fontSize: '12px'
                       }} 
                     />
                     <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                        {data?.stats?.breakdown?.map((entry: any, index: number) => (
                           <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                     </Bar>
                  </BarChart>
               </ResponsiveContainer>
            </CardContent>
         </Card>

         <Card className="border-primary/10 shadow-xl rounded-[2.5rem] overflow-hidden">
            <CardHeader className="bg-slate-50/50 p-8 border-b border-slate-100">
               <CardTitle className="text-xl font-black text-[#1A365D] uppercase tracking-tighter flex items-center gap-2">
                  <History size={20} /> Actividad en Tiempo Real
               </CardTitle>
               <CardDescription className="text-xs font-bold text-slate-400 uppercase tracking-widest">Logs recientes de ejecución en Slots</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
               <div className="divide-y divide-slate-50">
                  {data?.recentLogs?.map((log: any) => (
                     <div key={log.id} className="p-6 flex items-center justify-between hover:bg-slate-50/80 transition-colors">
                        <div className="flex items-center gap-4">
                           <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
                              <MousePointer2 size={16} />
                           </div>
                           <div>
                              <p className="text-sm font-black text-[#1A365D] uppercase tracking-tight">{log.skill}</p>
                              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">En: {log.tenant}</p>
                           </div>
                        </div>
                        <div className="text-right">
                           <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                              {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                           </p>
                           <Badge variant="outline" className="text-[9px] border-emerald-100 bg-emerald-50 text-emerald-600 font-black uppercase">Success</Badge>
                        </div>
                     </div>
                  ))}
                  {!data?.recentLogs?.length && (
                    <div className="p-20 text-center text-slate-300 font-black uppercase tracking-widest text-xs">Sin actividad detectada</div>
                  )}
               </div>
            </CardContent>
         </Card>
      </div>
    </div>
  )
}
