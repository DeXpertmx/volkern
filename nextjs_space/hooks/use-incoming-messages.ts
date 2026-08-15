'use client';

/**
 * Utilidades para avisar de mensajes entrantes en tiempo real:
 * sonido (sintetizado con Web Audio, sin necesidad de archivo) y
 * notificación del navegador cuando el permiso está concedido.
 */

let audioCtx: AudioContext | null = null;

/** Timbre de dos notas (La5 → Re6), agradable y breve. */
export function playIncomingChime() {
  try {
    if (typeof window === 'undefined') return;
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    audioCtx = audioCtx || new Ctx();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const now = audioCtx.currentTime;
    const notes = [880, 1174.66]; // La5 → Re6
    notes.forEach((freq, i) => {
      const osc = audioCtx!.createOscillator();
      const gain = audioCtx!.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const start = now + i * 0.18;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.22, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.55);
      osc.connect(gain);
      gain.connect(audioCtx!.destination);
      osc.start(start);
      osc.stop(start + 0.6);
    });
  } catch {
    // El navegador puede bloquear el audio hasta la primera interacción; no romper nada.
  }
}

/** Suena el timbre y, si el navegador lo permite, muestra una notificación. */
export function notifyIncomingMessage(title: string, body: string, url?: string) {
  playIncomingChime();
  try {
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      const n = new Notification(title, { body, icon: '/volkern-icon.png', tag: 'incoming-message' });
      n.onclick = () => {
        window.focus();
        if (url) window.location.href = url;
        n.close();
      };
      setTimeout(() => n.close(), 10000);
    }
  } catch {
    // Safari/iOS puede lanzar excepción al construir Notification; ignorar.
  }
}
