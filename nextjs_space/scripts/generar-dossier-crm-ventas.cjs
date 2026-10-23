#!/usr/bin/env node
/**
 * Dossier comercial de Volkern CRM de Ventas.
 *
 * Genera las pantallas del producto y compone un PDF A4 pensado para que un
 * agente comercial lo lea antes de una reunión o lo deje al cliente.
 *
 * Uso:
 *   node scripts/generar-dossier-crm-ventas.cjs
 *
 * Por defecto dibuja ilustraciones de la interfaz. Para usar capturas reales
 * del tenant de demostración (scripts/capturar-pantallas-crm-ventas.cjs):
 *
 *   DOSSIER_CAPTURAS_REALES=1 node scripts/generar-dossier-crm-ventas.cjs
 *
 * Variante para el cliente, sin precios ni material interno de venta:
 *
 *   DOSSIER_CLIENTE=1 node scripts/generar-dossier-crm-ventas.cjs
 *
 * Salida:
 *   documentacion_comercial/Dossier_Comercial_CRM_Ventas.pdf   (interno)
 *   documentacion_comercial/Dossier_Cliente_CRM_Ventas.pdf     (cliente)
 *   … y el .html de cada variante
 *   documentacion_comercial/img/crm-ventas/*.jpg
 *
 * Las pantallas llevan datos ficticios del tenant demo; la última página lo
 * advierte para no confundirlas con una cuenta de cliente real.
 *
 * Datos que NO se inventan aquí:
 *   · Precio, niveles, tramos de volumen y prueba: lib/crm-pricing.ts, la
 *     fuente única que usan la web y el cobro (vía scripts/dossier-crm-ventas/escalera.cjs).
 *   · Funciones: embudo, fichas, tareas, automatizaciones, presupuestos,
 *     contratos, previsión e informes existen en el panel, y cada nivel abre
 *     exactamente lo que dice `CRM_TIERS[].limits`.
 */
const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require('puppeteer');
const { generarCapturas } = require('./dossier-crm-ventas/pantallas.cjs');
const { ENTRADA, TRIAL, nivel, num } = require('./dossier-crm-ventas/escalera.cjs');
const { paginaPrecio, paginaOferta } = require('./dossier-crm-ventas/precios.cjs');
const { paginasCliente } = require('./dossier-crm-ventas/cliente.cjs');

/**
 * Variante de cliente: mismo producto, sin tarifas y sin las páginas que solo
 * sirven al comercial (objeciones, guion de la reunión, checklist de cierre).
 * Se separa por variable de entorno para no duplicar el generador ni el CSS.
 */
const CLIENTE = process.env.DOSSIER_CLIENTE === '1';

const RAIZ = path.join(__dirname, '..');
const ARCHIVO_BASE = CLIENTE ? 'Dossier_Cliente_CRM_Ventas' : 'Dossier_Comercial_CRM_Ventas';
const SALIDA_PDF = path.join(RAIZ, 'documentacion_comercial', `${ARCHIVO_BASE}.pdf`);
const SALIDA_HTML = path.join(RAIZ, 'documentacion_comercial', `${ARCHIVO_BASE}.html`);
const DIR_CAPTURAS = path.join(RAIZ, 'documentacion_comercial', 'img', 'crm-ventas');
const DIR_TMP = path.join(require('node:os').tmpdir(), 'dossier-crm-ventas');

const IMAGENES = {};

function cargarImagenes() {
  for (const archivo of fs.readdirSync(DIR_CAPTURAS).filter((f) => f.endsWith('.jpg')).sort()) {
    const clave = archivo.replace(/^\d+-/, '').replace(/\.jpg$/, '');
    IMAGENES[clave] = `data:image/jpeg;base64,${fs.readFileSync(path.join(DIR_CAPTURAS, archivo)).toString('base64')}`;
  }

  // Las capturas reales usan el nombre de la pantalla del panel; el documento
  // sigue hablando de las secciones del guion comercial.
  const alias = {
    'ficha-lead': 'ficha-oportunidad',
    'mi-dia': 'tareas',
    resultados: 'pronosticos',
    cotizacion: 'cotizaciones',
  };
  for (const [destino, origen] of Object.entries(alias)) {
    if (!IMAGENES[destino] && IMAGENES[origen]) IMAGENES[destino] = IMAGENES[origen];
  }
}

