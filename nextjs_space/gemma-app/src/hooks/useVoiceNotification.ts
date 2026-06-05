// Re-export desde el archivo de plataforma nativo.
// Metro resuelve automáticamente:
//   - .web.ts   → en navegador (stub sin expo-notifications)
//   - .native.ts → en iOS/Android (implementación real)
//   - .ts       → fallback (este archivo)
//
// Así expo-notifications nunca se incluye en el bundle web.
export { useVoiceNotification } from './useVoiceNotification.native'
