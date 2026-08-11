'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Card,
  CardContent,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, RefreshCw, History, User, Clock, ArrowRight, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'

interface HistorialEntry {
  id: string
  accion: string
  clave: string
  descripcion: string
  cambiosAntes: Record<string, any> | null
  cambiosDespues: Record<string, any> | null
  usuario: { id: string; nombre: string | null; email: string } | null
  fecha: string
  hash: string | null
}

const CLAVES_SENSIBLES = /password|secret|token|apikey|api_key/i

function valorLegible(valor: any): string {
  if (valor === undefined || valor === null) return '—'
  if (typeof valor === 'string') return valor
  if (typeof valor === 'boolean' || typeof valor === 'number') return String(valor)
  try {
    const s = JSON.stringify(valor)
    return s.length > 120 ? s.slice(0, 120) + '…' : s
  } catch {
    return String(valor)
  }
}

// Muestra el cambio de UNA clave: si viene con el valor enmascarado, lo indica
function CambioCelda({ etiqueta, cambios }: { etiqueta: 'Antes' | 'Después'; cambios: Record<string, any> | null }) {
  const contenido = !cambios
    ? <span className="text-slate-300 italic text-[10px]">—</span>
    : (() => {
        const [clave, valor] = Object.entries(cambios)[0] || []
        if (!clave) return <span className="text-slate-300 italic text-[10px]">—</span>
        if (CLAVES_SENSIBLES.test(clave)) {
          return (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
              <ShieldCheck className="h-3 w-3" /> [REDACTED]
            </span>
          )
        }
        return <span className="text-[10px] text-slate-600 font-mono break-all">{valorLegible(valor)}</span>
      })()

  return (
    <div className="min-w-0">
      <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-0.5">{etiqueta}</span>
      {contenido}
    </div>
  )
}

export function ConfigHistorial() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [entries, setEntries] = useState<HistorialEntry[]>([])

  const fetchHistorial = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const res = await fetch('/api/configuracion/historial?limit=100')
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Error al cargar historial')
      }
      const data = await res.json()
      setEntries(data.logs || [])
    } catch (e: any) {
      setError(e.message || 'Error cargando historial')
      toast.error(e.message || 'Error cargando historial')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchHistorial() }, [fetchHistorial])

  const claveLegible = (clave: string) => {
    const labels: Record<string, string> = {
      horariosAtencion: 'Horarios de atención',
      smtp_host: 'SMTP · Servidor',
      smtp_port: 'SMTP · Puerto',
      smtp_user: 'SMTP · Usuario',
      smtp_password: 'SMTP · Contraseña',
      smtp_encryption: 'SMTP · Cifrado',
      smtp_from_email: 'SMTP · Correo remitente',
      smtp_from_name: 'SMTP · Nombre remitente',
      smtp_enabled: 'SMTP · Habilitado',
      imap_host: 'IMAP · Servidor',
      imap_port: 'IMAP · Puerto',
      imap_user: 'IMAP · Usuario',
      imap_password: 'IMAP · Contraseña',
      imap_encryption: 'IMAP · Cifrado',
      imap_catchall: 'IMAP · Catch-all',
      imap_enabled: 'IMAP · Habilitado',
      business_name: 'Nombre de la empresa',
      business_email: 'Correo de soporte',
      timezone: 'Zona horaria',
      logo_corporativo: 'Logo corporativo',
      defaultCurrency: 'Moneda predeterminada (inmobiliaria)',
    }
    return labels[clave] || clave
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="space-y-1">
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <History className="h-6 w-6 text-primary" />
            Historial de Cambios
          </h2>
          <p className="text-sm text-muted-foreground">
            Quién cambió cada ajuste de configuración, de qué valor a cuál, y cuándo.
            Los secretos (contraseñas, tokens) aparecen enmascarados.
          </p>
        </div>
        <Button variant="outline" onClick={fetchHistorial} disabled={loading} className="gap-2">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Actualizar
        </Button>
      </div>

      <Card className="shadow-sm">
        <CardContent className="pt-6">
          {loading ? (
            <div className="p-12 text-center">
              <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
              <p className="mt-3 text-sm text-muted-foreground">Cargando historial…</p>
            </div>
          ) : error ? (
            <div className="p-12 text-center">
              <Loader2 className="h-10 w-10 mx-auto text-destructive/40" />
              <p className="mt-3 text-sm text-red-600 font-medium">
                Error al cargar el historial: {error}
              </p>
              <Button variant="outline" size="sm" onClick={fetchHistorial} className="mt-4 gap-2">
                <RefreshCw className="h-4 w-4" /> Reintentar
              </Button>
            </div>
          ) : entries.length === 0 ? (
            <div className="p-12 text-center">
              <History className="h-10 w-10 mx-auto text-muted-foreground/40" />
              <p className="mt-3 text-sm text-muted-foreground italic">
                Aún no hay cambios registrados. Cuando modifiques horarios, SMTP o datos de la empresa, aparecerán aquí.
              </p>
            </div>
          ) : (
            <div className="space-y-3 max-h-[560px] overflow-y-auto pr-1">
              {entries.map(entry => (
                <div key={entry.id} className="border rounded-xl p-4 bg-muted/20">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Badge variant="secondary" className="font-mono text-[10px] shrink-0">
                        {claveLegible(entry.clave)}
                      </Badge>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1 shrink-0">
                        <User className="h-3 w-3" />
                        {entry.usuario?.nombre || entry.usuario?.email || 'Sistema'}
                      </span>
                      <span className="text-[10px] text-slate-400 flex items-center gap-1 shrink-0">
                        <Clock className="h-3 w-3" />
                        {new Date(entry.fecha).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}
                      </span>
                    </div>
                    <span className="text-[9px] text-slate-500 italic">{entry.descripcion}</span>
                    {entry.hash && (
                      <span className="text-[9px] text-emerald-600 font-mono flex items-center gap-1 shrink-0">
                        <ShieldCheck className="h-3 w-3" />
                        sellado
                      </span>
                    )}
                  </div>

                  <div className="mt-2 flex items-center gap-2 flex-wrap">
                    <CambioCelda etiqueta="Antes" cambios={entry.cambiosAntes} />
                    <ArrowRight className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                    <CambioCelda etiqueta="Después" cambios={entry.cambiosDespues} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
