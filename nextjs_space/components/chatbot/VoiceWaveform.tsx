'use client';

import { cn } from '@/lib/utils';

interface VoiceWaveformProps {
  isListening: boolean;
  isPaused?: boolean;
  className?: string;
}

const BAR_COUNT = 5;

export function VoiceWaveform({ isListening, isPaused, className }: VoiceWaveformProps) {
  if (!isListening && !isPaused) return null;

  return (
    <div
      className={cn(
        'flex items-center justify-center gap-[3px] h-8 px-2',
        className
      )}
      aria-label="Indicador de grabación de voz"
      role="status"
    >
      {Array.from({ length: BAR_COUNT }).map((_, i) => (
        <div
          key={i}
          className={cn(
            'w-[3px] rounded-full transition-all duration-300',
            isPaused ? 'bg-muted-foreground/40' : 'bg-destructive'
          )}
          style={{
            height: isPaused ? '8px' : '16px',
            animation: isListening
              ? `waveform-bar 1.2s ease-in-out ${i * 0.15}s infinite`
              : 'none',
          }}
        />
      ))}

      <style>{`
        @keyframes waveform-bar {
          0%,
          100% {
            height: 6px;
            opacity: 0.4;
          }
          10% {
            height: 18px;
            opacity: 1;
          }
          20% {
            height: 8px;
            opacity: 0.6;
          }
          30% {
            height: 22px;
            opacity: 1;
          }
          40% {
            height: 12px;
            opacity: 0.7;
          }
          50% {
            height: 26px;
            opacity: 1;
          }
          60% {
            height: 10px;
            opacity: 0.5;
          }
          70% {
            height: 20px;
            opacity: 1;
          }
          80% {
            height: 14px;
            opacity: 0.6;
          }
          90% {
            height: 24px;
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
}
