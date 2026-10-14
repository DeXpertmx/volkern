#!/usr/bin/env node
/**
 * Documento técnico del módulo Hospitality — HTML para imprimir a PDF con
 * Chrome headless, igual que el brochure comercial y la guía de usuario.
 *
 * Lee las capturas de docs/img/hospitality-tecnico/ (las produce
 * scripts/capturar-pantallas-hospitality.cjs) y escribe:
 *   · /tmp/hospitality-tecnico.html   (intermedio, para retocar a mano)
 *   · docs/hospitality-tecnico.pdf
 *
 * Uso: node scripts/generar-pdf-tecnico-hospitality.cjs
 */
const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require('puppeteer');

const RAIZ = path.join(__dirname, '..');
const IMG_DIR = path.join(RAIZ, 'docs', 'img', 'hospitality-tecnico');
const HTML_SALIDA = '/tmp/hospitality-tecnico.html';
const PDF_SALIDA = path.join(RAIZ, 'docs', 'hospitality-tecnico.pdf');

const manifest = JSON.parse(fs.readFileSync(path.join(IMG_DIR, 'manifest.json'), 'utf8'));
const porId = new Map(manifest.capturas.map((c) => [c.id, c]));

function datosImagen(id) {
  const captura = porId.get(id);
  if (!captura) throw new Error(`Falta la captura «${id}» en el manifest. Ejecuta antes capturar-pantallas-hospitality.cjs.`);
  return `data:image/jpeg;base64,${fs.readFileSync(path.join(RAIZ, 'docs', captura.archivo)).toString('base64')}`;
}

/** Figura con su pie; el pie por defecto es el título del manifest. */
function figura(id, pie) {
  const captura = porId.get(id);
  return `
    <figure class="captura">
      <img src="${datosImagen(id)}" alt="${captura.titulo}">
      <figcaption>${pie || captura.titulo} <span class="ruta">${captura.ruta}</span></figcaption>
    </figure>`;
}

