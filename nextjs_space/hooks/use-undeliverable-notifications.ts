'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Avisa al agente en tiempo real cuando el puente de WhatsApp marca una
 * conversación como NO entregable (Evolution responde 400 por número
 * inexistente): sonido (Web Audio, sin archivo) + notificación del sistema
 * (si el permiso está concedido) + el contador de pendientes para badges.
 *
 * El set de "ya notificados" se persiste en localStorage (por usuario) para:
 *  - no notificar dos veces la misma entrega (ni en recargas ni en el polling),
 *  - notificar entregas que aparecieron mientras la app estaba cerrada
 *    (al volver, cualquier pendiente no visto dispara el aviso),
 *  - no disparar una ráfaga el primer día de adopción (se siembra el set).
 */

let audioCtx: AudioContext | null = null;

/** Alarma breve de tres notas ascendentes, distinta del timbre de mensajes. */
function playUndeliverableChime() {
  try {
    if (typeof window === 'undefined') return;
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    audioCtx = audioCtx || new Ctx();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const now = audioCtx.currentTime;
    const notes = [659.25, 880, 1318.51]; // Mi5 → La5 → Mi6 (ascendente, alerta)
    notes.forEach((freq, i) => {
      const osc = audioCtx!.createOscillator();
      const gain = audioCtx!.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const start = now + i * 0.16;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.26, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.45);
      osc.connect(gain);
      gain.connect(audioCtx!.destination);
      osc.start(start);
      osc.stop(start + 0.5);
    });
    // Vibración en móvil (patrón de alerta: on-off-on)
    if (navigator.vibrate) navigator.vibrate([80, 50, 80]);
  } catch {
    // El navegador puede bloquear el audio hasta la primera interacción; no romper nada.
  }
}

interface UndeliverableItem {
  id: string;
  contactoNombre: string | null;
  telefono: string | null;
  empresa: string | null;
  emailContacto: string | null;
  mensajeFallido: string | null;
  notaAgente: string | null;
  hubUrl: string | null;
  fechaCreacion: string;
}

/**
 * Notificación del sistema con acciones: "Marcar como resuelto" resuelve la
 * entrega directamente (sin abrir la app) vía el Service Worker; "Ver" o el
 * clic abren la conversación en el hub.
 */
async function notifyUndeliverable(f: UndeliverableItem) {
  playUndeliverableChime();
  try {
    if (typeof window === 'undefined' || !('Notification' in window) || Notification.permission !== 'granted') return;

    const tag = `undeliverable-${f.id}`;
    const url = f.hubUrl || '/dashboard/configuracion/whatsapp-negocio';
    const title = `⚠️ Entrega no entregable: ${f.contactoNombre || 'Contacto desconocido'}`;
    const body = [f.telefono, f.empresa].filter(Boolean).join(' — ') || 'Número inexistente o no disponible';

    // Notificación del Service Worker: única forma de mostrar botones de acción
    // ("Marcar como resuelto") y de que el clic se gestione con la app cerrada.
    let shown = false;
    if ('serviceWorker' in navigator) {
      try {
        let reg = await navigator.serviceWorker.getRegistration().catch(() => null);
        if (!reg) reg = await navigator.serviceWorker.register('/sw.js').catch(() => null);
        if (reg) {
          await reg.showNotification(title, {
            body,
            icon: '/volkern-icon.png',
            badge: '/volkern-icon.png',
            tag,
            renotify: true,
            vibrate: [100, 50, 100],
            actions: [
              { action: 'resolve', title: '✓ Marcar como resuelto' },
              { action: 'email', title: '📧 Enviar email' },
            ],
            data: { url, id: f.id, email: f.emailContacto },
          });
          shown = true;
        }
      } catch {
        shown = false;
      }
    }

    if (!shown) {
      // Fallback sin SW (Safari/iOS): notificación de página con clic que abre el hilo.
      const n = new Notification(title, { body, icon: '/volkern-icon.png', tag });
      n.onclick = () => {
        window.focus();
        window.open(url, '_blank');
        n.close();
      };
      setTimeout(() => n.close(), 15000);
    }
  } catch {
    // Safari/iOS puede lanzar excepción al construir Notification; ignorar.
  }
}

