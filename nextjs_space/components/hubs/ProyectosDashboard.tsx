'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
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
  Target,
  BarChart3,
  Search,
  History,
  Info,
  Zap,
  CheckCircle,
  Flag
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import useSWR from 'swr'
import { motion, AnimatePresence } from 'framer-motion'

const fetcher = (url: string) => fetch(url).then(res => res.json())

export default function ProyectosDashboard() {
  const searchParams = useSearchParams()
  const section = searchParams.get('section') || 'tablero'
  const { data: projects, isLoading: loadingProjects } = useSWR('/api/erp/projects', fetcher)
  const [view, setView] = useState<'grid' | 'kanban'>('grid')

  const handleTabChange = (tabId: string) => {
    const url = new URL(window.location.href);
    if (tabId === 'tablero') url.searchParams.delete('section');
    else url.searchParams.set('section', tabId);
    window.history.pushState({}, '', url);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }

  const stats = [
    { label: 'Proyectos Activos', value: '8', icon: Briefcase, color: 'text-blue-500', bg: 'bg-blue-500/10' },
    { label: 'Margen Promedio', value: '32.4%', icon: TrendingUp, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
    { label: 'Hitos para Hoy', value: '4', icon: Target, color: 'text-amber-500', bg: 'bg-amber-500/10' },
    { label: 'En Riesgo', value: '2', icon: AlertCircle, color: 'text-rose-500', bg: 'bg-rose-500/10' },
  ]

  return (
    <div className="space-y-8 pb-20">
      {/* Header Dinámico */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-black tracking-tight uppercase">
            {section === 'gantt' ? 'Cronograma Gantt' : section === 'costos' ? 'Control de Costos' : section === 'hitos' ? 'Hitos de Obra' : 'Operations Center'}
          </h1>
          <p className="text-muted-foreground font-medium text-sm">
            {section === 'gantt' ? 'Línea de tiempo detallada y dependencias de hitos operativos.' : 
             section === 'costos' ? 'Seguimiento de rentabilidad y desviación presupuestaria por obra.' : 
             section === 'hitos' ? 'Gestión de entregables críticos y fechas de compromiso.' : 
             'Gestión operativa de proyectos, hitos y rentabilidad.'}
          </p>
        </div>
        <div className="flex items-center gap-2">
           <div className="flex bg-slate-100 rounded-xl p-1 mr-2">
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
           <Button className="rounded-xl font-bold uppercase text-[10px] h-10 px-4 shadow-lg shadow-primary/20">
            <Plus className="w-4 h-4 mr-2" /> Nuevo Proyecto
          </Button>
        </div>
      </div>

      {/* Selector Visual de Pestana */}
      <div className="flex bg-slate-100 p-1 rounded-2xl w-fit">
        {[
          { id: 'tablero', label: 'Tablero General', icon: LayoutGrid },
          { id: 'gantt', label: 'Cronograma Gantt', icon: Calendar },
          { id: 'costos', label: 'Costos & Margen', icon: DollarSign },
          { id: 'hitos', label: 'Hitos Obra', icon: Target }
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => handleTabChange(tab.id)}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-[10px] font-black uppercase transition-all ${
              section === tab.id ? 'bg-white shadow-md text-primary' : 'text-muted-foreground hover:bg-white/50'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={section}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2 }}
        >
          {section === 'tablero' && (
            <div className="space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {stats.map((stat, i) => (
                  <Card key={i} className="border-none shadow-sm group hover:shadow-md transition-all duration-300">
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between mb-4">
                        <div className={`p-2.5 rounded-xl ${stat.bg} ${stat.color}`}>
                          <stat.icon className="w-5 h-5" />
                        </div>
                        {stat.label === 'En Riesgo' && parseInt(stat.value) > 0 && (
                           <Badge className="bg-rose-500 text-white border-none animate-pulse text-[8px] font-black uppercase tracking-widest px-2">Crítico</Badge>
                        )}
                      </div>
                      <div className="space-y-1">
                        <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">{stat.label}</p>
                        <p className="text-2xl font-black tracking-tighter">{stat.value}</p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-8 space-y-4">
                   {loadingProjects ? (
                     <div className="text-center py-20 font-black uppercase text-muted-foreground text-[10px] tracking-[0.2em] animate-pulse">Sincronizando Proyectos...</div>
                   ) : (projects && projects.length > 0) ? (
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {projects.map((project: any) => (
                          <Card key={project.id} className="border-none shadow-sm hover:shadow-md transition-all group cursor-pointer relative overflow-hidden bg-white">
                            <CardHeader className="pb-2">
                              <div className="flex justify-between items-start mb-2">
                                <Badge variant="outline" className={`rounded-lg border-none text-[9px] font-black uppercase px-2 py-0.5 ${
                                  project.status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'
                                }`}>
                                  {project.status}
                                </Badge>
                                <Button variant="ghost" size="icon" className="h-6 w-6 -mr-2"><MoreVertical className="w-4 h-4 text-slate-300" /></Button>
                              </div>
                              <CardTitle className="text-lg font-bold tracking-tight">{project.name}</CardTitle>
                              <CardDescription className="text-[10px] font-black uppercase tracking-widest truncate text-primary/60">{project.lead?.nombre || 'INDUSTRIAL ASSET #102'}</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4 pt-2">
                               <div className="space-y-1.5">
                                  <div className="flex justify-between text-[10px] font-black uppercase text-muted-foreground">
                                     <span>Progreso</span>
                                     <span>{project.progress}%</span>
                                  </div>
                                  <Progress value={project.progress} className="h-1.5" />
                               </div>
                               
                               <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-50">
                                  <div>
                                     <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">Presupuesto</p>
                                     <p className="text-sm font-black tracking-tighter">€{project.budget?.toLocaleString() || '145,000'}</p>
                                  </div>
                                  <div>
                                     <p className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">Hitos</p>
                                     <p className="text-sm font-bold tracking-tight">{project._count?.milestones || 6} Total</p>
                                  </div>
                               </div>
                            </CardContent>
                          </Card>
                        ))}
                     </div>
                   ) : (
                     <Card className="border-none shadow-sm py-20 flex flex-col items-center justify-center text-center space-y-4 bg-slate-50/50">
                        <div className="p-4 rounded-3xl bg-white shadow-sm text-slate-300">
                          <Briefcase className="w-8 h-8" />
                        </div>
                        <div>
                           <p className="text-xs font-black text-slate-500 uppercase tracking-widest">No hay proyectos activos</p>
                           <p className="text-[10px] text-slate-400 mt-1 uppercase max-w-xs mx-auto leading-relaxed">Transforma un Lead en un proyecto para empezar el seguimiento analítico en tiempo real.</p>
                        </div>
                        <Button variant="outline" className="rounded-xl font-black uppercase text-[10px] px-8 h-10 border-2">Crear primer proyecto</Button>
                     </Card>
                   )}
                </div>

                <div className="lg:col-span-4 space-y-6">
                   <Card className="border-none shadow-sm bg-slate-900 text-white overflow-hidden group">
                      <CardHeader>
                        <div className="flex items-center gap-2 mb-1">
                          <Zap className="h-4 w-4 text-emerald-400" />
                          <span className="text-[10px] font-black uppercase text-emerald-400 tracking-widest">Gemma AI Pro</span>
                        </div>
                        <CardTitle className="text-xl font-black tracking-tight pt-2">Análisis Predictivo</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-6">
                         <div className="p-4 rounded-2xl bg-white/5 border border-white/10 italic text-[11px] text-slate-300 leading-relaxed font-medium">
                            "El proyecto de energía fotovoltaica tiene un riesgo del <span className="text-rose-400 font-bold">12%</span> de retraso por falta de suministros en el hito 'Instalación Fase 2'."
                         </div>
                         <Button className="w-full rounded-xl bg-primary text-white font-black uppercase text-[10px] tracking-widest h-12 shadow-lg shadow-primary/20"> 
                            Optimizar Cronograma
                         </Button>
                      </CardContent>
                   </Card>
                </div>
              </div>
            </div>
          )}

          {section === 'gantt' && <GanttVisualizer />}
          {section === 'costos' && <ProjectCosts />}
          {section === 'hitos' && <MilestoneTracker />}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

function GanttVisualizer() {
  const tasks = [
    { name: 'Fase 1: Cimentación', start: 0, duration: 25, status: 'COMPLETED' },
    { name: 'Fase 2: Estructura', start: 20, duration: 45, status: 'IN_PROGRESS' },
    { name: 'Fase 3: Cerramiento', start: 60, duration: 30, status: 'PENDING' },
    { name: 'Fase 4: Acabados', start: 85, duration: 15, status: 'PENDING' },
  ]

  return (
    <Card className="border-none shadow-sm overflow-hidden">
       <CardHeader>
          <CardTitle className="text-lg font-bold uppercase">Cronograma Maestro (Gantt)</CardTitle>
          <CardDescription>Visualización interactiva de la cadena crítica de proyectos.</CardDescription>
       </CardHeader>
       <CardContent className="p-6">
          <div className="space-y-6">
             <div className="flex border-b border-slate-50 pb-2 text-[9px] font-black uppercase text-slate-400 tracking-widest">
                <div className="w-1/3">Actividad de Obra</div>
                <div className="flex-1 flex justify-between px-4">
                   <span>Mes 1</span>
                   <span>Mes 2</span>
                   <span>Mes 3</span>
                   <span>Mes 4</span>
                </div>
             </div>
             
             {tasks.map((task, i) => (
                <div key={i} className="flex items-center group">
                   <div className="w-1/3">
                      <p className="text-xs font-bold leading-none">{task.name}</p>
                      <p className="text-[10px] text-muted-foreground font-black uppercase mt-1 tracking-tighter">{task.status}</p>
                   </div>
                   <div className="flex-1 px-4 relative h-8 flex items-center">
                      <div className="absolute inset-0 bg-slate-50/50 rounded-lg group-hover:bg-slate-50 transition-colors" />
                      <div 
                        className={`h-4 rounded-full relative z-10 shadow-sm ${
                           task.status === 'COMPLETED' ? 'bg-emerald-500' : 
                           task.status === 'IN_PROGRESS' ? 'bg-indigo-500 animate-pulse' : 'bg-slate-200'
                        }`}
                        style={{ marginLeft: `${task.start}%`, width: `${task.duration}%` }}
                      >
                         <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-[8px] font-black px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                            {task.duration} d
                         </div>
                      </div>
                   </div>
                </div>
             ))}
          </div>
       </CardContent>
    </Card>
  )
}

function ProjectCosts() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
       <Card className="border-none shadow-sm">
          <CardHeader>
             <CardTitle className="text-lg font-bold uppercase">Desviación Presupuestaria</CardTitle>
             <CardDescription>Comparativa en tiempo real de costes vs presupuesto.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-8">
             <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100">
                   <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Presupuesto Total</p>
                   <p className="text-2xl font-black tracking-tighter text-slate-900">€452k</p>
                </div>
                <div className="bg-indigo-50 p-4 rounded-2xl border border-indigo-100">
                   <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Ejecutado Real</p>
                   <p className="text-2xl font-black tracking-tighter text-indigo-700">€385k</p>
                </div>
             </div>
             
             <div className="space-y-4 pt-4">
                <div className="flex justify-between items-end">
                   <div>
                      <p className="text-[10px] font-black uppercase text-muted-foreground mb-1">Margen Operativo Bruto</p>
                      <p className="text-3xl font-black tracking-tighter text-emerald-600">32.4%</p>
                   </div>
                   <TrendingUp className="h-10 w-10 text-emerald-500 mb-1" />
                </div>
                <Progress value={85} className="h-2 bg-slate-100" />
                <p className="text-[10px] text-muted-foreground font-medium uppercase text-center tracking-widest">Ahorro detectado: €14.2k por optimización de suministros</p>
             </div>
          </CardContent>
       </Card>

       <Card className="border-none shadow-sm bg-slate-900 text-white">
          <CardHeader>
             <CardTitle className="text-sm font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
                <History className="h-4 w-4" /> Historial de Gastos
             </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
             <div className="divide-y divide-white/5">
                {[
                   { ref: 'EXP-102', cat: 'Materiales', amt: '12,400', date: 'HOY' },
                   { ref: 'EXP-101', cat: 'Subcontratación', amt: '8,500', date: 'AYER' },
                   { ref: 'EXP-099', cat: 'Mano de Obra', amt: '4,200', date: 'LUNES' },
                ].map((item, i) => (
                   <div key={i} className="p-4 flex items-center justify-between hover:bg-white/5 transition-colors">
                      <div>
                         <p className="text-xs font-bold">{item.cat}</p>
                         <p className="text-[10px] text-slate-500 font-black uppercase">{item.ref} • {item.date}</p>
                      </div>
                      <p className="text-sm font-black tracking-tight">- €{item.amt}</p>
                   </div>
                ))}
             </div>
             <div className="p-4">
                <Button variant="ghost" className="w-full text-[10px] font-black uppercase text-slate-500 hover:text-white transition-colors">Ver auditoría completa</Button>
             </div>
          </CardContent>
       </Card>
    </div>
  )
}

function MilestoneTracker() {
  const milestones = [
    { title: 'Recepción de Materiales Críticos', status: 'OVERDUE', date: '12 ABR' },
    { title: 'Firma de Acta de Inicio', status: 'COMPLETED', date: '14 ABR' },
    { title: 'Verificación Estructural Lote C', status: 'IN_REVIEW', date: 'HOY' },
    { title: 'Entrega Fase 1', status: 'PLANNED', date: '22 ABR' },
  ]

  return (
    <Card className="border-none shadow-sm overflow-hidden">
       <CardHeader className="flex flex-row items-center justify-between">
          <div>
             <CardTitle className="text-lg font-bold uppercase text-primary">Hitos Críticos de Obra</CardTitle>
             <CardDescription>Seguimiento de entregables y compromisos contractuales.</CardDescription>
          </div>
          <Button variant="outline" className="text-[10px] font-black uppercase h-8 border-2">
             Gestionar Hitos
          </Button>
       </CardHeader>
       <CardContent className="p-0">
          <div className="divide-y divide-slate-50">
             {milestones.map((milestone, i) => (
                <div key={i} className="p-6 flex items-center justify-between group hover:bg-slate-50/50 transition-all">
                   <div className="flex items-center gap-5">
                      <div className={`h-12 w-12 rounded-2xl flex items-center justify-center shadow-sm ${
                         milestone.status === 'COMPLETED' ? 'bg-emerald-100 text-emerald-600' : 
                         milestone.status === 'OVERDUE' ? 'bg-rose-100 text-rose-600' : 
                         milestone.status === 'IN_REVIEW' ? 'bg-amber-100 text-amber-600' : 'bg-slate-100 text-slate-400'
                      }`}>
                         {milestone.status === 'COMPLETED' ? <CheckCircle className="w-6 h-6" /> : <Flag className="w-6 h-6" />}
                      </div>
                      <div>
                         <h4 className="font-black text-sm tracking-tight text-slate-900 group-hover:text-primary transition-colors">{milestone.title}</h4>
                         <div className="flex items-center gap-3 mt-1">
                            <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">Fecha: {milestone.date}</span>
                            <Badge className={`${
                               milestone.status === 'COMPLETED' ? 'bg-emerald-50 text-emerald-600' : 
                               milestone.status === 'OVERDUE' ? 'bg-rose-50 text-rose-600 animate-pulse' : 
                               milestone.status === 'IN_REVIEW' ? 'bg-amber-50 text-amber-600' : 'bg-slate-50 text-slate-500'
                            } border-none font-black text-[8px] uppercase px-2 tracking-widest`}>
                               {milestone.status}
                            </Badge>
                         </div>
                      </div>
                   </div>
                   <Button size="icon" variant="ghost" className="rounded-full h-10 w-10">
                      <ChevronRight className="w-5 h-5 text-slate-300" />
                   </Button>
                </div>
             ))}
          </div>
       </CardContent>
    </Card>
  )
}
