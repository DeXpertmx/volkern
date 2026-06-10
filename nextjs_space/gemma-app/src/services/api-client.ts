import type { ChatResponse, AuthSession, Attachment } from '../types'
import { getItem, setItem, removeItem } from '../lib/storage'
import Constants from 'expo-constants'

// ─── Config ──────────────────────────────────────────────────────────────

function detectServerHost(): string {
  // 1. Variable de entorno EXPO_PUBLIC_API_URL (desde .env o EAS Build)
  if (process.env.EXPO_PUBLIC_API_URL) {
    return process.env.EXPO_PUBLIC_API_URL.replace(/\/$/, '')
  }

  // 2. Detección automática de IP local para desarrollo (Expo Go / LAN)
  try {
    const hostUri = Constants.expoConfig?.hostUri
    if (hostUri) {
      const ip = hostUri.split(':')[0]
      if (ip && !ip.startsWith('127') && !ip.startsWith('::1')) {
        return `http://${ip}:3002`
      }
    }
  } catch {}

  // 3. Fallback final
  return 'http://localhost:3002'
}

const DEFAULT_API_URL = detectServerHost()

const KEYS = {
  API_URL: 'gemma_api_url',
  AUTH_TOKEN: 'gemma_auth_token',
  USER_DATA: 'gemma_user_data',
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message)
    this.name = 'ApiError'
  }

  get isNetworkError(): boolean {
    return this.status === 0 || this.status === -1
  }

  get friendlyMessage(): string {
    if (this.isNetworkError) {
      return 'No se pudo conectar al servidor.\nVerifica que el servidor Volkern esté corriendo y que la URL de conexión sea correcta.'
    }
    return this.message
  }
}

// Cache en memoria — evita depender exclusivamente de localStorage
// que puede fallar en navegadores móviles con restricciones de privacidad.
let _cachedApiUrl: string | null = null

export async function getApiUrl(): Promise<string> {
  // 1. Memoria (más rápido y fiable)
  if (_cachedApiUrl) return _cachedApiUrl
  // 2. localStorage (persistencia entre sesiones)
  const stored = await getItem(KEYS.API_URL)
  if (stored) {
    _cachedApiUrl = stored
    return stored
  }
  // 3. Fallback por detección de IP
  return DEFAULT_API_URL
}

export async function setApiUrl(url: string): Promise<void> {
  _cachedApiUrl = url // siempre en memoria
  await setItem(KEYS.API_URL, url) // best-effort a localStorage
}

export async function getToken(): Promise<string | null> {
  return getItem(KEYS.AUTH_TOKEN)
}

export async function saveSession(session: AuthSession): Promise<void> {
  await setItem(KEYS.AUTH_TOKEN, session.token)
  await setItem(KEYS.USER_DATA, JSON.stringify(session))
}

export async function getSession(): Promise<AuthSession | null> {
  const raw = await getItem(KEYS.USER_DATA)
  if (!raw) return null
  try { return JSON.parse(raw) }
  catch { return null }
}

export async function clearSession(): Promise<void> {
  await removeItem(KEYS.AUTH_TOKEN)
  await removeItem(KEYS.USER_DATA)
}

async function apiFetch(path: string, options: RequestInit = {}, baseUrlOverride?: string): Promise<Response> {
  const apiUrl = baseUrlOverride || await getApiUrl()
  const url = `${apiUrl}${path}`

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 60000)

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    })
    return response
  } catch (err: any) {
    if (err.name === 'TypeError' || err.name === 'AbortError') {
      throw new ApiError('No se pudo conectar al servidor. Verifica que Volkern esté corriendo.', 0)
    }
    throw err
  } finally {
    clearTimeout(timeoutId)
  }
}

export async function login(email: string, password: string, baseUrl?: string): Promise<AuthSession> {
  // Si recibimos URL directamente, cachearla y usarla
  if (baseUrl) {
    await setApiUrl(baseUrl)
  }

  const response = await apiFetch('/api/auth/mobile-login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  }, baseUrl)

  if (!response.ok) {
    const errBody = await response.json().catch(() => ({ error: `Error ${response.status}` }))
    throw new ApiError(errBody.error || `Error ${response.status}`, response.status)
  }

  // Verificar que la respuesta sea JSON (no HTML)
  const contentType = response.headers.get('content-type') || ''
  if (!contentType.toLowerCase().includes('application/json')) {
    throw new ApiError(
      'El servidor respondió con HTML en lugar de JSON. Verifica que la URL del servidor sea correcta (ej: http://192.168.0.22:3002)',
      0,
    )
  }

  let data: any
  try {
    data = await response.json()
  } catch {
    throw new ApiError('Respuesta inválida del servidor. Verifica la URL de conexión.', 0)
  }

  if (!data.token) {
    throw new ApiError('Respuesta inválida: no se recibió token de autenticación.', 0)
  }

  const session: AuthSession = {
    userId: data.user?.id ?? '',
    tenantId: data.user?.tenantId ?? '',
    name: data.user?.name || email.split('@')[0],
    email,
    token: data.token,
  }

  await saveSession(session)
  return session
}

export async function loginWithApiKey(apiKey: string, baseUrl: string): Promise<AuthSession> {
  const cleanUrl = baseUrl.trim().replace(/\/$/, '')
  await setApiUrl(cleanUrl)

  // Validar la API Key llamando a /api/users/me
  const response = await apiFetch('/api/users/me', {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${apiKey}`
    }
  }, cleanUrl)

  if (!response.ok) {
    const errBody = await response.json().catch(() => ({ error: `Error ${response.status}` }))
    throw new ApiError(errBody.error || `Error ${response.status} de autenticación`, response.status)
  }

  // Verificar que la respuesta sea JSON (no HTML)
  const contentType = response.headers.get('content-type') || ''
  if (!contentType.toLowerCase().includes('application/json')) {
    throw new ApiError(
      'El servidor respondió con HTML en lugar de JSON. Verifica que la URL del servidor sea correcta.',
      0,
    )
  }

  const data = await response.json()

  const session: AuthSession = {
    userId: data.id || '',
    tenantId: data.tenant?.id || '',
    name: data.name || data.email?.split('@')[0] || 'Usuario',
    email: data.email || '',
    token: apiKey, // Guardamos la API Key como token
  }

  await saveSession(session)
  return session
}

export async function sendMessage(
  text: string,
  chatId?: string,
  attachments?: Attachment[]
): Promise<ChatResponse> {
  const token = await getToken()

  if (!token) {
    throw new ApiError('No autenticado', 401)
  }

  // Si hay attachments, podemos construir un texto para el prompt que los mencione
  let messageText = text
  if (attachments && attachments.length > 0) {
    const fileNames = attachments.map(a => `[Archivo ${a.type}: ${a.name}]`).join(', ')
    messageText = text 
      ? `${text} (He adjuntado: ${fileNames})` 
      : `He adjuntado: ${fileNames}`
  }

  const response = await apiFetch('/api/ai/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      message: messageText,
      chatId,
      attachments // Pasarlo por si acaso el backend lo soporta/audita
    }),
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new ApiError(
      (err as any).error || `Error ${response.status}`,
      response.status,
    )
  }

  return response.json()
}
