#!/usr/bin/env node
/**
 * Documento técnico del módulo Real Estate — HTML para imprimir a PDF con
 * Chrome headless, igual que el brochure comercial y la guía de usuario.
 *
 * Lee las capturas de docs/img/real-estate-tecnico/ (las produce
 * scripts/capturar-pantallas-real-estate.cjs) y escribe:
 *   · /tmp/real-estate-tecnico.html   (intermedio, para retocar a mano)
 *   · docs/real-estate-tecnico.pdf
 *
 * Si el script de capturas dejó los feeds reales (idealista.xml, fotocasa.csv),
 * el documento cita un fragmento literal de cada uno.
 *
 * Uso: node scripts/generar-pdf-tecnico-real-estate.cjs
 */
const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require('puppeteer');

const RAIZ = path.join(__dirname, '..');
const IMG_DIR = path.join(RAIZ, 'docs', 'img', 'real-estate-tecnico');
const HTML_SALIDA = '/tmp/real-estate-tecnico.html';
const PDF_SALIDA = path.join(RAIZ, 'docs', 'real-estate-tecnico.pdf');

const manifest = JSON.parse(fs.readFileSync(path.join(IMG_DIR, 'manifest.json'), 'utf8'));
const porId = new Map(manifest.capturas.map((c) => [c.id, c]));

