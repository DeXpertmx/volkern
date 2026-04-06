'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';

export function usePushNotifications() {
  const { data: session } = useSession();
  const [isSupported, setIsSupported] = useState(true);
  const [subscription, setSubscription] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [permissionState, setPermissionState] = useState<string>('default');

  const appId = process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID || '';

  useEffect(() => {
    // Solo inicializar si estamos en el cliente y tenemos el App ID
    if (typeof window !== 'undefined' && appId) {
      if (!(window as any).OneSignalDeferred) {
        (window as any).OneSignalDeferred = [];
      }
      
      const onSignalDeferred = (window as any).OneSignalDeferred;
      
      onSignalDeferred.push(async function(OneSignal: any) {
        try {
          // OneSignal init might have already been called in OneSignalInit component
          // Wait for initialization to complete or check state
          if (!OneSignal.initialized) {
            // It might already be configured by OneSignalInit
          }

          setLoading(false);

          // Listen to changes (v16 API)
          OneSignal.User.PushSubscription.addEventListener("change", (event: any) => {
            if (event.current.optedIn) {
               setSubscription({ id: event.current.id || OneSignal.User.PushSubscription.id });
               setPermissionState('granted');
            } else {
               setSubscription(null);
               setPermissionState('default'); // or denied
            }
          });

          // Verificar estado inicial
          const isPushEnabled = OneSignal.User.PushSubscription?.optedIn;
          if (isPushEnabled) {
             setSubscription({ id: OneSignal.User.PushSubscription?.id });
          }
          
          // Mapear permisos explícitos si estuvieran disponibles
          const permission = OneSignal.Notifications?.permission;
          if (permission !== undefined) {
             setPermissionState(permission ? 'granted' : 'default');
          } else if (isPushEnabled) {
             setPermissionState('granted');
          }
        } catch (error) {
          console.error('Error verificando OneSignal:', error);
          setIsSupported(false);
          setLoading(false);
        }
      });
    } else {
      setLoading(false);
    }
  }, [appId]);

  // Efecto separado para el login una vez inicializado
  useEffect(() => {
    if (session?.user?.id && typeof window !== 'undefined') {
      const onSignalDeferred = (window as any).OneSignalDeferred || [];
      onSignalDeferred.push(async function(OneSignal: any) {
        try {
          if (OneSignal && OneSignal.login && OneSignal.User && session.user.id) {
            await OneSignal.login(session.user.id);
            console.log('[OneSignal] Login exitoso:', session.user.id);
          }
        } catch (e) {
          console.error('[OneSignal] Login error:', e);
        }
      });
    }
  }, [session?.user?.id]);

  const subscribe = async () => {
    return new Promise<boolean>((resolve) => {
      setLoading(true);
      if (typeof window === 'undefined') {
        setLoading(false);
        resolve(false);
        return;
      }
      const onSignalDeferred = (window as any).OneSignalDeferred || [];
      
      // Añadir un timeout de seguridad de 8 segundos para evitar el estado "Activando..." infinito
      const timeoutId = setTimeout(() => {
        console.error('[Push] Timeout esperando respuesta de OneSignal');
        setLoading(false);
        resolve(false);
      }, 8000);

      onSignalDeferred.push(async function(OneSignal: any) {
        try {
          if (!OneSignal || !OneSignal.Notifications) {
            console.error('[Push] OneSignal no está inicializado correctamente o el dominio no está autorizado');
            clearTimeout(timeoutId);
            setLoading(false);
            resolve(false);
            return;
          }

          // Solicitar permiso nativo directamente
          console.log('[Push] Solicitando permiso nativo...');
          await OneSignal.Notifications.requestPermission();
          
          // OneSignal v16: Si hay permiso, aseguramos que esté "opted in"
          if (OneSignal.Notifications.permission && OneSignal.User?.PushSubscription) {
            console.log('[Push] Permiso concedido, activando suscripción...');
            await OneSignal.User.PushSubscription.optIn();
          }
          
          // Esperar un breve momento para que el estado se actualice internamente
          await new Promise(r => setTimeout(r, 1000));

          // Verificar si se suscribió correctamente
          const isPushEnabled = OneSignal.User?.PushSubscription?.optedIn;
          const subscriptionId = OneSignal.User?.PushSubscription?.id;
          
          clearTimeout(timeoutId);

          if (isPushEnabled && subscriptionId) {
            console.log('[Push] Suscripción exitosa:', subscriptionId);
            setSubscription({ id: subscriptionId });
            setPermissionState('granted');
            setLoading(false);
            resolve(true);
          } else {
            console.log('[Push] No se completó la suscripción (ignorado o cancelado)');
            setLoading(false);
            resolve(false);
          }
        } catch (error) {
          console.error('Error al suscribir en OneSignal:', error);
          clearTimeout(timeoutId);
          setLoading(false);
          resolve(false);
        }
      });
    });
  };

  const unsubscribe = async () => {
    return new Promise<boolean>((resolve) => {
      setLoading(true);
      if (typeof window === 'undefined') {
        setLoading(false);
        resolve(false);
        return;
      }
      const onSignalDeferred = (window as any).OneSignalDeferred || [];
      onSignalDeferred.push(async function(OneSignal: any) {
        try {
          // En OneSignal, "unsubscribe" suele ser desactivar el envío
          await OneSignal.User.PushSubscription.optOut();
          setSubscription(null);
          setLoading(false);
          resolve(true);
        } catch (error) {
          console.error('Error al desuscribir en OneSignal:', error);
          setLoading(false);
          resolve(false);
        }
      });
    });
  };

  return {
    isSupported,
    subscription,
    permissionState,
    loading,
    subscribe,
    unsubscribe
  };
}
