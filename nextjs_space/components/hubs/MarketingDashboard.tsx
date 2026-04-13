import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { 
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, ResponsiveContainer, XAxis, YAxis, Tooltip, Legend 
 } from 'recharts'
import { Loader2 } from 'lucide-react'

export function MarketingDashboard() {
  const [metrics, setMetrics] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/analytics/campaigns')
      .then(res => res.json())
      .then(data => {
        setMetrics(data)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary opacity-20" />
      </div>
    )
  }
  
  // Mapeo de datos reales
  const totalEnviados = metrics?.totalEnviados || 0
  const totalConversiones = metrics?.totalConversiones || 0
  const roiPromedio = metrics?.roiPromedio || 0
  const seriesData = metrics?.evolucionPorDia || []
  const channelsData = seriesData.length > 0 ? seriesData.map((d: any) => ({
    name: d.fecha,
    enviados: d.enviados,
    conversiones: d.conversiones
  })) : []

  const pieData = metrics?.campanaPorCanal?.map((c: any) => ({
    name: c.canal,
    value: c.enviados,
    color: c.canal === 'email' ? '#3b82f6' : c.canal === 'whatsapp' ? '#22c55e' : '#8b5cf6'
  })) || []

  const KPICard = ({ title, value, prevValue, prevDiff, prevYearDiff, children }: any) => (
    <Card className="border shadow-sm bg-white overflow-hidden flex flex-col h-[260px] relative rounded-lg">
      <CardHeader className="pb-0 pt-4 px-6 border-b border-transparent">
        <CardTitle className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">{title}</CardTitle>
        <div className="text-4xl font-light text-slate-800 mt-2">{value}</div>
      </CardHeader>
      <CardContent className="p-0 flex-1 relative flex flex-col justify-end">
        <div className="h-28 w-full">
          {children}
        </div>
      </CardContent>
      <div className="p-4 flex justify-between items-center text-xs border-t border-slate-100 bg-white z-10 w-full shrink-0">
         <div className="flex flex-col">
            <span className="text-slate-400">Previous period</span>
            <span className={prevDiff.includes('-') ? "text-red-500 font-bold" : "text-emerald-500 font-bold"}>{prevDiff}</span>
         </div>
         <div className="flex flex-col text-right">
            <span className="text-slate-400">Previous year</span>
            <span className={prevYearDiff.includes('-') ? "text-red-500 font-bold" : "text-emerald-500 font-bold"}>{prevYearDiff}</span>
         </div>
      </div>
    </Card>
  )

  return (
    <div className="space-y-6">
      
      {/* 4 KPI Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
        
        <KPICard title="TOTAL ENVIADOS" value={totalEnviados.toLocaleString()} prevDiff="—" prevYearDiff="—">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={seriesData} margin={{ top: 10, right: 0, left: 0, bottom: 0 }}>
              <Bar dataKey="enviados" fill="#3b82f6" radius={[2, 2, 0, 0]} barSize={20} />
            </BarChart>
          </ResponsiveContainer>
        </KPICard>

        <KPICard title="CAMP. ACTIVAS" value={metrics?.campanasActivas || 0} prevDiff="—" prevYearDiff="—">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={seriesData} margin={{ top: 5, right: 0, left: 0, bottom: 0 }}>
              <defs>
                  <linearGradient id="bounceFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#34d399" stopOpacity={0.6}/>
                      <stop offset="100%" stopColor="#34d399" stopOpacity={0.2}/>
                  </linearGradient>
              </defs>
              <Area type="monotone" dataKey="enviados" stroke="#10b981" strokeWidth={2} fill="url(#bounceFill)" isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </KPICard>

        <KPICard title="CONVERSIONES" value={totalConversiones.toLocaleString()} prevDiff="—" prevYearDiff="—">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={seriesData} margin={{ top: 10, right: 0, left: 0, bottom: 0 }}>
              <Bar dataKey="conversiones" fill="#f59e0b" radius={[2, 2, 0, 0]} barSize={20} />
            </BarChart>
          </ResponsiveContainer>
        </KPICard>

        <KPICard title="ROI PROMEDIO" value={`${roiPromedio.toFixed(1)}%`} prevDiff="—" prevYearDiff="—">
           <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={seriesData} margin={{ top: 5, right: 0, left: 0, bottom: 0 }}>
              <defs>
                  <linearGradient id="flatFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.8}/>
                      <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0.4}/>
                  </linearGradient>
              </defs>
              <Area type="monotone" dataKey="conversiones" stroke="#8b5cf6" strokeWidth={2} fill="url(#flatFill)" isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </KPICard>

      </div>

      {/* Main Stacked Bar Chart - Top Channels */}
      <Card className="border shadow-sm p-6 relative rounded-lg">
        <CardTitle className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-6">EVOLUCIÓN DE CAMPAÑAS</CardTitle>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={seriesData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <XAxis dataKey="fecha" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b' }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b' }} />
              <Tooltip cursor={{fill: 'transparent'}} />
              <Area type="monotone" dataKey="enviados" name="Enviados" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.1} />
              <Area type="monotone" dataKey="conversiones" name="Conversiones" stroke="#10b981" fill="#10b981" fillOpacity={0.1} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Bottom Data Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        <Card className="border shadow-sm flex flex-col h-[320px] rounded-lg">
            <CardHeader className="pb-2 pt-6 px-6">
                <CardTitle className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">TOTAL CAMPAÑAS</CardTitle>
                <div className="text-5xl font-light text-slate-800 mt-2">{metrics?.totalCampanas || 0}</div>
            </CardHeader>
            <CardContent className="p-0 flex-1 relative flex flex-col justify-end">
                <div className="h-32 w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={seriesData} margin={{ top: 5, right: 0, left: 0, bottom: 0 }}>
                    <defs>
                        <linearGradient id="newUserFill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.4}/>
                            <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.1}/>
                        </linearGradient>
                    </defs>
                    <Area type="monotone" dataKey="enviados" stroke="#3b82f6" strokeWidth={2} fill="url(#newUserFill)" />
                    </AreaChart>
                </ResponsiveContainer>
                </div>
            </CardContent>
            <div className="p-4 flex justify-between items-center text-xs border-t border-slate-100 bg-slate-50/50">
                <div className="flex flex-col">
                    <span className="text-slate-400">Estado</span>
                    <span className="text-blue-500 font-bold">Consolidado</span>
                </div>
                <div className="flex flex-col text-right">
                    <span className="text-slate-400">Periodo</span>
                    <span className="text-emerald-500 font-bold">Últimos 30 días</span>
                </div>
            </div>
        </Card>

        <Card className="lg:col-span-2 border shadow-sm p-6 h-[320px] rounded-lg flex flex-col">
          <CardTitle className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-6">ENGAGEMENT POR CANAL</CardTitle>
          <div className="flex-1 flex items-center justify-between">
             
             <div className="w-[35%] h-full flex items-center justify-center -ml-8">
                <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                        <Pie
                            data={pieData}
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={80}
                            fill="#8884d8"
                            paddingAngle={5}
                            dataKey="value"
                            stroke="none"
                        >
                            {pieData.map((entry: any, index: number) => (
                              <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                        </Pie>
                        <Tooltip />
                    </PieChart>
                </ResponsiveContainer>
             </div>

             <div className="w-[65%] h-full overflow-y-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="border-b text-slate-500 pb-2">
                           <th className="text-left font-bold py-2">Canal</th>
                           <th className="text-right font-bold py-2">Enviados</th>
                           <th className="text-right font-bold py-2">ROI</th>
                        </tr>
                    </thead>
                    <tbody>
                        {metrics?.campanaPorCanal?.map((c: any, idx: number) => (
                            <tr key={idx} className="border-b border-slate-50 last:border-0 hover:bg-slate-50 transition-colors">
                                <td className="py-2 flex items-center gap-3 text-xs uppercase font-bold">
                                   {c.canal}
                                </td>
                                <td className="py-2 text-right font-bold text-slate-800">
                                   {c.enviados.toLocaleString()}
                                </td>
                                <td className="py-2 text-right font-bold text-emerald-600">
                                   {c.tasaConversion.toFixed(1)}%
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
             </div>
          </div>
        </Card>

      </div>
    </div>
  )
}
