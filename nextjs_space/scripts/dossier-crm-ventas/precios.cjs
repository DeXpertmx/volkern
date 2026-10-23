/**
 * Páginas «El precio» y «La puesta en marcha» del dossier comercial de CRM.
 *
 * Van aparte del generador para poder probarlas sin puppeteer: el test las
 * compara con `lib/crm-pricing.ts`. Toda cifra sale de la escalera; aquí no se
 * escribe ningún precio a mano.
 *
 * Los nombres de clase (page, card, pay, quote…) son los del CSS del generador.
 */
const {
  escalera,
  ENTRADA,
  TRIAL,
  MAX_ASIENTOS,
  nivel,
  precioMedioPorUsuario,
  num,
  miles,
} = require('./escalera.cjs')

const SI = '<span class="si">✓</span>'
const NO = '<span class="no">—</span>'

function lista(items, clase = '') {
  return `<ul class="lista ${clase}">${items.map((i) => `<li>${i}</li>`).join('')}</ul>`
}

function fila(etiqueta, celdas) {
  return `<tr><td>${etiqueta}</td>${celdas.map((c) => `<td class="c">${c}</td>`).join('')}</tr>`
}

function tarjetaNivel(tier, destacado = false) {
  const fondo = destacado
    ? 'background:linear-gradient(140deg,#eff6ff,#eef2ff);border-color:#bfdbfe'
    : 'background:#fff'
  return `<div class="card" style="${fondo}">
    <div class="kicker" style="margin-bottom:1.2mm;color:${destacado ? '#1d4ed8' : '#64748b'}">${tier.name}</div>
    <div class="stat"><span class="big" style="font-size:22pt;${destacado ? 'color:#1e3a8a' : ''}">${num(tier.annualMonthly)} €</span><span class="unit">/usuario/mes</span></div>
    <p style="margin-top:1.4mm;font-size:7.8pt;line-height:1.4">${num(tier.monthly)} € pagando mes a mes.<br><b>${tier.audience}</b></p>
  </div>`
}

/** Tabla de funciones por nivel, derivada de los límites del módulo de precios. */
function matrizNiveles() {
  const tiers = escalera.tiers
  const filas = [
    ['Embudos activos', tiers.map((t) => t.limits.maxPipelines)],
    ['Automatizaciones activas', tiers.map((t) => t.limits.maxAutomations)],
    ['Cotizaciones con seguimiento', tiers.map(() => SI)],
    ['Contratos y firma digital', tiers.map((t) => (t.limits.contracts ? SI : NO))],
    ['Previsión por comercial', tiers.map((t) => (t.limits.forecast ? SI : NO))],
    ['IA: siguiente acción y riesgo', tiers.map((t) => (t.limits.ai ? SI : NO))],
    ['Roleplay de ventas (Academy)', tiers.map((t) => (t.limits.academy ? SI : NO))],
    ['API y servidor MCP', tiers.map((t) => (t.limits.api ? SI : NO))],
  ]

  return `<table class="pay compact" style="margin-top:3mm">
    <tr><th style="width:40%">Función</th>${tiers.map((t) => `<th class="c">${t.name}</th>`).join('')}</tr>
    ${filas.map(([etiqueta, celdas]) => fila(etiqueta, celdas)).join('')}
  </table>`
}

/** Precio medio por usuario a distintos tamaños de equipo (facturación anual). */
function escaleraVolumen() {
  const tiers = escalera.tiers
  const tamanos = [...new Set([1, 10, 50, 250, MAX_ASIENTOS])]
    .filter((n) => n >= 1 && n <= MAX_ASIENTOS)
    .sort((a, b) => a - b)

  return `<table class="pay compact" style="margin-top:3mm">
    <tr><th style="width:28%">Usuarios</th>${tiers.map((t) => `<th class="c">${t.name}</th>`).join('')}</tr>
    ${tamanos
      .map((n) =>
        fila(
          `${miles(n)}${n === MAX_ASIENTOS ? ' (máx. en línea)' : ''}`,
          tiers.map((t) => `${num(precioMedioPorUsuario(t.id, 'yearly', n))} €`),
        ),
      )
      .join('')}
  </table>`
}

