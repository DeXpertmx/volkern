'use client';

import { useEffect, useRef } from 'react';

/**
 * Avisa al agente en tiempo real cuando un contrato queda firmado (evento
 * `document_signed` del webhook de LibreSign): sonido (Web Audio, sin archivo)
 * + notificación del sistema (si el permiso está concedido).
 *
 * Detecta las notificaciones in-app de tipo `contract_signed` que crea el
 * SignatureService. El set de "ya notificadas" se persiste en localStorage
 * (por usuario) para no duplicar avisos en recargas ni en el polling, y para
 * notificar las firmas que llegaron mientras la app estaba cerrada.
 */

let audioCtx: AudioContext | null = null;

/** Timbre corto de dos notas descendentes, distinto de la alarma de no entregables. */
function playSignedChime() {
  try {
    if (typeof window === 'undefined') return;
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    audioCtx = audioCtx || new Ctx();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const now = audioCtx.currentTime;
    const notes = [880, 659.25]; // La5 → Mi5 (confirmación, descendente)
    notes.forEach((freq, i) => {
      const osc = audioCtx!.createOscillator();
      const gain = audioCtx!.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const start = now + i * 0.14;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.22, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.4);
      osc.connect(gain);
      gain.connect(audioCtx!.destination);
      osc.start(start);
      osc.stop(start + 0.5);
    });
    if (navigator.vibrate) navigator.vibrate([60, 40, 60]);
  } catch {
    // El navegador puede bloquear el audio hasta la primera interacción; no romper nada.
  }
}

interface ContractSignedNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  actionUrl: string | null;
  createdAt: string;
}

/**
 * Notificación del sistema; el clic abre el detalle del contrato.
 */
function notifyContractSigned(n: ContractSignedNotification) {
  playSignedChime();
  try {
    if (typeof window === 'undefined' || !('Notification' in window) || Notification.permission !== 'granted') return;

    const url = n.actionUrl || '/dashboard/contratos';
    const title = n.title || '✍️ Contrato firmado';

    const show = () => {
      const tag = `contract-signed-${n.id}`;
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistration()
          .then((reg) => reg || navigator.serviceWorker.register('/sw.js'))
          .then((reg) => reg.showNotification(title, {
            body: n.body,
            icon: '/volkern-icon.png',
            badge: '/volkern-icon.png',
            tag,
            renotify: true,
            vibrate: [80, 40, 80],
            data: { url },
          }))
          .catch(() => {
            const notif = new Notification(title, { body: n.body, icon: '/volkern-icon.png', tag });
            notif.onclick = () => {
              window.focus();
              window.open(url, '_blank');
              notif.close();
            };
            setTimeout(() => notif.close(), 15000);
          });
      } else {
        const notif = new Notification(title, { body: n.body, icon: '/volkern-icon.png', tag });
        notif.onclick = () => {
          window.focus();
          window.open(url, '_blank');
          notif.close();
        };
        setTimeout(() => notif.close(), 15000);
      }
    };

    show();
  } catch {
    // Safari/iOS puede lanzar excepción al construir Notification; ignorar.
  }
}

/**
 * Hook global: observa las notificaciones in-app de tipo `contract_signed`
 * y dispara sonido + notificación del sistema cuando aparece una nueva.
 * @param userId  id del usuario (clave de localStorage); null desactiva el polling.
 */
export function useContractSignatureNotifications(userId?: string | null) {
  const seededRef = useRef(false);

  useEffect(() => {
    if (!userId) return;
    let active = true;
    seededRef.current = false;
    const storageKey = `volkern-contract-signed-notified:${userId}`;

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

    const handleNew = (items: ContractSignedNotification[]) => {
      if (!seededRef.current) {
        // Primera adopción: registrar los existentes sin notificar (evita ráfaga inicial)
        seededRef.current = true;
        saveSeen(Array.from(new Set([...getSeen(), ...items.map((n) => n.id)])));
        return;
      }
      const seen = getSeen();
      const seenSet = new Set(seen);
      const fresh = items.filter((n) => !seenSet.has(n.id));
      if (fresh.length === 0) return;
      saveSeen(Array.from(new Set([...seen, ...fresh.map((n) => n.id)])));
      fresh.forEach((n) => notifyContractSigned(n));
    };

    const poll = async () => {
      try {
        const res = await fetch('/api/notifications?limit=50');
        if (!active || !res.ok) return;
        const all = await res.json();
        if (!Array.isArray(all)) return;
        const signed = (all as ContractSignedNotification[]).filter(
          (n) => n.type === 'contract_signed'
        );
        handleNew(signed);
      } catch {
        // Silencioso: reintentará en el siguiente tick del polling.
      }
    };

    poll();
    const interval = setInterval(poll, 30000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [userId]);
}
