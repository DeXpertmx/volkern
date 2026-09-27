#!/usr/bin/env node
/**
 * Brochure comercial de Volkern Hospitality — HTML para imprimir a PDF
 * con Chrome headless (--print-to-pdf), igual que la guía de usuario.
 *
 * Uso: node scripts/generar-pdf-brochure-hospitality.cjs
 * Salida: /tmp/brochure-hospitality.html
 */
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.join(__dirname, '..');
const IMG = (rel) => {
  const datos = fs.readFileSync(path.join(RAIZ, 'docs', rel));
  return `data:image/jpeg;base64,${datos.toString('base64')}`;
};

// Capturas del flujo del huésped y del panel.
const img = {
  huesped1: IMG('img/booking-guia/paso1-fechas.jpg'),
  huesped2: IMG('img/booking-guia/paso2-disponibilidad.jpg'),
  huesped3: IMG('img/booking-guia/paso3-modal-datos.jpg'),
  huesped5: IMG('img/booking-guia/paso5-confirmacion.jpg'),
  dashboard: IMG('img/brochure-panel/01-dashboard.jpg'),
  reservas: IMG('img/brochure-panel/02-reservas.jpg'),
  planning: IMG('img/brochure-panel/03-planning.jpg'),
  finanzas: IMG('img/brochure-panel/04-finanzas.jpg'),
  tarifas: IMG('img/brochure-panel/05-tarifas.jpg'),
  engine: IMG('img/brochure-panel/06-booking-engine.jpg'),
  reportes: IMG('img/brochure-panel/07-reportes.jpg'),
};