/* ─────────────────────────────── Estilos ────────────────────────────────── */

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
*{box-sizing:border-box;margin:0;padding:0}
@page{size:A4;margin:0}
html{-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{font-family:'Inter','Segoe UI',Arial,sans-serif;color:#0f172a;background:#fff;font-size:9.3pt;line-height:1.55}
.page{width:210mm;height:297mm;padding:14mm 14mm 12mm;position:relative;overflow:hidden;break-after:page;background:#fff}
.page:last-child{break-after:auto}
.footer{position:absolute;bottom:8mm;left:14mm;right:14mm;display:flex;justify-content:space-between;align-items:center;font-size:7pt;color:#94a3b8;border-top:1px solid #e8edf4;padding-top:2.8mm}
.footer b{color:#64748b;font-weight:600}
.kicker{font-size:7.4pt;letter-spacing:.22em;text-transform:uppercase;color:#0891b2;font-weight:800;margin-bottom:2.5mm}
h2{font-size:20pt;line-height:1.14;letter-spacing:-.025em;font-weight:800;color:#0b1220;margin-bottom:3mm}
h2 .azul{color:#2563eb}
.lead{font-size:10.2pt;color:#475569;line-height:1.5;margin-bottom:5.5mm;max-width:172mm}
h3{font-size:10.4pt;font-weight:750;color:#0b1220;margin-bottom:1.5mm}
p{font-size:9.2pt;color:#475569}
small{font-size:7.6pt;color:#94a3b8}

.shot{border:1px solid #dbe3ee;border-radius:2.6mm;overflow:hidden;box-shadow:0 4mm 9mm rgba(15,23,42,.13);background:#f6f8fb}
.shot img{width:100%;display:block}
.caption{font-size:7.4pt;color:#7c8ba0;margin-top:2mm;display:flex;justify-content:space-between;align-items:center}
.caption b{color:#475569;font-weight:600}
.caption span{font-style:italic}

.cols2{display:grid;grid-template-columns:1fr 1fr;gap:6mm}
.cols3{display:grid;grid-template-columns:repeat(3,1fr);gap:4mm}
.lista{list-style:none}
.lista li{position:relative;padding-left:5.2mm;font-size:9pt;color:#334155;margin-bottom:2.2mm;line-height:1.45}
.lista li:before{content:'';position:absolute;left:0;top:2.1mm;width:2.4mm;height:2.4mm;border-radius:50%;background:#2563eb;opacity:.85}
.lista.check li:before{content:'✓';background:none;color:#059669;font-weight:800;top:0;font-size:9pt;width:auto;height:auto}
.lista.x li:before{content:'—';background:none;color:#94a3b8;font-weight:700;top:0;width:auto;height:auto}
.lista li b{color:#0f172a;font-weight:650}

.card{border:1px solid #e6ebf2;border-radius:2.6mm;padding:4mm 4.5mm;background:#f8fafc}
.card h3{font-size:9.6pt}
.card p{font-size:8.4pt;line-height:1.45}
.card .n{width:7mm;height:7mm;border-radius:50%;background:#e8f0ff;color:#1d4ed8;font-size:9pt;font-weight:800;display:flex;align-items:center;justify-content:center;margin-bottom:2mm}

.quote{border-left:3px solid #0891b2;background:linear-gradient(90deg,#f0f9ff,#f8fafc);padding:3.4mm 4.6mm;border-radius:0 2mm 2mm 0;font-size:9.6pt;color:#0f2c3a;margin-top:4.5mm;line-height:1.45}
.quote b{font-weight:750}
.quote .who{display:block;font-size:7.4pt;color:#64748b;margin-top:1.3mm;font-weight:600;letter-spacing:.04em;text-transform:uppercase}

.stat{display:flex;align-items:baseline;gap:2mm}
.stat .big{font-size:26pt;font-weight:900;letter-spacing:-.04em;line-height:1;color:#0b1220}
.stat .unit{font-size:9pt;color:#64748b;font-weight:600}
.big-card{border:1px solid #dbeafe;background:linear-gradient(140deg,#eff6ff,#eef2ff);border-radius:3mm;padding:5mm 5.5mm}
.big-card h3{color:#1e3a8a}
.big-card p{color:#3b5bdb}
.big-card .nota{font-size:7.6pt;color:#64748b;margin-top:2.5mm}

table.pay{width:100%;border-collapse:collapse;font-size:8.4pt}
table.pay th{background:#0b1220;color:#fff;text-align:left;padding:2.6mm 3mm;font-weight:600;font-size:7.8pt}
table.pay td{padding:2.4mm 3mm;border-bottom:1px solid #e8edf4;color:#334155;vertical-align:top}
table.pay tr:nth-child(even) td{background:#f8fafc}
table.pay td.c,table.pay th.c{text-align:center}
table.pay td.r{text-align:right}
/* Variante densa para las dos tablas de la página de precio. */
table.pay.compact td{padding:1.75mm 3mm}
table.pay.compact th{padding:2mm 3mm}
.si{color:#059669;font-weight:800}
.no{color:#cbd5e1;font-weight:800}
.mono{font-variant-numeric:tabular-nums}

/* ── Portada ─────────────────────────────────────── */
.cover{padding:0;background:radial-gradient(120% 90% at 80% 0%,rgba(8,145,178,.32),transparent 55%),radial-gradient(90% 70% at 0% 100%,rgba(37,99,235,.35),transparent 55%),linear-gradient(155deg,#050b16 0%,#0a1530 48%,#10204a 100%);color:#fff}
.cover-inner{position:relative;height:100%;padding:16mm 14mm 12mm;display:flex;flex-direction:column}
.cover .marca{display:flex;align-items:center;gap:3mm}
.cover .mark{width:9mm;height:9mm;border-radius:3mm;background:linear-gradient(140deg,#22d3ee,#3b82f6 55%,#6366f1);display:flex;align-items:center;justify-content:center;font-weight:900;font-size:12pt;box-shadow:0 4mm 10mm rgba(59,130,246,.35)}
.cover .marca b{font-size:11pt;letter-spacing:.26em;font-weight:800}
.cover .marca span{font-size:7.4pt;letter-spacing:.24em;color:#7dd3fc;font-weight:700;display:block;margin-top:.5mm}
.cover .kicker{color:#67e8f9;margin-top:14mm}
.cover h1{font-size:33pt;line-height:1.06;letter-spacing:-.035em;font-weight:900;max-width:176mm}
.cover h1 em{font-style:normal;color:#67e8f9}
.cover .sub{font-size:11.4pt;line-height:1.5;color:#c7d2fe;max-width:150mm;margin-top:5mm}
.cover .chips{display:flex;flex-wrap:wrap;gap:2.5mm;margin-top:6mm}
.cover .chip{border:1px solid rgba(125,211,252,.4);background:rgba(255,255,255,.05);color:#e0f2fe;border-radius:20mm;padding:1.6mm 4mm;font-size:7.8pt;font-weight:600}
.cover .shot{margin-top:7mm;border-color:rgba(148,197,255,.35);box-shadow:0 8mm 18mm rgba(0,0,0,.45)}
.cover-index{display:grid;grid-template-columns:repeat(5,1fr);gap:3mm;margin-top:6mm;border-top:1px solid rgba(148,163,184,.22);padding-top:4mm}
.cover-index div{font-size:7.4pt;color:#a5b4fc;line-height:1.35}
.cover-index b{display:block;color:#67e8f9;font-size:8.2pt;letter-spacing:.1em;margin-bottom:.6mm;font-weight:800}
.cover .pie{margin-top:auto;display:flex;justify-content:space-between;align-items:flex-end;color:#94a3b8;font-size:7.4pt}
.cover .pie b{color:#e2e8f0;font-weight:600;display:block;font-size:8.4pt}

/* ── Cierre ──────────────────────────────────────── */
.cierre{padding:0;background:radial-gradient(100% 80% at 100% 0%,rgba(8,145,178,.28),transparent 55%),linear-gradient(160deg,#050b16,#0a1530 55%,#10204a);color:#fff}
.cierre-inner{height:100%;padding:18mm 15mm 12mm;display:flex;flex-direction:column}
.cierre .kicker{color:#67e8f9}
.cierre h2{color:#fff;font-size:28pt;line-height:1.1;max-width:165mm}
.cierre h2 em{font-style:normal;color:#67e8f9}
.cierre p{color:#c7d2fe;font-size:10.2pt;line-height:1.55}
.cierre .pasos{display:grid;grid-template-columns:repeat(3,1fr);gap:3.5mm;margin-top:8mm}
.cierre .paso{background:rgba(255,255,255,.055);border:1px solid rgba(125,211,252,.28);border-radius:2.6mm;padding:4mm 4.5mm}
.cierre .paso b{display:block;color:#67e8f9;font-size:7.2pt;letter-spacing:.18em;text-transform:uppercase;margin-bottom:1.6mm}
.cierre .paso strong{display:block;font-size:9.6pt;color:#fff;margin-bottom:1mm}
.cierre .paso span{font-size:8pt;color:#a5b4fc;line-height:1.45}
.cierre .precio{margin-top:8mm;display:flex;align-items:flex-end;gap:5mm;border-top:1px solid rgba(148,163,184,.3);padding-top:5mm}
.cierre .precio .cifra{font-size:34pt;font-weight:900;letter-spacing:-.04em;line-height:1}
.cierre .precio .cifra small{font-size:10pt;color:#a5b4fc;font-weight:600;letter-spacing:0}
.cierre .precio .det{font-size:8.4pt;color:#a5b4fc;line-height:1.5}
.cierre .check{margin-top:7mm;border-top:1px solid rgba(148,163,184,.28);padding-top:4.5mm}
.cierre .check > b{display:block;color:#e0f2fe;font-size:8pt;letter-spacing:.14em;text-transform:uppercase;margin-bottom:3mm}
.cierre .check .cols2{gap:2mm 6mm}
.cierre .check .cols2 > div{font-size:8.4pt;color:#a5b4fc;padding-left:5mm;position:relative;margin-bottom:2mm}
.cierre .check .cols2 > div:before{content:'✓';position:absolute;left:0;color:#67e8f9;font-weight:800}
.cierre .fin{margin-top:auto;display:flex;justify-content:space-between;align-items:flex-end;color:#94a3b8;font-size:7.4pt}
.cierre .fin b{color:#e2e8f0;font-weight:600}
`

/* ─────────────────────────── Utilidades ─────────────────────────────────── */

function pie(num, seccion = 'Dossier comercial · CRM de Ventas') {
  return `<div class="footer"><span>Volkern · ${seccion}</span><b>${num}</b></div>`;
}

function shot(clave, alt, nota = 'Vista del panel · datos de ejemplo') {
  return `<div class="shot"><img src="${IMAGENES[clave]}" alt="${alt}"></div>
    <div class="caption"><b>${alt}</b><span>${nota}</span></div>`;
}

function lista(items, clase = '') {
  return `<ul class="lista ${clase}">${items.map((i) => `<li>${i}</li>`).join('')}</ul>`;
}

function card(numero, titulo, texto) {
  return `<div class="card"><div class="n">${numero}</div><h3>${titulo}</h3><p>${texto}</p></div>`;
}

/* ─────────────────────────────── Páginas ────────────────────────────────── */

function portada() {
  return `<section class="page cover">
    <div class="cover-inner">
      <div class="marca">
        <div class="mark">V</div>
        <div><b>VOLKERN</b><span>CRM DE VENTAS</span></div>
      </div>
      <div class="kicker">Dossier comercial · Para agentes de ventas</div>
      <h1>Que ninguna oportunidad se enfríe <em>por olvido.</em></h1>
      <p class="sub">Cómo detectar el problema, qué enseñar en quince minutos y cómo cerrar la venta de Volkern CRM sin hablar de tecnología.</p>
      <div class="chips">
        <span class="chip">Embudo visual</span>
        <span class="chip">Seguimiento que no se olvida</span>
        <span class="chip">Previsión fiable</span>
        <span class="chip">Desde ${ENTRADA} €/usuario/mes</span>
      </div>
      <div class="shot"><img src="${IMAGENES.embudo}" alt="Panel de embudo de ventas de Volkern CRM"></div>
      <div class="cover-index">
        <div><b>01</b> El problema</div>
        <div><b>02</b> La propuesta</div>
        <div><b>03</b> La demo</div>
        <div><b>04</b> Las objeciones</div>
        <div><b>05</b> El precio</div>
      </div>
      <div class="pie">
        <div><b>Documento interno de ventas</b>Actualizado en octubre de 2026 · Uso del equipo comercial</div>
        <div style="text-align:right"><b>volkern.app</b>CRM &amp; Ventas</div>
      </div>
    </div>
  </section>`;
}

function diagnostico() {
  return `<section class="page">
    <div class="kicker">01 · El problema</div>
    <h2>Cuando el equipo vende de memoria, el dinero se va por las grietas</h2>
    <p class="lead">No hace falta un informe para saber si una empresa necesita un CRM. Estas cinco frases lo dicen todo. Se oyen en la primera reunión y son la puerta de entrada a la venta.</p>

    <div class="cols2" style="gap:5mm">
      <div class="card" style="background:#fff">
        <h3>«Se me pasó llamarle.»</h3>
        <p>Un lead caliente se enfría en dos días. Nadie sabe cuántos se han quedado por el camino porque no hay un sitio donde mirar.</p>
      </div>
      <div class="card" style="background:#fff">
        <h3>«No sé por qué perdimos esta.»</h3>
        <p>Sin motivo de pérdida, el error se repite cada mes. El equipo cree que es el precio; casi nunca es solo el precio.</p>
      </div>
      <div class="card" style="background:#fff">
        <h3>«¿Cómo vamos?» · «Pregúntale a Juan.»</h3>
        <p>La previsión vive en la cabeza de una persona. Si Juan se va de vacaciones, el director se queda a ciegas.</p>
      </div>
      <div class="card" style="background:#fff">
        <h3>«Ese cliente es mío.»</h3>
        <p>La cartera no es de la empresa: es del comercial que la apunta donde puede. Cuando se va, se lleva la memoria y el teléfono.</p>
      </div>
    </div>

    <div class="card" style="background:#fff;margin-top:4.5mm">
      <h3>«El presupuesto lo hago en Word.»</h3>
      <p>Tres versiones del mismo documento, ninguna aprobada, y nadie sabe si el cliente llegó a abrir el archivo. La propuesta se convierte en un acto de fe.</p>
    </div>

    <div class="big-card" style="margin-top:5.5mm">
      <h3>La cuenta que el cliente hace solo</h3>
      <div class="stat" style="margin-top:2mm"><span class="big">72.000 €</span><span class="unit">al año</span></div>
      <p style="margin-top:1.5mm">Ticket medio de 3.000 € y solo dos oportunidades perdidas al mes por falta de seguimiento. Volkern CRM cuesta desde <b>${ENTRADA} €/usuario/mes</b>: menos que una de esas dos ventas.</p>
      <div class="nota">Ejemplo con cifras redondas para ayudarle a hacer su propia cuenta. No es una promesa de resultados.</div>
    </div>

    <div class="quote" style="margin-top:5mm">
      <b>La causa no es el equipo. Es el sistema.</b> Un comercial que se acuerda de todo es una excepción; un equipo que no depende de la memoria es un proceso.
    </div>

    <div class="cols2" style="margin-top:5mm;gap:5mm">
      <div class="card" style="background:#fff">
        <h3>Lo que no ayuda en la reunión</h3>
        <p>Discutir con el CRM que ya tiene, enseñar veinte pantallas o hablar de funciones antes de saber cuántas oportunidades se le han quedado sin tocar.</p>
      </div>
      <div class="card" style="background:#fff">
        <h3>Lo que sí abre la puerta</h3>
        <p>Preguntar cuánto le cuesta una oportunidad perdida, quién se acuerda hoy de hacer el seguimiento y qué pasa cuando esa persona no está.</p>
      </div>
    </div>
    ${pie(2, 'CRM de Ventas · Diagnóstico')}
  </section>`;
}

function propuesta() {
  return `<section class="page">
    <div class="kicker">02 · La propuesta</div>
    <h2>Lo que vendes, en una frase</h2>
    <p class="lead" style="font-size:12pt;color:#0f172a;font-weight:600;max-width:180mm">Volkern CRM es el sitio donde tu equipo ve qué hacer cada día para no perder ninguna venta. Ni una libreta más bonita, ni un programa para informáticos.</p>

    <div class="cols2" style="margin-top:6mm;gap:5mm">
      ${card('1', 'Captas', 'La web, los formularios, las llamadas y las campañas dejan de vivir en sitios distintos. Cada contacto entra con su origen, para saber qué canal trae clientes de verdad.')}
      ${card('2', 'Ordenas', 'Cada oportunidad tiene su etapa, su valor y su fecha. El embudo deja de ser una idea y se convierte en una lista de trabajo.')}
    </div>
    <div class="cols2" style="margin-top:4mm;gap:5mm">
      ${card('3', 'Acompañas', 'La siguiente llamada, el correo pendiente y el aviso de que algo se enfría. El seguimiento no depende de la memoria de nadie.')}
      ${card('4', 'Cierras y aprendes', 'Previsión del mes, motivos de pérdida y resultados por comercial. Lo que funciona se repite; lo que no, se corrige a tiempo.')}
    </div>

    <h3 style="margin-top:7mm;font-size:11.4pt">Lo que cambia el lunes por la mañana</h3>
    <div class="cols3" style="margin-top:3mm">
      <div>
        ${lista([
          '<b>Nadie pregunta «¿cómo vamos?»</b> El embudo está abierto en la pantalla de todos.',
          '<b>El comercial sabe por dónde empezar</b> sin revisar el correo durante una hora.',
        ])}
      </div>
      <div>
        ${lista([
          '<b>El director ve el riesgo</b> antes de que la oportunidad esté perdida, no en el cierre del trimestre.',
          '<b>Las propuestas dejan rastro</b> y se convierten en contrato sin reescribirlas.',
        ])}
      </div>
      <div>
        ${lista([
          '<b>El equipo deja de teclear dos veces</b> lo mismo en el CRM, en el correo y en la hoja de cálculo.',
          '<b>La empresa se queda con la cartera</b> aunque un comercial se vaya.',
        ])}
      </div>
    </div>

    <div class="quote" style="margin-top:5mm">
      <b>El pitch de treinta segundos:</b> «La mayoría de los equipos no pierden ventas porque vendan mal, sino porque el seguimiento depende de la memoria. Volkern CRM le dice cada mañana a cada comercial a quién llamar, qué está en riesgo y cuánto van a cerrar. Sin hojas de cálculo y sin perseguir a nadie.»
    </div>
    <div class="quote" style="margin-top:3.5mm;border-left-color:#94a3b8;background:#f8fafc">
      <b>Lo que no cambia:</b> tu equipo sigue vendiendo y la relación sigue siendo humana. Lo que desaparece es el trabajo de recordar, copiar y perseguir información.
    </div>
    ${pie(3)}
  </section>`;
}

function paginaEmbudo() {
  return `<section class="page">
    <div class="kicker">03 · El embudo</div>
    <h2>Todo lo que está en juego, <span class="azul">en una sola pantalla</span></h2>
    <p class="lead">Se acabó preguntar cómo va el mes. Cada oportunidad está en su etapa, con su valor, su probabilidad y los días que lleva parada.</p>
    ${shot('embudo', 'Embudo de ventas')}
    <div class="cols2" style="margin-top:5mm;gap:6mm">
      <div>
        <h3>Qué enseñar (y en qué orden)</h3>
        ${lista([
          '<b>Arrastra una tarjeta</b> de una etapa a otra. La previsión se recalcula sola: no hay que tocar una hoja de cálculo.',
          '<b>Compara la previsión con el objetivo.</b> El panel dice cuánto falta, no solo cuánto hay.',
          '<b>Abre una oportunidad.</b> Ahí se ve por qué está donde está y cuál es el siguiente paso.',
        ])}
      </div>
      <div>
        <h3>Lo que el cliente entiende sin explicación</h3>
        ${lista([
          'Quién lleva cada cuenta y en qué punto está.',
          'Qué se va a cerrar este mes y qué está en riesgo.',
          'Dónde se atasca el embudo: si hay muchas propuestas y pocos cierres, el problema no es la captación.',
        ])}
      </div>
    </div>
    <div class="quote"><b>Frase que funciona:</b> «Si tu equipo no sabe qué va a cerrar este mes, no tiene un embudo: tiene una lista de deseos.»</div>
    ${pie(4, 'CRM de Ventas · El embudo')}
  </section>`;
}

function paginaLead() {
  return `<section class="page">
    <div class="kicker">04 · La ficha del cliente</div>
    <h2>Antes de llamar, <span class="azul">el comercial ya sabe qué pasa</span></h2>
    <p class="lead">La ficha reúne la conversación, la propuesta, las veces que se abrió y la siguiente acción. Sin buscar en el correo ni interrumpir a un compañero.</p>
    ${shot('ficha-lead', 'Ficha del lead y siguiente paso')}
    <div class="cols2" style="margin-top:5mm;gap:6mm">
      <div>
        <h3>Lo que ve el comercial en diez segundos</h3>
        ${lista([
          '<b>El siguiente paso está escrito</b>, con hora y motivo. No es una lista de deseos: es una acción concreta.',
          '<b>El historial está ordenado:</b> llamadas, correos, reuniones y notas en el mismo sitio.',
          '<b>La puntuación dice a quién llamar primero</b>, no a quién grita más fuerte.',
        ])}
      </div>
      <div>
        <h3>Lo que ve el director</h3>
        ${lista([
          'Qué oportunidades tienen actividad real y cuáles están abandonadas.',
          'Qué comercial necesita ayuda antes de que sea tarde.',
          'De dónde vienen los leads que acaban comprando.',
          'Si el equipo cumple lo que promete al cliente.',
        ])}
      </div>
    </div>
    <div class="quote"><b>Frase para el cliente:</b> «Esto no es un cuaderno bonito. Es la razón por la que nadie de tu equipo vuelve a decir “se me pasó”.»</div>
    ${pie(5, 'CRM de Ventas · Ficha del cliente')}
  </section>`;
}

function paginaDia() {
  return `<section class="page">
    <div class="kicker">05 · El día a día</div>
    <h2>Cada comercial empieza el día <span class="azul">sabiendo qué hacer</span></h2>
    <p class="lead">Tres prioridades, los pendientes de hoy y los avisos que no pueden esperar. Diez minutos de rutina en lugar de una hora buscando información.</p>
    ${shot('mi-dia', 'Mi día: prioridades, tareas y avisos')}
    <div class="cols2" style="margin-top:5mm;gap:6mm">
      <div>
        <h3>Por qué se usa todos los días</h3>
        ${lista([
          '<b>El orden lo pone el dinero en juego</b> y el riesgo de pérdida, no la urgencia del último correo.',
          '<b>Las tareas vencidas suben solas.</b> No hay que acordarse de mirar una lista aparte.',
          '<b>Los avisos llegan antes</b> de que la oportunidad esté muerta: días sin contacto, propuestas que caducan.',
        ])}
      </div>
      <div>
        <h3>La rutina de diez minutos</h3>
        ${lista([
          '<b>2 minutos:</b> mira las tres prioridades del día.',
          '<b>5 minutos:</b> resuelve los avisos y reprograma lo que no toca hoy.',
          '<b>3 minutos:</b> cierra el día marcando lo hecho y dejando escrita la siguiente tarea.',
        ], 'check')}
      </div>
    </div>
    <div class="quote"><b>La diferencia con una lista de tareas:</b> aquí cada tarea está unida a un cliente, a una oportunidad y a un importe. Sabes por qué la haces y cuánto vale terminarla.</div>
    ${pie(6, 'CRM de Ventas · El día a día')}
  </section>`;
}

function paginaResultados() {
  return `<section class="page">
    <div class="kicker">06 · Los resultados</div>
    <h2>El lunes, en cinco minutos, <span class="azul">sabes qué corregir</span></h2>
    <p class="lead">Previsión, cierres, tasa de conversión y avance por comercial. Datos del mes en curso, no del trimestre pasado ni de una hoja que alguien actualizó el viernes.</p>
    ${shot('resultados', 'Resultados del equipo')}
    <div class="cols2" style="margin-top:5mm;gap:6mm">
      <div>
        <h3>Las cuatro preguntas que responde</h3>
        ${lista([
          '¿Vamos a llegar al objetivo o nos falta dinero?',
          '¿Dónde se atasca el embudo: captación, propuesta o cierre?',
          '¿Quién necesita ayuda esta semana?',
          '¿Por qué perdemos? Precio, competencia, tiempo o falta de seguimiento.',
        ])}
      </div>
      <div>
        <h3>Para el director comercial</h3>
        <p style="font-size:8.8pt;color:#475569">No es un panel para mirar: es una herramienta para decidir dónde poner el foco. La reunión de los lunes deja de ser una ronda de opiniones y pasa a ser una conversación sobre tres números.</p>
        <div class="card" style="margin-top:3mm;background:#fff">
          <p><b>Lo que se puede decir en la reunión:</b> «Tenemos 168.900 € en previsión, faltan 41.200 € y el 60 % está en dos oportunidades. O las movemos esta semana o el objetivo no sale.»</p>
        </div>
      </div>
    </div>
    <div class="quote"><b>Argumento de cierre:</b> «No te vendo un informe más bonito. Te vendo saber el lunes qué cambiar para que el viernes no te sorprenda el resultado.»</div>
    ${pie(7, 'CRM de Ventas · Resultados')}
  </section>`;
}

function paginaAutomatizaciones() {
  return `<section class="page">
    <div class="kicker">07 · El trabajo repetitivo</div>
    <h2>Lo que se hace solo <span class="azul">deja de olvidarse</span></h2>
    <p class="lead">Reparto de leads, recordatorios, avisos de oportunidades frías y tareas al cerrar. Reglas sencillas que se montan en dos minutos y se pausan cuando quieras.</p>
    ${shot('automatizaciones', 'Automatizaciones y reglas activas')}
    <div class="cols2" style="margin-top:5mm;gap:6mm">
      <div>
        <h3>Cuatro reglas que suelen convencer</h3>
        ${lista([
          '<b>Lead nuevo:</b> se asigna al comercial de guardia y se avisa. Nadie tiene que repartir a mano.',
          '<b>Propuesta sin respuesta:</b> a los tres días, recordatorio al comercial y un correo suave al cliente.',
          '<b>Oportunidad parada:</b> si lleva una semana sin actividad, se marca en riesgo y avisa al responsable.',
        ])}
      </div>
      <div>
        <h3 style="visibility:hidden">.</h3>
        ${lista([
          '<b>Cierre ganado:</b> se crea la tarea de alta del cliente y avisa a administración. No se pierde el traspaso.',
          '<b>Renovación:</b> aviso treinta días antes de que venza el contrato.',
        ])}
        <div class="card" style="margin-top:2mm;background:#fff">
          <p><b>La regla de oro:</b> automatiza el recordatorio, no la relación. El mensaje importante lo sigue escribiendo una persona.</p>
        </div>
      </div>
    </div>
    <div class="quote"><b>Frase que funciona:</b> «No se trata de que un robot venda por ti. Se trata de que tu equipo no pierda una venta por algo que se podía avisar solo.»</div>
    ${pie(8, 'CRM de Ventas · Automatizaciones')}
  </section>`;
}

function paginaCotizacion() {
  return `<section class="page">
    <div class="kicker">08 · La propuesta</div>
    <h2>Del presupuesto al cobro, <span class="azul">sin versiones sueltas</span></h2>
    <p class="lead">Una propuesta con su historial: cuándo se envió, cuántas veces se abrió, qué se habló después y cuál es el siguiente paso. La misma verdad para el comercial, el cliente y administración.</p>
    ${shot('cotizacion', 'Cotización con seguimiento')}
    <div class="cols2" style="margin-top:5mm;gap:6mm">
      <div>
        <h3>Lo que se ve en la pantalla</h3>
        ${lista([
          '<b>Plantillas con tus conceptos</b>, descuentos e impuestos. Sin rehacer el documento cada vez.',
          '<b>Sabes si el cliente la ha leído</b> antes de llamarle. La llamada cambia por completo.',
          '<b>Se convierte en contrato</b> sin volver a teclearla.',
          '<b>Todo queda unido</b> a la oportunidad, al cliente y a su historial.',
        ])}
      </div>
      <div>
        <h3>Lo que resuelve de verdad</h3>
        <p style="font-size:8.8pt;color:#475569">El problema no es hacer el PDF. Es saber qué pasa después de enviarlo. ¿La ha visto el que decide? ¿Se quedó en la bandeja de un asistente? ¿La están comparando con otra? Sin ese dato, el seguimiento es a ciegas.</p>
        <div class="card" style="margin-top:3mm;background:#fff">
          <p><b>Pregunta para la demo:</b> «¿Cuántas propuestas has enviado este mes y no sabes si las han leído?»</p>
        </div>
      </div>
    </div>
    <div class="quote"><b>Cierre:</b> «Cada propuesta que envías sin seguimiento es una venta que depende de que el cliente se acuerde de ti. Esto pone el recordatorio de tu lado.»</div>
    ${pie(9, 'CRM de Ventas · Propuestas')}
  </section>`;
}

function comparativa() {
  return `<section class="page">
    <div class="kicker">09 · El coste real</div>
    <h2>No es un gasto más: <span class="azul">es una herramienta menos</span></h2>
    <p class="lead">La mayoría de equipos pequeños no compara un CRM con otro CRM. Compara un CRM, una herramienta de email, una de tareas, otra de automatización y una hoja de cálculo. Ahí está la conversación.</p>

    <table class="pay" style="margin-top:3mm">
      <tr><th style="width:38%">Lo que necesitas</th><th style="width:31%">Hoy, repartido</th><th style="width:31%">Con Volkern</th></tr>
      <tr><td>Contactos, empresas y leads</td><td>CRM + hoja de cálculo</td><td><b>Un solo sitio</b></td></tr>
      <tr><td>Embudo y seguimiento</td><td>CRM + memoria del comercial</td><td><b>Un solo sitio</b></td></tr>
      <tr><td>Email y mensajería</td><td>Herramienta de email + WhatsApp</td><td><b>Un solo sitio</b></td></tr>
      <tr><td>Llamadas y agenda</td><td>Telefonía + calendario</td><td><b>Un solo sitio</b></td></tr>
      <tr><td>Presupuestos y contratos</td><td>Word + firma aparte</td><td><b>Un solo sitio</b></td></tr>
      <tr><td>Tareas y seguimiento diario</td><td>Gestor de tareas</td><td><b>Un solo sitio</b></td></tr>
      <tr><td>Informes y previsión</td><td>Hoja de cálculo</td><td><b>Un solo sitio</b></td></tr>
    </table>

    <div class="cols2" style="margin-top:6mm;gap:5mm">
      <div class="card" style="background:#fff;border-color:#e2e8f0">
        <div class="kicker" style="color:#94a3b8">Suma de referencias habituales</div>
        <div class="stat"><span class="big" style="color:#94a3b8">190 €</span><span class="unit">/mes</span></div>
        <p style="margin-top:1mm">CRM 50 € · automatización 40 € · telefonía 25 € · email 20 € · tareas 25 € · informes 30 €.</p>
      </div>
      <div class="big-card">
        <div class="kicker" style="color:#1d4ed8">Volkern CRM de Ventas · Profesional</div>
        <div class="stat"><span class="big" style="color:#1e3a8a">${num(nivel('profesional').annualMonthly)} €</span><span class="unit" style="color:#3b5bdb">/usuario/mes + IVA</span></div>
        <p style="margin-top:1mm">Todo lo anterior en un solo lugar, con contratos, previsión y automatizaciones sin tope. Sin comisiones sobre tus ventas.</p>
        <div class="nota">El Esencial son ${num(nivel('esencial').annualMonthly)} € y el Avanzado ${num(nivel('avanzado').annualMonthly)} € (anual). ${TRIAL} días gratis, sin tarjeta.</div>
      </div>
    </div>

    <div class="cols3" style="margin-top:5mm">
      <div class="card" style="background:#fff"><h3>El tiempo</h3><p>Una hora al día buscando datos entre cinco herramientas son cinco semanas al año por comercial.</p></div>
      <div class="card" style="background:#fff"><h3>Los errores</h3><p>Dos versiones del mismo presupuesto, un cliente que recibe el precio equivocado y una venta que se enfría.</p></div>
      <div class="card" style="background:#fff"><h3>La memoria</h3><p>Si el conocimiento se va con la persona, la empresa no tiene un activo: tiene una dependencia.</p></div>
    </div>

    <div class="quote"><b>Cómo usarlo sin exagerar:</b> «No te digo que tu CRM actual sea malo. Te digo que estás pagando cinco cosas para hacer una, y que el dato importante se pierde entre ellas.»</div>
    <p style="margin-top:3.5mm;font-size:7.4pt;color:#94a3b8;line-height:1.45">Las cifras de 50/40/25/20/25/30 € son referencias orientativas de mercado para ordenar la conversación, no una comparativa verificada ni una oferta. El precio de Volkern CRM es el publicado en volkern.app/precios.</p>
    ${pie(10, 'CRM de Ventas · Coste real')}
  </section>`;
}

function encaje() {
  return `<section class="page">
    <div class="kicker">10 · El comprador</div>
    <h2>A quién le resuelve el problema <span class="azul">(y a quién no)</span></h2>
    <p class="lead">Vender a la persona equivocada es la forma más rápida de perder una semana. Estas señales se ven en la primera conversación.</p>

    <div class="cols2" style="gap:5mm">
      <div class="card" style="background:#f0fdf4;border-color:#bbf7d0">
        <h3 style="color:#065f46">Es para él si…</h3>
        ${lista([
          'Tiene entre 2 y 50 comerciales, o va a contratar al segundo.',
          'El ciclo de venta lleva varias conversaciones: no se cierra en una llamada.',
          'Recibe leads por más de un canal y no sabe cuál funciona mejor.',
          'El fundador o el director todavía hace de CRM preguntando uno por uno.',
          'Necesita explicar a un socio, un banco o un inversor cuánto va a facturar.',
        ], 'check')}
      </div>
      <div class="card" style="background:#fff7ed;border-color:#fed7aa">
        <h3 style="color:#9a3412">No es para él si…</h3>
        ${lista([
          'Vende una vez al año y le basta con el correo y una libreta.',
          'Nadie va a dedicar una hora a configurar el embudo y formar al equipo.',
          'Espera que los datos se metan solos y que el CRM piense por él.',
          'Solo busca el precio más barato y no tiene un problema que resolver.',
        ], 'x')}
      </div>
    </div>

    <h3 style="margin-top:7mm;font-size:11.4pt">Tres momentos en los que se vende solo</h3>
    <div class="cols3" style="margin-top:3mm">
      ${card('1', 'Contrata al segundo comercial', 'La cartera deja de caber en la cabeza de una persona. Hace falta un sitio común para repartir y no pisarse.')}
      ${card('2', 'Se le escapa un cliente grande', 'La reunión posterior es la mejor puerta: «¿Cómo vamos a evitar que vuelva a pasar?»')}
      ${card('3', 'Le piden previsión', 'Banco, socio o inversor. Si la respuesta se construye en Excel la noche anterior, el problema ya está claro.')}
    </div>

    <h3 style="margin-top:7mm;font-size:11.4pt">Cinco preguntas de descubrimiento</h3>
    <div class="cols2" style="margin-top:3mm;gap:4mm 6mm">
      ${lista([
        '¿Cuántos leads entran al mes y cuántos llegan a tocarse?',
        '¿Dónde apuntáis ahora el seguimiento: CRM, Excel, WhatsApp?',
        '¿Cuántos comerciales sois y quién reparte las oportunidades?',
      ])}
      ${lista([
        '¿Cómo sabéis hoy qué vais a cerrar este mes?',
        'Si mañana se va el comercial que más vende, ¿qué se queda en la empresa?',
      ])}
    </div>

    <div class="quote"><b>Regla de oro:</b> no vendas a quien no tiene el problema. Si no hay seguimiento que ordenar, no hay venta que hacer; y forzarla te cuesta la reputación.</div>
    ${pie(11, 'CRM de Ventas · Comprador')}
  </section>`;
}

function precio() {
  return paginaPrecio(pie);
}

function oferta() {
  return paginaOferta(pie);
}

function objeciones() {
  const filas = [
    [
      '«Ya tengo un CRM.»',
      'Perfecto. La pregunta no es si tienes uno, sino si tu equipo lo abre todos los días. ¿Cuántas oportunidades llevan más de una semana sin tocarse?',
    ],
    [
      '«Es caro.»',
      `${ENTRADA} €/usuario/mes en el Esencial son ${(ENTRADA / 30).toFixed(2).replace('.', ',')} € al día por usuario. Un equipo de cuatro son ${num(ENTRADA * 4)} € al mes con facturación anual, y una sola venta recuperada paga el año. Si necesita contratos y previsión, el Profesional son ${num(nivel('profesional').annualMonthly)} €; la IA y el MCP, ${num(nivel('avanzado').annualMonthly)} €.`,
    ],
    [
      '«Mi equipo no lo va a usar.»',
      'Por eso la primera pantalla es «Mi día»: tres prioridades y los pendientes. Si el comercial abre eso y ve su trabajo, vuelve mañana. Si abre un formulario vacío, no vuelve.',
    ],
    [
      '«No tengo tiempo para implantarlo.»',
      'Una sesión de 60–90 minutos para configurar el embudo y una hora para formar al equipo. El resto se aprende usándolo, no con un manual.',
    ],
    [
      '«¿Y mis datos?»',
      'Son tuyos. Cada persona ve solo lo que le corresponde según su rol, y puedes solicitar una copia de tus datos cuando quieras. No se usan para vender a tus clientes.',
    ],
    [
      '«¿Funciona en el móvil?»',
      'Sí. Se usa desde el navegador del móvil: el comercial puede mirar su día, llamar y actualizar una oportunidad sin volver al ordenador.',
    ],
    [
      '«Ya probamos uno y no funcionó.»',
      '¿Lo configurasteis con vuestras etapas o con las de fábrica? La mayoría de abandonos vienen de un embudo que no se parece al negocio y de nadie que lo revise la primera semana.',
    ],
    [
      '«Déjame pensarlo.»',
      'Claro. Para que lo pienses con algo real: te dejo la prueba abierta con vuestros contactos. En una semana miramos juntos si el equipo lo ha usado. Si no, no hay nada que decidir.',
    ],
  ];

  return `<section class="page">
    <div class="kicker">13 · Las conversaciones difíciles</div>
    <h2>Ocho objeciones, <span class="azul">ocho respuestas</span></h2>
    <p class="lead">No hace falta improvisar. Estas respuestas están pensadas para seguir la conversación, no para ganar el debate.</p>

    <div style="display:flex;flex-direction:column;gap:3.2mm;margin-top:2mm">
      ${filas.map(([objecion, respuesta]) => `
        <div style="border:1px solid #e6ebf2;border-radius:2.4mm;padding:3.2mm 4mm;background:#fbfcfe;display:grid;grid-template-columns:56mm 1fr;gap:4mm;align-items:start">
          <div style="font-size:9.4pt;font-weight:750;color:#0b1220">${objecion}</div>
          <div style="font-size:8.5pt;color:#475569;line-height:1.5">${respuesta}</div>
        </div>`).join('')}
    </div>

    <div class="quote" style="margin-top:4mm"><b>Lo que nunca conviene:</b> discutir con el CRM que ya tiene, prometer que «todo se integra» o bajar el precio para cerrar. El precio bajo no arregla un problema de adopción.</div>
    ${pie(13, 'CRM de Ventas · Objeciones')}
  </section>`;
}

function demo() {
  return `<section class="page">
    <div class="kicker">14 · La reunión</div>
    <h2>Quince minutos <span class="azul">para que lo vea claro</span></h2>
    <p class="lead">No enseñes todo el producto. Enseña cuatro pantallas en el orden en que el cliente vive su problema. La demo se gana con una pregunta bien hecha, no con veinte funciones.</p>

    <table class="pay" style="margin-top:2mm">
      <tr><th style="width:14%">Minuto</th><th style="width:44%">Qué enseñas</th><th style="width:42%">Qué consigues</th></tr>
      <tr><td class="mono"><b>0–2</b></td><td>Nada. Preguntas: leads al mes, dónde apuntan el seguimiento, cómo hacen la previsión.</td><td>Que hable él. El problema queda dicho con sus palabras.</td></tr>
      <tr><td class="mono"><b>2–5</b></td><td>El embudo. Arrastra una tarjeta y enseña la previsión frente al objetivo.</td><td>Ve el mes de un vistazo, sin pedir un informe.</td></tr>
      <tr><td class="mono"><b>5–8</b></td><td>Una ficha real: historial, siguiente paso, aperturas de la propuesta.</td><td>Entiende que nadie vuelve a decir «se me pasó».</td></tr>
      <tr><td class="mono"><b>8–10</b></td><td>«Mi día»: prioridades, tareas y avisos.</td><td>Se imagina al comercial usándolo el lunes.</td></tr>
      <tr><td class="mono"><b>10–12</b></td><td>Resultados: previsión, tasa de cierre y comparativa por comercial.</td><td>El director ve su reunión de los lunes resuelta.</td></tr>
      <tr><td class="mono"><b>12–14</b></td><td>Una automatización: propuesta sin respuesta a los tres días.</td><td>Entiende que el sistema trabaja cuando él no mira.</td></tr>
      <tr><td class="mono"><b>14–15</b></td><td>Nivel que encaja, prueba de ${TRIAL} días y siguiente paso con fecha.</td><td>Una decisión pequeña y reversible, no una compra a ciegas.</td></tr>
    </table>

    <div class="cols2" style="margin-top:6mm;gap:5mm">
      <div class="card" style="background:#eff6ff;border-color:#bfdbfe">
        <h3 style="color:#1e3a8a">Antes de la reunión</h3>
        ${lista([
          'Prepara una cuenta con datos parecidos a su negocio.',
          'Elige las cuatro pantallas; deja el resto fuera.',
          'Ten escrita la pregunta de descubrimiento que vas a hacer primero.',
        ], 'check')}
      </div>
      <div class="card" style="background:#f0fdf4;border-color:#bbf7d0">
        <h3 style="color:#065f46">Señales de que va bien</h3>
        ${lista([
          'Pregunta «¿esto lo puede usar mi equipo?»: está pensando en la adopción.',
          'Pide ver una oportunidad concreta suya: quiere el espejo, no la demo.',
          'Pregunta por la puesta en marcha: el precio ya no es el tema.',
        ], 'check')}
      </div>
    </div>

    <div class="quote"><b>No cierres con «te mando información».</b> Cierra con una fecha: «Te dejo la prueba abierta hoy y el jueves a las 10 miramos juntos si el equipo la ha usado. ¿Te va bien el jueves?»</div>
    ${pie(15, 'CRM de Ventas · Demo')}
  </section>`;
}

function cierre() {
  return `<section class="page cierre">
    <div class="cierre-inner">
      <div class="kicker">Para terminar</div>
      <h2>La venta no se pierde en el precio. <em>Se pierde en el seguimiento.</em></h2>
      <p style="margin-top:4mm;max-width:165mm">Cuando el comercial vuelve a llamar a tiempo, cuando el director sabe qué va a cerrar y cuando la propuesta no se queda en el olvido, el resultado cambia. Eso es lo que se vende.</p>

      <div class="pasos">
        <div class="paso"><b>Paso 1</b><strong>Detecta</strong><span>Busca las cinco frases de la página 2. Si aparecen, hay problema que resolver.</span></div>
        <div class="paso"><b>Paso 2</b><strong>Demuestra</strong><span>Cuatro pantallas, quince minutos, sus datos. Nada más.</span></div>
        <div class="paso"><b>Paso 3</b><strong>Compromete</strong><span>Prueba de 14 días con una fecha para revisar si el equipo la ha usado.</span></div>
      </div>

      <div class="precio">
        <div class="cifra">Desde ${ENTRADA} €<small> /usuario/mes + IVA</small></div>
        <div class="det">Esencial ${num(nivel('esencial').annualMonthly)} € · Profesional ${num(nivel('profesional').annualMonthly)} € · Avanzado ${num(nivel('avanzado').annualMonthly)} € (anual).<br>${TRIAL} días gratis, sin tarjeta. Sin permanencia ni comisiones sobre tus ventas.<br><b style="color:#e0f2fe">volkern.app/precios</b></div>
      </div>

      <div style="margin-top:12mm;border-top:1px solid rgba(148,163,184,.28);padding-top:8mm">
        <div style="font-size:7.6pt;letter-spacing:.2em;text-transform:uppercase;color:#67e8f9;font-weight:800">La idea que se lleva el cliente</div>
        <div style="font-size:17pt;line-height:1.3;color:#e0f2fe;font-weight:700;max-width:162mm;margin-top:3mm;letter-spacing:-.01em">«No compro un CRM. Compro dejar de perder las ventas que ya tenía.»</div>
      </div>

      <div class="check">
        <b>Antes de cerrar la reunión, comprueba</b>
        <div class="cols2">
          <div>He identificado cuál de las cinco frases ha dicho.</div>
          <div>Tengo una fecha para la demo, no un «te mando información».</div>
          <div>Sé quién decide y quién firma.</div>
          <div>He dejado la prueba abierta con sus datos.</div>
        </div>
      </div>

      <div class="fin">
        <div><b>Equipo comercial de Volkern</b><br>CRM de Ventas · Dossier interno · Octubre de 2026</div>
        <div style="max-width:76mm;text-align:right;font-size:6.8pt;line-height:1.5">Las pantallas muestran el panel con datos de demostración: los importes y nombres de los ejemplos son ficticios. Los precios son los publicados en volkern.app/precios.</div>
      </div>
    </div>
  </section>`;
}

/* ───────────────────────────── Generación ───────────────────────────────── */

function construirHtml() {
  if (CLIENTE) {
    const paginas = paginasCliente({ pie, shot, lista, card, imagenes: IMAGENES });
    return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Volkern CRM de Ventas · Dossier del producto</title>
<meta name="author" content="Volkern">
<style>${CSS}</style>
</head>
<body>
${paginas.join('\n')}
</body>
</html>`;
  }

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Volkern CRM de Ventas · Dossier comercial</title>
<meta name="author" content="Volkern">
<style>${CSS}</style>
</head>
<body>
${portada()}
${diagnostico()}
${propuesta()}
${paginaEmbudo()}
${paginaLead()}
${paginaDia()}
${paginaResultados()}
${paginaAutomatizaciones()}
${paginaCotizacion()}
${comparativa()}
${encaje()}
${precio()}
${oferta()}
${objeciones()}
${demo()}
${cierre()}
</body>
</html>`;
}

async function main() {
  fs.mkdirSync(DIR_CAPTURAS, { recursive: true });
  fs.mkdirSync(DIR_TMP, { recursive: true });

  const capturasReales = process.env.DOSSIER_CAPTURAS_REALES === '1';
  if (CLIENTE) console.log('→ Variante de cliente: sin precios ni material interno');
  if (capturasReales) {
    console.log('→ Usando las capturas reales del panel …');
  } else {
    console.log('→ Generando pantallas del producto …');
    await generarCapturas(DIR_CAPTURAS);
  }
  cargarImagenes();

  const faltan = ['embudo', 'ficha-lead', 'mi-dia', 'resultados', 'automatizaciones', 'cotizacion'].filter((k) => !IMAGENES[k]);
  if (faltan.length) throw new Error(`Faltan capturas: ${faltan.join(', ')}`);

  const html = construirHtml();
  const htmlPath = path.join(DIR_TMP, 'dossier-crm-ventas.html');
  fs.writeFileSync(htmlPath, html, 'utf8');
  fs.writeFileSync(SALIDA_HTML, html, 'utf8');

  console.log('→ Componiendo el PDF …');
  const navegador = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none'],
  });

  try {
    const page = await navegador.newPage();
    await page.goto(`file://${htmlPath}`, { waitUntil: 'load', timeout: 120000 });
    await page.evaluate(() => document.fonts.ready).catch(() => {});
    await new Promise((r) => setTimeout(r, 1200));
    await page.pdf({
      path: SALIDA_PDF,
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      displayHeaderFooter: false,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
    });
  } finally {
    await navegador.close();
  }

  const kb = (fs.statSync(SALIDA_PDF).size / 1024 / 1024).toFixed(2);
  console.log(`✓ ${path.relative(RAIZ, SALIDA_PDF)} (${kb} MB)`);
  console.log(`✓ ${path.relative(RAIZ, SALIDA_HTML)}`);
  console.log(`✓ ${path.relative(RAIZ, DIR_CAPTURAS)}/ (6 pantallas)`);
}

// Solo genera cuando se ejecuta como script: el test importa las piezas de
// precio (scripts/dossier-crm-ventas/) sin lanzar Chromium.
if (require.main === module) {
  main().catch((e) => {
    console.error('❌ Error generando el dossier:', e.message);
    process.exit(1);
  });
}