/**
 * Hook global: devuelve el número de entregas no entregables pendientes y
 * dispara sonido + notificación cuando aparece una nueva.
 * @param userId  id del usuario (clave de localStorage); null desactiva el polling.
 */
export function useUndeliverableNotifications(userId?: string | null): {
  pendingCount: number;
  recentFailures: UndeliverableItem[];
} {
  const [pendingCount, setPendingCount] = useState(0);
  const [recentFailures, setRecentFailures] = useState<UndeliverableItem[]>([]);
  const seededRef = useRef(false);
  const refreshRef = useRef<(() => void) | null>(null);

  // Mensajes del Service Worker: refresco tras resolver, y apertura de mailto (acción "Enviar email").
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    const onMessage = (e: MessageEvent) => {
      if (e.data?.type === 'UNDELIVERABLE_RESOLVED') {
        refreshRef.current?.();
      } else if (e.data?.type === 'OPEN_MAILTO' && typeof e.data.url === 'string') {
        try {
          const a = document.createElement('a');
          a.href = e.data.url;
          a.rel = 'noopener';
          document.body.appendChild(a);
          a.click();
          a.remove();
        } catch {
          // Sin acceso a mailto (entorno raro); ignorar.
        }
      }
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, []);

  // Pedir permiso de notificaciones con el primer gesto del usuario (requisito de los navegadores)
  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (Notification.permission === 'granted' || Notification.permission === 'denied') return;
    const request = () => {
      Notification.requestPermission().catch(() => {});
    };
    window.addEventListener('pointerdown', request, { once: true });
    window.addEventListener('keydown', request, { once: true });
    return () => {
      window.removeEventListener('pointerdown', request);
      window.removeEventListener('keydown', request);
    };
  }, []);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    // Si cambia el usuario (logout/login), su set de "ya vistos" es distinto: re-sembrar.
    seededRef.current = false;
    const storageKey = `volkern-undeliverable-notified:${userId}`;

    const getSeen = (): string[] => {
      try {
        return JSON.parse(localStorage.getItem(storageKey) || '[]');
      } catch {
        return [];
      }
    };
    const saveSeen = (ids: string[]) => {
      try {
        localStorage.setItem(storageKey, JSON.stringify(ids.slice(-200)));
      } catch {
        // localStorage lleno o bloqueado; seguir sin persistir.
      }
    };

    const handleNew = (failures: UndeliverableItem[]) => {
      if (!seededRef.current) {
        // Primera adopción: registrar los pendientes existentes sin notificar (evita ráfaga inicial)
        seededRef.current = true;
        saveSeen(Array.from(new Set([...getSeen(), ...failures.map((f) => f.id)])));
        return;
      }
      const seen = getSeen();
      const seenSet = new Set(seen);
      const fresh = failures.filter((f) => !seenSet.has(f.id));
      if (fresh.length === 0) return;
      saveSeen(Array.from(new Set([...seen, ...fresh.map((f) => f.id)])));
      fresh.forEach((f) => notifyUndeliverable(f));
    };

    const poll = async () => {
      try {
        const [countRes, listRes] = await Promise.all([
          fetch('/api/integraciones/my-whatsapp/no-entregables?estado=pendiente&count=true'),
          fetch('/api/integraciones/my-whatsapp/no-entregables?estado=pendiente&limit=20'),
        ]);
        if (active && countRes.ok) {
          const d = await countRes.json();
          if (typeof d.count === 'number') setPendingCount(d.count);
        }
        if (active && listRes.ok) {
          const d = await listRes.json();
          const failures = d.failures || [];
          setRecentFailures(failures);
          handleNew(failures);
        }
      } catch {
        // Silencioso: reintentará en el siguiente tick del polling.
      }
    };

    refreshRef.current = poll;
    poll();
    const interval = setInterval(poll, 60000);
    return () => {
      active = false;
      clearInterval(interval);
      refreshRef.current = null;
    };
  }, [userId]);

  return { pendingCount, recentFailures };
}
