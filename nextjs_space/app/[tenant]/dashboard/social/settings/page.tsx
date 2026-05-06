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

const PLATFORMS: SocialPlatform[] = ['facebook', 'instagram', 'linkedin', 'youtube', 'tiktok']

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
        setOauthEnabled(!!data.metaOauthConfigured)
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
    
    if (connected) {
      toast.success(`✅ Conexión exitosa`)
      fetchConfigs()
    }

    if (error) {
      toast.error(`Error: ${error}`)
    }
  }, [searchParams, fetchConfigs])

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
