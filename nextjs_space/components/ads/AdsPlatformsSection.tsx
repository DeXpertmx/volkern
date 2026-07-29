'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, AlertTriangle, CheckCircle, XCircle, ExternalLink, RefreshCw, Plus } from 'lucide-react'
import { useToast } from '@/components/ui/use-toast'

interface Platform {
  id: string
  platform: string
  accountName: string | null
  accountId: string | null
  status: string
  connectedAt: string | null
  lastSyncAt: string | null
}

const PLATFORM_CONFIG: Record<string, { name: string; color: string; icon: string }> = {
  meta: { name: 'Meta Ads', color: 'text-blue-600', icon: '📘' },
  google: { name: 'Google Ads', color: 'text-green-600', icon: '📊' },
  linkedin: { name: 'LinkedIn Ads', color: 'text-sky-600', icon: '💼' },
  tiktok: { name: 'TikTok Ads', color: 'text-rose-500', icon: '🎵' },
}

export function AdsPlatformsSection() {
  const [platforms, setPlatforms] = useState<Platform[]>([])
  const [loading, setLoading] = useState(true)
  const [connecting, setConnecting] = useState<string | null>(null)
  const [disconnecting, setDisconnecting] = useState<string | null>(null)
  const { toast } = useToast()

  useEffect(() => {
    fetchPlatforms()
  }, [])

  async function fetchPlatforms() {
    try {
      setLoading(true)
      const res = await fetch('/api/ads/platforms')
      if (!res.ok) throw new Error('Error al cargar plataformas')
      const data = await res.json()
      const list = Array.isArray(data.platforms) ? data.platforms : Array.isArray(data) ? data : []
      setPlatforms(list.map((p: any) => ({
        id: p.id,
        platform: String(p.platform || '').toLowerCase(),
        accountName: p.accountName,
        accountId: p.accountId,
        status: String(p.status || '').toLowerCase() === 'connected' ? 'connected' : String(p.status || '').toLowerCase(),
        connectedAt: p.createdAt || null,
        lastSyncAt: p.lastSyncedAt || p.lastSyncAt || null,
      })))
    } catch {
      setPlatforms([])
    } finally {
      setLoading(false)
    }
  }

  async function handleConnect(platform: string) {
    try {
      setConnecting(platform)
      const res = await fetch('/api/ads/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // Backend espera MAYÚSCULAS (META, GOOGLE, LINKEDIN, TIKTOK) + redirectUri obligatorio
          platform: platform.toUpperCase(),
          redirectUri: window.location.origin + '/api/ads/connect/callback?platform=' + platform.toUpperCase(),
        }),
      })
      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || 'Error al conectar')
      }
      const data = await res.json()
      if (data.authUrl) {
        window.open(data.authUrl, '_blank', 'width=600,height=700')
        toast({ title: 'Redirigiendo para autenticación...' })
      } else {
        toast({ title: 'Plataforma conectada exitosamente' })
        fetchPlatforms()
      }
    } catch (err) {
      toast({
        title: 'Error al conectar',
        description: err instanceof Error ? err.message : 'Error desconocido',
        variant: 'destructive',
      })
    } finally {
      setConnecting(null)
    }
  }

  async function handleDisconnect(platformId: string, platformName: string) {
    if (!confirm(`¿Desconectar ${platformName}?`)) return
    try {
      setDisconnecting(platformId)
      const res = await fetch(`/api/ads/platforms/${platformId}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error('Error al desconectar')
      toast({ title: `Plataforma ${platformName} desconectada` })
      fetchPlatforms()
    } catch (err) {
      toast({
        title: 'Error al desconectar',
        description: err instanceof Error ? err.message : 'Error desconocido',
        variant: 'destructive',
      })
    } finally {
      setDisconnecting(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-primary opacity-20" />
      </div>
    )
  }

  const connectedPlatforms = platforms.filter(p => p.status === 'connected')
  const disconnectedPlatforms = Object.keys(PLATFORM_CONFIG).filter(
    p => !platforms.some(sp => sp.platform === p && sp.status === 'connected')
  )

  return (
    <div className="space-y-6">
      {/* Plataformas conectadas */}
      <div>
        <h3 className="text-sm font-semibold text-slate-700 mb-3">Plataformas Conectadas</h3>
        {connectedPlatforms.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="p-6 text-center text-sm text-muted-foreground">
              No hay plataformas conectadas. Conecta tu primera plataforma abajo.
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {connectedPlatforms.map(p => {
              const cfg = PLATFORM_CONFIG[p.platform] || { name: p.platform, color: 'text-gray-500', icon: '🔌' }
              return (
                <Card key={p.id} className="border shadow-sm">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">{cfg.icon}</span>
                        <div>
                          <p className="font-semibold text-sm">{cfg.name}</p>
                          {p.accountName && (
                            <p className="text-xs text-muted-foreground">{p.accountName}</p>
                          )}
                          {p.accountId && (
                            <p className="text-[10px] text-muted-foreground font-mono">ID: {p.accountId}</p>
                          )}
                          <div className="flex gap-2 mt-1">
                            <Badge variant="outline" className="text-[10px] bg-green-50 text-green-700 border-green-200">
                              <CheckCircle className="h-3 w-3 mr-1" /> Conectado
                            </Badge>
                            {p.lastSyncAt && (
                              <span className="text-[10px] text-muted-foreground">
                                Última sync: {new Date(p.lastSyncAt).toLocaleDateString('es-MX')}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-500 hover:text-red-700 hover:bg-red-50"
                        onClick={() => handleDisconnect(p.id, cfg.name)}
                        disabled={disconnecting === p.id}
                      >
                        {disconnecting === p.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <XCircle className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </div>

      {/* Plataformas disponibles */}
      <div>
        <h3 className="text-sm font-semibold text-slate-700 mb-3">Conectar Nueva Plataforma</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {disconnectedPlatforms.map(platformKey => {
            const cfg = PLATFORM_CONFIG[platformKey] || { name: platformKey, color: 'text-gray-500', icon: '🔌' }
            return (
              <Card key={platformKey} className="border shadow-sm hover:shadow-md transition-shadow cursor-pointer" onClick={() => handleConnect(platformKey)}>
                <CardContent className="p-4 text-center space-y-2">
                  <span className="text-3xl block">{cfg.icon}</span>
                  <p className="font-semibold text-sm">{cfg.name}</p>
                  <Button
                    size="sm"
                    className="w-full"
                    disabled={connecting === platformKey}
                    onClick={(e) => { e.stopPropagation(); handleConnect(platformKey) }}
                  >
                    {connecting === platformKey ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-1" />
                    ) : (
                      <Plus className="h-4 w-4 mr-1" />
                    )}
                    Conectar
                  </Button>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>
    </div>
  )
}
