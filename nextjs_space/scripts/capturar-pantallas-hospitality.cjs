#!/usr/bin/env node
/**
 * Capturas del módulo Hospitality para el documento técnico.
 *
 * Entra con una cuenta real del entorno indicado y guarda una imagen por
 * sección en docs/img/hospitality-tecnico/ + un manifest.json con el orden,
 * el título y la ruta de cada una (lo consume generar-pdf-tecnico-hospitality.cjs).
 *
 * Uso:
 *   DEMO_RE_PASSWORD='…' node scripts/capturar-pantallas-hospitality.cjs
 *
 * Variables (todas opcionales salvo la contraseña):
 *   DEMO_RE_PASSWORD      contraseña de la cuenta de captura (obligatoria)
 *   HOSPITALITY_BASE_URL  origen a capturar (def. https://demo-real-estate.volkern.app)
 *   HOSPITALITY_EMAIL     cuenta con la que entrar (def. admin@demorealestate.com)
 *   HOSPITALITY_BOOKING   slug público del booking engine (def. volkern-demo)
 *   HOSPITALITY_DSF       deviceScaleFactor (def. 2; 1 = imágenes más ligeras)
 *   HOSPITALITY_SOLO      lista de ids separados por coma para capturar solo esos
 *
 * Nunca commitear la contraseña: se lee del entorno, igual que en
 * scripts/seed-demo-real-estate.ts.
 */
const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require('puppeteer');

const RAIZ = path.join(__dirname, '..');
const SALIDA = path.join(RAIZ, 'docs', 'img', 'hospitality-tecnico');

const BASE = (process.env.HOSPITALITY_BASE_URL || 'https://demo-real-estate.volkern.app').replace(/\/+$/, '');
const EMAIL = process.env.HOSPITALITY_EMAIL || 'admin@demorealestate.com';
const PASSWORD = process.env.DEMO_RE_PASSWORD;
const BOOKING_SLUG = process.env.HOSPITALITY_BOOKING || 'volkern-demo';
const DSF = Number(process.env.HOSPITALITY_DSF || 2);
const SOLO = (process.env.HOSPITALITY_SOLO || '').split(',').map((s) => s.trim()).filter(Boolean);

const ANCHO = 1440;
const ALTO = 900;

/** Cada captura: id (nombre de archivo), título para el documento y ruta. */
const PAGINAS = [
  { id: '01-inicio', titulo: 'Inicio · Resumen del día', ruta: '/dashboard/hospitality' },
  { id: '02-propiedades', titulo: 'Propiedades y unidades', ruta: '/dashboard/hospitality?tab=propiedades' },
  { id: '03-onboarding', titulo: 'Puesta en marcha (onboarding)', ruta: '/dashboard/hospitality/onboarding' },
  { id: '04-dashboard', titulo: 'Dashboard operativo', ruta: '/dashboard/hospitality/dashboard' },
  { id: '05-planning', titulo: 'Planning (calendario por unidad)', ruta: '/dashboard/hospitality/calendar' },
  { id: '06-operaciones', titulo: 'Operaciones (vista del planning)', ruta: '/dashboard/hospitality/calendar?vista=operaciones' },
  { id: '07-reservas', titulo: 'Reservas', ruta: '/dashboard/hospitality/reservas' },
  { id: '08-viajeros', titulo: 'Registro de viajeros (RH/PV)', ruta: '/dashboard/hospitality/viajeros' },
  { id: '09-tarifas', titulo: 'Tarifas y planes de tarifa', ruta: '/dashboard/hospitality/tarifas' },
  { id: '10-booking-engine', titulo: 'Booking Engine (configuración)', ruta: '/dashboard/hospitality/booking-engine' },
  { id: '11-huespedes', titulo: 'Huéspedes', ruta: '/dashboard/hospitality/huespedes' },
  { id: '12-comunicaciones', titulo: 'Comunicaciones al huésped', ruta: '/dashboard/hospitality/comunicaciones' },
  { id: '13-automatizaciones', titulo: 'Automatizaciones', ruta: '/dashboard/hospitality/automatizaciones' },
  { id: '14-finanzas', titulo: 'Finanzas de la reserva', ruta: '/dashboard/hospitality/finanzas' },
  { id: '15-reportes', titulo: 'Reportes', ruta: '/dashboard/hospitality/reportes' },
  { id: '16-roles', titulo: 'Equipo y roles', ruta: '/dashboard/hospitality/roles' },
  { id: '17-booking-publico', titulo: 'Motor de reserva directa (página pública)', ruta: `/reservar/${BOOKING_SLUG}` },
];

if (!PASSWORD) {
  console.error('❌ Define DEMO_RE_PASSWORD en el entorno (nunca la dejes en el repositorio).');
  process.exit(1);
}

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Quita de la captura lo que no es el módulo: toasts de la app y los widgets
 * flotantes de terceros (soporte «¿Aún tienes dudas?»), que no forman parte de
 * ninguna pantalla y tapan el contenido.
 */
async function limpiarAvisos(page) {
  await page.evaluate(() => {
    const selectores = [
      '[data-sonner-toaster]',
      '[data-radix-toast-viewport]',
      'section[aria-label*="otification" i]',
    ];
    selectores.forEach((sel) => document.querySelectorAll(sel).forEach((el) => el.remove()));

    // Widget de soporte: overlay fijo cuyo texto es una duda al usuario.
    const plano = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    document.querySelectorAll('body *').forEach((el) => {
      if (getComputedStyle(el).position !== 'fixed') return;
      if (plano(el.textContent).includes('tienes dudas')) el.remove();
    });
  }).catch(() => {});
}

