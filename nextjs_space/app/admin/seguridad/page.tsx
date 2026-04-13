'use client'

import { useState, useEffect } from 'react'
import { 
  ShieldAlert, 
  AlertTriangle, 
  Clock, 
  Search, 
  Filter,
  CheckCircle2,
  XCircle,
  Eye,
  Building2,
  Loader2
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table'

export default function SecurityAdminPage() {
  const [incidents, setIncidents] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Simulación de carga de incidentes globales
    setTimeout(() => {
      setIncidents([
        {
          id: 'inc_1',
          tenantName: 'SolarTech Mexico',
          type: 'GPS_DISTANCE_ANOMALY',
          severity: 'CRITICAL',
          details: 'Reporte de merma a 505km del proyecto activo.',
          timestamp: new Date().toISOString(),
          status: 'PENDING'
        },
        {
          id: 'inc_2',
          tenantName: 'Energia Vital',
          type: 'INTEGRITY_ANOMALY',
          severity: 'HIGH',
          details: 'Fraude detectado por IA: Foto de pantalla (Moiré pattern).',
          timestamp: new Date(Date.now() - 3600000).toISOString(),
          status: 'RESOLVED'
        },
        {
          id: 'inc_3',
          tenantName: 'Volkern Test',
          type: 'ATTENDANCE_TIMEOUT',
          severity: 'MEDIUM',
          details: 'Desafío Random Pulse expirado sin respuesta del operario.',
          timestamp: new Date(Date.now() - 7200000).toISOString(),
          status: 'PENDING'
        }
      ])
      setLoading(false)
    }, 1000)
  }, [])

  const [isAuditing, setIsAuditing] = useState(false)
  const [auditProgress, setAuditProgress] = useState(0)
  const [auditComplete, setAuditComplete] = useState(false)

  const handleAudit = () => {
    setIsAuditing(true);
    setAuditProgress(0);
    setAuditComplete(false);
    
    const interval = setInterval(() => {
      setAuditProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          setAuditComplete(true);
          setIsAuditing(false);
          return 100;
        }
        return prev + 5;
      });
    }, 150);
  }

  return (
    <div className="space-y-10">
      <div className="flex justify-between items-end gap-10">
        <div className="flex-1">
          <h1 className="text-4xl font-black text-[#1A365D] uppercase tracking-tighter italic">Vigilancia Industrial</h1>
          <p className="text-[#4A5568] font-bold text-xs uppercase tracking-widest opacity-60">Global Vision-Lock Oversight</p>
        </div>
        <div className="flex gap-3">
          <Button 
            onClick={handleAudit}
            className="rounded-lg h-12 px-8 bg-[#1A365D] hover:bg-[#1A365D]/90 text-white font-black uppercase tracking-widest text-[10px] shadow-2xl shadow-indigo-900/20"
          >
            {isAuditing ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <ShieldAlert className="w-4 h-4 mr-2" />
            )}
            {isAuditing ? `Sincronizando... ${auditProgress}%` : 'Audit Global Cloud'}
          </Button>
        </div>
      </div>

      {auditComplete && (
        <div className="bg-emerald-50 border border-emerald-100 p-4 rounded-2xl flex items-center justify-between animate-in fade-in slide-in-from-top-4 duration-700">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-emerald-500 flex items-center justify-center text-white shadow-lg shadow-emerald-500/20">
              <CheckCircle2 size={20} />
            </div>
            <div>
              <p className="text-xs font-black text-emerald-900 uppercase tracking-widest leading-none mb-1">Integridad Sincronizada</p>
              <p className="text-[10px] font-bold text-emerald-600">CLOUD HASH SYNC: VERIFIED</p>
            </div>
          </div>
          <Badge className="bg-emerald-600 text-white font-black text-[9px] uppercase tracking-widest px-4 border-none">Secure</Badge>
        </div>
      )}

      {/* Alertas Críticas - TACTICAL BORDER STYLE */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white border-l-4 border-rose-500 p-6 rounded-2xl shadow-sm space-y-2">
          <div className="flex items-center gap-2 text-rose-600 text-[10px] font-black uppercase tracking-widest">
            <ShieldAlert size={14} />
            <span>Alertas Críticas</span>
          </div>
          <p className="text-3xl font-black text-[#1A365D] tracking-tighter leading-none">12</p>
          <p className="text-[10px] font-bold text-slate-400">Anomalías detectadas en las últimas 24h.</p>
        </div>

        <div className="bg-white border-l-4 border-amber-500 p-6 rounded-2xl shadow-sm space-y-2">
          <div className="flex items-center gap-2 text-amber-600 text-[10px] font-black uppercase tracking-widest">
            <AlertTriangle size={14} />
            <span>Fraudes Detectados</span>
          </div>
          <p className="text-3xl font-black text-[#1A365D] tracking-tighter leading-none">45</p>
          <p className="text-[10px] font-bold text-slate-400">Intentos de manipulación de integridad (IA).</p>
        </div>
      </div>

      {/* Tabla de Anomalías - CLEAN OFFICE STYLE */}
      <Card className="border border-[#E2E8F0] shadow-sm rounded-3xl overflow-hidden bg-white">
        <CardHeader className="bg-white border-b border-slate-50 p-8">
          <div className="flex items-center justify-between">
            <CardTitle className="text-xl font-black text-[#1A365D] uppercase tracking-tight">Registro de Anomalías Vision-Lock</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-slate-50/50">
              <TableRow className="border-b border-slate-100 italic">
                <TableHead className="text-[10px] font-black uppercase tracking-widest text-[#4A5568] h-14">Tenant</TableHead>
                <TableHead className="text-[10px] font-black uppercase tracking-widest text-[#4A5568] h-14">Alerta</TableHead>
                <TableHead className="text-[10px] font-black uppercase tracking-widest text-[#4A5568] h-14">Detalles</TableHead>
                <TableHead className="text-[10px] font-black uppercase tracking-widest text-[#4A5568] h-14">Severidad</TableHead>
                <TableHead className="text-[10px] font-black uppercase tracking-widest text-[#4A5568] h-14">Estado</TableHead>
                <TableHead className="text-right text-[10px] font-black uppercase tracking-widest text-[#4A5568] h-14 pr-8">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-64 text-center">
                    <Loader2 className="w-8 h-8 animate-spin mx-auto text-[#1A365D]/30" />
                  </TableCell>
                </TableRow>
              ) : incidents.map((inc) => (
                <TableRow key={inc.id} className="hover:bg-[#F8FAFC] transition-colors border-b border-slate-50">
                  <TableCell className="py-5">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-xl bg-slate-50 border border-slate-100 text-[#1A365D]">
                        <Building2 size={16} />
                      </div>
                      <span className="text-sm font-bold text-[#1A365D] tracking-tight">{inc.tenantName}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[9px] font-black px-2 py-0 border-[#1A365D]/20 text-[#1A365D] bg-slate-50 uppercase">
                      {inc.type}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-[400px]">
                    <p className="text-[11px] font-bold text-[#4A5568] leading-tight">{inc.details}</p>
                    <p className="text-[9px] font-black text-slate-400 mt-1 uppercase tracking-widest">{new Date(inc.timestamp).toLocaleString()}</p>
                  </TableCell>
                  <TableCell>
                    <Badge className={cn(
                      "text-[9px] font-black uppercase px-3 py-1 border-none",
                      inc.severity === 'CRITICAL' ? "bg-rose-50 text-rose-600" :
                      inc.severity === 'HIGH' ? "bg-amber-100 text-amber-700" : "bg-indigo-50 text-indigo-600"
                    )}>
                      {inc.severity}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <div className={cn(
                        "w-1.5 h-1.5 rounded-full",
                        inc.status === 'RESOLVED' ? "bg-emerald-500" : "bg-amber-500 animate-pulse"
                      )} />
                      <span className="text-[10px] font-black uppercase text-slate-500 tracking-widest">{inc.status}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right pr-8">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl hover:bg-white hover:shadow-sm">
                        <Eye className="w-4 h-4 text-slate-400 hover:text-[#1A365D]" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl hover:bg-rose-50 group">
                        <XCircle className="w-4 h-4 text-slate-400 group-hover:text-rose-500" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

function cn(...inputs: any[]) {
  return inputs.filter(Boolean).join(' ')
}
