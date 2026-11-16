'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  CheckCircle2,
  KeyRound,
  Loader2,
  MessageCircle,
  Save,
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

export default function HubConfigPage() {
  const [config, setConfig] = useState<HubConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [token, setToken] = useState('');

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
            <div className="bg-gray-50 border rounded-lg p-3">
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
    </div>
  );
}
