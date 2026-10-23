#!/usr/bin/env node
/**
 * Capturas reales del CRM & Ventas para el dossier comercial.
 *
 * Entra en el tenant de demostración (`scripts/seed-demo-crm-ventas.ts`) y
 * guarda una imagen por pantalla. No usa maquetas ni HTML inventado: es el
 * panel real, con datos de demostración.
 *
 * Uso:
 *   DEMO_CRM_PASSWORD='…' node scripts/capturar-pantallas-crm-ventas.cjs
 *
 * Variables:
 *   DEMO_CRM_PASSWORD  contraseña del usuario demo (obligatoria)
 *   CRM_BASE_URL       origen (def. http://127.0.0.1:3000)
 *   CRM_DSF            deviceScaleFactor (def. 2)
 *   CRM_SOLO           captura solo las pantallas cuyo id contenga este texto
 */
const fs = require('node:fs')
const path = require('node:path')
const puppeteer = require('puppeteer')

const RAIZ = path.join(__dirname, '..')
const SALIDA = path.join(RAIZ, 'documentacion_comercial', 'img', 'crm-ventas')
const MANIFIESTO = path.join(RAIZ, '.demo-crm-ventas.json')
const BASE = (process.env.CRM_BASE_URL || 'http://127.0.0.1:3000').replace(/\/+$/, '')
const PASSWORD = process.env.DEMO_CRM_PASSWORD
const DSF = Number(process.env.CRM_DSF || 2)

if (!PASSWORD) {
  console.error('❌ Define DEMO_CRM_PASSWORD (la misma del seed) antes de capturar.')
  process.exit(1)
}

if (!fs.existsSync(MANIFIESTO)) {
  console.error('❌ Falta .demo-crm-ventas.json. Ejecuta antes scripts/seed-demo-crm-ventas.ts.')
  process.exit(1)
}

const datos = JSON.parse(fs.readFileSync(MANIFIESTO, 'utf8'))
const dormir = (ms) => new Promise((r) => setTimeout(r, ms))

const PANTALLAS = [
  {
    id: '01-embudo',
    ruta: '/dashboard/pipeline',
    listo: 'Clínica Sana',
  },
  {
    id: '02-ficha-oportunidad',
    ruta: `/dashboard/pipeline/${datos.dealId}`,
    listo: 'Timeline de la Oportunidad',
    // El coach de Gemma consulta a la IA y tarda más que el resto de la ficha.
    // Sin esperar, la captura sale con los esqueletos de carga.
    sinEsqueletos: true,
  },
  {
    id: '03-tareas',
    ruta: '/dashboard/tareas',
    listo: 'Llamar al socio financiero',
  },
  {
    id: '04-pronosticos',
    ruta: '/dashboard/ventas/pronosticos',
    listo: 'Pipeline Total',
  },
  {
    id: '05-automatizaciones',
    ruta: '/dashboard/automatizaciones',
    listo: 'Lead nuevo',
  },
  {
    id: '06-cotizaciones',
    ruta: '/dashboard/cotizaciones',
    listo: 'COT-2026-041',
  },
]

async function quitarAvisos(page) {
  await page.evaluate(() => {
    for (const el of document.querySelectorAll('div, button')) {
      const texto = (el.textContent || '').trim()
      if (
        texto.startsWith('Notificaciones bloqueadas') ||
        texto.startsWith('Activar notificaciones') ||
        texto === 'Freebuff'
      ) {
        el.remove()
      }
    }
  })
}

