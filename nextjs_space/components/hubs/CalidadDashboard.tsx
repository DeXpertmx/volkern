'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { 
  ShieldCheck, 
  Search, 
  Plus, 
  AlertOctagon, 
  CheckCircle2, 
  FileSearch, 
  ArrowRight,
  Fingerprint,
  Zap,
  Filter,
  MoreVertical,
  Activity,
  ClipboardCheck,
  History,
  AlertTriangle,
  Microscope,
  FileText,
  Settings,
  Download,
  ShieldAlert
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { motion, AnimatePresence } from 'framer-motion'

export default function CalidadDashboard() {
  const searchParams = useSearchParams()
  const section = searchParams.get('section') || 'inspecciones'
  const [isInspectorActive, setIsInspectorActive] = useState(false)

  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<any>(null)

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch('/api/erp/qc/data')
        const json = await res.json()
        setData(json)
      } catch (error) {
        console.error('Error loading QC data:', error)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  const stats = data ? [
    { label: 'Inspecciones Hoy', value: data.stats.inspectionsToday.toString(), icon: ShieldCheck, color: 'text-blue-500', bg: 'bg-blue-500/10' },
    { label: 'No Conformidades', value: data.stats.openNonConformities.toString(), icon: AlertOctagon, color: 'text-rose-500', bg: 'bg-rose-500/10' },
    { label: 'Tasa de Aprobación', value: data.stats.approvalRate, icon: CheckCircle2, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
    { label: 'Reportes Firmados', value: data.stats.signedReports.toLocaleString(), icon: Fingerprint, color: 'text-purple-500', bg: 'bg-purple-500/10' },
  ] : [
    { label: 'Inspecciones Hoy', value: '...', icon: ShieldCheck, color: 'text-blue-500', bg: 'bg-blue-500/10' },
    { label: 'No Conformidades', value: '...', icon: AlertOctagon, color: 'text-rose-500', bg: 'bg-rose-500/10' },
    { label: 'Tasa de Aprobación', value: '...', icon: CheckCircle2, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
    { label: 'Reportes Firmados', value: '...', icon: Fingerprint, color: 'text-purple-500', bg: 'bg-purple-500/10' },
  ]

  const handleTabChange = (tabId: string) => {
    const url = new URL(window.location.href);
    if (tabId === 'inspecciones') url.searchParams.delete('section');
    else url.searchParams.set('section', tabId);
    window.history.pushState({}, '', url);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }

  return (
    <div className="space-y-8 pb-20">
      {/* Header Dinámico */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-black tracking-tight uppercase">
            {section === 'incidencias' ? 'No Conformidades' : section === 'ia' ? 'QC Intelligence IA' : section === 'config' ? 'Puntos de Control' : 'Garantía de Calidad (QC)'}
          </h1>
          <p className="text-muted-foreground font-medium text-sm">
            {section === 'incidencias' ? 'Gestión de fallos críticos y acciones correctivas industriales.' : 
             section === 'ia' ? 'Analítica avanzada de anomalías y predicción de fallos por Gemma.' : 
             section === 'config' ? 'Configuración de reglas de aceptación y parámetros técnicos.' : 
             'Trazabilidad criptográfica y auditoría industrial de alta fidelidad.'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button 
             variant="outline" 
             onClick={() => handleTabChange('config')}
             className="rounded-xl font-bold uppercase text-[10px] h-10 px-4"
          >
            <Settings className="w-4 h-4 mr-2" />
            Configurar Reglas
          </Button>
          <Button className="rounded-xl font-bold uppercase text-[10px] h-10 px-4 shadow-lg shadow-primary/20">
            <Plus className="w-4 h-4 mr-2" /> Nueva Inspección
          </Button>
        </div>
      </div>

      {/* Selector Visual de Pestana */}
      <div className="flex bg-slate-100 p-1 rounded-2xl w-fit">
        {[
          { id: 'inspecciones', label: 'Inspecciones', icon: ShieldCheck },
          { id: 'incidencias', label: 'Incidencias', icon: AlertOctagon },
          { id: 'ia', label: 'Auditoría IA', icon: Zap },
          { id: 'config', label: 'Criterios', icon: FileSearch }
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

      {/* Renderizado de Secciones */}
      <AnimatePresence mode="wait">
        <motion.div
          key={section}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2 }}
        >
          {section === 'inspecciones' && <InspectionsList stats={stats} inspections={data?.inspections || []} loading={loading} />}
          {section === 'incidencias' && <NonConformities issues={data?.issues || []} loading={loading} />}
          {section === 'ia' && <AIAuditory />}
          {section === 'config' && <ControlPoints points={data?.points || []} loading={loading} />}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

function InspectionsList({ stats, inspections, loading }: { stats: any[], inspections: any[], loading: boolean }) {
  const recentChecks = inspections.map(i => ({
    id: i.id.substring(i.id.length - 4).toUpperCase(),
    point: i.point.name,
    target: i.project?.name || i.workOrder?.batchNumber || 'General',
    status: i.status,
    time: new Date(i.createdAt).toLocaleDateString()
  }))

  return (
    <div className="space-y-8">
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat, i) => (
          <Card key={i} className="border-none shadow-sm hover:shadow-md transition-all">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className={`p-2.5 rounded-xl ${stat.bg} ${stat.color}`}>
                  <stat.icon className="w-5 h-5" />
                </div>
                <Activity className="w-4 h-4 text-slate-200" />
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
        <Card className="lg:col-span-8 border-none shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div>
              <CardTitle className="text-lg font-bold uppercase">Registro de Inspecciones</CardTitle>
              <CardDescription>Reportes vinculados a producción y proyectos.</CardDescription>
            </div>
            <div className="flex items-center gap-2">
               <div className="relative w-48 hidden md:block">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input className="w-full pl-9 pr-3 py-2 bg-slate-50 border-none rounded-xl text-xs font-bold" placeholder="Filtrar por ID..." />
               </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {recentChecks.map((check, i) => (
                <div key={i} className="group p-4 rounded-2xl bg-slate-50 border border-transparent hover:border-slate-200 hover:bg-white transition-all flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 bg-white rounded-xl shadow-sm flex items-center justify-center">
                       <ShieldCheck className={`w-5 h-5 ${check.status === 'PASSED' ? 'text-emerald-500' : 'text-rose-500'}`} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-bold text-sm tracking-tight">{check.point}</h4>
                        <span className="text-[10px] font-black text-muted-foreground uppercase">#{check.id}</span>
                      </div>
                      <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">{check.target} • {check.time}</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-4">
                    <Badge className={`${check.status === 'PASSED' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'} border-none px-3 font-black uppercase text-[9px]`}>
                      {check.status}
                    </Badge>
                    <div className="hidden sm:flex p-1 px-2 rounded-lg bg-slate-100/50 text-[8px] font-black text-slate-400 items-center gap-1 border border-slate-100">
                       <Fingerprint className="w-3 h-3" /> HASH SECURE
                    </div>
                    <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full">
                      <ArrowRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="lg:col-span-4 space-y-6">
          <Card className="border-none shadow-sm bg-indigo-950 text-white overflow-hidden group">
            <CardHeader className="relative z-10 pb-2">
              <div className="flex items-center gap-2 mb-1">
                <Zap className="w-4 h-4 text-indigo-400" />
                <span className="text-[10px] font-black uppercase tracking-widest text-indigo-400">Gemma Insights</span>
              </div>
              <CardTitle className="text-xl font-bold tracking-tight">Anomalía Detectada</CardTitle>
            </CardHeader>
            <CardContent className="relative z-10 space-y-4 pt-2">
              <p className="text-xs text-indigo-200 leading-relaxed">
                "Detectado patrón de fallo del 15% en Lote SolarTech #442. Se recomienda pausar producción."
              </p>
              <Button className="w-full rounded-xl bg-indigo-500 hover:bg-indigo-400 text-white text-[10px] font-black uppercase tracking-widest h-12 shadow-lg shadow-indigo-500/20">
                Auditar Lote
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

function NonConformities({ issues, loading }: { issues: any[], loading: boolean }) {
  const formattedIssues = issues.map(i => ({
    id: `NC-${i.id.substring(i.id.length - 4).toUpperCase()}`,
    title: i.description,
    level: i.severity,
    status: i.status,
    date: new Date(i.createdAt).toLocaleDateString('es-ES', { day: '2-digit', month: 'SHORT' }).toUpperCase()
  }))

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
         <Card className="border-none bg-rose-500 text-white">
            <CardContent className="p-6">
               <p className="text-[10px] font-black uppercase opacity-60 tracking-widest">Abiertas y Críticas</p>
               <p className="text-3xl font-black mt-1">12</p>
            </CardContent>
         </Card>
         <Card className="border-none bg-amber-500 text-white">
            <CardContent className="p-6">
               <p className="text-[10px] font-black uppercase opacity-60 tracking-widest">En Análisis</p>
               <p className="text-3xl font-black mt-1">24</p>
            </CardContent>
         </Card>
         <Card className="border-none bg-emerald-500 text-white">
            <CardContent className="p-6">
               <p className="text-[10px] font-black uppercase opacity-60 tracking-widest">Resueltas (30d)</p>
               <p className="text-3xl font-black mt-1">142</p>
            </CardContent>
         </Card>
      </div>

      <Card className="border-none shadow-sm">
         <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg font-bold uppercase">Gestión de No Conformidades</CardTitle>
            <Button variant="outline" className="text-[10px] font-black uppercase h-8 px-4 border-2">
               Nueva Incidencia
            </Button>
         </CardHeader>
         <CardContent>
            <div className="space-y-3">
               {formattedIssues.map((issue) => (
                  <div key={issue.id} className="p-4 rounded-2xl bg-slate-50 flex items-center justify-between border border-transparent hover:border-slate-200 transition-all">
                     <div className="flex items-center gap-4">
                        <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${
                           issue.level === 'CRITICAL' || issue.level === 'HIGH' ? 'bg-rose-100 text-rose-600' : 
                           issue.level === 'WARNING' || issue.level === 'MEDIUM' ? 'bg-amber-100 text-amber-600' : 'bg-emerald-100 text-emerald-600'
                        }`}>
                           <AlertOctagon className="w-5 h-5" />
                        </div>
                        <div>
                           <h4 className="font-bold text-sm tracking-tight">{issue.title}</h4>
                           <p className="text-[10px] text-muted-foreground font-black uppercase">{issue.id} • Detectada {issue.date}</p>
                        </div>
                     </div>
                     <div className="flex items-center gap-4">
                        <Badge className={`${
                           issue.status === 'OPEN' ? 'bg-rose-50 text-rose-600' :
                           issue.status === 'IN_REVIEW' ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'
                        } border-none font-black text-[8px] px-2`}>
                           {issue.status}
                        </Badge>
                        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full">
                           <MoreVertical className="w-4 h-4" />
                        </Button>
                     </div>
                  </div>
               ))}
               {formattedIssues.length === 0 && !loading && (
                 <div className="text-center py-10 text-muted-foreground text-xs font-bold uppercase tracking-widest">No hay incidencias registradas</div>
               )}
            </div>
         </CardContent>
      </Card>
    </div>
  )
}

function AIAuditory() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
       <Card className="lg:col-span-8 border-none shadow-sm overflow-hidden">
          <CardHeader>
             <CardTitle className="text-lg font-bold uppercase">Auditoría de Anomalías Gemma QC</CardTitle>
             <CardDescription>Escaneo autónomo de materiales y procesos en tiempo real.</CardDescription>
          </CardHeader>
          <CardContent className="p-10 flex flex-col items-center justify-center space-y-6">
             <div className="relative">
                <div className="absolute inset-0 bg-primary/20 rounded-full animate-ping" />
                <div className="h-24 w-24 bg-primary text-white rounded-3xl flex items-center justify-center relative shadow-2xl">
                   <Microscope className="w-10 h-10" />
                </div>
             </div>
             <div className="text-center space-y-2">
                <h3 className="text-lg font-black uppercase">Escaneo Activo</h3>
                <p className="text-xs text-muted-foreground max-w-sm font-medium">
                   Gemma está analizando los descriptores de imagen de la línea de producción #4.
                </p>
             </div>
             <div className="w-full max-w-md space-y-2">
                <div className="flex justify-between text-[10px] font-black uppercase">
                   <span className="flex items-center gap-1"><Activity className="w-3 h-3" /> Integridad de Datos</span>
                   <span>99.9%</span>
                </div>
                <Progress value={99.9} className="h-1" />
             </div>
          </CardContent>
       </Card>

       <div className="lg:col-span-4 space-y-6">
          <Card className="border-none shadow-sm bg-rose-600 text-white">
             <CardHeader>
                <div className="flex items-center gap-2 mb-2">
                   <ShieldAlert className="w-4 h-4" />
                   <span className="text-[10px] font-black uppercase tracking-widest text-white/70">Alerta de Integridad</span>
                </div>
                <CardTitle className="text-xl font-bold tracking-tight">Fallo de Trazabilidad</CardTitle>
             </CardHeader>
             <CardContent className="space-y-4">
                <p className="text-xs text-rose-100 leading-relaxed font-medium">
                   "Se ha detectado una discrepancia en el HASH del reporte QC-7819. La firma digital no coincide con la base de datos de origen."
                </p>
                <Button className="w-full bg-white text-rose-600 hover:bg-white/90 font-black uppercase text-[10px] h-12 rounded-xl">
                   Investigar Brecha
                </Button>
             </CardContent>
          </Card>
       </div>
    </div>
  )
}

function ControlPoints({ points, loading }: { points: any[], loading: boolean }) {
  const rules = points.map(p => ({
    category: p.description || 'Calidad',
    point: p.name,
    limit: p.targetValue || p.tolerance || 'N/A',
    criticity: p.mandatory ? 'HIGH' : 'LOW'
  }))

  return (
    <Card className="border-none shadow-sm">
       <CardHeader>
          <CardTitle className="text-lg font-bold uppercase">Criterios de Aceptación</CardTitle>
          <CardDescription>Reglas de negocio aplicadas automáticamente en las inspecciones.</CardDescription>
       </CardHeader>
       <CardContent>
          <div className="space-y-4">
             {rules.map((rule, i) => (
                <div key={i} className="p-4 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-between">
                   <div>
                      <span className="text-[9px] font-black text-primary uppercase bg-primary/10 px-2 py-0.5 rounded-full mb-2 inline-block">
                         {rule.category}
                      </span>
                      <h4 className="font-bold text-sm">{rule.point}</h4>
                      <p className="text-xs text-muted-foreground mt-1">Límite Aceptable: <span className="text-slate-900 font-black">{rule.limit}</span></p>
                   </div>
                   <Badge className={`${
                      rule.criticity === 'CRITICAL' ? 'bg-rose-500 hover:bg-rose-500' : 'bg-slate-900 hover:bg-slate-900'
                   } text-white border-none font-black text-[8px] px-3`}>
                      {rule.criticity}
                   </Badge>
                </div>
             ))}
          </div>
       </CardContent>
    </Card>
  )
}
