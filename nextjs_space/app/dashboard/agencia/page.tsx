'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { 
  Users, 
  Plus, 
  ExternalLink, 
  TrendingUp, 
  Cpu, 
  Database,
  Building 
} from 'lucide-react'
import { SlotList } from '@/components/agency/SlotList'
import { SlotProvisioningModal } from '@/components/agency/SlotProvisioningModal'

export default function AgencyDashboardPage() {
  const [stats, setStats] = useState({
    totalSlots: 0,
    maxSlots: 0,
    activeLeads: 0,
    aiCalls: 0
  })
  const [isLoading, setIsLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)

  useEffect(() => {
    const fetchAgencyData = async () => {
      try {
        const [slotsRes, userRes, usageRes] = await Promise.all([
          fetch('/api/agency/slots').then(res => res.json()),
          fetch('/api/users/me').then(res => res.json()),
          fetch('/api/v1/agency/analytics/usage').then(res => res.json())
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
        console.error('Error fetching agency stats:', error)
      } finally {
        setIsLoading(false)
      }
    }

    fetchAgencyData()
  }, [])

  const [recentActivity, setRecentActivity] = useState<any[]>([])

  const usagePercentage = (stats.totalSlots / stats.maxSlots) * 100

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight uppercase italic">Agency Hub</h1>
          <p className="text-muted-foreground">Gestiona tus slots de cliente y la identidad de tu marca.</p>
        </div>
        <Button onClick={() => setIsModalOpen(true)} className="bg-primary hover:scale-105 transition-transform">
          <Plus className="mr-2 h-4 w-4" /> Nuevo Slot de Cliente
        </Button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-primary/10 to-transparent border-primary/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2 text-primary">
              <Users className="h-4 w-4" /> Slots Utilizados
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
              <Cpu className="h-4 w-4 text-purple-500" /> Créditos AI Gemma
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black">{stats.aiCalls.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground mt-1">Consumo mensual agregado</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Database className="h-4 w-4 text-orange-500" /> Bases de Datos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black">{stats.totalSlots} Activas</div>
            <p className="text-xs text-muted-foreground mt-1">Silos aislados por cliente</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Grid: Slot List & Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-xl font-bold uppercase tracking-tight">Tus Clientes Activos</CardTitle>
            <CardDescription>Visualiza y gestiona las subcuentas de tu agencia.</CardDescription>
          </CardHeader>
          <CardContent>
            <SlotList isLoading={isLoading} />
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
      <SlotProvisioningModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)}
        onSuccess={() => window.location.reload()} 
      />
    </div>
  )
}
