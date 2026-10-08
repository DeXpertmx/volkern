#!/usr/bin/env node
/**
 * Capturas del módulo Real Estate para el documento técnico.
 *
 * Entra con una cuenta real del entorno indicado y guarda una imagen por
 * sección en docs/img/real-estate-tecnico/ + un manifest.json con el orden,
 * el título y la ruta de cada una (lo consume generar-pdf-tecnico-real-estate.cjs).
 *
 * Además deja los feeds reales de exportación (Idealista XML y Fotocasa CSV)
 * junto a las capturas, para poder citarlos sin recortes en el documento:
 *   · idealista.xml
 *   · fotocasa.csv
 *   · idealista.resumen.txt   (cabecera del XML, para incrustar en el PDF)
 *
 * Uso:
 *   DEMO_RE_PASSWORD='…' node scripts/capturar-pantallas-real-estate.cjs
 *
 * Variables (todas opcionales salvo la contraseña):
 *   DEMO_RE_PASSWORD   contraseña de la cuenta de captura (obligatoria)
 *   REAL_ESTATE_BASE_URL  origen a capturar (def. https://demo-real-estate.volkern.app)
 *   REAL_ESTATE_EMAIL     cuenta con la que entrar (def. admin@demorealestate.com)
 *   REAL_ESTATE_PORTAL    slug del portal público (def. demo-real-estate)
 *   REAL_ESTATE_DSF       deviceScaleFactor (def. 2; 1 = imágenes más ligeras)
 *   REAL_ESTATE_SOLO      lista de ids separados por coma para capturar solo esos
 *
 * Nunca commitear la contraseña: se lee del entorno, igual que en
 * scripts/seed-demo-real-estate.ts.
 */
const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require('puppeteer');

const RAIZ = path.join(__dirname, '..');
const SALIDA = path.join(RAIZ, 'docs', 'img', 'real-estate-tecnico');

const BASE = (process.env.REAL_ESTATE_BASE_URL || 'https://demo-real-estate.volkern.app').replace(/\/+$/, '');
const EMAIL = process.env.REAL_ESTATE_EMAIL || 'admin@demorealestate.com';
const PASSWORD = process.env.DEMO_RE_PASSWORD;
const PORTAL = process.env.REAL_ESTATE_PORTAL || 'demo-real-estate';
const DSF = Number(process.env.REAL_ESTATE_DSF || 2);
const SOLO = (process.env.REAL_ESTATE_SOLO || '').split(',').map((s) => s.trim()).filter(Boolean);

const ANCHO = 1440;
const ALTO = 900;

/**
 * Cada captura: id (nombre de archivo), título para el documento y ruta.
 * `accion` es un paso previo opcional (abrir un filtro, un diálogo…) que se
 * ejecuta antes de disparar la foto.
 */
const PAGINAS = [
  { id: '01-dashboard', titulo: 'Dashboard inmobiliario', ruta: '/dashboard/real-estate' },
  {
    id: '02-propiedades',
    titulo: 'Propiedades (listado operativo)',
    ruta: '/dashboard/real-estate/properties',
  },
  {
    id: '03-propiedades-filtros',
    titulo: 'Propiedades · filtros avanzados',
    ruta: '/dashboard/real-estate/properties',
    accion: async (page) => {
      await pulsarTexto(page, 'Filtros');
    },
  },
  {
    id: '04-nueva-propiedad',
    titulo: 'Alta rápida de propiedad (con certificación energética)',
    ruta: '/dashboard/real-estate/properties',
    accion: async (page) => {
      await pulsarTexto(page, 'Nueva Propiedad');
      await page.waitForSelector('[role="dialog"]', { timeout: 15000 });
    },
  },
  {
    id: '05-propietario',
    titulo: 'Ficha del propietario desde el listado (OwnerCard)',
    ruta: '/dashboard/real-estate/properties',
    accion: async (page) => {
      // El botón de la ficha del propietario solo aparece al pasar por encima
      // de la fila: primero el hover, luego el clic en el icono de usuario.
      await page.hover('tbody tr');
      await page.evaluate(() => {
        const b = document.querySelector('button[title="Ver propietario"]');
        if (b) b.click();
      });
      await page.waitForSelector('[role="dialog"]', { timeout: 15000 });
      await dormir(1200);
    },
  },
  { id: '06-catalogo', titulo: 'El inmueble en el Catálogo (tipo inmueble)', ruta: '/dashboard/catalogo?tipo=inmueble' },
  { id: '07-campos', titulo: 'Campos personalizados del inmueble (preset)', ruta: '/dashboard/catalogo/campos' },
  { id: '08-pipeline', titulo: 'Pipeline de venta de propiedades', ruta: '/dashboard/pipeline' },
  {
    id: '09-config-general',
    titulo: 'Configuración inmobiliaria · General',
    ruta: '/dashboard/configuracion/real-estate',
  },
  {
    id: '10-config-portal',
    titulo: 'Configuración · Portal público',
    ruta: '/dashboard/configuracion/real-estate?tab=portal',
  },
  {
    id: '11-config-comisiones',
    titulo: 'Configuración · Comisiones',
    ruta: '/dashboard/configuracion/real-estate?tab=commissions',
  },
  {
    id: '12-config-exportacion',
    titulo: 'Configuración · Exportación a portales',
    ruta: '/dashboard/configuracion/real-estate?tab=export',
  },
  {
    id: '13-portal-publico',
    titulo: 'Portal público de propiedades',
    ruta: `/p/${PORTAL}/propiedades`,
  },
  { id: '15-landing', titulo: 'Página comercial del vertical', ruta: '/soluciones/real-estate' },
];