function datosImagen(id) {
  const captura = porId.get(id);
  if (!captura) throw new Error(`Falta la captura «${id}» en el manifest. Ejecuta antes capturar-pantallas-real-estate.cjs.`);
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

const escapar = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Fragmento literal de un feed real, si el script de capturas lo dejó en disco. */
function fragmentoFeed(archivo, lineas) {
  const ruta = path.join(IMG_DIR, archivo);
  if (!fs.existsSync(ruta)) return null;
  return escapar(fs.readFileSync(ruta, 'utf8').split('\n').slice(0, lineas).join('\n'));
}

const xmlReal = fragmentoFeed('idealista.resumen.txt', 20);
const csvReal = fragmentoFeed('fotocasa.csv', 2)
  ?.split('\n').slice(0, 2).join('\n')
  // La fila de datos del CSV es larguísima: se corta para que quepa en la caja.
  ?.slice(0, 1400);

// Fecha local de las capturas (no la UTC: una sesión de noche cae en el día anterior en ISO).
const fechaCapturas = new Date(manifest.generadoEn).toLocaleDateString('sv-SE');
const origenCapturas = manifest.base.replace(/^https?:\/\//, '');

const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Volkern Real Estate — Documento técnico</title>
<style>
  @page { size: A4; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body {
    font-family: 'Inter', 'Segoe UI', 'Noto Sans', 'DejaVu Sans', Arial, sans-serif;
    color: #1e293b; font-size: 9.3pt; line-height: 1.5;
  }
  h1 { font-size: 24pt; line-height: 1.15; color: #0f172a; }
  h2 { font-size: 15pt; color: #134e4a; margin: 0 0 3mm; padding-bottom: 1.6mm; border-bottom: 2px solid #e2e8f0; }
  h3 { font-size: 10.8pt; color: #134e4a; margin: 4.5mm 0 1.6mm; }
  h4 { font-size: 9.6pt; color: #334155; margin: 3.2mm 0 1.2mm; }
  p { margin-bottom: 2.4mm; }
  ul, ol { margin: 0 0 2.4mm 4.5mm; }
  li { margin-bottom: 1.1mm; }
  code { font-family: 'DejaVu Sans Mono', 'SFMono-Regular', Consolas, monospace; font-size: 8.4pt; background: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 3px; padding: 0 1mm; }
  a { color: #0f766e; text-decoration: none; }

  .kicker { text-transform: uppercase; letter-spacing: 0.2em; font-size: 7.4pt; color: #0d9488; font-weight: 700; margin-bottom: 2mm; }
  .lead { color: #475569; font-size: 9.8pt; margin-bottom: 4mm; }
  .seccion { break-before: page; }
  .seccion:first-of-type { break-before: auto; }

  /* ---------- Portada ---------- */
  .portada {
    background: linear-gradient(158deg, #0f172a 0%, #134e4a 58%, #115e59 100%);
    color: #fff; border-radius: 10px; padding: 16mm 14mm 12mm; margin-bottom: 7mm;
  }
  .portada .marca { letter-spacing: 0.34em; text-transform: uppercase; font-size: 9.5pt; color: #99f6e4; }
  .portada h1 { color: #fff; margin-top: 5mm; font-size: 30pt; }
  .portada h1 span { color: #5eead4; }
  .portada .sub { color: #ccfbf1; font-size: 11.5pt; margin-top: 4mm; max-width: 150mm; line-height: 1.5; }
  .portada .chips { display: flex; flex-wrap: wrap; gap: 2.5mm; margin-top: 7mm; }
  .chip { border: 1px solid rgba(153,246,228,.45); color: #ecfeff; border-radius: 999px; padding: 1.4mm 4mm; font-size: 8pt; }

  /* ---------- Estructura ---------- */
  .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 3mm 6mm; margin-bottom: 5mm; }
  .meta div { border-left: 2px solid #99f6e4; padding-left: 3mm; }
  .meta b { display: block; font-size: 7.4pt; text-transform: uppercase; letter-spacing: .14em; color: #0d9488; }
  .meta span { color: #334155; }

  table { width: 100%; border-collapse: collapse; font-size: 8.1pt; margin: 2.5mm 0 3.5mm; }
  th { background: #134e4a; color: #fff; text-align: left; padding: 2.2mm 2.6mm; font-weight: 600; }
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
    font-family: 'DejaVu Sans Mono', Consolas, monospace; font-size: 7.2pt; line-height: 1.45; white-space: pre; overflow-wrap: anywhere; white-space: pre-wrap;
  }
  .pre .eti { color: #5eead4; }
  .cols2 { display: grid; grid-template-columns: 1fr 1fr; gap: 5mm; }
  .cols3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 4mm; }
  .card { border: 1px solid #e2e8f0; border-radius: 7px; padding: 3.4mm 4mm; background: #f8fafc; }
  .card h4 { margin-top: 0; }
  .card p, .card li { font-size: 8.4pt; color: #475569; }
  .destacado { background: linear-gradient(135deg, #ecfeff, #ccfbf1); border: 1px solid #99f6e4; border-radius: 7px; padding: 3.6mm 4.2mm; margin: 3.5mm 0; }
  .destacado b { color: #115e59; }
  .aviso { background: #fffbeb; border: 1px solid #fde68a; border-radius: 7px; padding: 3.4mm 4mm; margin: 3mm 0; font-size: 8.4pt; color: #78350f; }
  .pie-firma { margin-top: 8mm; border-top: 1px solid #e2e8f0; padding-top: 3mm; font-size: 7.6pt; color: #94a3b8; }
</style>
</head>
<body>

<!-- ══════════════ PORTADA ══════════════ -->
<div class="portada">
  <div class="marca">Volkern · Documento técnico</div>
  <h1>Módulo <span>Real Estate</span></h1>
  <p class="sub">Arquitectura, modelo de datos, flujos y estado real del vertical inmobiliario:
  propiedades sobre el catálogo, portal público, exportación a portales, captación, comisiones de
  franquicia e IA sobre la cartera.</p>
  <div class="chips">
    <span class="chip">Sin tabla de propiedades: el inmueble es un ítem de catálogo</span>
    <span class="chip">15 rutas de API</span>
    <span class="chip">3 formatos de salida a portales</span>
    <span class="chip">21 campos configurables</span>
    <span class="chip">Capturas del ${fechaCapturas}</span>
  </div>
</div>

<div class="meta">
  <div><b>Alcance</b><span>Vertical inmobiliario dentro del ERP Volkern (multi-tenant)</span></div>
  <div><b>Fuente del contenido</b><span>docs/real-estate-ficha-tecnica.md, esquema de Prisma, rutas de la API y base de producción</span></div>
  <div><b>Entorno de las capturas</b><span>${origenCapturas} · tenant «Demo Real Estate» · ${fechaCapturas}</span></div>
  <div><b>Rama</b><span>master · 106 migraciones cerradas</span></div>
</div>

<div class="aviso">
  <b>Dos reglas aplicadas.</b> Aquí no aparece ninguna contraseña, clave de API ni dato de facturación.
  Y el inmueble se trata siempre como lo que es en el sistema: <b>un ítem del catálogo</b> con sus campos
  inmobiliarios en JSONB, no una tabla paralela.
</div>

${figura('01-dashboard', 'Vista de conjunto del módulo: el dashboard inmobiliario de la cuenta de demostración.')}

<div class="destacado">
  <b>Qué resuelve el módulo.</b> Una inmobiliaria gestiona el mismo inmueble en varias herramientas a la vez:
  la ficha en una hoja de cálculo, las fotos en una carpeta, el propietario en la agenda, el comprador en el
  CRM, el anuncio en tres portales y la comisión en la cabeza. Real Estate pone las cinco cosas en el mismo
  ERP y sobre la pieza que ya existía —el catálogo—, de modo que un inmueble hereda precios, impuestos,
  operaciones cerradas, visitas y contenido web sin duplicar ni una columna.
</div>

<!-- ══════════════ 1 · ALCANCE ══════════════ -->
<section class="seccion">
  <div class="kicker">01 · Alcance</div>
  <h2>Qué es y dónde vive</h2>
  <p class="lead">El vertical <code>real_estate</code> (plan «Inmobiliaria», 59 €/mes) se monta sobre el ERP
  existente: no es una aplicación aparte, y por eso comparte CRM, catálogo, pipeline, citas, CMS,
  automatizaciones y permisos.</p>

  <div class="cols3">
    <div class="card">
      <h4>El inmueble es un ítem de catálogo</h4>
      <p>No hay modelo <code>Property</code>. Un inmueble es un <code>CatalogoItem</code> con
      <code>tipo = 'inmueble'</code> y sus campos propios en <code>customFieldValues</code> (JSONB). Todo lo que
      el ERP sabe hacer con un ítem vale para una casa, sin código nuevo.</p>
    </div>
    <div class="card">
      <h4>Un solo pipeline, el del CRM</h4>
      <p>El ciclo inmobiliario es un pipeline más: seis etapas con <code>categoria = 'real_estate'</code>
      (contacto, visita, oferta, negociación, escrituración, cerrado), sobre el motor de pipeline que ya
      usaba el negocio entero.</p>
    </div>
    <div class="card">
      <h4>Una sola salida a portales</h4>
      <p>Idealista (XML), Fotocasa (CSV) y MLS (JSON) se generan con la <b>misma</b> consulta de inmuebles, así
      que un inmueble no puede salir en un formato y desaparecer en otro.</p>
    </div>
  </div>

  <h3>Qué entra en V1</h3>
  <div class="cols2">
    <ul>
      <li>Inmuebles con 21 campos configurables por cuenta.</li>
      <li>Listado operativo con filtros, alta rápida y ficha del propietario.</li>
      <li>Portal público por cuenta, con filtros, fichas y SEO.</li>
      <li>Exportación a Idealista, Fotocasa y MLS + delta de sincronización.</li>
    </ul>
    <ul>
      <li>Pipeline inmobiliario de 6 etapas y visitas vinculadas al inmueble.</li>
      <li>Captación (contrato con el propietario) por API.</li>
      <li>Comisiones con splits y liquidación; resumen consolidado de franquicia.</li>
      <li>IA: descripción, precio sugerido, calidad, recomendación y consulta en lenguaje natural.</li>
    </ul>
  </div>

  <h3>Qué queda declarado fuera de alcance</h3>
  <p>Sincronización bidireccional real con los portales (se exporta; la vuelta la resuelve el integrador con el
  delta), firma electrónica del contrato de captación, valoración automática con datos de mercado externos y
  aplicación móvil de agentes. No es deuda: es alcance decidido del plan.</p>
</section>

<!-- ══════════════ 2 · SUPERFICIE ══════════════ -->
<section class="seccion">
  <div class="kicker">02 · Superficie de producto</div>
  <h2>Menú, pantallas y portal público</h2>
  <p class="lead">Fuente única del menú: <code>lib/navigation-config.ts</code>. Del lado público hay una página
  comercial (<code>/soluciones/real-estate</code>) y dos pantallas por cuenta: el listado y la ficha de cada
  inmueble.</p>

  <table>
    <thead><tr><th>#</th><th>Pantalla</th><th>Ruta</th><th>Origen</th></tr></thead>
    <tbody>
      <tr><td class="c">1</td><td>Configuración inmobiliaria</td><td><code>/dashboard/configuracion/real-estate</code></td><td>entrada de menú</td></tr>
      <tr><td class="c">2</td><td>Dashboard inmobiliario</td><td><code>/dashboard/real-estate</code></td><td>URL directa</td></tr>
      <tr><td class="c">3</td><td>Propiedades</td><td><code>/dashboard/real-estate/properties</code></td><td>enlazada desde el dashboard</td></tr>
      <tr><td class="c">4</td><td>Catálogo filtrado por inmuebles</td><td><code>/dashboard/catalogo?tipo=inmueble</code></td><td>compartida</td></tr>
      <tr><td class="c">5</td><td>Campos personalizados</td><td><code>/dashboard/catalogo/campos</code></td><td>compartida</td></tr>
      <tr><td class="c">6</td><td>Pipeline de venta</td><td><code>/dashboard/pipeline</code></td><td>compartida</td></tr>
      <tr><td class="c">7</td><td>Portal público</td><td><code>/p/&lt;slug&gt;/propiedades</code></td><td>pública</td></tr>
      <tr><td class="c">8</td><td>Ficha pública del inmueble</td><td><code>/p/&lt;slug&gt;/propiedades/&lt;id&gt;</code></td><td>pública</td></tr>
      <tr><td class="c">9</td><td>Página comercial del vertical</td><td><code>/soluciones/real-estate</code></td><td>pública</td></tr>
    </tbody>
  </table>

  <div class="aviso">
    <b>El dashboard no está en el menú.</b> La única entrada del módulo es
    <b>Configuración → Inmobiliaria</b>; <code>/dashboard/real-estate</code> solo se alcanza escribiendo la URL.
    Tampoco existe un «hub» de Real Estate: la superficie del panel son dos pantallas
    (<code>real-estate</code> y <code>real-estate/properties</code>) y la configuración.
  </div>

  ${figura('15-landing', 'La puerta pública del vertical: la página comercial que vende el módulo y describe el caso inmobiliario.')}
</section>

<!-- ══════════════ 3 · EL INMUEBLE EN EL CATÁLOGO ══════════════ -->
<section class="seccion">
  <div class="kicker">03 · El inmueble en el catálogo</div>
  <h2>Un inmueble es un ítem de catálogo</h2>
  <p class="lead">El inmueble usa las columnas de <code>catalogo_items</code> para lo que comparte con cualquier
  otro ítem (nombre, descripción, precio, divisa, estado activo, destacado, multimedia) y
  <code>customFieldValues</code> para lo que es solo inmobiliario.</p>

  ${figura('06-catalogo', 'Los inmuebles dentro del Catálogo, filtrados por tipo: la misma pantalla que usa el resto del ERP.')}

  <div class="cols2">
    <div class="card">
      <h4>Columnas del ítem</h4>
      <p><code>nombre</code>, <code>descripcion</code>, <code>precioBase</code>, <code>moneda</code>,
      <code>destacado</code>, <code>activo</code>, <code>media</code> (galería), <code>pricing</code>,
      <code>categoriaFiscal</code> y el vínculo con el propietario por <code>contactId</code>.</p>
    </div>
    <div class="card">
      <h4>Campos del inmueble (JSONB)</h4>
      <p>Operación, tipo, estado, superficies, habitaciones, baños, extras (ascensor, alberca, jardín, trastero,
      aire acondicionado, amueblado), geolocalización, orientación, certificación energética completa y SEO.</p>
    </div>
  </div>

  <h3>Los campos se configuran por cuenta</h3>
  <p>Cada definición vive en <code>catalogo_field_definitions</code> (<code>fieldKey</code>, <code>label</code>,
  <code>type</code>, <code>options</code>, <code>required</code>, <code>orden</code>, <code>categoria</code>,
  <code>unidad</code>, <code>valorDefecto</code>) y se puede reordenar, editar o ampliar desde el panel. La cuenta
  de demostración tiene <b>21 campos activos</b>.</p>

  ${figura('07-campos', 'Los 21 campos activos del inmueble, agrupados por categoría y reordenables desde el panel.')}

  <h3>De JSONB a código tipado</h3>
  <p><code>parseInmueble()</code> traduce el ítem a un objeto tipado (<code>InmuebleParsed</code>) y es la
  <b>única</b> frontera: la API, el listado, el portal público y los exportadores trabajan con ese tipo y nunca
  con el JSON crudo. Un campo nuevo del catálogo se documenta en un solo sitio.</p>

  <table>
    <thead><tr><th>Campo en JSONB</th><th>Propiedad tipada</th><th>Tipo</th></tr></thead>
    <tbody>
      <tr><td><code>tipo_operacion</code></td><td><code>operationType</code></td><td>venta · alquiler · traspaso · alquiler de temporada</td></tr>
      <tr><td><code>tipo_inmueble</code></td><td><code>propertyType</code></td><td>casa · departamento · ático · villa · loft · bungalow · local · oficina · terreno</td></tr>
      <tr><td><code>estado</code></td><td><code>status</code></td><td>disponible · reservada · vendida · alquilada</td></tr>
      <tr><td><code>superficie_total</code> / <code>superficie_construida</code></td><td><code>areaM2</code> / <code>builtM2</code></td><td>número (m²)</td></tr>
      <tr><td><code>habitaciones</code> / <code>banos</code> / <code>estacionamientos</code></td><td><code>bedrooms</code> / <code>bathrooms</code> / <code>parking</code></td><td>número</td></tr>
      <tr><td><code>zona</code> / <code>direccion</code> / <code>latitud</code> / <code>longitud</code></td><td><code>city</code> / <code>address</code> / <code>lat</code> / <code>lng</code></td><td>texto · número</td></tr>
      <tr><td><code>certificacion_energetica</code>, <code>consumo_energetico</code>, <code>emisiones_co2</code></td><td><code>energyCert</code>, <code>energyCertConsumption</code>, <code>energyCertEmission</code></td><td>A–G · kWh/m²·año · kg CO₂/m²·año</td></tr>
      <tr><td><code>organismo_certificador</code>, <code>fecha_certificado</code>, <code>caducidad_certificado</code>, <code>documento_certificado</code></td><td><code>energyCertBody</code>, <code>energyCertDate</code>, <code>energyCertExpiry</code>, <code>energyCertUrl</code></td><td>texto · fecha · URL</td></tr>
      <tr><td><code>descripcion_larga</code> / <code>tags_seo</code></td><td><code>longDescription</code> / <code>seoTags</code></td><td>texto</td></tr>
    </tbody>
  </table>
</section>

<!-- ══════════════ 4 · LISTADO Y ALTA ══════════════ -->
<section class="seccion">
  <div class="kicker">04 · Operación diaria</div>
  <h2>Listado, filtros y alta</h2>
  <p class="lead">La pantalla de trabajo del agente: todo el portafolio con su estado, su precio y su divisa, los
  filtros de búsqueda del sector y el alta rápida sin salir de la tabla.</p>

  ${figura('02-propiedades', 'Propiedades: 12 inmuebles con foto, operación, ubicación, precio, superficies y estado.')}

  <h3>Filtros del sector</h3>
  <p>Texto libre (nombre y descripción), operación, estado, tipo de inmueble, ciudad o zona, precio mínimo y
  máximo, habitaciones mínimas, superficie mínima y «solo destacadas». El buscador espera 400 ms antes de
  consultar, para no disparar una petición por tecla.</p>

  ${figura('03-propiedades-filtros', 'Los filtros avanzados desplegados: operación, tipo, zona, precio, habitaciones, superficie y destacadas.')}

  <h3>Alta rápida, con certificación energética</h3>
  <p>El alta exige nombre y precio, y ofrece operación, tipo, ubicación, superficies, habitaciones, baños, estado y
  el bloque completo de certificación energética (letra, consumo, emisiones, organismo, fechas y URL del
  documento). La divisa del formulario <b>nace con la de la cuenta</b>, no fija a EUR. Para el resto de campos está
  el catálogo completo, que se abre desde cada fila.</p>

  ${figura('04-nueva-propiedad', 'Alta rápida: los datos comerciales y el bloque de certificación energética que viaja al feed de portales.')}

  <h3>El propietario, a un clic de la fila</h3>
  <p>El inmueble guarda su propietario como un contacto del CRM (<code>contactId</code>), así que la ficha del
  vendedor no es texto libre en el anuncio: es la misma persona que recibe llamadas, tiene historial y aparece en
  el resto del ERP.</p>

  ${figura('05-propietario', 'Ficha del propietario desde el listado: el vínculo con el CRM, no un campo de texto en el anuncio.')}
</section>

<!-- ══════════════ 5 · MODELO DE DATOS ══════════════ -->
<section class="seccion">
  <div class="kicker">05 · Modelo de datos</div>
  <h2>Qué guarda el módulo</h2>
  <p class="lead">Todo cuelga de la cuenta (<code>Tenant</code>), con borrado en cascada. El inmueble es la pieza
  central; a su alrededor están los campos configurables, los contratos de captación, las operaciones, las
  comisiones y el contacto del propietario.</p>

  <table>
    <thead><tr><th>Modelo</th><th>Tabla</th><th>Para qué</th></tr></thead>
    <tbody>
      <tr><td><code>CatalogoItem</code></td><td><code>catalogo_items</code></td><td>El inmueble: datos comerciales en columnas y campos inmobiliarios en JSONB</td></tr>
      <tr><td><code>Contact</code> (relación <i>OwnerProperties</i>)</td><td><code>contacts</code></td><td>Propietario o vendedor del inmueble</td></tr>
      <tr><td><code>CatalogoFieldDefinition</code></td><td><code>catalogo_field_definitions</code></td><td>Definición de cada campo del inmueble, por cuenta</td></tr>
      <tr><td><code>Captacion</code></td><td><code>captaciones</code></td><td>Contrato con el propietario: exclusividad, fechas, precios, comisión y condiciones de pago</td></tr>
      <tr><td><code>Deal</code></td><td><code>deals</code></td><td>Operación de venta o alquiler dentro del pipeline</td></tr>
      <tr><td><code>Comision</code></td><td><code>comisiones</code></td><td>Comisión calculada, con su estado de liquidación y la regla aplicada</td></tr>
      <tr><td><code>Lead</code></td><td><code>Lead</code></td><td>Consulta entrante; el portal público escribe la fuente <code>portal_inmobiliario</code></td></tr>
      <tr><td><code>Cita</code></td><td><code>Cita</code></td><td>Visita a un inmueble concreto (<code>catalogoItemId</code>)</td></tr>
      <tr><td><code>Tenant</code></td><td><code>Tenant</code></td><td><code>parentId</code> es la franquicia: una central con oficinas hijas</td></tr>
      <tr><td><code>Configuracion</code></td><td><code>Configuracion</code></td><td>Claves de configuración del módulo por cuenta</td></tr>
    </tbody>
  </table>

  <h3>El contrato de captación</h3>
  <p><code>Captacion</code> modela el acuerdo con el propietario: tipo (<code>exclusiva</code>,
  <code>compartida</code> o <code>mandato</code>), estado (<code>borrador</code>, <code>activa</code>,
  <code>vencida</code>, <code>cerrada</code>, <code>cancelada</code>), fechas de inicio, fin, firma, vencimiento y
  cancelación, cláusulas de exclusividad, precio de oferta y precio mínimo, comisión (porcentaje o importe fijo,
  con su divisa, condiciones y notas), condiciones de pago y el documento firmado con su huella.</p>

  <div class="aviso">
    <b>El contrato tiene columnas de sello que hoy nadie escribe.</b> La tabla declara
    <code>auditHash</code> (único), <code>chainedHash</code>, <code>sealedAt</code> y <code>signatureAudit</code>, y
    el índice único existe en producción. El mismo patrón de cadena SHA-256 ya protege contratos, nóminas y
    movimientos de stock del ERP, pero <b>no hay ningún sealer de captaciones</b>: hoy el contrato con el
    propietario no tiene prueba de integridad encadenada. Está en «Qué falta» (§16).
  </div>

  <h3>Configuración del módulo</h3>
  <p>Las claves viven en la tabla <code>Configuracion</code> (clave/valor por cuenta) y viajan por la ruta genérica
  de configuración: <code>portalSlug</code>, <code>portalEnabled</code>, <code>portalCustomDomain</code>,
  <code>commissionType</code>, <code>defaultCommissionPct</code>, cuotas fija y mensual, splits de agente y agencia,
  divisa por defecto, formatos de exportación y exportación automática.</p>
</section>

<!-- ══════════════ 6 · PORTAL PÚBLICO Y LEAD ══════════════ -->
<section class="seccion">
  <div class="kicker">06 · Flujo A</div>
  <h2>Del portal público al lead del CRM</h2>
  <p class="lead">El cliente final no entra al panel: entra a la web de la inmobiliaria. El portal público se sirve
  por cuenta en <code>/p/&lt;slug&gt;/propiedades</code> y también por <code>portalSlug</code> configurado o por
  dominio propio.</p>

  ${figura('13-portal-publico', 'Portal público: buscador con filtros, destacados y rejilla de inmuebles de la cuenta.')}

  <div class="pre"><span class="eti">Visitante</span>
  ├─ 1. Listado   /p/&lt;slug&gt;/propiedades
  │     · resolveTenantBySlug(): cuenta por slug y, si no existe, por la clave
  │       portalSlug de Configuracion (así funciona también el dominio propio)
  │     · inmuebles activos con filtros de operación, tipo, zona (JSONB),
  │       precio y texto libre · destacados primero
  ├─ 2. Ficha     /p/&lt;slug&gt;/propiedades/&lt;id&gt;
  │     · galería, mapa, datos y propiedades similares
  └─ 3. Contacto  POST /api/public/real-estate/contact      (con límite de peticiones)
        ├─ resuelve la cuenta por slug    → 400 o 404 con la causa
        ├─ exige nombre y email           → 400 con la causa
        ├─ crea el Lead con fuente = 'portal_inmobiliario'
        └─ publica el evento en el EventBus
              └─ Automation Engine → tarea de seguimiento
                 (plantilla del módulo: «Bienvenida a nuevo lead inmobiliario»)</div>

  <h3>La ficha del inmueble</h3>
  <p>La ficha pública es la misma información que el agente ve en el panel, con lo que el cliente puede decidir:
  galería, precio y operación, superficies, habitaciones, extras, certificación energética, mapa y un formulario
  que crea el lead en el CRM.</p>

  ${figura('14-portal-detalle', 'Ficha pública de un inmueble real de la demo, con mapa, características y formulario de contacto.')}

  <div class="destacado">
    <b>El lead del portal es el mismo lead del CRM.</b> Nace con <code>fuente = 'portal_inmobiliario'</code>, que
    es exactamente el filtro con el que el dashboard inmobiliario cuenta «Leads (Portal)». No hay bandeja aparte ni
    dos verdades sobre el mismo contacto.
  </div>
</section>

<!-- ══════════════ 7 · PIPELINE Y VISITAS ══════════════ -->
<section class="seccion">
  <div class="kicker">07 · Flujo B</div>
  <h2>Pipeline inmobiliario y visitas</h2>
  <p class="lead">El ciclo de venta es un pipeline del CRM con seis etapas propias, así que hereda arrastrar y
  soltar, ponderación por probabilidad, métricas y automatizaciones sin código nuevo.</p>

  ${figura('08-pipeline', 'El pipeline de la cuenta: etapas inmobiliarias, oportunidades y su valor ponderado.')}

  <table>
    <thead><tr><th class="c">#</th><th>Etapa</th><th class="c">Probabilidad</th><th>Qué significa</th></tr></thead>
    <tbody>
      <tr><td class="c">1</td><td>Contacto inicial</td><td class="c">10 %</td><td>Interés inicial o formulario del portal</td></tr>
      <tr><td class="c">2</td><td>Visita programada</td><td class="c">25 %</td><td>Hay una cita agendada sobre el inmueble</td></tr>
      <tr><td class="c">3</td><td>Oferta recibida</td><td class="c">50 %</td><td>El cliente presenta una oferta formal</td></tr>
      <tr><td class="c">4</td><td>Negociación</td><td class="c">70 %</td><td>Se negocian términos y condiciones</td></tr>
      <tr><td class="c">5</td><td>Escrituración</td><td class="c">90 %</td><td>Trámites legales y firma</td></tr>
      <tr><td class="c">6</td><td>Cerrado</td><td class="c">100 %</td><td>Etapa final (ganada)</td></tr>
    </tbody>
  </table>

  <p>Las visitas son <code>Cita</code> con <code>catalogoItemId</code>: la cita sabe sobre qué inmueble es, y el
  inmueble sabe qué visitas ha tenido. El dashboard inmobiliario las resume en «Visitas Agendadas» (pendientes con
  fecha futura y completadas).</p>

  <div class="aviso">
    <b>Cuidado con el recuento de visitas.</b> Solo entran las citas <code>pendiente</code> con fecha futura y las
    <code>completada</code>. Una visita en estado <code>confirmada</code> —como la de la cuenta de
    demostración— no aparece en ninguna de las dos cifras aunque exista. Está anotado como deuda (§16).
  </div>
</section>

<!-- ══════════════ 8 · EXPORTACIÓN ══════════════ -->
<section class="seccion">
  <div class="kicker">08 · Flujo C</div>
  <h2>Salida a portales</h2>
  <p class="lead">Publicar en tres portales es la misma consulta con tres traductores. Los feeds se descargan desde
  la propia interfaz, y un integrador puede pedir solo los cambios con el delta de sincronización.</p>

  ${figura('12-config-exportacion', 'Pestaña de exportación: formatos soportados, descarga directa y automatización por CRON.')}

  <table>
    <thead><tr><th>Formato</th><th>Ruta</th><th>Contenido</th></tr></thead>
    <tbody>
      <tr><td>Idealista (XML)</td><td><code>/api/real-estate/export?format=xml</code></td><td>Feed <code>idealista:feed</code> con la info de la empresa y un bloque por inmueble</td></tr>
      <tr><td>Fotocasa (CSV)</td><td><code>/api/real-estate/export?format=csv</code></td><td>29 columnas separadas por <code>;</code>, con URLs de fotos y etiquetas</td></tr>
      <tr><td>MLS (JSON)</td><td><code>/api/real-estate/export?format=json</code></td><td>Feed JSON para MLS internacional</td></tr>
      <tr><td>Delta</td><td><code>POST /api/real-estate/sync</code></td><td><code>{ added, updated, removed, total, lastSyncAt }</code> a partir de los identificadores anteriores</td></tr>
    </tbody>
  </table>

  <h3>El feed real, sin maquillar</h3>
  <p>Este es el XML que la cuenta de demostración devolvió el ${fechaCapturas}, descargado con su propia sesión:</p>

  ${xmlReal ? `<div class="pre">${xmlReal}</div>` : '<p><i>Los feeds no están en el directorio de capturas: ejecuta el script de capturas para citarlos.</i></p>'}

  <p>Y la misma primera línea en CSV, con las columnas del sector:</p>

  ${csvReal ? `<div class="pre">${csvReal}</div>` : ''}

  <h3>Dos detalles que el feed deja ver</h3>
  <ul>
    <li><b>La exportación solo saca lo disponible.</b> El feed declara 11 inmuebles de los 12 de la cuenta: el
    duodécimo está en estado <code>reservada</code> y la consulta filtra por <code>disponible</code> por defecto.
    La ruta admite <code>?status=</code>, pero el botón de la interfaz no lo usa.</li>
    <li><b>La divisa viaja por inmueble.</b> Cada línea lleva su <code>&lt;currency&gt;</code> correcta (los 12
    inmuebles de la demo están en MXN, con la cuenta declarada en EUR). Lo que no está conciliado son los
    <i>promedios</i> del panel (§17).</li>
  </ul>
</section>

<!-- ══════════════ 9 · CAPTACIÓN Y COMISIONES ══════════════ -->
<section class="seccion">
  <div class="kicker">09 · Flujo D</div>
  <h2>Captación, comisión y liquidación</h2>
  <p class="lead">La captación es el contrato con el propietario; la comisión es lo que la agencia gana al cerrar.
  Las dos están modeladas, y las dos se calculan con reglas explícitas en lugar de con fórmulas escondidas en una
  pantalla.</p>

  <div class="pre"><span class="eti">Captación</span>  (contrato con el propietario)
  ├── tipo: exclusiva | compartida | mandato
  ├── estado: borrador → activa → vencida | cerrada | cancelada
  ├── fechas: inicio, fin, firma, vencimiento, cancelación
  ├── economía: precio de oferta, precio mínimo, comisión (% o fija), condiciones
  └── documento firmado + huella del documento

<span class="eti">Operación cerrada</span> (Deal)
  └── calculateCommission(regla, valor, divisa)
        ├── porcentaje_venta       → valor × %
        ├── porcentaje_comision    → valor × %
        ├── monto_fijo             → importe fijo
        ├── escalonada             → tramos desde/hasta, cada uno con su %
        └── suscripcion_mensual    → cuota mensual (sin split: va entera a la franquicia)
              └── split agente / agencia (%)
                    └── Comision: pendiente → aprobada → pagada
                          └── referencia de pago y notas al liquidar</div>

  <p>La regla aplicada se guarda con la comisión (<code>metodoCalculo</code>), así que una liquidación se puede
  explicar meses después sin recalcular nada a mano. La divisa de la comisión sale de la operación, no de un valor
  por defecto.</p>

  ${figura('11-config-comisiones', 'Configuración de comisiones: tipo por defecto, porcentaje, cuota mensual y reparto agente/agencia.')}

  <div class="aviso">
    <b>Lo que hoy no se puede hacer desde el panel.</b> La captación tiene modelo, lógica y tres rutas de API, pero
    <b>ninguna pantalla</b>: no se firma, no se consulta y no se ve desde la interfaz. Y como no hay captaciones, no
    hay comisiones, y como no hay comisiones el bloque de franquicia del dashboard no llega a dibujarse. Es la
    pieza que falta para que el módulo enseñe el ciclo completo.
  </div>
</section>

<!-- ══════════════ 10 · FRANQUICIA ══════════════ -->
<section class="seccion">
  <div class="kicker">10 · Franquicia</div>
  <h2>Varias oficinas, un solo informe</h2>
  <p class="lead">Una franquicia es una central con oficinas hijas: <code>Tenant.parentId</code>. El módulo suma la
  cartera y las comisiones de todas las oficinas y las desglosa, sin que cada oficina vea los datos de las demás
  fuera de ese consolidado.</p>

  <div class="cols3">
    <div class="card">
      <h4>Cartera consolidada</h4>
      <p>Inmuebles activos, operaciones activas y leads del portal sumados de la central y de todas sus
      oficinas.</p>
    </div>
    <div class="card">
      <h4>Comisión por oficina</h4>
      <p>Total, pendiente y pagado por cada oficina, con el desglose de cada operación, su agente y su
      estado.</p>
    </div>
    <div class="card">
      <h4>Ranking por agente</h4>
      <p>Comisiones agrupadas por agente, con pendientes y pagadas, y filtro por rango de fechas.</p>
    </div>
  </div>

  <h3>Reglas del consolidado</h3>
  <ul>
    <li>La central se incluye siempre; las oficinas hijas se añaden cuando se pide el consolidado
    (<code>includeChildren</code>).</li>
    <li>Cada importe se escribe en la divisa del negocio del que sale, oficina por oficina, en vez de asumir una
    divisa única para toda la franquicia.</li>
    <li>El bloque de comisiones del dashboard <b>solo se dibuja si hay comisiones</b>: sin datos, el panel no
    muestra una sección vacía.</li>
  </ul>

  <div class="aviso">
    <b>En producción todavía no hay franquicia.</b> La cuenta de demostración no es una oficina hija
    (<code>parentId</code> vacío) y la tabla de comisiones está a cero: el consolidado está implementado y sin
    datos que consolidar (§17).
  </div>
</section>

<!-- ══════════════ 11 · IA ══════════════ -->
<section class="seccion">
  <div class="kicker">11 · IA</div>
  <h2>IA sobre la cartera</h2>
  <p class="lead">Seis capacidades registradas como skills y una consulta en lenguaje natural. Todas usan el motor
  de IA del ERP (con su control de cuotas por cuenta y su respaldo entre modelos), no una llamada suelta.</p>

  <table>
    <thead><tr><th>Capacidad</th><th>Qué hace</th></tr></thead>
    <tbody>
      <tr><td><code>generate_property_description</code></td><td>Redacta la descripción comercial de un inmueble a partir de sus datos reales</td></tr>
      <tr><td><code>suggest_price_based_on_market</code></td><td>Sugiere un precio comparando con inmuebles parecidos de la misma zona</td></tr>
      <tr><td><code>calculate_property_quality_score</code></td><td>Puntúa la calidad de la ficha (0–100) y dice qué le falta</td></tr>
      <tr><td><code>recommend_properties</code></td><td>Recomienda inmuebles a un cliente según su perfil</td></tr>
      <tr><td><code>calculate_franchise_commissions</code></td><td>Resuelve el reparto de comisiones en una franquicia</td></tr>
      <tr><td><code>search_properties_by_filters</code></td><td>Búsqueda por criterios para el asistente conversacional</td></tr>
    </tbody>
  </table>

  <h3>Consulta en lenguaje natural (RAG)</h3>
  <div class="pre">POST /api/ai/real-estate/consult   { consulta: "casa con alberca en Tulum hasta 5 millones" }

  1. El modelo extrae los filtros de la frase y los devuelve en JSON
     (operación, tipo, zona, precio mín./máx., habitaciones, baños, superficie,
      palabras clave e intención: consulta | búsqueda | comparación | recomendación)
  2. Se consultan los inmuebles que cumplen (hasta 8 resultados)
  3. La respuesta se redacta sobre esos inmuebles reales, con su precio y su divisa
  4. Si el modelo no está disponible, la consulta no se inventa: falla con su causa</div>

  <p>La extracción de filtros es tolerante: si el modelo devuelve el JSON envuelto en marcas de código, se limpia;
  si la frase no menciona un criterio, se deja vacío en vez de suponerlo.</p>
</section>

<!-- ══════════════ 12 · PUESTA EN MARCHA ══════════════ -->
<section class="seccion">
  <div class="kicker">12 · Puesta en marcha</div>
  <h2>Encender el módulo</h2>
  <p class="lead">Activar el vertical crea las piezas que el negocio necesita para empezar a trabajar y deja el
  resto en manos de la configuración por cuenta.</p>

  <div class="pre">POST /api/configuracion/real-estate/setup   →   seedRealEstateModule(tenantId)

  1. <span class="eti">Etapas del pipeline</span>   las 6 etapas inmobiliarias, solo si la cuenta
                     no tiene ninguna (idempotente por recuento)
  2. <span class="eti">Automatizaciones</span>     «Bienvenida a nuevo lead inmobiliario»
                     (si el lead viene del portal → tarea de llamada en 2 h, prioridad alta)
                     «Recordatorio de visita» (24 h antes, con retardo de 23 h)
  3. <span class="eti">Campos personalizados</span> ⚠ el seed <b>no</b> los crea: el preset se aplica
                     desde el endpoint de definiciones de campo (los 21 campos de
                     la demo los sembró su propio script)</div>

  <p>Después de sembrar, el setup escribe dos marcas (<code>fieldPresetApplied</code> y
  <code>pipelineStagesCreated</code>) y la pantalla de configuración vigila tres componentes. La primera marca se
  escribe <b>sin haber creado ningún campo</b> y la tercera no se escribe nunca, así que «Automatizaciones» sale
  «Pendiente» para siempre y una cuenta configurada por seed ve los tres en «Pendiente». Está en «Qué falta»
  (§15).</p>

  ${figura('09-config-general', 'Puesta en marcha: estado del módulo, componentes y configuración inicial.')}
</section>

<!-- ══════════════ 13 · CONFIGURACIÓN ══════════════ -->
<section class="seccion">
  <div class="kicker">13 · Configuración</div>
  <h2>El portal y su contenido</h2>
  <p class="lead">Todo lo que decide cómo se publica la cartera vive en la configuración de la cuenta: el slug
  público, el dominio propio, la divisa por defecto, la comisión y los formatos de exportación.</p>

  ${figura('10-config-portal', 'Portal público: publicación, slug, dominio propio y contenido servido por cuenta.')}

  <table>
    <thead><tr><th>Clave</th><th>Qué controla</th><th>Valor en la demo</th></tr></thead>
    <tbody>
      <tr><td><code>portalEnabled</code></td><td>Publicar o no el portal de la cuenta</td><td>publicado</td></tr>
      <tr><td><code>portalSlug</code></td><td>Dirección pública alternativa</td><td><code>realestate</code></td></tr>
      <tr><td><code>portalCustomDomain</code></td><td>Dominio propio apuntando al portal</td><td>vacío</td></tr>
      <tr><td><code>defaultCurrency</code></td><td>Divisa por defecto de inmuebles nuevos</td><td>vacío (la del alta)</td></tr>
      <tr><td><code>commissionType</code></td><td>Regla de comisión por defecto</td><td>% sobre venta</td></tr>
      <tr><td><code>defaultCommissionPct</code></td><td>Porcentaje por defecto</td><td>3 %</td></tr>
      <tr><td><code>defaultSplitAgent</code> / <code>defaultSplitAgency</code></td><td>Reparto agente / agencia</td><td>50 % / 50 %</td></tr>
      <tr><td><code>exportFormats</code> / <code>autoExport*</code></td><td>Formatos y automatización de los feeds</td><td>XML + CSV, manual</td></tr>
    </tbody>
  </table>

  <p>El portal se sirve en <code>/p/&lt;slug&gt;/propiedades</code> y la ficha en
  <code>/p/&lt;slug&gt;/propiedades/&lt;id&gt;</code>. Cuando se configura un dominio propio, el sistema lo resuelve
  contra la configuración de las cuentas y sirve el mismo contenido.</p>
</section>

<!-- ══════════════ 14 · API ══════════════ -->
<section class="seccion">
  <div class="kicker">14 · API</div>
  <h2>Quince rutas, dos puertas</h2>
  <p class="lead">Las rutas internas se autentican con sesión o con clave de API, y siempre con la cuenta resuelta;
  las públicas no llevan sesión, resuelven la cuenta por su identificador público y están limitadas por
  peticiones.</p>

  <table>
    <thead><tr><th>Grupo</th><th>Rutas</th></tr></thead>
    <tbody>
      <tr><td>Inmuebles</td><td><code>/api/real-estate/properties</code> · <code>properties/[id]</code> · <code>properties/[id]/media</code></td></tr>
      <tr><td>Captaciones</td><td><code>/api/real-estate/captaciones</code> · <code>captaciones/[id]</code></td></tr>
      <tr><td>Métricas</td><td><code>/api/real-estate/dashboard-stats</code></td></tr>
      <tr><td>Portales</td><td><code>/api/real-estate/export</code> · <code>/api/real-estate/sync</code></td></tr>
      <tr><td>Franquicia</td><td><code>/api/real-estate/franchise/overview</code> · <code>franchise/commissions</code></td></tr>
      <tr><td>Público</td><td><code>/api/public/real-estate/properties</code> · <code>properties/[id]</code> · <code>contact</code></td></tr>
      <tr><td>IA</td><td><code>/api/ai/real-estate/consult</code></td></tr>
      <tr><td>Puesta en marcha</td><td><code>/api/configuracion/real-estate/setup</code></td></tr>
      <tr><td>Dominio propio</td><td><code>/api/configuracion/resolve-domain</code></td></tr>
    </tbody>
  </table>

  <div class="cols2">
    <div class="card">
      <h4>Rutas internas</h4>
      <p>Pasan por <code>withTenantAuth()</code>: sesión de Volkern <b>o</b> clave de API, con la cuenta resuelta y
      el aislamiento por cuenta aplicado en cada consulta. Es la puerta de la interfaz y de los
      integradores.</p>
    </div>
    <div class="card">
      <h4>Rutas públicas</h4>
      <p>Sin sesión: identifican la cuenta por su slug, aplican límite de peticiones y devuelven solo lo que el
      portal muestra. El formulario de contacto crea el lead con su fuente marcada.</p>
    </div>
  </div>

  <div class="destacado">
    <b>Cobertura de pruebas.</b> <b>85 pruebas en verde</b> repartidas en cinco ficheros
    <code>real-estate-*</code>, que cubren el contrato de la API de inmuebles, la traducción de los campos, el
    cálculo de comisiones, la consulta IA y el reconocimiento de intenciones. No hay pruebas específicas de
    aislamiento entre cuentas, ni de captaciones, exportación o franquicia.
  </div>
</section>

<!-- ══════════════ 15 · QUÉ FALTA ══════════════ -->
<section class="seccion">
  <div class="kicker">15 · Estado del módulo</div>
  <h2>Qué falta</h2>
  <p class="lead">Separado por naturaleza: lo que impide usar una capacidad ya construida, lo que se ve en pantalla
  y lo que es deuda técnica de fondo.</p>

  <h3>A · Capacidad construida sin puerta de entrada</h3>
  <table>
    <thead><tr><th>#</th><th>Qué falta</th><th>Consecuencia</th></tr></thead>
    <tbody>
      <tr><td class="c">1</td><td><b>Interfaz de captaciones.</b> Hay modelo, lógica y tres rutas de API, y ninguna pantalla que las muestre o las cree</td><td>El contrato con el propietario solo existe para un programador. Sin captación no hay comisión, y sin comisión el bloque de franquicia no se dibuja</td></tr>
      <tr><td class="c">2</td><td><b>Sello de integridad de la captación.</b> <code>auditHash</code>, <code>chainedHash</code>, <code>sealedAt</code> y <code>signatureAudit</code> están declarados y vacíos</td><td>El mismo patrón de cadena que ya protege contratos, nóminas y stock no cubre el contrato con el propietario</td></tr>
      <tr><td class="c">3</td><td><b>El dashboard inmobiliario no está enlazado</b>: sin entrada de menú ni enlace desde ninguna pantalla</td><td>Solo llega quien conoce la URL</td></tr>
    </tbody>
  </table>

  <h3>B · Lo que hoy se ve (o no se ve) mal</h3>
  <table>
    <thead><tr><th>#</th><th>Qué falta</th><th>Detalle</th></tr></thead>
    <tbody>
      <tr><td class="c">4</td><td><b>Los promedios ignoran la divisa del inmueble</b></td><td>El panel promedia ventas de millones junto a alquileres de cientos y escribe el resultado en la divisa de la <i>cuenta</i>. En la demo: «Precio Promedio 3.451.233 €» sobre inmuebles valorados en MXN</td></tr>
      <tr><td class="c">5</td><td><b>El pipeline escribe en MXN fijo</b></td><td>Los KPI del pipeline formatean con <code>'MXN'</code> y locale mexicano: una cuenta en euros ve el valor total en pesos (las filas de cada operación sí usan su divisa)</td></tr>
      <tr><td class="c">6</td><td><b>El enlace al portal público del dashboard está mal</b></td><td>Apunta a una ruta que no resuelve a ninguna cuenta; debería usar el slug configurado</td></tr>
      <tr><td class="c">7</td><td><b>Leads y visitas se cuentan de menos</b></td><td>Solo cuentan los leads con la fuente exacta del portal y las visitas pendientes o completadas: una visita confirmada vinculada a un inmueble no aparece</td></tr>
      <tr><td class="c">8</td><td><b>La exportación solo saca lo disponible</b></td><td>La ruta admite filtrar por estado, pero la interfaz no lo ofrece</td></tr>
    </tbody>
  </table>

  <h3>C · Deuda de fondo</h3>
  <table>
    <thead><tr><th>#</th><th>Qué falta</th><th>Detalle</th></tr></thead>
    <tbody>
      <tr><td class="c">9</td><td><b>Los filtros se aplican en memoria</b></td><td>Se leen todos los inmuebles activos de la cuenta sin límite y luego se filtra y se pagina: la paginación del listado no ahorra una sola fila leída</td></tr>
      <tr><td class="c">10</td><td><b>Sin índices GIN sobre los campos del inmueble</b></td><td>El portal, el listado y la exportación filtran por rutas JSONB y la tabla solo tiene índices convencionales por cuenta, tipo, estado y código</td></tr>
      <tr><td class="c">11</td><td><b>Tres listas de campos del inmueble</b></td><td>El preset de la API (38 campos), el seed genérico del módulo y el seed de la demo (21 activos) no coinciden entre sí</td></tr>
      <tr><td class="c">12</td><td><b>Sin pruebas de aislamiento del módulo</b></td><td>La API aísla por cuenta, pero no hay una prueba que lo demuestre para inmuebles, captaciones ni exportación</td></tr>
      <tr><td class="c">13</td><td><b>Datos que hacen falta para una demo completa</b></td><td>0 captaciones y 0 comisiones en producción: tres pantallas del ciclo inmobiliario no tienen nada que enseñar</td></tr>
      <tr><td class="c">14</td><td><b>El setup se declara «hecho» sin crear los campos</b></td><td>Marca el preset como aplicado sin haber creado un campo y nunca marca las automatizaciones: el indicador mide si se pulsó el botón, no si el módulo está configurado. En la demo, los tres componentes salen «Pendiente» con 21 campos y 13 etapas ya existentes</td></tr>
      <tr><td class="c">15</td><td><b>Tres intentos de migración sin cerrar</b></td><td>Quedan filas sin cerrar en el registro de migraciones aunque su esquema sí está aplicado: estorban a la verificación automática</td></tr>
    </tbody>
  </table>

  <h3>D · Fuera de alcance declarado (no es deuda)</h3>
  <p>Sincronización bidireccional real (bajada de datos desde los portales), firma electrónica del contrato de
  captación, valoración con datos de mercado externos y app móvil de agentes.</p>
</section>

<!-- ══════════════ 16 · ESTADO REAL ══════════════ -->
<section class="seccion">
  <div class="kicker">16 · Producción</div>
  <h2>Estado real en producción</h2>
  <p class="lead">Medido el ${fechaCapturas} con consultas de solo lectura sobre la única cuenta con datos
  inmobiliarios reales: <b>Demo Real Estate</b> (<code>demo-real-estate.volkern.app</code>).</p>

  <table>
    <thead><tr><th>Dato</th><th>Valor</th></tr></thead>
    <tbody>
      <tr><td>Módulos habilitados de la cuenta</td><td><code>crm</code>, <code>real-estate</code>, <code>leads</code>, <code>calendario</code></td></tr>
      <tr><td>Plan / tipo de cuenta</td><td><code>profesional</code> · BUSINESS · sin central de franquicia</td></tr>
      <tr><td>Inmuebles</td><td><b>12</b> — 11 disponibles · 1 reservada · 5 destacadas · 12 activos</td></tr>
      <tr><td>Por operación</td><td>6 venta · 6 alquiler de temporada</td></tr>
      <tr><td>Divisa</td><td>Los 12 inmuebles en MXN · divisa de la cuenta: EUR</td></tr>
      <tr><td>Certificación energética cargada</td><td>0 inmuebles</td></tr>
      <tr><td>Captaciones</td><td><b>0</b> (vacía en toda la plataforma)</td></tr>
      <tr><td>Comisiones</td><td><b>0</b> — el panel de franquicia no llega a dibujarse</td></tr>
      <tr><td>Pipeline inmobiliario</td><td>2 pipelines, 13 etapas (6 + 7)</td></tr>
      <tr><td>Operaciones (deals)</td><td>6 · el pipeline vacacional suma 66.050 en 4 oportunidades</td></tr>
      <tr><td>Leads</td><td>5 (referido, instagram, booking, airbnb, google) · <b>0 con fuente de portal</b></td></tr>
      <tr><td>Citas</td><td>3 · 1 vinculada a un inmueble (estado confirmada)</td></tr>
      <tr><td>Contactos</td><td>28 (incluye propietarios vinculados a su inmueble)</td></tr>
      <tr><td>Campos del inmueble activos</td><td>21</td></tr>
      <tr><td>Roles / usuarios</td><td>8 roles · 3 usuarios</td></tr>
      <tr><td>Portal público</td><td>publicado · slug <code>realestate</code> · sin dominio propio</td></tr>
      <tr><td>Migraciones cerradas</td><td>106</td></tr>
    </tbody>
  </table>

  <div class="destacado">
    <b>Lo que enseña una demo hoy.</b> El dashboard, con 12 propiedades, 5 destacadas y su distribución por
    operación y zona; el listado, con los 12 inmuebles y sus fotos; el portal público, con el buscador y las fichas;
    el pipeline, con 4 oportunidades; y la exportación, con los tres formatos. <b>No enseña</b> captación,
    comisiones ni franquicia, porque las tres tablas están a cero y la primera no tiene pantalla. Es la pieza que
    cierra el ciclo —captar, publicar, visitar, cerrar, comisionar— y hoy es la única mitad que falta.
  </div>

  <h3>Criterios del plan frente al estado real</h3>
  <table>
    <thead><tr><th>Criterio</th><th>Estado</th></tr></thead>
    <tbody>
      <tr><td>El inmueble es un ítem de catálogo, no una tabla paralela</td><td class="si">cumplido</td></tr>
      <tr><td>Campos del inmueble configurables por cuenta</td><td class="si">cumplido (21 activos)</td></tr>
      <tr><td>Franquicia soportada</td><td>cumplido en modelo y cálculo · sin datos en producción</td></tr>
      <tr><td>Pipeline inmobiliario de 6 etapas</td><td class="si">cumplido</td></tr>
      <tr><td>Portal público con filtros, fichas y SEO</td><td class="si">cumplido</td></tr>
      <tr><td>Exportación con formatos del sector</td><td class="si">cumplido (3 formatos + delta)</td></tr>
      <tr><td>IA sobre la cartera</td><td class="si">cumplido (6 skills + consulta en lenguaje natural)</td></tr>
      <tr><td>Comisión por operación con splits y liquidación</td><td>cumplido en cálculo · sin datos y sin panel cuando no hay comisiones</td></tr>
      <tr><td>Contrato de captación con exclusividad y comisión</td><td class="no">modelo y API sin interfaz y sin sello de integridad</td></tr>
      <tr><td>Aislamiento multi-tenant</td><td>aplicado en toda la API interna · sin prueba específica del módulo</td></tr>
      <tr><td>Índices GIN para los filtros del plan</td><td class="no">no aplicados</td></tr>
    </tbody>
  </table>
</section>

<!-- ══════════════ 17 · ANEXO ══════════════ -->
<section class="seccion">
  <div class="kicker">17 · Anexo</div>
  <h2>Cómo se regenera este documento</h2>
  <p class="lead">Las capturas y el PDF se producen con dos scripts del repositorio. El contenido de este documento
  vive en <code>docs/real-estate-ficha-tecnica.md</code>.</p>

  <div class="pre"># 1. Capturas reales del módulo (contraseña de la demo leída del entorno)
DEMO_RE_PASSWORD='…' node scripts/capturar-pantallas-real-estate.cjs

# 2. Documento en PDF (lee el manifest de las capturas y los feeds)
node scripts/generar-pdf-tecnico-real-estate.cjs
#    Deja docs/real-estate-tecnico.pdf y el HTML intermedio en /tmp</div>

  <p>Las capturas se toman en tema claro, sin el banner de cookies, sin los avisos flotantes y sin el resumen
  diario que la aplicación abre una vez al día, para que las imágenes muestren solo el módulo. La contraseña
  <b>nunca</b> se escribe en el repositorio.</p>

  <h3>Índice de capturas</h3>
  <table>
    <thead><tr><th class="c">#</th><th>Pantalla</th><th>Ruta</th></tr></thead>
    <tbody>
      ${manifest.capturas.map((c, i) => `<tr><td class="c">${i + 1}</td><td>${c.titulo}</td><td><code>${c.ruta}</code></td></tr>`).join('\n      ')}
    </tbody>
  </table>

  <h3>Documentos relacionados</h3>
  <ul>
    <li><code>docs/real-estate-ficha-tecnica.md</code> — inventario y estado del módulo (fuente de este documento).</li>
    <li><code>docs/REAL-ESTATE-MODULE.md</code> — documento de módulo original (referencia histórica).</li>
    <li><code>docs/OPERATIONAL-MANUAL-REAL-ESTATE.md</code> — manual operativo del vertical.</li>
    <li><code>docs/COMMERCIAL-REAL-ESTATE.md</code> — material comercial.</li>
    <li><code>docs/hospitality-tecnico.pdf</code> — el mismo tipo de documento para el módulo Hospitality.</li>
  </ul>

  <div class="pie-firma">
    Volkern · Documento técnico del módulo Real Estate · Contenido al 2026-09-29 · Capturas del ${fechaCapturas}
    (${origenCapturas}, tenant «Demo Real Estate»). Generado con <code>scripts/generar-pdf-tecnico-real-estate.cjs</code>.
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
          <span>Volkern · Módulo Real Estate — Documento técnico</span>
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
