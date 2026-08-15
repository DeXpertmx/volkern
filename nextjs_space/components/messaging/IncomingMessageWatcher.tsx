'use client';

import { useEffect, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { notifyIncomingMessage } from '@/hooks/use-incoming-messages';

const POLL_INTERVAL_MS = 12000;

/**
 * Vigila en segundo plano (estés donde estés en el CRM) la bandeja de
 * mensajes: si llega una conversación nueva o suben los no leídos,
 * suena el timbre y, si hay permiso, aparece la notificación del navegador.
 */
export function IncomingMessageWatcher() {
  const { data: session } = useSession();
  // id de conversación -> último noLeídos observado
  const knownRef = useRef<Map<string, number>>(new Map());
  const initializedRef = useRef(false);

  useEffect(() => {
    if (!session?.user?.id || typeof window === 'undefined') return;

    let alive = true;

    const check = async () => {
      try {
        const res = await fetch('/api/mensajes/conversaciones?limit=10');
        if (!res.ok) return;
        const data = await res.json();
        const conversaciones: any[] = data.conversaciones || [];

        for (const conv of conversaciones) {
          const id: string = conv.id;
          const noLeidos: number = conv.noLeidos || 0;
          const prev = knownRef.current.get(id);

          // Primera pasada: poblar el estado sin notificar (evita el ruido de
          // conversaciones antiguas sin leer al abrir la app).
          if (!initializedRef.current) {
            knownRef.current.set(id, noLeidos);
            continue;
          }

          if (prev === undefined) {
            // Conversación nueva llegó mientras la app estaba abierta
            knownRef.current.set(id, noLeidos);
            if (noLeidos > 0) {
              notifyIncomingMessage(
                '💬 Nuevo mensaje',
                `${conv.contactoNombre || 'Contacto'}: ${conv.ultimoMensaje || ''}`,
                `/dashboard/mensajes?id=${id}`
              );
            }
          } else if (noLeidos > prev) {
            // Subieron los no leídos de una conversación conocida
            knownRef.current.set(id, noLeidos);
            notifyIncomingMessage(
              '💬 Nuevo mensaje',
              `${conv.contactoNombre || 'Contacto'}: ${conv.ultimoMensaje || ''}`,
              `/dashboard/mensajes?id=${id}`
            );
          } else {
            knownRef.current.set(id, noLeidos);
          }
        }

        initializedRef.current = true;
      } catch {
        // Poll silencioso: la red puede fallar puntualmente
      }
    };

    check();
    const interval = setInterval(check, POLL_INTERVAL_MS);
    return () => {
      alive = false;
      clearInterval(interval);
    };
  }, [session?.user?.id]);

  return null;
}