if (!PASSWORD) {
  console.error('❌ Define DEMO_RE_PASSWORD en el entorno (nunca la dejes en el repositorio).');
  process.exit(1);
}

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

/** Pulsa el primer botón cuyo texto coincida exactamente con `texto`. */
async function pulsarTexto(page, texto) {
  const pulsado = await page.evaluate((t) => {
    const b = [...document.querySelectorAll('button, a')].find((x) => (x.textContent || '').trim() === t);
    if (!b) return false;
    b.click();
    return true;
  }, texto);
  if (!pulsado) throw new Error(`No encontré el control «${texto}» para preparar la captura.`);
  await dormir(900);
}

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

    const plano = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    document.querySelectorAll('body *').forEach((el) => {
      if (getComputedStyle(el).position !== 'fixed') return;
      const texto = plano(el.textContent);
      const clases = (el.className || '').toString();
      // Widget de soporte de terceros (overlay fijo cuya única copia es una duda).
      if (texto.includes('tienes dudas')) return el.remove();
      // Guía flotante de la propia app (components/guide/VolkernGuide.tsx): un
      // botón de ayuda que no es parte de ninguna pantalla del módulo.
      if (clases.includes('bottom-8') && clases.includes('right-8')) return el.remove();
      // Red de seguridad si el permiso de notificaciones no se pudiera conceder.
      if (clases.includes('bottom-4') && clases.includes('right-4')) return el.remove();
      if (texto.includes('no te pierdas nada')) el.remove();
    });
  }).catch(() => {});
}

