'use client'

import { useState } from 'react'
import { 
  Facebook, 
  Instagram, 
  Linkedin, 
  Youtube,
  Music,
  CheckCircle2, 
  AlertCircle,
  Link2,
  Link2Off,
  Loader2,
  ExternalLink,
  RefreshCw
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'

export type SocialPlatform = 'facebook' | 'instagram' | 'linkedin' | 'youtube' | 'tiktok'

export interface PlatformConfig {
  id?: string
  platform: SocialPlatform
  profileName?: string | null
  profileImage?: string | null
  profileId?: string | null
  isActive?: boolean
  expiresAt?: string | null
  createdAt?: string | null
}

interface ConnectPlatformCardProps {
  platform: SocialPlatform
  config?: PlatformConfig | null
  /** Variables de entorno que faltan para poder abrir el OAuth de esta red. */
  missingEnv?: string[]
  oauthEnabled?: boolean
  onConnected?: () => void
  onDisconnected?: () => void
}

const PLATFORM_META = {
  facebook: {
    name: 'Facebook',
    Icon: Facebook,
    color: 'text-blue-600',
    bg: 'bg-blue-50',
    border: 'border-blue-100',
    activeBg: 'bg-blue-600',
    description: 'Publica en tu Página de Facebook automáticamente',
    scope: 'pages_manage_posts, pages_read_engagement',
    helpUrl: 'https://developers.facebook.com/',
  },
  instagram: {
    name: 'Instagram',
    Icon: Instagram,
    color: 'text-pink-600',
    bg: 'bg-pink-50',
    border: 'border-pink-100',
    activeBg: 'bg-gradient-to-br from-purple-500 to-pink-500',
    description: 'Publica en tu cuenta Instagram Business',
    scope: 'instagram_basic, instagram_content_publish',
    helpUrl: 'https://developers.facebook.com/',
  },
  linkedin: {
    name: 'LinkedIn',
    Icon: Linkedin,
    color: 'text-sky-700',
    bg: 'bg-sky-50',
    border: 'border-sky-100',
    activeBg: 'bg-sky-700',
    description: 'Publica en tu Página de LinkedIn',
    scope: 'w_member_social',
    helpUrl: 'https://developer.linkedin.com/',
  },
  youtube: {
    name: 'YouTube',
    Icon: Youtube,
    color: 'text-red-600',
    bg: 'bg-red-50',
    border: 'border-red-100',
    activeBg: 'bg-red-600',
    description: 'Gestiona videos y analíticas de YouTube',
    scope: 'https://www.googleapis.com/auth/youtube.upload',
    helpUrl: 'https://console.cloud.google.com/',
  },
  tiktok: {
    name: 'TikTok',
    Icon: Music,
    color: 'text-slate-900',
    bg: 'bg-slate-50',
    border: 'border-slate-100',
    activeBg: 'bg-slate-900',
    description: 'Publica contenido nativo en TikTok',
    scope: 'user.info.basic,video.publish',
    helpUrl: 'https://developers.tiktok.com/',
  },
}

export function ConnectPlatformCard({
  platform,
  config,
  missingEnv,
  oauthEnabled = true,
  onConnected,
  onDisconnected,
}: ConnectPlatformCardProps) {
  const [isDisconnecting, setIsDisconnecting] = useState(false)
  const [manualToken, setManualToken] = useState('')
  const [manualPageId, setManualPageId] = useState('')
  const [showManual, setShowManual] = useState(false)
  const [isSavingManual, setIsSavingManual] = useState(false)

  const meta = PLATFORM_META[platform as keyof typeof PLATFORM_META]
  const { Icon } = meta
  const faltantes = missingEnv ?? []
  const sinCredenciales = faltantes.length > 0
  const isConnected = !!(config?.isActive && config?.profileId)
  
  // LinkedIn está en beta pero ya se puede mostrar
  const isComingSoon = false 

  const isExpiringSoon = config?.expiresAt
    ? new Date(config.expiresAt).getTime() - Date.now() < 7 * 24 * 60 * 60 * 1000
    : false

  const isExpired = config?.expiresAt ? new Date(config.expiresAt) < new Date() : false

  const handleConnect = () => {
    window.location.href = `/api/social/connect/${platform}`
  }

  const handleDisconnect = async () => {
    if (!confirm(`¿Desconectar ${meta.name}? Perderás acceso para publicar automáticamente.`)) return

    setIsDisconnecting(true)
    try {
      const res = await fetch(`/api/social/configs?platform=${platform}`, {
        method: 'DELETE',
      })
      const data = await res.json()
      if (data.success) {
        toast.success(`${meta.name} desconectado correctamente`)
        onDisconnected?.()
      } else {
        toast.error(data.error || 'Error al desconectar')
      }
    } catch {
      toast.error('Error de conexión')
    } finally {
      setIsDisconnecting(false)
    }
  }

  const handleManualSave = async () => {
    if (!manualToken.trim() || !manualPageId.trim()) {
      toast.error('Token de acceso y Page/Account ID son requeridos')
      return
    }

    setIsSavingManual(true)
    try {
      const res = await fetch('/api/social/configs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform,
          accessToken: manualToken.trim(),
          profileId: manualPageId.trim(),
          profileName: `${meta.name} (manual)`,
        }),
      })
      const data = await res.json()
      if (data.success) {
        toast.success(`${meta.name} conectado manualmente`)
        setShowManual(false)
        setManualToken('')
        setManualPageId('')
        onConnected?.()
      } else {
        toast.error(data.error || 'Error guardando configuración')
      }
    } catch {
      toast.error('Error de conexión')
    } finally {
      setIsSavingManual(false)
    }
  }

  return (
    <div
      className={`rounded-3xl border overflow-hidden transition-all duration-300 ${
        isConnected
          ? 'border-green-200 bg-white shadow-md shadow-green-50'
          : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm'
      }`}
    >
      <div className={`p-6 ${isConnected ? 'border-b border-green-50' : ''}`}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="relative">
              {isConnected && config?.profileImage ? (
                <img
                  src={config.profileImage}
                  alt={config.profileName || meta.name}
                  className="h-14 w-14 rounded-2xl object-cover border-2 border-white shadow-md"
                />
              ) : (
                <div
                  className={`h-14 w-14 rounded-2xl ${meta.bg} flex items-center justify-center border ${meta.border}`}
                >
                  <Icon className={`h-7 w-7 ${meta.color}`} />
                </div>
              )}
              {isConnected && config?.profileImage && (
                <div
                  className={`absolute -bottom-1 -right-1 h-6 w-6 rounded-lg ${meta.activeBg} flex items-center justify-center border-2 border-white`}
                >
                  <Icon className="h-3 w-3 text-white" />
                </div>
              )}
            </div>

            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-black uppercase tracking-tight text-slate-900">
                  {meta.name}
                </p>
                {isComingSoon && (
                  <Badge className="bg-amber-100 text-amber-700 border-none text-[9px] font-black px-1.5">
                    PRONTO
                  </Badge>
                )}
              </div>

              {isConnected ? (
                <div className="space-y-0.5 mt-0.5">
                  <p className="text-xs font-bold text-slate-700">
                    {config?.profileName}
                  </p>
                  {isExpired ? (
                    <p className="text-[10px] font-bold text-red-500 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" /> Token expirado
                    </p>
                  ) : isExpiringSoon ? (
                    <p className="text-[10px] font-bold text-amber-500 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" /> Expira pronto
                    </p>
                  ) : (
                    <p className="text-[10px] font-bold text-green-600 flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" /> Activo
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-[11px] text-slate-400 mt-0.5">{meta.description}</p>
              )}
            </div>
          </div>

          {isConnected && !isExpired && (
            <Badge className="bg-green-100 text-green-700 border-none text-[9px] font-black px-2 shrink-0">
              ACTIVO
            </Badge>
          )}
        </div>
      </div>

      <div className="px-6 pb-6 pt-4 flex items-center justify-between gap-2">
        {isConnected && !isExpired ? (
          <div className="flex items-center gap-2 w-full">
            <Button
              variant="outline"
              size="sm"
              onClick={handleConnect}
              className="rounded-xl border-slate-200 text-[10px] font-black uppercase tracking-widest gap-1.5 h-8"
            >
              <RefreshCw className="h-3 w-3" />
              Renovar
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleDisconnect}
              disabled={isDisconnecting}
              className="rounded-xl border-red-100 text-red-500 hover:bg-red-50 text-[10px] font-black uppercase tracking-widest gap-1.5 h-8 ml-auto"
            >
              {isDisconnecting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Link2Off className="h-3 w-3" />}
              Desconectar
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-2 w-full">
            <Button
              onClick={handleConnect}
              disabled={sinCredenciales}
              title={sinCredenciales ? `Faltan credenciales en el servidor: ${faltantes.join(', ')}` : undefined}
              className={`rounded-xl h-9 text-[10px] font-black uppercase tracking-widest gap-2 w-full text-white bg-indigo-600 hover:bg-indigo-700 shadow-md shadow-indigo-100 disabled:bg-slate-300 disabled:text-slate-600 disabled:shadow-none`}
            >
              <Link2 className="h-3.5 w-3.5" />
              {sinCredenciales ? 'Sin credenciales OAuth' : `Conectar ${meta.name}`}
              {!sinCredenciales && <ExternalLink className="h-3 w-3 opacity-50" />}
            </Button>
            {sinCredenciales && (
              <p className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-100 rounded-xl p-2.5 leading-relaxed">
                Falta en el servidor:{' '}
                <span className="font-mono">{faltantes.join(', ')}</span>. Crea la app en{' '}
                <a
                  href={meta.helpUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline decoration-dotted"
                >
                  {new URL(meta.helpUrl).hostname}
                </a>{' '}
                y define esas variables en el entorno.
              </p>
            )}
            <button
              onClick={() => setShowManual(!showManual)}
              className="text-[9px] font-bold text-slate-400 hover:text-indigo-600 transition-colors text-center uppercase tracking-widest"
            >
              {showManual ? '↑ Ocultar' : '⚙ Configurar token manual'}
            </button>
            {showManual && (
              <div className="space-y-2 p-4 bg-slate-50 rounded-2xl border border-slate-100 animate-in slide-in-from-top duration-200">
                <input
                  type="password"
                  placeholder="Access Token"
                  value={manualToken}
                  onChange={(e) => setManualToken(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl"
                />
                <input
                  type="text"
                  placeholder="Profile/Account ID"
                  value={manualPageId}
                  onChange={(e) => setManualPageId(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl"
                />
                <Button
                  onClick={handleManualSave}
                  disabled={isSavingManual}
                  size="sm"
                  className="w-full rounded-xl h-8 text-[10px] font-black bg-indigo-600 hover:bg-indigo-700 text-white"
                >
                  {isSavingManual ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Guardar'}
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
