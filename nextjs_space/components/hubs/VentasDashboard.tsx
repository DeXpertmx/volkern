'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Users, Target, DollarSign, TrendingUp, Calendar, CheckSquare, Clock, Phone, Video, MoreHorizontal, CheckCircle2, Trophy, Bot } from 'lucide-react'
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { TrainingLeaderboard } from '@/components/analytics/TrainingLeaderboard'

export function VentasDashboard() {
  const [metrics, setMetrics] = useState<any>(null)
  const [appointments, setAppointments] = useState<any[]>([])
  const [tasks, setTasks] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true)
      try {
        const [analyticsRes, dashboardRes, tasksRes] = await Promise.all([
          fetch('/api/analytics/dashboard'),
          fetch('/api/dashboard'),
          fetch('/api/tasks?status=pending&limit=5')
        ])

        const analyticsData = await analyticsRes.json()
        const dashboardData = await dashboardRes.json()
        const tasksData = await tasksRes.json()

        setMetrics(analyticsData)
        setAppointments(dashboardData.proximasCitas || [])
        // Asegurarse de que tasks sea siempre un array incluso si hay error o campos vacíos
        setTasks(Array.isArray(tasksData) ? tasksData : [])
      } catch (error) {
        console.error('Error fetching dashboard data:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  if (loading) return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 animate-pulse">
      {[1, 2, 3, 4].map(i => <div key={i} className="h-32 bg-muted rounded-3xl" />)}
    </div>
  )

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="rounded-3xl border-none shadow-lg bg-gradient-to-br from-blue-600 to-blue-800 text-white transform hover:-translate-y-1 transition-all duration-300">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-bold uppercase tracking-widest opacity-80 flex items-center gap-2">
              <Users className="h-4 w-4" />
              Leads Totales
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-black tracking-tight">{metrics?.leads?.total?.toLocaleString() || '1,248'}</div>
            <div className="text-[11px] font-bold mt-2 opacity-90 flex items-center gap-1 bg-white/20 w-max px-2 py-0.5 rounded-full">
              <TrendingUp className="h-3 w-3" /> +{metrics?.leads?.nuevosEsteMes || '124'} este mes
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-3xl border-none shadow-lg bg-white border border-border/50 hover:shadow-xl transition-all duration-300">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
              <Target className="h-4 w-4 text-purple-500" />
              Conversiones
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-black text-foreground tracking-tight">{metrics?.conversiones?.total?.toLocaleString() || '342'}</div>
            <div className="text-[11px] font-bold mt-2 text-purple-600 flex items-center gap-1 bg-purple-100 w-max px-2 py-0.5 rounded-full">
              <TrendingUp className="h-3 w-3" /> TASA 27.4%
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-3xl border-none shadow-lg bg-white border border-border/50 hover:shadow-xl transition-all duration-300">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-emerald-500" />
              Ingresos Mensuales
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-black text-foreground tracking-tight">${metrics?.ingresos?.total?.toLocaleString() || '45,290'}</div>
            <div className="flex items-center gap-2 mt-2">
                <Progress value={75} className="h-2 bg-emerald-100" />
                <span className="text-[10px] font-bold text-emerald-600">75% M2</span>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-3xl border-none shadow-lg bg-slate-950 text-white hover:shadow-2xl transition-all duration-300">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-bold uppercase tracking-widest opacity-80 flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Crecimiento
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-black tracking-tight">+{metrics?.leads?.cambio?.toFixed(1) || '18.4'}%</div>
            <div className="text-[11px] font-bold mt-2 text-emerald-400 uppercase flex items-center gap-1 bg-emerald-400/20 w-max px-2 py-0.5 rounded-full">
               TENDENCIA POSITIVA
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Gráfico Principal */}
        <Card className="col-span-1 lg:col-span-2 rounded-3xl border-none shadow-xl bg-background overflow-hidden relative">
            <div className="absolute top-0 right-0 p-6 flex gap-2 z-10">
                <Badge variant="secondary" className="bg-white/80 backdrop-blur">Esta Semana</Badge>
            </div>
            <CardHeader className="pb-0 pt-6 px-6 z-10 relative">
                <CardTitle className="text-lg font-black tracking-tighter">Prospección Semanal</CardTitle>
                <CardDescription>Crecimiento de leads nuevos por día</CardDescription>
            </CardHeader>
            <CardContent className="p-0 h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={metrics?.leadsPorDia || [
                        { name: 'Lun', count: 0 },
                        { name: 'Mar', count: 0 },
                        { name: 'Mie', count: 0 },
                        { name: 'Jue', count: 0 },
                        { name: 'Vie', count: 0 },
                        { name: 'Sab', count: 0 },
                        { name: 'Dom', count: 0 },
                    ]} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                        <defs>
                            <linearGradient id="colorLeads" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4}/>
                                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                            </linearGradient>
                        </defs>
                        <Tooltip 
                          contentStyle={{ borderRadius: '1rem', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                          labelFormatter={(label) => `Día: ${label}`}
                        />
                        <Area type="monotone" dataKey="count" name="Leads" stroke="#3b82f6" fillOpacity={1} fill="url(#colorLeads)" strokeWidth={4} />
                    </AreaChart>
                </ResponsiveContainer>
            </CardContent>
        </Card>

        {/* Citas de Hoy */}
        <Card className="rounded-3xl border-none shadow-xl bg-white flex flex-col h-full">
            <CardHeader className="bg-slate-50 border-b border-border/50 pb-4">
                <div className="flex items-center justify-between">
                    <CardTitle className="text-md font-bold flex items-center gap-2">
                        <Calendar className="h-5 w-5 text-primary" /> 
                        Agenda de Hoy
                    </CardTitle>
                    <Button variant="ghost" size="icon"><MoreHorizontal className="h-4 w-4" /></Button>
                </div>
            </CardHeader>
            <CardContent className="p-0 flex-1 overflow-auto">
                <div className="divide-y divide-border/50">
                    {appointments.length > 0 ? appointments.map((apt, i) => (
                        <div key={i} className="p-4 hover:bg-slate-50 transition-colors flex items-start gap-4">
                            <div className="flex flex-col items-center justify-center p-2 bg-primary/10 rounded-xl text-primary font-bold min-w-[60px] text-center">
                                <span className="text-xs">{format(new Date(apt.fechaHora), 'HH:mm')}</span>
                                <span className="text-[9px] uppercase">{format(new Date(apt.fechaHora), 'aaa')}</span>
                            </div>
                            <div className="flex-1 space-y-1">
                                <h4 className="font-bold text-sm leading-none">{apt.servicio?.nombre || 'Cita'}</h4>
                                <p className="text-xs text-muted-foreground flex items-center gap-1">
                                    <Avatar className="h-4 w-4">
                                      <AvatarFallback>{apt.lead?.nombre?.charAt(0)}</AvatarFallback>
                                    </Avatar>
                                    {apt.lead?.nombre} • {apt.servicio?.duracion || 30}m
                                </p>
                            </div>
                            <div>
                                {apt.servicio?.modalidad === 'video' ? <Video className="h-4 w-4 text-blue-500" /> : <Phone className="h-4 w-4 text-green-500" />}
                            </div>
                        </div>
                    )) : (
                      <div className="p-8 text-center text-muted-foreground flex flex-col items-center gap-2">
                        <Calendar className="h-8 w-8 opacity-20" />
                        <p className="text-sm font-medium">No hay citas para hoy</p>
                      </div>
                    )}
                </div>
            </CardContent>
            <div className="p-4 border-t border-border/50 bg-slate-50 mt-auto rounded-b-3xl">
                <Button className="w-full premium-gradient-primary rounded-xl" variant="outline">Ver Calendario Completo</Button>
            </div>
        </Card>
      </div>

      {/* Lista de Tareas */}
      <Card className="rounded-3xl border-none shadow-xl overflow-hidden">
        <CardHeader className="bg-slate-50 border-b border-border/50 flex flex-row items-center justify-between py-4">
            <div className="flex items-center gap-3">
                <div className="h-10 w-10 bg-primary/10 rounded-xl flex items-center justify-center text-primary">
                    <CheckSquare className="h-5 w-5" />
                </div>
                <div>
                    <CardTitle className="text-lg font-bold">Tareas Pendientes</CardTitle>
                    <CardDescription>Tienes {Array.isArray(tasks) ? tasks.filter(t => !t.completada).length : 0} tareas urgentes hoy.</CardDescription>
                </div>
            </div>
            <Button size="sm" className="rounded-xl"><CheckSquare className="h-4 w-4 mr-2" /> Nueva Tarea</Button>
        </CardHeader>
        <CardContent className="p-0">
            <div className="divide-y divide-border/50">
                {tasks.length > 0 ? tasks.map((task, i) => (
                    <div key={i} className={`p-4 flex items-center gap-4 hover:bg-slate-50 transition-colors ${task.completada ? 'opacity-60' : ''}`}>
                        <button className="text-muted-foreground hover:text-primary transition-colors focus:outline-none">
                            {task.completada ? <CheckCircle2 className="h-6 w-6 text-green-500" /> : <div className="h-6 w-6 rounded-full border-2 border-muted-foreground/30 hover:border-primary" />}
                        </button>
                        <div className="flex-1">
                            <h4 className={`text-sm font-semibold ${task.completada ? 'line-through text-muted-foreground' : 'text-foreground'}`}>{task.titulo}</h4>
                            <div className="flex items-center gap-3 mt-1">
                                <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{task.lead?.nombre || 'General'}</span>
                                <span className={`text-xs flex items-center gap-1 ${task.fechaVencimiento && new Date(task.fechaVencimiento) < new Date() ? 'text-red-500 font-bold' : 'text-muted-foreground'}`}>
                                    <Clock className="h-3 w-3" /> {task.fechaVencimiento ? format(new Date(task.fechaVencimiento), 'dd MMM, HH:mm', { locale: es }) : 'Sin fecha'}
                                </span>
                            </div>
                        </div>
                        <Badge variant="outline" className={task.prioridad === 'alta' ? 'border-red-200 text-red-600 bg-red-50' : task.prioridad === 'media' ? 'border-yellow-200 text-yellow-600 bg-yellow-50' : 'border-slate-200 text-slate-600 bg-slate-50'}>
                            {task.prioridad === 'alta' ? 'Alta' : task.prioridad === 'media' ? 'Media' : 'Baja'}
                        </Badge>
                    </div>
                )) : (
                  <div className="p-8 text-center text-muted-foreground flex flex-col items-center gap-2">
                    <CheckSquare className="h-8 w-8 opacity-20" />
                    <p className="text-sm font-medium">Todo al día. No hay tareas pendientes.</p>
                  </div>
                )}
            </div>
        </CardContent>
      </Card>

      {/* Analytics Adicionales / Leaderboard */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="rounded-3xl border-none shadow-xl overflow-hidden h-full">
          <CardHeader className="bg-gradient-to-r from-slate-900 to-slate-800 text-white flex flex-row items-center justify-between py-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 bg-yellow-400/20 rounded-xl flex items-center justify-center text-yellow-500">
                <Trophy className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-lg font-bold">Mejores Cerradores</CardTitle>
                <CardDescription className="text-slate-400">Ranking basado en simulaciones de IA</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-6">
            <TrainingLeaderboard />
          </CardContent>
        </Card>

        {/* Placeholder para más métricas o tips de IA */}
        <Card className="rounded-3xl border-none shadow-xl bg-blue-600 text-white p-8 flex flex-col justify-center relative overflow-hidden">
          <div className="relative z-10">
            <Badge className="bg-white/20 text-white border-none mb-4 tracking-widest font-black">VOLKERN COACH</Badge>
            <h3 className="text-2xl font-black leading-tight mb-4">¿Sabías que el 80% de los negocios se cierran tras el 5to seguimiento?</h3>
            <p className="text-blue-100 text-sm mb-6">Gemma 4 ha detectado que los agentes que usan el simulador de roleplay aumentan su tasa de cierre en un 15% semanal.</p>
            <Button variant="secondary" className="w-max rounded-xl font-bold">Ver Tips Estratégicos</Button>
          </div>
          <Bot className="absolute -bottom-10 -right-10 w-64 h-64 text-white/10" />
        </Card>
      </div>
    </div>
  );
}