const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Volkern Hospitality — Brochure comercial</title>
<style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body {
    font-family: 'Inter', 'Segoe UI', 'Noto Sans', 'DejaVu Sans', Arial, sans-serif;
    color: #1e293b;
    font-size: 9.5pt;
    line-height: 1.5;
  }
  .page {
    width: 210mm; height: 296.5mm;
    padding: 14mm 13mm;
    position: relative;
    overflow: hidden;
    break-after: page;
    page-break-after: always;
  }
  .page:last-child { break-after: auto; page-break-after: auto; }

  /* ---------- Portada ---------- */
  .portada { background: linear-gradient(160deg, #0f172a 0%, #1e1b4b 55%, #312e81 100%); color: #fff; display: flex; flex-direction: column; }
  .portada .marca { letter-spacing: 0.4em; text-transform: uppercase; font-size: 12pt; color: #a5b4fc; }
  .portada h1 { font-size: 34pt; line-height: 1.12; margin-top: 8mm; font-weight: 800; }
  .portada h1 span { color: #818cf8; }
  .portada .sub { font-size: 13pt; color: #c7d2fe; margin-top: 6mm; max-width: 150mm; line-height: 1.55; }
  .portada .captura-marco {
    margin-top: 10mm; border-radius: 8px; overflow: hidden;
    box-shadow: 0 18px 40px rgba(0,0,0,.45); border: 1px solid rgba(255,255,255,.18);
  }
  .portada .captura-marco img { width: 100%; display: block; }
  .portada .pie { margin-top: auto; display: flex; justify-content: space-between; align-items: flex-end; color: #94a3b8; font-size: 8pt; }
  .portada .chips { display: flex; gap: 3mm; margin-top: 8mm; flex-wrap: wrap; }
  .chip { border: 1px solid rgba(165,180,252,.45); color: #e0e7ff; border-radius: 999px; padding: 1.6mm 4.5mm; font-size: 8.5pt; }

  /* ---------- Estructura general ---------- */
  h2 { font-size: 17pt; color: #1e1b4b; margin-bottom: 2.5mm; }
  h2 .num { color: #6366f1; }
  .kicker { text-transform: uppercase; letter-spacing: 0.22em; font-size: 7.5pt; color: #6366f1; font-weight: 700; margin-bottom: 2mm; }
  .lead { color: #475569; font-size: 10pt; margin-bottom: 6mm; }
  .pie-page { position: absolute; bottom: 8mm; left: 13mm; right: 13mm; display: flex; justify-content: space-between; font-size: 7.5pt; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 2.5mm; }

  .cols2 { display: grid; grid-template-columns: 1fr 1fr; gap: 6mm; }
  .cols3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 4.5mm; }

  .card { border: 1px solid #e2e8f0; border-radius: 8px; padding: 4.5mm 5mm; background: #f8fafc; }
  .card h3 { font-size: 10.5pt; color: #1e1b4b; margin-bottom: 1.5mm; }
  .card p { color: #475569; font-size: 8.8pt; }

  .captura { border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; box-shadow: 0 6px 18px rgba(15,23,42,.10); }
  .captura img { width: 100%; display: block; }
  .pie-captura { font-size: 7.5pt; color: #64748b; margin: 1.5mm 0 0 1mm; }

  .lista { list-style: none; }
  .lista li { padding-left: 5.5mm; position: relative; margin-bottom: 2.2mm; color: #334155; font-size: 9pt; }
  .lista li::before { content: '✓'; position: absolute; left: 0; color: #059669; font-weight: 700; }
  .lista.monos li::before { content: '·'; color: #6366f1; font-size: 14pt; line-height: 0.55; top: 2.2mm; }

  /* ---------- Tablas de plan ---------- */
  table { width: 100%; border-collapse: collapse; font-size: 8.2pt; }
  th { background: #1e1b4b; color: #fff; text-align: left; padding: 2.6mm 3mm; font-weight: 600; }
  th.c, td.c { text-align: center; }
  td { padding: 2.2mm 3mm; border-bottom: 1px solid #e2e8f0; color: #334155; }
  tr:nth-child(even) td { background: #f8fafc; }
  td.si { color: #059669; font-weight: 700; }
  td.no { color: #cbd5e1; }

  .destacado {
    background: linear-gradient(135deg, #eef2ff, #e0e7ff);
    border: 1px solid #c7d2fe; border-radius: 8px; padding: 4.5mm 5mm; margin: 5mm 0;
  }
  .destacado .cifra { font-size: 20pt; font-weight: 800; color: #312e81; }
  .destacado .texto { color: #3730a3; font-size: 9pt; }

  .quote { border-left: 3px solid #6366f1; background: #f8fafc; padding: 3.5mm 5mm; border-radius: 0 8px 8px 0; font-style: italic; color: #334155; font-size: 9.5pt; }
  .quote b { color: #1e1b4b; }

  /* ---------- Cierre ---------- */
  .cierre { background: linear-gradient(160deg, #0f172a 0%, #1e1b4b 60%, #312e81 100%); color: #fff; display: flex; flex-direction: column; }
  .cierre h2 { color: #fff; font-size: 22pt; }
  .cierre p { color: #c7d2fe; }
  .cierre .paso { background: rgba(255,255,255,.06); border: 1px solid rgba(165,180,252,.35); border-radius: 8px; padding: 4mm 5mm; }
  .cierre .paso b { color: #a5b4fc; display: block; font-size: 8pt; text-transform: uppercase; letter-spacing: .18em; margin-bottom: 1.5mm; }
  .cierre .paso span { font-size: 9.5pt; }
  .aviso { font-size: 7.5pt; color: #64748b; }
</style>
</head>
<body>

<!-- ═══════════════ PÁGINA 1 · PORTADA ═══════════════ -->
<section class="page portada">
  <div class="marca">Volkern · ERP</div>
  <h1>Hospitality<br><span>PMS + motor de reservas</span><br>sin comisión por reserva</h1>
  <p class="sub">Conecta tu hotel con los canales sin perder el control. Publica tu propio motor
  de reservas con tu marca, cobra en tu cuenta y mira cuánto te queda de cada reserva —
  del canal al gasto, en una sola cuenta.</p>
  <div class="chips">
    <span class="chip">0 % de comisión por reserva</span>
    <span class="chip">Web de reservas con tu marca</span>
    <span class="chip">Airbnb · Booking.com · Expedia</span>
    <span class="chip">Rentabilidad por reserva</span>
    <span class="chip">Registro de viajeros MIR incluido</span>
  </div>
  <div class="captura-marco"><img src="${img.huesped2}" alt="Motor de reservas público"></div>
  <div class="pie">
    <span>Brochure comercial · Vertical Hospitality · Septiembre 2026</span>
    <span>volkern.app</span>
  </div>
</section>

<!-- ═══════════════ PÁGINA 2 · LA WEB DEL HUÉSPED ═══════════════ -->
<section class="page">
  <div class="kicker">Venta directa</div>
  <h2>Tu propia web de reservas, con tu marca</h2>
  <p class="lead">El huésped reserva en tu página —en español o inglés— y el dinero entra en tu cuenta.
  Sin escaparate ajeno, sin paridad impuesta, sin comisión de plataforma.</p>

  <div class="cols2">
    <div>
      <div class="captura"><img src="${img.huesped1}" alt="Fechas"></div>
      <p class="pie-captura">1 · El huésped elige fechas y huéspedes.</p>
    </div>
    <div>
      <div class="captura"><img src="${img.huesped3}" alt="Datos del huésped"></div>
      <p class="pie-captura">2 · Confirma con foto de su unidad y fechas en claro.</p>
    </div>
  </div>

  <div style="height:4mm"></div>

  <div class="cols2">
    <ul class="lista">
      <li><b>4 plantillas</b> y colores a juego con tu marca; embebible en tu web actual con un iframe.</li>
      <li><b>Dominio propio</b> (reservas.tuhotel.com) verificado en un clic.</li>
      <li><b>Extras comprables</b>: desayuno, late check-out, traslados — sube el ticket medio desde el primer mes.</li>
      <li><b>Reseñas publicadas</b> en la propia página: la prueba social trabaja contigo.</li>
    </ul>
    <ul class="lista">
      <li><b>Anti-overbooking real</b>: un solo motor de disponibilidad para web, planning y canales; no se vende dos veces.</li>
      <li><b>Idempotente</b>: recargar o reenviar el formulario no duplica reservas.</li>
      <li><b>Pago con tarjeta a TU cuenta</b> (Stripe Connect) o cobro tradicional — tú decides la política.</li>
      <li><b>Confirmación con referencia</b> y comprobante que el huésped puede guardar.</li>
    </ul>
  </div>

  <div class="destacado">
    <span class="cifra">15–18 % → 0 %</span>
    <span class="texto">&nbsp;— la comisión media de una OTA desaparece en cada reserva que traes a tu web.
    Un hotel de 20 habitaciones que mueve la mitad de su venta a directo deja de pagar ~3.200 €/mes de comisiones.</span>
  </div>

  <div class="pie-page"><span>Volkern Hospitality</span><span>2 · La web del huésped</span></div>
</section>

<!-- ═══════════════ PÁGINA 3 · RECEPCIÓN Y OPERACIÓN ═══════════════ -->
<section class="page">
  <div class="kicker">Operación diaria</div>
  <h2>Recepción, planning y limpieza en una pantalla</h2>
  <p class="lead">Cada mañana, la carga del día a un vistazo; cada reserva, con su ciclo completo.</p>

  <div class="captura"><img src="${img.reservas}" alt="Reservas"></div>
  <p class="pie-captura">Reservas: llegadas y salidas de hoy, filtro por estado/canal/propiedad, y hoja de housekeeping imprimible.</p>

  <div style="height:4mm"></div>

  <div class="cols2">
    <div>
      <div class="captura"><img src="${img.planning}" alt="Planning"></div>
      <p class="pie-captura">Planning por unidad: reservas por canal y bloqueos.</p>
    </div>
    <ul class="lista" style="margin-top:2mm">
      <li><b>Check-in online del huésped</b>: enlace firmado por WhatsApp o email; el huésped completa sus datos desde el móvil, sin cuenta.</li>
      <li><b>Limpieza y mantenimiento como tareas</b>: check-out crea la limpieza; completarla libera la unidad y avisa a los canales.</li>
      <li><b>No-show con política</b>: la unidad se libera y el cargo se emite según la política de cada propiedad.</li>
      <li><b>Fianzas</b>: registrar, cobrar, devolver o aplicar a daños.</li>
      <li><b>Comunicaciones automáticas ES/EN</b> por WhatsApp o email: confirmación, pre-llegada, acceso, post-salida y reseña.</li>
    </ul>
  </div>

  <div class="pie-page"><span>Volkern Hospitality</span><span>3 · Recepción y operación</span></div>
</section>

<!-- ═══════════════ PÁGINA 4 · EL DINERO ═══════════════ -->
<section class="page">
  <div class="kicker">Dinero y decisiones</div>
  <h2>Cuánto ganas por reserva — de verdad</h2>
  <p class="lead">Ningún channel manager te lo contesta: bruto, comisión de OTA, gastos con IVA, neto, margen, cobrado y pendiente. Por reserva y por canal.</p>

  <div class="captura"><img src="${img.finanzas}" alt="Finanzas por reserva"></div>
  <p class="pie-captura">Finanzas: desglose por reserva con comisiones y margen; resúmenes por divisa, canal y estado de cobro.</p>

  <div style="height:4mm"></div>

  <div class="cols3">
    <div class="card"><h3>Cuenta de cobro propia</h3><p>Stripe Connect: el pago de la reserva directa entra íntegro en tu cuenta. Volkern no retiene fondos.</p></div>
    <div class="card"><h3>Penalizaciones que se cobran</h3><p>No-show y salida anticipada con política por propiedad: la unidad se libera y el cargo se emite y factura.</p></div>
    <div class="card"><h3>Multimoneda honesta</h3><p>Cada importe en su divisa, sin conversiones inventadas; resúmenes por divisa y por canal.</p></div>
  </div>

  <div style="height:4mm"></div>

  <div class="captura"><img src="${img.reportes}" alt="Reportes"></div>
  <p class="pie-captura">Reportes: ADR, RevPAR, estancia media, ocupación, no-shows, antelación de reserva y export CSV.</p>

  <div class="pie-page"><span>Volkern Hospitality</span><span>4 · El dinero</span></div>
</section>

<!-- ═══════════════ PÁGINA 5 · CANALES + MOTOR ═══════════════ -->
<section class="page">
  <div class="kicker">Canales y distribución</div>
  <h2>Conectado a los canales, reconciliado cada noche</h2>
  <p class="lead">Publicas inventario y tarifas a los canales; las reservas entran solas por webhook; y cada noche Volkern compara lo que dicen los canales con lo que dice tu PMS.</p>

  <div class="cols2">
    <div>
      <div class="captura"><img src="${img.tarifas}" alt="Tarifas"></div>
      <p class="pie-captura">Tarifas: planes con temporadas, ajustes y restricciones; sincronización a canales en un clic.</p>
    </div>
    <div>
      <div class="captura"><img src="${img.engine}" alt="Configuración del motor"></div>
      <p class="pie-captura">Booking Engine: plantilla, colores, dominio propio y extras, desde el panel.</p>
    </div>
  </div>

  <div style="height:3mm"></div>

  <div class="quote">«Si un canal y tu PMS se desincronizan, <b>Volkern lo detecta, te avisa y lo reconcilia</b> — incluso cancelando por ti lo que el canal canceló y tú nunca supiste.»</div>

  <div style="height:3mm"></div>

  <div class="cols3">
    <div class="card"><h3>Inventario sin fugas</h3><p>Un solo motor de disponibilidad para planning, web y canales. Lo reservado en uno, bloqueado en todos.</p></div>
    <div class="card"><h3>Divergencias con acción</h3><p>La reconciliación diaria registra diferencias y propone revisión — nunca cancela sola sin dejar rastro.</p></div>
    <div class="card"><h3>Incidencias visibles</h3><p>Panel propio de incidencias de conectividad: qué falló, cuándo y qué se hizo — no un ticket a ciegas.</p></div>
  </div>

  <div class="pie-page"><span>Volkern Hospitality</span><span>5 · Canales y distribución</span></div>
</section>

<!-- ═══════════════ PÁGINA 6 · ELPANEL 360 + PLanes ═══════════════ -->
<section class="page">
  <div class="kicker">El panel completo</div>
  <h2>La casa entera en un vistazo</h2>

  <div class="captura"><img src="${img.dashboard}" alt="Dashboard"></div>
  <p class="pie-captura">Dashboard: ocupación, llegadas/salidas, ingresos 30 días, ADR, mix de canales y «movimiento de mañana» para preparar el día siguiente.</p>

  <div style="height:4mm"></div>

  <h2 style="font-size:14pt">Planes por tamaño del hotel <span class="aviso">(propuesta a validar en el piloto · 0 % comisión por reserva en todos)</span></h2>
  <table>
    <tr><th style="width:56%">Incluye</th><th class="c" style="width:14%">Starter</th><th class="c" style="width:15%">Growth</th><th class="c" style="width:15%">Enterprise</th></tr>
    <tr><td>Propiedades, unidades, tarifas y planning</td><td class="c si">✓</td><td class="c si">✓</td><td class="c si">✓</td></tr>
    <tr><td>Motor de reservas público con tu marca (enlace + embed)</td><td class="c si">✓</td><td class="c si">✓</td><td class="c si">✓</td></tr>
    <tr><td>Reservas manuales, check-in online y cobros registrados</td><td class="c si">✓</td><td class="c si">✓</td><td class="c si">✓</td></tr>
    <tr><td>Huéspedes con historial y comunicaciones automáticas ES/EN</td><td class="c si">✓</td><td class="c si">✓</td><td class="c si">✓</td></tr>
    <tr><td>Cobro con tarjeta a tu cuenta (Stripe Connect)</td><td class="c no">—</td><td class="c si">✓</td><td class="c si">✓</td></tr>
    <tr><td>Conectividad con canales (add-on por tramo de unidades)</td><td class="c">1 canal</td><td class="c">multi</td><td class="c">multi</td></tr>
    <tr><td>Finanzas por reserva (comisiones, gastos, margen) + reportes</td><td class="c no">—</td><td class="c si">✓</td><td class="c si">✓</td></tr>
    <tr><td>Reconciliación de divergencias y panel de incidencias</td><td class="c no">—</td><td class="c si">✓</td><td class="c si">✓</td></tr>
    <tr><td>Políticas por propiedad (no-show, salida anticipada, holds)</td><td class="c no">—</td><td class="c si">✓</td><td class="c si">✓</td></tr>
    <tr><td>Varias propiedades en una cuenta + web con dominio propio</td><td class="c no">—</td><td class="c">opc.</td><td class="c si">✓</td></tr>
    <tr><td>Gemma (IA transversal del ERP) y AIOps</td><td class="c no">—</td><td class="c no">—</td><td class="c si">✓</td></tr>
  </table>

  <p class="aviso" style="margin-top:3mm">Las bandas de precio se definen con el piloto (suscripción por tamaño de hotel). La conectividad se contrata aparte al costo + margen por tramo de unidades vendibles. En España, el ERP factura al huésped con Veri*Factu.</p>

  <div class="pie-page"><span>Volkern Hospitality</span><span>6 · Panel y planes</span></div>
</section>

<!-- ═══════════════ PÁGINA 7 · DIFERENCIA + CIERRE ═══════════════ -->
<section class="page cierre">
  <div class="kicker" style="color:#a5b4fc">Por qué Volkern</div>
  <h2>Lo que nadie más te da</h2>
  <p style="margin-bottom:6mm">Comparado con channel managers, motores y PMS tradicionales:</p>

  <div class="cols2" style="margin-bottom:6mm">
    <ul class="lista">
      <li style="color:#e0e7ff"><b style="color:#fff">Rentabilidad por reserva</b>: bruto, comisiones, gastos con IVA, margen y cobro — la respuesta que ningún channel manager da.</li>
      <li style="color:#e0e7ff"><b style="color:#fff">Reconciliación con acción auditada</b>: divergencias detectadas, avisadas y resueltas con deshacer — no solo avisos.</li>
      <li style="color:#e0e7ff"><b style="color:#fff">Registro de viajeros oficial</b> (SES.Hospedajes, RD 933/2021) integrado de punta a punta: check-in online, parte y envío al Ministerio.</li>
    </ul>
    <ul class="lista">
      <li style="color:#e0e7ff"><b style="color:#fff">El ERP entero detrás</b>: CRM, finanzas, contabilidad, nómina y marketing en la misma cuenta — sin exportar nada a mano.</li>
      <li style="color:#e0e7ff"><b style="color:#fff">0 % de comisión por reserva</b>: suscripción por tamaño; cada venta directa es comisión que te quedas.</li>
      <li style="color:#e0e7ff"><b style="color:#fff">Puesta en marcha acompañada</b> con pruebas reales de conectividad y reserva de ensayo antes de abrir.</li>
    </ul>
  </div>

  <h2 style="font-size:16pt; margin-bottom:4mm">Empezar es un proceso de 10 pasos — acompañado</h2>
  <div class="cols3">
    <div class="paso"><b>1 · Semana 1</b><span>Damos de alta propiedades y unidades, tarifas y fotos. Creamos el plan de precios de tu web.</span></div>
    <div class="paso"><b>2 · Semana 2</b><span>Conectamos tus canales, mapeamos unidades y ensayamos disponibilidad, tarifas y una reserva de prueba.</span></div>
    <div class="paso"><b>3 · Go-live</b><span>Activamos la propiedad, publicamos tu motor de reservas y medimos contigo la comisión que dejas de pagar.</span></div>
  </div>

  <div style="margin-top:auto">
    <p style="font-size:12pt; color:#fff; font-weight:700">Volkern · ERP con vertical Hospitality</p>
    <p style="font-size:9pt">Demo en vivo con tus datos: volkern.app/reservar/volkern-demo &nbsp;·&nbsp; volkern.app</p>
    <p class="aviso" style="margin-top:4mm">Documento comercial. Las bandas de precio son hipótesis a validar en el piloto, no tarifa pública. Las cifras de competencia son rangos públicos de referencia (sep 2026): reconfirmar antes de usarlas en una propuesta. No se incluye en esta versión: POS/F&B, revenue management, app móvil del huésped, CFDI mexicano ni liquidación a propietario.</p>
  </div>
</section>

</body>
</html>`;

fs.writeFileSync('/tmp/brochure-hospitality.html', html, 'utf8');
console.log('HTML generado: /tmp/brochure-hospitality.html', `(${(html.length / 1024).toFixed(0)} KB)`);
