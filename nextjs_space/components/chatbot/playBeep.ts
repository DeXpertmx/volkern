/**
 * Reproduce un beep usando la Web Audio API.
 * No requiere archivos de audio externos.
 */
export function playBeep(type: 'start' | 'stop'): void {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();

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

    // Liberar recursos después de que termine
    osc.onended = () => {
      ctx.close().catch(() => {});
    };
  } catch {
    // Silenciosamente ignorar si Web Audio no está disponible
  }
}