const fechaCapturas = new Date(manifest.generadoEn).toISOString().slice(0, 10);
const origenCapturas = manifest.base.replace(/^https?:\/\//, '');

const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Volkern Hospitality — Documento técnico</title>
<style>
  @page { size: A4; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body {
    font-family: 'Inter', 'Segoe UI', 'Noto Sans', 'DejaVu Sans', Arial, sans-serif;
    color: #1e293b; font-size: 9.3pt; line-height: 1.5;
  }
  h1 { font-size: 24pt; line-height: 1.15; color: #0f172a; }
  h2 { font-size: 15pt; color: #1e1b4b; margin: 0 0 3mm; padding-bottom: 1.6mm; border-bottom: 2px solid #e2e8f0; }
  h3 { font-size: 10.8pt; color: #1e1b4b; margin: 4.5mm 0 1.6mm; }
  h4 { font-size: 9.6pt; color: #334155; margin: 3.2mm 0 1.2mm; }
  p { margin-bottom: 2.4mm; }
  ul, ol { margin: 0 0 2.4mm 4.5mm; }
  li { margin-bottom: 1.1mm; }
  code { font-family: 'DejaVu Sans Mono', 'SFMono-Regular', Consolas, monospace; font-size: 8.4pt; background: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 3px; padding: 0 1mm; }
  a { color: #4338ca; text-decoration: none; }

  .kicker { text-transform: uppercase; letter-spacing: 0.2em; font-size: 7.4pt; color: #6366f1; font-weight: 700; margin-bottom: 2mm; }
  .lead { color: #475569; font-size: 9.8pt; margin-bottom: 4mm; }
  .seccion { break-before: page; }
  .seccion:first-of-type { break-before: auto; }

  /* ---------- Portada ---------- */
  .portada {
    background: linear-gradient(158deg, #0f172a 0%, #1e1b4b 58%, #312e81 100%);
    color: #fff; border-radius: 10px; padding: 16mm 14mm 12mm; margin-bottom: 7mm;
  }
  .portada .marca { letter-spacing: 0.34em; text-transform: uppercase; font-size: 9.5pt; color: #a5b4fc; }
  .portada h1 { color: #fff; margin-top: 5mm; font-size: 30pt; }
  .portada h1 span { color: #818cf8; }
  .portada .sub { color: #c7d2fe; font-size: 11.5pt; margin-top: 4mm; max-width: 150mm; line-height: 1.5; }
  .portada .chips { display: flex; flex-wrap: wrap; gap: 2.5mm; margin-top: 7mm; }
  .chip { border: 1px solid rgba(165,180,252,.45); color: #e0e7ff; border-radius: 999px; padding: 1.4mm 4mm; font-size: 8pt; }

  /* ---------- Estructura ---------- */
  .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 3mm 6mm; margin-bottom: 5mm; }
  .meta div { border-left: 2px solid #c7d2fe; padding-left: 3mm; }
  .meta b { display: block; font-size: 7.4pt; text-transform: uppercase; letter-spacing: .14em; color: #6366f1; }
  .meta span { color: #334155; }

  table { width: 100%; border-collapse: collapse; font-size: 8.1pt; margin: 2.5mm 0 3.5mm; }
  th { background: #1e1b4b; color: #fff; text-align: left; padding: 2.2mm 2.6mm; font-weight: 600; }
  td { padding: 1.9mm 2.6mm; border-bottom: 1px solid #e2e8f0; color: #334155; vertical-align: top; }
  tr:nth-child(even) td { background: #f8fafc; }
  td.c, th.c { text-align: center; }
  .si { color: #059669; font-weight: 700; }
  .no { color: #b91c1c; font-weight: 600; }

  .captura { border: 1px solid #e2e8f0; border-radius: 7px; overflow: hidden; margin: 3.5mm 0 5mm; box-shadow: 0 4px 14px rgba(15,23,42,.09); }
  .captura img { width: 100%; display: block; }
  .captura figcaption { font-size: 7.4pt; color: #64748b; padding: 1.8mm 2.4mm; border-top: 1px solid #e2e8f0; background: #f8fafc; }
  .captura .ruta { color: #94a3b8; font-family: 'DejaVu Sans Mono', Consolas, monospace; font-size: 6.9pt; }

  .pre {
    background: #0f172a; color: #e2e8f0; border-radius: 7px; padding: 4mm 4.5mm; margin: 3mm 0 4mm;
    font-family: 'DejaVu Sans Mono', Consolas, monospace; font-size: 7.5pt; line-height: 1.45; white-space: pre; overflow-wrap: normal;
  }
  .cols2 { display: grid; grid-template-columns: 1fr 1fr; gap: 5mm; }
  .cols3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 4mm; }
  .card { border: 1px solid #e2e8f0; border-radius: 7px; padding: 3.4mm 4mm; background: #f8fafc; }
  .card h4 { margin-top: 0; }
  .card p, .card li { font-size: 8.4pt; color: #475569; }
  .destacado { background: linear-gradient(135deg, #eef2ff, #e0e7ff); border: 1px solid #c7d2fe; border-radius: 7px; padding: 3.6mm 4.2mm; margin: 3.5mm 0; }
  .destacado b { color: #312e81; }
  .aviso { background: #fffbeb; border: 1px solid #fde68a; border-radius: 7px; padding: 3.4mm 4mm; margin: 3mm 0; font-size: 8.4pt; color: #78350f; }
  .pie-firma { margin-top: 8mm; border-top: 1px solid #e2e8f0; padding-top: 3mm; font-size: 7.6pt; color: #94a3b8; }
</style>
</head>
<body>

<!-- ══════════════ PORTADA ══════════════ -->
<div class="portada">
  <div class="marca">Volkern · Documento técnico</div>
  <h1>Módulo <span>Hospitality</span></h1>
  <p class="sub">Arquitectura, modelo de datos, flujos de integración y estado real del vertical de
  alojamiento: channel manager, motor de reserva directa, registro de viajeros y dinero por reserva.</p>
  <div class="chips">
    <span class="chip">20 modelos de datos</span>
    <span class="chip">49 rutas de API</span>
    <span class="chip">7 flujos de punta a punta</span>
    <span class="chip">Permisos por capacidad</span>
    <span class="chip">Capturas del 2026-09-28</span>
  </div>
</div>

<div class="meta">
  <div><b>Alcance</b><span>Vertical de alojamiento dentro del ERP Volkern (multi-tenant)</span></div>
  <div><b>Fuente del contenido</b><span>docs/hospitality-ficha-tecnica.md, esquema de Prisma, rutas de la API y base de producción</span></div>
  <div><b>Entorno de las capturas</b><span>${origenCapturas} · tenant «Demo Real Estate» · ${fechaCapturas}</span></div>
  <div><b>Rama</b><span>master</span></div>
</div>

<div class="aviso">
  <b>Regla de marca aplicada.</b> El proveedor externo de conectividad no se nombra en ningún punto del
  documento: se le llama <b>Capa de Conectividad</b> o <b>proveedor de conectividad</b>, igual que en el
  producto. Las contraseñas, claves y certificados no aparecen aquí.
</div>

${figura('04-dashboard', 'Vista de entrada del módulo: el dashboard operativo del alojamiento.')}

<div class="destacado">
  <b>Qué resuelve el módulo.</b> Un alojamiento tiene el calendario en un channel manager y las reservas
  repartidas entre OTAs, la web propia y el teléfono; el dinero en una hoja de cálculo y el parte de viajeros
  en el portal del Ministerio. Hospitality pone las cuatro cosas en el mismo ERP, sobre el <b>mismo motor de
  disponibilidad</b> y el <b>mismo motor de reservas</b>: lo que entra por el webhook de un canal y lo que entra
  por la web propia no son dos caminos distintos, son el mismo.
</div>

<!-- ══════════════ 1 · QUÉ ES Y ALCANCE ══════════════ -->
<section class="seccion">
  <div class="kicker">01 · Alcance</div>
  <h2>Qué es y dónde vive</h2>
  <p class="lead">El módulo de plan <code>hospitality</code> (cuenta <code>BUSINESS</code>) se monta sobre el ERP:
  no es una aplicación aparte, y por eso comparte CRM, finanzas, automatizaciones, usuarios y permisos.</p>

  <div class="cols3">
    <div class="card">
      <h4>Un solo motor de disponibilidad</h4>
      <p><code>lib/hospitality/availability.ts</code> es el único sitio que calcula qué está libre:
      reservas activas + bloqueos manuales, con la misma regla de intervalo <code>[checkIn, checkOut)</code>.
      Hay un test que lo protege de que aparezca un segundo motor.</p>
    </div>
    <div class="card">
      <h4>Un solo motor de reservas</h4>
      <p>El Reservation Engine (<code>lib/hospitality/reservations.ts</code>) es el que da de alta cualquier
      reserva, venga del webhook de un canal, de la web propia o del alta manual en el panel.</p>
    </div>
    <div class="card">
      <h4>Un solo motor de automatización</h4>
      <p>Los eventos del módulo (<code>reservation.created</code>, <code>cleaning.completed</code>…) se
      entregan al <b>AutomationRuleEngine</b> que ya usaba el resto del ERP. No hay un segundo motor.</p>
    </div>
  </div>

  <h3>Qué entra en V1</h3>
  <div class="cols2">
    <ul>
      <li>Propiedades, unidades y planes de tarifa.</li>
      <li>Planning por unidad, con bloqueos y vista de operaciones.</li>
      <li>Reservas de OTA (webhook), directas y manuales.</li>
      <li>Check-in / check-out, limpieza y mantenimiento.</li>
    </ul>
    <ul>
      <li>Motor de reserva directa público, con widget embebible.</li>
      <li>Registro de viajeros y comunicación al Ministerio (SES.Hospedajes).</li>
      <li>Comunicaciones al huésped y automatizaciones.</li>
      <li>Finanzas por reserva y reportes (ADR, RevPAR, ocupación).</li>
    </ul>
  </div>

  <h3>Qué queda declarado fuera de V1</h3>
  <p>Mark No Show, Channel Multiplier, múltiples proveedores de conectividad, browser automation, pricing
  dinámico, revenue management, POS/F&amp;B, contabilidad hotelera completa y app móvil del huésped.
  No es deuda: es alcance decidido en el plan del módulo.</p>
</section>

<!-- ══════════════ 2 · MENÚ Y PANTALLAS ══════════════ -->
<section class="seccion">
  <div class="kicker">02 · Superficie de producto</div>
  <h2>Menú del módulo y mapa de pantallas</h2>
  <p class="lead">Fuente única del menú: <code>lib/navigation-config.ts</code>. Check-in/out, mantenimiento y
  la configuración de conectividad son funcionalidades dentro de estas áreas, no entradas de menú propias.</p>

  <table>
    <thead><tr><th>#</th><th>Sección</th><th>Ruta</th></tr></thead>
    <tbody>
      <tr><td>1</td><td>Inicio</td><td><code>/dashboard/hospitality</code></td></tr>
      <tr><td>2</td><td>Puesta en marcha</td><td><code>/dashboard/hospitality/onboarding</code></td></tr>
      <tr><td>3</td><td>Dashboard</td><td><code>/dashboard/hospitality/dashboard</code></td></tr>
      <tr><td>4</td><td>Planning</td><td><code>/dashboard/hospitality/calendar</code></td></tr>
      <tr><td>5</td><td>Operaciones</td><td><code>/dashboard/hospitality/calendar?vista=operaciones</code></td></tr>
      <tr><td>6</td><td>Propiedades</td><td><code>/dashboard/hospitality?tab=propiedades</code></td></tr>
      <tr><td>7</td><td>Reservas</td><td><code>/dashboard/hospitality/reservas</code></td></tr>
      <tr><td>8</td><td>Registro de viajeros</td><td><code>/dashboard/hospitality/viajeros</code></td></tr>
      <tr><td>9</td><td>Tarifas</td><td><code>/dashboard/hospitality/tarifas</code></td></tr>
      <tr><td>10</td><td>Booking Engine</td><td><code>/dashboard/hospitality/booking-engine</code></td></tr>
      <tr><td>11</td><td>Huéspedes</td><td><code>/dashboard/hospitality/huespedes</code></td></tr>
      <tr><td>12</td><td>Comunicaciones</td><td><code>/dashboard/hospitality/comunicaciones</code></td></tr>
      <tr><td>13</td><td>Automatizaciones</td><td><code>/dashboard/hospitality/automatizaciones</code></td></tr>
      <tr><td>14</td><td>Finanzas</td><td><code>/dashboard/hospitality/finanzas</code></td></tr>
      <tr><td>15</td><td>Reportes</td><td><code>/dashboard/hospitality/reportes</code></td></tr>
      <tr><td>16</td><td>Equipo y roles</td><td><code>/dashboard/hospitality/roles</code></td></tr>
    </tbody>
  </table>
  <p>La entrada pública de la reserva directa vive fuera del panel: <code>/reservar/&lt;slug&gt;</code> por tenant
  y <code>/embed/reservar/&lt;slug&gt;</code> para incrustar el widget en la web del alojamiento.</p>

  ${figura('01-inicio', 'Inicio: el resumen del día del alojamiento, con los movimientos clave y lo pendiente.')}

  <h3>Inicio y propiedades</h3>
  <p>La propiedad es la unidad física (dirección, zona, coordenadas, fotos, zona horaria). Por debajo están las
  unidades reservables, y cada unidad puede tener varios planes de tarifa. Las fotos y el estado de cada
  propiedad se ven y se editan desde el panel.</p>
  ${figura('02-propiedades', 'Propiedades y unidades del tenant de demostración, con sus reservas asociadas.')}
</section>

<!-- ══════════════ 3 · PUESTA EN MARCHA ══════════════ -->
<section class="seccion">
  <div class="kicker">03 · Alta</div>
  <h2>Puesta en marcha</h2>
  <p class="lead">El módulo se activa en pasos: crear la propiedad, cargar unidades y tarifas, mapear con los
  canales y probar antes de abrir. La prueba de conexión, disponibilidad, tarifas y reserva se hace contra la
  Capa de Conectividad real desde esta pantalla, de modo que nadie abre con una configuración sin verificar.</p>

  ${figura('03-onboarding', 'Puesta en marcha: progreso por etapas y prueba de conexión antes de publicar.')}

  <h3>Mapeo de unidades</h3>
  <p><code>ConnectivityMapping</code> une el <code>hotelCode</code> y el código de unidad del proveedor con la
  propiedad, la unidad y el plan de tarifa de Volkern. El identificador externo nunca es la clave interna, así
  que una unidad puede cambiar de canal sin perder su histórico.</p>
</section>

<!-- ══════════════ 4 · MODELO DE DATOS ══════════════ -->
<section class="seccion">
  <div class="kicker">04 · Datos</div>
  <h2>Modelo de datos</h2>
  <p class="lead">Veinte modelos (veinte tablas) más <code>User.contactId</code>. Todos cuelgan de
  <code>Tenant</code> con <code>onDelete: Cascade</code>, y el aislamiento por <code>tenantId</code> está
  cubierto por un test dedicado.</p>

  <h3>Núcleo alojativo</h3>
  <table>
    <thead><tr><th>Modelo</th><th>Para qué</th></tr></thead>
    <tbody>
      <tr><td><code>HospitalityProperty</code></td><td>Propiedad física: dirección, zona, coordenadas, fotos, zona horaria, estado.</td></tr>
      <tr><td><code>HospitalityUnit</code></td><td>Unidad reservable: tipo, capacidad, tarifa base, moneda y estado operativo (<code>available</code>, <code>occupied</code>, <code>cleaning</code>, <code>dirty</code>, <code>maintenance</code>, <code>out_of_service</code>).</td></tr>
      <tr><td><code>HospitalityRatePlan</code></td><td>Plan de tarifa por unidad: precio/noche, mínimo y máximo de noches, días de check-in/out permitidos.</td></tr>
      <tr><td><code>HospitalityUnitBlock</code></td><td>Bloqueo manual de fechas (<code>propietario</code>, <code>mantenimiento</code>, <code>administrativo</code>). Intervalo <code>[inicio, fin)</code>.</td></tr>
    </tbody>
  </table>

  <h3>Reservas y trazabilidad</h3>
  <table>
    <thead><tr><th>Modelo</th><th>Para qué</th></tr></thead>
    <tbody>
      <tr><td><code>HospitalityReservation</code></td><td>Reserva interna: canal, identificador externo, identificador del channel manager, acción, estado, importes, datos del huésped y payload. Índice único idempotente por <code>[tenantId, channel, externalBookingId]</code>.</td></tr>
      <tr><td><code>HospitalityWebhookEvent</code></td><td>Evento bruto recibido (<code>book</code>, <code>modify</code>, <code>cancel</code>) con estado <code>recibido</code>, <code>procesado</code>, <code>duplicado</code>, <code>error</code> o <code>sin_mapping</code>, su error y el payload completo.</td></tr>
      <tr><td><code>HospitalitySyncLog</code></td><td>Traza de cada push o reconciliación: tipo, operación, estado, código HTTP, payload, respuesta y duración.</td></tr>
    </tbody>
  </table>

  <h3>Operación</h3>
  <table>
    <thead><tr><th>Modelo</th><th>Para qué</th></tr></thead>
    <tbody>
      <tr><td><code>HospitalityCleaningTask</code></td><td>Limpieza de una unidad: reserva, prioridad, responsable y estado.</td></tr>
      <tr><td><code>HospitalityMaintenanceTask</code></td><td>Incidencia sobre una unidad: estado (<code>abierta</code>, <code>en_proceso</code>, <code>resuelta</code>, <code>cerrada</code>) y prioridad.</td></tr>
    </tbody>
  </table>

  <h3>Dinero</h3>
  <table>
    <thead><tr><th>Modelo</th><th>Para qué</th></tr></thead>
    <tbody>
      <tr><td><code>HospitalityReservationItem</code></td><td>Líneas del desglose (<code>alojamiento</code>, <code>limpieza</code>, <code>extra</code>, <code>otro</code>). Su suma es el ingreso bruto.</td></tr>
      <tr><td><code>HospitalityPayment</code></td><td>Pagos e intentos: método, estado (<code>pendiente</code>, <code>pagado</code>, <code>parcial</code>, <code>reembolsado</code>, <code>fallido</code>), referencia externa e identificador del intento de cobro.</td></tr>
      <tr><td><code>HospitalityPaymentAccount</code></td><td>Cuenta de cobro del tenant. Creada en el esquema; sin código que la escriba todavía.</td></tr>
    </tbody>
  </table>

  <h3>Cliente, cumplimiento y conectividad</h3>
  <table>
    <thead><tr><th>Modelo</th><th>Para qué</th></tr></thead>
    <tbody>
      <tr><td><code>HospitalityCommunicationTemplate</code></td><td>Plantilla por evento (confirmación, pre-llegada, check-in, post-salida, reseña) y canal (WhatsApp, email).</td></tr>
      <tr><td><code>HospitalityTraveler</code></td><td>Persona alojada: documento, tipo, soporte, nacimiento, nacionalidad, domicilio, estado del registro y seguimiento del enlace.</td></tr>
      <tr><td><code>HospitalityCompliance</code></td><td>Comunicación al Ministerio: estado de la reserva y de los viajeros, código de comunicación, lote, envío y procesado.</td></tr>
      <tr><td><code>HospitalityComplianceConfig</code></td><td>Configuración del registro: entorno, código de arrendador, credenciales y certificado digital de la entidad, ambos cifrados.</td></tr>
      <tr><td><code>HospitalityComplianceEvent</code></td><td>Traza de cada envío y anulación.</td></tr>
      <tr><td><code>HospitalityBookingConfig</code></td><td>Política del canal directo: slug público único en la plataforma, propiedades publicadas, divisa, cancelación, anticipo, tarifa de limpieza y si se exige pago online.</td></tr>
      <tr><td><code>ConnectivityProvider</code></td><td>Credenciales cifradas del proveedor, estado, último evento, última sincronización y contador de errores.</td></tr>
      <tr><td><code>ConnectivityMapping</code></td><td>Hotel y unidad externos → propiedad, unidad y plan de tarifa de Volkern.</td></tr>
    </tbody>
  </table>
</section>

<!-- ══════════════ 5 · CAPA DE APLICACIÓN ══════════════ -->
<section class="seccion">
  <div class="kicker">05 · Aplicación</div>
  <h2>Capa de aplicación</h2>

  <h3>API</h3>
  <p>41 rutas bajo <code>/api/hospitality</code>, 5 bajo <code>/api/admin/conectividad</code>, 3 de cron y 5
  públicas. La superficie se organiza por dominio:</p>
  <table>
    <thead><tr><th>Dominio</th><th>Rutas</th></tr></thead>
    <tbody>
      <tr><td>Propiedades y unidades</td><td><code>properties</code>, <code>properties/[id]</code>, <code>units</code>, <code>units/[id]</code></td></tr>
      <tr><td>Tarifas</td><td><code>rateplans</code>, <code>rateplans/[id]</code></td></tr>
      <tr><td>Reservas</td><td><code>reservations</code>, <code>reservations/[id]</code>, <code>…/check</code>, <code>…/items</code>, <code>…/payments</code></td></tr>
      <tr><td>Bloqueos y operación</td><td><code>blocks</code>, <code>blocks/[id]</code>, <code>operations</code>, <code>tasks</code></td></tr>
      <tr><td>Cliente y comunicación</td><td><code>guests</code>, <code>guests/link</code>, <code>comunicaciones</code>, <code>comunicaciones/[id]</code>, <code>…/enviar-prueba</code></td></tr>
      <tr><td>Automatización</td><td><code>automatizaciones</code>, <code>automatizaciones/[id]</code>, <code>…/test</code></td></tr>
      <tr><td>Dinero y analítica</td><td><code>finanzas</code>, <code>dashboard</code>, <code>reportes</code></td></tr>
      <tr><td>Registro de viajeros</td><td><code>compliance</code>, <code>compliance/[reservationId]</code>, <code>compliance/config</code></td></tr>
      <tr><td>Onboarding</td><td><code>onboarding</code> (+ <code>catalogo</code>, <code>mapping</code>, <code>probar</code>, <code>activar</code>)</td></tr>
      <tr><td>Conectividad</td><td><code>sync</code> (push manual), <code>webhook/reservations</code></td></tr>
      <tr><td>Admin de conectividad</td><td><code>/api/admin/conectividad</code> (+ <code>test</code>, <code>propiedades</code>, <code>reconciliar</code>, <code>sync-logs</code>)</td></tr>
      <tr><td>Crons</td><td><code>hospitality-checkin-due</code>, <code>hospitality-reconcile</code>, <code>hospitality-review-request</code></td></tr>
      <tr><td>Público</td><td><code>/api/public/viajeros/[token]</code>, <code>/api/public/booking/[slug]/cotizar</code> y <code>/api/public/booking/[slug]/reservar</code></td></tr>
    </tbody>
  </table>

  <h3>Módulos puros</h3>
  <p>La lógica vive en <code>lib/hospitality/</code>, sin acceso a HTTP ni a la sesión, para poder probarla y
  reutilizarla: disponibilidad, calendario y planning, reservas, sincronización, adaptador de conectividad,
  códigos externos, reconciliación, operaciones y vocabulario de estados, huéspedes, incidencias, listas de
  recepción (parte de housekeeping y CSV de reservas), dinero (finanzas, resumen y consultas de importes),
  penalizaciones y no-show, caducidad de holds, reportes y analítica, EventBus y puente al Automation Engine,
  métricas, comunicaciones y cierre, reserva directa (motor, extras, pagos, idiomas), permisos y capacidades,
  roles, onboarding, registro de viajeros y especificación MIR, rechazo de partes y avisos, check-in online y
  reseñas.</p>

  ${figura('10-booking-engine', 'Configuración del motor de reserva directa: plantilla, marca y propiedades publicadas.')}

  <h3>Autenticación, aislamiento y permisos</h3>
  <p>Todas las rutas pasan por <code>authenticateRequest()</code>: sesión de NextAuth <b>o</b> clave de API, con
  el tenant resuelto y validación de subdominio. Además, <b>cada método exige permiso por acción</b>:
  <code>lib/hospitality/permissions.ts</code> traduce la capacidad del producto a módulo y acción de la
  plataforma, y las rutas llaman a <code>exigirPermisoHospitality()</code>. Sin permiso, la respuesta es
  <b>403 con la causa</b> (<code>permisoRequerido</code>) antes de tocar la base.</p>
  <p>La interfaz decide con la misma regla: el navegador resuelve la capacidad en el cliente y ninguna acción de
  escritura del dashboard se dibuja fuera de <code>&lt;AccionHospitality capacidad="…"&gt;</code>, que la oculta
  cuando el rol no la tiene. <b>Ocultar, no deshabilitar</b>: un botón gris permanente no explica nada.</p>

  <div class="destacado">
    <b>Ninguna puerta se decide por el nombre del rol.</b> Había dos que sí —instalar el certificado de la
    entidad y ver los documentos sin enmascarar se concedían a quien se llamara «Admin»—, con dos consecuencias:
    un rol nuevo no podía recibirlas por mucho que el administrador las concediera, y renombrar «Admin» habría
    dejado a la cuenta sin firmar ante el Ministerio. Ahora son capacidades
    (<code>integraciones.administrar</code> y <code>viajeros.documento_completo</code>), y un test recorre el
    código y falla si vuelve a aparecer una decisión por nombre.
  </div>
</section>

<!-- ══════════════ 6 · ROLES ══════════════ -->
<section class="seccion">
  <div class="kicker">06 · Permisos</div>
  <h2>Capacidades y roles del producto</h2>
  <p class="lead">Ocho módulos de Hospitality, concedibles desde Equipo → Roles y permisos.</p>

  <table>
    <thead><tr><th>Módulo de permisos</th><th>Acciones</th></tr></thead>
    <tbody>
      <tr><td><code>hospitality_reservas</code></td><td>ver, crear, editar, <b>cancelar</b>, <b>documento_completo</b></td></tr>
      <tr><td><code>hospitality_operaciones</code></td><td>ver, gestionar, <b>checkin</b></td></tr>
      <tr><td><code>hospitality_mantenimiento</code></td><td>ver, gestionar</td></tr>
      <tr><td><code>hospitality_integraciones</code></td><td>ver, gestionar, <b>administrar</b></td></tr>
      <tr><td><code>hospitality_finanzas</code></td><td>ver, gestionar</td></tr>
      <tr><td><code>hospitality_comunicaciones</code></td><td>ver, gestionar</td></tr>
      <tr><td><code>hospitality_automatizaciones</code></td><td>ver, gestionar</td></tr>
      <tr><td><code>hospitality_misreservas</code></td><td>ver (la puerta del huésped)</td></tr>
    </tbody>
  </table>
  <p>La única ruta exenta es el <b>webhook del proveedor</b>, que llega con autenticación básica y no con un
  usuario de Volkern.</p>

  <h3>Vocabulario de roles</h3>
  <table>
    <thead><tr><th>Rol</th><th>Qué es</th></tr></thead>
    <tbody>
      <tr><td><b>Anfitrión</b></td><td>Administra la propiedad entera, incluido su certificado y quién entra al módulo.</td></tr>
      <tr><td><b>Agente</b></td><td>La empresa administradora: opera, cobra y resuelve; no firma ni reparte permisos.</td></tr>
      <tr><td><b>Mantenimiento</b></td><td>Incidencias y el día de la propiedad para poder entrar a trabajar.</td></tr>
      <tr><td><b>Limpieza</b></td><td>Llegadas, salidas y marcar limpiezas. No entrega llaves, no ve documentos ni dinero.</td></tr>
      <tr><td><b>Huésped</b></td><td>El cliente: solo las reservas de su contacto. Sin vínculo, ninguna.</td></tr>
    </tbody>
  </table>
  <p>Aplicar el catálogo <b>solo añade</b> lo que falte (nunca retira, así que repetirlo no puede dejar a nadie
  sin acceso); recortar es <code>restablecer</code> y se pide a propósito. Repartir permisos de Hospitality es
  la capacidad <code>equipo.roles</code>: un rol que toca Hospitality no lo cambia, ni lo renombra, ni lo borra
  quien no la tenga.</p>

  <div class="aviso">
    <b>El rol Huésped no es el rol de reservas recortado.</b> Tiene <code>hospitality_misreservas.ver</code>, no
    <code>reservas.ver</code>. Si compartieran capacidad, dar acceso a un huésped sería abrirle las reservas de
    toda la cuenta y lo único que lo evitaría sería un filtro que la siguiente ruta puede olvidar. El filtro por
    <code>User.contactId</code> entra en la consulta, y la reserva de otro contacto responde 404 igual que una
    inexistente. Sin vínculo: cero reservas, nunca todas.
  </div>

  ${figura('16-roles', 'Equipo y roles: descripción de cada rol del producto y con qué capacidades entra.')}
</section>

<!-- ══════════════ 7 · FLUJO A ══════════════ -->
<section class="seccion">
  <div class="kicker">07 · Flujo A</div>
  <h2>Entrada: webhook de reservas (proveedor → Volkern)</h2>
  <p><b>Endpoint:</b> <code>POST /api/hospitality/webhook/reservations</code>.
  <b>Autenticación:</b> cabecera <code>Authorization: Basic</code> con las mismas credenciales guardadas en
  Administración → Conectividad, comparadas en tiempo constante.</p>

  <div class="pre">Proveedor de conectividad
        │  POST { action: book|modify|cancel, hotelCode, channel, bookingId, ... }
        ▼
1. Autenticación básica contra las credenciales cifradas   → 401 si no coincide
2. Parseo y validación del payload mínimo                  → 400 si falta JSON
3. processReservationWebhook()
      3.1 acción válida y hotelCode/bookingId/channel presentes
      3.2 resolveMapping(hotelCode → propiedad/unidad)     → sin mapping: 'sin_mapping' + 400
      3.3 despacho por acción:
            book    → processBook()     (alta de huésped/Contacto + alta de reserva)
            modify  → processModify()   (estado completo nuevo, reemplaza; auditoría del cambio)
            cancel  → processCancel()   (cambia el estado, conserva el historial)
      3.4 HospitalityWebhookEvent con el payload bruto:
            procesado | duplicado | error | sin_mapping
      3.5 si ok y no duplicado → dispatchConnectivityPush(...)
4. updateConnectivityStatus({ estado: 'conectado', ultimoEvento: now, resetErrores: true })
        ▼
200 { success: true, status, reservationId }</div>

  <h3>Reglas del contrato ya implementadas</h3>
  <ul>
    <li><b>Idempotencia</b> por <code>[tenantId, channel, externalBookingId]</code>: un <code>book</code>
    repetido devuelve <code>duplicado</code>, no crea una segunda reserva y no dispara push.</li>
    <li><b>Huésped opcional</b>: una reserva sin email es válida.</li>
    <li><code>specialRequests</code> como texto libre.</li>
    <li><code>modify</code> <b>reemplaza</b> en lugar de mezclar.</li>
    <li>Sin reintentos ciegos; el error lleva su causa (404 si la reserva a cancelar o modificar no existe).</li>
  </ul>
  <p><b>Efectos en cadena del alta:</b> <code>reservation.created</code> en el EventBus → Automation Engine →
  comunicación de confirmación → push de disponibilidad a los canales.</p>

  <div class="aviso">
    <b>Estado real:</b> la URL existe y está documentada, pero <b>todavía no ha llegado ningún evento</b>:
    la tabla de eventos de webhook está vacía. Es un pendiente de alta en el panel del proveedor, no de
    desarrollo.
  </div>
</section>

<!-- ══════════════ 8 · FLUJO B ══════════════ -->
<section class="seccion">
  <div class="kicker">08 · Flujo B</div>
  <h2>Salida: pushes a la Capa de Conectividad</h2>

  <table>
    <thead><tr><th>Operación del contrato</th><th>Estado</th></tr></thead>
    <tbody>
      <tr><td>Detalle de propiedad / mapping</td><td class="si">implementado (prueba de conexión y onboarding)</td></tr>
      <tr><td>Inventory Push</td><td class="si">implementado</td></tr>
      <tr><td>Rate Push</td><td class="si">implementado</td></tr>
      <tr><td>Inventory Restrictions Push</td><td class="si">implementado</td></tr>
      <tr><td>Rate Restrictions Push</td><td class="si">implementado</td></tr>
      <tr><td>Fetch Reservations</td><td class="si">implementado (reconciliación)</td></tr>
      <tr><td>Fetch Inventory</td><td class="no">no implementado</td></tr>
      <tr><td>Fetch Rates</td><td class="no">no implementado</td></tr>
      <tr><td>Mark No Show / Channel Multiplier</td><td class="no">fuera de V1</td></tr>
    </tbody>
  </table>

  <h3>Qué dispara cada push</h3>
  <table>
    <thead><tr><th>Origen</th><th>Operación registrada</th><th>Alcance</th></tr></thead>
    <tbody>
      <tr><td>Webhook <code>book</code> / <code>modify</code> / <code>cancel</code></td><td>reserva creada / modificada / cancelada</td><td>inventario + restricciones</td></tr>
      <tr><td>Alta o edición manual de reserva</td><td>reserva creada / modificada</td><td>inventario (sin tarifas)</td></tr>
      <tr><td>Check-in / check-out</td><td>reserva creada / unidad cambiada</td><td>inventario</td></tr>
      <tr><td>Estado operativo de la unidad</td><td>unidad cambiada</td><td>inventario + restricciones (solo si el estado cambia)</td></tr>
      <tr><td>Limpieza completada → unidad disponible</td><td>unidad cambiada</td><td>inventario</td></tr>
      <tr><td>Alta o edición de plan de tarifa</td><td>manual</td><td>los cuatro, con horizonte de 180 días</td></tr>
      <tr><td>Alta, edición o cancelación de bloqueo</td><td>unidad cambiada</td><td>inventario</td></tr>
      <tr><td><code>POST /api/hospitality/sync</code></td><td>manual</td><td>todo (lo lanza el operador)</td></tr>
    </tbody>
  </table>

  <p>Cada push escribe una fila en <code>HospitalitySyncLog</code> con éxito o error y su causa.
  <b>Sin reintentos ciegos:</b> un fallo queda registrado para revisión manual. Si la conectividad no está
  configurada, no se llama a la red y se devuelve un error explícito.</p>
  <p>Lo que se empuja se calcula con el motor de disponibilidad: reservas activas más bloqueos manuales, con la
  misma regla de intervalo. <b>Un solo origen de disponibilidad</b>, con guardia de tests.</p>
</section>

<!-- ══════════════ 9 · FLUJO C Y D ══════════════ -->
<section class="seccion">
  <div class="kicker">09 · Flujos C y D</div>
  <h2>Reconciliación diaria y ciclo de operación</h2>

  <h3>Flujo C — reconciliación</h3>
  <div class="pre">Cron 04:15 (Europe/Madrid)  →  runHospitalityReconcileScan()
   para cada tenant con mappings activos
     fetchReservations(hotelCode, desde, hasta)
     comparar con las reservas internas:
        faltante           → registrar divergencia (NO se crea sola)
        modificada         → registrar cambio detectado
        cancelada externa  → registrar
     todo idempotente y auditado en HospitalitySyncLog (tipo 'reconciliacion')</div>
  <p>Diseño conservador deliberado: <b>nunca cancela ni sobrescribe</b> una reserva interna por su cuenta; deja
  constancia para revisión. Hay un endpoint manual equivalente en la administración de conectividad. Otros dos
  cron se ocupan de la pre-llegada (cada hora) y de pedir la reseña tras la salida.</p>

  <h3>Flujo D — operaciones y cierre de ciclo</h3>
  <div class="pre">Check-in   → estado checked_in + unidad occupied + evento + comunicación 'check_in'
Check-out  → estado checked_out + unidad cleaning + tarea de limpieza + evento + 'post_salida'
Limpieza completada → unidad available + evento cleaning_completed + push de disponibilidad
Mantenimiento → incidencia sobre la unidad; puede marcarla maintenance (resta disponibilidad)</div>
  <p>El bloqueo manual (propietario, mantenimiento o administrativo) resta disponibilidad por el mismo motor y se
  comunica a los canales con el push de inventario. Es visible y editable desde el planning.</p>

  ${figura('05-planning', 'Planning: ocupación por unidad y día, con los bloqueos y reservas de cada unidad.')}
  ${figura('06-operaciones', 'Operaciones: llegadas y salidas del día, unidades a limpiar e incidencias abiertas.')}
</section>

<!-- ══════════════ 10 · FLUJO E ══════════════ -->
<section class="seccion">
  <div class="kicker">10 · Flujo E</div>
  <h2>Reserva directa (Booking Engine)</h2>

  <div class="pre">Landing del cliente / widget embebible  (/reservar/&lt;slug&gt;  ·  /embed/reservar/&lt;slug&gt;)
   │
   ├─ 1. Fechas y huéspedes          POST /api/public/booking/&lt;slug&gt;/cotizar
   │        └→ motor de disponibilidad central: unidades libres del rango
   │           (reservas activas + bloqueos, la misma regla para todos)
   │
   ├─ 2. Unidad y precio             módulo puro de tarificación
   │        └→ tarifa del plan activo (o base) × noches + limpieza,
   │           anticipo y saldo; restricciones del plan respetadas
   │
   ├─ 3. Datos y reserva             POST /api/public/booking/&lt;slug&gt;/reservar
   │        └→ crearReservaDirecta() = MISMO motor de reservas que las de OTA
   │           · bloqueo de fila de la unidad + recomprobación (no se vende dos veces)
   │           · huésped al CRM con el mismo alta que usa el webhook
   │           · líneas de desglose: alojamiento + limpieza
   │           · evento reservation.created → automatizaciones
   │           · comunicación de confirmación (solo si queda confirmada)
   │           · push de disponibilidad a los canales
   │
   └─ 4. Pago (si el alojamiento lo exige)
            └→ sesión de cobro CONTRA LA CUENTA DEL TENANT
               · webhook de la plataforma → pago registrado (pagado)
                 → reserva pendiente → confirmada → confirmación al huésped</div>

  <h3>Reglas no negociables, todas cumplidas</h3>
  <ul>
    <li>El Booking Engine <b>no</b> tiene motor propio de disponibilidad ni de tarifas.</li>
    <li><b>Un solo</b> origen de disponibilidad: el mismo de los canales.</li>
    <li>El dinero llega a la cuenta del tenant y no a la de Volkern: <b>Volkern no retiene fondos</b>.</li>
    <li>Los identificadores de la reserva directa son internos y el enlace de confirmación va firmado, así que
    nadie lee una reserva ajena probando identificadores.</li>
  </ul>

  <div class="aviso">
    <b>Estado real del cobro online:</b> hoy <b>ningún tenant tiene cuenta de cobro conectada</b>, así que en la
    práctica la reserva directa funciona sin pago online (lo cobra el alojamiento). Exigirlo está implementado,
    pero rechaza la reserva con una causa clara hasta que la cuenta esté habilitada.
  </div>

  ${figura('17-booking-publico', 'Página pública de reserva directa del tenant de demostración.')}
</section>

<!-- ══════════════ 11 · FLUJO F ══════════════ -->
<section class="seccion">
  <div class="kicker">11 · Flujo F</div>
  <h2>Registro de viajeros (RH/PV ante el Ministerio del Interior)</h2>
  <p class="lead">Es el único flujo con un transporte distinto al de la conectividad: SOAP con XML comprimido en
  ZIP y codificado en Base64, autenticación básica <b>y</b> certificado de cliente (TLS mutuo).</p>

  <div class="pre">Reserva (de cualquier canal)
   → viajeros declarados (HospitalityTraveler)
   → 'Pedir datos' por WhatsApp: enlace firmado → /viajeros/&lt;token&gt; → el huésped completa
   → estado del registro derivado de los DATOS, no de una columna
   → enviarAlMinisterio(tipo: RH | PV | anulación)
        construirPeticionSes() → XML → ZIP → Base64 → SOAP
        agente HTTPS con el certificado de la entidad + CA intermedia en la imagen
   → HospitalityCompliance (código, lote, errores) + HospitalityComplianceEvent</div>

  <p>El certificado de la entidad se instala en <b>Registro de viajeros → Configuración</b>, se valida al subirlo
  y se guarda cifrado. Hay dos entornos definidos: el de pruebas y el de producción del Ministerio.</p>

  ${figura('08-viajeros', 'Registro de viajeros: estado de los documentos, partidas enviadas y avisos pendientes.')}
  ${figura('11-huespedes', 'Huéspedes: personas alojadas y sus estancias acumuladas, base del registro y de las comunicaciones.')}
</section>

<!-- ══════════════ 12 · FLUJO G ══════════════ -->
<section class="seccion">
  <div class="kicker">12 · Flujo G</div>
  <h2>Automatizaciones y comunicaciones</h2>
  <p>Los eventos del módulo se publican en el EventBus y los consume el <b>AutomationRuleEngine</b> que ya
  existía en el ERP, con idempotencia por reserva y tipo, y un barrido por cron que cierra las ejecuciones
  colgadas.</p>

  <div class="cols2">
    <div>
      <h4>Eventos publicados</h4>
      <ul>
        <li><code>reservation.created</code> / <code>modified</code> / <code>cancelled</code></li>
        <li><code>reservation.checked_in</code> / <code>checked_out</code></li>
        <li><code>checkin_due</code></li>
        <li><code>cleaning.completed</code></li>
        <li><code>maintenance.created</code> / <code>completed</code></li>
      </ul>
    </div>
    <div>
      <h4>Acciones del motor</h4>
      <ul>
        <li>Crear tarea de limpieza o de seguimiento.</li>
        <li>Enviar un mensaje al huésped.</li>
        <li>Encadenar acciones sobre la misma reserva.</li>
      </ul>
    </div>
  </div>

  <p>Las comunicaciones renderizan la plantilla del evento y la envían por su canal (WhatsApp de la plataforma o
  del tenant, o email por SMTP). Los cron de pre-llegada y de reseña las disparan solos.</p>

  ${figura('13-automatizaciones', 'Automatizaciones: reglas activas por evento del ciclo de la reserva.')}
  ${figura('12-comunicaciones', 'Comunicaciones: plantillas por evento y canal, con su estado de activación.')}
</section>

<!-- ══════════════ 13 · DINERO Y REPORTES ══════════════ -->
<section class="seccion">
  <div class="kicker">13 · Dinero</div>
  <h2>Finanzas por reserva y reportes</h2>
  <p class="lead">Lo que ningún channel manager da al alojamiento: la rentabilidad de cada reserva. El desglose
  de líneas suma el ingreso bruto; encima se descuentan comisiones y gastos para llegar al margen y al cobro.</p>

  ${figura('14-finanzas', 'Finanzas: ingreso bruto y neto, comisiones, ADR y desglose por canal y reserva.')}
  ${figura('15-reportes', 'Reportes: indicadores de explotación (ADR, RevPAR, estancia media y ocupación).')}
  ${figura('07-reservas', 'Reservas: listado con canal, importe, noches y estado de cada estancia.')}

  <h3>Tarifas</h3>
  <p>Los planes de tarifa definen precio por noche, mínimo y máximo de noches y los días de check-in y check-out
  permitidos. Al guardarlos se empujan a los canales con los cuatro tipos de actualización.</p>
  ${figura('09-tarifas', 'Tarifas y disponibilidad: planes por unidad, con su precio y sus restricciones.')}
</section>

<!-- ══════════════ 14 · ESTADO REAL ══════════════ -->
<section class="seccion">
  <div class="kicker">14 · Estado</div>
  <h2>Estado real en producción</h2>
  <p class="lead">Medición de solo lectura sobre la base de producción, con la fecha de cada corte.</p>

  <table>
    <thead><tr><th>Dato</th><th>Valor (medido el 2026-09-15)</th></tr></thead>
    <tbody>
      <tr><td>Migraciones aplicadas</td><td>77 / 77</td></tr>
      <tr><td>Proveedor de conectividad</td><td>configurado, estado <b>conectado</b>, sin errores</td></tr>
      <tr><td>Mappings activos</td><td>2 unidades de la demo con sus planes de tarifa</td></tr>
      <tr><td>Propiedades / unidades / planes de tarifa</td><td>2 / 3 / 4</td></tr>
      <tr><td>Reservas</td><td>6 (OTA y directas)</td></tr>
      <tr><td>Eventos de webhook recibidos</td><td class="no">0</td></tr>
      <tr><td>Pushes registrados</td><td>inventario 5 ✓ / 4 ✗ · restricciones de inventario 5 ✓ · tarifas 3 ✓ · restricciones de tarifas 3 ✓</td></tr>
      <tr><td>Reconciliaciones</td><td>8 ✓ / 2 ✗</td></tr>
      <tr><td>Bloqueos / limpiezas / incidencias</td><td>0 / 0 / 0</td></tr>
      <tr><td>Pagos registrados / líneas de desglose</td><td>4 / 10</td></tr>
      <tr><td>Cuentas de cobro</td><td class="no">0 → el cobro online de la reserva directa todavía no se puede usar</td></tr>
      <tr><td>Viajeros / comunicaciones al Ministerio</td><td>5 (todos en datos pendientes) / 2 (ambas en pendiente, nunca enviadas)</td></tr>
      <tr><td>Configuración del registro</td><td>0 filas (sin código de arrendador ni certificado)</td></tr>
      <tr><td>Plantillas de comunicación</td><td>confirmación, pre-llegada, check-in, post-salida y reseña por WhatsApp activas; reseña por email inactiva</td></tr>
    </tbody>
  </table>
  <p>Los 4 fallos de inventario y las 2 reconciliaciones con error son anteriores a la corrección de la
  normalización de la URL; desde entonces todo lo registrado es éxito.</p>

  <div class="destacado">
    <b>Las capturas de este documento son del ${fechaCapturas}</b>, sobre el tenant de demostración
    «Demo Real Estate». En esa fecha ese tenant tenía <b>2 propiedades, 3 unidades, 4 planes de tarifa,
    25 reservas y 5 viajeros</b>: los mismos datos que se ven en las pantallas de este documento.
  </div>
</section>

<!-- ══════════════ 15 · CRITERIOS DE ACEPTACIÓN ══════════════ -->
<section class="seccion">
  <div class="kicker">15 · Verificación</div>
  <h2>Criterios de aceptación frente al estado real</h2>

  <table>
    <thead><tr><th>Criterio del plan</th><th>Estado</th></tr></thead>
    <tbody>
      <tr><td>Una reserva entra desde el webhook de forma idempotente</td><td>probado; sin webhooks reales recibidos todavía</td></tr>
      <tr><td><code>modify</code> reemplaza el estado completo, no mezcla</td><td class="si">cumplido</td></tr>
      <tr><td>Un huésped sin email no bloquea la reserva</td><td class="si">cumplido</td></tr>
      <tr><td>Un bloqueo de fechas resta disponibilidad y se comunica</td><td class="si">cumplido (sin datos en la demo)</td></tr>
      <tr><td>Un solo motor de disponibilidad</td><td class="si">cumplido, con guardia de tests</td></tr>
      <tr><td>El desglose cuadra: líneas = bruto = neto + comisiones</td><td class="si">cumplido</td></tr>
      <tr><td>Aislamiento multi-tenant</td><td class="si">cumplido, con tests</td></tr>
      <tr><td>La reserva directa del cliente llega al mismo motor</td><td class="si">cumplido</td></tr>
      <tr><td>El dinero de una reserva directa llega a la cuenta del tenant</td><td>implementado y sin verificar en vivo: no hay ninguna cuenta conectada</td></tr>
    </tbody>
  </table>

  <h3>Cómo se comprueba</h3>
  <p>El módulo tiene suites propias: motor de disponibilidad con guardia, calendario, reservas, finanzas,
  reportes, reserva directa, conectividad, reconciliación, automatizaciones, viajeros, certificado y CLI del
  planning; más las de permisos: catálogo y resolución, guardia que falla si una ruta deja de exigir capacidad,
  pruebas de ruta con el 403 real, guardia de que ninguna acción que escribe del dashboard se dibuja fuera de
  <code>&lt;AccionHospitality&gt;</code>, y las del catálogo de roles (qué concede cada uno, que las capacidades
  privilegiadas no viajen en el retrollenado, la herencia, la fusión al aplicar y el escaneo de decisiones por
  nombre de rol).</p>
</section>

<!-- ══════════════ 16 · QUÉ FALTA ══════════════ -->
<section class="seccion">
  <div class="kicker">16 · Pendientes</div>
  <h2>Qué falta, y de quién depende</h2>

  <h3>A · Bloqueado por terceros (no depende de desarrollo)</h3>
  <table>
    <thead><tr><th>Qué falta</th><th>Quién lo desbloquea</th></tr></thead>
    <tbody>
      <tr><td>Credenciales reales de producción y <code>partnerId</code> de la Capa de Conectividad (hoy funcionan las de pruebas y los cuatro pushes responden correctamente)</td><td>Alta de partner con el proveedor</td></tr>
      <tr><td>Registro del webhook en el proveedor: la URL existe y está documentada, pero nunca ha llegado un evento</td><td>Configurarlo en el panel del proveedor</td></tr>
      <tr><td>Registro de viajeros: código de arrendador, código de establecimiento y credenciales de la entidad; alta del servicio web ante el Ministerio</td><td>Trámite de la entidad ante el Ministerio</td></tr>
    </tbody>
  </table>

  <h3>B · Pendiente de producto (decidido, sin implementar)</h3>
  <table>
    <thead><tr><th>Qué falta</th><th>Dónde está especificado</th></tr></thead>
    <tbody>
      <tr><td>Cuenta de cobro por tenant: alta y estado. El cobro está implementado y el estado se consulta en vivo, pero ningún tenant tiene cuenta conectada</td><td>FASE 3.C del plan</td></tr>
      <tr><td><code>Fetch Inventory</code> y <code>Fetch Rates</code>: la reconciliación solo compara reservas, así que no detecta divergencias de disponibilidad ni de tarifas entre Volkern y los canales</td><td>Plan maestro §14</td></tr>
      <tr><td>Reintentos controlados de push: hoy un fallo se registra y no se reintenta</td><td>Plan maestro §30</td></tr>
    </tbody>
  </table>

  <h3>C · Deuda detectada en la revisión</h3>
  <table>
    <thead><tr><th>Qué falta</th></tr></thead>
    <tbody>
      <tr><td>El rol se resuelve una vez por carga: un cambio de permisos con la pestaña abierta no se refleja hasta recargar (el backend, en cambio, decide en cada petición).</td></tr>
      <tr><td>Exportación a PDF en Reportes: hoy solo CSV.</td></tr>
      <tr><td>Sección técnica de Integraciones dentro de Volkern: la observabilidad (último webhook, último push, último error) existe en la API de administración, pero el plan la pide como vista administrativa del producto, con estado por propiedad.</td></tr>
      <tr><td>Datos operativos de la demo: 0 bloqueos, 0 tareas de limpieza y 0 incidencias, así que Operaciones y el ciclo de limpieza no tienen nada que mostrar en una demo.</td></tr>
    </tbody>
  </table>

  <h3>D · Fuera de alcance declarado en V1 (no es deuda)</h3>
  <p>Mark No Show, Channel Multiplier, múltiples proveedores de conectividad, browser automation, pricing
  dinámico, revenue management, POS, contabilidad hotelera completa y app móvil del huésped.</p>
</section>

<!-- ══════════════ 17 · ANEXO ══════════════ -->
<section class="seccion">
  <div class="kicker">17 · Anexo</div>
  <h2>Cómo se mantiene este documento</h2>
  <p class="lead">Las capturas y el PDF se regeneran solos, para que el documento no envejezca por olvido.</p>

  <div class="pre"># 1. Capturas del módulo (entra con una cuenta real del entorno)
DEMO_RE_PASSWORD='…' node scripts/capturar-pantallas-hospitality.cjs

#    Variables: HOSPITALITY_BASE_URL, HOSPITALITY_EMAIL, HOSPITALITY_BOOKING,
#    HOSPITALITY_DSF (1 = imágenes más ligeras) y HOSPITALITY_SOLO (ids sueltos).
#    Deja las imágenes en docs/img/hospitality-tecnico/ + manifest.json

# 2. PDF
node scripts/generar-pdf-tecnico-hospitality.cjs
#    Deja docs/hospitality-tecnico.pdf y el HTML intermedio en /tmp</div>

  <p>La contraseña se lee del entorno y <b>nunca</b> se escribe en el repositorio, igual que en el seed de la
  demo. Las capturas se toman con el tema claro, sin el banner de cookies y sin los avisos flotantes, para que
  las imágenes sean imprimibles y muestren solo el módulo.</p>

  <h3>Índice de capturas</h3>
  <table>
    <thead><tr><th>#</th><th>Pantalla</th><th>Ruta</th></tr></thead>
    <tbody>
      ${manifest.capturas.map((c, i) => `<tr><td class="c">${i + 1}</td><td>${c.titulo}</td><td><code>${c.ruta}</code></td></tr>`).join('\n      ')}
    </tbody>
  </table>

  <h3>Documentos relacionados</h3>
  <ul>
    <li><code>docs/hospitality-ficha-tecnica.md</code> — inventario y estado del módulo (fuente de este documento).</li>
    <li><code>docs/hospitality-guia-usuario.md</code> — guía del usuario final.</li>
    <li><code>docs/COMMERCIAL-HOSPITALITY.md</code> — brochure comercial.</li>
    <li><code>docs/hospitality-booking-payments-plan.md</code> — plan de reserva directa y cobros.</li>
    <li><code>docs/registro-viajeros-certificado.md</code> — instalación del certificado de la entidad.</li>
  </ul>

  <div class="pie-firma">
    Volkern · Documento técnico del módulo Hospitality · Contenido al 2026-09-15 · Capturas del ${fechaCapturas}
    (${origenCapturas}, tenant «Demo Real Estate»). Generado con <code>scripts/generar-pdf-tecnico-hospitality.cjs</code>.
  </div>
</section>

</body>
</html>`;

fs.writeFileSync(HTML_SALIDA, html, 'utf8');
console.log(`HTML generado: ${HTML_SALIDA} (${(html.length / 1024 / 1024).toFixed(1)} MB)`);

async function main() {
  const navegador = await puppeteer.launch({
    headless: true,
    executablePath: '/usr/bin/google-chrome',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  try {
    const page = await navegador.newPage();
    await page.setContent(html, { waitUntil: 'load' });
    await page.pdf({
      path: PDF_SALIDA,
      format: 'A4',
      printBackground: true,
      margin: { top: '14mm', bottom: '16mm', left: '12mm', right: '12mm' },
      displayHeaderFooter: true,
      headerTemplate: '<div></div>',
      footerTemplate: `
        <div style="width:100%;font-size:7.4pt;color:#94a3b8;padding:0 12mm;display:flex;justify-content:space-between;">
          <span>Volkern · Módulo Hospitality — Documento técnico</span>
          <span>Página <span class="pageNumber"></span> de <span class="totalPages"></span></span>
        </div>`,
    });
  } finally {
    await navegador.close();
  }

  const kb = (fs.statSync(PDF_SALIDA).size / 1024 / 1024).toFixed(1);
  console.log(`✓ PDF: ${path.relative(RAIZ, PDF_SALIDA)} (${kb} MB)`);
}

main().catch((e) => {
  console.error('❌ Error generando el PDF:', e.message);
  process.exit(1);
});
