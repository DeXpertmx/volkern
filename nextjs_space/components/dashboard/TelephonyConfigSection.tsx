'use client';

import React, { useState, useEffect } from 'react';
import { 
  Card, 
  CardHeader, 
  CardTitle, 
  CardDescription, 
  CardContent 
} from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { 
  PhoneCall, 
  Save, 
  Key, 
  Settings, 
  Copy, 
  CheckCircle2, 
  Info,
  ExternalLink,
  ShieldCheck
} from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

interface TelephonyConfig {
  apiKey: string;
  apiSecret: string;
  fromExtension: string;
  recordingEnabled: boolean;
  activo: boolean;
}

export function TelephonyConfigSection({ tenantId }: { tenantId: string }) {
  const [config, setConfig] = useState<TelephonyConfig>({
    apiKey: '',
    apiSecret: '',
    fromExtension: '',
    recordingEnabled: true,
    activo: false,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    async function fetchConfig() {
      try {
        const response = await fetch('/api/integrations/telephony/config');
        if (response.ok) {
          const data = await response.json();
          if (data.credenciales) {
            setConfig({
              apiKey: data.credenciales.apiKey || '',
              apiSecret: data.credenciales.apiSecret || '',
              fromExtension: data.credenciales.fromExtension || '',
              recordingEnabled: data.credenciales.recordingEnabled ?? true,
              activo: data.activo,
            });
          }
        }
      } catch (error) {
        console.error('Error fetching telephony config:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchConfig();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const response = await fetch('/api/integrations/telephony/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });

      if (response.ok) {
        toast({
          title: 'Configuración guardada',
          description: 'La telefonía inteligente ha sido configurada correctamente.',
        });
      } else {
        throw new Error('Error al guardar');
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'No se pudo guardar la configuración de telefonía.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    if (!config.apiKey || !config.apiSecret) {
      toast({
        title: 'Error',
        description: 'Introduce tu API Key y Secret para probar la conexión.',
        variant: 'destructive',
      });
      return;
    }

    setTesting(true);
    try {
      const response = await fetch('/api/integrations/telephony/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          apiKey: config.apiKey, 
          apiSecret: config.apiSecret 
        }),
      });

      const data = await response.json();
      if (response.ok && data.success) {
        toast({
          title: '¡Conexión Exitosa!',
          description: data.message,
        });
      } else {
        toast({
          title: 'Error de Conexión',
          description: data.error || 'No se pudo validar las credenciales.',
          variant: 'destructive',
        });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Error de red al probar la conexión.',
        variant: 'destructive',
      });
    } finally {
      setTesting(false);
    }
  };

  const webhookUrl = typeof window !== 'undefined' 
    ? `${window.location.origin}/api/integrations/telephony/webhook?tenantId=${tenantId}`
    : '';

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: 'Copiado',
      description: 'URL de Webhook copiada al portapapeles.',
    });
  };

  if (loading) return <div className="animate-pulse space-y-4">
    <div className="h-32 bg-slate-100 rounded-xl" />
  </div>;

  return (
    <Card className={config.activo ? "border-primary/50 shadow-md overflow-hidden transition-all" : "overflow-hidden"}>
      <CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50/30 border-b">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-blue-600/10 flex items-center justify-center text-blue-600 shadow-sm">
              <PhoneCall className="h-6 w-6" />
            </div>
            <div>
              <CardTitle className="text-lg">Telefonía Inteligente (VoIP)</CardTitle>
              <CardDescription>Conecta tu sistema de llamadas Zadarma</CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${config.activo ? 'bg-green-100 text-green-700 border-green-200' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
              {config.activo ? 'ACTIVO' : 'INACTIVO'}
            </span>
            <Switch 
              checked={config.activo} 
              onCheckedChange={(checked) => setConfig({ ...config, activo: checked })}
            />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6 pt-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="zadarma-key" className="text-xs uppercase tracking-wider font-bold text-slate-500">API Key</Label>
            <div className="relative">
              <Key className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                id="zadarma-key"
                type="text"
                placeholder="Introducir API Key"
                value={config.apiKey}
                onChange={(e) => setConfig({ ...config, apiKey: e.target.value })}
                className="pl-9 h-10 border-slate-200 focus:border-blue-400 focus:ring-blue-400/20"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="zadarma-secret" className="text-xs uppercase tracking-wider font-bold text-slate-500">API Secret</Label>
            <div className="relative">
              <ShieldCheck className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                id="zadarma-secret"
                type="password"
                placeholder="••••••••••••••••"
                value={config.apiSecret}
                onChange={(e) => setConfig({ ...config, apiSecret: e.target.value })}
                className="pl-9 h-10 border-slate-200 focus:border-blue-400 focus:ring-blue-400/20"
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <Button 
            variant="outline" 
            size="sm" 
            className="text-blue-600 border-blue-200 hover:bg-blue-50 gap-2 h-9"
            onClick={handleTest}
            disabled={testing || !config.apiKey}
          >
            {testing ? (
              <div className="h-3 w-3 animate-spin rounded-full border-2 border-blue-600/30 border-t-blue-600" />
            ) : (
              <ShieldCheck className="h-4 w-4" />
            )}
            {testing ? 'Probando...' : 'Probar Conexión'}
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="zadarma-ext" className="text-xs uppercase tracking-wider font-bold text-slate-500">Extensión SIP (Default)</Label>
            <div className="relative">
              <Settings className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                id="zadarma-ext"
                type="text"
                placeholder="Ej: 101"
                value={config.fromExtension}
                onChange={(e) => setConfig({ ...config, fromExtension: e.target.value })}
                className="pl-9 h-10 border-slate-200 focus:border-blue-400 focus:ring-blue-400/20"
              />
            </div>
            <p className="text-[10px] text-muted-foreground">La extensión que se usará para el Click-to-Call si el usuario no tiene una asignada.</p>
          </div>
          <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-200 mt-2">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-lg bg-green-100 flex items-center justify-center text-green-600">
                <CheckCircle2 className="h-5 w-5" />
              </div>
              <div>
                <Label className="text-sm font-bold">Grabar Llamadas</Label>
                <p className="text-[10px] text-slate-500">Descargar grabaciones automáticamente</p>
              </div>
            </div>
            <Switch 
              checked={config.recordingEnabled} 
              onCheckedChange={(checked) => setConfig({ ...config, recordingEnabled: checked })}
            />
          </div>
        </div>

        <div className="p-4 bg-blue-50/50 border border-blue-100 rounded-xl space-y-3">
          <h4 className="text-xs font-bold text-blue-900 flex items-center gap-2">
            <Info className="h-4 w-4" />
            ¿CÓMO CONECTAR CON ZADARMA?
          </h4>
          <ol className="text-[11px] text-blue-800 space-y-2 list-decimal list-inside">
            <li>Inicia sesión en tu panel de <strong>Zadarma</strong>.</li>
            <li>Ve a <strong>Configuración {">"} API y Webhooks</strong>.</li>
            <li>Haz clic en <strong>"Obtener Llaves"</strong> para ver tu <strong>API Key</strong> y <strong>Secret</strong>.</li>
            <li>Copia esos valores en los campos de arriba y activa la integración.</li>
            <li>Finalmente, copia la <strong>URL de Webhook</strong> de abajo y pégala en la sección de notificaciones de tu panel Zadarma.</li>
          </ol>
          <Button 
            variant="link" 
            size="sm" 
            className="p-0 h-auto text-[10px] text-blue-600 font-bold"
            asChild
          >
            <a href="https://my.zadarma.com/api/" target="_blank" className="flex items-center gap-1">
              Abrir Panel de Zadarma <ExternalLink size={10} />
            </a>
          </Button>
        </div>

        <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-xl space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-indigo-900 flex items-center gap-1">
              <CheckCircle2 className="h-3 w-3" />
              CONFIGURACIÓN DE WEBHOOK
            </h4>
          </div>
          <p className="text-[11px] text-indigo-700">
            Pega esta URL en tu panel de Zadarma para recibir notificaciones de llamadas entrantes en tiempo real.
          </p>
          <div className="flex gap-2">
            <div className="flex-1 bg-white border border-indigo-200 rounded-lg px-3 py-2 text-[10px] font-mono text-indigo-800 break-all select-all">
              {webhookUrl}
            </div>
            <Button 
              variant="outline" 
              size="sm" 
              className="h-10 border-indigo-200 text-indigo-600 hover:bg-indigo-100"
              onClick={() => copyToClipboard(webhookUrl)}
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <Button 
          className="w-full bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-600/10 h-11 transition-all active:scale-[0.98]" 
          onClick={handleSave} 
          disabled={saving || !config.apiKey}
        >
          {saving ? (
            <span className="flex items-center gap-2">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              Guardando...
            </span>
          ) : (
            <span className="flex items-center gap-2">
              <Save className="h-4 w-4" />
              Guardar Configuración de Telefonía
            </span>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