async function entrar(page) {
  await page.goto(`${BASE}/auth/login`, { waitUntil: 'domcontentloaded', timeout: 60000 });

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

/**
 * Descarga autenticada de los feeds de exportación usando la propia sesión del
 * navegador, y deja en disco solo lo que el documento necesita citar.
 */
async function guardarFeeds(page) {
  const descargas = [
    { url: '/api/real-estate/export?format=xml', archivo: 'idealista.xml' },
    { url: '/api/real-estate/export?format=csv', archivo: 'fotocasa.csv' },
  ];

  for (const d of descargas) {
    try {
      const texto = await page.evaluate(async (url) => {
        const res = await fetch(url, { credentials: 'include' });
        return res.ok ? await res.text() : `ERROR ${res.status}`;
      }, d.url);
      if (texto.startsWith('ERROR')) {
        console.warn(`   ⚠️  ${d.archivo}: ${texto}`);
        continue;
      }
      fs.writeFileSync(path.join(SALIDA, d.archivo), texto, 'utf8');
      console.log(`   · ${d.archivo} (${(texto.length / 1024).toFixed(1)} KB)`);
    } catch (e) {
      console.warn(`   ⚠️  ${d.archivo}: ${e.message}`);
    }
  }

  // Resumen legible del XML: primeras etiquetas de inmueble, para el PDF.
  const xmlPath = path.join(SALIDA, 'idealista.xml');
  if (fs.existsSync(xmlPath)) {
    const xml = fs.readFileSync(xmlPath, 'utf8');
    const cabecera = xml.split('\n').slice(0, 22).join('\n');
    fs.writeFileSync(path.join(SALIDA, 'idealista.resumen.txt'), cabecera + '\n', 'utf8');
  }
}

/** Primera propiedad publicada, para capturar su ficha pública. */
async function primeraPropiedad(page) {
  return page.evaluate(async () => {
    const res = await fetch('/api/real-estate/properties?limit=1', { credentials: 'include' });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.properties?.[0]?.id || null;
  });
}

async function main() {
  fs.mkdirSync(SALIDA, { recursive: true });

  const pendientes = SOLO.length ? PAGINAS.filter((p) => SOLO.includes(p.id)) : PAGINAS;
  if (!pendientes.length) {
    console.error(`❌ REAL_ESTATE_SOLO no coincide con ninguna captura: ${PAGINAS.map((p) => p.id).join(', ')}`);
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
        localStorage.setItem('theme', 'light');
        localStorage.setItem('volkern_consent', JSON.stringify({
          preferences: { necessary: true, analytics: false, marketing: false, functional: false },
          action: 'rejected',
          timestamp: new Date().toISOString(),
        }));
        localStorage.setItem('push_prompt_dismissed', '1');
        // El briefing de Gemma (components/dashboard/MorningBriefingModal.tsx) se
        // abre una vez al día y taparía el dashboard: lo damos por visto hoy.
        localStorage.setItem('last_morning_briefing', new Date().toDateString());
      } catch {}
    });

    console.log(`→ Entrando en ${BASE} como ${EMAIL} …`);
    await entrar(page);
    console.log('✓ Sesión iniciada');

    // La ficha pública de una propiedad real se captura al final: primero hay
    // que averiguar qué id publica este tenant.
    const propiedadId = await primeraPropiedad(page);

    for (const pagina of pendientes) {
      const url = `${BASE}${pagina.ruta}`;
      process.stdout.write(`   · ${pagina.id} — ${pagina.titulo} … `);
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 90000 }).catch(async (e) => {
        console.warn(`\n     ⚠️  ${e.message.split('\n')[0]} (sigo con la captura)`);
      });
      await page.waitForNetworkIdle({ idleTime: 1200, timeout: 20000 }).catch(() => {});
      await page.evaluate(() => document.fonts && document.fonts.ready).catch(() => {});
      await dormir(4000);

      if (pagina.accion) {
        await pagina.accion(page).catch((e) => console.warn(`\n     ⚠️  ${e.message} (captura sin el paso previo)`));
        await page.evaluate(() => document.fonts && document.fonts.ready).catch(() => {});
      }

      await limpiarAvisos(page);
      await dormir(300);

      const archivo = path.join(SALIDA, `${pagina.id}.jpg`);
      await page.screenshot({ path: archivo, type: 'jpeg', quality: 80, captureBeyondViewport: false });

      const kb = (fs.statSync(archivo).size / 1024).toFixed(0);
      manifest.push({ ...pagina, accion: undefined, archivo: path.relative(path.join(RAIZ, 'docs'), archivo).replace(/\\/g, '/') });
      console.log(`guardada (${kb} KB)`);
    }

    // ── Ficha pública de un inmueble real ──────────────────────────────────
    if (!SOLO.length || SOLO.includes('14-portal-detalle')) {
      if (propiedadId) {
        process.stdout.write('   · 14-portal-detalle — Ficha pública de un inmueble … ');
        const ruta = `/p/${PORTAL}/propiedades/${propiedadId}`;
        await page.goto(`${BASE}${ruta}`, { waitUntil: 'networkidle2', timeout: 90000 }).catch(() => {});
        await page.waitForNetworkIdle({ idleTime: 1200, timeout: 20000 }).catch(() => {});
        await dormir(4000);
        await limpiarAvisos(page);
        const archivo = path.join(SALIDA, '14-portal-detalle.jpg');
        await page.screenshot({ path: archivo, type: 'jpeg', quality: 80, captureBeyondViewport: false });
        manifest.push({
          id: '14-portal-detalle',
          titulo: 'Ficha pública del inmueble',
          ruta,
          archivo: path.relative(path.join(RAIZ, 'docs'), archivo).replace(/\\/g, '/'),
        });
        console.log(`guardada (${(fs.statSync(archivo).size / 1024).toFixed(0)} KB)`);
      } else {
        console.warn('   ⚠️  No pude resolver ninguna propiedad para la ficha pública: me la salto.');
      }
    }

    console.log('→ Feeds de exportación …');
    await guardarFeeds(page);
  } finally {
    await navegador.close();
  }

  // El orden del manifest es el de los ids (01, 02, …), sin depender del
  // orden en que se hayan capturado.
  const capturas = [...manifest].sort((a, b) => a.id.localeCompare(b.id));

  const manifestPath = path.join(SALIDA, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify({ base: BASE, generadoEn: new Date().toISOString(), capturas }, null, 2) + '\n', 'utf8');
  console.log(`\n✓ ${capturas.length} capturas en ${path.relative(RAIZ, SALIDA)}`);
  console.log(`✓ Manifest: ${path.relative(RAIZ, manifestPath)}`);
}

main().catch((e) => {
  console.error('\n❌ Capturas interrumpidas:', e.message);
  process.exit(1);
});
