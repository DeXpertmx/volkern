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
 * Hook for speech-to-text using Web Speech API.
 * Works on Expo web (Chrome/Edge) and modern browsers.
 * For native iOS/Android, @react-native-voice/voice would be needed.
 */
export function useSpeechToText(options: UseSpeechToTextOptions = {}): UseSpeechToTextReturn {
  const { lang = 'es-ES', onResult, onError } = options

  const [state, setState] = useState<SpeechState>('idle')
  const [isSupported, setIsSupported] = useState(false)
  const [interimText, setInterimText] = useState('')
  const recognitionRef = useRef<any>(null)

  // Detect support on mount
  useEffect(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const SpeechRecognitionAPI = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
      setIsSupported(!!SpeechRecognitionAPI)
    }
  }, [])

  const stopListening = useCallback(() => {
    try {
      recognitionRef.current?.abort()
      recognitionRef.current?.stop()
    } catch {}
    recognitionRef.current = null
    setState('idle')
    setInterimText('')
  }, [])

  const startListening = useCallback(() => {
    if (Platform.OS !== 'web') {
      onError?.('Reconocimiento de voz solo disponible en web por ahora')
      return
    }

    const SpeechRecognitionAPI = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognitionAPI) {
      onError?.('Tu navegador no soporta reconocimiento de voz')
      return
    }

    // Cleanup previous instance
    if (recognitionRef.current) {
      try { recognitionRef.current.abort() } catch {}
      recognitionRef.current = null
    }

    const recognition = new SpeechRecognitionAPI()
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
      if (final) {
        onResult?.(final)
      }
    }

    recognition.onerror = (event: any) => {
      console.error('[SpeechToText] Error:', event.error)
      if (event.error !== 'no-speech' && event.error !== 'aborted') {
        onError?.(`Error: ${event.error}`)
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
      console.error('[SpeechToText] Start error:', err)
      onError?.('Error al iniciar el micrófono')
      setState('idle')
    }
  }, [lang, onResult, onError])

  const toggleListening = useCallback(() => {
    if (state === 'listening') {
      stopListening()
    } else {
      startListening()
    }
  }, [state, startListening, stopListening])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try { recognitionRef.current.abort() } catch {}
        recognitionRef.current = null
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
