'use client'

import { useState } from 'react'
import { 
  Facebook, 
  Instagram, 
  Linkedin, 
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

export type SocialPlatform = 'facebook' | 'instagram' | 'linkedin'

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
    description: 'Publica en tu Página de LinkedIn (Próximamente)',
    scope: 'w_member_social',
    helpUrl: 'https://developer.linkedin.com/',
  },
}

export function ConnectPlatformCard({
  platform,
  config,
  oauthEnabled = true,
  onConnected,
  onDisconnected,
}: ConnectPlatformCardProps) {
  const [isDisconnecting, setIsDisconnecting] = useState(false)
  const [manualToken, setManualToken] = useState('')
  const [manualPageId, setManualPageId] = useState('')
  const [showManual, setShowManual] = useState(false)
  const [isSavingManual, setIsSavingManual] = useState(false)

  const meta = PLATFORM_META[platform]
  const { Icon } = meta
  const isConnected = !!(config?.isActive && config?.profileId)
  const isComingSoon = platform === 'linkedin'

  // Verificar si el token está próximo a expirar (menos de 7 días)
  const isExpiringSoon = config?.expiresAt
    ? new Date(config.expiresAt).getTime() - Date.now() < 7 * 24 * 60 * 60 * 1000
    : false

  const isExpired = config?.expiresAt ? new Date(config.expiresAt) < new Date() : false

  const handleConnect = () => {
    if (isComingSoon) {
      toast.info('LinkedIn estará disponible próximamente')
      return
    }
    // Redirigir al endpoint OAuth — el backend maneja el redirect a Meta
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
      {/* Header */}
      <div className={`p-6 ${isConnected ? 'border-b border-green-50' : ''}`}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            {/* Avatar del perfil o ícono de plataforma */}
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
              {/* Badge de plataforma si hay foto de perfil */}
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
                      <AlertCircle className="h-3 w-3" /> Token expirado — Reconectar
                    </p>
                  ) : isExpiringSoon ? (
                    <p className="text-[10px] font-bold text-amber-500 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" /> Expira pronto
                    </p>
                  ) : (
                    <p className="text-[10px] font-bold text-green-600 flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3" /> Conectado y activo
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-[11px] text-slate-400 mt-0.5">{meta.description}</p>
              )}
            </div>
          </div>

          {/* Estado badge */}
          {isConnected && !isExpired && (
            <Badge className="bg-green-100 text-green-700 border-none text-[9px] font-black px-2 shrink-0">
              ACTIVO
            </Badge>
          )}
          {isExpired && (
            <Badge className="bg-red-100 text-red-700 border-none text-[9px] font-black px-2 shrink-0">
              EXPIRADO
            </Badge>
          )}
        </div>
      </div>

      {/* Footer de acciones */}
      <div className="px-6 pb-6 pt-4 flex items-center justify-between gap-2">
        {isConnected && !isExpired ? (
          <div className="flex items-center gap-2 w-full">
            <Button
              variant="outline"
              size="sm"
              onClick={handleConnect}
              className="rounded-xl border-slate-200 text-[10px] font-black uppercase tracking-widest gap-1.5 h-8"
              title="Reconectar para renovar permisos"
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
              {isDisconnecting ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Link2Off className="h-3 w-3" />
              )}
              Desconectar
            </Button>
          </div>
        ) : isComingSoon ? (
          <Button
            disabled
            className="rounded-xl h-9 text-[10px] font-black uppercase tracking-widest gap-2 bg-slate-100 text-slate-400 cursor-not-allowed w-full"
          >
            Próximamente
          </Button>
        ) : (
          <div className="flex flex-col gap-2 w-full">
            {oauthEnabled ? (
              <Button
                onClick={handleConnect}
                className={`rounded-xl h-9 text-[10px] font-black uppercase tracking-widest gap-2 w-full text-white ${
                  isExpired
                    ? 'bg-red-500 hover:bg-red-600'
                    : `bg-indigo-600 hover:bg-indigo-700 shadow-md shadow-indigo-100`
                }`}
              >
                <Link2 className="h-3.5 w-3.5" />
                {isExpired ? `Reconectar ${meta.name}` : `Conectar con ${meta.name}`}
                <ExternalLink className="h-3 w-3 opacity-50" />
              </Button>
            ) : (
              <Button
                onClick={() => {
                  const el = document.getElementById('advanced-config')
                  if (el) el.scrollIntoView({ behavior: 'smooth' })
                  else toast.info('Revisa la sección de Configuración Avanzada al final de la página')
                }}
                className="rounded-xl h-9 text-[10px] font-black uppercase tracking-widest gap-2 w-full bg-slate-100 text-slate-500 hover:bg-slate-200 border border-slate-200"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Configurar Meta App
              </Button>
            )}

            {/* Opción de token manual como alternativa */}
            <button
              onClick={() => setShowManual(!showManual)}
              className="text-[9px] font-bold text-slate-400 hover:text-indigo-600 transition-colors text-center uppercase tracking-widest"
            >
              {showManual ? '↑ Ocultar' : '⚙ Configurar token manual'}
            </button>

            {showManual && (
              <div className="space-y-2 p-4 bg-slate-50 rounded-2xl border border-slate-100 animate-in slide-in-from-top duration-200">
                <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">
                  Pega tu {meta.name === 'Instagram' ? 'Page Access Token' : 'Page Access Token'} y el {meta.name === 'Instagram' ? 'IG Account ID' : 'Page ID'}:
                </p>
                <input
                  type="password"
                  placeholder="Access Token"
                  value={manualToken}
                  onChange={(e) => setManualToken(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-600/10"
                />
                <input
                  type="text"
                  placeholder={platform === 'instagram' ? 'Instagram Business Account ID' : 'Facebook Page ID'}
                  value={manualPageId}
                  onChange={(e) => setManualPageId(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-600/10"
                />
                <div className="flex gap-2">
                  <Button
                    onClick={handleManualSave}
                    disabled={isSavingManual}
                    size="sm"
                    className="flex-1 rounded-xl h-8 text-[10px] font-black bg-indigo-600 hover:bg-indigo-700 text-white"
                  >
                    {isSavingManual ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Guardar'}
                  </Button>
                  <a
                    href={meta.helpUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center h-8 px-3 rounded-xl border border-slate-200 text-slate-400 hover:text-slate-600 transition-colors"
                    title="Ayuda"
                  >
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
