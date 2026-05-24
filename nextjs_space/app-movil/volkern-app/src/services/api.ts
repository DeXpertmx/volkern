import { getToken } from './storage';
import { networkService } from './network';
import * as SecureStore from 'expo-secure-store';

// ─── Config ────────────────────────────────────────────────────────────────────
const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';
const CACHE_PREFIX = 'volkern_cache_';

// ─── Error ─────────────────────────────────────────────────────────────────────
export class ApiClientError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

// ─── Cache version (for invalidation) ──────────────────────────────────────────
const CACHE_VERSION_KEY = 'volkern_cache_version';

async function getCacheVersion(): Promise<number> {
  try {
    const raw = await SecureStore.getItemAsync(CACHE_VERSION_KEY);
    return raw ? parseInt(raw, 10) : 0;
  } catch {
    return 0;
  }
}

async function bumpCacheVersion(): Promise<void> {
  try {
    const version = await getCacheVersion();
    await SecureStore.setItemAsync(CACHE_VERSION_KEY, String(version + 1));
  } catch {
    // ignorar
  }
}

// ─── Cache helpers ─────────────────────────────────────────────────────────────
const cache = {
  async get<T>(key: string): Promise<T | null> {
    try {
      const version = await getCacheVersion();
      const fullKey = `${CACHE_PREFIX}v${version}_${key}`;
      const raw = await SecureStore.getItemAsync(fullKey);
      if (!raw) return null;
      const { data, expiry } = JSON.parse(raw);
      if (expiry && Date.now() > expiry) {
        await SecureStore.deleteItemAsync(fullKey);
        return null;
      }
      return data as T;
    } catch {
      return null;
    }
  },

  async set(key: string, data: unknown, ttlMinutes = 5): Promise<void> {
    try {
      const version = await getCacheVersion();
      const fullKey = `${CACHE_PREFIX}v${version}_${key}`;
      const payload = JSON.stringify({
        data,
        expiry: Date.now() + ttlMinutes * 60 * 1000,
      });

      // SecureStore tiene límite ~2KB en Android; si falla, continuamos sin cache
      await SecureStore.setItemAsync(fullKey, payload).catch((e) => {
        console.warn('[Cache] SecureStore set failed (size limit?):', e.message);
      });
    } catch (e) {
      console.warn('[Cache] set error:', e);
    }
  },

  async invalidate(): Promise<void> {
    await bumpCacheVersion();
  },
};

// ─── Request ───────────────────────────────────────────────────────────────────
interface RequestOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  /** TTL en minutos para caché de GETs. Default 5. 0 = no cache. */
  cacheTTL?: number;
}

async function request<T>(
  endpoint: string,
  options: RequestOptions = {},
): Promise<T> {
  const { method = 'GET', body, headers = {}, cacheTTL = 5 } = options;
  const isGet = method === 'GET';
  const cacheKey = `${method}:${endpoint}`;

  // ── GET: intentar caché primero ──
  if (isGet && cacheTTL > 0) {
    const cached = await cache.get<T>(cacheKey);
    if (cached !== null) {
      return cached;
    }
  }

  const token = await getToken();
  const reqHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...headers,
  };

  if (token) {
    reqHeaders['Authorization'] = `Bearer ${token}`;
  }

  const isOnline = networkService.isOnline();
  const isWrite = ['POST', 'PATCH', 'PUT', 'DELETE'].includes(method);

  // ── OFFLINE: encolar operaciones de escritura ──
  if (!isOnline && isWrite) {
    const { offlineQueue } = await import('./offline-queue');
    await offlineQueue.enqueue({
      method: method as 'POST' | 'PATCH' | 'PUT' | 'DELETE',
      endpoint,
      body,
      label: `${method} ${endpoint}`,
    });
    // Devolver un error controlado para que la UI maneje el offline
    throw new ApiClientError(
      'Sin conexión. La operación se encoló y se ejecutará cuando vuelvas a estar online.',
      0,
      'OFFLINE_QUEUED',
    );
  }

  const url = `${API_BASE_URL}/api${endpoint}`;

  const response = await fetch(url, {
    method,
    headers: reqHeaders,
    body: body ? JSON.stringify(body) : undefined,
  });

  // ── Write exitoso: invalidar caché relacionada ──
  if (isWrite && response.ok) {
    await cache.invalidate();
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new ApiClientError(
      data.error || data.message || `Error ${response.status}`,
      response.status,
      data.code,
    );
  }

  // ── GET exitoso: guardar en caché ──
  if (isGet && cacheTTL > 0) {
    await cache.set(cacheKey, data, cacheTTL);
  }

  return data as T;
}

// ─── HTTP Methods ─────────────────────────────────────────────────────────────
export const api = {
  get: <T>(endpoint: string) => request<T>(endpoint),

  post: <T>(endpoint: string, body?: unknown) =>
    request<T>(endpoint, { method: 'POST', body }),

  patch: <T>(endpoint: string, body?: unknown) =>
    request<T>(endpoint, { method: 'PATCH', body }),

  put: <T>(endpoint: string, body?: unknown) =>
    request<T>(endpoint, { method: 'PUT', body }),

  delete: <T>(endpoint: string) =>
    request<T>(endpoint, { method: 'DELETE' }),
};
