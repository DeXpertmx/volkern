'use client'

import { useState } from 'react'
import { 
  Users, 
  Wallet, 
  TrendingDown, 
  Heart, 
  Search, 
  Plus, 
  UserPlus, 
  Calendar, 
  ArrowRight,
  ShieldAlert,
  GraduationCap,
  Briefcase,
  MoreVertical,
  Lock,
  Eye
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'

export default function HRMDashboard() {
  const stats = [
    { label: 'Total Empleados', value: '124', icon: Users, color: 'text-blue-500', bg: 'bg-blue-500/10' },
    { label: 'Nómina Mensual', value: '••••••', icon: Wallet, color: 'text-emerald-500', bg: 'bg-emerald-500/10', encrypted: true },
    { label: 'Riesgo Rotación', value: '4.2%', icon: TrendingDown, color: 'text-rose-500', bg: 'bg-rose-500/10' },
    { label: 'Engagement Score', value: '88/100', icon: Heart, color: 'text-purple-500', bg: 'bg-purple-500/10' },
  ]

  const employees = [
    { name: 'Carlos Mendoza', role: 'Ingeniero Sr.', dept: 'Operaciones', risk: 'LOW', status: 'Active' },
    { name: 'Ana García', role: 'Project Manager', dept: 'Comercial', risk: 'HIGH', status: 'On Leave' },
    { name: 'Roberto Jasso', role: 'Técnico Campo', dept: 'Instalaciones', risk: 'MEDIUM', status: 'Active' },
  ]

  return (
    <div className="space-y-8 pb-10">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-black tracking-tight uppercase">Talento & Nómina (HRM)</h1>
          <p className="text-muted-foreground font-medium text-sm">Gestión de capital humano y bóveda de seguridad Vault 2.0.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="rounded-xl font-bold uppercase text-[10px] h-10 px-4">
            <Lock className="w-4 h-4 mr-2" /> Desbloquear Bóveda
          </Button>
          <Button className="rounded-xl font-bold uppercase text-[10px] h-10 px-4 shadow-lg shadow-primary/20">
            <UserPlus className="w-4 h-4 mr-2" /> Nuevo Empleado
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
                {stat.encrypted && <Badge className="bg-slate-100 text-slate-500 border-none font-black text-[8px] uppercase">Vault 2.0</Badge>}
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">{stat.label}</p>
                <div className="flex items-center gap-2">
                   <p className="text-2xl font-black tracking-tighter">{stat.value}</p>
                   {stat.encrypted && <Eye className="w-4 h-4 text-slate-300 cursor-pointer" />}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Employee Directory */}
        <Card className="lg:col-span-8 border-none shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div>
              <CardTitle className="text-lg font-bold uppercase">Directorio de Talento</CardTitle>
              <CardDescription>Gestión activa de la plantilla industrial.</CardDescription>
            </div>
            <div className="relative w-48">
               <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
               <input className="w-full pl-9 pr-3 py-2 bg-slate-50 border-none rounded-xl text-xs" placeholder="Buscar..." />
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {employees.map((emp, i) => (
                <div key={i} className="group p-4 rounded-2xl bg-slate-50 border border-transparent hover:border-slate-200 hover:bg-white transition-all flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 bg-indigo-100 rounded-xl flex items-center justify-center font-bold text-indigo-600 text-xs">
                       {emp.name.split(' ').map(n => n[0]).join('')}
                    </div>
                    <div>
                      <h4 className="font-bold text-sm tracking-tight">{emp.name}</h4>
                      <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">{emp.role} • {emp.dept}</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-8">
                    <div className="hidden md:block w-24">
                       <span className="text-[9px] font-black text-muted-foreground uppercase">Retención</span>
                       <div className="flex items-center gap-2 mt-1">
                          <Progress value={emp.risk === 'HIGH' ? 30 : (emp.risk === 'MEDIUM' ? 60 : 95)} className="h-1" />
                       </div>
                    </div>
                    <Badge className={`${emp.risk === 'LOW' ? 'bg-emerald-50 text-emerald-600' : (emp.risk === 'MEDIUM' ? 'bg-amber-50 text-amber-600' : 'bg-rose-50 text-rose-600')} border-none px-3 font-black uppercase text-[9px]`}>
                      RIESGO {emp.risk}
                    </Badge>
                    <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full">
                      <ArrowRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* AI HR Insights */}
        <div className="lg:col-span-4 space-y-6">
          <Card className="border-none shadow-sm bg-rose-950 text-white overflow-hidden group">
            <CardHeader className="relative z-10 pb-2">
              <div className="flex items-center gap-2 mb-1">
                <ShieldAlert className="w-4 h-4 text-rose-400" />
                <span className="text-[10px] font-black uppercase tracking-widest text-rose-400">Gemma Talent Lookout</span>
              </div>
              <CardTitle className="text-xl font-bold tracking-tight">Retención Crítica</CardTitle>
            </CardHeader>
            <CardContent className="relative z-10 space-y-4 pt-2">
              <div className="p-4 rounded-xl bg-rose-900/40 border border-white/10 text-xs text-rose-100 leading-relaxed shadow-inner">
                "Detectado aumento de carga del 22% en <span className="text-white font-bold">Instalaciones</span>. Ana García muestra señales de burnout debido a la asignación en 3 proyectos paralelos."
              </div>
              <Button className="w-full rounded-xl bg-rose-500 hover:bg-rose-400 text-white text-[10px] font-black uppercase tracking-widest h-12 shadow-lg shadow-rose-500/20">
                Ver Plan de Mitigación
              </Button>
            </CardContent>
          </Card>

          <Card className="border-none shadow-sm">
             <CardHeader className="pb-3 flex flex-row items-center justify-between">
                <CardTitle className="text-xs font-black uppercase flex items-center gap-2">
                   <GraduationCap className="w-4 h-4 text-primary" />
                   Training Maturity
                </CardTitle>
                <span className="text-[10px] font-bold text-primary">82% Global</span>
             </CardHeader>
             <CardContent className="space-y-4">
                <div className="space-y-1">
                   <div className="flex justify-between text-[9px] font-bold uppercase">
                      <span>Procesos Planta</span>
                      <span>95%</span>
                   </div>
                   <Progress value={95} className="h-1" />
                </div>
                <div className="space-y-1">
                   <div className="flex justify-between text-[9px] font-bold uppercase">
                      <span>Seguridad Industrial</span>
                      <span>68%</span>
                   </div>
                   <Progress value={68} className="h-1 bg-amber-100" />
                </div>
             </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