async function main() {
  fs.mkdirSync(SALIDA, { recursive: true })

  const navegador = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none'],
  })

  try {
    const contexto = navegador.defaultBrowserContext()
    await contexto.overridePermissions(BASE, ['notifications'])

    const page = await navegador.newPage()
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: DSF })

    // El layout del panel consulta mensajes, integraciones y notificaciones en
    // cada navegación; en dev esas llamadas se acumulan y llegan a bloquear la
    // pantalla que se quiere fotografiar. No aportan nada a la captura.
    const IGNORADOS = ['/api/mensajes/', '/api/integraciones/', '/api/notifications', '/api/users/me/push-subscription']
    await page.setRequestInterception(true)
    page.on('request', (req) => {
      const url = req.url()
      if (IGNORADOS.some((parte) => url.includes(parte))) req.abort()
      else req.continue()
    })

    // El banner de cookies se monta 500 ms después y taparía la parte baja de
    // la captura. Se deja la decisión guardada antes de cargar cualquier página.
    await page.evaluateOnNewDocument(() => {
      localStorage.setItem(
        'volkern_consent',
        JSON.stringify({
          preferences: { necessary: true, analytics: false, marketing: false, functional: false },
          action: 'rejected',
          timestamp: new Date().toISOString(),
        }),
      )
      // El briefing matinal abre un diálogo encima del embudo. Ya se ha visto
      // hoy, así que la captura del pipeline sale limpia.
      localStorage.setItem('last_morning_briefing', new Date().toDateString())
    })

    console.log('→ Iniciando sesión en el tenant demo…')

    // El formulario de login deja el botón en «Iniciando sesión…» cuando el
    // `router.push` del cliente no completa la transición en dev. Se autentica
    // con el mismo endpoint de NextAuth desde la propia página y se navega al
    // panel con la cookie de sesión ya establecida.
    await page.goto(`${BASE}/auth/login`, { waitUntil: 'domcontentloaded', timeout: 120000 })
    await page.waitForSelector('input[type="email"]', { timeout: 30000 })

    const login = await page.evaluate(async (email, password) => {
      const { csrfToken } = await fetch('/api/auth/csrf').then((r) => r.json())
      const res = await fetch('/api/auth/callback/credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ csrfToken, email, password, json: 'true' }),
      })
      return { ok: res.ok, status: res.status }
    }, datos.email, PASSWORD)

    if (!login.ok) throw new Error(`El login devolvió HTTP ${login.status}`)

    await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded', timeout: 120000 })
    await dormir(5000)

    if (!page.url().includes('/dashboard')) {
      throw new Error(`El login no llegó al panel (URL: ${page.url()})`)
    }

    console.log('   ✓ Sesión iniciada')

    const solo = process.env.CRM_SOLO
    const pantallas = solo ? PANTALLAS.filter((p) => p.id.includes(solo)) : PANTALLAS
    if (!pantallas.length) throw new Error(`Ninguna pantalla coincide con CRM_SOLO=${solo}`)

    for (const pantalla of pantallas) {
      console.log(`→ Capturando ${pantalla.id}…`)
      let ok = false

      // El primer render en dev puede coincidir con una compilación y dejar la
      // pantalla vacía. Se reintenta una vez antes de dar la captura por buena.
      for (let intento = 0; intento < 2 && !ok; intento++) {
        await page.goto(`${BASE}${pantalla.ruta}`, { waitUntil: 'domcontentloaded', timeout: 120000 })
        try {
          await page.waitForFunction(
            (texto) => document.body.innerText.includes(texto),
            { timeout: 45000 },
            pantalla.listo,
          )
          ok = true
        } catch {
          console.warn(`   ↻ ${pantalla.id} aún no tenía datos; reintentando…`)
          await dormir(2500)
        }
      }

      if (!ok) throw new Error(`No aparecieron los datos de ${pantalla.id}`)

      if (pantalla.sinEsqueletos) {
        try {
          await page.waitForFunction(
            () => document.querySelectorAll('.animate-pulse').length === 0,
            { timeout: 60000 },
          )
        } catch {
          console.warn(`   ! ${pantalla.id} sigue con esqueletos de carga; se captura igual`)
        }
      }

      await dormir(2000)
      await quitarAvisos(page)
      await page.evaluate(() => window.scrollTo(0, 0))
      await dormir(400)

      const archivo = path.join(SALIDA, `${pantalla.id}.jpg`)
      await page.screenshot({ path: archivo, type: 'jpeg', quality: 90 })
      console.log(`   ✓ ${path.relative(RAIZ, archivo)}`)
    }
  } finally {
    await navegador.close()
  }
}

main().catch((e) => {
  console.error('❌ Error capturando el CRM:', e.message)
  process.exit(1)
})
