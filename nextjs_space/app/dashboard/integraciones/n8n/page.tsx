'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  Bot, Zap, RefreshCw, CheckCircle2, XCircle, Info, Copy, ExternalLink,
  BookOpen, Code, Workflow, Shield, Clock, ArrowRight, Settings, AlertTriangle
} from 'lucide-react'
import { toast } from 'sonner'

export default function N8nIntegrationPage() {
  const [syncing, setSyncing] = useState(false)
  const [n8nUrl, setN8nUrl] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [webhookSecret, setWebhookSecret] = useState('')

  const handleSync = async () => {
    setSyncing(true)
    try {
      const res = await fetch('/api/automation/external/sync', { method: 'POST' })
      const data = await res.json()
      if (res.ok) {
        toast.success(`Sincronizado: ${data.synced || 0} workflows`)
      } else {
        toast.error(data.error || 'Error al sincronizar')
      }
    } catch (error) {
      toast.error('Error de conexión')
    } finally {
      setSyncing(false)
    }
  }

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text)
    toast.success(`${label} copiado al portapapeles`)
  }

  const callbackUrl = typeof window !== 'undefined' 
    ? `${window.location.origin}/api/webhooks/n8n/callback`
    : '/api/webhooks/n8n/callback'

  const triggerUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/api/webhooks/n8n/trigger`
    : '/api/webhooks/n8n/trigger'

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <Bot className="h-8 w-8 text-orange-500" />
            Integración con n8n
          </h1>
          <p className="text-muted-foreground mt-1">
            Conecta Volkern con n8n para automatizaciones avanzadas
          </p>
        </div>
        <Button onClick={handleSync} disabled={syncing}>
          <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? 'animate-spin' : ''}`} />
          Sincronizar Workflows
        </Button>
      </div>

      <Tabs defaultValue="inicio" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="inicio">Inicio Rápido</TabsTrigger>
          <TabsTrigger value="configuracion">Configuración</TabsTrigger>
          <TabsTrigger value="endpoints">Endpoints</TabsTrigger>
          <TabsTrigger value="ejemplos">Ejemplos</TabsTrigger>
        </TabsList>

        {/* Inicio Rápido */}
        <TabsContent value="inicio" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <span className="h-8 w-8 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center text-blue-600">1</span>
                  Instala n8n
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Si aún no tienes n8n, puedes instalarlo de varias formas:
                </p>
                <div className="space-y-2">
                  <code className="block p-2 bg-slate-100 dark:bg-slate-800 rounded text-xs">
                    npm install n8n -g && n8n start
                  </code>
                  <code className="block p-2 bg-slate-100 dark:bg-slate-800 rounded text-xs">
                    docker run -it --rm -p 5678:5678 n8nio/n8n
                  </code>
                </div>
                <Button variant="outline" size="sm" asChild>
                  <a href="https://docs.n8n.io/hosting/" target="_blank" rel="noopener">
                    <ExternalLink className="h-3 w-3 mr-1" />
                    Documentación n8n
                  </a>
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <span className="h-8 w-8 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center text-blue-600">2</span>
                  Configura Variables
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Añade estas variables a tu archivo <code>.env</code>:
                </p>
                <code className="block p-2 bg-slate-100 dark:bg-slate-800 rounded text-xs whitespace-pre">
{`N8N_URL=https://tu-n8n.com
N8N_API_KEY=tu-api-key
N8N_WEBHOOK_SECRET=secreto-compartido`}
                </code>
                <p className="text-xs text-muted-foreground">
                  El API Key lo obtienes en n8n: Settings {'->'} API {'->'} Create API Key
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <span className="h-8 w-8 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center text-blue-600">3</span>
                  Crea un Workflow en n8n
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Crea un workflow con un nodo <strong>Webhook</strong> como trigger:
                </p>
                <ol className="text-sm space-y-1 list-decimal list-inside text-muted-foreground">
                  <li>Añade nodo "Webhook"</li>
                  <li>Configura como POST</li>
                  <li>Guarda y activa el workflow</li>
                  <li>Copia la URL del webhook</li>
                </ol>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <span className="h-8 w-8 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center text-blue-600">4</span>
                  Sincroniza y Usa
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Haz clic en "Sincronizar Workflows" y tu workflow aparecerá en el builder de automatizaciones.
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" asChild>
                    <a href="/dashboard/automatizaciones">
                      <Workflow className="h-3 w-3 mr-1" />
                      Ir al Builder
                    </a>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          <Alert>
            <Info className="h-4 w-4" />
            <AlertTitle>Arquitectura</AlertTitle>
            <AlertDescription>
              Volkern actúa como <strong>orquestador</strong>. Los usuarios nunca interactúan con n8n directamente.
              Volkern crea, actualiza y ejecuta workflows mientras n8n solo los ejecuta.
            </AlertDescription>
          </Alert>
        </TabsContent>

        {/* Configuración */}
        <TabsContent value="configuracion" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                Configuración de Conexión
              </CardTitle>
              <CardDescription>
                Estas variables deben configurarse en el archivo .env del servidor
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>URL de n8n</Label>
                  <Input
                    value={n8nUrl}
                    onChange={(e) => setN8nUrl(e.target.value)}
                    placeholder="https://tu-n8n-server.com"
                  />
                  <p className="text-xs text-muted-foreground">Variable: N8N_URL</p>
                </div>
                <div className="space-y-2">
                  <Label>API Key</Label>
                  <Input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="n8n_api_..."
                  />
                  <p className="text-xs text-muted-foreground">Variable: N8N_API_KEY</p>
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Webhook Secret (HMAC)</Label>
                  <Input
                    value={webhookSecret}
                    onChange={(e) => setWebhookSecret(e.target.value)}
                    placeholder="tu-secreto-compartido"
                  />
                  <p className="text-xs text-muted-foreground">
                    Variable: N8N_WEBHOOK_SECRET - Usado para firmar y verificar webhooks
                  </p>
                </div>
              </div>

              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Importante</AlertTitle>
                <AlertDescription>
                  Las variables de entorno deben configurarse directamente en el servidor.
                  Esta página es solo de referencia y documentación.
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Endpoints */}
        <TabsContent value="endpoints" className="space-y-4">
          <div className="grid gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ArrowRight className="h-5 w-5 text-green-500" />
                  Callback URL (n8n {'->'} Volkern)
                </CardTitle>
                <CardDescription>
                  n8n envía resultados de workflows a esta URL
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <code className="flex-1 p-2 bg-slate-100 dark:bg-slate-800 rounded text-sm">
                    {callbackUrl}
                  </code>
                  <Button variant="outline" size="icon" onClick={() => copyToClipboard(callbackUrl, 'Callback URL')}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                <div className="mt-4 space-y-2">
                  <p className="text-sm font-medium">Payload esperado:</p>
                  <code className="block p-3 bg-slate-100 dark:bg-slate-800 rounded text-xs whitespace-pre overflow-x-auto">
{`{
  "tenantId": "string",
  "workflowId": "string",
  "workflowName": "string",
  "status": "success" | "error",
  "result": { ... },
  "error": "string (si aplica)",
  "leadId": "string (opcional)",
  "duration": 1234
}`}
                  </code>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="h-5 w-5 text-blue-500" />
                  Trigger URL (n8n {'->'} Volkern)
                </CardTitle>
                <CardDescription>
                  n8n puede disparar automatizaciones en Volkern
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <code className="flex-1 p-2 bg-slate-100 dark:bg-slate-800 rounded text-sm">
                    {triggerUrl}
                  </code>
                  <Button variant="outline" size="icon" onClick={() => copyToClipboard(triggerUrl, 'Trigger URL')}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                <div className="mt-4 space-y-2">
                  <p className="text-sm font-medium">Payload esperado:</p>
                  <code className="block p-3 bg-slate-100 dark:bg-slate-800 rounded text-xs whitespace-pre overflow-x-auto">
{`{
  "tenantId": "string (requerido)",
  "trigger": "nuevo_lead" | "cita_agendada" | ...,
  "leadId": "string (opcional)",
  "customData": { ... }
}`}
                  </code>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5 text-purple-500" />
                  Verificación de Firmas HMAC
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Los webhooks pueden incluir firma HMAC para verificar autenticidad.
                </p>
                <div className="space-y-2">
                  <p className="text-sm font-medium">Header de firma:</p>
                  <code className="block p-2 bg-slate-100 dark:bg-slate-800 rounded text-xs">
                    X-Volkern-Signature: sha256=...
                  </code>
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium">Cómo verificar en n8n:</p>
                  <code className="block p-3 bg-slate-100 dark:bg-slate-800 rounded text-xs whitespace-pre overflow-x-auto">
{`// En un nodo Function de n8n:
const crypto = require('crypto');
const secret = $env.N8N_WEBHOOK_SECRET;
const signature = $input.first().headers['x-volkern-signature'];
const body = JSON.stringify($input.first().body);
const expected = 'sha256=' + crypto
  .createHmac('sha256', secret)
  .update(body)
  .digest('hex');
return { valid: signature === expected };`}
                  </code>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Ejemplos */}
        <TabsContent value="ejemplos" className="space-y-4">
          <div className="grid gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Ejemplo 1: Sync Lead a Google Sheets</CardTitle>
                <CardDescription>
                  Cuando se crea un lead, agregarlo automáticamente a una hoja de cálculo
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge>Trigger: Webhook</Badge>
                    <ArrowRight className="h-4 w-4" />
                    <Badge variant="outline">Google Sheets</Badge>
                    <ArrowRight className="h-4 w-4" />
                    <Badge variant="outline">HTTP Request (Callback)</Badge>
                  </div>
                  <code className="block p-3 bg-slate-100 dark:bg-slate-800 rounded text-xs whitespace-pre overflow-x-auto">
{`// Workflow n8n:
1. Webhook (recibe datos de Volkern)
2. Google Sheets (Append Row)
   - Spreadsheet ID: tu-spreadsheet
   - Sheet: Leads
   - Values: {{ $json.data.lead.nombre }}, {{ $json.data.lead.email }}
3. HTTP Request (notifica a Volkern)
   - URL: ${callbackUrl}
   - Method: POST
   - Body: { status: "success", result: { ... } }`}
                  </code>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Ejemplo 2: Notificación Slack + Discord</CardTitle>
                <CardDescription>
                  Envía notificación a múltiples canales cuando se cierra una venta
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge>Trigger: Webhook</Badge>
                    <ArrowRight className="h-4 w-4" />
                    <Badge variant="outline">Split (paralelo)</Badge>
                    <ArrowRight className="h-4 w-4" />
                    <Badge variant="outline">Slack + Discord</Badge>
                  </div>
                  <code className="block p-3 bg-slate-100 dark:bg-slate-800 rounded text-xs whitespace-pre overflow-x-auto">
{`// En Volkern, el payload enviado incluye:
{
  "tenantId": "xxx",
  "event": "pago_recibido",
  "data": {
    "lead": { "nombre": "Juan", "email": "juan@test.com" },
    "monto": 1500,
    "producto": "Curso Premium"
  }
}

// n8n puede usar estos datos para:
- Formatear mensaje personalizado
- Enviar a Slack con emoji y formato
- Enviar a Discord con embed`}
                  </code>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Ejemplo 3: Enriquecimiento con AI</CardTitle>
                <CardDescription>
                  Analiza el website del lead usando OpenAI para extraer información
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge>Webhook</Badge>
                    <ArrowRight className="h-4 w-4" />
                    <Badge variant="outline">HTTP (scrape)</Badge>
                    <ArrowRight className="h-4 w-4" />
                    <Badge variant="outline">OpenAI</Badge>
                    <ArrowRight className="h-4 w-4" />
                    <Badge variant="outline">Callback</Badge>
                  </div>
                  <code className="block p-3 bg-slate-100 dark:bg-slate-800 rounded text-xs whitespace-pre overflow-x-auto">
{`// Flujo n8n:
1. Webhook: Recibe { lead: { website: "https://..." } }
2. HTTP Request: Scrape del website
3. OpenAI: "Analiza este contenido y extrae:
   - Industria de la empresa
   - Tamaño estimado
   - Tecnologías que usan"
4. Callback a Volkern con los datos enriquecidos`}
                  </code>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
