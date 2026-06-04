'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

export interface UseSpeechRecognitionReturn {
  isListening: boolean;
  isSupported: boolean;
  transcript: string;
  error: string | null;
  startListening: () => void;
  stopListening: () => void;
  toggleListening: () => void;
}

export function useSpeechRecognition(options?: {
  lang?: string;
  onResult?: (transcript: string) => void;
  onFinalResult?: (transcript: string) => void;
  autoRestart?: boolean;
}): UseSpeechRecognitionReturn {
  const {
    lang = 'es-ES',
    onResult,
    onFinalResult,
    autoRestart = false,
  } = options || {};

  const [isListening, setIsListening] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const isListeningRef = useRef(false);

  useEffect(() => {
    const supported = !!(window.SpeechRecognition || window.webkitSpeechRecognition);
    setIsSupported(supported);
  }, []);

  const startListening = useCallback(() => {
    if (!isSupported) {
      setError('Reconocimiento de voz no soportado en este navegador');
      return;
    }

    if (isListeningRef.current) return;

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError('Reconocimiento de voz no disponible');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = lang;

    recognition.onresult = (event: any) => {
      let accumulatedFinal = '';
      let interimText = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          accumulatedFinal += (accumulatedFinal ? ' ' : '') + result[0].transcript;
        } else {
          interimText += (interimText ? ' ' : '') + result[0].transcript;
        }
      }

      if (accumulatedFinal) {
        setTranscript(prev => {
          const newTranscript = prev ? `${prev} ${accumulatedFinal}`.trim() : accumulatedFinal;
          onFinalResult?.(newTranscript);
          return newTranscript;
        });
      }

      onResult?.(accumulatedFinal || interimText);
    };

    recognition.onerror = (event: any) => {
      if (event.error === 'no-speech') {
        // Silencio, intentar de nuevo si autoRestart está activado
        if (autoRestart && isListeningRef.current) {
          recognition.start();
          return;
        }
      } else if (event.error === 'aborted') {
        // El usuario detuvo la grabación, no es error
        return;
      } else {
        setError(`Error: ${event.error}`);
      }
      setIsListening(false);
      isListeningRef.current = false;
    };

    recognition.onend = () => {
      if (isListeningRef.current && autoRestart) {
        try {
          recognition.start();
        } catch {
          setIsListening(false);
          isListeningRef.current = false;
        }
      } else {
        setIsListening(false);
        isListeningRef.current = false;
      }
    };

    try {
      recognition.start();
      recognitionRef.current = recognition;
      isListeningRef.current = true;
      setIsListening(true);
      setError(null);
      setTranscript('');
    } catch (err) {
      setError('Error al iniciar el reconocimiento de voz');
      setIsListening(false);
      isListeningRef.current = false;
    }
  }, [isSupported, lang, onResult, onFinalResult, autoRestart]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current && isListeningRef.current) {
      isListeningRef.current = false;
      try {
        recognitionRef.current.stop();
      } catch {
        // Ignorar errores al detener
      }
      recognitionRef.current = null;
    }
    setIsListening(false);
  }, []);

  const toggleListening = useCallback(() => {
    if (isListeningRef.current) {
      stopListening();
    } else {
      startListening();
    }
  }, [startListening, stopListening]);

  // Limpiar al desmontar
  useEffect(() => {
    return () => {
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
    isSupported,
    transcript,
    error,
    startListening,
    stopListening,
    toggleListening,
  };
}
