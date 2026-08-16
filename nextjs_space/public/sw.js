const CACHE_VERSION = 'v2'
const STATIC_CACHE = `volkern-static-${CACHE_VERSION}`
const DYNAMIC_CACHE = `volkern-dynamic-${CACHE_VERSION}`

const STATIC_ASSETS = [
  '/',
  '/volkern-icon.png',
  '/volkern-logo.png',
  '/manifest.json',
  '/favicon.ico',
  '/dashboard/finanzas/gastos/escanear',
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
          .filter((name) => name !== STATIC_CACHE && name !== DYNAMIC_CACHE)
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

  // ⛔ NO cachear endpoints de API: sus respuestas son por-tenant, volátiles
  //     y sensibles (horarios, leads, citas...). Cachearlas provoca datos
  //     obsoletos tras guardar. Pasan directo al network.
  if (url.pathname.startsWith('/api/')) return

  const isStaticAsset = STATIC_ASSETS.includes(url.pathname) ||
    /\.(png|jpg|jpeg|gif|svg|ico|woff2?|css|js)$/.test(url.pathname)

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
    const fetchOpts = request.mode === 'navigate'
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

async function openNotificationUrl(url) {
  const clientList = await clients.matchAll({ type: 'window', includeUncontrolled: true })
  for (const client of clientList) {
    if (client.url === url && 'focus' in client) {
      return client.focus()
    }
  }
  if (clients.openWindow) {
    return clients.openWindow(url)
  }
}

self.addEventListener('notificationclick', function(event) {
  const notification = event.notification
  const action = event.action
  const tag = notification.tag || ''
  const data = notification.data || {}

  // Acción "Resolver": marca la entrega como resuelta vía la API, sin abrir la app.
  if (action === 'resolve') {
    notification.close()
    const match = tag.match(/^undeliverable-(.+)$/)
    const id = match ? match[1] : data.id
    event.waitUntil(
      (async () => {
        try {
          if (!id) return openNotificationUrl(data.url || '/')
          const res = await fetch('/api/integraciones/whatsapp-negocio/no-entregables', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, origen: 'notificacion' }),
          })
          if (!res.ok) {
            // Sesión caducada o error: abrir la app para resolverla a mano.
            return openNotificationUrl(data.url || '/')
          }
        } catch (e) {
          return openNotificationUrl(data.url || '/')
        }
        // Avisar a la app abierta para refrescar badge y lista al instante.
        const clientList = await clients.matchAll({ type: 'window', includeUncontrolled: true })
        clientList.forEach((client) => client.postMessage({ type: 'UNDELIVERABLE_RESOLVED', id }))
      })()
    )
    return
  }

  // Acción "Enviar email": abre el cliente de correo con el email del contacto
  // (mailto:). El SW no puede abrir mailto: directamente, así que se lo pide a la
  // página abierta; si la app está cerrada, abre la vista donde está el contacto.
  if (action === 'email') {
    notification.close()
    event.waitUntil(
      (async () => {
        if (data.email) {
          const subject = encodeURIComponent('Contacto pendiente — WhatsApp no entregable')
          const mailtoUrl = `mailto:${data.email}?subject=${subject}`
          const clientList = await clients.matchAll({ type: 'window', includeUncontrolled: true })
          const target = clientList.find((c) => c.url && c.url.startsWith(self.location.origin)) || clientList[0]
          if (target) {
            target.postMessage({ type: 'OPEN_MAILTO', url: mailtoUrl })
            if ('focus' in target) return target.focus()
            return
          }
        }
        // Sin email registrado o sin app abierta: ir donde está el contacto con su mailto.
        return openNotificationUrl('/dashboard/configuracion/whatsapp-negocio')
      })()
    )
    return
  }

  // Clic simple: abrir la conversación (o la app).
  notification.close()
  event.waitUntil(openNotificationUrl(data.url || '/'))
})
