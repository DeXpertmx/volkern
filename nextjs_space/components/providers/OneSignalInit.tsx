'use client';

import { useEffect, useRef } from 'react';
import { useSession } from 'next-auth/react';

export function OneSignalInit() {
  const { data: session } = useSession();
  const initRef = useRef(false);
  const loginRef = useRef<string | null>(null);

  // Inicialización del SDK (solo una vez)
  useEffect(() => {
    if (initRef.current) return;
    const appId = process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID;
    if (!appId) return;

    initRef.current = true;

    const onSignalDeferred = ((window as any).OneSignalDeferred = (window as any).OneSignalDeferred || []);
    
    onSignalDeferred.push(async function(OneSignal: any) {
      try {
        await OneSignal.init({
          appId,
          safari_web_id: process.env.NEXT_PUBLIC_ONESIGNAL_SAFARI_WEB_ID,
          notifyButton: {
            enable: true,
            prenotify: true,
            showCredit: false,
            text: {
              'tip.state.unsubscribed': 'Suscríbete a las notificaciones',
              'tip.state.subscribed': "Estás suscrito a las notificaciones",
              'tip.state.blocked': "Has bloqueado las notificaciones",
              'message.prenotify': 'Haz clic para suscribirte a las notificaciones',
              'message.action.subscribed': "¡Gracias por suscribirte!",
              'message.action.resubscribed': "Estás suscrito a las notificaciones",
              'message.action.unsubscribed': "No recibirás más notificaciones",
              'dialog.main.title': 'Gestionar Notificaciones',
              'dialog.main.button.subscribe': 'SUSCRIBIRSE',
              'dialog.main.button.unsubscribe': 'UNSUBSCRIBE',
              'dialog.blocked.title': 'Desbloquear Notificaciones',
              'dialog.blocked.message': "Sigue estas instrucciones para permitir las notificaciones:"
            }
          } as any,
          allowLocalhostAsSecureOrigin: true,
        });
        console.log('[OneSignal] SDK inicializado correctamente');
      } catch (err: any) {
        // Si ya estaba inicializado, ignorar
        if (err?.message?.includes('already initialized')) {
          console.log('[OneSignal] SDK ya inicializado, ignorando');
        } else {
          console.error('[OneSignal] Error al inicializar:', err);
        }
      }
    });
  }, []);

  // Login del usuario (cuando cambie la sesión)
  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId || loginRef.current === userId) return;

    const onSignalDeferred = (window as any).OneSignalDeferred || [];
    onSignalDeferred.push(async function(OneSignal: any) {
      try {
        if (OneSignal?.login) {
          await OneSignal.login(userId);
          loginRef.current = userId;
          console.log('[OneSignal] Usuario logueado:', userId);
        }
      } catch (err) {
        console.error('[OneSignal] Login error:', err);
      }
    });
  }, [session?.user?.id]);

  return null;
}

