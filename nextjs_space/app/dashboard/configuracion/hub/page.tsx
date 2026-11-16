'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Activity,
  CheckCircle2,
  KeyRound,
  Loader2,
  MessageCircle,
  Save,
  Send,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';

interface HubConfig {
  isActive?: boolean;
  hasChatwootAgentToken?: boolean;
  chatwootAccountId?: number | null;
  whatsappInboxId?: number | null;
  chatwootConfigurado?: boolean;
}

interface Paso {
  id: string;
  titulo: string;
  ok: boolean;
  detalle: string;
}

interface Envio {
  proveedor: 'hub' | 'evolution' | null;
  ok: boolean;
  detalle: string;
  motivoHub?: string;
  conversationId?: number | null;
  messageId?: number | string | null;
}

interface Diagnostico {
  ok: boolean;
  pasos: Paso[];
  envio?: Envio;
}

export default function HubConfigPage() {
  const [config, setConfig] = useState<HubConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [token, setToken] = useState('');

  const [numero, setNumero] = useState('');
  const [mensaje, setMensaje] = useState('Prueba de Volkern: mensajería saliente funcionando.');
  const [diagLoading, setDiagLoading] = useState<'validar' | 'enviar' | null>(null);
  const [diag, setDiag] = useState<Diagnostico | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/integrations/messaging-hub', { cache: 'no-store' });
        if (res.ok) setConfig(await res.json());
      } catch (error) {
        console.error('Error cargando config del hub:', error);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const guardar = async () => {
    if (!token.trim()) {
      toast.error('Pega el token de agente de Chatwoot');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/integrations/messaging-hub', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatwootAgentToken: token.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || 'No se pudo guardar el token');
        return;
      }
      toast.success('Token de agente guardado. Los envíos saldrán por el inbox del hub.');
      setToken('');
      setConfig((prev) => ({ ...(prev || {}), hasChatwootAgentToken: true }));
    } catch (error: any) {
      toast.error(error?.message || 'Error de conexión');
    } finally {
      setSaving(false);
    }
  };

  const diagnosticar = async (enviar: boolean) => {
    if (enviar && !numero.trim()) {
      toast.error('Escribe el número al que quieres mandar la prueba');
      return;
    }
    setDiagLoading(enviar ? 'enviar' : 'validar');
    try {
      const res = await fetch('/api/integrations/messaging-hub/diagnostico', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enviar, numero: numero.trim(), mensaje: mensaje.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || 'No se pudo completar el diagnóstico');
        return;
      }
      setDiag(data as Diagnostico);
      if (enviar && data?.envio?.ok) {
        toast.success(
          data.envio.proveedor === 'hub'
            ? 'Prueba enviada por el hub (Chatwoot)'
            : 'Prueba enviada por Evolution (hub no disponible)'
        );
      } else if (enviar && data?.envio && !data.envio.ok) {
        toast.error('La prueba no salió por ningún canal');
      }
    } catch (error: any) {
      toast.error(error?.message || 'Error de conexión');
    } finally {
      setDiagLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  const guardado = Boolean(config?.hasChatwootAgentToken);

  return (
    <div className="container mx-auto p-6 max-w-3xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <MessageCircle className="h-8 w-8 text-primary" />
          Hub de Comunicaciones
        </h1>
        <p className="text-gray-600 mt-2">
          Conecta Volkern con el inbox de WhatsApp del hub para que los mensajes
          salientes se envíen desde la misma conversación del cliente.
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2 text-xl">
                <KeyRound className="h-5 w-5 text-primary" />
                Token de agente
              </CardTitle>
              <CardDescription className="mt-1">
                Token de acceso del agente (usuario) de la cuenta del hub. Se guarda cifrado
                y no se vuelve a mostrar.
              </CardDescription>
            </div>
            <Badge
              variant={guardado ? 'default' : 'secondary'}
              className="gap-1 whitespace-nowrap"
            >
              {guardado ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
              {guardado ? 'Token guardado' : 'Sin token'}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert className="bg-blue-50 border-blue-200">
            <ShieldCheck className="h-4 w-4 text-blue-600" />
            <AlertDescription className="text-blue-800 text-sm">
              No sirve el token del bot del hub: el hub lo rechaza con{' '}
              <code className="text-xs">401 not authorized for bots</code> al enviar. Usa el
              token de un agente de la cuenta (Perfil → Token de acceso) con permiso sobre el
              inbox de WhatsApp. Sin token de agente, los envíos caen al WhatsApp del negocio
              (Evolution) y no quedan en la conversación del hub.
            </AlertDescription>
          </Alert>

          <div className="space-y-2">
            <Label htmlFor="chatwoot-agent-token">Token de agente de Chatwoot</Label>
            <Input
              id="chatwoot-agent-token"
              type="password"
              autoComplete="off"
              placeholder={guardado ? '•••••••••••••••• (guardado)' : 'Pega aquí el token del agente'}
              value={token}
              onChange={(e) => setToken(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
            <div className="bg-gray-50 border rounded-lg p-3">
              <p className="text-xs text-muted-foreground">Cuenta del hub</p>
              <p className="font-medium">{config?.chatwootAccountId ?? 'No asignada'}</p>
            </div>
            <div className="bg-gray-50 border rounded-lg p-3">
              <p className="text-xs text-muted-foreground">Inbox de WhatsApp</p>
              <p className="font-medium">{config?.whatsappInboxId ?? 'No asignado'}</p>
            </div>
            <div className="bg-gray-50 rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Servidor del hub</p>
              <p className="font-medium">
                {config?.chatwootConfigurado ? 'Configurado' : 'No configurado'}
              </p>
            </div>
          </div>

          {config?.chatwootAccountId == null && (
            <p className="text-xs text-amber-700">
              Este tenant aún no tiene cuenta del hub asignada: el token se guarda, pero los
              envíos no podrán usar el hub hasta que el canal esté provisionado.
            </p>
          )}

          <div className="flex justify-end pt-2">
            <Button onClick={guardar} disabled={saving || !token.trim()} className="gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Guardar token
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <Activity className="h-5 w-5 text-primary" />
            Diagnóstico
          </CardTitle>
          <CardDescription>
            Comprueba el servidor, el token de agente, la cuenta y el inbox, y manda un mensaje
            de prueba indicando si salió por el hub o por Evolution.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="diagnostico-numero">Número de prueba</Label>
              <Input
                id="diagnostico-numero"
                inputMode="tel"
                placeholder="+34600123456"
                value={numero}
                onChange={(e) => setNumero(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="diagnostico-mensaje">Mensaje</Label>
              <Input
                id="diagnostico-mensaje"
                value={mensaje}
                onChange={(e) => setMensaje(e.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            <Button
              variant="outline"
              className="gap-2"
              onClick={() => diagnosticar(false)}
              disabled={diagLoading !== null}
            >
              {diagLoading === 'validar' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ShieldCheck className="h-4 w-4" />
              )}
              Validar conexión
            </Button>
            <Button
              className="gap-2"
              onClick={() => diagnosticar(true)}
              disabled={diagLoading !== null || !numero.trim()}
            >
              {diagLoading === 'enviar' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              Enviar prueba
            </Button>
          </div>

          {diag && (
            <div className="space-y-3">
              <ul className="divide-y rounded-lg border bg-gray-50/60">
                {diag.pasos.map((paso) => (
                  <li key={paso.id} className="flex items-start gap-3 p-3">
                    {paso.ok ? (
                      <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
                    ) : (
                      <XCircle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
                    )}
                    <div className="text-sm">
                      <p className="font-medium">{paso.titulo}</p>
                      <p className="text-muted-foreground text-xs">{paso.detalle}</p>
                    </div>
                  </li>
                ))}
              </ul>

              {diag.envio && (
                <Alert
                  className={
                    diag.envio.ok && diag.envio.proveedor === 'hub'
                      ? 'bg-green-50 border-green-200'
                      : diag.envio.ok
                        ? 'bg-amber-50 border-amber-200'
                        : 'bg-red-50 border-red-200'
                  }
                >
                  {diag.envio.ok && diag.envio.proveedor === 'hub' ? (
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                  ) : diag.envio.ok ? (
                    <Activity className="h-4 w-4 text-amber-600" />
                  ) : (
                    <XCircle className="h-4 w-4 text-red-600" />
                  )}
                  <AlertDescription
                    className={
                      diag.envio.ok && diag.envio.proveedor === 'hub'
                        ? 'text-green-800 text-sm'
                        : diag.envio.ok
                          ? 'text-amber-800 text-sm'
                          : 'text-red-800 text-sm'
                    }
                  >
                    <p className="font-medium">
                      {diag.envio.proveedor === 'hub'
                        ? 'Salió por el hub (Chatwoot)'
                        : diag.envio.proveedor === 'evolution'
                          ? 'Salió por Evolution (WhatsApp del negocio)'
                          : 'No salió por ningún canal'}
                    </p>
                    <p>{diag.envio.detalle}</p>
                    {diag.envio.motivoHub && diag.envio.proveedor !== 'hub' && (
                      <p className="mt-1 text-xs">
                        Motivo por el que el hub no envió: {diag.envio.motivoHub}
                      </p>
                    )}
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
