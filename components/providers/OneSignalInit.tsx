'use client';

import { useEffect } from 'react';
import { useSession } from 'next-auth/react';

export function OneSignalInit() {
  const { data: session } = useSession();

  useEffect(() => {
    // Definimos el objeto Deferred si no existe (por seguridad)
    const onSignalDeferred = ((window as any).OneSignalDeferred = (window as any).OneSignalDeferred || []);
    
    // Inicialización básica
    onSignalDeferred.push(async function(OneSignal: any) {
      await OneSignal.init({
        appId: process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID || '',
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

      // Login de usuario para ID Externo
      if (session?.user?.id) {
        await OneSignal.login(session.user.id);
        console.log('OneSignal: Usuario logueado', session.user.id);
      }
    });
  }, [session]);

  return null;
}

