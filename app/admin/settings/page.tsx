'use client';

import { useEffect, useState } from 'react';
import { Settings, Save, ExternalLink, MessageSquare, CheckCircle, XCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

export default function PlatformSettings() {
  const [settings, setSettings] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const res = await fetch('/api/admin/settings');
      if (res.ok) {
        const data = await res.json();
        setSettings(data);
      }
    } catch (error) {
      console.error('Error loading settings:', error);
      toast.error('Error al cargar configuración');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);

    const formData = new FormData(e.currentTarget);
    const data = {
      defaultUserLimit: parseInt(formData.get('defaultUserLimit') as string),
      defaultLeadLimit: parseInt(formData.get('defaultLeadLimit') as string),
      defaultStorageLimit: parseInt(formData.get('defaultStorageLimit') as string),
      trialDaysDefault: parseInt(formData.get('trialDaysDefault') as string),
      maintenanceMode: formData.get('maintenanceMode') === 'on',
      signupEnabled: formData.get('signupEnabled') === 'on'
    };

    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });

      if (res.ok) {
        toast.success('Configuración actualizada');
        loadSettings();
      } else {
        toast.error('Error al actualizar configuración');
      }
    } catch (error) {
      toast.error('Error al actualizar configuración');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Configuración de Plataforma</h1>
        <p className="text-gray-500 mt-1">Ajustes globales de Volkern</p>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Límites por Defecto</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="defaultUserLimit">Límite de Usuarios</Label>
              <Input
                id="defaultUserLimit"
                name="defaultUserLimit"
                type="number"
                defaultValue={settings?.defaultUserLimit || 5}
              />
            </div>
            <div>
              <Label htmlFor="defaultLeadLimit">Límite de Leads</Label>
              <Input
                id="defaultLeadLimit"
                name="defaultLeadLimit"
                type="number"
                defaultValue={settings?.defaultLeadLimit || 1000}
              />
            </div>
            <div>
              <Label htmlFor="defaultStorageLimit">Límite de Storage (GB)</Label>
              <Input
                id="defaultStorageLimit"
                name="defaultStorageLimit"
                type="number"
                defaultValue={settings?.defaultStorageLimit || 10}
              />
            </div>
            <div>
              <Label htmlFor="trialDaysDefault">Días de Trial por Defecto</Label>
              <Input
                id="trialDaysDefault"
                name="trialDaysDefault"
                type="number"
                defaultValue={settings?.trialDaysDefault || 14}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Estado de Plataforma</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="maintenanceMode">Modo Mantenimiento</Label>
                <p className="text-sm text-gray-500">Bloquea el acceso a todos los tenants</p>
              </div>
              <Switch
                id="maintenanceMode"
                name="maintenanceMode"
                defaultChecked={settings?.maintenanceMode || false}
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="signupEnabled">Registro Habilitado</Label>
                <p className="text-sm text-gray-500">Permite nuevos registros de tenants</p>
              </div>
              <Switch
                id="signupEnabled"
                name="signupEnabled"
                defaultChecked={settings?.signupEnabled ?? true}
              />
            </div>
          </CardContent>
        </Card>

        <Button type="submit" disabled={saving}>
          <Save size={16} className="mr-2" />
          {saving ? 'Guardando...' : 'Guardar Cambios'}
        </Button>
      </form>

      {/* Sección Chatwoot - Hub de Mensajería */}
      <Card className="border-2 border-primary/20">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <MessageSquare className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle>Hub de Mensajería (Chatwoot)</CardTitle>
                <CardDescription>
                  Panel de administración centralizado para todos los canales de comunicación
                </CardDescription>
              </div>
            </div>
            <Badge variant={process.env.NEXT_PUBLIC_CHATWOOT_URL ? "default" : "secondary"} className="gap-1">
              {process.env.NEXT_PUBLIC_CHATWOOT_URL ? (
                <><CheckCircle className="h-3 w-3" /> Configurado</>
              ) : (
                <><XCircle className="h-3 w-3" /> No configurado</>
              )}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-4 bg-muted rounded-lg">
            <p className="text-sm text-muted-foreground mb-3">
              Chatwoot es el hub interno que gestiona las comunicaciones de todos los tenants. 
              Desde aquí puedes administrar cuentas, inboxes, conversaciones y configuraciones globales.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button 
                variant="default"
                onClick={() => {
                  const chatwootUrl = process.env.NEXT_PUBLIC_CHATWOOT_URL || 'https://volkern.dimension.expert';
                  window.open(chatwootUrl, '_blank');
                }}
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                Abrir Panel de Chatwoot
              </Button>
              <Button 
                variant="outline"
                onClick={() => {
                  const chatwootUrl = process.env.NEXT_PUBLIC_CHATWOOT_URL || 'https://volkern.dimension.expert';
                  window.open(`${chatwootUrl}/super_admin`, '_blank');
                }}
              >
                <Settings className="h-4 w-4 mr-2" />
                Super Admin
              </Button>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div className="p-3 border rounded-lg">
              <p className="font-medium">URL Base</p>
              <code className="text-xs text-muted-foreground">
                {process.env.NEXT_PUBLIC_CHATWOOT_URL || 'https://volkern.dimension.expert'}
              </code>
            </div>
            <div className="p-3 border rounded-lg">
              <p className="font-medium">Webhook Endpoint</p>
              <code className="text-xs text-muted-foreground">
                /api/webhooks/nexus-sync
              </code>
            </div>
            <div className="p-3 border rounded-lg">
              <p className="font-medium">Canales Soportados</p>
              <p className="text-xs text-muted-foreground">
                Telegram, WhatsApp Business
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
