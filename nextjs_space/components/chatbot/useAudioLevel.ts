'use client';

import { useState, useRef, useEffect } from 'react';

const BAR_COUNT = 5;
const FFT_SIZE = 256;

/**
 * Hook que analiza el nivel de audio del micrófono en tiempo real
 * usando la Web Audio API (AnalyserNode).
 * Retorna un array de 5 valores (0-1) representando bandas de frecuencia.
 * Solo se activa cuando `active` es true.
 */
export function useAudioLevel(active: boolean): number[] {
  const [bands, setBands] = useState<number[]>(new Array(BAR_COUNT).fill(0));

  const animFrameRef = useRef<number>(0);
  const streamRef = useRef<MediaStream | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);

  useEffect(() => {
    if (!active) {
      // Limpiar inmediatamente
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = 0;

      sourceRef.current?.disconnect();
      sourceRef.current = null;
      analyserRef.current?.disconnect();
      analyserRef.current = null;
      ctxRef.current?.close();
      ctxRef.current = null;
      streamRef.current?.getTracks().forEach(t => t.stop());
      streamRef.current = null;

      setBands(new Array(BAR_COUNT).fill(0));
      return;
    }

    let cancelled = false;

    async function setup() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (cancelled) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }

        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = FFT_SIZE;

        source.connect(analyser);
        // no conectar a destination — no queremos escuchar el micrófono

        streamRef.current = stream;
        ctxRef.current = ctx;
        sourceRef.current = source;
        analyserRef.current = analyser;

        const bufferLength = analyser.frequencyBinCount; // FFT_SIZE / 2 = 128
        const dataArray = new Uint8Array(bufferLength);
        const bucketSize = Math.floor(bufferLength / BAR_COUNT); // ~25 valores por banda

        function read() {
          if (cancelled) return;

          analyser.getByteFrequencyData(dataArray);

          const newBands = new Array(BAR_COUNT);
          for (let b = 0; b < BAR_COUNT; b++) {
            const start = b * bucketSize;
            const end = b === BAR_COUNT - 1 ? bufferLength : start + bucketSize;
            let sum = 0;
            for (let i = start; i < end; i++) {
              sum += dataArray[i];
            }
            const avg = sum / (end - start);
            // Normalizar: 0-255 → 0-1, con sensibilidad (threshold ~10 para evitar ruido de fondo)
            const normalized = avg < 10 ? 0 : Math.min(avg / 180, 1);
            newBands[b] = normalized;
          }

          setBands(newBands);
          animFrameRef.current = requestAnimationFrame(read);
        }

        read();
      } catch {
        // Micrófono no disponible o permiso denegado — los bands se quedan en 0
      }
    }

    setup();

    return () => {
      cancelled = true;
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = 0;

      sourceRef.current?.disconnect();
      sourceRef.current = null;
      analyserRef.current?.disconnect();
      analyserRef.current = null;
      ctxRef.current?.close();
      ctxRef.current = null;
      streamRef.current?.getTracks().forEach(t => t.stop());
      streamRef.current = null;

      setBands(new Array(BAR_COUNT).fill(0));
    };
  }, [active]);

  return bands;
}
