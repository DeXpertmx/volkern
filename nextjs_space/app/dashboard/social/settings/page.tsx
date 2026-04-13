'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  Share2,
  Settings2,
  AlertCircle,
  CheckCircle2,
  Info,
  ArrowLeft,
  ShieldCheck,
  ExternalLink,
} from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { toast } from 'sonner'
import { ConnectPlatformCard, type PlatformConfig, type SocialPlatform } from '@/components/social/ConnectPlatformCard'

const PLATFORMS: SocialPlatform[] = ['facebook', 'instagram', 'linkedin']

function SocialSettingsContent() {
  const searchParams = useSearchParams()
  const [configs, setConfigs] = useState<Record<string, PlatformConfig>>({})
  const [loading, setLoading] = useState(true)
  const [oauthEnabled, setOauthEnabled] = useState(true)

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
      }

      // Verificar si OAuth está disponible (FACEBOOK_APP_ID configurado en el servidor)
      // Si el fetch de connect devuelve setup_required, deshabilitar OAuth
    } catch (err) {
      toast.error('Error cargando configuraciones')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchConfigs()
  }, [fetchConfigs])

  // Mostrar toasts según el resultado del callback OAuth
  useEffect(() => {
    const connected = searchParams.get('connected')
    const error = searchParams.get('error')
    const message = searchParams.get('message')
    const platform = searchParams.get('platform')

    if (connected) {
      const names: Record<string, string> = { facebook: 'Facebook', instagram: 'Instagram', linkedin: 'LinkedIn' }
      toast.success(`✅ ${names[connected] || connected} conectado correctamente`)
      fetchConfigs() // Refrescar datos
    }

    if (error) {
      const friendlyErrors: Record<string, string> = {
        cancelled: 'Cancelaste la autorización',
        csrf_mismatch: 'Error de seguridad CSRF. Intenta de nuevo.',
        no_tenant: 'No se encontró tu cuenta. Inicia sesión.',
        db_error: 'Error guardando la conexión. Intenta de nuevo.',
        oauth_failed: message ? decodeURIComponent(message) : 'Error en el proceso OAuth',
        invalid_callback: 'Callback inválido de Meta',
      }
      toast.error(friendlyErrors[error] || `Error: ${error}`)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="flex flex-col gap-8 p-2 md:p-6 max-w-4xl mx-auto animate-in fade-in duration-700">
      {/* Header */}
      <div className="flex flex-col gap-4">
        <Link
          href="/dashboard/social"
          className="flex items-center gap-2 text-xs font-bold text-slate-400 hover:text-indigo-600 transition-colors w-fit"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Volver al Hub Social
        </Link>

        <div className="flex items-center gap-4 bg-white p-6 rounded-3xl border border-slate-200/60 shadow-sm">
          <div className="h-12 w-12 rounded-2xl bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-200">
            <Settings2 className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tighter uppercase">
              Canales Sociales
            </h1>
            <p className="text-xs font-bold text-slate-400 tracking-widest uppercase">
              Conecta tus redes sociales para publicar automáticamente
            </p>
          </div>
        </div>
      </div>

      {/* Banner informativo de requisitos */}
      <Card className="rounded-3xl border-indigo-100 bg-gradient-to-br from-indigo-50 to-purple-50 shadow-none">
        <CardContent className="p-6 flex gap-4">
          <div className="h-10 w-10 rounded-2xl bg-indigo-100 flex items-center justify-center shrink-0">
            <ShieldCheck className="h-5 w-5 text-indigo-600" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-black text-indigo-900 uppercase tracking-tight">
              Autenticación OAuth Segura
            </p>
            <p className="text-xs text-indigo-700 leading-relaxed">
              Volkern usa OAuth 2.0 oficial de Meta. Tus credenciales <strong>nunca</strong> se
              almacenan en texto plano — se cifran con AES-256 antes de guardarlas.
            </p>
            <p className="text-[10px] text-indigo-500 font-bold uppercase tracking-widest mt-2">
              Permisos solicitados: pages_manage_posts · instagram_content_publish · pages_read_engagement
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Grid de plataformas */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xs font-black uppercase tracking-widest text-slate-500">
            Plataformas Disponibles
          </h2>
          <Button
            onClick={fetchConfigs}
            variant="ghost"
            size="sm"
            className="text-xs font-bold text-slate-400 gap-1.5 hover:text-indigo-600 h-7 rounded-lg"
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            Actualizar estado
          </Button>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {PLATFORMS.map((p) => (
              <div
                key={p}
                className="h-52 rounded-3xl bg-slate-100/60 animate-pulse border border-slate-100"
              />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {PLATFORMS.map((platform) => (
              <ConnectPlatformCard
                key={platform}
                platform={platform}
                config={configs[platform] || null}
                oauthEnabled={oauthEnabled}
                onConnected={fetchConfigs}
                onDisconnected={fetchConfigs}
              />
            ))}
          </div>
        )}
      </div>

      {/* Sección de ayuda / configuración avanzada */}
      <Card className="rounded-3xl border-slate-200/60 shadow-sm">
        <CardHeader className="border-b border-slate-100 bg-slate-50/50 pb-4">
          <CardTitle className="text-sm font-black uppercase tracking-tighter flex items-center gap-2">
            <Info className="h-4 w-4 text-slate-400" />
            Configuración Avanzada
          </CardTitle>
          <CardDescription className="text-xs">
            Requisitos y pasos para que el administrador de Volkern configure las credenciales de Meta
          </CardDescription>
        </CardHeader>
        <CardContent className="p-6 space-y-4">
          <div className="space-y-3 text-xs text-slate-600 leading-relaxed">
            <div className="flex gap-3">
              <span className="h-5 w-5 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[10px] font-black shrink-0">1</span>
              <p>
                Crear una <strong>Meta App</strong> en{' '}
                <a href="https://developers.facebook.com" target="_blank" rel="noopener noreferrer" className="text-indigo-600 underline decoration-dotted hover:decoration-solid">
                  developers.facebook.com
                </a>{' '}
                y habilitarla en modo <em>Live</em>.
              </p>
            </div>
            <div className="flex gap-3">
              <span className="h-5 w-5 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[10px] font-black shrink-0">2</span>
              <p>
                Agregar los permisos: <code className="bg-slate-100 px-1 rounded">pages_manage_posts</code>,{' '}
                <code className="bg-slate-100 px-1 rounded">instagram_content_publish</code>,{' '}
                <code className="bg-slate-100 px-1 rounded">pages_show_list</code>
              </p>
            </div>
            <div className="flex gap-3">
              <span className="h-5 w-5 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[10px] font-black shrink-0">3</span>
              <p>
                Configurar la <strong>Redirect URI</strong> en la Meta App:{' '}
                <code className="bg-slate-100 px-1 rounded text-[10px]">
                  YOUR_DOMAIN/api/social/callback/facebook
                </code>
              </p>
            </div>
            <div className="flex gap-3">
              <span className="h-5 w-5 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[10px] font-black shrink-0">4</span>
              <p>
                Añadir en las variables de entorno del servidor:{' '}
                <code className="bg-slate-100 px-1 rounded">FACEBOOK_APP_ID</code> y{' '}
                <code className="bg-slate-100 px-1 rounded">FACEBOOK_APP_SECRET</code>
              </p>
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <a
              href="https://developers.facebook.com/docs/pages/getting-started"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button
                variant="outline"
                size="sm"
                className="rounded-xl border-slate-200 text-[10px] font-black uppercase tracking-widest gap-1.5 h-8"
              >
                <ExternalLink className="h-3 w-3" />
                Documentación Meta
              </Button>
            </a>
            <a
              href="https://business.facebook.com/settings"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button
                variant="outline"
                size="sm"
                className="rounded-xl border-slate-200 text-[10px] font-black uppercase tracking-widest gap-1.5 h-8"
              >
                <ExternalLink className="h-3 w-3" />
                Meta Business Suite
              </Button>
            </a>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default function SocialSettingsPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center h-64 text-slate-400 text-sm italic">
        Cargando configuraciones...
      </div>
    }>
      <SocialSettingsContent />
    </Suspense>
  )
}
