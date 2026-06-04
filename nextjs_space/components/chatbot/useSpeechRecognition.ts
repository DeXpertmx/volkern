'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

export interface UseSpeechRecognitionReturn {
  isListening: boolean;
  isPaused: boolean;
  isSupported: boolean;
  transcript: string;
  error: string | null;
  startListening: () => void;
  stopListening: () => void;
  toggleListening: () => void;
  pauseListening: () => void;
  resumeListening: () => void;
}

export function useSpeechRecognition(options?: {
  lang?: string;
  onResult?: (transcript: string) => void;
  onFinalResult?: (transcript: string) => void;
  /**
   * Callback que se dispara en cada evento de voz con el texto parcial
   * (no-final/interim) que se está reconociendo en vivo.
   */
  onInterimResult?: (transcript: string) => void;
  autoRestart?: boolean;
  /**
   * Tiempo de silencio en ms después del cual se auto-detiene la grabación.
   * Solo se activa después de haber detectado texto (no se detiene si el
   * usuario nunca habló). Poner en 0 para deshabilitar.
   * @default 2000
   */
  silenceTimeoutMs?: number;
}): UseSpeechRecognitionReturn {
  const {
    lang = 'es-ES',
    onResult,
    onFinalResult,
    onInterimResult,
    autoRestart = false,
    silenceTimeoutMs = 2000,
  } = options || {};

  const [isListening, setIsListening] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<any>(null);
  const isListeningRef = useRef(false);
  const isPausingRef = useRef(false);
  const isResumingRef = useRef(false);
  const endTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const silenceTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const supported = !!(window.SpeechRecognition || window.webkitSpeechRecognition);
    setIsSupported(supported);
  }, []);

  const startListening = useCallback((resume = false) => {
    if (!isSupported) {
      setError('Reconocimiento de voz no soportado en este navegador');
      return;
    }

    if (isListeningRef.current) {
      // Ya está escuchando, no hacer nada
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError('Reconocimiento de voz no disponible');
      return;
    }

    // Cancelar cualquier timeout de finalización pendiente
    if (endTimeoutRef.current) {
      clearTimeout(endTimeoutRef.current);
      endTimeoutRef.current = null;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = lang;

    const resetSilenceTimer = () => {
      if (!silenceTimeoutMs) return;
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
      }
      silenceTimerRef.current = setTimeout(() => {
        silenceTimerRef.current = null;
        // Silencio detectado — auto-detener
        try {
          recognition.stop();
        } catch {
          // Ignorar si ya se detuvo
        }
      }, silenceTimeoutMs);
    };

    recognition.onresult = (event: any) => {
      let accumulatedFinal = '';
      let latestInterim = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          accumulatedFinal += (accumulatedFinal ? ' ' : '') + result[0].transcript;
        } else {
          // Último resultado interim (se sobrescribe en cada iteración)
          latestInterim = result[0].transcript;
        }
      }

      if (accumulatedFinal) {
        setTranscript(prev => {
          const newTranscript = prev ? `${prev} ${accumulatedFinal}`.trim() : accumulatedFinal;
          onFinalResult?.(newTranscript);
          return newTranscript;
        });
        // Hay texto nuevo — el usuario sigue hablando, reiniciar timer de silencio
        resetSilenceTimer();
      }

      // Reportar texto parcial en vivo (interim)
      if (latestInterim) {
        onInterimResult?.(latestInterim);
      } else {
        // Si no hay interim, limpiar (el usuario dejó de hablar parcialmente)
        onInterimResult?.('');
      }

      onResult?.(accumulatedFinal || latestInterim);
    };

    recognition.onerror = (event: any) => {
      if (event.error === 'aborted') {
        // El usuario detuvo la grabación explícitamente, no mostrar error
        return;
      }
      if (event.error !== 'no-speech') {
        setError(`Error: ${event.error}`);
      }
      // onend se encargará de limpiar el estado
    };

    recognition.onend = () => {
      // Limpiar timer de silencio
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }

      // Si es una pausa, no hacer cleanup completo
      if (isPausingRef.current) {
        isPausingRef.current = false;
        isListeningRef.current = false;
        // El estado isListening ya lo cambió pauseListening
        return;
      }

      // Marcar como no escuchando INMEDIATAMENTE (ref) para permitir
      // que el usuario pueda reiniciar el reconocimiento si quiere.
      // Solo la UI (setIsListening) se delayea para evitar flickering.
      isListeningRef.current = false;

      if (autoRestart) {
        try {
          recognition.start();
          isListeningRef.current = true; // restart exitoso
          return;
        } catch {
          // Si falla el restart, dejar que el timeout limpie la UI
        }
      }

      // Delay visual para evitar flickering
      if (endTimeoutRef.current) clearTimeout(endTimeoutRef.current);
      endTimeoutRef.current = setTimeout(() => {
        setIsListening(false);
        endTimeoutRef.current = null;
      }, 300);
    };

    // Establecer estado ANTES de llamar a start() para que la UI reaccione
    // aunque el navegador dispare onend sincrónicamente
    setIsListening(true);
    setError(null);
    if (!resume) {
      setTranscript('');
    }
    isListeningRef.current = true;

    try {
      recognition.start();
      recognitionRef.current = recognition;
    } catch (err) {
      setError('Error al iniciar el reconocimiento de voz');
      setIsListening(false);
      isListeningRef.current = false;
      if (endTimeoutRef.current) {
        clearTimeout(endTimeoutRef.current);
        endTimeoutRef.current = null;
      }
    }
  }, [isSupported, lang, onResult, onFinalResult, onInterimResult, autoRestart, silenceTimeoutMs]);

  const stopListening = useCallback(() => {
    // Si estaba en pausa, solo resetear estado
    if (isPaused) {
      setIsPaused(false);
      setIsListening(false);
      return;
    }
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (endTimeoutRef.current) {
      clearTimeout(endTimeoutRef.current);
      endTimeoutRef.current = null;
    }
    if (recognitionRef.current) {
      isListeningRef.current = false;
      try {
        recognitionRef.current.stop();
      } catch {
        // Ignorar errores al detener
      }
      recognitionRef.current = null;
    }
    setIsListening(false);
    setIsPaused(false);
  }, [isPaused]);

  const toggleListening = useCallback(() => {
    if (isPaused) {
      resumeListening();
    } else if (isListeningRef.current) {
      stopListening();
    } else {
      startListening();
    }
  }, [startListening, stopListening, resumeListening, isPaused]);

  const pauseListening = useCallback(() => {
    if (!isListeningRef.current || isPaused) return;
    isPausingRef.current = true;
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // Ignorar
      }
    }
    setIsPaused(true);
    setIsListening(false);
  }, [isPaused]);

  const resumeListening = useCallback(() => {
    if (!isPaused) return;
    isResumingRef.current = true;
    setIsPaused(false);
    startListening(true);
  }, [isPaused, startListening]);

  // Limpiar al desmontar
  useEffect(() => {
    return () => {
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }
      if (endTimeoutRef.current) {
        clearTimeout(endTimeoutRef.current);
        endTimeoutRef.current = null;
      }
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {
          // Ignorar
        }
        recognitionRef.current = null;
      }
    };
  }, []);

  return {
    isListening,
    isPaused,
    isSupported,
    transcript,
    error,
    startListening,
    stopListening,
    toggleListening,
    pauseListening,
    resumeListening,
  };
}
