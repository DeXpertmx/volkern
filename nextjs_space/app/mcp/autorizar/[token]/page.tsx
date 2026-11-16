'use client'

/**
 * Página pública de autorización de envío WhatsApp desde el MCP.
 *
 * El enlace llega por WhatsApp al número del negocio junto con un código de 6
 * dígitos. Quien lo recibe abre esta página, lee los riesgos, escribe el código
 * y pulsa «Autorizar envío». Solo entonces se ejecuta el mensaje.
 *
 * No requiere sesión: el código de un solo uso es el factor de posesión y el
 * token de URL (192 bits aleatorios) es el factor de conocimiento.
 */

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { ShieldAlert, Phone, Clock, Send, CheckCircle2 } from 'lucide-react'

export default function AutorizarPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const [token, setToken] = useState<string>('')
  const [code, setCode] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>(
    'idle'
  )
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    params.then((p) => setToken(p.token))
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!token || !code.trim()) return

    setStatus('loading')
    setError(null)

    try {
      const res = await fetch(
        `/api/mcp/approvals/${encodeURIComponent(token)}/verify-code`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: code.trim() }),
        }
      )

      const json = await res.json()

      if (!res.ok) {
        setStatus('error')
        setError(json.error || 'Código incorrecto o expirado')
        return
      }

      setStatus('ok')
    } catch {
      setStatus('error')
      setError('Error de conexión al servidor')
    }
  }

  if (status === 'ok') {
    return (
      <Card className="max-w-2xl mx-auto mt-12 shadow-lg rounded-2xl border-emerald-200 bg-emerald-50">
        <CardHeader className="flex flex-col items-center text-center">
          <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center mb-4">
            <CheckCircle2 className="w-7 h-7 text-emerald-600" />
          </div>
          <CardTitle className="text-2xl font-bold">¡Autorizado!</CardTitle>
          <CardDescription>
            El mensaje de WhatsApp se envió correctamente. Se ha registrado como
            una firma de seguridad en el registro de auditoría.
          </CardDescription>
        </CardHeader>
        <CardFooter>
          <Button onClick={() => window.location.assign('/')} variant="outline">
            Volver al inicio
          </Button>
        </CardFooter>
      </Card>
    )
  }

  return (
    <Card className="max-w-2xl mx-auto mt-12 shadow-lg rounded-2xl">
      <CardHeader className="bg-amber-50 border-amber-100">
        <div className="flex items-start gap-3">
          <ShieldAlert className="w-6 h-6 text-amber-600 shrink-0" />
          <div>
            <CardTitle className="text-xl font-bold">
              Autorizar envío de WhatsApp
            </CardTitle>
            <CardDescription className="text-sm">
              Confirma la firma de seguridad antes de que el mensaje se envíe al
              cliente.
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        <Alert variant="destructive" className="border-rose-200 bg-rose-50/50">
          <AlertTitle className="font-bold">⚠️ No se puede deshacer</AlertTitle>
          <AlertDescription className="text-sm">
            Una vez autorizado, el mensaje se entregará al número de destino a
            través del WhatsApp del negocio. Revisa que el contenido y el
            destinatario sean correctos antes de firmar.
          </AlertDescription>
        </Alert>

        <div className="grid gap-3 text-sm">
          <div className="flex items-start gap-2">
            <Phone className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
            <span className="font-semibold text-slate-700">Canal:</span>
            <span className="text-slate-500">WhatsApp del negocio</span>
          </div>
          <div className="flex items-start gap-2">
            <Clock className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
            <span className="font-semibold text-slate-700">Código válido por:</span>
            <span className="text-slate-500">15 minutos desde el envío</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="font-semibold text-slate-700">
              ¿Quién puede autorizar?
            </span>
            <span className="text-slate-500">
              Solo quien tenga acceso al WhatsApp del negocio (recibió el código
              por ese canal).
            </span>
          </div>
        </div>

        <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
            Mensaje a enviar
          </p>
          <p className="text-slate-700 whitespace-pre-wrap break-words">
            El contenido y el destino indicados por el agente se enviarán desde
            el número del negocio al confirmar este código.
          </p>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="w-4 h-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-slate-700">
              Código de seguridad (6 dígitos)
            </label>
            <span className="ml-auto text-xs text-slate-400">
              Código de un solo uso
            </span>
          </div>
          <Input
            type="text"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            placeholder="123456"
            className="text-center font-mono text-lg tracking-widest"
            disabled={status === 'loading'}
            autoFocus
          />
          <Button
            type="submit"
            disabled={status === 'loading' || code.length !== 6}
            className="w-full flex items-center justify-center gap-2"
          >
            {status === 'loading' ? (
              <>
                <Send className="w-4 h-4 animate-spin" /> Enviando...
              </>
            ) : (
              <>
                <Send className="w-4 h-4" /> Autorizar envío
              </>
            )}
          </Button>
        </form>
      </CardContent>
      <CardFooter className="border-t">
        <p className="text-xs text-slate-500 text-center">
          Si no solicitaste este envío, no escribas el código y ignora este
          enlace. El código caduca en 15 minutos.
        </p>
      </CardFooter>
    </Card>
  )
}
