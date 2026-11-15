'use client';

import { useEffect } from 'react';
import type { EventoPortal } from '@/lib/real-estate/portal-eventos';

/**
 * Envía un evento al portal. No espera respuesta ni lanza errores: si la
 * analítica falla, la página sigue funcionando igual.
 */
export function enviarEventoPortal(datos: {
  slug: string;
  tipo: EventoPortal;
  propiedadId?: string;
}): void {
  if (typeof window === 'undefined') return;
  const cuerpo = JSON.stringify(datos);

  try {
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      const enviado = navigator.sendBeacon(
        '/api/public/portal/evento',
        new Blob([cuerpo], { type: 'application/json' })
      );
      if (enviado) return;
    }
  } catch {
    // Se intenta con fetch.
  }

  try {
    void fetch('/api/public/portal/evento', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: cuerpo,
      keepalive: true,
    });
  } catch {
    // Un evento perdido no es un problema para el visitante.
  }
}

/**
 * Registra la visita una sola vez por pestaña y página.
 *
 * El portal se sirve cacheado y React monta los efectos dos veces en
 * desarrollo: sin esta marca, una sola visita contaría dos eventos.
 */
export default function PortalAnalyticsBeacon({
  slug,
  tipo,
  propiedadId,
}: {
  slug: string;
  tipo: EventoPortal;
  propiedadId?: string;
}) {
  useEffect(() => {
    const clave = `portal-evento:${tipo}:${propiedadId ?? ''}`;
    try {
      if (sessionStorage.getItem(clave)) return;
      sessionStorage.setItem(clave, '1');
    } catch {
      // Sin sessionStorage (modo privado) se cuenta igual: es una visita real.
    }
    enviarEventoPortal({ slug, tipo, propiedadId });
  }, [slug, tipo, propiedadId]);

  return null;
}
