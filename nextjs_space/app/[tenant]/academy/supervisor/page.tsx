'use client'

import { useState } from 'react'
import { 
  ShieldAlert, 
  Users, 
  GraduationCap, 
  AlertTriangle, 
  CheckCircle2, 
  TrendingUp, 
  Search,
  ArrowRight,
  Cpu,
  Mail,
  MoreVertical,
  Activity,
  Zap,
  Target,
  FileWarning
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Input } from '@/components/ui/input'
import useSWR from 'swr'
import { motion } from 'framer-motion'
import { toast } from 'sonner'

const fetcher = (url: string) => fetch(url).then(res => res.json())

export default function SupervisorDashboard() {
  const { data, isLoading } = useSWR('/api/academy/supervisor/skill-gaps', fetcher)
  const [searchTerm, setSearchTerm] = useState('')

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <div className="flex flex-col items-center gap-4">
          <div className="h-16 w-16 bg-primary rounded-3xl flex items-center justify-center animate-pulse">
            <Cpu className="w-8 h-8 text-white" />
          </div>
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Analizando brecha de habilidades...</p>
        </div>
      </div>
    )
  }

  const report = data?.report || []
  const risks = data?.criticalRisks || []
  const stats = data?.stats || { totalStaff: 0, fullyQualified: 0, atRiskWorkOrders: 0 }

  const filteredReport = report.filter((s: any) => 
    s.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    s.email.toLowerCase().includes(searchTerm.toLowerCase())
  )

  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-20 p-8 space-y-10">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Badge className="bg-indigo-100 text-indigo-700 border-none font-bold text-[10px] uppercase tracking-widest px-3">Supervisor Hub</Badge>
            <span className="h-1 w-1 bg-slate-300 rounded-full" />
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Planta Industrial</span>
          </div>
          <h1 className="text-4xl font-black text-slate-900 tracking-tight uppercase">Skill Gap Analyst</h1>
          <p className="text-slate-500 font-medium">Monitoreo de competencias críticas y cumplimiento de seguridad operacional.</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" className="rounded-xl font-black uppercase text-[10px] h-11 border-slate-200">
            Exportar Auditoría
          </Button>
          <Button className="rounded-xl font-black uppercase text-[10px] h-11 shadow-lg shadow-indigo-200 bg-indigo-600 hover:bg-indigo-700">
            Asignar Formación Masiva
          </Button>
        </div>
      </div>

      {/* STATS GRID */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6">
        <StatCard 
          icon={<Users className="w-5 h-5" />} 
          label="Plantilla Total" 
          value={stats.totalStaff} 
          sub="Personal Activo"
          color="indigo" 
        />
        <StatCard 
          icon={<CheckCircle2 className="w-5 h-5" />} 
          label="Certificados" 
          value={stats.fullyQualified} 
          sub="100% Calificados"
          color="emerald" 
        />
        <StatCard 
          icon={<ShieldAlert className="w-5 h-5" />} 
          label="Riesgos Activos" 
          value={stats.atRiskWorkOrders} 
          sub="Órdenes Bloqueadas"
          color="rose" 
        />
        <StatCard 
          icon={<TrendingUp className="w-5 h-5" />} 
          label="Nivel de Competencia" 
          value={`${((stats.fullyQualified / (stats.totalStaff || 1)) * 100).toFixed(0)}%`} 
          sub="Media Global"
          color="blue" 
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
        {/* MAIN PANEL: STAFF LIST */}
        <div className="lg:col-span-8 space-y-6">
          <Card className="border-none shadow-xl shadow-slate-200/50 rounded-[2.5rem] overflow-hidden">
            <CardHeader className="flex flex-row items-center justify-between pb-6 border-b border-slate-50">
              <div>
                <CardTitle className="text-lg font-black uppercase">Matriz de Habilidades</CardTitle>
                <CardDescription>Estado de certificación por cada colaborador.</CardDescription>
              </div>
              <div className="relative w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input 
                  placeholder="Buscar operario..." 
                  className="pl-10 rounded-xl border-slate-100 bg-slate-50 text-xs font-bold"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-slate-50/50 border-b border-slate-50">
                      <th className="px-6 py-4 text-[10px] font-black uppercase text-slate-400 tracking-widest">Colaborador</th>
                      <th className="px-6 py-4 text-[10px] font-black uppercase text-slate-400 tracking-widest">Estado Academy</th>
                      <th className="px-6 py-4 text-[10px] font-black uppercase text-slate-400 tracking-widest">Cursos Pendientes</th>
                      <th className="px-6 py-4 text-[10px] font-black uppercase text-slate-400 tracking-widest">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {filteredReport.map((s: any) => (
                      <tr key={s.userId} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center font-black text-slate-500 uppercase">
                              {s.name.substring(0, 2)}
                            </div>
                            <div>
                              <p className="text-sm font-black text-slate-900">{s.name}</p>
                              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tight">{s.role || 'Operario'}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          {!s.hasAcademyProfile ? (
                            <Badge className="bg-amber-50 text-amber-600 border-none text-[9px] font-black uppercase px-3">Sin Perfil</Badge>
                          ) : (
                            <div className="flex items-center gap-2">
                              <Badge className={`border-none text-[9px] font-black uppercase px-3 ${
                                s.status === 'FULLY_QUALIFIED' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-50 text-blue-600'
                              }`}>
                                {s.certificationsCount} Certificados
                              </Badge>
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex flex-wrap gap-1 max-w-[200px]">
                            {s.missingSkills.length === 0 ? (
                              <span className="text-[10px] font-black text-emerald-600 uppercase">Completo ✅</span>
                            ) : (
                              s.missingSkills.slice(0, 2).map((ms: any) => (
                                <Badge key={ms.id} variant="outline" className="text-[8px] font-bold text-slate-400 border-slate-200">
                                  {ms.titulo}
                                </Badge>
                              ))
                            )}
                            {s.missingSkills.length > 2 && (
                              <span className="text-[8px] font-bold text-slate-400">+{s.missingSkills.length - 2} más</span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <Button variant="ghost" size="icon" className="rounded-full text-slate-400">
                            <Mail className="w-4 h-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="rounded-full text-slate-400">
                            <ArrowRight className="w-4 h-4" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* SIDEBAR: GEMMA ANALYST */}
        <div className="lg:col-span-4 space-y-8">
          {/* GEMMA PREDICTIVE CARD */}
          <Card className="border-none shadow-2xl shadow-slate-900/20 bg-slate-950 text-white rounded-[2.5rem] overflow-hidden relative">
            <div className="absolute top-0 right-0 p-6 opacity-10">
              <Cpu className="w-24 h-24" />
            </div>
            <CardHeader className="relative z-10 pb-2">
              <div className="flex items-center gap-2 mb-2">
                <div className="h-2 w-2 bg-primary rounded-full animate-pulse" />
                <span className="text-[10px] font-black uppercase tracking-widest text-primary">Gemma Skill Gap Analyst</span>
              </div>
              <CardTitle className="text-2xl font-black tracking-tight italic uppercase">Predicción de Riesgo</CardTitle>
            </CardHeader>
            <CardContent className="relative z-10 space-y-6 pt-2">
              <div className="p-4 rounded-2xl bg-white/5 border border-white/10 border-l-4 border-l-primary">
                <p className="text-xs text-slate-300 leading-relaxed italic">
                  "He detectado un riesgo crítico para el lote #1032. La orden requiere certificación en <b>Protocolo Solar S3</b>, pero ninguno de los operarios del turno de tarde posee el certificado válido."
                </p>
              </div>

              <div className="space-y-4">
                <h4 className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Acciones Sugeridas</h4>
                <div className="space-y-2">
                  <div className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors cursor-pointer group">
                    <Zap className="w-4 h-4 text-amber-500" />
                    <div className="flex-1">
                      <p className="text-[10px] font-black uppercase">Reasignar Turno</p>
                      <p className="text-[9px] text-slate-400">Mover a Carlos Ruiz al turno de tarde.</p>
                    </div>
                    <ArrowRight className="w-3 h-3 text-slate-600 group-hover:text-white transition-all" />
                  </div>
                  <div className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors cursor-pointer group">
                    <GraduationCap className="w-4 h-4 text-blue-500" />
                    <div className="flex-1">
                      <p className="text-[10px] font-black uppercase">Flash Training</p>
                      <p className="text-[9px] text-slate-400">Habilitar curso intensivo para equipo B.</p>
                    </div>
                    <ArrowRight className="w-3 h-3 text-slate-600 group-hover:text-white transition-all" />
                  </div>
                </div>
              </div>

              <Button className="w-full bg-primary text-primary-foreground font-black uppercase text-[10px] h-12 rounded-2xl shadow-xl shadow-primary/20">
                Ejecutar Optimización
              </Button>
            </CardContent>
          </Card>

          {/* CRITICAL RISKS FEED */}
          <Card className="border-none shadow-xl shadow-slate-200/50 rounded-[2.5rem]">
            <CardHeader>
              <CardTitle className="text-xs font-black uppercase tracking-widest text-slate-400">Alertas de Bloqueo</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {risks.length === 0 ? (
                <div className="flex flex-col items-center justify-center p-8 text-center bg-slate-50 rounded-3xl border border-dashed border-slate-200">
                  <CheckCircle2 className="w-8 h-8 text-emerald-400 mb-2" />
                  <p className="text-[10px] font-black uppercase text-slate-500">Sin Bloqueos de Seguridad</p>
                </div>
              ) : (
                risks.map((risk: any, i: number) => (
                  <div key={i} className="p-4 rounded-2xl bg-rose-50 border border-rose-100 flex items-start gap-4 animate-in fade-in slide-in-from-right-5">
                    <div className="h-8 w-8 bg-rose-100 rounded-lg flex items-center justify-center text-rose-600 shrink-0">
                      <FileWarning className="w-4 h-4" />
                    </div>
                    <div className="flex-1">
                      <p className="text-xs font-black text-rose-900 uppercase">Orden #{risk.batchNumber}</p>
                      <p className="text-[10px] text-rose-600 font-medium leading-tight mt-1">{risk.message}</p>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

function StatCard({ icon, label, value, sub, color }: any) {
  const colorMap: any = {
    indigo: 'bg-indigo-50 text-indigo-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    rose: 'bg-rose-50 text-rose-600',
    blue: 'bg-blue-50 text-blue-600',
  }

  return (
    <Card className="border-none shadow-sm hover:shadow-md transition-all rounded-3xl group">
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className={`p-3 rounded-2xl ${colorMap[color] || 'bg-slate-50 text-slate-600'}`}>
            {icon}
          </div>
          <MoreVertical className="w-4 h-4 text-slate-200 group-hover:text-slate-400 transition-colors" />
        </div>
        <div className="space-y-1">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{label}</p>
          <p className="text-3xl font-black tracking-tighter text-slate-900">{value}</p>
          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{sub}</p>
        </div>
      </CardContent>
    </Card>
  )
}
