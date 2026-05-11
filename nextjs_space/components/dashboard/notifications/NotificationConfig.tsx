'use client';

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Loader2, Mail, MessageSquare, Phone, Send, CheckCircle, XCircle } from "lucide-react";

interface ChannelConfig {
  enabled: boolean;
  apiKey?: string;
  webhookUrl?: string;
  config?: Record<string, string>;
}

interface NotificationConfigData {
  channels: Record<string, ChannelConfig>;
}

const CHANNELS = [
  { id: 'email', name: 'Email', icon: Mail, description: 'Notificaciones por correo electrónico' },
  { id: 'sms', name: 'SMS', icon: MessageSquare, description: 'Mensajes de texto' },
  { id: 'whatsapp', name: 'WhatsApp', icon: MessageSquare, description: 'Mensajes vía WhatsApp Business' },
  { id: 'telegram', name: 'Telegram', icon: Send, description: 'Notificaciones via Telegram Bot' },
  { id: 'slack', name: 'Slack', icon: MessageSquare, description: 'Canales de Slack' },
  { id: 'discord', name: 'Discord', icon: MessageSquare, description: 'Webhooks de Discord' },
];

export function NotificationConfig() {
  const [config, setConfig] = useState<NotificationConfigData>({ channels: {} });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    try {
      const res = await fetch('/api/notifications/config');
      if (res.ok) {
        const data = await res.json();
        setConfig(data);
      }
    } catch (error) {
      console.error('Error fetching config:', error);
    } finally {
      setLoading(false);
    }
  };

  const saveConfig = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/notifications/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });
      if (res.ok) {
        toast.success('Configuración guardada');
      } else {
        toast.error('Error al guardar');
      }
    } catch (error) {
      toast.error('Error al guardar configuración');
    } finally {
      setSaving(false);
    }
  };

  const testChannel = async (channelId: string) => {
    setTesting(channelId);
    try {
      const res = await fetch('/api/notifications/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Test de Configuración',
          body: 'Esta es una prueba de conexión desde Volkern',
          channel: channelId,
          test: true
        })
      });
      if (res.ok) {
        toast.success(`${CHANNELS.find(c => c.id === channelId)?.name} configurado correctamente`);
      } else {
        toast.error('Error en la conexión');
      }
    } catch (error) {
      toast.error('Error al probar canal');
    } finally {
      setTesting(null);
    }
  };

  const updateChannel = (channelId: string, field: string, value: any) => {
    setConfig(prev => ({
      ...prev,
      channels: {
        ...prev.channels,
        [channelId]: {
          ...prev.channels[channelId],
          [field]: value
        }
      }
    }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Notificaciones</h2>
          <p className="text-muted-foreground">Configura los canales de notificación para tu tenant</p>
        </div>
        <Button onClick={saveConfig} disabled={saving}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Guardar cambios
        </Button>
      </div>

      <Tabs defaultValue="channels" className="space-y-4">
        <TabsList>
          <TabsTrigger value="channels">Canales</TabsTrigger>
          <TabsTrigger value="settings">Ajustes Globales</TabsTrigger>
        </TabsList>

        <TabsContent value="channels" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {CHANNELS.map(channel => {
              const channelConfig = config.channels[channel.id] || { enabled: false };
              const Icon = channel.icon;
              
              return (
                <Card key={channel.id} className={channelConfig.enabled ? 'border-primary' : ''}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Icon className="h-5 w-5" />
                        <CardTitle className="text-lg">{channel.name}</CardTitle>
                      </div>
                      <Switch
                        checked={channelConfig.enabled}
                        onCheckedChange={(checked) => updateChannel(channel.id, 'enabled', checked)}
                      />
                    </div>
                    <CardDescription>{channel.description}</CardDescription>
                  </CardHeader>
                  {channelConfig.enabled && (
                    <CardContent className="space-y-3">
                      <div>
                        <Label htmlFor={`${channel.id}-apikey`}>API Key / Token</Label>
                        <Input
                          id={`${channel.id}-apikey`}
                          type="password"
                          value={channelConfig.apiKey || ''}
                          onChange={(e) => updateChannel(channel.id, 'apiKey', e.target.value)}
                          placeholder="Ingresa tu API Key"
                        />
                      </div>
                      <div>
                        <Label htmlFor={`${channel.id}-webhook`}>Webhook URL</Label>
                        <Input
                          id={`${channel.id}-webhook`}
                          value={channelConfig.webhookUrl || ''}
                          onChange={(e) => updateChannel(channel.id, 'webhookUrl', e.target.value)}
                          placeholder="https://..."
                        />
                      </div>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="w-full"
                        onClick={() => testChannel(channel.id)}
                        disabled={testing === channel.id}
                      >
                        {testing === channel.id ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <CheckCircle className="mr-2 h-4 w-4" />
                        )}
                        Probar conexión
                      </Button>
                    </CardContent>
                  )}
                </Card>
              );
            })}
          </div>
        </TabsContent>

        <TabsContent value="settings">
          <Card>
            <CardHeader>
              <CardTitle>Ajustes de Notificaciones</CardTitle>
              <CardDescription>Configuración global para todas las notificaciones</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Notificaciones Push</Label>
                  <p className="text-sm text-muted-foreground">Recibir notificaciones en tiempo real</p>
                </div>
                <Switch defaultChecked />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label>Notificaciones por Email</Label>
                  <p className="text-sm text-muted-foreground">Recibir resumen diario por email</p>
                </div>
                <Switch defaultChecked />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label>Registro de Notificaciones</Label>
                  <p className="text-sm text-muted-foreground">Mantener historial de notificaciones enviadas</p>
                </div>
                <Switch defaultChecked />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}