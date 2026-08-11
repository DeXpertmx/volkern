'use client'

import { useState, useEffect, useRef } from 'react'
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from 'sonner'
import {
  Mail, Loader2, Save, Send, RefreshCw,
  CheckCircle2, AlertTriangle, Inbox, ArrowUpFromLine,
} from 'lucide-react'

interface EmailConfig {
  // SMTP
  smtp_host: string
  smtp_port: string
  smtp_user: string
  smtp_password: string
  smtp_encryption: string
  smtp_from_email: string
  smtp_from_name: string
  smtp_enabled: boolean
  // IMAP
  imap_host: string
  imap_port: string
  imap_user: string
  imap_password: string
  imap_encryption: string
  imap_catchall: string
  imap_enabled: boolean
}

const defaults: EmailConfig = {
  smtp_host: '', smtp_port: '587', smtp_user: '', smtp_password: '',
  smtp_encryption: 'tls', smtp_from_email: '', smtp_from_name: '', smtp_enabled: false,
  imap_host: '', imap_port: '993', imap_user: '', imap_password: '',
  imap_encryption: 'ssl', imap_catchall: '', imap_enabled: false,
}

export function EmailSmtpConfig() {
  const [config, setConfig] = useState<EmailConfig>(defaults)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const saveResetTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [testing, setTesting] = useState<'smtp' | 'imap' | null>(null)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)

  useEffect(() => {
    fetchConfig()
    // Limpiar el timer de reset visual al desmontar
    return () => {
      if (saveResetTimer.current) clearTimeout(saveResetTimer.current)
    }
  }, [])

  const fetchConfig = async () => {
    try {
      const res = await fetch('/api/configuracion')
      if (res.ok) {
        const data = await res.json()
        setConfig({
          smtp_host: data.smtp_host || '',
          smtp_port: data.smtp_port || '587',
          smtp_user: data.smtp_user || '',
          smtp_password: data.smtp_password || '',
          smtp_encryption: data.smtp_encryption || 'tls',
          smtp_from_email: data.smtp_from_email || '',
          smtp_from_name: data.smtp_from_name || '',
          smtp_enabled: data.smtp_enabled === true || data.smtp_enabled === 'true',
          imap_host: data.imap_host || '',
          imap_port: data.imap_port || '993',
          imap_user: data.imap_user || '',
          imap_password: data.imap_password || '',
          imap_encryption: data.imap_encryption || 'ssl',
          imap_catchall: data.imap_catchall || '',
          imap_enabled: data.imap_enabled === true || data.imap_enabled === 'true',
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
    setSaveState('saving')
    setTestResult(null)
    if (saveResetTimer.current) clearTimeout(saveResetTimer.current)
    try {
      const res = await fetch('/api/configuracion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          section: 'email',
          data: {
            smtp_host: config.smtp_host,
            smtp_port: config.smtp_port,
            smtp_user: config.smtp_user,
            smtp_password: config.smtp_password,
            smtp_encryption: config.smtp_encryption,
            smtp_from_email: config.smtp_from_email,
            smtp_from_name: config.smtp_from_name,
            smtp_enabled: config.smtp_enabled,
            imap_host: config.imap_host,
            imap_port: config.imap_port,
            imap_user: config.imap_user,
            imap_password: config.imap_password,
            imap_encryption: config.imap_encryption,
            imap_catchall: config.imap_catchall,
            imap_enabled: config.imap_enabled,
          },
        }),
      })
      if (res.ok) {
        toast.success('Configuración guardada')
        setSaveState('saved')
        saveResetTimer.current = setTimeout(() => setSaveState('idle'), 2500)
      }
      else {
        const err = await res.json()
        toast.error(err.error || 'Error al guardar')
        setSaveState('error')
      }
    } catch {
      toast.error('Error de conexión')
      setSaveState('error')
    } finally {
      setSaving(false)
    }
  }

  const handleTest = async (mode: 'smtp' | 'imap') => {
    setTesting(mode)
    setTestResult(null)
    try {
      const body = mode === 'smtp'
        ? { host: config.smtp_host, port: parseInt(config.smtp_port) || 587, user: config.smtp_user, password: config.smtp_password, encryption: config.smtp_encryption, fromEmail: config.smtp_from_email, fromName: config.smtp_from_name }
        : { host: config.imap_host, port: parseInt(config.imap_port) || 993, user: config.imap_user, password: config.imap_password, encryption: config.imap_encryption }
      const res = await fetch(`/api/configuracion/email/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, mode }),
      })
      const data = await res.json()
      setTestResult({
        ok: res.ok,
        message: data.message || (res.ok ? `Conexión ${mode === 'smtp' ? 'SMTP' : 'IMAP'} exitosa` : 'Error de conexión'),
      })
    } catch {
      setTestResult({ ok: false, message: 'Error de conexión al probar' })
    } finally {
      setTesting(null)
    }
  }

  if (loading) {
    return (
      <Card><CardContent className="p-12 text-center"><Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" /></CardContent></Card>
    )
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-2xl font-bold tracking-tight">Configuración de Correo</h2>
        <p className="text-sm text-muted-foreground">
          Configura tu propio servidor de correo para enviar y recibir emails desde Volkern con tu dominio
        </p>
      </div>

      <Tabs defaultValue="smtp">
        <TabsList>
          <TabsTrigger value="smtp" className="flex items-center gap-1.5">
            <ArrowUpFromLine className="h-4 w-4" />
            Envío SMTP
          </TabsTrigger>
          <TabsTrigger value="imap" className="flex items-center gap-1.5">
            <Inbox className="h-4 w-4" />
            Recepción IMAP
          </TabsTrigger>
        </TabsList>

        <TabsContent value="smtp" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mail className="h-5 w-5" />
                Servidor SMTP
              </CardTitle>
              <CardDescription>
                Tus correos salientes se enviarán a través de tu propio servidor SMTP en lugar del sistema por defecto
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="smtp-enabled" className="text-sm font-medium">SMTP habilitado</Label>
                  <p className="text-xs text-muted-foreground">Activa el envío a través de tu propio servidor</p>
                </div>
                <Switch id="smtp-enabled" checked={config.smtp_enabled} onCheckedChange={(v) => setConfig({ ...config, smtp_enabled: v })} />
              </div>
              <Separator />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="smtp-host">Servidor SMTP</Label>
                  <Input id="smtp-host" value={config.smtp_host} onChange={(e) => setConfig({ ...config, smtp_host: e.target.value })} placeholder="smtp.gmail.com" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="smtp-port">Puerto</Label>
                  <Input id="smtp-port" value={config.smtp_port} onChange={(e) => setConfig({ ...config, smtp_port: e.target.value })} placeholder="587" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="smtp-user">Usuario</Label>
                  <Input id="smtp-user" value={config.smtp_user} onChange={(e) => setConfig({ ...config, smtp_user: e.target.value })} placeholder="tu@correo.com" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="smtp-password">Contraseña</Label>
                  <Input id="smtp-password" type="password" value={config.smtp_password} onChange={(e) => setConfig({ ...config, smtp_password: e.target.value })} placeholder="••••••••" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="smtp-encryption">Cifrado</Label>
                  <Select value={config.smtp_encryption} onValueChange={(v) => setConfig({ ...config, smtp_encryption: v })}>
                    <SelectTrigger id="smtp-encryption"><SelectValue /></SelectTrigger>
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
                <h4 className="text-sm font-medium">Remitente</h4>
                <p className="text-xs text-muted-foreground">Cómo aparecerán los correos enviados</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="smtp-from-email">Correo remitente</Label>
                  <Input id="smtp-from-email" value={config.smtp_from_email} onChange={(e) => setConfig({ ...config, smtp_from_email: e.target.value })} placeholder="no-reply@tudominio.com" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="smtp-from-name">Nombre remitente</Label>
                  <Input id="smtp-from-name" value={config.smtp_from_name} onChange={(e) => setConfig({ ...config, smtp_from_name: e.target.value })} placeholder="Tu Empresa" />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="imap" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Inbox className="h-5 w-5" />
                Servidor IMAP
              </CardTitle>
              <CardDescription>
                Recibe y sincroniza los correos de tus leads y contactos automáticamente en el módulo de comunicaciones
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="imap-enabled" className="text-sm font-medium">IMAP habilitado</Label>
                  <p className="text-xs text-muted-foreground">Activa la recepción de correos vía IMAP</p>
                </div>
                <Switch id="imap-enabled" checked={config.imap_enabled} onCheckedChange={(v) => setConfig({ ...config, imap_enabled: v })} />
              </div>
              <Separator />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="imap-host">Servidor IMAP</Label>
                  <Input id="imap-host" value={config.imap_host} onChange={(e) => setConfig({ ...config, imap_host: e.target.value })} placeholder="imap.gmail.com" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="imap-port">Puerto</Label>
                  <Input id="imap-port" value={config.imap_port} onChange={(e) => setConfig({ ...config, imap_port: e.target.value })} placeholder="993" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="imap-user">Usuario</Label>
                  <Input id="imap-user" value={config.imap_user} onChange={(e) => setConfig({ ...config, imap_user: e.target.value })} placeholder="tu@correo.com" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="imap-password">Contraseña</Label>
                  <Input id="imap-password" type="password" value={config.imap_password} onChange={(e) => setConfig({ ...config, imap_password: e.target.value })} placeholder="••••••••" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="imap-encryption">Cifrado</Label>
                  <Select value={config.imap_encryption} onValueChange={(v) => setConfig({ ...config, imap_encryption: v })}>
                    <SelectTrigger id="imap-encryption"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ssl">SSL (993)</SelectItem>
                      <SelectItem value="tls">TLS (143)</SelectItem>
                      <SelectItem value="none">Sin cifrado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="imap-catchall">Catch-all / Email corporativo</Label>
                  <Input id="imap-catchall" value={config.imap_catchall} onChange={(e) => setConfig({ ...config, imap_catchall: e.target.value })} placeholder="info@tudominio.com" />
                  <p className="text-xs text-muted-foreground">Dirección catchall o corporativa desde la que se recibirán los correos de leads/contactos</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {testResult && (
        <Card className={testResult.ok ? 'border-emerald-500/30' : 'border-red-500/30'}>
          <CardContent className="p-4 flex items-center gap-3">
            {testResult.ok ? <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" /> : <AlertTriangle className="h-5 w-5 text-red-500 shrink-0" />}
            <p className={`text-sm ${testResult.ok ? 'text-emerald-700' : 'text-red-700'}`}>{testResult.message}</p>
          </CardContent>
        </Card>
      )}

      <div className="flex items-center gap-3 flex-wrap">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          {saving ? 'Guardando...' : 'Guardar Configuración'}
        </Button>
        {saveState === 'saved' && (
          <span className="text-sm text-emerald-600 font-medium flex items-center gap-1">
            <CheckCircle2 className="h-4 w-4" /> Guardado ✓
          </span>
        )}
        {saveState === 'error' && (
          <span className="text-sm text-red-600 font-medium flex items-center gap-1">
            <AlertTriangle className="h-4 w-4" /> Error al guardar — reintenta
          </span>
        )}
        <Button variant="outline" onClick={() => handleTest('smtp')} disabled={testing !== null || !config.smtp_host || !config.smtp_user}>
          {testing === 'smtp' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
          {testing === 'smtp' ? 'Probando...' : 'Probar SMTP'}
        </Button>
        <Button variant="outline" onClick={() => handleTest('imap')} disabled={testing !== null || !config.imap_host || !config.imap_user}>
          {testing === 'imap' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Inbox className="mr-2 h-4 w-4" />}
          {testing === 'imap' ? 'Probando...' : 'Probar IMAP'}
        </Button>
        <Button variant="ghost" onClick={fetchConfig} disabled={saving || testing !== null}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Recargar
        </Button>
      </div>
    </div>
  )
}