async function entrar(page) {
  await page.goto(`${BASE}/auth/login`, { waitUntil: 'domcontentloaded', timeout: 60000 });

  // Red de seguridad: si el banner de cookies apareciera igualmente (clave de
  // consentimiento renombrada), lo cerramos antes de continuar.
  await dormir(900);
  for (const texto of ['Aceptar Todas', 'Rechazar']) {
    const boton = await page.evaluate((t) => {
      const b = [...document.querySelectorAll('button')].find((x) => (x.textContent || '').trim() === t);
      if (!b) return false;
      b.click();
      return true;
    }, texto);
    if (boton) break;
  }

  await page.waitForSelector('input[type="email"]', { timeout: 30000 });
  await page.type('input[type="email"]', EMAIL, { delay: 12 });
  await page.type('input[type="password"]', PASSWORD, { delay: 12 });
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {}),
    page.click('button[type="submit"]').catch(async () => {
      const idx = await page.evaluate(() => {
        const b = [...document.querySelectorAll('button')].find((x) => /iniciar sesión|entrar/i.test(x.textContent || ''));
        if (!b) return false;
        b.click();
        return true;
      });
      if (!idx) throw new Error('No encontré el botón de iniciar sesión.');
    }),
  ]);

  await page.waitForFunction(() => location.pathname.startsWith('/dashboard'), { timeout: 45000 });
}

async function main() {
  fs.mkdirSync(SALIDA, { recursive: true });

  const pendientes = SOLO.length ? PAGINAS.filter((p) => SOLO.includes(p.id)) : PAGINAS;
  if (!pendientes.length) {
    console.error(`❌ HOSPITALITY_SOLO no coincide con ninguna captura: ${PAGINAS.map((p) => p.id).join(', ')}`);
    process.exit(1);
  }

  const navegador = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars'],
  });

  // Con el permiso de notificaciones concedido, la app no dibuja ni el prompt
  // «¡No te pierdas nada!» ni el aviso rojo de «Notificaciones bloqueadas»
  // (components/notifications/PushPrompt.tsx y PushNotificationInit.tsx).
  await navegador.defaultBrowserContext()
    .overridePermissions(BASE, ['notifications'])
    .catch((e) => console.warn(`⚠️  No pude conceder el permiso de notificaciones: ${e.message}`));

  const manifest = [];
  try {
    const page = await navegador.newPage();
    await page.setViewport({ width: ANCHO, height: ALTO, deviceScaleFactor: DSF });
    await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
    // next-themes guarda la preferencia en localStorage: fijarla antes de que
    // arranque la app hace que las capturas salgan en claro (imprimibles).
    await page.evaluateOnNewDocument(() => {
      try {
        // Claro por defecto (next-themes) para que las capturas sean imprimibles.
        localStorage.setItem('theme', 'light');
        // Consentimiento ya decidido: sin él, el banner de cookies (clave
        // 'volkern_consent' de components/public/CookieConsentBanner.tsx)
        // tapa el pie de cada captura.
        localStorage.setItem('volkern_consent', JSON.stringify({
          preferences: { necessary: true, analytics: false, marketing: false, functional: false },
          action: 'rejected',
          timestamp: new Date().toISOString(),
        }));
        // Red de seguridad por si el permiso de notificaciones no se pudiera conceder.
        localStorage.setItem('push_prompt_dismissed', '1');
      } catch {}
    });

    console.log(`→ Entrando en ${BASE} como ${EMAIL} …`);
    await entrar(page);
    console.log('✓ Sesión iniciada');

    for (const pagina of pendientes) {
      const url = `${BASE}${pagina.ruta}`;
      process.stdout.write(`   · ${pagina.id} — ${pagina.titulo} … `);
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 90000 }).catch(async (e) => {
        console.warn(`\n     ⚠️  ${e.message.split('\n')[0]} (sigo con la captura)`);
      });
      // Las páginas cargan sus datos por fetch después de montar: esperamos a
      // que la red se quede quieta y dejamos un margen para el último render.
      await page.waitForNetworkIdle({ idleTime: 1200, timeout: 20000 }).catch(() => {});
      await page.evaluate(() => document.fonts && document.fonts.ready).catch(() => {});
      await dormir(5000);
      await limpiarAvisos(page);
      await dormir(300);

      const archivo = path.join(SALIDA, `${pagina.id}.jpg`);
      await page.screenshot({ path: archivo, type: 'jpeg', quality: 80, captureBeyondViewport: false });

      const kb = (fs.statSync(archivo).size / 1024).toFixed(0);
      manifest.push({ ...pagina, archivo: path.relative(path.join(RAIZ, 'docs'), archivo).replace(/\\/g, '/') });
      console.log(`guardada (${kb} KB)`);
    }
  } finally {
    await navegador.close();
  }

  const manifestPath = path.join(SALIDA, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify({ base: BASE, generadoEn: new Date().toISOString(), capturas: manifest }, null, 2) + '\n', 'utf8');
  console.log(`\n✓ ${manifest.length} capturas en ${path.relative(RAIZ, SALIDA)}`);
  console.log(`✓ Manifest: ${path.relative(RAIZ, manifestPath)}`);
}

main().catch((e) => {
  console.error('\n❌ Capturas interrumpidas:', e.message);
  process.exit(1);
});
