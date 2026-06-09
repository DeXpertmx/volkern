import { useState, useRef, useCallback, useEffect } from 'react'
import { Platform } from 'react-native'

type SpeechState = 'idle' | 'listening' | 'processing'

interface UseSpeechToTextOptions {
  lang?: string
  onResult?: (text: string) => void
  onError?: (error: string) => void
}

interface UseSpeechToTextReturn {
  state: SpeechState
  isSupported: boolean
  interimText: string
  startListening: () => void
  stopListening: () => void
  toggleListening: () => void
}

/**
 * Hook for speech-to-text with dual support:
 * - Web (Expo web): Web Speech API (SpeechRecognition)
 * - Native (iOS/Android): @react-native-voice/voice
 */
export function useSpeechToText(options: UseSpeechToTextOptions = {}): UseSpeechToTextReturn {
  const { lang = 'es-ES', onResult, onError } = options

  const [state, setState] = useState<SpeechState>('idle')
  const [isSupported, setIsSupported] = useState(false)
  const [interimText, setInterimText] = useState('')
  const recognitionRef = useRef<any>(null)

  // ─── Detect support on mount ────────────────────────────────────────
  useEffect(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
      setIsSupported(!!SR)
    } else if (Platform.OS === 'ios' || Platform.OS === 'android') {
      // @react-native-voice/voice — dynamic import to avoid crash on web
      try {
        const Voice = require('@react-native-voice/voice').default
        const { NativeModules } = require('react-native')
        // In Expo Go, NativeModules.Voice will be undefined, so we correctly report unsupported.
        setIsSupported(!!Voice && !!NativeModules.Voice && typeof Voice.start === 'function')
      } catch {
        setIsSupported(false)
      }
    }
  }, [])

  // ─── Stop (shared) ──────────────────────────────────────────────────
  const stopListening = useCallback(() => {
    if (Platform.OS === 'web') {
      try {
        recognitionRef.current?.abort()
        recognitionRef.current?.stop()
      } catch {}
      recognitionRef.current = null
    } else {
      try {
        const Voice = require('@react-native-voice/voice').default
        Voice.stop()
      } catch {}
    }
    setState('idle')
    setInterimText('')
  }, [])

  // ─── Start ──────────────────────────────────────────────────────────
  const startListening = useCallback(() => {
    if (Platform.OS === 'web') {
      // ── Web: Web Speech API ──────────────────────────────────────────
      const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
      if (!SR) {
        onError?.('Tu navegador no soporta reconocimiento de voz')
        return
      }

      // Cleanup previous instance
      if (recognitionRef.current) {
        try { recognitionRef.current.abort() } catch {}
        recognitionRef.current = null
      }

      const recognition = new SR()
      recognition.continuous = true
      recognition.interimResults = true
      recognition.lang = lang
      recognition.maxAlternatives = 1

      recognition.onstart = () => {
        setState('listening')
        setInterimText('')
      }

      recognition.onresult = (event: any) => {
        let interim = ''
        let final = ''
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const transcript = event.results[i][0].transcript
          if (event.results[i].isFinal) {
            final += transcript
          } else {
            interim += transcript
          }
        }
        setInterimText(interim)
        if (final) onResult?.(final)
      }

      recognition.onerror = (event: any) => {
        console.warn('[SpeechToText] Web Error:', event.error)

        // 'no-speech' y 'aborted' son normales, no mostrar error
        if (event.error === 'no-speech' || event.error === 'aborted') {
          setState('idle')
          setInterimText('')
          recognitionRef.current = null
          return
        }

        // 'not-allowed' = micrófono bloqueado por el navegador
        if (event.error === 'not-allowed') {
          onError?.('Permiso de micrófono denegado. Permite el acceso al micrófono en la configuración del navegador y recarga la página.')
        } else {
          onError?.(`Error de voz: ${event.error}`)
        }

        setState('idle')
        setInterimText('')
        recognitionRef.current = null
      }

      recognition.onend = () => {
        setState('idle')
        setInterimText('')
        recognitionRef.current = null
      }

      try {
        recognition.start()
        recognitionRef.current = recognition
      } catch (err) {
        console.error('[SpeechToText] Web start error:', err)
        onError?.('Error al iniciar el micrófono')
        setState('idle')
      }
    } else {
      // ── Native iOS / Android: @react-native-voice/voice ──────────────
      try {
        const Voice = require('@react-native-voice/voice').default

        // Remove stale listeners
        Voice.onSpeechStart = undefined
        Voice.onSpeechEnd = undefined
        Voice.onSpeechResults = undefined
        Voice.onSpeechPartialResults = undefined
        Voice.onSpeechError = undefined

        // Set fresh listeners
        Voice.onSpeechStart = () => {
          setState('listening')
          setInterimText('')
        }

        Voice.onSpeechEnd = () => {
          setState('idle')
        }

        Voice.onSpeechResults = (e: any) => {
          const text = e.value?.[0] || ''
          if (text) {
            onResult?.(text)
          }
          setInterimText('')
        }

        Voice.onSpeechPartialResults = (e: any) => {
          const text = e.value?.[0] || ''
          setInterimText(text)
        }

        Voice.onSpeechError = (e: any) => {
          console.error('[SpeechToText] Native Error:', e.error?.message || e.error)
          if (e.error?.code !== '7' && e.error?.code !== '5') {
            // code 7 = no match, code 5 = cancelled
            onError?.(`Error: ${e.error?.message || e.error}`)
          }
          setState('idle')
          setInterimText('')
        }

        Voice.start(lang)
      } catch (err) {
        console.error('[SpeechToText] Native start error:', err)
        onError?.('Error al iniciar el micrófono nativo')
        setState('idle')
      }
    }
  }, [lang, onResult, onError])

  // ─── Toggle ─────────────────────────────────────────────────────────
  const toggleListening = useCallback(() => {
    if (state === 'listening') {
      stopListening()
    } else {
      startListening()
    }
  }, [state, startListening, stopListening])

  // ─── Cleanup on unmount ─────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (Platform.OS === 'web') {
        if (recognitionRef.current) {
          try { recognitionRef.current.abort() } catch {}
          recognitionRef.current = null
        }
      } else {
        try {
          const Voice = require('@react-native-voice/voice').default
          Voice.onSpeechStart = undefined
          Voice.onSpeechEnd = undefined
          Voice.onSpeechResults = undefined
          Voice.onSpeechPartialResults = undefined
          Voice.onSpeechError = undefined
          Voice.destroy()
        } catch {}
      }
    }
  }, [])

  return {
    state,
    isSupported,
    interimText,
    startListening,
    stopListening,
    toggleListening,
  }
}
