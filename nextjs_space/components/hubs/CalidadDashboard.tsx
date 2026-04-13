'use client'

import { useState } from 'react'
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
  Activity
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'

export default function CalidadDashboard() {
  const stats = [
    { label: 'Inspecciones Hoy', value: '45', icon: ShieldCheck, color: 'text-blue-500', bg: 'bg-blue-500/10' },
    { label: 'No Conformidades', value: '3', icon: AlertOctagon, color: 'text-rose-500', bg: 'bg-rose-500/10' },
    { label: 'Tasa de Aprobación', value: '98.2%', icon: CheckCircle2, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
    { label: 'Reportes Firmados', value: '1,240', icon: Fingerprint, color: 'text-purple-500', bg: 'bg-purple-500/10' },
  ]

  const recentChecks = [
    { id: 'QC-7821', point: 'Resistencia Estructural', target: 'Work Order #1024', status: 'PASSED', time: 'Hace 10 min' },
    { id: 'QC-7820', point: 'Voltaje Salida DC', target: 'Work Order #1024', status: 'PASSED', time: 'Hace 25 min' },
    { id: 'QC-7819', point: 'Acabado Estético', target: 'Project: Villa Marina', status: 'FAILED', time: 'Hace 1 hora' },
  ]

  return (
    <div className="space-y-8 pb-10">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-black tracking-tight uppercase">Garantía de Calidad (QC)</h1>
          <p className="text-muted-foreground font-medium text-sm">Trazabilidad criptográfica y auditoría industrial.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="rounded-xl font-bold uppercase text-[10px] h-10 px-4">
            <FileSearch className="w-4 h-4 mr-2" /> Puntos Control
          </Button>
          <Button className="rounded-xl font-bold uppercase text-[10px] h-10 px-4 shadow-lg shadow-primary/20">
            <Plus className="w-4 h-4 mr-2" /> Nueva Inspección
          </Button>
        </div>
      </div>

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
        {/* Recent Quality Checks */}
        <Card className="lg:col-span-8 border-none shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div>
              <CardTitle className="text-lg font-bold uppercase">Registro de Inspecciones</CardTitle>
              <CardDescription>Reportes vinculados a producción y proyectos.</CardDescription>
            </div>
            <Button variant="ghost" size="icon" className="rounded-full">
              <Filter className="w-4 h-4 text-muted-foreground" />
            </Button>
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
                    <div className="p-1 px-2 rounded-lg bg-slate-100 text-[8px] font-black text-slate-400 flex items-center gap-1">
                       <Fingerprint className="w-3 h-3" /> HASH SECURE
                    </div>
                    <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full">
                      <ArrowRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            <Button variant="link" className="w-full mt-4 text-[10px] font-black uppercase text-muted-foreground">Ver historial completo</Button>
          </CardContent>
        </Card>

        {/* AI Quality Insights */}
        <div className="lg:col-span-4 space-y-6">
          <Card className="border-none shadow-sm bg-indigo-950 text-white overflow-hidden group">
            <CardHeader className="relative z-10 pb-2">
              <div className="flex items-center gap-2 mb-1">
                <Zap className="w-4 h-4 text-indigo-400" />
                <span className="text-[10px] font-black uppercase tracking-widest text-indigo-400">Gemma QC Intelligence</span>
              </div>
              <CardTitle className="text-xl font-bold tracking-tight">Análisis de Anomalías</CardTitle>
            </CardHeader>
            <CardContent className="relative z-10 space-y-4 pt-2">
              <div className="p-4 rounded-xl bg-indigo-900/40 border border-white/10 text-xs text-indigo-100 leading-relaxed">
                "Detectado patrón de fallo en <span className="text-white font-bold underline">Paneles Solares X1</span>. Los reportes QA indican que el lote de <span className="text-white font-bold">SolarTech Inc</span> presenta un 15% más de no conformidades."
              </div>
              <Button className="w-full rounded-xl bg-indigo-500 hover:bg-indigo-400 text-white text-[10px] font-black uppercase tracking-widest h-12">
                Generar Auditoría de Lote
              </Button>
            </CardContent>
            {/* Subtle light effect */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/20 rounded-full blur-3xl -mr-16 -mt-16 group-hover:bg-indigo-500/30 transition-all opacity-50" />
          </Card>

          <Card className="border-none shadow-sm overflow-hidden">
             <CardHeader className="pb-3 border-b border-slate-50">
                <CardTitle className="text-sm font-black uppercase">No Conformidades Críticas</CardTitle>
             </CardHeader>
             <CardContent className="p-0">
                <div className="divide-y divide-slate-50">
                   {[1, 2].map((i) => (
                     <div key={i} className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                        <div className="flex items-start gap-3">
                           <div className="mt-1 h-2 w-2 rounded-full bg-rose-500 animate-pulse" />
                           <div>
                              <p className="text-xs font-bold leading-tight">Fisura en soldadura de soporte</p>
                              <p className="text-[10px] text-muted-foreground font-black uppercase mt-1">Nivel: Crítico • OP #1021</p>
                           </div>
                        </div>
                        <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full">
                           <MoreVertical className="w-4 h-4" />
                        </Button>
                     </div>
                   ))}
                </div>
             </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
