'use client';

import { useEffect, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { toast } from 'sonner';

const PUSH_NOTIFICATION_KEY = 'push_notifications_enabled';

export function PushNotificationInit() {
  const { data: session } = useSession();
  const initRef = useRef(false);
  const [permission, setPermission] = useState<NotificationPermission>('default');

  useEffect(() => {
    if (typeof window === 'undefined') return;

    setPermission(Notification.permission);

    const savedPref = localStorage.getItem(PUSH_NOTIFICATION_KEY);
    if (savedPref === 'false') {
      return;
    }

    if (Notification.permission === 'default' && session?.user?.id) {
      requestPermission();
    }
  }, [session?.user?.id]);

  const requestPermission = async () => {
    if (typeof window === 'undefined') return;

    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);

      if (perm === 'granted') {
        localStorage.setItem(PUSH_NOTIFICATION_KEY, 'true');
        console.log('[Push] Notificaciones habilitadas');
        
        await registerServiceWorker();
      } else if (perm === 'denied') {
        localStorage.setItem(PUSH_NOTIFICATION_KEY, 'false');
        console.log('[Push] Permiso denegado');
      }
    } catch (error) {
      console.error('[Push] Error solicitando permisos:', error);
    }
  };

  const registerServiceWorker = async () => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    try {
      const registration = await navigator.serviceWorker.register('/sw.js');
      console.log('[Push] Service Worker registrado:', registration.scope);
    } catch (error) {
      console.error('[Push] Error registrando Service Worker:', error);
    }
  };

  useEffect(() => {
    if (!session?.user?.id || initRef.current) return;
    initRef.current = true;

    const userId = session.user.id;
    fetch('/api/users/me/push-subscription', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, permission: Notification.permission }),
    }).catch(console.error);
  }, [session?.user?.id, permission]);

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
      <button
        onClick={requestPermission}
        className="fixed bottom-4 right-4 bg-primary text-white px-4 py-2 rounded-lg shadow-lg z-50 hover:bg-primary/90 transition-colors"
      >
        🔔 Activar notificaciones
      </button>
    );
  }

  return null;
}