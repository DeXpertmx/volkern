'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  Settings2,
  AlertCircle,
  CheckCircle2,
  ArrowLeft,
  ShieldCheck,
} from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from 'sonner'
import { ConnectPlatformCard, type PlatformConfig, type SocialPlatform } from '@/components/social/ConnectPlatformCard'

const PLATFORMS: SocialPlatform[] = ['facebook', 'instagram', 'linkedin', 'youtube', 'tiktok']

interface PlatformAvailability {
  configured: boolean
  missing: string[]
}

const ERRORES_OAUTH: Record<string, string> = {
  setup_required: 'Esta red no tiene credenciales OAuth configuradas en el servidor.',
  cancelled: 'Has cancelado la autorización en la plataforma.',
  csrf_mismatch: 'La sesión de autorización caducó. Vuelve a intentarlo.',
  invalid_callback: 'La plataforma no devolvió el código de autorización.',
  no_tenant: 'Tu usuario no tiene ninguna empresa asignada.',
  oauth_failed: 'La plataforma rechazó la conexión.',
  db_error: 'No se pudo guardar la conexión.',
  unsupported: 'Plataforma no soportada.',
}

function nombrePlataforma(platform: string | null): string {
  if (!platform) return 'La red social'
  return platform.charAt(0).toUpperCase() + platform.slice(1)
}

function SocialSettingsContent() {
  const searchParams = useSearchParams()
  const [configs, setConfigs] = useState<Record<string, PlatformConfig>>({})
  const [availability, setAvailability] = useState<Record<string, PlatformAvailability>>({})
  const [loading, setLoading] = useState(true)
  const [oauthEnabled, setOauthEnabled] = useState(true)
  const [oauthError, setOauthError] = useState<string | null>(null)

  const fetchConfigs = useCallback(async () => {
    try {
      setLoading(true)
      const res = await fetch('/api/social/configs')
      const data = await res.json()

      if (data.success) {
        const map: Record<string, PlatformConfig> = {}
        for (const c of data.configs) {
          map[c.platform] = c
        }
        setConfigs(map)
        setOauthEnabled(!!data.metaOauthConfigured)
        setAvailability(data.platforms || {})
      }
    } catch (err) {
      toast.error('Error cargando configuraciones')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchConfigs()
  }, [fetchConfigs])

  useEffect(() => {
    const connected = searchParams.get('connected')
    const error = searchParams.get('error')
    const platform = searchParams.get('platform')
    const mensaje = searchParams.get('message')

    if (connected) {
      toast.success('✅ Conexión exitosa')
      fetchConfigs()
    }

    if (!error) {
      setOauthError(null)
      return
    }

    const red = nombrePlataforma(platform)

    if (error === 'oauth_failed' && mensaje) {
      // El mensaje viene de la API de la plataforma: es el que explica de verdad qué falló.
      setOauthError(`${red}: ${mensaje}`)
      return
    }

    if (error === 'setup_required') {
      const faltantes = (searchParams.get('missing') || '').split(',').filter(Boolean)
      setOauthError(
        faltantes.length
          ? `${red} no se puede conectar todavía: falta ${faltantes.join(' y ')} en el servidor.`
          : `${red} no se puede conectar todavía: faltan sus credenciales OAuth en el servidor.`,
      )
      return
    }

    setOauthError(`${red}: ${ERRORES_OAUTH[error] || `error de conexión (${error})`}`)
  }, [searchParams, fetchConfigs])

  const pendientes = PLATFORMS.filter((p) => availability[p] && !availability[p].configured)

  return (
    <div className="flex flex-col gap-8 p-2 md:p-6 max-w-4xl mx-auto animate-in fade-in duration-700">
      <div className="flex flex-col gap-4">
        <Link
          href="/dashboard/marketing"
          className="flex items-center gap-2 text-xs font-bold text-slate-400 hover:text-indigo-600 transition-colors w-fit"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Volver al Hub de Marketing
        </Link>

        <div className="flex items-center gap-4 bg-white p-6 rounded-3xl border border-slate-200/60 shadow-sm">
          <div className="h-12 w-12 rounded-2xl bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-200">
            <Settings2 className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tighter uppercase">
              Configuración Social
            </h1>
            <p className="text-xs font-bold text-slate-400 tracking-widest uppercase">
              Activa tus canales de publicación y monitoriza la salud de tus tokens
            </p>
          </div>
        </div>
      </div>

      {oauthError && (
        <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4">
          <AlertCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-red-600 mb-0.5">
              No se pudo conectar
            </p>
            <p className="text-xs font-bold text-red-700 leading-relaxed">{oauthError}</p>
          </div>
        </div>
      )}

      {pendientes.length > 0 && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="text-[10px] font-black uppercase tracking-widest text-amber-700">
              Redes sin credenciales OAuth
            </p>
            <p className="text-xs font-bold text-amber-800 leading-relaxed">
              {pendientes
                .map((p) => `${nombrePlataforma(p)} (${availability[p].missing.join(', ')})`)
                .join(' · ')}
            </p>
            <p className="text-[11px] text-amber-700 leading-relaxed">
              Cada red necesita su propia app registrada en su portal de desarrolladores. Mientras falten esas
              variables de entorno solo se puede usar el token manual.
            </p>
          </div>
        </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xs font-black uppercase tracking-widest text-slate-500">
            Canales Disponibles
          </h2>
          <Button
            onClick={fetchConfigs}
            variant="ghost"
            size="sm"
            className="text-xs font-bold text-slate-400 gap-1.5 hover:text-indigo-600 h-7 rounded-lg"
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            Sincronizar Estado
          </Button>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-48 rounded-3xl bg-slate-100 animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {PLATFORMS.map((platform) => (
              <ConnectPlatformCard
                key={platform}
                platform={platform}
                config={configs[platform] || null}
                missingEnv={availability[platform]?.missing ?? []}
                oauthEnabled={oauthEnabled}
                onConnected={fetchConfigs}
                onDisconnected={fetchConfigs}
              />
            ))}
          </div>
        )}
      </div>

      <Card className="rounded-3xl border-slate-200 bg-slate-900 text-white shadow-sm overflow-hidden">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-black uppercase tracking-widest flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-indigo-400" />
            Seguridad y Soberanía
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-slate-400 leading-relaxed">
            Volkern utiliza protocolos de autenticación oficiales de cada plataforma. Tus llaves de acceso se almacenan en el <strong>Third-Party Vault</strong>, cifradas con una semilla única por tenant. Ningún agente externo tiene acceso a tus tokens.
          </p>
          <div className="flex gap-4">
             <div className="flex flex-col gap-1">
                <span className="text-[10px] font-bold text-slate-500 uppercase">Encriptación</span>
                <span className="text-xs font-mono text-indigo-300">AES-256-GCM</span>
             </div>
             <div className="flex flex-col gap-1">
                <span className="text-[10px] font-bold text-slate-500 uppercase">Auth Mode</span>
                <span className="text-xs font-mono text-indigo-300">OAuth 2.0 PKCE</span>
             </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default function SocialSettingsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-slate-400 italic">Iniciando plataforma social...</div>}>
      <SocialSettingsContent />
    </Suspense>
  )
}
