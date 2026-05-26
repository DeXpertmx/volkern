'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { 
  Users, 
  Plus, 
  TrendingUp, 
  Cpu, 
  Database,
  Calculator,
  Landmark,
  FileText,
  Building2
} from 'lucide-react'
import { AccountingSlotList } from '@/components/accounting/AccountingSlotList'
import { AccountingSlotProvisioningModal } from '@/components/accounting/AccountingSlotProvisioningModal'

export default function AccountingDashboardPage() {
  const [stats, setStats] = useState({
    totalSlots: 0,
    maxSlots: 0,
    activeLeads: 0,
    aiCalls: 0
  })
  const [isLoading, setIsLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)

  useEffect(() => {
    const fetchAccountingData = async () => {
      try {
        const [slotsRes, userRes, usageRes] = await Promise.all([
          fetch('/api/accounting/slots').then(res => res.json()),
          fetch('/api/users/me').then(res => res.json()),
          fetch('/api/v1/agency/analytics/usage').then(res => res.json().catch(() => ({})))
        ])

        const totalSlots = Array.isArray(slotsRes) ? slotsRes.length : 0
        const maxSlots = userRes.tenant?.maxSlots || 0
        
        setStats({
          totalSlots,
          maxSlots,
          activeLeads: slotsRes.reduce((acc: number, slot: any) => acc + (slot._count?.leads || 0), 0),
          aiCalls: usageRes.stats?.totalCalls || 0
        })
        setRecentActivity(usageRes.recentLogs || [])
      } catch (error) {
        console.error('Error fetching accounting stats:', error)
      } finally {
        setIsLoading(false)
      }
    }

    fetchAccountingData()
  }, [])

  const [recentActivity, setRecentActivity] = useState<any[]>([])

  const usagePercentage = stats.maxSlots > 0 ? (stats.totalSlots / stats.maxSlots) * 100 : 0

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight uppercase italic flex items-center gap-3">
            <Calculator className="h-8 w-8 text-emerald-500" />
            Asesoría Contable
          </h1>
          <p className="text-muted-foreground">Gestiona tus clientes de contabilidad, fiscalidad y conciliación bancaria.</p>
        </div>
        <Button onClick={() => setIsModalOpen(true)} className="bg-emerald-600 hover:bg-emerald-500 hover:scale-105 transition-transform shadow-lg shadow-emerald-600/25">
          <Plus className="mr-2 h-4 w-4" /> Nuevo Cliente
        </Button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-emerald-500/10 to-transparent border-emerald-500/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2 text-emerald-600">
              <Building2 className="h-4 w-4" /> Clientes Activos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black">{stats.totalSlots} / {stats.maxSlots}</div>
            <Progress value={usagePercentage} className="h-2 mt-4" />
            <p className="text-[10px] text-muted-foreground mt-2 uppercase font-bold tracking-widest">
              {Math.round(usagePercentage)}% de capacidad consumida
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-green-500" /> Leads Gestionados
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black">{stats.activeLeads.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground mt-1">Total de todos tus clientes</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Landmark className="h-4 w-4 text-blue-500" /> Conciliaciones
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black">—</div>
            <p className="text-xs text-muted-foreground mt-1">Conexión bancaria activa</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <FileText className="h-4 w-4 text-orange-500" /> Declaraciones
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black">—</div>
            <p className="text-xs text-muted-foreground mt-1">Modelos 303 / IVA</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Grid: Slot List & Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <Card className="lg:col-span-2 border-emerald-500/10 shadow-xl">
          <CardHeader className="bg-emerald-500/5 border-b">
            <CardTitle className="flex items-center gap-2 uppercase text-xs font-black tracking-widest text-emerald-600">
              <Building2 className="h-4 w-4" /> Tus Clientes de Asesoría
            </CardTitle>
            <CardDescription>Visualiza y gestiona las empresas que confían en tu despacho.</CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            <AccountingSlotList isLoading={isLoading} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-xl font-bold uppercase tracking-tight">Actividad de IA</CardTitle>
            <CardDescription>Logs recientes de tus clientes.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recentActivity.length === 0 ? (
                <p className="text-center py-8 text-muted-foreground text-xs uppercase font-bold italic">No hay actividad reciente</p>
              ) : (
                recentActivity.map((log: any) => (
                  <div key={log.id} className="flex flex-col p-3 rounded-lg border bg-accent/10">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-[10px] font-black uppercase text-primary">{log.skill}</span>
                      <span className="text-[9px] text-muted-foreground">{new Date(log.timestamp).toLocaleTimeString()}</span>
                    </div>
                    <p className="text-xs font-bold truncate">En: {log.tenant}</p>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Provisioning Modal */}
      <AccountingSlotProvisioningModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)}
        onSuccess={() => window.location.reload()} 
      />
    </div>
  )
}
