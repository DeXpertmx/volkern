'use client'

import { useState } from 'react'
import { 
  Briefcase, 
  CheckCircle2, 
  Clock, 
  AlertCircle, 
  Plus, 
  Filter, 
  LayoutGrid, 
  GanttChartSquare,
  DollarSign,
  TrendingUp,
  PieChart,
  Calendar,
  MoreVertical,
  ChevronRight,
  Target
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import useSWR from 'swr'

const fetcher = (url: string) => fetch(url).then(res => res.json())

export default function ProyectosDashboard() {
  const { data: projects, isLoading: loadingProjects } = useSWR('/api/erp/projects', fetcher)
  const [view, setView] = useState<'grid' | 'kanban'>('grid')

  // Mock de estadísticas de proyectos
  const stats = [
    { label: 'Proyectos Activos', value: '8', icon: Briefcase, color: 'text-blue-500', bg: 'bg-blue-500/10' },
    { label: 'Margen Promedio', value: '32.4%', icon: TrendingUp, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
    { label: 'Hitos para Hoy', value: '4', icon: Target, color: 'text-amber-500', bg: 'bg-amber-500/10' },
    { label: 'En Riesgo', value: '2', icon: AlertCircle, color: 'text-rose-500', bg: 'bg-rose-500/10' },
  ]

  return (
    <div className="space-y-8 pb-10">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-black tracking-tight uppercase">Operations Center</h1>
          <p className="text-muted-foreground font-medium">Gestión operativa de proyectos, hitos y rentabilidad.</p>
        </div>
        <div className="flex items-center gap-2">
           <div className="flex bg-slate-100 dark:bg-slate-900 rounded-xl p-1 mr-2">
              <Button 
                variant={view === 'grid' ? 'white' : 'ghost'} 
                size="sm" 
                className={`rounded-lg text-[10px] font-bold px-3 ${view === 'grid' ? 'shadow-sm' : ''}`}
                onClick={() => setView('grid')}
              >
                <LayoutGrid className="w-3 h-3 mr-1" /> Rejilla
              </Button>
              <Button 
                variant={view === 'kanban' ? 'white' : 'ghost'} 
                size="sm" 
                className={`rounded-lg text-[10px] font-bold px-3 ${view === 'kanban' ? 'shadow-sm' : ''}`}
                onClick={() => setView('kanban')}
              >
                <GanttChartSquare className="w-3 h-3 mr-1" /> Kanban
              </Button>
           </div>
           <Button className="rounded-xl font-bold uppercase text-xs tracking-wider shadow-lg shadow-primary/20">
            <Plus className="w-4 h-4 mr-2" /> Nuevo Proyecto
          </Button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, i) => (
          <Card key={i} className="border-none shadow-sm group hover:shadow-md transition-all duration-300">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className={`p-2.5 rounded-xl ${stat.bg} ${stat.color}`}>
                  <stat.icon className="w-5 h-5" />
                </div>
                {stat.label === 'En Riesgo' && parseInt(stat.value) > 0 && (
                   <Badge className="bg-rose-500 text-white border-none animate-pulse text-[8px] font-black uppercase">Crítico</Badge>
                )}
              </div>
              <div className="space-y-1">
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{stat.label}</p>
                <p className="text-2xl font-black tracking-tighter">{stat.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Active Projects List/Grid */}
        <div className="lg:col-span-8 space-y-4">
           {loadingProjects ? (
             <div className="text-center py-20 font-bold uppercase text-muted-foreground text-xs tracking-widest">Sincronizando Proyectos...</div>
           ) : (projects && projects.length > 0) ? (
             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {projects.map((project: any) => (
                  <Card key={project.id} className="border-none shadow-sm hover:shadow-md transition-all group cursor-pointer relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity">
                      <Briefcase className="w-20 h-20 -mr-6 -mt-6 rotate-12" />
                    </div>
                    <CardHeader className="pb-2">
                      <div className="flex justify-between items-start mb-2">
                        <Badge variant="outline" className={`rounded-lg border-none text-[9px] font-black uppercase px-2 py-0.5 ${
                          project.status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'
                        }`}>
                          {project.status}
                        </Badge>
                        <Button variant="ghost" size="icon" className="h-6 w-6 -mr-2"><MoreVertical className="w-4 h-4 text-slate-400" /></Button>
                      </div>
                      <CardTitle className="text-lg font-bold tracking-tight">{project.name}</CardTitle>
                      <CardDescription className="text-[10px] font-black uppercase tracking-widest truncate">{project.lead?.nombre || 'Sin cliente vinculado'}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4 pt-2">
                       <div className="space-y-1.5">
                          <div className="flex justify-between text-[10px] font-bold uppercase text-muted-foreground">
                             <span>Progreso</span>
                             <span>{project.progress}%</span>
                          </div>
                          <Progress value={project.progress} className="h-1.5" />
                       </div>
                       
                       <div className="grid grid-cols-2 gap-2 pt-2 border-t">
                          <div>
                             <p className="text-[9px] font-black text-muted-foreground uppercase">Presupuesto</p>
                             <p className="text-sm font-black tracking-tighter">€{project.budget.toLocaleString()}</p>
                          </div>
                          <div>
                             <p className="text-[9px] font-black text-muted-foreground uppercase">Hitos</p>
                             <p className="text-sm font-bold tracking-tight">{project._count?.milestones || 0} Total</p>
                          </div>
                       </div>
                       
                       <div className="flex items-center justify-between pt-2">
                          <div className="flex -space-x-2">
                             {[1,2].map(i => (
                               <div key={i} className="h-6 w-6 rounded-full border-2 border-white bg-slate-200 flex items-center justify-center text-[8px] font-bold">U{i}</div>
                             ))}
                          </div>
                          <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 uppercase">
                             <Clock className="w-3 h-3" /> {new Date(project.startDate).toLocaleDateString()}
                          </div>
                       </div>
                    </CardContent>
                  </Card>
                ))}
             </div>
           ) : (
             <Card className="border-none shadow-sm py-20 flex flex-col items-center justify-center text-center space-y-4">
                <div className="p-4 rounded-full bg-slate-50 text-slate-300">
                  <Briefcase className="w-10 h-10" />
                </div>
                <div>
                   <p className="text-sm font-bold text-slate-500 uppercase tracking-tight">No hay proyectos activos</p>
                   <p className="text-[10px] text-slate-400 mt-1 uppercase">Transforma un Lead en un proyecto para empezar el seguimiento analítico.</p>
                </div>
                <Button variant="outline" className="rounded-xl font-bold uppercase text-[10px] px-6">Crear primer proyecto</Button>
             </Card>
           )}
        </div>

        {/* Proactive Operations (Gemma AI) */}
        <div className="lg:col-span-4 space-y-6">
           <Card className="border-none shadow-sm bg-gradient-to-br from-slate-900 to-slate-950 text-white overflow-hidden group">
              <CardHeader>
                <div className="flex items-center gap-2 mb-1">
                  <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse outline outline-offset-2 outline-emerald-500/20" />
                  <CardTitle className="text-xs font-black uppercase text-emerald-500 tracking-[0.2em]">Project Intelligence</CardTitle>
                </div>
                <CardTitle className="text-xl font-black tracking-tight leading-none pt-2">Detección de Desviación</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                 <div className="p-4 rounded-2xl bg-white/5 border border-white/10 group-hover:bg-white/[0.08] transition-colors">
                    <p className="text-[10px] font-bold text-emerald-500 uppercase mb-2">Análisis de Hitos: CRÍTICO</p>
                    <p className="text-xs text-slate-300 leading-relaxed font-medium">
                      El proyecto <span className="text-white font-bold">"Implementación Hub ERP"</span> tiene una desviación del <span className="text-rose-400 font-bold">15%</span> sobre el tiempo objetivo.
                    </p>
                 </div>
                 
                 <div className="space-y-3">
                    <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-widest text-slate-500">
                       <span>Recomendación Proactiva</span>
                    </div>
                    <div className="p-3 rounded-xl bg-primary/10 border border-primary/20">
                       <p className="text-[11px] text-slate-200 font-medium italic">
                        "Mueve el hito 'QA Final' al próximo jueves para compensar el retraso en la entrega de materiales de Fase 2."
                       </p>
                    </div>
                 </div>

                 <Button className="w-full rounded-2xl bg-white text-slate-950 font-black uppercase text-[10px] tracking-widest py-6 hover:bg-slate-100 shadow-xl shadow-white/5 transition-all"> 
                    Calcular Re-estimación IA 
                 </Button>
              </CardContent>
           </Card>

           {/* Efficiency Metrics */}
           <Card className="border-none shadow-sm overflow-hidden">
              <CardHeader className="pb-3 border-b border-slate-50 bg-slate-50/30">
                <CardTitle className="text-xs font-black uppercase tracking-widest flex items-center gap-2">
                  <PieChart className="w-4 h-4 text-primary" />
                  Salud de Portafolios
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-6 space-y-6">
                 <div className="space-y-2">
                    <div className="flex justify-between text-[10px] font-black uppercase tracking-wider">
                       <span>En Tiempo</span>
                       <span className="text-emerald-500">82%</span>
                    </div>
                    <Progress value={82} className="h-1.5 [&>div]:bg-emerald-500" />
                 </div>
                 <div className="space-y-2">
                    <div className="flex justify-between text-[10px] font-black uppercase tracking-wider">
                       <span>Bajo Presupuesto</span>
                       <span className="text-emerald-500">94%</span>
                    </div>
                    <Progress value={94} className="h-1.5 [&>div]:bg-emerald-500" />
                 </div>
                 <div className="pt-4 border-t">
                    <div className="flex items-center justify-between">
                       <div>
                          <p className="text-[9px] font-black text-muted-foreground uppercase">Retorno Medio</p>
                          <p className="text-xl font-black tracking-tighter text-slate-900">+42.8%</p>
                       </div>
                       <div className="flex -space-x-1">
                          {[1,2,3,4].map(i => <div key={i} className="h-6 w-6 rounded-full border-2 border-white bg-slate-100" />)}
                       </div>
                    </div>
                 </div>
              </CardContent>
           </Card>
        </div>
      </div>
    </div>
  )
}