function paginaPrecio(pie) {
  const tiers = escalera.tiers
  return `<section class="page">
    <div class="kicker">11 · La oferta</div>
    <h2>Se paga por usuario, <span class="azul">no por módulo suelto</span></h2>
    <p class="lead">Tres niveles y un precio por persona. El Esencial cubre a quien deja el Excel; el Profesional añade contratos y previsión; el Avanzado pone la IA, la API y el MCP. A partir de diez asientos el precio medio baja por tramos.</p>

    <div class="cols3" style="gap:3.5mm">
      ${tiers.map((t) => tarjetaNivel(t, t.id === 'avanzado')).join('')}
    </div>

    <h3 style="margin-top:5mm;font-size:11pt">Qué abre cada nivel</h3>
    ${matrizNiveles()}

    <h3 style="margin-top:5mm;font-size:11pt">Cuanto más equipo, menos por usuario <span style="font-weight:500;color:#64748b;font-size:8.4pt">(facturación anual)</span></h3>
    ${escaleraVolumen()}

    <p style="margin-top:2.5mm;font-size:7.4pt;color:#94a3b8;line-height:1.45">Cada tramo descuenta solo los asientos que caen dentro de él: añadir un comercial siempre suma poco y nunca sube el precio medio. Hasta ${miles(MAX_ASIENTOS)} asientos se contrata en línea; por encima el precio es a medida (compromiso anual, SSO y soporte dedicado). Importes sin IVA y prueba de ${TRIAL} días gratis, sin tarjeta.</p>

    <div class="quote" style="margin-top:4mm"><b>Cómo cerrar el precio:</b> «${ENTRADA} €/usuario/mes no compiten con otro CRM: compiten con lo que te cuesta una oportunidad que se enfría.»</div>
    ${pie(12, 'CRM de Ventas · Precio')}
  </section>`
}

function paginaOferta(pie) {
  const pro = nivel('profesional')
  const avanzado = nivel('avanzado')
  return `<section class="page">
    <div class="kicker">12 · La puesta en marcha</div>
    <h2>Qué pasa desde que dice sí</h2>
    <p class="lead">Dos sesiones y ${TRIAL} días de prueba. Sin implantación de meses ni consultoría obligatoria: el objetivo es que el lunes cada comercial sepa dónde mirar.</p>

    <div class="cols2" style="gap:4mm 5mm">
      <div class="card" style="background:#fff"><h3>1 · Alta de la cuenta</h3><p>Diez minutos. Nombre, usuarios, módulos y el nivel contratado. Sin tarjeta durante la prueba.</p></div>
      <div class="card" style="background:#fff"><h3>2 · Importar contactos y leads</h3><p>Se traen desde un archivo o desde el CRM anterior. No se empieza de cero ni se teclea dos veces.</p></div>
      <div class="card" style="background:#fff"><h3>3 · Configurar el embudo</h3><p>Una sesión de 60–90 minutos con las etapas reales del negocio, no las de fábrica.</p></div>
      <div class="card" style="background:#fff"><h3>4 · Formar al equipo</h3><p>Una hora: dónde mirar el lunes, cómo mover una oportunidad y cómo dejar escrita la siguiente tarea.</p></div>
    </div>

    <div class="big-card" style="margin-top:5mm">
      <div class="kicker" style="color:#1d4ed8">La prueba</div>
      <p style="font-size:9.4pt"><b>${TRIAL} días gratis, sin tarjeta y sin permanencia.</b> Se cancela desde facturación en un clic. Sin comisiones sobre tus ventas.</p>
      <div class="nota">La prueba incluye el nivel que se va a contratar, no una versión recortada: si compra el Avanzado, prueba el Avanzado con la IA y el MCP.</div>
    </div>

    <div class="card" style="background:#fef2f2;border-color:#fecaca;margin-top:5mm">
      <h3 style="color:#991b1b">Qué no prometer (aunque lo pidan)</h3>
      <div class="cols2" style="gap:4mm 6mm;margin-top:1mm">
        ${lista([
          '<b>Que se configura solo.</b> La primera hora con el cliente es lo que decide si se usa.',
          '<b>Previsiones exactas.</b> La previsión es tan buena como los datos que mete el equipo.',
        ], 'x')}
        ${lista([
          '<b>Que sustituye al comercial.</b> Ordena el trabajo; la relación sigue siendo humana.',
          '<b>Integraciones no verificadas.</b> Si no está probada con su herramienta, no se promete.',
        ], 'x')}
      </div>
    </div>

    <h3 style="margin-top:6mm;font-size:11pt">Cómo defender el precio sin bajar nada</h3>
    <div class="cols2" style="gap:4mm 6mm;margin-top:2mm">
      ${lista([
        `<b>Divide:</b> ${ENTRADA} €/usuario/mes son ${(ENTRADA / 30).toFixed(2).replace('.', ',')} € al día. Menos que un café.`,
        '<b>Compara con una venta:</b> una sola operación recuperada paga el año entero.',
      ])}
      ${lista([
        `<b>Sube de nivel, no de descuento:</b> si necesita contratos y previsión, el Profesional son ${num(pro.annualMonthly)} €; la IA y el MCP llegan con el Avanzado, ${num(avanzado.annualMonthly)} €.`,
        '<b>No regales descuento:</b> si el problema es el precio, el problema es el valor; vuelve a la cuenta de la página 2.',
      ])}
    </div>

    <div class="quote"><b>Frase de cierre:</b> «No te pido que cambies de sistema. Te pido que pruebes ${TRIAL} días con vuestros datos y decidas con la pantalla delante.»</div>
    ${pie(13, 'CRM de Ventas · Puesta en marcha')}
  </section>`
}

module.exports = {
  paginaPrecio,
  paginaOferta,
  matrizNiveles,
  escaleraVolumen,
  tarjetaNivel,
}
