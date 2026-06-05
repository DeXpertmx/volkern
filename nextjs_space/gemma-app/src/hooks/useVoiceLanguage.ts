import { useState, useEffect, useCallback } from 'react'
import { getItem, setItem } from '../lib/storage'

const STORAGE_KEY = 'gemma_voice_language'
const DEFAULT_LANG = 'es-ES'

export interface LanguageOption {
  label: string
  value: string
  flag: string
}

export const VOICE_LANGUAGES: LanguageOption[] = [
  { label: 'Español (España)', value: 'es-ES', flag: '🇪🇸' },
  { label: 'Español (México)', value: 'es-MX', flag: '🇲🇽' },
  { label: 'English (US)', value: 'en-US', flag: '🇺🇸' },
  { label: 'English (UK)', value: 'en-GB', flag: '🇬🇧' },
  { label: 'Português (Brasil)', value: 'pt-BR', flag: '🇧🇷' },
  { label: 'Français', value: 'fr-FR', flag: '🇫🇷' },
  { label: 'Italiano', value: 'it-IT', flag: '🇮🇹' },
  { label: 'Deutsch', value: 'de-DE', flag: '🇩🇪' },
]

export function getLanguageLabel(value: string): string {
  return VOICE_LANGUAGES.find(l => l.value === value)?.label || value
}

export function getLanguageFlag(value: string): string {
  return VOICE_LANGUAGES.find(l => l.value === value)?.flag || '🌐'
}

// ─── Module-level cache + pub/sub para sincronizar entre pantallas ─────
// Cuando settings cambia el idioma, el chat (que sigue montado) debe
// recibir la actualización sin necesidad de navegación adicional.
let _currentLanguage: string = DEFAULT_LANG
const _subscriptions = new Set<(lang: string) => void>()

// Carga inicial desde storage (se ejecuta una vez al importar el módulo)
getItem(STORAGE_KEY)
  .then((stored) => {
    if (stored && VOICE_LANGUAGES.some(l => l.value === stored)) {
      _currentLanguage = stored
    }
  })
  .catch(() => {})

function _notify(lang: string) {
  _subscriptions.forEach(fn => { try { fn(lang) } catch {} })
}

function _subscribe(fn: (lang: string) => void) {
  _subscriptions.add(fn)
  return () => { _subscriptions.delete(fn) }
}

// ─── Hook ──────────────────────────────────────────────────────────────

interface UseVoiceLanguageReturn {
  language: string
  setLanguage: (lang: string) => Promise<void>
  isLoading: boolean
}

export function useVoiceLanguage(): UseVoiceLanguageReturn {
  const [language, setLanguageState] = useState<string>(_currentLanguage)
  const [isLoading, setIsLoading] = useState(true)

  // Sincronizar con otras instancias del hook (ej. settings → chat)
  useEffect(() => {
    return _subscribe((lang) => {
      setLanguageState(lang)
    })
  }, [])

  // Cargar idioma guardado al montar (si el cache aún no se ha cargado)
  useEffect(() => {
    if (_currentLanguage !== DEFAULT_LANG) {
      // Ya está cargado por la promesa del módulo
      setIsLoading(false)
      return
    }

    getItem(STORAGE_KEY)
      .then((stored) => {
        if (stored && VOICE_LANGUAGES.some(l => l.value === stored)) {
          _currentLanguage = stored
          setLanguageState(stored)
          _notify(stored)
        }
      })
      .catch(() => {})
      .finally(() => setIsLoading(false))
  }, [])

  // Guardar y actualizar idioma (notifica a todas las instancias)
  const setLanguage = useCallback(async (lang: string) => {
    _currentLanguage = lang
    setLanguageState(lang)
    _notify(lang)
    await setItem(STORAGE_KEY, lang).catch(() => {})
  }, [])

  return { language, setLanguage, isLoading }
}
