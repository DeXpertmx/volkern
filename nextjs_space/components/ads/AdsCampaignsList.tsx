'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Loader2, AlertTriangle, Play, Pause, RefreshCw, Search, Eye, ExternalLink } from 'lucide-react'
import { useToast } from '@/components/ui/use-toast'

interface Campaign {
  id: string
  externalId: string | null
  name: string
  status: string
  objective: string | null
  dailyBudget: number | null
  lifetimeBudget: number | null
  startDate: string | null
  endDate: string | null
  platform?: {
    platform: string
    accountName: string | null
  } | string | null
  platformConnection?: {
    platform: string
    accountName: string | null
  } | null
  _count?: {
    adSets: number
    ads: number
  }
}

const PLATFORM_LABELS: Record<string, string> = {
  meta: 'Meta Ads',
  google: 'Google Ads',
  linkedin: 'LinkedIn Ads',
  tiktok: 'TikTok Ads',
}

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  ACTIVE: { label: 'Activa', className: 'bg-green-50 text-green-700 border-green-200' },
  PAUSED: { label: 'Pausada', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  ARCHIVED: { label: 'Archivada', className: 'bg-slate-50 text-slate-500 border-slate-200' },
  DELETED: { label: 'Eliminada', className: 'bg-red-50 text-red-700 border-red-200' },
  PENDING: { label: 'Pendiente', className: 'bg-blue-50 text-blue-700 border-blue-200' },
}

