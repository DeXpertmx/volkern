/**
 * Stub para web.
 *
 * En web, expo-notifications no existe como módulo nativo.
 * Este archivo se usa en lugar de useVoiceNotification.native.ts
 * porque Metro resuelve .web.ts antes que .native.ts en la plataforma web.
 *
 * Así nunca se referencia expo-notifications en el bundle web.
 */

export function useVoiceNotification(
  _interimText: string,
  _isListening: boolean,
  _minLength: number = 3,
) {
  // No-op en web
  return { cancelVoiceNotifications: () => {} }
}
