'use client';

import { useEffect, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, Send, MessageSquare } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const PUSH_NOTIFICATION_KEY = 'push_notifications_enabled';

interface ChannelConfig {
  enabled: boolean;
  botToken?: string;
  defaultChannel?: string;
}

interface NotificationConfigData {
  channels: Record<string, ChannelConfig>;
}

export function PushNotificationInit() {
  const { data: session } = useSession();
  const initRef = useRef(false);
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [config, setConfig] = useState<NotificationConfigData>({ channels: {} });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const isPublicPage = !session?.user;

  useEffect(() => {
    if (typeof window === 'undefined' || isPublicPage) return;

    try {
      setPermission(Notification.permission);

      const savedPref = localStorage.getItem(PUSH_NOTIFICATION_KEY);
      if (savedPref === 'false') {
        return;
      }
    } catch (e) {
      // iOS Safari puede lanzar error con Notification API
    }
  }, [session?.user?.id]);

  const requestPermission = async () => {
    if (typeof window === 'undefined') return;
    if (!('Notification' in window)) return;

    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);

      if (perm === 'granted') {
        localStorage.setItem(PUSH_NOTIFICATION_KEY, 'true');
        console.log('[Push] Notificaciones habilitadas');
        
        await registerServiceWorker();
        await savePushSubscription();
        setShowConfigModal(true);
      } else if (perm === 'denied') {
        localStorage.setItem(PUSH_NOTIFICATION_KEY, 'false');
        console.log('[Push] Permiso denegado');
        toast.error('Las notificaciones están bloqueadas. Por favor habilítalas en tu navegador.');
      }
    } catch (error) {
      console.error('[Push] Error solicitando permisos:', error);
    }
  };

  const savePushSubscription = async () => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    try {
      const registration = await navigator.serviceWorker.register('/sw.js');
      console.log('[Push] Service Worker registrado:', registration.scope);
      
      const userId = session?.user?.id;
      if (userId) {
        await fetch('/api/users/me/push-subscription', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId, permission: Notification.permission }),
        });
      }
    } catch (error) {
      console.error('[Push] Error guardando suscripción:', error);
    }
  };

  const registerServiceWorker = async () => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    try {
      // Evitar registrar en iOS Safari si está en modo privado
      const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
      const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
      if (isSafari || isIOS) {
        console.log('[Push] ServiceWorker skip en Safari/iOS');
        return;
      }
      const registration = await navigator.serviceWorker.register('/sw.js');
      console.log('[Push] Service Worker registrado:', registration.scope);
    } catch (error) {
      console.error('[Push] Error registrando Service Worker:', error);
    }
  };

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
      for (const [channelId, channelConfig] of Object.entries(config.channels)) {
        const res = await fetch('/api/notifications/config', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ channel: channelId, config: channelConfig })
        });
        if (!res.ok) {
          throw new Error(`Error saving ${channelId}`);
        }
      }
      toast.success('Configuración guardada correctamente');
      setShowConfigModal(false);
    } catch (error) {
      toast.error('Error al guardar configuración');
    } finally {
      setSaving(false);
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

  useEffect(() => {
    if (showConfigModal && Object.keys(config.channels).length === 0) {
      fetchConfig();
    }
  }, [showConfigModal]);

  if (isPublicPage) return null;

  if (permission === 'denied') {
    return (
      <div className="fixed bottom-4 right-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded shadow-lg z-50 max-w-sm">
        <p className="font-bold">Notificaciones bloqueadas</p>
        <p className="text-sm">Por favor habilita las notificaciones en la configuración de tu navegador.</p>
      </div>
    );
  }

  if (permission === 'default') {
    return (
      <>
        <button
          onClick={requestPermission}
          className="fixed bottom-4 right-4 bg-primary text-white px-4 py-3 rounded-lg shadow-lg z-50 hover:bg-primary/90 transition-colors flex items-center gap-2"
        >
          🔔 Activar notificaciones
        </button>

        <Dialog open={showConfigModal} onOpenChange={setShowConfigModal}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Configurar Canales de Notificación</DialogTitle>
              <DialogDescription>
                Configura Telegram y Slack para recibir notificaciones en tus canales preferido.
              </DialogDescription>
            </DialogHeader>
            
            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin" />
              </div>
            ) : (
              <div className="space-y-6 py-4">
                <div className="space-y-4">
                  <div className="border rounded-lg p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <Send className="h-5 w-5" />
                      <span className="font-medium">Telegram</span>
                    </div>
                    <div>
                      <Label htmlFor="telegram-botToken">Bot Token</Label>
                      <Input
                        id="telegram-botToken"
                        type="password"
                        placeholder="123456789:ABCdefGHIjklMNOpqrsTUVwxyz"
                        value={config.channels['telegram']?.botToken || ''}
                        onChange={(e) => updateChannel('telegram', 'botToken', e.target.value)}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="telegram-enabled"
                        checked={config.channels['telegram']?.enabled || false}
                        onChange={(e) => updateChannel('telegram', 'enabled', e.target.checked)}
                        className="rounded"
                      />
                      <Label htmlFor="telegram-enabled">Activar Telegram</Label>
                    </div>
                  </div>

                  <div className="border rounded-lg p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <MessageSquare className="h-5 w-5" />
                      <span className="font-medium">Slack</span>
                    </div>
                    <div>
                      <Label htmlFor="slack-botToken">Bot Token</Label>
                      <Input
                        id="slack-botToken"
                        type="password"
                        placeholder="xoxb-..."
                        value={config.channels['slack']?.botToken || ''}
                        onChange={(e) => updateChannel('slack', 'botToken', e.target.value)}
                      />
                    </div>
                    <div>
                      <Label htmlFor="slack-defaultChannel">Canal por defecto</Label>
                      <Input
                        id="slack-defaultChannel"
                        placeholder="#general"
                        value={config.channels['slack']?.defaultChannel || ''}
                        onChange={(e) => updateChannel('slack', 'defaultChannel', e.target.value)}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="slack-enabled"
                        checked={config.channels['slack']?.enabled || false}
                        onChange={(e) => updateChannel('slack', 'enabled', e.target.checked)}
                        className="rounded"
                      />
                      <Label htmlFor="slack-enabled">Activar Slack</Label>
                    </div>
                  </div>
                </div>

                <Button onClick={saveConfig} disabled={saving} className="w-full">
                  {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Guardar configuración
                </Button>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </>
    );
  }

  return null;
}