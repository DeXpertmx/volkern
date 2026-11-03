'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, AlertTriangle, CheckCircle, XCircle, Plus } from 'lucide-react'
import { toast } from 'sonner'

/**
 * Conexión de plataformas de ADS.
 *
 * El feedback va por `sonner`, que es el único Toaster montado en el layout
 * raíz. Antes usaba el hook de shadcn (`components/ui/use-toast`), cuyo Toaster
 * no existe en la app: los errores se creaban y se descartaban, y el botón
 * parecía no hacer nada.
 */

interface Platform {
  id: string
  platform: string
  accountName: string | null
  accountId: string | null
  status: string
  connectedAt: string | null
  lastSyncAt: string | null
}

interface Disponibilidad {
  configured: boolean
  missing: string[]
  warnings: string[]
}

const PLATFORM_CONFIG: Record<string, { name: string; color: string; icon: string }> = {
  meta: { name: 'Meta Ads', color: 'text-blue-600', icon: '📘' },
  google: { name: 'Google Ads', color: 'text-green-600', icon: '📊' },
  linkedin: { name: 'LinkedIn Ads', color: 'text-sky-600', icon: '💼' },
  tiktok: { name: 'TikTok Ads', color: 'text-rose-500', icon: '🎵' },
}

/** URL de callback: idéntica a la registrada en el proveedor, sin query string. */
function urlCallback(): string {
  return `${window.location.origin}/api/ads/connect/callback`
}

export function AdsPlatformsSection() {
  const [platforms, setPlatforms] = useState<Platform[]>([])
  const [availability, setAvailability] = useState<Record<string, Disponibilidad>>({})
  const [loading, setLoading] = useState(true)
  const [connecting, setConnecting] = useState<string | null>(null)
  const [disconnecting, setDisconnecting] = useState<string | null>(null)

  const fetchPlatforms = useCallback(async () => {
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

      if (data.availability && typeof data.availability === 'object') {
        const mapa: Record<string, Disponibilidad> = {}
        for (const [clave, valor] of Object.entries(data.availability as Record<string, Disponibilidad>)) {
          mapa[clave.toLowerCase()] = valor
        }
        setAvailability(mapa)
      }
    } catch (err) {
      setPlatforms([])
      toast.error(err instanceof Error ? err.message : 'No se pudieron cargar las plataformas de anuncios')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchPlatforms()
  }, [fetchPlatforms])

  // Vuelta del OAuth: el callback redirige aquí con oauth_success/oauth_error.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const exito = params.get('oauth_success')
    const error = params.get('oauth_error')
    const detalle = params.get('oauth_error_description')

    if (exito) {
      toast.success(`${PLATFORM_CONFIG[exito.toLowerCase()]?.name || exito} conectado`)
      fetchPlatforms()
    }

    if (error) {
      toast.error(
        error === 'invalid_params'
          ? 'La plataforma no devolvió el código de autorización. Inténtalo de nuevo.'
          : `No se pudo conectar: ${detalle || error}`,
      )
    }

    if (exito || error) {
      const limpia = window.location.pathname
      window.history.replaceState({}, '', limpia)
    }
  }, [fetchPlatforms])

  async function handleConnect(platform: string) {
    const estado = availability[platform]
    if (estado && !estado.configured) {
      toast.error(`Faltan credenciales: ${estado.missing.join(', ')}`)
      return
    }

    try {
      setConnecting(platform)
      const res = await fetch('/api/ads/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // El backend espera MAYÚSCULAS (META, GOOGLE, LINKEDIN, TIKTOK).
          platform: platform.toUpperCase(),
          redirectUri: urlCallback(),
        }),
      })

      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        const faltantes = Array.isArray(data.missing) && data.missing.length
          ? ` (${data.missing.join(', ')})`
          : ''
        throw new Error(`${data.error || 'Error al conectar'}${faltantes}`)
      }

      if (data.authUrl) {
        toast.info('Abriendo la autorización de la plataforma…')
        // Misma pestaña: un window.open después de un await lo bloquea el
        // navegador por no nacer del gesto del usuario.
        window.location.assign(data.authUrl)
        return
      }

      toast.success('Plataforma conectada')
      fetchPlatforms()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error desconocido al conectar')
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
      toast.success(`${platformName} desconectada`)
      fetchPlatforms()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error desconocido al desconectar')
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
  const pendientes = disconnectedPlatforms.filter(p => availability[p] && !availability[p].configured)

  return (
    <div className="space-y-6">
      {pendientes.length > 0 && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="text-[10px] font-black uppercase tracking-widest text-amber-700">
              Plataformas sin credenciales OAuth
            </p>
            <p className="text-xs font-bold text-amber-800 leading-relaxed">
              {pendientes
                .map(p => `${PLATFORM_CONFIG[p].name} (${availability[p].missing.join(', ')})`)
                .join(' · ')}
            </p>
            <p className="text-[11px] text-amber-700 leading-relaxed">
              Son apps de desarrollador de anuncios, distintas de las del módulo social: cada una se registra
              en su propio portal y sus credenciales van en variables <span className="font-mono">ADS_*</span>.
            </p>
          </div>
        </div>
      )}

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
            const estado = availability[platformKey]
            const bloqueada = !!estado && !estado.configured
            const avisos = estado?.warnings ?? []
            return (
              <Card
                key={platformKey}
                className={`border shadow-sm transition-shadow ${bloqueada ? '' : 'hover:shadow-md cursor-pointer'}`}
                onClick={() => { if (!bloqueada) handleConnect(platformKey) }}
              >
                <CardContent className="p-4 text-center space-y-2">
                  <span className="text-3xl block">{cfg.icon}</span>
                  <p className="font-semibold text-sm">{cfg.name}</p>
                  <Button
                    size="sm"
                    className="w-full"
                    disabled={connecting === platformKey || bloqueada}
                    onClick={(e) => { e.stopPropagation(); handleConnect(platformKey) }}
                    title={bloqueada ? `Falta ${estado.missing.join(', ')}` : undefined}
                  >
                    {connecting === platformKey ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-1" />
                    ) : (
                      <Plus className="h-4 w-4 mr-1" />
                    )}
                    {bloqueada ? 'Sin credenciales' : 'Conectar'}
                  </Button>
                  {bloqueada && (
                    <p className="text-[10px] leading-snug text-amber-700">
                      Falta <span className="font-mono">{estado.missing.join(', ')}</span>
                    </p>
                  )}
                  {!bloqueada && avisos.length > 0 && (
                    <p className="text-[10px] leading-snug text-amber-700">
                      Para sincronizar campañas falta <span className="font-mono">{avisos.join(', ')}</span>
                    </p>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>
    </div>
  )
}