export function AdsCampaignsList() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [platformFilter, setPlatformFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const { toast } = useToast()

  useEffect(() => {
    fetchCampaigns()
  }, [])

  async function fetchCampaigns() {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      if (statusFilter !== 'all') params.set('status', statusFilter)
      if (search) params.set('search', search)
      const res = await fetch(`/api/ads/campaigns?${params.toString()}`)
      if (!res.ok) throw new Error('Error al cargar campañas')
      const data = await res.json()
      const list = Array.isArray(data.campaigns) ? data.campaigns : Array.isArray(data) ? data : []
      setCampaigns(list)
    } catch {
      setCampaigns([])
    } finally {
      setLoading(false)
    }
  }

  async function handlePause(campaignId: string) {
    try {
      setActionLoading(campaignId)
      const res = await fetch(`/api/ads/campaigns/${campaignId}/pause`, { method: 'POST' })
      if (!res.ok) throw new Error('Error al pausar')
      toast({ title: 'Campaña pausada exitosamente' })
      fetchCampaigns()
    } catch (err) {
      toast({
        title: 'Error al pausar',
        description: err instanceof Error ? err.message : 'Error desconocido',
        variant: 'destructive',
      })
    } finally {
      setActionLoading(null)
    }
  }

  async function handleResume(campaignId: string) {
    try {
      setActionLoading(campaignId)
      const res = await fetch(`/api/ads/campaigns/${campaignId}/resume`, { method: 'POST' })
      if (!res.ok) throw new Error('Error al reanudar')
      toast({ title: 'Campaña reanudada exitosamente' })
      fetchCampaigns()
    } catch (err) {
      toast({
        title: 'Error al reanudar',
        description: err instanceof Error ? err.message : 'Error desconocido',
        variant: 'destructive',
      })
    } finally {
      setActionLoading(null)
    }
  }

  async function handleSync(campaignId: string) {
    try {
      setActionLoading(campaignId)
      const res = await fetch(`/api/ads/campaigns/${campaignId}/sync`, { method: 'POST' })
      if (!res.ok) throw new Error('Error al sincronizar')
      toast({ title: 'Sincronización iniciada' })
    } catch (err) {
      toast({
        title: 'Error al sincronizar',
        description: err instanceof Error ? err.message : 'Error desconocido',
        variant: 'destructive',
      })
    } finally {
      setActionLoading(null)
    }
  }

  const filteredCampaigns = campaigns.filter(c => {
    if (search && !c.name.toLowerCase().includes(search.toLowerCase())) return false
    if (platformFilter !== 'all') {
      const p = (c.platform as any)?.platform || c.platform || c.platformConnection?.platform || ''
      if (String(p).toLowerCase() !== platformFilter) return false
    }
    return true
  })

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar campañas..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={platformFilter} onValueChange={setPlatformFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Plataforma" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            <SelectItem value="meta">Meta Ads</SelectItem>
            <SelectItem value="google">Google Ads</SelectItem>
            <SelectItem value="linkedin">LinkedIn Ads</SelectItem>
            <SelectItem value="tiktok">TikTok Ads</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="ACTIVE">Activas</SelectItem>
            <SelectItem value="PAUSED">Pausadas</SelectItem>
            <SelectItem value="ARCHIVED">Archivadas</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="icon" onClick={fetchCampaigns} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {/* Tabla */}
      <Card className="border shadow-sm">
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center p-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary opacity-20" />
            </div>
          ) : filteredCampaigns.length === 0 ? (
            <div className="text-center p-8 text-sm text-muted-foreground">
              <AlertTriangle className="h-6 w-6 mx-auto mb-2 opacity-40" />
              No se encontraron campañas
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[11px] font-bold uppercase">Nombre</TableHead>
                  <TableHead className="text-[11px] font-bold uppercase">Plataforma</TableHead>
                  <TableHead className="text-[11px] font-bold uppercase">Estado</TableHead>
                  <TableHead className="text-[11px] font-bold uppercase">Objetivo</TableHead>
                  <TableHead className="text-[11px] font-bold uppercase">Presupuesto</TableHead>
                  <TableHead className="text-[11px] font-bold uppercase">Anuncios</TableHead>
                  <TableHead className="text-[11px] font-bold uppercase text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCampaigns.map(campaign => {
                  const statusInfo = STATUS_BADGE[campaign.status] || { label: campaign.status, className: '' }
                  const platformKey = String(
                    (campaign.platform as any)?.platform || campaign.platform || campaign.platformConnection?.platform || ''
                  ).toLowerCase()
                  const platformLabel = PLATFORM_LABELS[platformKey] || platformKey || '—'
                  const budgetStr = campaign.dailyBudget
                    ? `$${Number(campaign.dailyBudget).toFixed(2)}/día`
                    : campaign.lifetimeBudget
                      ? `$${Number(campaign.lifetimeBudget).toFixed(2)} total`
                      : '—'
                  const adSets = campaign._count?.adSets ?? 0
                  const ads = campaign._count?.ads ?? 0
                  return (
                    <TableRow key={campaign.id} className="group">
                      <TableCell className="font-medium text-sm">
                        <div className="flex items-center gap-2">
                          <span>{campaign.name}</span>
                          {campaign.externalId && (
                            <ExternalLink className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px]">
                          {platformLabel}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`text-[10px] ${statusInfo.className}`}>
                          {statusInfo.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {campaign.objective || '—'}
                      </TableCell>
                      <TableCell className="text-xs font-mono">
                        {budgetStr}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {adSets} sets · {ads} ads
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            onClick={() => window.location.href = `/dashboard/ads/campaigns/${campaign.id}`}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          {campaign.status === 'ACTIVE' ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 text-amber-500 hover:text-amber-700 hover:bg-amber-50"
                              onClick={() => handlePause(campaign.id)}
                              disabled={actionLoading === campaign.id}
                            >
                              {actionLoading === campaign.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Pause className="h-4 w-4" />
                              )}
                            </Button>
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 text-green-500 hover:text-green-700 hover:bg-green-50"
                              onClick={() => handleResume(campaign.id)}
                              disabled={actionLoading === campaign.id}
                            >
                              {actionLoading === campaign.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Play className="h-4 w-4" />
                              )}
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            onClick={() => handleSync(campaign.id)}
                            disabled={actionLoading === campaign.id}
                          >
                            <RefreshCw className={`h-4 w-4 ${actionLoading === campaign.id ? 'animate-spin' : ''}`} />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
