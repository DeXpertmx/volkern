'use client';

import { cn } from '@/lib/utils';

interface VoiceWaveformProps {
  isListening: boolean;
  isPaused?: boolean;
  /** Array de 5 valores (0-1) del analizador de audio real */
  audioBands?: number[];
  className?: string;
}

const BAR_COUNT = 5;

function getBarHeight(band: number, isPaused: boolean): number {
  if (isPaused) return 8;
  // Mapear 0-1 → 4px-28px con mínimo sensible
  return 4 + band * 24;
}

export function VoiceWaveform({ isListening, isPaused, audioBands, className }: VoiceWaveformProps) {
  if (!isListening && !isPaused) return null;

  const hasRealAudio = isListening && audioBands && audioBands.length === BAR_COUNT;

  return (
    <div
      className={cn(
        'flex items-center justify-center gap-[3px] h-8 px-0.5',
        className
      )}
      aria-label="Indicador de nivel de audio"
      role="status"
    >
      {Array.from({ length: BAR_COUNT }).map((_, i) => {
        const bandValue = hasRealAudio ? audioBands[i] : 0;
        const height = hasRealAudio
          ? getBarHeight(bandValue, false)
          : isPaused
            ? 8
            : 14; // fallback estático si no hay audio real

        return (
          <div
            key={i}
            className={cn(
              'w-[3px] rounded-full transition-all duration-[80ms] ease-linear',
              isPaused
                ? 'bg-muted-foreground/40'
                : hasRealAudio
                  ? bandValue > 0.6
                    ? 'bg-destructive'
                    : bandValue > 0.3
                      ? 'bg-destructive/80'
                      : 'bg-destructive/60'
                  : 'bg-destructive'
            )}
            style={{ height: `${height}px` }}
          />
        );
      })}
    </div>
  );
}
