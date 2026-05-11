'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';

const STORAGE_KEY = 'push_prompt_dismissed';

export function usePushNotifications() {
  const { data: session } = useSession();
  const [isSupported, setIsSupported] = useState(false);
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [permissionState, setPermissionState] = useState<string>('default');

  useEffect(() => {
    if (typeof window === 'undefined') {
      setLoading(false);
      return;
    }

    const supported = 'Notification' in window && 'serviceWorker' in navigator;
    setIsSupported(supported);

    if (supported) {
      setPermissionState(Notification.permission);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    if (!session?.user?.id || typeof window === 'undefined') return;

    fetch('/api/users/me/push-subscription', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: session.user.id,
        permission: Notification.permission,
      }),
    }).catch(console.error);
  }, [session?.user?.id, permissionState]);

  const subscribe = async (): Promise<boolean> => {
    if (typeof window === 'undefined') return false;

    if (!('Notification' in window) || !('serviceWorker' in navigator)) {
      console.warn('[Push] Navegador no soporta notificaciones push');
      return false;
    }

    try {
      const perm = await Notification.requestPermission();
      setPermissionState(perm);

      if (perm !== 'granted') {
        console.warn('[Push] Permiso denegado:', perm);
        return false;
      }

      const registration = await navigator.serviceWorker.register('/sw.js');
      console.log('[Push] Service Worker registrado');

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(
          process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || ''
        ),
      });

      setSubscription(subscription);

      await fetch('/api/users/me/push-subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: session?.user?.id,
          permission: 'granted',
          subscription: JSON.stringify(subscription),
        }),
      });

      console.log('[Push] Suscripción exitosa');
      return true;
    } catch (error) {
      console.error('[Push] Error al suscribir:', error);
      return false;
    }
  };

  const unsubscribe = async (): Promise<boolean> => {
    try {
      if (subscription) {
        await subscription.unsubscribe();
        setSubscription(null);
        setPermissionState('default');
      }
      return true;
    } catch (error) {
      console.error('[Push] Error al desuscribir:', error);
      return false;
    }
  };

  return {
    isSupported,
    subscription,
    permissionState,
    loading,
    subscribe,
    unsubscribe,
  };
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}