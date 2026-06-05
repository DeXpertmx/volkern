import type { ChatResponse, AuthSession } from '../types'
import { getItem, setItem, removeItem } from '../lib/storage'
import Constants from 'expo-constants'

// ─── Config ──────────────────────────────────────────────────────────────

function detectServerHost(): string {
  try {
    const hostUri = Constants.expoConfig?.hostUri
    if (hostUri) {
      const ip = hostUri.split(':')[0]
      if (ip && !ip.startsWith('127') && !ip.startsWith('::1')) {
        return `http://${ip}:3002`
      }
    }
  } catch {}
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

// Funciones getItem/setItem/removeItem se importan de lib/storage

export async function getApiUrl(): Promise<string> {
  const stored = await getItem(KEYS.API_URL)
  return stored || DEFAULT_API_URL
}

export async function setApiUrl(url: string): Promise<void> {
  await setItem(KEYS.API_URL, url)
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

async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const apiUrl = await getApiUrl()
  const url = `${apiUrl}${path}`

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 15000)

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

export async function login(email: string, password: string): Promise<AuthSession> {
  const response = await apiFetch('/api/auth/mobile-login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })

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

export async function sendMessage(
  text: string,
  chatId?: string,
): Promise<ChatResponse> {
  const token = await getToken()

  if (!token) {
    throw new ApiError('No autenticado', 401)
  }

  const response = await apiFetch('/api/ai/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      message: text,
      chatId,
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
