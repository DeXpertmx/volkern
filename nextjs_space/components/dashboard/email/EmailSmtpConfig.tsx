'use client'

import { useState, useEffect } from 'react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { toast } from 'sonner'
import { Mail, Loader2, Save, Send, RefreshCw, CheckCircle2, AlertTriangle } from 'lucide-react'

interface SmtpConfig {
  host: string
  port: string
  user: string
  password: string
  encryption: 'ssl' | 'tls' | 'starttls' | 'none'
  fromEmail: string
  fromName: string
  enabled: boolean
}

const defaults: SmtpConfig = {
  host: '',
  port: '587',
  user: '',
  password: '',
  encryption: 'tls',
  fromEmail: '',
  fromName: '',
  enabled: false,
}

export function EmailSmtpConfig() {
  const [config, setConfig] = useState<SmtpConfig>(defaults)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)

  useEffect(() => {
    fetchConfig()
  }, [])

  const fetchConfig = async () => {
    try {
      const res = await fetch('/api/configuracion?section=email')
      if (res.ok) {
        const data = await res.json()
        setConfig({
          host: data.smtp_host || '',
          port: data.smtp_port || '587',
          user: data.smtp_user || '',
          password: data.smtp_password || '',
          encryption: data.smtp_encryption || 'tls',
          fromEmail: data.smtp_from_email || '',
          fromName: data.smtp_from_name || '',
          enabled: data.smtp_enabled === true || data.smtp_enabled === 'true',
        })
      }
    } catch {
      toast.error('Error al cargar configuración de correo')
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    setTestResult(null)
    try {
      const res = await fetch('/api/configuracion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          section: 'email',
          data: {
            smtp_host: config.host,
            smtp_port: config.port,
            smtp_user: config.user,
            smtp_password: config.password,
            smtp_encryption: config.encryption,
            smtp_from_email: config.fromEmail,
            smtp_from_name: config.fromName,
            smtp_enabled: config.enabled,
          },
        }),
      })
      if (res.ok) {
        toast.success('Configuración de correo guardada')
      } else {
        const err = await res.json()
        toast.error(err.error || 'Error al guardar')
      }
    } catch {
      toast.error('Error de conexión al guardar')
    } finally {
      setSaving(false)
    }
  }

  const handleTest = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const res = await fetch('/api/configuracion/email/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          host: config.host,
          port: parseInt(config.port) || 587,
          user: config.user,
          password: config.password,
          encryption: config.encryption,
          fromEmail: config.fromEmail,
          fromName: config.fromName,
        }),
      })
      const data = await res.json()
      setTestResult({
        ok: res.ok,
        message: data.message || (res.ok ? 'Correo de prueba enviado correctamente' : 'Error al enviar correo de prueba'),
      })
    } catch {
      setTestResult({ ok: false, message: 'Error de conexión al probar SMTP' })
    } finally {
      setTesting(false)
    }
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="p-12 text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-2xl font-bold tracking-tight">Configuración de Correo SMTP</h2>
        <p className="text-sm text-muted-foreground">
          Configura tu propio servidor SMTP para enviar correos desde Volkern con tu dominio
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Servidor SMTP
          </CardTitle>
          <CardDescription>
            Introduce los datos de tu servidor de correo saliente. Puedes usar Gmail, Outlook, tu hosting o cualquier proveedor SMTP.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="smtp-enabled" className="text-sm font-medium">
                Correo personalizado habilitado
              </Label>
              <p className="text-xs text-muted-foreground">
                Activa el envío de correos a través de tu propio SMTP
              </p>
            </div>
            <Switch
              id="smtp-enabled"
              checked={config.enabled}
              onCheckedChange={(v) => setConfig({ ...config, enabled: v })}
            />
          </div>

          <Separator />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="smtp-host">Servidor SMTP</Label>
              <Input
                id="smtp-host"
                value={config.host}
                onChange={(e) => setConfig({ ...config, host: e.target.value })}
                placeholder="smtp.gmail.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="smtp-port">Puerto</Label>
              <Input
                id="smtp-port"
                value={config.port}
                onChange={(e) => setConfig({ ...config, port: e.target.value })}
                placeholder="587"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="smtp-user">Usuario</Label>
              <Input
                id="smtp-user"
                value={config.user}
                onChange={(e) => setConfig({ ...config, user: e.target.value })}
                placeholder="tu@correo.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="smtp-password">Contraseña</Label>
              <Input
                id="smtp-password"
                type="password"
                value={config.password}
                onChange={(e) => setConfig({ ...config, password: e.target.value })}
                placeholder="••••••••"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="smtp-encryption">Cifrado</Label>
              <Select
                value={config.encryption}
                onValueChange={(v: SmtpConfig['encryption']) => setConfig({ ...config, encryption: v })}
              >
                <SelectTrigger id="smtp-encryption">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="tls">TLS (587)</SelectItem>
                  <SelectItem value="ssl">SSL (465)</SelectItem>
                  <SelectItem value="starttls">STARTTLS (25)</SelectItem>
                  <SelectItem value="none">Sin cifrado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <Separator />

          <div className="space-y-1">
            <h4 className="text-sm font-medium">Configuración del remitente</h4>
            <p className="text-xs text-muted-foreground">
              Cómo aparecerán los correos enviados
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="smtp-from-email">Correo remitente</Label>
              <Input
                id="smtp-from-email"
                value={config.fromEmail}
                onChange={(e) => setConfig({ ...config, fromEmail: e.target.value })}
                placeholder="no-reply@tudominio.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="smtp-from-name">Nombre remitente</Label>
              <Input
                id="smtp-from-name"
                value={config.fromName}
                onChange={(e) => setConfig({ ...config, fromName: e.target.value })}
                placeholder="Tu Empresa"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {testResult && (
        <Card className={testResult.ok ? 'border-emerald-500/30' : 'border-red-500/30'}>
          <CardContent className="p-4 flex items-center gap-3">
            {testResult.ok
              ? <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
              : <AlertTriangle className="h-5 w-5 text-red-500 shrink-0" />
            }
            <p className={`text-sm ${testResult.ok ? 'text-emerald-700' : 'text-red-700'}`}>
              {testResult.message}
            </p>
          </CardContent>
        </Card>
      )}

      <div className="flex items-center gap-3">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          {saving ? 'Guardando...' : 'Guardar Configuración'}
        </Button>
        <Button
          variant="outline"
          onClick={handleTest}
          disabled={testing || !config.host || !config.user}
        >
          {testing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
          {testing ? 'Enviando...' : 'Enviar Correo de Prueba'}
        </Button>
        <Button variant="ghost" onClick={fetchConfig} disabled={saving || testing}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Recargar
        </Button>
      </div>
    </div>
  )
}
