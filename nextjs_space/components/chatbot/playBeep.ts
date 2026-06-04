/**
 * Reproduce un beep usando la Web Audio API.
 * No requiere archivos de audio externos.
 * Usa un AudioContext singleton para evitar límites del navegador (máx. 4-6 contextos).
 */

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  // Reanudar si está suspendido (política de autoplay del navegador)
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

export function playBeep(type: 'start' | 'stop'): void {
  try {
    const ctx = getAudioContext();

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.type = 'sine';

    const now = ctx.currentTime;

    if (type === 'start') {
      // Tono ascendente suave: 520Hz → 720Hz en 120ms
      osc.frequency.setValueAtTime(520, now);
      osc.frequency.linearRampToValueAtTime(720, now + 0.12);
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
      osc.start(now);
      osc.stop(now + 0.15);
    } else {
      // Tono descendente: 620Hz → 420Hz en 100ms
      osc.frequency.setValueAtTime(620, now);
      osc.frequency.linearRampToValueAtTime(420, now + 0.1);
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.13);
      osc.start(now);
      osc.stop(now + 0.13);
    }
  } catch {
    // Silenciosamente ignorar si Web Audio no está disponible
  }
}

/**
 * Activa la vibración háptica en dispositivos móviles.
 * Usa la Vibration API (navigator.vibrate).
 * No hace nada si no está soportada.
 */
export function hapticFeedback(type: 'start' | 'stop' | 'pause'): void {
  try {
    if (!navigator.vibrate) return;

    switch (type) {
      case 'start':
        // Vibración corta y suave
        navigator.vibrate(10);
        break;
      case 'stop':
        // Vibración un poco más larga
        navigator.vibrate(15);
        break;
      case 'pause':
        // Doble vibración (patrón: 10ms on, 30ms off, 10ms on)
        navigator.vibrate([10, 30, 10]);
        break;
    }
  } catch {
    // Silenciosamente ignorar si la API no está disponible
  }
}
