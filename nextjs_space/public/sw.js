const CACHE_VERSION = 'v1'
const STATIC_CACHE = `volkern-static-${CACHE_VERSION}`
const DYNAMIC_CACHE = `volkern-dynamic-${CACHE_VERSION}`
const API_CACHE = `volkern-api-${CACHE_VERSION}`

const STATIC_ASSETS = [
  '/',
  '/volkern-icon.png',
  '/volkern-logo.png',
  '/manifest.json',
  '/favicon.ico',
  '/dashboard/finanzas/gastos/escanear',
]

const API_CACHE_PATTERNS = [
  /\/api\/citas/,
  /\/api\/disponibilidad/,
  /\/api\/calendars/,
  /\/api\/leads/,
  /\/api\/contacts/,
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      return cache.addAll(STATIC_ASSETS)
    })
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== STATIC_CACHE && name !== DYNAMIC_CACHE && name !== API_CACHE)
          .map((name) => caches.delete(name))
      )
    })
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // No interceptar peticiones a otros orígenes
  if (url.origin !== self.location.origin) return

  // ⛔ NO interceptar peticiones POST/PUT/DELETE/PATCH — la Cache API
  //     no soporta métodos distintos de GET y rompe con TypeError.
  //     Dejamos que pasen directo al network sin interceptar.
  if (request.method !== 'GET' && request.mode !== 'navigate') return

  const isStaticAsset = STATIC_ASSETS.includes(url.pathname) ||
    /\.(png|jpg|jpeg|gif|svg|ico|woff2?|css|js)$/.test(url.pathname)

  const isApiRequest = API_CACHE_PATTERNS.some((pattern) => pattern.test(url.pathname))

  if (isApiRequest) {
    event.respondWith(networkFirstWithCache(request, API_CACHE))
    return
  }

  if (isStaticAsset) {
    event.respondWith(cacheFirstWithNetwork(request, STATIC_CACHE))
    return
  }

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstWithCache(request, DYNAMIC_CACHE))
    return
  }

  // Solo GET requests llegan aquí (POST/PUT/DELETE fueron filtrados arriba)
  event.respondWith(networkFirstWithCache(request, DYNAMIC_CACHE))
})

async function cacheFirstWithNetwork(request, cacheName) {
  const cached = await caches.match(request)
  if (cached) return cached

  try {
    // Forzar redirect:'follow' — el request de navegación viene con redirect:'manual'
    // y la redirección del middleware (ej. / → /auth/login) rompe si no se sigue.
    const response = await fetch(request, { redirect: 'follow' })
    if (response.ok) {
      const cache = await caches.open(cacheName)
      cache.put(request, response.clone())
    }
    return response
  } catch {
    return new Response('Offline', { status: 503 })
  }
}

async function networkFirstWithCache(request, cacheName) {
  try {
    // Forzar redirect:'follow' solo en navegaciones (vienen con redirect:'manual')
    // En GET normales, usar el redirect mode que traiga el request original.
    const fetchOpts: RequestInit = request.mode === 'navigate'
      ? { redirect: 'follow' }
      : {}
    const response = await fetch(request, fetchOpts)
    // Solo cachear respuestas GET exitosas
    if (response.ok && response.status === 200 && request.method === 'GET') {
      const cache = await caches.open(cacheName)
      cache.put(request, response.clone())
    }
    return response
  } catch {
    const cached = await caches.match(request)
    if (cached) return cached
    if (request.mode === 'navigate') {
      return caches.match('/')
    }
    return new Response(JSON.stringify({ error: 'offline' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}

self.addEventListener('push', function(event) {
  if (!event.data) return

  try {
    const data = event.data.json()
    const options = {
      body: data.body || '',
      icon: data.icon || '/volkern-icon.png',
      badge: data.badge || '/volkern-icon.png',
      vibrate: [100, 50, 100],
      data: {
        url: data.url || '/',
        timestamp: Date.now(),
      },
      actions: data.actions || [],
    }

    event.waitUntil(
      self.registration.showNotification(data.title || 'Volkern', options)
    )
  } catch (error) {
    console.error('[SW] Error processing push:', error)
  }
})

self.addEventListener('notificationclick', function(event) {
  event.notification.close()

  const url = event.notification.data?.url || '/'

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      for (const client of clientList) {
        if (client.url === url && 'focus' in client) {
          return client.focus()
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(url)
      }
    })
  )
})
