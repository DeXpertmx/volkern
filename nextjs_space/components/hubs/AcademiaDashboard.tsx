import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { GraduationCap, BookOpen, Users, Trophy, Loader2, DollarSign, TrendingUp, Presentation, ArrowUpRight } from 'lucide-react'
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from 'recharts'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { LivingPlaybook } from '@/components/training/LivingPlaybook'
import { TrainingLeaderboard } from '@/components/analytics/TrainingLeaderboard'

export function AcademiaDashboard() {
  const [metrics, setMetrics] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/analytics/courses')
      .then(res => res.json())
      .then(data => {
        setMetrics(data)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 animate-pulse">
        {[1, 2, 3, 4].map(i => <div key={i} className="h-32 bg-muted rounded-3xl" />)}
      </div>
    )
  }

  const totalInscripciones = metrics?.totalInscripciones || 0
  const ingresoTotal = metrics?.cursosMasPopulares?.reduce((sum: number, c: any) => sum + (c.ingresoTotal || 0), 0) || 0

  return (
    <div className="space-y-6">
      {/* KPIs Principales */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="rounded-3xl border-none shadow-lg bg-gradient-to-br from-emerald-600 to-emerald-800 text-white transform hover:-translate-y-1 transition-all duration-300">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-bold uppercase tracking-widest opacity-80 flex items-center gap-2">
              <Users className="h-4 w-4" />
              Estudiantes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-black tracking-tight">{metrics?.totalEstudiantes?.toLocaleString() || 0}</div>
            <div className="text-[11px] font-bold mt-2 opacity-90 flex items-center gap-1 bg-white/20 w-max px-2 py-0.5 rounded-full">
              <TrendingUp className="h-3 w-3" /> Total Inscritos
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-3xl border-none shadow-lg bg-white border border-border/50 hover:shadow-xl transition-all duration-300">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-blue-500" />
              Cursos Activos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-black text-foreground tracking-tight">{metrics?.totalCursos || 0}</div>
            <div className="text-[11px] font-bold mt-2 text-blue-600 flex items-center gap-1 bg-blue-100 w-max px-2 py-0.5 rounded-full">
              <Presentation className="h-3 w-3" /> Contenido Curado
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-3xl border-none shadow-lg bg-white border border-border/50 hover:shadow-xl transition-all duration-300 text-slate-900">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
              <Trophy className="h-4 w-4 text-orange-500" />
              Finalización
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-black tracking-tight">{metrics?.tasaCompletado?.toFixed(1) || 0}%</div>
            <div className="flex items-center gap-2 mt-2">
                <Progress value={metrics?.tasaCompletado || 0} className="h-2 bg-orange-100" />
                <span className="text-[10px] font-bold text-orange-600 uppercase">Tasa de Egreso</span>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-3xl border-none shadow-lg bg-slate-950 text-white hover:shadow-2xl transition-all duration-300">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-bold uppercase tracking-widest opacity-80 flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-emerald-400" />
              Revenue Total
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-black tracking-tight">${ingresoTotal.toLocaleString()}</div>
            <div className="text-[11px] font-bold mt-2 text-emerald-400 uppercase flex items-center gap-1 bg-emerald-400/20 w-max px-2 py-0.5 rounded-full">
               PROFIT ACADEMIA
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Gráfico de Inscripciones */}
        <Card className="xl:col-span-2 rounded-3xl border-none shadow-xl bg-background overflow-hidden relative">
            <CardHeader className="pb-0 pt-6 px-6">
                <CardTitle className="text-lg font-black tracking-tighter">Tendencia de Inscripciones</CardTitle>
                <CardDescription>Nuevos alumnos inscritos en los últimos 30 días</CardDescription>
            </CardHeader>
            <CardContent className="p-0 h-[320px]">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={metrics?.inscripcionesPorDia || []} margin={{ top: 20, right: 0, left: 0, bottom: 0 }}>
                        <defs>
                            <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                                <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                            </linearGradient>
                        </defs>
                        <CartGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis 
                          dataKey="fecha" 
                          axisLine={false} 
                          tickLine={false} 
                          tick={{ fontSize: 10, fill: '#94a3b8' }} 
                        />
                        <YAxis hide />
                        <Tooltip 
                          contentStyle={{ borderRadius: '1rem', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                        />
                        <Area type="monotone" dataKey="count" name="Alumnos" stroke="#10b981" fillOpacity={1} fill="url(#colorCount)" strokeWidth={4} />
                    </AreaChart>
                </ResponsiveContainer>
            </CardContent>
        </Card>

        {/* Cursos más Populares */}
        <Card className="rounded-3xl border-none shadow-xl bg-white flex flex-col h-full overflow-hidden">
            <CardHeader className="bg-slate-50 border-b border-border/50 pb-4">
                <CardTitle className="text-md font-bold flex items-center gap-2 text-slate-800">
                    <BookOpen className="h-5 w-5 text-primary" /> 
                    Cursos Top Performer
                </CardTitle>
            </CardHeader>
            <CardContent className="p-0 flex-1 overflow-auto">
                <div className="divide-y divide-border/50">
                    {metrics?.cursosMasPopulares?.length > 0 ? metrics.cursosMasPopulares.slice(0, 5).map((curso: any, i: number) => (
                        <div key={i} className="p-4 hover:bg-slate-50 transition-all flex items-center gap-4 group">
                            <div className="h-10 w-10 bg-slate-100 rounded-xl flex items-center justify-center font-black text-slate-400 group-hover:bg-primary/20 group-hover:text-primary transition-colors">
                                {i + 1}
                            </div>
                            <div className="flex-1 min-w-0">
                                <h4 className="font-bold text-sm text-slate-800 truncate">{curso.titulo}</h4>
                                <div className="flex items-center gap-2 mt-0.5">
                                    <Badge variant="secondary" className="text-[10px] py-0">{curso.inscripciones} alumnos</Badge>
                                    <span className="text-[10px] text-emerald-600 font-bold">${curso.ingresoTotal.toLocaleString()}</span>
                                </div>
                            </div>
                            <ArrowUpRight className="h-4 w-4 text-slate-300 group-hover:text-primary transition-colors" />
                        </div>
                    )) : (
                      <div className="p-12 text-center text-muted-foreground">
                         <Presentation className="h-10 w-10 mx-auto opacity-10 mb-2" />
                         <p className="text-sm">Sin datos de cursos</p>
                      </div>
                    )}
                </div>
            </CardContent>
            <div className="p-4 bg-slate-50 border-t border-border/50 text-center">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">BI Intelligence Dashboard</span>
            </div>
        </Card>
      </div>

      {/* Ranking de Cerradores (C5): la parte competitiva del roleplay — el dato existía en la API y nadie lo enseñaba */}
      <div className="pt-8 border-t border-slate-100">
        <h2 className="text-lg font-black tracking-tighter mb-1">Ranking de Cerradores</h2>
        <p className="text-sm text-muted-foreground mb-4">Los mejores cierres del equipo en el simulador de roleplay</p>
        <TrainingLeaderboard />
      </div>

      {/* Living Playbook Section (Harvested by IA) */}
      <div className="pt-8 border-t border-slate-100">
        <LivingPlaybook />
      </div>
    </div>
  )
}

// Auxiliar component for Cartesian Grid fix
function CartGrid(props: any) {
  return <CartesianGrid {...props} />
}
