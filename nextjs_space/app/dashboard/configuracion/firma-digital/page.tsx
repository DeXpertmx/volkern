'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { FileSignature, Loader2, Save, CheckCircle2, XCircle, Copy, Info, Plug, X } from 'lucide-react';
import { toast } from 'sonner';

interface FirmaDigitalSettings {
  configured: boolean;
  tenantId: string;
  id?: string;
  provider?: string;
  url?: string;
  apiToken?: string;
  webhookSecret?: string;
  isActive?: boolean;
  webhookSignatureOptional?: boolean;
  webhookUrl?: string;
}

export default function FirmaDigitalPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; checks: Record<string, { ok: boolean; detail: string }> } | null>(null);
  const [settings, setSettings] = useState<FirmaDigitalSettings | null>(null);

  const [url, setUrl] = useState('');
  const [apiToken, setApiToken] = useState('');
  const [webhookSecret, setWebhookSecret] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [signatureOptional, setSignatureOptional] = useState(false);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/integraciones/firma-digital');

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Error desconocido' }));
        throw new Error(errorData.error || `Error ${response.status}`);
      }

      const data = await response.json();
      setSettings(data);

      if (data.configured) {
        setUrl(data.url || '');
        setApiToken(data.apiToken || '');
        setWebhookSecret(data.webhookSecret || '');
        setIsActive(data.isActive ?? true);
        setSignatureOptional(data.webhookSignatureOptional ?? false);
      }
    } catch (error) {
      console.error('Error al cargar configuración de firma digital:', error);
      const errorMessage = error instanceof Error ? error.message : 'Error al cargar la información';
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const handleSave = async () => {
    try {
      setSaving(true);
      const response = await fetch('/api/integraciones/firma-digital', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url,
          apiToken,
          webhookSecret,
          isActive,
          webhookSignatureOptional: signatureOptional
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Error desconocido' }));
        throw new Error(errorData.error || `Error ${response.status}`);
      }

      const data = await response.json();
      toast.success('Configuración de firma digital guardada');
      await fetchSettings();
    } catch (error) {
      console.error('Error al guardar configuración de firma digital:', error);
      const errorMessage = error instanceof Error ? error.message : 'Error al guardar la configuración';
      toast.error(errorMessage);
    } finally {
      setSaving(false);
    }
  };

  const copyWebhookUrl = async () => {
    if (!settings?.webhookUrl) return;
    try {
      await navigator.clipboard.writeText(settings.webhookUrl);
      toast.success('URL del webhook copiada');
    } catch {
      toast.error('No se pudo copiar la URL');
    }
  };

  const handleTest = async () => {
    if (!url.trim()) {
      toast.error('Indica la URL de la instancia primero');
      return;
    }
    try {
      setTesting(true);
      setTestResult(null);
      const response = await fetch('/api/integraciones/firma-digital/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, apiToken })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Error desconocido' }));
        throw new Error(errorData.error || `Error ${response.status}`);
      }

      const data = await response.json();
      setTestResult(data);
      if (data.success) {
        toast.success('Conexión verificada correctamente');
      } else {
        toast.error('La conexión tiene problemas — revisa el detalle');
      }
    } catch (error) {
      console.error('Error al probar conexión:', error);
      const errorMessage = error instanceof Error ? error.message : 'Error al probar la conexión';
      toast.error(errorMessage);
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const configured = settings?.configured ?? false;

  return (
    <div className="max-w-2xl mx-auto py-8 px-4 space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center">
          <FileSignature className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Firma Digital</h1>
          <p className="text-sm text-muted-foreground">Conexión con tu instancia LibreSign para la firma electrónica de contratos</p>
        </div>
        <div className="ml-auto">
          {configured ? (
            <Badge variant="success" className="gap-1">
              <CheckCircle2 className="h-3 w-3" /> Configurada
            </Badge>
          ) : (
            <Badge variant="secondary" className="gap-1">
              <XCircle className="h-3 w-3" /> Sin configurar
            </Badge>
          )}
        </div>
      </div>

      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          Cada tenant apunta a su propia instancia LibreSign. La API token y el webhook secret se
          guardan cifrados. Sin configuración, el envío de contratos a firma usa un UUID de
          respaldo (modo desarrollo) y no se envían correos al firmante.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle>Instancia LibreSign</CardTitle>
          <CardDescription>URL y credenciales de la instancia de firma de tu empresa</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="url">URL de la instancia</Label>
            <Input
              id="url"
              placeholder="https://firma.tuempresa.com"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="apiToken">API token</Label>
            <Input
              id="apiToken"
              type="password"
              placeholder={configured ? '•••••••••••••••• (dejar vacío para conservar)' : 'Token de API de LibreSign'}
              value={apiToken}
              onChange={(e) => setApiToken(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Se cifra antes de guardarse. Si se deja enmascarado se conserva el actual.
            </p>
          </div>

          <Button variant="outline" onClick={handleTest} disabled={testing || saving} className="w-full">
            {testing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plug className="h-4 w-4 mr-2" />}
            {testing ? 'Probando conexión...' : 'Probar conexión'}
          </Button>

          {testResult && (
            <div className={`rounded-lg border p-4 space-y-2 ${testResult.success ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-red-500/40 bg-red-500/5'}`}>
              <div className="flex items-center justify-between">
                <p className={`text-sm font-semibold flex items-center gap-2 ${testResult.success ? 'text-emerald-600' : 'text-red-600'}`}>
                  {testResult.success ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                  {testResult.success ? 'Conexión correcta' : 'La conexión tiene problemas'}
                </p>
                <button onClick={() => setTestResult(null)} className="text-muted-foreground hover:text-foreground" aria-label="Cerrar">
                  <X className="h-4 w-4" />
                </button>
              </div>
              {Object.entries(testResult.checks).map(([key, check]) => (
                <div key={key} className="flex items-start gap-2 text-sm">
                  {check.ok
                    ? <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                    : <XCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />}
                  <div>
                    <p className="font-medium">{
                      key === 'host' ? 'Host' : key === 'nextcloud' ? 'Instancia Nextcloud' : 'API + token'
                    }</p>
                    <p className="text-xs text-muted-foreground">{check.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="webhookSecret">Webhook secret</Label>
            <Input
              id="webhookSecret"
              type="password"
              placeholder={configured ? '•••••••••••••••• (dejar vacío para conservar)' : 'Secreto compartido con LibreSign'}
              value={webhookSecret}
              onChange={(e) => setWebhookSecret(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Usado para verificar el origen de los eventos. Si se deja enmascarado se conserva el actual.
            </p>
          </div>

          <div className="flex items-center justify-between rounded-lg border p-4">
            <div>
              <p className="text-sm font-medium">Firma activa</p>
              <p className="text-xs text-muted-foreground">Permite enviar contratos a firma con esta instancia</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={isActive}
              onClick={() => setIsActive(!isActive)}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors ${
                isActive ? 'bg-indigo-600' : 'bg-muted'
              }`}
            >
              <span
                className={`pointer-events-none block h-5 w-5 rounded-full bg-white shadow-lg ring-0 transition-transform ${
                  isActive ? 'translate-x-6' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>

          <div className="flex items-center justify-between rounded-lg border p-4">
            <div>
              <p className="text-sm font-medium">Aceptar webhooks sin firma</p>
              <p className="text-xs text-muted-foreground">
                Solo para instancias LibreSign que no firman sus webhooks. Con esto activado, las
                peticiones sin cabecera de firma se aceptan (con aviso en logs); una firma presente
                pero inválida se sigue rechazando.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={signatureOptional}
              onClick={() => setSignatureOptional(!signatureOptional)}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors ${
                signatureOptional ? 'bg-indigo-600' : 'bg-muted'
              }`}
            >
              <span
                className={`pointer-events-none block h-5 w-5 rounded-full bg-white shadow-lg ring-0 transition-transform ${
                  signatureOptional ? 'translate-x-6' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>

          <Button onClick={handleSave} disabled={saving} className="w-full">
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
            Guardar configuración
          </Button>
        </CardContent>
      </Card>

      {configured && settings?.webhookUrl && (
        <Card>
          <CardHeader>
            <CardTitle>Webhook de eventos</CardTitle>
            <CardDescription>Registra esta URL como callback en tu instancia LibreSign para recibir los eventos de firma</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded-md bg-muted px-3 py-2 text-xs break-all">
                {settings.webhookUrl}
              </code>
              <Button variant="outline" size="icon" onClick={copyWebhookUrl} title="Copiar URL">
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Eventos recibidos: <code>document_signed</code>, <code>viewed</code>, etc. Al recibir
              <code> document_signed</code>, el contrato se marca como firmado automáticamente.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
