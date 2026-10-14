#!/usr/bin/env node
/**
 * Ensayo E2E del Booking Engine público (FASE 3.D del plan de Booking Engine
 * + Payments). Recorre el flujo completo contra un servidor de desarrollo:
 *
 *   1. Publica una propiedad de prueba VÍA LAS APIs reales de gestión
 *      (propiedades → unidades → tarifas), con una API key temporal creada y
 *      eliminada por el propio script, y la publica en la lista
 *      `propiedadesPublicadas` de la configuración del Booking Engine (el ÚNICO
 *      criterio de publicación desde que la página pública es una sola).
 *   2. Comprueba la puerta de publicación: fuera de la lista la página no expone
 *      la propiedad (404/409 en la API pública); dentro de ella, sí.
 *   3. Reserva por la API pública (la misma que usa la página /reservar/<slug>):
 *      catálogo, cotización con el motor central, restricción de estancia
 *      mínima, creación de la reserva e idempotencia (el mismo intento no
 *      duplica) y overbooking (el solape devuelve 409).
 *   4. La retención que caduca sola: crea un hold `pending` por la API real de
 *      gestión y comprueba que BLOQUEA la venta pública (la página no ofrece la
 *      unidad y reservar esas fechas devuelve 409). Le envejece la fecha de
 *      creación y corre el barrido real de holds
 *      (`GET /api/cron/hospitality-holds-expirados`), y verifica que la unidad
 *      VUELVE a venderse: la cotización la ofrece otra vez y una reserva pública
 *      nueva entra de verdad. Con las dos contrapruebas que impiden que el
 *      ensayo mienta: un hold CON PAGOS y otro dentro de su ventana NO caducan.
 *   4b. El ciclo en inglés (?lang=en): crea las plantillas de confirmación ES y
 *      EN por la API real de comunicaciones, reserva desde la página pública en
 *      inglés y verifica que el idioma viaja con la reserva (guestData.idioma),
 *      que es lo que las comunicaciones automáticas al huésped (§21) leen para
 *      escribirle en su idioma. Contraprueba: sin lang, la reserva nace en español.
 *   4f. Las preguntas personalizadas del check-in (lo que el hotel pregunta
 *      ADEMÁS de lo que el Ministerio exige): el hotel crea la pregunta por la
 *      API real del producto (con opciones ES/EN y obligatoria), el huésped la
 *      responde en su enlace de check-in y el operador la ve en la lista de
 *      reservas etiquetada con el TEXTO de la pregunta. Contrapruebas: lo que
 *      el huésped mande que no corresponde a ninguna pregunta se descarta, la
 *      estancia futura no dispara el parte (el registro comunica la entrada),
 *      la baja de la pregunta conserva las respuestas ya guardadas y el parte
 *      oficial ni se entera de que existen. Corre SIEMPRE: no necesita el mock
 *      del Ministerio.
 *   4g. La pre-llegada que recuerda lo que el hotel preguntó: una reserva con
 *      check-in MAÑANA entra en la ventana real del cron de check-in
 *      (`/api/cron/hospitality-checkin-due`), que dispara la plantilla
 *      pre_llegada del tenant. Con la pregunta obligatoria sin responder, el
 *      recordatorio la NOMBRA en el idioma del huésped y trae el enlace del
 *      formulario. Se comprueba sobre el email REAL que envía el servidor —
 *      capturado por el mock local (ruta /email) —, no sobre una réplica del
 *      render. Contrapruebas: el huésped EN recibe el texto EN con el nombre EN
 *      de la pregunta, el email no lleva llaves de plantilla sin renderizar ni
 *      restos del otro idioma, y repetir el cron NO duplica el envío (guard
 *      AuditLog). Corre solo con el email apuntado al mock local.
 *   5. Verifica que la reserva entra en el PLANNING consultando exactamente la
 *      misma API y ventana que usa la página del planning.
 *   6. Limpia los datos del ensayo (la propiedad arrastra unidades, tarifas,
 *      reservas y líneas por cascade; las plantillas de comunicación se borran
 *      aparte porque cuelgan del tenant).
 *
 * Uso:
 *   node scripts/e2e-booking-engine.mjs                    # contra localhost:3000
 *   BASE_URL=http://localhost:3098 node scripts/e2e-booking-engine.mjs
 *   node scripts/e2e-booking-engine.mjs --keep             # deja los datos para mirarlos
 *   node scripts/e2e-booking-engine.mjs --cleanup          # borra lo que dejó un --keep
 *
 * La propiedad y las unidades usan el código E2E-BE, así que el ensayo se puede
 * repetir: al arrancar limpia cualquier resto anterior.
 */
import { readFileSync } from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';
import http from 'node:http';
import path from 'node:path';
import { inflateRawSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';

// ─── Entorno ────────────────────────────────────────────────────────────────
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
cargarEnv(path.join(RAIZ, '.env'));

/** Carga .env sin pisar lo que ya venga del proceso (no sobrescribe). */
function cargarEnv(ruta) {
  let contenido = '';
  try {
    contenido = readFileSync(ruta, 'utf8');
  } catch {
    return;
  }
  for (const linea of contenido.split('\n')) {
    const t = linea.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i < 0) continue;
    const clave = t.slice(0, i).trim();
    let valor = t.slice(i + 1).trim();
    if (
      (valor.startsWith('"') && valor.endsWith('"')) ||
      (valor.startsWith("'") && valor.endsWith("'"))
    ) {
      valor = valor.slice(1, -1);
    }
    if (!(clave in process.env)) process.env[clave] = valor;
  }
}

// ─── Configuración del ensayo ───────────────────────────────────────────────
const BASE = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/+$/, '');
const EMAIL_USUARIO = process.env.E2E_TENANT_EMAIL || 'admin@volkern.com';
const MODO = process.argv.includes('--cleanup')
  ? 'cleanup'
  : process.argv.includes('--keep') || process.env.KEEP === '1'
    ? 'keep'
    : 'ensayo';

const KEEP = MODO === 'keep' || process.env.KEEP === '1';

const CODIGO_PROPIEDAD = 'E2E-BE';
const CODIGO_UNIDAD_A = 'E2E-BE-A';
const CODIGO_UNIDAD_B = 'E2E-BE-B';
const EMAIL_PREFIJO = 'ensayo-booking+';
// Los huéspedes de los holds usan su propio prefijo: así el ensayo los distingue
// de la reserva pública (y la assertion de «una sola reserva del ensayo» sigue
// midiendo lo que debe medir).
const EMAIL_PREFIJO_HOLD = 'ensayo-hold+';
const NOMBRE_API_KEY = 'Ensayo E2E booking engine';
const NOMBRE_PROPIEDAD = 'Ensayo Booking Engine (Hotel Volcán)';

// Unidad A: 1500/noche, mínimo 2 noches (ejercita la restricción del rate plan).
// Unidad B: 1200/noche, sin mínimo.
const UNIDADES = [
  { codigo: CODIGO_UNIDAD_A, nombre: 'Suite Volcán', capacidad: 2, tarifaBase: 1000, tarifa: 1500, minNoches: 2 },
  { codigo: CODIGO_UNIDAD_B, nombre: 'Loft Bosque', capacidad: 3, tarifaBase: 900, tarifa: 1200, minNoches: 1 },
];

const noches = 2;
const checkIn = sumarDias(hoy(), 2);
const checkOut = sumarDias(checkIn, noches);
const checkInUnaNoche = sumarDias(checkOut, 1);
const checkOutUnaNoche = sumarDias(checkInUnaNoche, 1);
const CLAVE_IDEMPOTENCIA = `ensayo-be-${iso(checkIn)}`;
const EMAIL_HUESPED = `${EMAIL_PREFIJO}${iso(checkIn)}@ensayo.test`;

// ─── El hold que caduca solo (bloque 4) ─────────────────────────────────────
// La ventana que se configura en el ensayo: 1 h (el mínimo razonable de una
// propiedad que retiene poco), para que «caducar» sea reproducible sin esperar.
const HOLD_HORAS_PRUEBA = 1;
// Se envejece el hold más allá de la ventana y del prefiltro del barrido (30 min).
const HOLD_ENVEJECIDO_HORAS = 3;
// Rango de la retención que se deja vencer. Unidad B: sin mínimo de noches.
const holdCheckIn = sumarDias(checkOutUnaNoche, 2);
const holdCheckOut = sumarDias(holdCheckIn, 1);
// Contraprueba 1: un hold CON PAGOS registrados no caduca (decide una persona).
const holdPagosCheckIn = sumarDias(holdCheckOut, 2);
const holdPagosCheckOut = sumarDias(holdPagosCheckIn, 1);
// Contraprueba 2: un hold DENTRO de su ventana tampoco caduca (Unidad A: 2 noches).
const holdVivoCheckIn = sumarDias(holdPagosCheckOut, 2);
const holdVivoCheckOut = sumarDias(holdVivoCheckIn, 2);
const EMAIL_HOLD = `${EMAIL_PREFIJO_HOLD}${iso(holdCheckIn)}@ensayo.test`;
const EMAIL_HOLD_PAGOS = `${EMAIL_PREFIJO_HOLD}pagos@ensayo.test`;
const EMAIL_HOLD_VIVO = `${EMAIL_PREFIJO_HOLD}ventana@ensayo.test`;
const EMAIL_HOLD_REVENTA = `${EMAIL_PREFIJO_HOLD}reventa@ensayo.test`;
const EMAIL_HOLD_BLOQUEADO = `${EMAIL_PREFIJO_HOLD}bloqueado@ensayo.test`;

// ─── Plantillas de comunicación del bloque i18n (4b) ────────────────────────
// Mismo contenido con las MISMAS variables: la paridad ES/EN es lo que la
// guardia de i18n exige al módulo, y aquí se comprueba sobre las plantillas
// que el hotel crearía de verdad. Viven a nivel de módulo para que la limpieza
// (incluida la de --cleanup) pueda borrarlas aunque el ensayo muera a medias.
const COMMS_ASUNTO_ES = 'Tu reserva en {{propiedad}}';
const COMMS_ASUNTO_EN = 'Your booking at {{propiedad}}';
const COMMS_CONTENIDO_ES =
  '¡Hola {{nombre}}! Tu llegada a {{propiedad}} ({{unidad}}) es el {{checkIn}}. Total {{importe}}. Referencia {{referencia}}.';
const COMMS_CONTENIDO_EN =
  'Hi {{nombre}}! Your arrival at {{propiedad}} ({{unidad}}) is on {{checkIn}}. Total {{importe}}. Reference {{referencia}}.';
// Un idioma que no existe: la API debe rechazarlo con 400.
const COMMS_IDIOMA_INVALIDO = 'fr';
// ─── La pre-llegada que recuerda las preguntas (bloque 4g) ──────────────────
// El hotel define SU recordatorio de pre-llegada con la variable
// {{preguntas_pendientes}}: es la plantilla que el cron de check-in dispara de
// verdad. La limpieza las borra por el contenido (cuelgan del tenant); el
// asunto no necesita constante porque el email se localiza por el destinatario.
const PRELLEGADA_CONTENIDO_ES =
  'Hola {{nombre}}, tu llegada a {{propiedad}} es mañana ({{checkIn}}).\n\nFalta por responder: {{preguntas_pendientes}}\n\nCompleta tu registro aquí: {{enlace_checkin}}';
const PRELLEGADA_CONTENIDO_EN =
  'Hi {{nombre}}, your arrival at {{propiedad}} is tomorrow ({{checkIn}}).\n\nStill to answer: {{preguntas_pendientes}}\n\nComplete your registration here: {{enlace_checkin}}';

// ─── El ciclo del registro de viajeros (bloque 4c) ──────────────────────────
// El ensayo ejercita el envío REAL al Servicio de Hospedajes (cabecera SOAP,
// ZIP+Base64, alta asíncrona con lote y consulta posterior), pero contra un
// mock servido en local: el servidor de desarrollo se arranca con
// `MIR_E2E_ENDPOINT` apuntando aquí (ver scripts/run-e2e-booking-engine.sh), así
// que **ningún servicio del Ministerio se toca**. El mock solo se levanta —y el
// bloque solo corre— si el servidor está apuntado al mock: sin esa señal, el
// ensayo NO configura el arrendador y lo dice, en vez de hablar con el
// Ministerio con credenciales de prueba.
/**
 * Puerto del mock. El ensayo NO lo fija: lo toma de `E2E_MIR_PORT` o, mejor, del
 * propio endpoint al que se apuntó el servidor de desarrollo, de modo que el
 * mock escuche donde el servidor va a llamar. Un puerto fijo es una trampa: si
 * otro proceso (otra corrida, un mock anterior) ya responde ahí, el servidor
 * habla con él y el ensayo leería un registro de peticiones que no es el suyo.
 */
function puertoDelMock() {
  const declarado = Number(process.env.E2E_MIR_PORT);
  if (Number.isInteger(declarado) && declarado > 0) return declarado;
  try {
    const delEndpoint = Number(new URL(process.env.E2E_MIR_ENDPOINT ?? '').port);
    if (Number.isInteger(delEndpoint) && delEndpoint > 0) return delEndpoint;
  } catch {
    /* sin endpoint (o no es una URL): se usa el valor de siempre */
  }
  return 4620;
}

const MIR_MOCK_PUERTO = puertoDelMock();
// Identidad de esta corrida. Cada respuesta del mock la lleva estampada y el
// mock se la exige a su propia sonda: así el ensayo distingue su mock del de
// otra corrida (o de un `next dev` huérfano) que se hubiera quedado con el
// puerto. Sin esto, el servidor de desarrollo podría hablar con el mock
// equivocado y el ensayo leería un registro de peticiones que no es el suyo.
const MIR_RUN_ID = `${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
const MIR_MOCK_URL = `http://127.0.0.1:${MIR_MOCK_PUERTO}/hospedajes-web/ws/v1/comunicacion`;
// Datos del arrendador de ensayo: los que el hotel configura una vez.
const MIR_CODIGO_ARRENDADOR = 'E2E0000001';
const MIR_APLICACION = 'EnsayoE2E';
const MIR_USUARIO = 'ensayo-hospedajes';
const MIR_PASSWORD = 'clave-de-ensayo';
// Código de establecimiento del inmueble: lo asigna el Ministerio al registrar
// la propiedad (el ensayo informa uno de prueba, como haría el hotel).
const MIR_CODIGO_ESTABLECIMIENTO = 'E2E0001234';
// Código del catálogo TIPO_PAGO del Ministerio. Es CONFIGURACIÓN, no una
// constante del producto: el ensayo lo informa como lo haría el operador.
const MIR_TIPO_PAGO = 'EFECT';
const MIR_LOTE = 'E2E-LOTE-1';
const MIR_CODIGO_COMUNICACION = 'E2E-COM-1';
// ─── El rechazo del Ministerio (bloque 4d) ──────────────────────────────────
// El ensayo no puede esperar a que el Ministerio rechace un parte de verdad, así
// que el mock imita el rechazo de UN campo. El disparador es el documento del
// huésped, y ese documento es válido para el validador del producto (es NIF
// correcto): el producto no puede saber que el servicio lo rechazará —solo lo
// sabe cuando el servicio lo dice—, y eso es exactamente lo que hay que probar.
const MIR_DOCUMENTO_RECHAZADO = '11111111H';
/** Documento con el que el operador corrige el parte rechazado. */
const MIR_DOCUMENTO_CORRECTO = '12345678Z';
/**
 * Documento del ciclo de la CAÍDA del servicio: el ensayo lo usa con el mock
 * «caído», así que aquí el documento solo tiene que ser válido para el validador
 * del producto (el servicio no llega a opinar sobre él).
 */
const MIR_DOCUMENTO_CAIDA = '99999999R';
const MIR_LOTE_RECHAZADO = 'E2E-LOTE-2';
/** El error viaja con la ruta del campo, que es lo que el aviso tiene que leer. */
const MIR_ERROR_DE_LOTE =
  'persona[0].numeroDocumento: el documento no consta como válido en el Ministerio';
/**
 * Tope de intentos de envío por parte (el `MAX_INTENTOS_PARTE` del producto). El
 * guion no puede importar módulos TS, y el unitario del cron fija que la cifra
 * del barrido y la del módulo puro no se separen.
 */
const MIR_MAX_INTENTOS = 5;
const EMAIL_PREFIJO_MIR = 'ensayo-mir+';
// ─── Las preguntas personalizadas del check-in (bloque 4f) ────────────────
// La pregunta la define el HOTEL: texto ES y EN (la EN la sirve el enlace
// ?lang=en), opciones y obligatoria. El `es` distingue a la del ensayo de
// cualquier pregunta real del tenant: la limpieza la borra por ese texto.
const PREGUNTA_ES = 'Hora estimada de llegada (ensayo E2E)';
const PREGUNTA_EN = 'Estimated arrival time (E2E rehearsal)';
const EMAIL_PREFIJO_PREGUNTAS = 'ensayo-preguntas+';
/** Huésped del ciclo: los datos que el canal no manda y el huésped sí aporta. */
const MIR_VIAJERO = {
  nombre: 'Ana',
  apellido1: 'Ruiz',
  apellido2: 'Sáez',
  tipoDocumento: 'NIF',
  numeroDocumento: '00000000T',
  soporteDocumento: '999999999',
  fechaNacimiento: '1990-01-01',
  nacionalidad: 'ESP',
  sexo: 'H',
  direccion: {
    direccion: 'C/Serrano 127',
    codigoMunicipio: '28079',
    codigoPostal: '28001',
    pais: 'ESP',
  },
  telefono: '666666666',
  parentesco: null,
};
/** Mock levantado por el ensayo (se cierra al terminar, pase lo que pase). */
let MIR_MOCK = null;

// ─── La página pública: UNA puerta y UN criterio ──────────────────────────
// Desde la unificación hay una sola página (`/reservar/<slug>`) y una sola API
// pública (`/api/public/booking/<slug>/cotizar|reservar`), y el único criterio
// de publicación es la lista `propiedadesPublicadas` de la configuración del
// tenant. El ensayo publica por la API real (la misma que usa el panel) y
// DEVUELVE la configuración a como estaba al terminar: la propiedad «conectada»
// ya no publica nada por sí sola.
let SLUG_PUBLICO = null;
let PROP_ID = null;
let TENANT_ID = null;
let CONFIG_BOOKING_PREVIA = null;
let CONFIG_CREADA_POR_ENSAYO = false;

// ─── Salida ─────────────────────────────────────────────────────────────────
const verde = (s) => `\x1b[32m${s}\x1b[0m`;
const rojo = (s) => `\x1b[31m${s}\x1b[0m`;
const cian = (s) => `\x1b[36m${s}\x1b[0m`;
const gris = (s) => `\x1b[90m${s}\x1b[0m`;
const titulo = (s) => `\n\x1b[1m${s}\x1b[0m\n`;

let pasos = 0;
let fallos = 0;
const detalleFallos = [];

function ok(nombre, detalle = '') {
  pasos += 1;
  console.log(`  ${verde('✔')} ${nombre}${detalle ? gris(` — ${detalle}`) : ''}`);
}
function fallo(nombre, detalle = '') {
  pasos += 1;
  fallos += 1;
  detalleFallos.push(`${nombre}${detalle ? ` — ${detalle}` : ''}`);
  console.log(`  ${rojo('✘')} ${nombre}${detalle ? ` — ${detalle}` : ''}`);
}
function info(texto) {
  console.log(`  ${cian('→')} ${texto}`);
}

function esperar(condicion, nombre, detalle = '') {
  if (condicion) ok(nombre, detalle);
  else fallo(nombre, detalle);
  return !!condicion;
}

// ─── Fechas ─────────────────────────────────────────────────────────────────
function hoy() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}
function sumarDias(fecha, dias) {
  const d = new Date(fecha);
  d.setDate(d.getDate() + dias);
  return d;
}
function iso(fecha) {
  const y = fecha.getFullYear();
  const m = String(fecha.getMonth() + 1).padStart(2, '0');
  const d = String(fecha.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
/** Lunes de la semana en curso: el mismo rango que usa el planning al abrirse. */
function inicioSemanaPlanning(fecha) {
  const ref = new Date(fecha);
  const dow = (ref.getDay() + 6) % 7; // 0 = lunes (currentWeekRange del módulo)
  return sumarDias(ref, -dow);
}

// ─── HTTP ───────────────────────────────────────────────────────────────────
async function peticion(ruta, { metodo = 'GET', cuerpo, apiKey, cabeceras } = {}) {
  const res = await fetch(`${BASE}${ruta}`, {
    method: metodo,
    headers: {
      ...(cuerpo ? { 'content-type': 'application/json' } : {}),
      ...(apiKey ? { 'x-api-key': apiKey } : {}),
      ...(cabeceras || {}),
    },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  const texto = await res.text();
  let json = null;
  try {
    json = texto ? JSON.parse(texto) : null;
  } catch {
    json = { raw: texto.slice(0, 300) };
  }
  return { status: res.status, json };
}

// ─── Prisma (solo semilla y limpieza: el flujo va por HTTP) ─────────────────
// ─── La puerta pública (adaptadores) ───────────────────────────────────────
// Las comprobaciones del ensayo se escribieron contra la API pública anterior.
// En vez de reescribir cada una, estos dos adaptadores hablan con la puerta
// ÚNICA y devuelven la forma que el ensayo ya sabe leer. Lo que NO se adapta es
// la disponibilidad: el motor nuevo responde con las unidades que SÍ se pueden
// vender (o con el motivo por el que no), así que las comprobaciones de
// disponibilidad y de restricciones del plan preguntan por la unidad concreta.

/** Fecha ISO, venga como `Date` (los bloques del ensayo) o ya como texto. */
function aIso(valor) {
  return typeof valor === 'string' ? valor : iso(valor);
}

/**
 * Cotiza por la puerta pública. Con `unitId`, la respuesta habla de ESA unidad:
 * es como el ensayo pregunta «¿se puede vender esta?» y lee el motivo cuando no.
 */
async function cotizarPublico({ checkIn: desde, checkOut: hasta, unitId, adultos = 2 } = {}) {
  return peticion(`/api/public/booking/${SLUG_PUBLICO}/cotizar`, {
    metodo: 'POST',
    cuerpo: {
      propertyId: PROP_ID,
      checkIn: aIso(desde),
      checkOut: aIso(hasta),
      adultos,
      ninos: 0,
      ...(unitId ? { unitId } : {}),
    },
  });
}

/**
 * Reserva por la puerta pública. Acepta los nombres que ya usaba el ensayo
 * (`huespedNombre`, `idempotencyKey`…) y los traduce al contrato nuevo.
 *
 * La `solicitudId` es la clave de idempotencia, y de ella el motor deriva la
 * `referencia` recortando a 16 caracteres: se manda un identificador estable y
 * sin colisiones entre intentos distintos (`ensayo-be-…` y `ensayo-be-…-solape`
 * darían la MISMA referencia y el solape se leería como un reintento).
 */
async function reservarPublico({
  unitId,
  checkIn: desde,
  checkOut: hasta,
  huespedNombre,
  huespedEmail,
  huespedTelefono,
  notas,
  idempotencyKey,
  lang,
  extras,
  documento,
  adultos = 2,
}) {
  const solicitudId = `be-${createHash('sha1').update(String(idempotencyKey)).digest('hex').slice(0, 20)}`;
  const res = await peticion(`/api/public/booking/${SLUG_PUBLICO}/reservar`, {
    metodo: 'POST',
    cuerpo: {
      propertyId: PROP_ID,
      unitId,
      checkIn: aIso(desde),
      checkOut: aIso(hasta),
      adultos,
      ninos: 0,
      solicitudId,
      nombre: huespedNombre,
      email: huespedEmail,
      telefono: huespedTelefono,
      notas,
      lang,
      extras,
      documento,
    },
  });

  // El `id` de la reserva lo resuelve la referencia, que es lo que hace la
  // confirmación del huésped: es el que el ensayo necesita para consultarla luego
  // por la API interna. `duplicada` es el reintento del mismo formulario (el
  // motor devuelve la reserva que ya existía en vez de crear otra) y `paymentUrl`
  // es el nombre que el ensayo ya usaba para el enlace de pago.
  const referencia = res.json?.referencia || null;
  const reservaId = referencia
    ? (
        await prisma.hospitalityReservation.findFirst({
          where: { tenantId: TENANT_ID, channel: 'Directa', externalBookingId: referencia },
          select: { id: true },
        })
      )?.id || null
    : null;
  return {
    status: res.status,
    json: {
      ...res.json,
      reservationId: reservaId,
      duplicada: res.status === 200,
      paymentUrl: res.json?.pagoUrl ?? null,
    },
  };
}

const prisma = new PrismaClient();

// ─── Contexto y render de plantillas (§21) ──────────────────────────────────
// Réplicas EXACTAS de buildContextoPlantilla/renderPlantilla de
// lib/hospitality/comunicaciones.ts (TS no importable desde node puro). Los
// tests unitarios (hospitality-comunicaciones-i18n.test.ts) fijan que las
// reales se comportan así; aquí se usan para previsualizar el mensaje que la
// confirmación automática enviaría con los datos reales de la reserva.
function contextoReserva(reserva, unidad, propiedad, idioma) {
  const locale = idioma === 'en' ? 'en-US' : 'es-MX';
  const gd = reserva.guestData || {};
  const checkIn = reserva.checkIn ? new Date(reserva.checkIn) : null;
  const checkOut = reserva.checkOut ? new Date(reserva.checkOut) : null;
  const noches =
    checkIn && checkOut
      ? Math.max(0, Math.round((checkOut.getTime() - checkIn.getTime()) / 86_400_000))
      : 0;
  const fechaLarga = (f) => (f ? f.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' }) : '');
  return {
    nombre: gd.firstName || gd.nombre || gd.name || (idioma === 'en' ? 'Guest' : 'Huésped'),
    email: gd.email || '',
    telefono: gd.phone || gd.telefono || '',
    unidad: unidad?.nombre || '',
    propiedad: propiedad?.nombre || '',
    canal: reserva.channel || '',
    referencia: reserva.externalBookingId || reserva.id || '',
    checkIn: fechaLarga(checkIn),
    checkOut: fechaLarga(checkOut),
    noches: String(noches),
    importe:
      reserva.amountAfterTax != null
        ? new Intl.NumberFormat(locale, { style: 'currency', currency: reserva.currency || 'MXN' }).format(reserva.amountAfterTax)
        : '',
    estado: reserva.estado || '',
  };
}
function renderVariables(contenido, contexto) {
  return contenido.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (m, clave) =>
    clave in contexto && contexto[clave] !== undefined ? contexto[clave] : m
  );
}

// ─── Mock del Servicio de Hospedajes (solo local) ───────────────────────────
// Réplica mínima del contrato que el ensayo necesita ejercitar: recibe el sobre
// SOAP con HTTP Basic, descomprime la solicitud (ZIP + Base64, como exige el
// apartado 2) y responde como el servicio real —`0 - Ok` con número de lote en
// el alta, y el resultado del lote (código de comunicación) en la consulta—.
// Cada petición se guarda tal como llegó para poder comprobarla después.

/** XML de la solicitud: base64 → ZIP → contenido deflate de su único fichero. */
function desempaquetarSolicitudMIR(sobre) {
  const bloque = /<solicitud>([\s\S]*?)<\/solicitud>/.exec(sobre);
  if (!bloque) return { xml: '', error: 'el sobre no trae <solicitud>' };
  try {
    const zip = Buffer.from(bloque[1].trim(), 'base64');
    if (zip.readUInt32LE(0) !== 0x04034b50) {
      return { xml: '', error: 'la solicitud no es un contenedor ZIP' };
    }
    // Cabecera local del ZIP: 30 bytes fijos, luego el nombre y los extras.
    const inicio = 30 + zip.readUInt16LE(26) + zip.readUInt16LE(28);
    const comprimido = zip.subarray(inicio, inicio + zip.readUInt32LE(18));
    return { xml: inflateRawSync(comprimido).toString('utf8'), error: null };
  } catch (e) {
    return { xml: '', error: e instanceof Error ? e.message : String(e) };
  }
}

/** Respuesta del alta (apartado 3.1.2): el `0` solo confirma la recepción. */
function respuestaAltaMIR(lote) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:com="http://www.soap.servicios.hospedajes.mir.es/comunicacion">
  <soapenv:Body>
    <com:comunicacionResponse>
      <!-- mir-e2e-run:${MIR_RUN_ID} -->
      <respuesta><codigo>0</codigo><descripcion>Ok</descripcion><lote>${lote}</lote></respuesta>
    </com:comunicacionResponse>
  </soapenv:Body>
</soapenv:Envelope>`;
}

/**
 * Resultado de UN lote (Anexo II).
 *
 * El lote del documento marcado se resuelve CON ERRORES —el servicio devuelve
 * el `tipoError` y el texto del error, que trae la ruta del campo— y el resto
 * como «tramitado sin errores» con su código de comunicación.
 */
function bloqueResultadoMIR(lote) {
  if (lote === MIR_LOTE_RECHAZADO) {
    return `      <resultado>
        <lote>${lote}</lote>
        <tipoComunicacion>PV</tipoComunicacion>
        <tipoOperacion>A</tipoOperacion>
        <codigoEstado>6</codigoEstado>
        <descEstado>Lote tramitado con errores en algunas comunicaciones</descEstado>
        <resultadoComunicacion>
          <orden>1</orden>
          <tipoError>1</tipoError>
          <error>${MIR_ERROR_DE_LOTE}</error>
        </resultadoComunicacion>
      </resultado>`;
  }
  return `      <resultado>
        <lote>${lote}</lote>
        <tipoComunicacion>PV</tipoComunicacion>
        <tipoOperacion>A</tipoOperacion>
        <codigoEstado>1</codigoEstado>
        <descEstado>Lote tramitado sin errores</descEstado>
        <resultadoComunicacion>
          <orden>1</orden>
          <codigoComunicacion>${MIR_CODIGO_COMUNICACION}</codigoComunicacion>
        </resultadoComunicacion>
      </resultado>`;
}

/** Respuesta de la consulta de lotes (Anexo II): estado y código por lote. */
function respuestaConsultaMIR(lotes) {
  const bloques = lotes.map(bloqueResultadoMIR).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:com="http://www.soap.servicios.hospedajes.mir.es/comunicacion">
  <soapenv:Body>
    <com:comunicacionResponse>
      <!-- mir-e2e-run:${MIR_RUN_ID} -->
      <respuesta><codigo>0</codigo><descripcion>Ok</descripcion>
${bloques}
      </respuesta>
    </com:comunicacionResponse>
  </soapenv:Body>
</soapenv:Envelope>`;
}

/**
 * Levanta el mock en loopback y devuelve su registro de peticiones.
 * Solo escucha en 127.0.0.1: es el destino del ensayo, no un servicio.
 *
 * El puerto es un recurso COMPARTIDO: si otra corrida (o un `next dev`
 * huérfano de una corrida anterior) está escuchando ahí, el servidor de
 * desarrollo hablaría con el mock equivocado y el ensayo leería un registro
 * que no es el suyo. Por eso: (1) un puerto ocupado es un fallo explícito, no
 * un EADDRINUSE en crudo, y (2) tras escuchar, el mock se envía una sonda a sí
 * mismo y exige reconocerse en la respuesta.
 */
async function levantarMockMIR() {
  const peticiones = [];
  // Emails que el servidor mandó por el override del ensayo (aviso de partes).
  const emails = [];
  // Interruptor de caída: el ensayo lo sube para que el mock deje de responder
  // como el servicio y baje después. Es la diferencia que hay que poder probar:
  // «el servicio no contesta» no es «el servicio rechaza el parte».
  const servicio = { caido: false };
  const servidor = http.createServer((req, res) => {
    let cuerpo = '';
    req.setEncoding('utf8');
    req.on('data', (trozo) => {
      cuerpo += trozo;
    });
    req.on('end', () => {
      const esSonda = req.headers['x-e2e-sonda'] === '1';
      console.log(
        `  [mock] ${req.method} ${req.url} · ${cuerpo.length} bytes${esSonda ? ' · sonda del ensayo' : ''}`
      );

      // Ruta de email del ensayo: el aviso de partes sin reintentar llega aquí
      // en vez de a Resend/SMTP (ver EMAIL_E2E_ENDPOINT en ses-email.ts). Queda
      // registrada para que el ensayo pueda asertar que el hotel fue avisado.
      if (req.url === '/email') {
        try {
          const email = JSON.parse(cuerpo || '{}');
          emails.push({
            to: email.to,
            subject: email.subject || '',
            text: email.text || '',
            recibidoEn: new Date().toISOString(),
          });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true }));
        } catch {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: 'JSON inválido' }));
        }
        return;
      }
      const { xml, error } = desempaquetarSolicitudMIR(cuerpo);
      const operacion = (/<tipoOperacion>([^<]*)<\/tipoOperacion>/.exec(cuerpo) || [])[1] || '';
      const peticion = {
        url: req.url,
        autorizacion: req.headers.authorization || '',
        contentType: req.headers['content-type'] || '',
        operacion,
        sobre: cuerpo,
        xml,
        error,
        sonda: esSonda,
        lotesConsultados: [...xml.matchAll(/<(?:[\w.-]+:)?lote>([^<]*)<\/(?:[\w.-]+:)?lote>/g)].map((m) => m[1]),
      };
      peticiones.push(peticion);

      // Con el servicio «caído» no se responde SOAP: 503 y un cuerpo que el
      // cliente no puede leer. La petición SÍ queda registrada (el ensayo
      // comprueba con ella que el barrido dejó de intentarlo).
      if (servicio.caido && !esSonda) {
        res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Service Unavailable');
        return;
      }

      const esAlta = operacion === 'A' || xml.includes('peticion');
      // El alta del documento marcado devuelve un lote que se resolverá con
      // ERRORES: así el ensayo recorre el rechazo entero sin salir del mock.
      const loteDelAlta = xml.includes(`<numeroDocumento>${MIR_DOCUMENTO_RECHAZADO}</numeroDocumento>`)
        ? MIR_LOTE_RECHAZADO
        : MIR_LOTE;
      const cuerpoRespuesta = esAlta
        ? respuestaAltaMIR(loteDelAlta)
        : respuestaConsultaMIR(peticion.lotesConsultados.length > 0 ? peticion.lotesConsultados : [MIR_LOTE]);

      res.writeHead(200, { 'Content-Type': 'text/xml; charset=utf-8' });
      res.end(cuerpoRespuesta);
    });
  });

  const cerrar = () => new Promise((listo) => servidor.close(() => listo()));

  await new Promise((resolve, reject) => {
    servidor.once('error', (err) =>
      reject(
        new Error(
          err.code === 'EADDRINUSE'
            ? `el puerto ${MIR_MOCK_PUERTO} del mock ya está ocupado: ciérralo antes de repetir el ensayo ` +
                '(el ensayo no puede distinguir su mock del de otra corrida).'
            : err.message
        )
      )
    );
    servidor.listen(MIR_MOCK_PUERTO, '127.0.0.1', resolve);
  });

  // Auto-prueba: en este puerto solo puede responder este mock.
  try {
    const sonda = await fetch(MIR_MOCK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/xml; charset=utf-8', 'x-e2e-sonda': '1' },
      body: '<sonda-del-ensayo/>',
    });
    const texto = await sonda.text();
    if (!texto.includes(`mir-e2e-run:${MIR_RUN_ID}`)) {
      throw new Error(
        `el puerto ${MIR_MOCK_PUERTO} responde pero NO es de este ensayo: hay otro mock (u otra ` +
          'corrida del ensayo) escuchando ahí. Líbralo antes de repetir.'
      );
    }
    if (peticiones.filter((p) => p.sonda).length !== 1) {
      throw new Error('el mock no registró su propia sonda: su registro de peticiones no es fiable.');
    }
  } catch (err) {
    await cerrar();
    throw err;
  }
  // La sonda ya cumplió: no cuenta como petición del ensayo.
  for (let i = peticiones.length - 1; i >= 0; i -= 1) {
    if (peticiones[i].sonda) peticiones.splice(i, 1);
  }

  return { servidor, peticiones, emails, cerrar, servicio };
}

// ─── Configuración del arrendador (registro de viajeros) ────────────────────
// El ensayo configura el registro de viajeros como lo haría el hotel, pero con
// credenciales de ensayo. Al terminar se retira; y si el tenant YA tenía una
// configuración real, se restaura tal cual estaba (el ensayo no puede dejar
// apuntando a unas credenciales de mentira a quien ya comunicaba de verdad).
let MIR_CONFIG_PREVIA = null;

async function retirarConfigMIR(tenantId) {
  const actual = await prisma.hospitalityMirConfig.findUnique({ where: { tenantId } });
  // Si la configuración no es la del ensayo, no se toca.
  if (actual?.codigoArrendador !== MIR_CODIGO_ARRENDADOR) return false;

  await prisma.hospitalityMirConfig.delete({ where: { tenantId } });
  if (MIR_CONFIG_PREVIA) {
    await prisma.hospitalityMirConfig.create({ data: MIR_CONFIG_PREVIA });
    MIR_CONFIG_PREVIA = null;
  }
  return true;
}

async function limpiar(tenantId) {
  const propiedades = await prisma.hospitalityProperty.findMany({
    where: { tenantId, codigo: CODIGO_PROPIEDAD },
    select: { id: true },
  });
  for (const p of propiedades) {
    // Las trazas del barrido de holds son AuditLog sin FK hacia la reserva: si no
    // se borran, quedarían contando en la métrica de «holds abandonados» de
    // Reportes después de que el ensayo eliminó la propiedad. Se limpian por la
    // reserva de la que hablan, antes del delete en cascada.
    const reservasDelEnsayo = await prisma.hospitalityReservation.findMany({
      where: { propertyId: p.id },
      select: { id: true },
    });
    if (reservasDelEnsayo.length > 0) {
      await prisma.auditLog.deleteMany({
        where: {
          entidadId: { in: reservasDelEnsayo.map((r) => r.id) },
          accion: {
            in: ['hospitality_hold_expirado', 'hospitality_hold_confirmado', 'hospitality_checkin_due'],
          },
        },
      });
      // Las trazas del registro de viajeros NO caen con la reserva (su FK es
      // SetNull): sin borrarlas, el ensayo dejaría partes del Ministerio en el
      // estado del tenant y en las métricas de la pantalla. Se borran por la
      // reserva de la que hablan, antes del delete en cascada de la propiedad.
      await prisma.hospitalityGuestRegistryCommunication.deleteMany({
        where: { reservationId: { in: reservasDelEnsayo.map((r) => r.id) } },
      });
    }
    // El delete de la propiedad arrastra unidades, tarifas, reservas, líneas y
    // pagos (todas las FK son onDelete: Cascade). Los logs de sync y el mapping
    // quedan con propertyId null, así que se limpian por separado.
    await prisma.hospitalitySyncLog.updateMany({ where: { propertyId: p.id }, data: { propertyId: null } });
    await prisma.connectivityMapping.updateMany({ where: { propertyId: p.id }, data: { propertyId: null } });
    await prisma.hospitalityProperty.delete({ where: { id: p.id } });
  }
  await prisma.contact.deleteMany({
    where: {
      tenantId,
      OR: [
        { email: { startsWith: EMAIL_PREFIJO } },
        { email: { startsWith: EMAIL_PREFIJO_HOLD } },
        { email: { startsWith: EMAIL_PREFIJO_MIR } },
        { email: { startsWith: EMAIL_PREFIJO_PREGUNTAS } },
      ],
    },
  });
  // Las preguntas del check-in cuelgan del TENANT: sin esta limpieza, cada
  // ejecución del ensayo dejaría una pregunta de más en el formulario real.
  // Se localizan por su texto (lo que distingue a la del ensayo de las
  // preguntas reales del hotel) y se borran por id: el campo `es` es Json en
  // el schema, y Prisma no acepta un filtro de igualdad directa sobre él.
  const preguntasDelEnsayo = await prisma.hospitalityCheckinPregunta.findMany({
    where: { tenantId },
    select: { id: true, es: true },
  });
  const idsPreguntasEnsayo = preguntasDelEnsayo
    .filter((p) => String(p?.es ?? '') === PREGUNTA_ES)
    .map((p) => p.id);
  if (idsPreguntasEnsayo.length > 0) {
    await prisma.hospitalityCheckinPregunta.deleteMany({ where: { id: { in: idsPreguntasEnsayo } } });
  }
  // La configuración del arrendador que creó el ensayo se retira, y si el
  // tenant ya tenía una de verdad se RESTAURA tal cual estaba: el ensayo no
  // puede dejarlo apuntando a unas credenciales de mentira.
  await retirarConfigMIR(tenantId);
  // Las plantillas de comunicación cuelgan del TENANT (no de la propiedad), así
  // que el cascade de la propiedad no las toca: sin esta limpieza quedarían
  // enviándose a huéspedes reales después del ensayo.
  await prisma.hospitalityCommunicationTemplate.deleteMany({
    where: {
      tenantId,
      contenido: {
        in: [COMMS_CONTENIDO_ES, COMMS_CONTENIDO_EN, PRELLEGADA_CONTENIDO_ES, PRELLEGADA_CONTENIDO_EN],
      },
    },
  });
  await prisma.apiKey.deleteMany({ where: { tenantId, nombre: NOMBRE_API_KEY } });
  return propiedades.length;
}

/**
 * Devuelve la configuración del Booking Engine a como estaba antes del ensayo.
 *
 * El ensayo publica su propiedad en la lista `propiedadesPublicadas` y desactiva
 * el cobro en línea: sin devolverla, la página real del tenant se quedaría con
 * una propiedad de ensayo entre las suyas (y sin poder cobrar). Si el tenant no
 * tenía configuración, la que creó el ensayo se retira.
 *
 * En una limpieza SUELTA (`--cleanup` de una corrida anterior con `--keep`) no se
 * sabe cómo era la configuración antes, así que solo se retiran de la lista los
 * ids de propiedades que ya no existen: nada más se toca.
 */
async function restaurarConfigBooking() {
  const tenantId =
    TENANT_ID ||
    (await prisma.user.findFirst({ where: { email: EMAIL_USUARIO }, select: { tenantId: true } }))
      ?.tenantId;
  if (!tenantId) return;

  const actual = await prisma.hospitalityBookingConfig.findUnique({ where: { tenantId } });
  if (!actual) return;

  if (CONFIG_BOOKING_PREVIA) {
    await prisma.hospitalityBookingConfig.update({
      where: { tenantId },
      data: {
        slug: CONFIG_BOOKING_PREVIA.slug,
        activo: CONFIG_BOOKING_PREVIA.activo,
        propiedadesPublicadas: CONFIG_BOOKING_PREVIA.propiedadesPublicadas,
        requierePagoOnline: CONFIG_BOOKING_PREVIA.requierePagoOnline,
      },
    });
    ok('Configuración del Booking Engine devuelta a como estaba', `/${CONFIG_BOOKING_PREVIA.slug}`);
    return;
  }

  if (CONFIG_CREADA_POR_ENSAYO) {
    await prisma.hospitalityBookingConfig.delete({ where: { tenantId } }).catch(() => null);
    ok('Configuración del Booking Engine creada por el ensayo retirada');
    return;
  }

  const vivas = await prisma.hospitalityProperty.findMany({
    where: { tenantId, id: { in: actual.propiedadesPublicadas } },
    select: { id: true },
  });
  const idsVivos = new Set(vivas.map((p) => p.id));
  const limpias = actual.propiedadesPublicadas.filter((id) => idsVivos.has(id));
  if (limpias.length !== actual.propiedadesPublicadas.length) {
    await prisma.hospitalityBookingConfig.update({
      where: { tenantId },
      data: { propiedadesPublicadas: limpias },
    });
    ok('Limpieza suelta: propiedades inexistentes retiradas de la página', `${limpias.length} publicada(s)`);
  }
}

async function crearApiKeyTemporal(tenantId, userId) {
  const clave = `vk_prod_${randomBytes(32).toString('hex')}`;
  const keyHash = createHash('sha256').update(clave).digest('hex');
  await prisma.apiKey.deleteMany({ where: { tenantId, nombre: NOMBRE_API_KEY } });
  await prisma.apiKey.create({
    data: {
      tenantId,
      userId,
      nombre: NOMBRE_API_KEY,
      descripcion: 'API key temporal del ensayo E2E del booking engine',
      keyHash,
      prefix: clave.slice(0, 16),
      scopes: [],
      activo: true,
      expiraEn: new Date(Date.now() + 60 * 60 * 1000),
    },
  });
  return clave;
}

// ─── Ensayo ─────────────────────────────────────────────────────────────────
async function ensayar() {
  console.log(titulo(`Ensayo E2E del booking engine — ${BASE}`));

  // 0. Servidor vivo y tenant/usuario del ensayo.
  console.log(titulo('0. Prerrequisitos'));
  // Sonda de vida: la API de gestión del Booking Engine existe y está montada
  // (sin API key responde 401). Una ruta pública a la que ya no se llega no
  // probaría nada: también daría 404 con el servidor apagado.
  const sonda = await peticion('/api/hospitality/booking');
  if (sonda.status !== 401) {
    throw new Error(
      `No hay servidor de desarrollo en ${BASE} (respuesta ${sonda.status}). ` +
        'Arráncalo con: npm run dev  ·  o usa scripts/run-e2e-booking-engine.sh'
    );
  }
  ok('Servidor de desarrollo respondiendo', BASE);

  const usuario = await prisma.user.findFirst({
    where: { email: EMAIL_USUARIO },
    select: { id: true, tenantId: true, tenant: { select: { id: true, nombre: true } } },
  });
  if (!usuario?.tenantId) {
    throw new Error(`No existe el usuario ${EMAIL_USUARIO} con tenant. Corre el seed de la base local.`);
  }
  const tenantId = usuario.tenantId;
  ok('Tenant del ensayo resuelto', `${usuario.tenant.nombre} (${tenantId.slice(0, 8)}…)`);

  info('Limpiando restos de ensayos anteriores…');
  await limpiar(tenantId);

  const apiKey = await crearApiKeyTemporal(tenantId, usuario.id);
  ok('API key temporal creada (se elimina al terminar)');

  // 1. Publicar la propiedad de prueba por las APIs reales.
  console.log(titulo('1. Publicar la propiedad de prueba'));

  const crearPropiedad = await peticion('/api/hospitality/properties', {
    metodo: 'POST',
    apiKey,
    cuerpo: {
      nombre: NOMBRE_PROPIEDAD,
      descripcion: 'Propiedad de ensayo del booking engine. Se elimina al terminar el ensayo.',
      codigo: CODIGO_PROPIEDAD,
      ciudad: 'San Cristóbal de las Casas',
      pais: 'México',
      estado: 'activa',
    },
  });
  // La API devuelve la propiedad creada directamente (sin envoltorio).
  const propiedadId = crearPropiedad.json?.id;
  if (!esperar(crearPropiedad.status === 201 && !!propiedadId, 'Propiedad creada', `HTTP ${crearPropiedad.status}`)) {
    throw new Error(`No se pudo crear la propiedad de ensayo (HTTP ${crearPropiedad.status})`);
  }
  if (crearPropiedad.json?.estado !== 'activa') {
    fallo('La propiedad nueva no está publicada todavía', `estado: ${crearPropiedad.json?.estado}`);
  } else {
    ok('La propiedad nace sin publicar', 'estado: activa');
  }

  const unidadesCreadas = [];
  for (const u of UNIDADES) {
    const res = await peticion('/api/hospitality/units', {
      metodo: 'POST',
      apiKey,
      cuerpo: {
        propertyId: propiedadId,
        nombre: u.nombre,
        codigo: u.codigo,
        tipo: 'apartamento',
        capacidad: u.capacidad,
        tarifaBase: u.tarifaBase,
        moneda: 'MXN',
      },
    });
    if (res.status === 201 && res.json?.unit?.id) {
      unidadesCreadas.push({ ...u, id: res.json.unit.id });
      ok(`Unidad creada: ${u.nombre}`, `código ${u.codigo}`);
    } else {
      fallo(`Unidad no creada: ${u.nombre}`, `HTTP ${res.status} ${JSON.stringify(res.json)}`);
    }
  }

  for (const u of unidadesCreadas) {
    const res = await peticion('/api/hospitality/rateplans', {
      metodo: 'POST',
      apiKey,
      cuerpo: {
        propertyId: propiedadId,
        unitId: u.id,
        nombre: 'Tarifa estándar',
        tarifa: u.tarifa,
        moneda: 'MXN',
        minNoches: u.minNoches,
        activo: true,
      },
    });
    if (res.status === 201) ok(`Tarifa publicada: ${u.nombre}`, `${u.tarifa} MXN/noche · min ${u.minNoches} noche(s)`);
    else fallo(`Tarifa no publicada: ${u.nombre}`, `HTTP ${res.status} ${JSON.stringify(res.json)}`);
  }

  const unidadA = unidadesCreadas.find((u) => u.codigo === CODIGO_UNIDAD_A);
  const unidadB = unidadesCreadas.find((u) => u.codigo === CODIGO_UNIDAD_B);
  if (!unidadA || !unidadB) {
    throw new Error('No se crearon las dos unidades del ensayo');
  }

  // La publicación: la lista `propiedadesPublicadas` de la configuración del
  // tenant, por la API real que usa el panel. Se guarda la configuración previa
  // para DEVOLVERLA al terminar: el ensayo no puede alterar la página real de
  // nadie (ni su lista de propiedades, ni su cobro, ni su dirección).
  const configPrevia = await prisma.hospitalityBookingConfig.findUnique({ where: { tenantId } });
  CONFIG_BOOKING_PREVIA = configPrevia
    ? {
        slug: configPrevia.slug,
        activo: configPrevia.activo,
        propiedadesPublicadas: [...configPrevia.propiedadesPublicadas],
        requierePagoOnline: configPrevia.requierePagoOnline,
      }
    : null;
  CONFIG_CREADA_POR_ENSAYO = !configPrevia;
  SLUG_PUBLICO = configPrevia?.slug || `ensayo-be-${tenantId.slice(-6).toLowerCase()}`;
  PROP_ID = propiedadId;
  TENANT_ID = tenantId;

  // Sin estar en la lista, la página pública no expone la propiedad (404 si la
  // página no existe todavía, 409 si el tenant la tiene desactivada).
  const antesDePublicar = await cotizarPublico({ checkIn, checkOut });
  esperar(
    antesDePublicar.status === 404 || antesDePublicar.status === 409,
    'Sin publicar, la página pública no expone la propiedad',
    `HTTP ${antesDePublicar.status} · ${antesDePublicar.json?.error || ''}`
  );

  const publicar = await peticion('/api/hospitality/booking', {
    metodo: 'PUT',
    apiKey,
    cuerpo: {
      slug: SLUG_PUBLICO,
      activo: true,
      // El ensayo no puede cobrar en línea (no hay cuenta conectada): su reserva
      // directa nace confirmada. Se devuelve el valor del tenant al terminar.
      requierePagoOnline: false,
      // SUMA su propiedad a las que ya estuvieran publicadas: el ensayo no
      // despublica la página del tenant mientras corre.
      propiedadesPublicadas: [
        ...new Set([...(configPrevia?.propiedadesPublicadas || []), propiedadId]),
      ],
    },
  });
  esperar(
    publicar.status === 200 && (publicar.json?.config?.propiedadesPublicadas || []).includes(propiedadId),
    'Propiedad publicada en `propiedadesPublicadas` (el único criterio)',
    `HTTP ${publicar.status} · /${publicar.json?.config?.slug || SLUG_PUBLICO}`
  );

  // 2. La API pública que consume la página /reservar/<slug>.
  console.log(titulo('2. Página pública: catálogo y cotización'));

  // Una sola llamada da catálogo, precio y disponibilidad: el motor cotiza con
  // el Availability Engine central y solo devuelve lo que SE PUEDE vender.
  const cotizacion = await cotizarPublico({ checkIn, checkOut });
  const lineas = cotizacion.json?.unidades || [];
  const lineaA = lineas.find((l) => l.unitId === unidadA.id);
  const lineaB = lineas.find((l) => l.unitId === unidadB.id);
  esperar(
    cotizacion.status === 200 && cotizacion.json?.noches === noches,
    `Cotización de ${noches} noches (${iso(checkIn)} → ${iso(checkOut)})`,
    `HTTP ${cotizacion.status}`
  );
  esperar(
    lineas.length === 2,
    'Catálogo público con las dos unidades',
    `${lineas.length} unidad(es)`
  );
  esperar(
    lineaA?.tarifaPorNoche === unidadA.tarifa,
    'El catálogo publica la tarifa del rate plan (no la tarifa base)',
    `catálogo ${lineaA?.tarifaPorNoche} vs tarifa base ${unidadA.tarifaBase}`
  );
  esperar(
    lineaA?.desglose?.total === unidadA.tarifa * noches,
    'Precio de la Suite Volcán = noches × tarifa',
    `${lineaA?.desglose?.total} MXN (${noches} × ${unidadA.tarifa})`
  );
  esperar(
    lineaB?.desglose?.total === unidadB.tarifa * noches,
    'Precio del Loft Bosque = noches × tarifa',
    `${lineaB?.desglose?.total} MXN (${noches} × ${unidadB.tarifa})`
  );
  // La ficha de la página muestra la tarifa por noche junto al total: sin este
  // campo la página pinta 0.00/noche.
  esperar(
    lineaA?.tarifaPorNoche === unidadA.tarifa && lineaB?.tarifaPorNoche === unidadB.tarifa,
    'La cotización expone la tarifa por noche de cada unidad',
    `${lineaA?.tarifaPorNoche} / ${lineaB?.tarifaPorNoche} MXN por noche`
  );

  // Restricción de venta del rate plan: la Suite exige 2 noches. Se pregunta por
  // ESA unidad: el motor nuevo responde «no vendible» con el motivo, y la
  // cotización general simplemente no la ofrece.
  const corta = await cotizarPublico({
    checkIn: checkInUnaNoche,
    checkOut: checkOutUnaNoche,
    unitId: unidadA.id,
  });
  esperar(
    corta.json?.ok === false && corta.json?.motivo === 'min_noches',
    'La estancia mínima del rate plan se respeta en la cotización',
    `motivo: ${corta.json?.motivo}`
  );
  const cortaGeneral = await cotizarPublico({ checkIn: checkInUnaNoche, checkOut: checkOutUnaNoche });
  const unidadesCorta = cortaGeneral.json?.unidades || [];
  esperar(
    !unidadesCorta.some((u) => u.unitId === unidadA.id) &&
      unidadesCorta.some((u) => u.unitId === unidadB.id),
    'Y no aparece entre las ofrecidas para una sola noche (el Loft sí)',
    `${unidadesCorta.length} unidad(es) ofrecida(s)`
  );

  const fechasInvertidas = await cotizarPublico({ checkIn: checkOut, checkOut: checkIn });
  esperar(
    fechasInvertidas.status === 400,
    'Fechas invertidas rechazadas con un error de petición',
    `HTTP ${fechasInvertidas.status}`
  );

  // 3. Reserva desde la API pública (lo que envía el formulario de la página).
  console.log(titulo('3. Reserva desde la página pública'));

  const cuerpoReserva = {
    unitId: unidadA.id,
    checkIn: iso(checkIn),
    checkOut: iso(checkOut),
    huespedNombre: 'Huésped de Ensayo',
    huespedEmail: EMAIL_HUESPED,
    huespedTelefono: '+52 555 010 2030',
    notas: 'Reserva creada por el ensayo E2E del booking engine.',
    idempotencyKey: CLAVE_IDEMPOTENCIA,
  };

  const reserva = await reservarPublico(cuerpoReserva);
  const reservaId = reserva.json?.reservationId;
  esperar(
    reserva.status === 201 && !!reservaId,
    'Reserva creada desde la página pública',
    `HTTP ${reserva.status} · ${reserva.json?.referencia || 'sin referencia'}`
  );
  esperar(
    reserva.json?.total === unidadA.tarifa * noches,
    'El total cobrado es el recalculado en el servidor',
    `${reserva.json?.total} MXN`
  );
  esperar(
    reserva.json?.paymentUrl === null,
    'Con el cobro en línea desactivado, la reserva se crea sin abrir ningún pago',
    `paymentUrl: ${JSON.stringify(reserva.json?.paymentUrl)}`
  );

  // Y la otra mitad del cobro: si el alojamiento EXIGE pago en línea y su cuenta
  // no está habilitada, la puerta pública se niega antes de escribir nada. Una
  // reserva pendiente que nadie puede pagar es peor que no aceptarla. Solo se
  // comprueba donde no hay cobro disponible (el caso del ensayo); con una cuenta
  // conectada el desenlace es otro y se omite.
  const cobroDelTenant = await peticion('/api/hospitality/booking', { apiKey });
  if (cobroDelTenant.json?.cobro?.disponible === false) {
    await peticion('/api/hospitality/booking', {
      metodo: 'PUT',
      apiKey,
      cuerpo: { slug: SLUG_PUBLICO, requierePagoOnline: true },
    });
    const sinCuenta = await reservarPublico({
      ...cuerpoReserva,
      unitId: unidadB.id,
      huespedEmail: `${EMAIL_PREFIJO}sin-cobro@ensayo.test`,
      idempotencyKey: `${CLAVE_IDEMPOTENCIA}-sin-cobro`,
    });
    esperar(
      sinCuenta.status === 503 && sinCuenta.json?.ok === false,
      'Con cobro exigido y sin cuenta habilitada, la reserva se rechaza antes de crearse',
      `HTTP ${sinCuenta.status} · ${sinCuenta.json?.error || ''}`
    );
    await peticion('/api/hospitality/booking', {
      metodo: 'PUT',
      apiKey,
      cuerpo: { slug: SLUG_PUBLICO, requierePagoOnline: false },
    });
  } else {
    info('Cobro en línea disponible en este entorno: se omite la comprobación del rechazo sin cuenta');
  }

  // Idempotencia: reintentar el MISMO intento no duplica la reserva.
  const reintento = await reservarPublico(cuerpoReserva);
  esperar(
    reintento.json?.duplicada === true && reintento.json?.reservationId === reservaId,
    'Reintentar el mismo intento no duplica la reserva',
    `misma reserva: ${reintento.json?.reservationId === reservaId}`
  );

  // Overbooking: el solape en la misma unidad se rechaza con 409.
  const solape = await reservarPublico({
    ...cuerpoReserva,
    huespedEmail: `${EMAIL_PREFIJO}solape@ensayo.test`,
    idempotencyKey: `${CLAVE_IDEMPOTENCIA}-solape`,
  });
  esperar(
    solape.status === 409,
    'La unidad ya ocupada rechaza el solape (overbooking)',
    `HTTP ${solape.status} · ${solape.json?.error || ''}`
  );

  // 4. La retención que caduca sola: un hold olvidado no bloquea la unidad para
  // siempre. NOTA: el barrido es global (así es el cron real), así que si la
  // base tuviera otros holds vencidos también los caducará.
  console.log(titulo('4. El hold que caduca solo'));

  // La ventana de retención se configura por propiedad, con la API real.
  const ventanaHold = await peticion(`/api/hospitality/properties/${propiedadId}`, {
    metodo: 'PATCH',
    apiKey,
    cuerpo: { holdHoras: HOLD_HORAS_PRUEBA },
  });
  esperar(
    ventanaHold.status === 200 && ventanaHold.json?.property?.holdHoras === HOLD_HORAS_PRUEBA,
    'La ventana de retención se configura por propiedad',
    `holdHoras: ${ventanaHold.json?.property?.holdHoras}`
  );

  const HOLD_BASE = { propertyId: propiedadId, canal: 'Directa', estado: 'pending' };
  const crearHold = (cuerpo) =>
    peticion('/api/hospitality/reservations', { metodo: 'POST', apiKey, cuerpo });

  const hold = await crearHold({
    ...HOLD_BASE,
    unitId: unidadB.id,
    checkin: iso(holdCheckIn),
    checkout: iso(holdCheckOut),
    huespedNombre: 'Hold de Ensayo',
    huespedEmail: EMAIL_HOLD,
    importe: unidadB.tarifa,
  });
  const holdId = hold.json?.reservation?.id;
  esperar(
    hold.status === 201 && hold.json?.reservation?.estado === 'pending',
    'La retención nace pendiente (bloquea la unidad)',
    `HTTP ${hold.status} · estado ${hold.json?.reservation?.estado}`
  );

  // Mientras el hold vive, la página pública no la ofrece y no se puede vender.
  const cotizacionBloqueada = await cotizarPublico({
    checkIn: holdCheckIn,
    checkOut: holdCheckOut,
    unitId: unidadB.id,
  });
  esperar(
    cotizacionBloqueada.json?.ok === false && cotizacionBloqueada.json?.motivo === 'no_disponible',
    'Con el hold vivo, la página pública no ofrece la unidad',
    `motivo: ${cotizacionBloqueada.json?.motivo}`
  );

  const ventaBloqueada = await reservarPublico({
    unitId: unidadB.id,
    checkIn: holdCheckIn,
    checkOut: holdCheckOut,
    huespedNombre: 'Huésped Bloqueado',
    huespedEmail: EMAIL_HOLD_BLOQUEADO,
    idempotencyKey: `ensayo-hold-bloqueado-${iso(holdCheckIn)}`,
  });
  esperar(
    ventaBloqueada.status === 409,
    'Reservar esas fechas con el hold vivo se rechaza (overbooking)',
    `HTTP ${ventaBloqueada.status} · ${ventaBloqueada.json?.error || ''}`
  );

  // Las dos contrapruebas: un hold con pagos y otro dentro de su ventana no
  // pueden caducar, o el ensayo estaría celebrando un barrido que se pasa de listo.
  const holdConPagos = await crearHold({
    ...HOLD_BASE,
    unitId: unidadB.id,
    checkin: iso(holdPagosCheckIn),
    checkout: iso(holdPagosCheckOut),
    huespedNombre: 'Hold con Pago',
    huespedEmail: EMAIL_HOLD_PAGOS,
    importe: unidadB.tarifa,
  });
  const holdConPagosId = holdConPagos.json?.reservation?.id;
  if (holdConPagosId) {
    // El pago se registra como lo haría Finanzas: es lo que marca la diferencia.
    await prisma.hospitalityPayment.create({
      data: {
        tenantId,
        reservationId: holdConPagosId,
        propertyId: propiedadId,
        unitId: unidadB.id,
        importe: unidadB.tarifa,
        moneda: 'MXN',
        metodo: 'transferencia',
        estado: 'pagado',
      },
    });
  }

  const holdEnVentana = await crearHold({
    ...HOLD_BASE,
    unitId: unidadA.id,
    checkin: iso(holdVivoCheckIn),
    checkout: iso(holdVivoCheckOut),
    huespedNombre: 'Hold en Ventana',
    huespedEmail: EMAIL_HOLD_VIVO,
    importe: unidadA.tarifa * 2,
  });
  const holdEnVentanaId = holdEnVentana.json?.reservation?.id;
  esperar(
    !!holdConPagosId && !!holdEnVentanaId,
    'Sembradas las dos contrapruebas (hold con pago y hold en ventana)'
  );

  // Envejecer los holds: un ensayo no puede esperar una hora. Se retrasa su
  // fecha de creación, que es exactamente como se ve un hold olvidado desde ayer.
  // El que tiene pagos también se envejece a propósito: solo así el barrido llega
  // a evaluarlo y la contraprueba demuestra que lo que lo salva es el pago, no que
  // se hubiera quedado fuera por joven. El de la ventana se deja recién creado.
  const fechaEnvejecida = new Date(Date.now() - HOLD_ENVEJECIDO_HORAS * 3600_000);
  await prisma.hospitalityReservation.update({
    where: { id: holdId },
    data: { fechaCreacion: fechaEnvejecida },
  });
  await prisma.hospitalityReservation.update({
    where: { id: holdConPagosId },
    data: { fechaCreacion: fechaEnvejecida },
  });
  info(
    `Holds envejecidos ${HOLD_ENVEJECIDO_HORAS} h (ventana de la propiedad: ${HOLD_HORAS_PRUEBA} h); ` +
      'el de la contraprueba de ventana se deja recién creado'
  );

  // El barrido: el mismo endpoint que dispara el cron cada hora.
  const cronHolds = () =>
    peticion('/api/cron/hospitality-holds-expirados', {
      cabeceras: process.env.CRON_SECRET
        ? { authorization: `Bearer ${process.env.CRON_SECRET}` }
        : undefined,
    });

  const barrido = await cronHolds();
  esperar(
    barrido.status === 200 && barrido.json?.ok === true && barrido.json?.caducados >= 1,
    'El barrido caduca el hold olvidado',
    `caducados: ${barrido.json?.caducados} · omitidos: ${barrido.json?.omitidos}`
  );

  const detalleHold = await peticion(`/api/hospitality/reservations/${holdId}`, { apiKey });
  esperar(
    detalleHold.json?.reservation?.estado === 'cancelled',
    'El hold queda cancelado (no ocupa ni factura)',
    `estado: ${detalleHold.json?.reservation?.estado}`
  );

  // La traza es la materia prima de la métrica de «holds abandonados» de Reportes.
  const trazaHold = await prisma.auditLog.findFirst({
    where: { entidadId: holdId, accion: 'hospitality_hold_expirado' },
    select: { descripcion: true },
  });
  esperar(
    !!trazaHold,
    'La caducidad deja traza de auditoría (de ahí sale la métrica)',
    trazaHold?.descripcion || 'sin traza'
  );

  const pagoTrasBarrido = await peticion(`/api/hospitality/reservations/${holdConPagosId}`, { apiKey });
  esperar(
    pagoTrasBarrido.json?.reservation?.estado === 'pending',
    'Un hold CON PAGOS no caduca (eso lo decide una persona)',
    `estado: ${pagoTrasBarrido.json?.reservation?.estado}`
  );

  const ventanaTrasBarrido = await peticion(`/api/hospitality/reservations/${holdEnVentanaId}`, { apiKey });
  esperar(
    ventanaTrasBarrido.json?.reservation?.estado === 'pending',
    'Un hold dentro de su ventana tampoco caduca',
    `estado: ${ventanaTrasBarrido.json?.reservation?.estado}`
  );

  const barridoRepetido = await cronHolds();
  esperar(
    barridoRepetido.json?.caducados === 0,
    'Repetir el barrido no caduca nada más (idempotente)',
    `caducados: ${barridoRepetido.json?.caducados}`
  );

  // Y lo que le importa al hotel: las noches liberadas VUELVEN a venderse.
  const cotizacionLiberada = await cotizarPublico({
    checkIn: holdCheckIn,
    checkOut: holdCheckOut,
    unitId: unidadB.id,
  });
  const lineaLiberada = (cotizacionLiberada.json?.unidades || []).find((l) => l.unitId === unidadB.id);
  esperar(
    lineaLiberada?.desglose?.total === unidadB.tarifa,
    'La página pública vuelve a ofrecer la unidad liberada',
    `${lineaLiberada?.desglose?.total} MXN (${unidadB.tarifa} × 1 noche)`
  );

  const reventa = await reservarPublico({
    unitId: unidadB.id,
    checkIn: holdCheckIn,
    checkOut: holdCheckOut,
    huespedNombre: 'Huésped de la Reventa',
    huespedEmail: EMAIL_HOLD_REVENTA,
    idempotencyKey: `ensayo-hold-reventa-${iso(holdCheckIn)}`,
  });
  esperar(
    reventa.status === 201 && !!reventa.json?.reservationId,
    'Y se vende de verdad: la reserva liberada entra por la página pública',
    `HTTP ${reventa.status} · ${reventa.json?.referencia || ''}`
  );

  // La propiedad se borra al terminar, pero el ensayo no debe dejar una
  // configuración rara si se corre con --keep.
  const restaurarVentana = await peticion(`/api/hospitality/properties/${propiedadId}`, {
    metodo: 'PATCH',
    apiKey,
    cuerpo: { holdHoras: 24 },
  });
  esperar(
    restaurarVentana.status === 200 && restaurarVentana.json?.property?.holdHoras === 24,
    'La ventana del ensayo se restaura a 24 h',
    `holdHoras: ${restaurarVentana.json?.property?.holdHoras}`
  );

  // 4b. El ciclo en inglés: la página pública sirve el motor en EN y el idioma
  // viaja con la reserva. Es lo que la comunicación automática de confirmación
  // (§21) lee para escribirle al huésped en inglés — y lo que el hotel revisa
  // al sembrar sus plantillas por idioma.
  console.log(titulo('4b. El ciclo en inglés (?lang=en)'));

  // Las plantillas se crean por la API real de comunicaciones, como lo haría la
  // sección Comunicaciones del hotel. Incluye la validación de idioma: un valor
  // fuera de ES/EN se rechaza con 400.
  const crearPlantillaComunicacion = async (idioma, asunto, contenido) =>
    peticion('/api/hospitality/comunicaciones', { metodo: 'POST', apiKey, cuerpo: { evento: 'confirmacion', canal: 'email', idioma, asunto, contenido } });

  const plantillaInvalida = await crearPlantillaComunicacion(COMMS_IDIOMA_INVALIDO, 'X', 'X');
  esperar(
    plantillaInvalida.status === 400,
    'La API de comunicaciones rechaza un idioma fuera de ES/EN',
    `HTTP ${plantillaInvalida.status} · ${plantillaInvalida.json?.error || ''}`
  );

  const plantillaEs = await crearPlantillaComunicacion('es', COMMS_ASUNTO_ES, COMMS_CONTENIDO_ES);
  esperar(
    plantillaEs.status === 201 && plantillaEs.json?.plantilla?.idioma === 'es',
    'Plantilla de confirmación en español creada por la API real',
    `HTTP ${plantillaEs.status}`
  );
  const plantillaEn = await crearPlantillaComunicacion('en', COMMS_ASUNTO_EN, COMMS_CONTENIDO_EN);
  esperar(
    plantillaEn.status === 201 && plantillaEn.json?.plantilla?.idioma === 'en',
    'Plantilla de confirmación en inglés creada por la API real',
    `HTTP ${plantillaEn.status}`
  );

  // El listado del tenant muestra las dos versiones (lo que ve la sección
  // Comunicaciones: por evento/canal/idioma).
  const listadoComunicaciones = await peticion('/api/hospitality/comunicaciones?evento=confirmacion&canal=email', { apiKey });
  const delEnsayo = (listadoComunicaciones.json?.plantillas || []).filter((t) =>
    [COMMS_CONTENIDO_ES, COMMS_CONTENIDO_EN].includes(t.contenido)
  );
  esperar(
    listadoComunicaciones.status === 200 && delEnsayo.length === 2 &&
      delEnsayo.some((t) => t.idioma === 'es') && delEnsayo.some((t) => t.idioma === 'en'),
    'El hotel ve las dos versiones de idioma en su listado de plantillas',
    `${delEnsayo.length} plantilla(s) del ensayo`
  );

  // Reserva desde la página pública EN (el mismo POST con lang que envía el
  // navegador cuando el huésped navega con ?lang=en) — unidad B, fechas propias
  // para no pisar la semana del bloque 3.
  const checkInEn = sumarDias(checkOutUnaNoche, 1);
  const checkOutEn = sumarDias(checkInEn, 1);
  const emailEn = `${EMAIL_PREFIJO}en@ensayo.test`;
  const reservaEn = await reservarPublico({
    unitId: unidadB.id,
    checkIn: checkInEn,
    checkOut: checkOutEn,
    huespedNombre: 'English Speaking Guest',
    huespedEmail: emailEn,
    idempotencyKey: `${CLAVE_IDEMPOTENCIA}-en`,
    lang: 'en',
  });
  const reservaEnId = reservaEn.json?.reservationId;
  esperar(
    reservaEn.status === 201 && !!reservaEnId,
    'Reserva creada desde la página en inglés (?lang=en)',
    `HTTP ${reservaEn.status} · ${reservaEn.json?.referencia || ''}`
  );

  // El idioma viaja en guestData: es lo único que las comunicaciones automáticas
  // necesitan para escribirle al huésped en su idioma.
  const detalleEn = await peticion(`/api/hospitality/reservations/${reservaEnId}`, { apiKey });
  esperar(
    detalleEn.json?.reservation?.guestData?.idioma === 'en',
    'El idioma viaja con la reserva (guestData.idioma = en)',
    `guestData.idioma: ${detalleEn.json?.reservation?.guestData?.idioma}`
  );

  // Y se renderiza de verdad: el mismo render que haría la confirmación
  // automática si el envío de email estuviera configurado en este entorno.
  const contextoEn = contextoReserva(detalleEn.json.reservation, unidadB, { nombre: NOMBRE_PROPIEDAD }, 'en');
  const mensajeEn = renderVariables(COMMS_CONTENIDO_EN, contextoEn);
  esperar(
    mensajeEn.includes('Hi English Speaking Guest'),
    'La plantilla EN se renderiza con el nombre del huésped',
    mensajeEn
  );
  esperar(
    mensajeEn.includes(contextoEn.checkIn) && contextoEn.checkIn.length > 0 &&
      !/,\s*\d+\s+de\s+[a-záéíóú]+/i.test(mensajeEn),
    'La fecha se interpola en formato en-US (no en el formato español)',
    contextoEn.checkIn
  );
  esperar(
    renderVariables(COMMS_ASUNTO_EN, contextoEn) === `Your booking at ${NOMBRE_PROPIEDAD}`,
    'El asunto EN se interpola con la propiedad',
    renderVariables(COMMS_ASUNTO_EN, contextoEn)
  );

  // Contraprueba: sin lang la reserva nace en español (defecto del motor).
  const reservaEs = await reservarPublico({
    unitId: unidadB.id,
    checkIn: sumarDias(checkOutEn, 1),
    checkOut: sumarDias(checkOutEn, 2),
    huespedNombre: 'Huésped en Español',
    huespedEmail: `${EMAIL_PREFIJO}es@ensayo.test`,
    idempotencyKey: `${CLAVE_IDEMPOTENCIA}-es`,
  });
  esperar(reservaEs.status === 201, 'Reserva de contraprueba en español creada', `HTTP ${reservaEs.status}`);
  const detalleEs = await peticion(`/api/hospitality/reservations/${reservaEs.json?.reservationId}`, { apiKey });
  esperar(
    detalleEs.json?.reservation?.guestData?.idioma === 'es',
    'Sin lang, el huésped nace en español (guestData.idioma = es)',
    `guestData.idioma: ${detalleEs.json?.reservation?.guestData?.idioma}`
  );
  const contextoEs = contextoReserva(detalleEs.json.reservation, unidadB, { nombre: NOMBRE_PROPIEDAD }, 'es');
  const mensajeEs = renderVariables(COMMS_CONTENIDO_ES, contextoEs);
  esperar(
    mensajeEs.includes('¡Hola Huésped en Español') && mensajeEs.includes(contextoEs.checkIn) &&
      /,\s*\d+\s+de\s+[a-záéíóú]+/i.test(mensajeEs),
    'La plantilla ES se renderiza en español con fecha en formato es-MX',
    contextoEs.checkIn
  );

  // 4c. El ciclo REAL del registro de viajeros (RD 933/2021): la reserva entra
  // sin los documentos del huésped (el canal no los manda), el barrido deja el
  // parte en `datos_incompletos` SIN llamar al Ministerio, el huésped completa
  // sus datos por su enlace de check-in, el parte sale y su lote se resuelve con
  // el código de comunicación. Todo contra el mock local del Servicio de
  // Hospedajes: ningún servicio del Ministerio se toca.
  console.log(titulo('4c. El ciclo del registro de viajeros (MIR)'));

  if (!process.env.E2E_MIR_ENDPOINT || process.env.E2E_MIR_ENDPOINT !== MIR_MOCK_URL) {
    info(
      'Bloque OMITIDO: el servidor de desarrollo no está apuntado al mock del Ministerio. ' +
        'Lánzalo con `npm run test:e2e:booking` (que arranca next dev con MIR_E2E_ENDPOINT): ' +
        'sin esa señal el ensayo no configura el arrendador, para no llamar al servicio real.'
    );
  } else {
    MIR_MOCK = await levantarMockMIR();
    ok('Mock del Servicio de Hospedajes escuchando en local (127.0.0.1)', MIR_MOCK_URL);

    // Si el tenant ya tenía configuración real del arrendador, se guarda para
    // devolverla tal cual al terminar (ver retirarConfigMIR).
    MIR_CONFIG_PREVIA = await prisma.hospitalityMirConfig.findUnique({ where: { tenantId } });

    const configurarMir = await peticion('/api/hospitality/registro-viajeros', {
      metodo: 'POST',
      apiKey,
      cuerpo: {
        accion: 'configurar',
        codigoArrendador: MIR_CODIGO_ARRENDADOR,
        aplicacion: MIR_APLICACION,
        entorno: 'pre',
        usuario: MIR_USUARIO,
        password: MIR_PASSWORD,
        tipoPagoDefecto: MIR_TIPO_PAGO,
        propiedades: [{ id: propiedadId, codigoEstablecimientoMIR: MIR_CODIGO_ESTABLECIMIENTO }],
      },
    });
    esperar(
      configurarMir.status === 200 && configurarMir.json?.ok === true,
      'El arrendador se configura por la API real del producto',
      `HTTP ${configurarMir.status}`
    );

    const estadoMir = await peticion('/api/hospitality/registro-viajeros', { apiKey });
    const configMir = estadoMir.json?.config || {};
    esperar(
      configMir.configurado === true && configMir.tieneCredenciales === true && configMir.listoParaEnviar === true,
      'El estado confirma que el tenant puede comunicar',
      `entorno: ${configMir.entorno} · tipo de pago: ${configMir.tipoPagoDefecto}`
    );
    esperar(
      !JSON.stringify(estadoMir.json || {}).includes(MIR_PASSWORD),
      'La API de estado NO devuelve la contraseña (solo si está puesta)'
    );
    esperar(
      (estadoMir.json?.propiedades || []).some(
        (p) => p.id === propiedadId && p.codigoEstablecimientoMIR === MIR_CODIGO_ESTABLECIMIENTO
      ),
      'La propiedad queda con su código de establecimiento del Ministerio'
    );
    esperar(
      estadoMir.json?.reservas?.habilitadas === false,
      'El estado dice la verdad sobre la reserva de hospedaje (RH): sigue pendiente del XSD oficial',
      String(estadoMir.json?.reservas?.motivo || '').slice(0, 60) + '…'
    );

    // La reserva del ciclo entra por la página pública como cualquier otra, y
    // sin documento: eso es exactamente lo que deja el parte incompleto. Se
    // elige una semana libre de la unidad B (después del hold con pagos, que
    // sigue vivo) para que la venta no choque con ningún otro bloque.
    const checkInMir = sumarDias(holdPagosCheckOut, 3);
    const checkOutMir = sumarDias(checkInMir, 1);
    const emailMir = `${EMAIL_PREFIJO_MIR}${iso(checkInMir)}@ensayo.test`;
    const reservaMir = await reservarPublico({
      unitId: unidadB.id,
      checkIn: checkInMir,
      checkOut: checkOutMir,
      huespedNombre: 'Ana Ruiz',
      huespedEmail: emailMir,
      huespedTelefono: '+34 666 666 666',
      idempotencyKey: `ensayo-mir-${iso(checkInMir)}`,
    });
    const reservaMirId = reservaMir.json?.reservationId;
    const referenciaMir = reservaMir.json?.referencia;
    esperar(
      reservaMir.status === 201 && !!reservaMirId,
      'La reserva del ciclo entra por la página pública (sin documentos del huésped)',
      `HTTP ${reservaMir.status} · ${referenciaMir || ''}`
    );
    const enlaceMir = String(reservaMir.json?.checkinUrl || '');
    esperar(
      enlaceMir.includes('/checkin/'),
      'Y nace con su enlace de check-in (la credencial del huésped)',
      enlaceMir
    );

    // El ensayo no puede esperar al día de la llegada (el registro comunica la
    // ENTRADA): se envejece la estancia, igual que se envejecen los holds.
    const entradaMir = new Date(hoy());
    entradaMir.setDate(entradaMir.getDate() - 1);
    entradaMir.setHours(15, 0, 0, 0);
    const salidaMir = new Date(hoy());
    salidaMir.setDate(salidaMir.getDate() + 1);
    salidaMir.setHours(11, 0, 0, 0);
    await prisma.hospitalityReservation.update({
      where: { id: reservaMirId },
      data: { checkIn: entradaMir, checkOut: salidaMir },
    });
    info(
      `Estancia envejecida a ${iso(entradaMir)}: la entrada ya ocurrió, que es lo que el registro comunica`
    );

    const cronRegistro = () =>
      peticion('/api/cron/hospitality-registro-viajeros', {
        cabeceras: process.env.CRON_SECRET
          ? { authorization: `Bearer ${process.env.CRON_SECRET}` }
          : undefined,
      });
    const peticionesDeLaReservaMir = () =>
      MIR_MOCK.peticiones.filter((p) => p.xml.includes(String(referenciaMir)));
    const trazaDeLaReservaMir = async () => {
      const estado = await peticion('/api/hospitality/registro-viajeros', { apiKey });
      return (estado.json?.ultimas || []).find((c) => c.reservationId === reservaMirId) || null;
    };

    // 1. El barrido del cron (el mecanismo real del plazo de 24 h) encuentra la
    // reserva, ve que faltan los documentos y NO llama al Ministerio.
    const barridoIncompleto = await cronRegistro();
    esperar(
      barridoIncompleto.status === 200 && barridoIncompleto.json?.ok === true,
      'El cron del registro de viajeros corre y deja su resultado',
      `HTTP ${barridoIncompleto.status}`
    );
    esperar(
      barridoIncompleto.json?.datosIncompletos >= 1,
      'El barrido detecta el parte sin documentos y NO lo envía',
      `datos_incompletos: ${barridoIncompleto.json?.datosIncompletos}`
    );
    esperar(
      peticionesDeLaReservaMir().length === 0,
      'Sin los datos del huésped no sale ni una petición al Ministerio',
      `${MIR_MOCK.peticiones.length} petición(es) en total`
    );

    // La pantalla de reservas tiene que avisar de esto SIN esperar al barrido:
    // es donde el hotel ve que le falta el parte y puede pedir los documentos.
    // Se pregunta a la API real, buscando por la referencia, igual que la pantalla.
    const parteEnLaLista = async (reservaId, referencia) => {
      const lista = await peticion(
        `/api/hospitality/reservations?q=${encodeURIComponent(String(referencia))}`,
        { apiKey }
      );
      return (lista.json?.reservations || []).find((r) => r.id === reservaId)?.parteViajeros || null;
    };
    const parteIncompleto = await parteEnLaLista(reservaMirId, referenciaMir);
    esperar(
      parteIncompleto?.aplica === true && parteIncompleto?.completo === false,
      'La lista de reservas marca el parte al que le faltan los datos del huésped',
      `parte: ${JSON.stringify(parteIncompleto)}`
    );
    esperar(
      parteIncompleto?.viajeros === 0,
      'Y distingue «no hay documentación» (cero fichas) de «hay campos por revisar»',
      `viajeros: ${parteIncompleto?.viajeros} · faltan: ${JSON.stringify(parteIncompleto?.faltan || [])}`
    );

    const trazaIncompleta = await trazaDeLaReservaMir();
    esperar(
      trazaIncompleta?.estado === 'datos_incompletos',
      'La comunicación queda en datos_incompletos con su traza',
      `estado: ${trazaIncompleta?.estado}`
    );
    const faltantes = (trazaIncompleta?.errores || []).map((e) => e.campo);
    esperar(
      faltantes.some((c) => c.endsWith('.tipoDocumento')) &&
        faltantes.some((c) => c.endsWith('.fechaNacimiento')) &&
        faltantes.some((c) => c.includes('.direccion')),
      'La traza dice EXACTAMENTE qué falta (documento, nacimiento y dirección)',
      faltantes.slice(0, 3).join(', ')
    );

    // 2. El huésped completa sus datos por el enlace que recibió: la vía que
    // evita que nadie del hotel persiga documentos.
    const tokenMir = enlaceMir.split('/checkin/')[1]?.split('?')[0] || '';
    const checkinPrevio = await peticion(`/api/public/checkin/${tokenMir}`);
    esperar(
      checkinPrevio.status === 200 && checkinPrevio.json?.documentacion?.completa === false,
      'El enlace del huésped abre el formulario y le dice qué falta',
      `faltan: ${(checkinPrevio.json?.documentacion?.faltan || []).join(', ')}`
    );

    const guardadoCheckin = await peticion(`/api/public/checkin/${tokenMir}`, {
      metodo: 'POST',
      cuerpo: {
        viajeros: [{ ...MIR_VIAJERO, correo: emailMir }],
        heredarDireccion: true,
      },
    });
    esperar(
      guardadoCheckin.status === 200 && guardadoCheckin.json?.documentacion?.completa === true,
      'El huésped completa los datos de su grupo y la documentación queda completa',
      `faltan: ${JSON.stringify(guardadoCheckin.json?.documentacion?.faltan || [])}`
    );
    esperar(
      guardadoCheckin.json?.envio?.enviado === true && guardadoCheckin.json?.envio?.estado === 'enviada',
      'El parte sale en ese momento (la estancia ya empezó) sin que el hotel lo pulse',
      `estado: ${guardadoCheckin.json?.envio?.estado}`
    );

    // 3. La petición que llegó al servicio: es el mismo contrato que sale en
    // producción (Basic auth del apartado 2.2, sobre SOAP, ZIP+Base64).
    const pedidas = peticionesDeLaReservaMir();
    esperar(pedidas.length === 1, 'La petición llega al servicio una sola vez', `${pedidas.length} petición(es)`);
    const peticionAlta = pedidas[0];
    if (peticionAlta) {
      const credenciales = Buffer.from(peticionAlta.autorizacion.replace(/^Basic\s+/, ''), 'base64').toString('utf8');
      esperar(
        peticionAlta.autorizacion.startsWith('Basic ') && credenciales === `${MIR_USUARIO}:${MIR_PASSWORD}`,
        'Se autentica con HTTP Basic y las credenciales del arrendador',
        peticionAlta.autorizacion.slice(0, 18) + '…'
      );
      esperar(
        peticionAlta.operacion === 'A' && peticionAlta.sobre.includes('<tipoComunicacion>PV</tipoComunicacion>'),
        'La cabecera SOAP declara el alta del parte de viajeros (operación A, tipo PV)',
        `operación: ${peticionAlta.operacion}`
      );
      esperar(
        peticionAlta.error === null && peticionAlta.xml.length > 0,
        'La solicitud viaja comprimida en ZIP y en Base64 (el mock la descomprime)',
        peticionAlta.error || 'ZIP válido'
      );
      esperar(
        peticionAlta.xml.includes(`<codigoEstablecimiento>${MIR_CODIGO_ESTABLECIMIENTO}</codigoEstablecimiento>`),
        'El XML lleva el código de establecimiento del inmueble'
      );
      esperar(
        peticionAlta.xml.includes(`<numeroDocumento>${MIR_VIAJERO.numeroDocumento}</numeroDocumento>`) &&
          peticionAlta.xml.includes(`<fechaNacimiento>${MIR_VIAJERO.fechaNacimiento}</fechaNacimiento>`) &&
          peticionAlta.xml.includes(`<direccion>${MIR_VIAJERO.direccion.direccion}</direccion>`),
        'Y los datos que aportó el huésped (documento, nacimiento y dirección)'
      );
    }

    // 4. El lote: el `0 - Ok` solo dice que se recibió. La traza lo guarda y el
    // barrido lo consulta para saber el resultado real.
    const trazaEnviada = await trazaDeLaReservaMir();
    esperar(
      trazaEnviada?.estado === 'enviada' && trazaEnviada?.lote === MIR_LOTE,
      'La traza guarda el número de lote que devolvió el servicio',
      `lote: ${trazaEnviada?.lote} · código de retorno: ${trazaEnviada?.codigoRetorno}`
    );

    const consulta = await cronRegistro();
    esperar(
      consulta.json?.aceptadasAlConsultar >= 1,
      'El barrido consulta el lote y resuelve el resultado real',
      `aceptadas: ${consulta.json?.aceptadasAlConsultar}`
    );
    const trazaAceptada = await trazaDeLaReservaMir();
    esperar(
      trazaAceptada?.estado === 'aceptada' && trazaAceptada?.codigoComunicacion === MIR_CODIGO_COMUNICACION,
      'El parte queda ACEPTADO con su código de comunicación',
      `estado: ${trazaAceptada?.estado} · código: ${trazaAceptada?.codigoComunicacion}`
    );
    const parteAceptado = await parteEnLaLista(reservaMirId, referenciaMir);
    esperar(
      parteAceptado?.comunicada === true && parteAceptado?.completo === true && parteAceptado?.viajeros >= 1,
      'Con el parte aceptado la lista deja de avisar: ya hay documentación y nada que completar',
      `parte: ${JSON.stringify(parteAceptado)}`
    );

    const consultaRecibida = MIR_MOCK.peticiones.find((p) => p.operacion === 'C');
    esperar(
      (consultaRecibida?.lotesConsultados || []).includes(MIR_LOTE),
      'La consulta viaja con el lote exacto que devolvió el alta',
      `lotes: ${JSON.stringify(consultaRecibida?.lotesConsultados || [])} · ` +
        `peticiones: ${JSON.stringify(
          MIR_MOCK.peticiones.map((p) => `${p.operacion || '?'}:${p.error || 'ok'}:${p.xml.length}`)
        )}`
    );

    // 5. Reenviar estaría DUPLICANDO la comunicación del mismo huésped ante el
    // Ministerio: el barrido no lo hace (y por eso el ensayo lo comprueba).
    const barridoRepetidoMir = await cronRegistro();
    esperar(
      peticionesDeLaReservaMir().length === 1,
      'Un segundo barrido NO reenvía el parte: lo que está en vuelo se consulta, no se duplica',
      `${peticionesDeLaReservaMir().length} alta(s) de la reserva del registro`
    );
    esperar(
      barridoRepetidoMir.json?.aceptadasAlConsultar === 0,
      'Y no queda nada por resolver: el lote ya está aceptado',
      `aceptadas en el último barrido: ${barridoRepetidoMir.json?.aceptadasAlConsultar}`
    );

    // ── 4d. Un parte RECHAZADO por el Ministerio ──────────────────────────
    // Un rechazo no es «faltan datos»: los datos pueden estar completos y el
    // servicio rechazar un campo. Y no todos los rechazos son del huésped (los
    // de arrendador o usuario son de la configuración). Aquí se recorre el caso
    // que sí se arregla desde la pantalla: la reserva nace, el parte sale con un
    // documento que el Ministerio no acepta, el barrido resuelve el lote con
    // ERROR, y la pantalla de reservas enseña el motivo, el campo a corregir y
    // las acciones. Después, corregido el dato, el parte queda aceptado.
    const checkInRechazo = sumarDias(checkOutMir, 10);
    const checkOutRechazo = sumarDias(checkInRechazo, 1);
    const emailRechazo = `${EMAIL_PREFIJO_MIR}rechazo+${iso(checkInRechazo)}@ensayo.test`;
    const reservaRechazo = await reservarPublico({
      unitId: unidadB.id,
      checkIn: checkInRechazo,
      checkOut: checkOutRechazo,
      huespedNombre: 'Rechazo Del Valle',
      huespedEmail: emailRechazo,
      huespedTelefono: '+34 666 666 667',
      idempotencyKey: `ensayo-mir-rechazo-${iso(checkInRechazo)}`,
    });
    const reservaRechazoId = reservaRechazo.json?.reservationId;
    const referenciaRechazo = reservaRechazo.json?.referencia;
    esperar(
      reservaRechazo.status === 201 && !!reservaRechazoId,
      'Una segunda reserva entra por la página pública para el ciclo del rechazo',
      `HTTP ${reservaRechazo.status} · ${referenciaRechazo || ''}`
    );

    const entradaRechazo = new Date(hoy());
    entradaRechazo.setDate(entradaRechazo.getDate() - 1);
    entradaRechazo.setHours(15, 0, 0, 0);
    const salidaRechazo = new Date(hoy());
    salidaRechazo.setDate(salidaRechazo.getDate() + 1);
    salidaRechazo.setHours(11, 0, 0, 0);
    await prisma.hospitalityReservation.update({
      where: { id: reservaRechazoId },
      data: { checkIn: entradaRechazo, checkOut: salidaRechazo },
    });

    // El huésped rellena sus documentos con el documento que el Ministerio
    // rechazará. El producto lo da por bueno (es un NIF correcto) y lo comunica:
    // la verdad sobre el rechazo solo la tiene el servicio.
    const tokenRechazo = String(reservaRechazo.json?.checkinUrl || '')
      .split('/checkin/')[1]
      ?.split('?')[0] || '';
    const checkinRechazo = await peticion(`/api/public/checkin/${tokenRechazo}`, {
      metodo: 'POST',
      cuerpo: {
        viajeros: [
          { ...MIR_VIAJERO, numeroDocumento: MIR_DOCUMENTO_RECHAZADO, correo: emailRechazo },
        ],
        heredarDireccion: true,
      },
    });
    esperar(
      checkinRechazo.json?.envio?.estado === 'enviada',
      'El parte se envía con un documento que el validador del producto acepta',
      `estado: ${checkinRechazo.json?.envio?.estado}`
    );

    const barridoRechazo = await cronRegistro();
    esperar(
      barridoRechazo.json?.rechazadas >= 1,
      'El barrido consulta el lote y el servicio responde que trae ERRORES',
      `rechazadas: ${barridoRechazo.json?.rechazadas}`
    );
    // Rechazado NO es abandonado: todavía le quedan intentos y el barrido lo
    // volverá a intentar. El panel de estado no puede contarlos igual.
    esperar(
      barridoRechazo.json?.abandonados === 0,
      'Y el parte rechazado todavía NO cuenta como abandonado (le quedan intentos)',
      `abandonados: ${barridoRechazo.json?.abandonados}`
    );

    const parteRechazadoEnLista = await parteEnLaLista(reservaRechazoId, referenciaRechazo);
    esperar(
      parteRechazadoEnLista?.rechazado === true && parteRechazadoEnLista?.comunicada === false,
      'La lista de reservas marca el parte RECHAZADO (y no como «faltan datos»)',
      `parte: ${JSON.stringify(parteRechazadoEnLista)}`
    );
    esperar(
      parteRechazadoEnLista?.completo === true,
      'Y no dice que falten datos: los datos están completos, lo que falla es el parte',
      `completo: ${parteRechazadoEnLista?.completo} · faltan: ${JSON.stringify(parteRechazadoEnLista?.faltan || [])}`
    );
    esperar(
      String(parteRechazadoEnLista?.rechazo?.motivo || '').includes('no consta como válido'),
      'El aviso lleva el motivo del servicio, tal cual',
      `motivo: ${parteRechazadoEnLista?.rechazo?.motivo}`
    );
    esperar(
      parteRechazadoEnLista?.rechazo?.codigo === null,
      'Y no arrastra el `0` del alta como código del rechazo: el `0` no explica nada',
      `código: ${JSON.stringify(parteRechazadoEnLista?.rechazo?.codigo)}`
    );
    esperar(
      (parteRechazadoEnLista?.rechazo?.campos || []).includes('numeroDocumento') &&
        parteRechazadoEnLista?.rechazo?.ambito === 'datos',
      'Y sabe QUÉ corregir: el campo que nombra el error, con su ámbito',
      `campos: ${JSON.stringify(parteRechazadoEnLista?.rechazo?.campos || [])} · ` +
        `ámbito: ${parteRechazadoEnLista?.rechazo?.ambito}`
    );

    // El barrido reintenta un parte rechazado, pero SE RINDE: agotado el tope de
    // intentos no lo vuelve a intentar nadie. El ensayo no puede gastar horas de
    // backoff (1h, 2h, 4h…), así que pone la traza en ese estado —intentos
    // agotados Y con la espera del peldaño VENCIDA, que es el caso en el que el
    // barrido reintentaría si no fuera por el tope— y comprueba las dos
    // consecuencias reales: el barrido no manda nada más, y la pantalla lo dice.
    const fechaEnvejecidaRechazo = new Date(Date.now() - 2 * 3600_000);
    await prisma.hospitalityGuestRegistryCommunication.updateMany({
      where: { reservationId: reservaRechazoId, tipoComunicacion: 'PV', tipoOperacion: 'A' },
      data: { intentos: MIR_MAX_INTENTOS, fechaEdicion: fechaEnvejecidaRechazo },
    });
    // La premisa, comprobada: la espera del peldaño está VENCIDA (si no, el
    // barrido tampoco lo reintentaría y la comprobación siguiente no probaría
    // nada sobre el tope de intentos).
    const trazaEnvejecida = await prisma.hospitalityGuestRegistryCommunication.findFirst({
      where: { reservationId: reservaRechazoId, tipoComunicacion: 'PV', tipoOperacion: 'A' },
      select: { intentos: true, fechaEdicion: true },
    });
    const horasDeLaTraza = trazaEnvejecida?.fechaEdicion
      ? (Date.now() - new Date(trazaEnvejecida.fechaEdicion).getTime()) / 3600_000
      : 0;
    esperar(
      horasDeLaTraza > 1 && trazaEnvejecida?.intentos === MIR_MAX_INTENTOS,
      'La traza del rechazo queda con los intentos agotados y fuera de la espera del backoff',
      `${trazaEnvejecida?.intentos} intento(s) · editada hace ${horasDeLaTraza.toFixed(1)} h`
    );

    const abandonadoEnLista = await parteEnLaLista(reservaRechazoId, referenciaRechazo);
    esperar(
      abandonadoEnLista?.abandonado === true && abandonadoEnLista?.intentos >= MIR_MAX_INTENTOS,
      'La lista avisa de que el barrido ya NO va a reintentar ese parte',
      `intentos: ${abandonadoEnLista?.intentos} · abandonado: ${abandonadoEnLista?.abandonado}`
    );

    const altasDeLaReserva = () =>
      MIR_MOCK.peticiones.filter(
        (p) => p.operacion === 'A' && p.xml.includes(String(referenciaRechazo))
      ).length;
    const altasAntesDelAbandono = altasDeLaReserva();
    const barridoAbandono = await cronRegistro();
    esperar(
      altasDeLaReserva() === altasAntesDelAbandono,
      'Y el barrido no lo reintenta: con los intentos agotados no sale ninguna petición más',
      `${altasAntesDelAbandono} → ${altasDeLaReserva()} alta(s) de esa reserva`
    );
    // Y el dato sale de la pasada POR TENANT, que es lo que pinta el panel de
    // estado de crons: sin él habría que entrar reserva a reserva para saberlo.
    esperar(
      barridoAbandono.json?.abandonados >= 1,
      'La pasada cuenta los partes que ha dejado de reintentar',
      `abandonados: ${barridoAbandono.json?.abandonados}`
    );
    const abandonoDelTenant = (barridoAbandono.json?.abandonadosPorTenant || [])[0];
    esperar(
      abandonoDelTenant?.partes >= 1 && String(abandonoDelTenant?.nombre || '').length > 0,
      'Y lo publica por tenant, con su nombre, para el panel de estado de crons',
      `por tenant: ${JSON.stringify(barridoAbandono.json?.abandonadosPorTenant || [])}`
    );

    // El abandono no puede quedarse en el panel del operador de plataforma: el
    // hotel es quien tiene los documentos y las credenciales, así que su propia
    // pantalla del registro tiene que nombrarlo —con el motivo y qué
    // corregir— y Reportes contarlo. Si solo lo viera la plataforma, el hotel
    // sabría que tiene una estancia sin comunicar únicamente si alguien se lo
    // dijera por teléfono.
    const panelDelHotel = await peticion('/api/hospitality/registro-viajeros', { apiKey });
    esperar(
      panelDelHotel.json?.sinReintentar >= 1,
      'El panel del hotel cuenta sus partes sin reintentar',
      `sinReintentar: ${panelDelHotel.json?.sinReintentar}`
    );
    const abandonadoDelPanel = (panelDelHotel.json?.partesSinReintentar || []).find(
      (p) => p.referencia === referenciaRechazo
    );
    esperar(
      abandonadoDelPanel?.diagnostico?.ambito === 'datos' &&
        (abandonadoDelPanel?.diagnostico?.campos || []).includes('numeroDocumento'),
      'Y lo nombra con el motivo del Ministerio y qué corregir, no solo con un número',
      `parte: ${JSON.stringify(abandonadoDelPanel || null)}`
    );
    esperar(
      (panelDelHotel.json?.partes?.sinReintentar || 0) >= 1 &&
        (panelDelHotel.json?.partes?.cerradas || 0) >= 1,
      'Y publica la tasa del ciclo del parte: sin reintentar frente a cerrados',
      `partes: ${JSON.stringify(panelDelHotel.json?.partes || null)}`
    );

    const reportesDelHotel = await peticion('/api/hospitality/dashboard?dias=30', { apiKey });
    esperar(
      reportesDelHotel.json?.partes?.sinReintentar >= 1,
      'Y Reportes publica el mismo abandono para el hotel, no solo el panel de crons',
      `partes: ${JSON.stringify(reportesDelHotel.json?.partes || null)}`
    );

    // El operador corrige el dato desde la pantalla (mismo camino que el botón
    // «Corregir los datos»): el parte se reenvía en el momento, sin esperar al
    // barrido (que además espera una hora entre reintentos y, con los intentos
    // agotados, ya no lo intentaría nunca).
    const corregido = await peticion('/api/hospitality/registro-viajeros', {
      metodo: 'POST',
      apiKey,
      cuerpo: {
        accion: 'completar',
        reservaId: reservaRechazoId,
        viajeros: [
          {
            rol: 'VI',
            nombre: MIR_VIAJERO.nombre,
            apellido1: MIR_VIAJERO.apellido1,
            apellido2: MIR_VIAJERO.apellido2,
            tipoDocumento: MIR_VIAJERO.tipoDocumento,
            numeroDocumento: MIR_DOCUMENTO_CORRECTO,
            soporteDocumento: MIR_VIAJERO.soporteDocumento,
            fechaNacimiento: MIR_VIAJERO.fechaNacimiento,
            nacionalidad: MIR_VIAJERO.nacionalidad,
            sexo: MIR_VIAJERO.sexo,
            direccion: MIR_VIAJERO.direccion,
            telefono: MIR_VIAJERO.telefono,
            correo: emailRechazo,
          },
        ],
      },
    });
    esperar(
      corregido.json?.estado === 'enviada',
      'Corregido el dato, el parte se reenvía en el momento',
      `estado: ${corregido.json?.estado}${corregido.json?.errores?.length ? ` · errores: ${JSON.stringify(corregido.json.errores)}` : ''}`
    );

    await cronRegistro();
    const parteTrasCorregir = await parteEnLaLista(reservaRechazoId, referenciaRechazo);
    esperar(
      parteTrasCorregir?.comunicada === true &&
        parteTrasCorregir?.rechazado === false &&
        parteTrasCorregir?.rechazo === null,
      'Y con el dato corregido el parte queda aceptado: el aviso desaparece',
      `parte: ${JSON.stringify(parteTrasCorregir)}`
    );

    // Y el abandono desaparece del panel del hotel: el parte ya está comunicado,
    // así que dejar de contarlo es lo correcto, no un contador que se queda
    // pegado.
    const panelTrasCorregir = await peticion('/api/hospitality/registro-viajeros', { apiKey });
    esperar(
      panelTrasCorregir.json?.sinReintentar === 0 &&
        (panelTrasCorregir.json?.partesSinReintentar || []).length === 0,
      'Corregido el parte, el panel del hotel deja de contarlo como abandonado',
      `sinReintentar: ${panelTrasCorregir.json?.sinReintentar}`
    );
    const reportesTrasCorregir = await peticion('/api/hospitality/dashboard?dias=30', { apiKey });
    esperar(
      reportesTrasCorregir.json?.partes?.sinReintentar === 0 &&
        reportesTrasCorregir.json?.partes?.aceptadas >= 1,
      'Y Reportes también: ese parte pasa a contar como aceptado por el Ministerio',
      `partes: ${JSON.stringify(reportesTrasCorregir.json?.partes || null)}`
    );

    // ── 4e. Un parte que NO llegó al Ministerio (caída del servicio) ───────
    // Un rechazo es que el servicio LEYÓ el parte y no lo aceptó. Esto es otra
    // cosa: el servicio no responde y el parte no llega. Guardarlo como rechazo
    // hacía que el hotel leyera «el Ministerio rechazó este parte» con los datos
    // perfectos y fuera a corregir un formulario donde no había nada mal. El
    // ciclo: la entrega falla, el producto reintenta con su propio tope, se rinde
    // —y los datos del huésped NO tienen nada que ver— hasta que el servicio
    // vuelve y alguien reenvía.
    const checkInCaida = sumarDias(checkOutRechazo, 10);
    const checkOutCaida = sumarDias(checkInCaida, 1);
    const emailCaida = `${EMAIL_PREFIJO_MIR}caida+${iso(checkInCaida)}@ensayo.test`;
    const reservaCaida = await reservarPublico({
      unitId: unidadB.id,
      checkIn: checkInCaida,
      checkOut: checkOutCaida,
      huespedNombre: 'Caída Del Servicio',
      huespedEmail: emailCaida,
      huespedTelefono: '+34 666 666 668',
      idempotencyKey: `ensayo-mir-caida-${iso(checkInCaida)}`,
    });
    const reservaCaidaId = reservaCaida.json?.reservationId;
    const referenciaCaida = reservaCaida.json?.referencia;
    esperar(
      reservaCaida.status === 201 && !!reservaCaidaId,
      'Una tercera reserva entra por la página pública para el ciclo de la caída',
      `HTTP ${reservaCaida.status} · ${referenciaCaida || reservaCaida.json?.error || ''}`
    );

    const entradaCaida = new Date(hoy());
    entradaCaida.setDate(entradaCaida.getDate() - 1);
    entradaCaida.setHours(15, 0, 0, 0);
    const salidaCaida = new Date(hoy());
    salidaCaida.setDate(salidaCaida.getDate() + 1);
    salidaCaida.setHours(11, 0, 0, 0);
    if (reservaCaidaId) {
      await prisma.hospitalityReservation.update({
        where: { id: reservaCaidaId },
        data: { checkIn: entradaCaida, checkOut: salidaCaida },
      });
    }

    const tokenCaida = String(reservaCaida.json?.checkinUrl || '')
      .split('/checkin/')[1]
      ?.split('?')[0] || '';
    // El servicio se cae JUSTO antes de que el huésped envíe sus datos.
    MIR_MOCK.servicio.caido = true;
    const checkinCaida = await peticion(`/api/public/checkin/${tokenCaida}`, {
      metodo: 'POST',
      cuerpo: {
        viajeros: [
          { ...MIR_VIAJERO, numeroDocumento: MIR_DOCUMENTO_CAIDA, correo: emailCaida },
        ],
        heredarDireccion: true,
      },
    });
    esperar(
      checkinCaida.json?.envio?.estado === 'error',
      'Con el servicio caído el parte queda SIN ENTREGAR, no rechazado',
      `estado: ${checkinCaida.json?.envio?.estado}`
    );

    const trazaCaida = await prisma.hospitalityGuestRegistryCommunication.findFirst({
      where: { reservationId: reservaCaidaId, tipoComunicacion: 'PV', tipoOperacion: 'A' },
      select: { estado: true, intentos: true, descripcion: true, codigoRetorno: true },
    });
    esperar(
      trazaCaida?.estado === 'error' && trazaCaida?.intentos === 1,
      'La traza guarda la no-entrega con su intento (el parte no se pierde)',
      `estado: ${trazaCaida?.estado} · intentos: ${trazaCaida?.intentos}`
    );
    esperar(
      !trazaCaida?.codigoRetorno && String(trazaCaida?.descripcion || '').length > 0,
      'Y el motivo es lo que dijo el cliente (sin código del Ministerio: no hubo respuesta suya)',
      `código: ${JSON.stringify(trazaCaida?.codigoRetorno)} · motivo: ${trazaCaida?.descripcion}`
    );

    const parteSinEntregar = await parteEnLaLista(reservaCaidaId, referenciaCaida);
    esperar(
      parteSinEntregar?.sinEntregar === true &&
        parteSinEntregar?.rechazado === false &&
        parteSinEntregar?.completo === true,
      'La lista de reservas dice que el parte no llegó, NO que el Ministerio lo rechazara',
      `parte: ${JSON.stringify(parteSinEntregar)}`
    );
    esperar(
      parteSinEntregar?.fallo?.ambito === 'envio' &&
        (parteSinEntregar?.fallo?.campos || []).length === 0,
      'Y no acusa a ningún dato del huésped: es una incidencia de la entrega',
      `fallo: ${JSON.stringify(parteSinEntregar?.fallo || null)}`
    );

    // El hotel lo ve ANTES de que se agoten los intentos: es la señal temprana
    // de una caída, y verla es lo que evita enterarse cuando ya está abandonado.
    const panelConCaida = await peticion('/api/hospitality/registro-viajeros', { apiKey });
    esperar(
      panelConCaida.json?.partes?.sinEntregarEnCurso >= 1,
      'El panel del hotel ya lo cuenta como envío que no llegó, mientras se reintenta',
      `partes: ${JSON.stringify(panelConCaida.json?.partes || null)}`
    );

    // El servicio vuelve y los intentos se agotan (el ensayo no puede esperar
    // cinco horas): el barrido tiene que RENDIRSE igual, sin mandar nada más.
    MIR_MOCK.servicio.caido = false;
    const fechaEnvejecidaCaida = new Date(Date.now() - 2 * 3600_000);
    await prisma.hospitalityGuestRegistryCommunication.updateMany({
      where: { reservationId: reservaCaidaId, tipoComunicacion: 'PV', tipoOperacion: 'A' },
      data: { intentos: MIR_MAX_INTENTOS, fechaEdicion: fechaEnvejecidaCaida },
    });
    const altasDeLaCaida = () =>
      MIR_MOCK.peticiones.filter((p) => p.xml.includes(String(referenciaCaida))).length;
    const altasAntesDelTope = altasDeLaCaida();
    const barridoCaida = await cronRegistro();
    esperar(
      altasDeLaCaida() === altasAntesDelTope,
      'Agotados los intentos, el barrido deja de intentarlo aunque el servicio ya esté de vuelta',
      `${altasAntesDelTope} → ${altasDeLaCaida()} petición(es) de esa reserva`
    );
    const abandonoCaida = (barridoCaida.json?.abandonadosPorTenant || [])[0];
    esperar(
      abandonoCaida?.sinEntregar >= 1,
      'Y el panel de estado lo cuenta por su causa: falta de respuesta, no rechazo',
      `por tenant: ${JSON.stringify(barridoCaida.json?.abandonadosPorTenant || [])}`
    );

    // El aviso por email: la pantalla solo avisa a quien entra a mirar, así que
    // el barrido manda un correo al hotel con sus partes abandonados. El ensayo
    // lo captura en el mock (EMAIL_E2E_ENDPOINT): si llega aquí con la
    // referencia de la reserva y el motivo, el hotel se entera sin abrir la
    // plataforma.
    const emailAviso = MIR_MOCK.emails.filter((e) =>
      (e.subject || '').startsWith('Partes de viajeros sin comunicar')
    );
    esperar(
      emailAviso.length >= 1,
      'Y el hotel recibe el aviso por email, no solo en la pantalla',
      `${emailAviso.length} email(s) · asuntos: ${JSON.stringify(MIR_MOCK.emails.map((e) => e.subject))}`
    );
    esperar(
      emailAviso.some((e) => e.text.includes(String(referenciaCaida)) && e.text.includes('sin respuesta del servicio')),
      'El email nombra la reserva de la caída y su causa',
      `cuerpo: ${JSON.stringify(emailAviso[0]?.text?.slice(0, 220) || null)}`
    );

    const panelAbandonoCaida = await peticion('/api/hospitality/registro-viajeros', { apiKey });
    const filaCaida = (panelAbandonoCaida.json?.partesSinReintentar || []).find(
      (p) => p.referencia === referenciaCaida
    );
    esperar(
      filaCaida?.estado === 'error' &&
        filaCaida?.diagnostico?.desenlace === 'sin_entregar' &&
        filaCaida?.diagnostico?.ambito === 'envio',
      'El panel del hotel lo nombra como no-entrega, con su motivo',
      `parte: ${JSON.stringify(filaCaida || null)}`
    );
    const metricasCaida = panelAbandonoCaida.json?.partes || {};
    esperar(
      metricasCaida.sinReintentarSinEntregar >= 1 &&
        metricasCaida.sinReintentar ===
          metricasCaida.sinReintentarRechazados + metricasCaida.sinReintentarSinEntregar,
      'Y la métrica separa el abandono por caída del abandono por rechazo',
      `partes: ${JSON.stringify(metricasCaida)}`
    );

    // Con el servicio de vuelta, el hotel reenvía: el parte sale y el aviso cae.
    const reenvioCaida = await peticion('/api/hospitality/registro-viajeros', {
      metodo: 'POST',
      apiKey,
      cuerpo: { accion: 'enviar', reservaId: reservaCaidaId },
    });
    esperar(
      reenvioCaida.json?.estado === 'enviada',
      'Con el servicio de vuelta, el hotel reenvía el parte',
      `estado: ${reenvioCaida.json?.estado}${reenvioCaida.json?.descripcion ? ` · ${reenvioCaida.json.descripcion}` : ''}`
    );
    await cronRegistro();
    const parteCaidaTrasReenviar = await parteEnLaLista(reservaCaidaId, referenciaCaida);
    esperar(
      parteCaidaTrasReenviar?.comunicada === true &&
        parteCaidaTrasReenviar?.sinEntregar === false &&
        parteCaidaTrasReenviar?.abandonado === false,
      'Y queda aceptado: el aviso de no-entrega desaparece',
      `parte: ${JSON.stringify(parteCaidaTrasReenviar)}`
    );
  }

  // ── 4f. Las preguntas personalizadas del check-in ─────────────────────────
  // El Ministerio exige sus campos; el hotel, además, quiere saber lo suyo
  // (hora de llegada, matrícula, mascotas…). El ciclo completo: el hotel crea
  // la pregunta por la API real del producto, el huésped la responde en su
  // enlace de check-in y el operador la ve en la lista de reservas con el
  // TEXTO de la pregunta. Corre SIEMPRE (no necesita el mock del Ministerio):
  // el parte oficial ni se entera de que estas preguntas existen, y la estancia
  // del ciclo es futura, así que nada dispara una comunicación real.
  console.log(titulo('4f. Las preguntas personalizadas del check-in'));

  // 1. El hotel crea su pregunta por la API real de gestión: opción con
  // opciones en dos idiomas y obligatoria.
  const preguntaCreada = await peticion('/api/hospitality/registro-viajeros', {
    metodo: 'POST',
    apiKey,
    cuerpo: {
      accion: 'pregunta_crear',
      tipo: 'opcion',
      es: PREGUNTA_ES,
      en: PREGUNTA_EN,
      opcionesEs: ['Mañana (12:00 - 15:00)', 'Tarde (15:00 - 19:00)', 'Noche (después de 19:00)'],
      opcionesEn: ['Morning (12:00 - 15:00)', 'Afternoon (15:00 - 19:00)', 'Night (after 19:00)'],
      requerida: true,
      orden: 1,
    },
  });
  const preguntaId = preguntaCreada.json?.pregunta?.id;
  esperar(
    preguntaCreada.status === 200 && preguntaCreada.json?.ok === true && !!preguntaId,
    'El hotel crea su pregunta por la API real del producto',
    `HTTP ${preguntaCreada.status} · id: ${preguntaId || '—'}`
  );

  const estadoConPregunta = await peticion('/api/hospitality/registro-viajeros', { apiKey });
  const preguntaDelEstado = (estadoConPregunta.json?.preguntas || []).find((p) => p.id === preguntaId);
  esperar(
    preguntaDelEstado?.es === PREGUNTA_ES &&
      preguntaDelEstado?.en === PREGUNTA_EN &&
      preguntaDelEstado?.requerida === true &&
      Array.isArray(preguntaDelEstado?.opciones?.es) &&
      preguntaDelEstado.opciones.es.length === 3,
    'El panel del hotel la ve con sus dos idiomas, opciones y obligatoria',
    `pregunta: ${JSON.stringify(preguntaDelEstado || null)}`
  );

  // 2. La reserva del ciclo entra por la página pública (en inglés, que es
  // además la contraprueba del texto EN del formulario), con una semana libre
  // después de la última usada para no chocar con nada anterior.
  const checkInPreguntas = sumarDias(holdPagosCheckOut, 120);
  const checkOutPreguntas = sumarDias(checkInPreguntas, 1);
  const emailPreguntas = `${EMAIL_PREFIJO_PREGUNTAS}${iso(checkInPreguntas)}@ensayo.test`;
  const reservaPreguntas = await reservarPublico({
    unitId: unidadB.id,
    checkIn: checkInPreguntas,
    checkOut: checkOutPreguntas,
    huespedNombre: 'Preguntas Del Hotel',
    huespedEmail: emailPreguntas,
    huespedTelefono: '+34 666 666 669',
    idempotencyKey: `ensayo-preguntas-${iso(checkInPreguntas)}`,
    lang: 'en',
  });
  const reservaPreguntasId = reservaPreguntas.json?.reservationId;
  esperar(
    reservaPreguntas.status === 201 && !!reservaPreguntasId,
    'La reserva del ciclo entra por la página pública (en inglés)',
    `HTTP ${reservaPreguntas.status} · ${reservaPreguntas.json?.referencia || ''}`
  );

  const tokenPreguntas = String(reservaPreguntas.json?.checkinUrl || '')
    .split('/checkin/')[1]
    ?.split('?')[0] || '';
  const checkinPreguntasPrevio = await peticion(`/api/public/checkin/${tokenPreguntas}`);
  const preguntaDelFormulario = (checkinPreguntasPrevio.json?.preguntas || []).find(
    (p) => p.id === preguntaId
  );
  esperar(
    checkinPreguntasPrevio.status === 200 &&
      preguntaDelFormulario?.en === PREGUNTA_EN &&
      Array.isArray(preguntaDelFormulario?.opciones?.en) &&
      preguntaDelFormulario.opciones.en.length === 3,
    'El formulario del huésped la muestra en su idioma (la EN del enlace ?lang=en)',
    `pregunta: ${JSON.stringify(preguntaDelFormulario || null)}`
  );

  // 3. El huésped responde. En el mismo envío: una respuesta válida, otra con
  // texto que no es ninguna opción (la normalización la rechaza), y una clave
  // que no corresponde a ninguna pregunta (la guardia anti-inyección la
  // descarta: la reserva no puede guardar datos que nadie preguntó).
  const guardadoPreguntas = await peticion(`/api/public/checkin/${tokenPreguntas}`, {
    metodo: 'POST',
    cuerpo: {
      viajeros: [{ ...MIR_VIAJERO, correo: emailPreguntas }],
      heredarDireccion: true,
      respuestas: {
        [preguntaId]: 'Night (after 19:00)',
        inventada: 'esto no lo preguntó nadie',
      },
    },
  });
  esperar(
    guardadoPreguntas.status === 200 && guardadoPreguntas.json?.ok === true,
    'El huésped responde la pregunta en su envío de check-in',
    `HTTP ${guardadoPreguntas.status} · faltanPreguntas: ${JSON.stringify(guardadoPreguntas.json?.faltanPreguntas)}`
  );
  esperar(
    (guardadoPreguntas.json?.faltanPreguntas || []).length === 0,
    'La obligatoria respondida no deja nada pendiente',
    `faltanPreguntas: ${JSON.stringify(guardadoPreguntas.json?.faltanPreguntas)}`
  );
  esperar(
    guardadoPreguntas.json?.documentacion?.completa === true,
    'Y la documentación del huésped queda completa (el ciclo aislado no depende del mock)',
    `faltan: ${JSON.stringify(guardadoPreguntas.json?.documentacion?.faltan || [])}`
  );

  // El guardado ES la vía: la respuesta válida queda en la reserva con el
  // valor ya normalizado, la inválida se queda fuera y la inventada no entra.
  const reservaConRespuesta = await prisma.hospitalityReservation.findUnique({
    where: { id: reservaPreguntasId },
    select: { respuestasCheckin: true, estado: true, checkIn: true },
  });
  esperar(
    reservaConRespuesta?.respuestasCheckin?.[preguntaId] === 'Night (after 19:00)',
    'La respuesta válida queda guardada en la reserva, ya normalizada',
    `respuestasCheckin: ${JSON.stringify(reservaConRespuesta?.respuestasCheckin || null)}`
  );
  esperar(
    !reservaConRespuesta?.respuestasCheckin?.['inventada'],
    'La clave que nadie preguntó no se guarda (guardia anti-inyección)',
    `respuestas: ${JSON.stringify(reservaConRespuesta?.respuestasCheckin || null)}`
  );
  esperar(
    reservaConRespuesta?.checkIn && new Date(reservaConRespuesta.checkIn).getTime() > Date.now(),
    'La estancia del ciclo es futura: nada puede disparar un parte real',
    `checkIn: ${reservaConRespuesta?.checkIn}`
  );

  // Y volver al enlace muestra la respuesta ya guardada: el huésped que se
  // equivocó no tiene que volver a escribir todo.
  const checkinRelectura = await peticion(`/api/public/checkin/${tokenPreguntas}`);
  esperar(
    checkinRelectura.json?.respuestas?.[preguntaId] === 'Night (after 19:00)',
    'Volver al enlace muestra la respuesta guardada (no se reescribe desde cero)',
    `respuestas: ${JSON.stringify(checkinRelectura.json?.respuestas || null)}`
  );

  // 4. El operador la ve en la lista de reservas, etiquetada con el TEXTO de
  // la pregunta (la reserva guarda el id; el mapa viaja en la misma API).
  const listaConPreguntas = await peticion(
    `/api/hospitality/reservations?q=${encodeURIComponent(emailPreguntas)}`,
    { apiKey }
  );
  const filaConRespuesta = (listaConPreguntas.json?.reservations || []).find(
    (x) => x.id === reservaPreguntasId
  );
  esperar(
    filaConRespuesta?.respuestasCheckin?.[preguntaId] === 'Night (after 19:00)',
    'La lista de reservas trae las respuestas del huésped (por id)',
    `respuestasCheckin: ${JSON.stringify(filaConRespuesta?.respuestasCheckin || null)}`
  );
  esperar(
    listaConPreguntas.json?.preguntasCheckin?.[preguntaId] === PREGUNTA_ES,
    'Y la misma API trae el mapa id → texto de la pregunta para etiquetarlas',
    `preguntasCheckin: ${JSON.stringify(listaConPreguntas.json?.preguntasCheckin || null)}`
  );

  // 5. Contraprueba del parte: la reserva del ciclo NO tiene traza de
  // comunicación (estancia futura) y el XML jamás vería las respuestas — la
  // guardia unitaria fija que el módulo MIR no las lee; aquí se comprueba el
  // efecto: la lista no anuncia parte comunicado ni rechazado para esta fila.
  const partePreguntas = filaConRespuesta?.parteViajeros || null;
  esperar(
    partePreguntas?.aplica === true && partePreguntas?.comunicada === false && !partePreguntas?.rechazado,
    'El parte del ciclo sigue sin comunicar: las respuestas del hotel NO son asunto del Ministerio',
    `parte: ${JSON.stringify(partePreguntas)}`
  );

  // 6. Baja lógica: «eliminar» la pregunta la desactiva — desaparece del
  // formulario, pero las respuestas ya guardadas en reservas NO se pierden.
  const preguntaEliminada = await peticion('/api/hospitality/registro-viajeros', {
    metodo: 'POST',
    apiKey,
    cuerpo: { accion: 'pregunta_eliminar', id: preguntaId },
  });
  esperar(
    preguntaEliminada.json?.ok === true,
    'El hotel desactiva la pregunta (baja lógica, no borrado físico)',
    `HTTP ${preguntaEliminada.status}`
  );
  const formularioTrasBaja = await peticion(`/api/public/checkin/${tokenPreguntas}`);
  esperar(
    !(formularioTrasBaja.json?.preguntas || []).some((p) => p.id === preguntaId),
    'La pregunta desactivada ya no aparece en el formulario del huésped',
    `preguntas: ${(formularioTrasBaja.json?.preguntas || []).length}`
  );
  const respuestasTrasBaja = await prisma.hospitalityReservation.findUnique({
    where: { id: reservaPreguntasId },
    select: { respuestasCheckin: true },
  });
  esperar(
    respuestasTrasBaja?.respuestasCheckin?.[preguntaId] === 'Night (after 19:00)',
    'Y las respuestas ya guardadas en la reserva se conservan (no se pierden)',
    `respuestasCheckin: ${JSON.stringify(respuestasTrasBaja?.respuestasCheckin || null)}`
  );

  // 4g. La pre-llegada que recuerda las preguntas sin responder: una reserva
  // con check-in MAÑANA entra en la ventana real del cron de check-in (que
  // escanea lo que entra en (ahora, ahora+24h]: una fecha pura de mañana cae
  // dentro para cualquier hora de ejecución), y ese cron dispara la plantilla
  // pre_llegada activa del tenant. Con la pregunta obligatoria sin responder,
  // el recordatorio debe NOMBRARLA en el idioma del huésped y traer el enlace
  // del formulario. Y se comprueba sobre el email REAL que el servidor envía —
  // capturado por el mock local (ruta /email) —, no sobre una réplica del
  // render: lo que se vigila es el envío completo, cron incluido.
  console.log(titulo('4g. La pre-llegada que recuerda las preguntas sin responder'));

  // El mock que captura el email es el mismo que el del Ministerio (ruta
  // /email del levantarMockMIR): sin él, las plantillas de pre-llegada no se
  // configuran — igual que el bloque 4c no configura el arrendador — para no
  // mandar correos reales con las credenciales del entorno.
  const mockDeEmailListo =
    !!MIR_MOCK && (process.env.EMAIL_E2E_ENDPOINT || '').includes(String(MIR_MOCK_PUERTO));
  if (!mockDeEmailListo) {
    info(
      'Bloque OMITIDO: el email del ensayo no está apuntado al mock local. ' +
        'Lánzalo con `npm run test:e2e:booking` (que exporta EMAIL_E2E_ENDPOINT): ' +
        'sin esa señal este bloque no configura plantillas de pre-llegada.'
    );
  } else {
    // El hotel escribe SU recordatorio de pre-llegada con la variable, en los
    // dos idiomas, por la API real de comunicaciones (lo que el cron disparará).
    const crearPlantillaPre = (idioma, asunto, contenido) =>
      peticion('/api/hospitality/comunicaciones', {
        metodo: 'POST',
        apiKey,
        cuerpo: { evento: 'pre_llegada', canal: 'email', idioma, asunto, contenido },
      });
    const plantillaPreEs = await crearPlantillaPre('es', 'Tu llegada a {{propiedad}}', PRELLEGADA_CONTENIDO_ES);
    const plantillaPreEn = await crearPlantillaPre('en', 'Your arrival at {{propiedad}}', PRELLEGADA_CONTENIDO_EN);
    esperar(
      plantillaPreEs.status === 201 && plantillaPreEn.status === 201,
      'El hotel crea su plantilla de pre-llegada ES y EN con {{preguntas_pendientes}}',
      `HTTP ${plantillaPreEs.status}/${plantillaPreEn.status}`
    );

    // La pregunta obligatoria debe estar ACTIVA para entrar en el recordatorio
    // (solo activas y requeridas). La del bloque 4f quedó desactivada al final
    // de su ciclo (baja lógica): se reutiliza si sigue viva y se crea una nueva
    // si no — crearla a ciegas dejaría dos preguntas idénticas.
    const estadoPreguntasPre = await peticion('/api/hospitality/registro-viajeros', { apiKey });
    const preguntaViva = (estadoPreguntasPre.json?.preguntas || []).find(
      (p) => p.es === PREGUNTA_ES && p.activa !== false
    );
    let preguntaPreId = preguntaViva?.id || null;
    if (!preguntaPreId) {
      const creadaPre = await peticion('/api/hospitality/registro-viajeros', {
        metodo: 'POST',
        apiKey,
        cuerpo: {
          accion: 'pregunta_crear',
          tipo: 'opcion',
          es: PREGUNTA_ES,
          en: PREGUNTA_EN,
          opcionesEs: ['Mañana (12:00 - 15:00)', 'Tarde (15:00 - 19:00)', 'Noche (después de 19:00)'],
          opcionesEn: ['Morning (12:00 - 15:00)', 'Afternoon (15:00 - 19:00)', 'Night (after 19:00)'],
          requerida: true,
          orden: 2,
        },
      });
      preguntaPreId = creadaPre.json?.pregunta?.id || null;
    }
    esperar(
      !!preguntaPreId,
      'La pregunta obligatoria del hotel está activa (entra en el recordatorio)',
      `id: ${preguntaPreId || '—'}`
    );

    // Las dos reservas del ciclo. La ES entra real: unidad B (sin mínimo),
    // check-in MAÑANA — la ventana exacta del cron —, sin lang (defecto ES).
    const checkInPre = sumarDias(hoy(), 1);
    const checkOutPre = sumarDias(checkInPre, 1);
    const emailPre = `${EMAIL_PREFIJO_PREGUNTAS}prellegada@ensayo.test`;
    const emailPreEn = `${EMAIL_PREFIJO_PREGUNTAS}prellegada-en@ensayo.test`;
    const reservaPre = await reservarPublico({
      unitId: unidadB.id,
      checkIn: checkInPre,
      checkOut: checkOutPre,
      huespedNombre: 'Pre Llegada Ensayo',
      huespedEmail: emailPre,
      idempotencyKey: `ensayo-prellegada-${iso(checkInPre)}`,
    });
    const reservaPreId = reservaPre.json?.reservationId;
    esperar(
      reservaPre.status === 201 && !!reservaPreId,
      'La reserva del ciclo ES entra por la página pública (check-in mañana)',
      `HTTP ${reservaPre.status} · ${reservaPre.json?.referencia || ''}`
    );
    // La EN: la página pública no puede vender la unidad A a una noche (mínimo
    // de 2) ni solapar la reserva principal, así que nace REAL (?lang=en) en la
    // unidad B, en una fecha lejana, y se ADELANTA por semilla a la noche de
    // mañana sobre la unidad A — la única que queda libre — copiando los
    // instantes exactos de la reserva ES (la misma convención de fecha que
    // escribió el producto). Es la misma clase de manipulación con la que el
    // ensayo envejece holds: lo que se comprueba aquí es el idioma y el envío,
    // no la fecha, y el ?lang=en real es lo que deja el idioma en la reserva.
    const reservaPreEn = await reservarPublico({
      unitId: unidadB.id,
      checkIn: sumarDias(checkOutPre, 1),
      checkOut: sumarDias(checkOutPre, 2),
      huespedNombre: 'Pre Arrival Ensayo',
      huespedEmail: emailPreEn,
      idempotencyKey: 'ensayo-prellegada-EN',
      lang: 'en',
    });
    const reservaPreEnId = reservaPreEn.json?.reservationId;
    esperar(
      reservaPreEn.status === 201 && !!reservaPreEnId,
      'La reserva del ciclo EN entra por la página pública en inglés',
      `HTTP ${reservaPreEn.status} · ${reservaPreEn.json?.referencia || ''}`
    );

    // El idioma nace con la reserva: es lo único que las comunicaciones leen
    // para decidir en qué idioma le escriben al huésped.
    const detallePre = reservaPreId
      ? await peticion(`/api/hospitality/reservations/${reservaPreId}`, { apiKey })
      : null;
    esperar(
      detallePre?.json?.reservation?.guestData?.idioma === 'es',
      'El huésped ES nace en español (guestData.idioma = es)',
      `guestData.idioma: ${detallePre?.json?.reservation?.guestData?.idioma}`
    );
    const detallePreEn = reservaPreEnId
      ? await peticion(`/api/hospitality/reservations/${reservaPreEnId}`, { apiKey })
      : null;
    esperar(
      detallePreEn?.json?.reservation?.guestData?.idioma === 'en',
      'El huésped EN nace en inglés (guestData.idioma = en)',
      `guestData.idioma: ${detallePreEn?.json?.reservation?.guestData?.idioma}`
    );

    // El adelanto por semilla de la reserva EN: a la noche de mañana, sobre la
    // unidad A, con los MISMOS instantes que el producto escribió para la ES.
    if (reservaPreEnId && detallePre?.json?.reservation) {
      await prisma.hospitalityReservation.update({
        where: { id: reservaPreEnId },
        data: {
          unitId: unidadA.id,
          checkIn: new Date(detallePre.json.reservation.checkIn),
          checkOut: new Date(detallePre.json.reservation.checkOut),
        },
      });
    }

    // EL CRON REAL: el mismo endpoint que dispara el horario de producción.
    // Escanea TODAS las reservas en ventana (ámbito global); en la base del
    // ensayo solo las de este ciclo tienen check-in mañana. Idempotente por
    // AuditLog: la segunda llamada no reenvía.
    const cronPre = await peticion('/api/cron/hospitality-checkin-due');
    esperar(
      cronPre.status === 200 && cronPre.json?.ok === true && (cronPre.json?.preLlegadaEnviados || 0) >= 1,
      'El cron real de check-in dispara la pre-llegada (ventana de 24h)',
      `HTTP ${cronPre.status} · fired ${cronPre.json?.fired} · pre-llegadas ${cronPre.json?.preLlegadaEnviados}`
    );

    // El email ES: llega al huésped ES y NOMBRA la pregunta en español, con el
    // enlace del formulario y sin restos del otro idioma ni llaves sin render.
    const emailPreEs = MIR_MOCK.emails.find(
      (e) => e.to === emailPre && (e.subject || '').includes('Tu llegada a')
    );
    esperar(
      !!emailPreEs,
      'El email de pre-llegada ES llega al huésped que reservó en español',
      `emails: ${JSON.stringify(MIR_MOCK.emails.map((e) => ({ to: e.to, subject: e.subject })))}`
    );
    esperar(
      !!emailPreEs && (emailPreEs.text || '').includes(`Falta por responder: ${PREGUNTA_ES}`),
      'Y NOMBRA la pregunta obligatoria sin responder, en español',
      `text: ${JSON.stringify(emailPreEs?.text || null)}`
    );
    esperar(
      !!emailPreEs && (emailPreEs.text || '').includes('/checkin/'),
      'El recordatorio ES trae el enlace directo al formulario de check-in',
      `text: ${JSON.stringify((emailPreEs?.text || '').slice(0, 200))}`
    );
    esperar(
      !!emailPreEs &&
        !(emailPreEs.text || '').includes('{{') &&
        !(emailPreEs.text || '').includes('Still to answer') &&
        !(emailPreEs.text || '').includes(PREGUNTA_EN),
      'El email ES no lleva variables sin renderizar ni restos del texto EN',
      `text: ${JSON.stringify(emailPreEs?.text || null)}`
    );

    // El email EN: la contraprueba del idioma — otro huésped, misma pregunta,
    // texto EN con el nombre EN de la pregunta.
    const emailPreIngles = MIR_MOCK.emails.find(
      (e) => e.to === emailPreEn && (e.subject || '').includes('Your arrival at')
    );
    esperar(
      !!emailPreIngles,
      'El email de pre-llegada EN llega al huésped que reservó en inglés',
      `emails: ${JSON.stringify(MIR_MOCK.emails.map((e) => ({ to: e.to, subject: e.subject })))}`
    );
    esperar(
      !!emailPreIngles && (emailPreIngles.text || '').includes(`Still to answer: ${PREGUNTA_EN}`),
      'Y NOMBRA la misma pregunta, en inglés (el nombre EN del hotel)',
      `text: ${JSON.stringify(emailPreIngles?.text || null)}`
    );
    esperar(
      !!emailPreIngles &&
        (emailPreIngles.text || '').includes('/checkin/') &&
        !(emailPreIngles.text || '').includes('Falta por responder') &&
        !(emailPreIngles.text || '').includes(PREGUNTA_ES),
      'El email EN trae su enlace y no lleva restos del texto ES',
      `text: ${JSON.stringify(emailPreIngles?.text || null)}`
    );

    // Idempotencia del cron: repetir la llamada NO duplica el envío (guard
    // AuditLog de 24h) — el huésped no recibe el mismo recordatorio dos veces
    // porque el operador corrió el barrido dos veces.
    const emailsAntes = MIR_MOCK.emails.length;
    const cronPreOtraVez = await peticion('/api/cron/hospitality-checkin-due');
    esperar(
      cronPreOtraVez.status === 200 &&
        cronPreOtraVez.json?.ok === true &&
        (cronPreOtraVez.json?.preLlegadaEnviados || 0) === 0 &&
        MIR_MOCK.emails.length === emailsAntes,
      'Repetir el cron NO duplica el envío (idempotente por AuditLog)',
      `pre-llegadas 2ª pasada: ${cronPreOtraVez.json?.preLlegadaEnviados} · emails: ${emailsAntes} → ${MIR_MOCK.emails.length}`
    );
  }

  // 5. El planning: misma API y misma ventana que la página del planning.
  console.log(titulo('5. La reserva en el planning'));

  const inicioVentana = inicioSemanaPlanning(hoy());
  // +30 días: la ventana debe cubrir también las reservas EN/ES del bloque 4b,
  // que viven semanas después de la principal.
  const finVentana = sumarDias(inicioVentana, 30);
  const planning = await peticion(
    `/api/hospitality/reservations?propertyId=${propiedadId}` +
      `&from=${iso(inicioVentana)}&to=${iso(finVentana)}`,
    { apiKey }
  );
  const enPlanning = (planning.json?.reservations || []).filter((r) => r.id === reservaId);
  esperar(
    planning.status === 200 && enPlanning.length === 1,
    'La reserva aparece una sola vez en la ventana del planning',
    `ventana ${iso(inicioVentana)} → ${iso(finVentana)}`
  );

  const r = enPlanning[0];
  if (r) {
    esperar(r.channel === 'Directa', 'Entra con canal «Directa»', `canal: ${r.channel}`);
    esperar(r.estado === 'confirmed', 'Entra confirmada', `estado: ${r.estado}`);
    esperar(r.unitId === unidadA.id, 'Asignada a la unidad reservada', r.unit?.nombre || unidadA.nombre);
    const nochesPlanning = Math.round(
      (new Date(r.checkOut).getTime() - new Date(r.checkIn).getTime()) / 86_400_000
    );
    esperar(nochesPlanning === noches, 'Con las fechas reservadas', `${nochesPlanning} noches`);
    esperar(
      r.amountAfterTax === unidadA.tarifa * noches,
      'Con el importe de la cotización', `${r.amountAfterTax} ${r.currency}`
    );
    esperar(
      (r.guestData?.email || r.contact?.email) === EMAIL_HUESPED,
      'Con el huésped del formulario', r.guestData?.email || r.contact?.email
    );
  }

  // El listado del tenant: TRES reservas de huéspedes del ensayo (la principal,
  // la EN y la ES de contraprueba) y ninguna más — la idempotencia no puede
  // haber dejado huérfanas. Los huéspedes de holds usan otro prefijo y no cuentan.
  const todas = await peticion(
    `/api/hospitality/reservations?propertyId=${propiedadId}&q=${encodeURIComponent(EMAIL_PREFIJO)}`,
    { apiKey }
  );
  esperar(
    (todas.json?.reservations || []).length === 3,
    'Tres reservas de huésped del ensayo (principal + EN + ES), sin duplicados',
    `${(todas.json?.reservations || []).length} reserva(s)`
  );
  const idsTodas = (todas.json?.reservations || []).map((x) => x.id);
  esperar(
    idsTodas.includes(reservaId) && idsTodas.includes(reservaEnId) && idsTodas.includes(reservaEs.json?.reservationId),
    'Las tres reservas (ES, EN y contraprueba) están en el listado'
  );

  console.log(titulo('6. URLs para revisarlo a mano'));
  info(`Página pública:  ${BASE}/reservar/${SLUG_PUBLICO}`);
  info(`Enlace antiguo:  ${BASE}/booking/${propiedadId}   (redirige 308 a la página única)`);
  info(`Planning:        ${BASE}/dashboard/hospitality/calendar   (propiedad «${NOMBRE_PROPIEDAD}»)`);
  info(`Reservas:        ${BASE}/dashboard/hospitality/reservas    (buscar «${EMAIL_HUESPED}»)`);
  info(
    `Reportes:        ${BASE}/dashboard/hospitality/reportes   (holds abandonados y partes sin reintentar)`
  );
  info(`Referencia:      ${reserva.json?.referencia}`);
  return { propiedadId, reservaId };
}

async function principal() {
  const usuario = await prisma.user.findFirst({
    where: { email: EMAIL_USUARIO },
    select: { tenantId: true },
  });

  if (MODO === 'cleanup') {
    if (!usuario?.tenantId) throw new Error(`No existe el usuario ${EMAIL_USUARIO} con tenant.`);
    console.log(titulo('Limpieza de los datos del ensayo'));
    const borradas = await limpiar(usuario.tenantId);
    ok('Datos del ensayo eliminados', `${borradas} propiedad(es)`);
    await restaurarConfigBooking();
    return;
  }

  let error = null;
  try {
    await ensayar();
  } catch (e) {
    error = e;
  }

  // Limpieza también si el ensayo se detuvo a medias: el ensayo no debe dejar
  // basura en la base local (salvo que se pida conservarla con --keep).
  if (usuario?.tenantId) {
    console.log(titulo('7. Limpieza'));
    if (KEEP) {
      info('Datos conservados (--keep). Para borrarlos: node scripts/e2e-booking-engine.mjs --cleanup');
    } else {
      const borradas = await limpiar(usuario.tenantId);
      ok('Datos del ensayo eliminados', `${borradas} propiedad(es), contacto y API key temporal`);
      await restaurarConfigBooking();
      info('Para conservar los datos en la próxima ejecución: --keep');
    }
  }

  console.log('');
  if (error) {
    fallos += 1;
    console.log(rojo(`El ensayo se detuvo: ${error instanceof Error ? error.message : error}`));
  }
  if (fallos === 0) {
    console.log(verde(`Ensayo completado: ${pasos} comprobaciones en verde, 0 fallos.`));
  } else {
    const total = pasos + (error ? 1 : 0);
    console.log(rojo(`Ensayo con fallos: ${total - fallos}/${total} en verde.`));
    for (const f of detalleFallos) console.log(rojo(`  · ${f}`));
    process.exitCode = 1;
  }
}

principal()
  .catch((error) => {
    console.error(rojo(`\nEl ensayo no pudo arrancar: ${error instanceof Error ? error.message : error}`));
    process.exitCode = 1;
  })
  .finally(async () => {
    // El mock del Ministerio es del ensayo: se apaga aunque el ensayo muriera a
    // medias, para no dejar un listener abierto en la máquina.
    if (MIR_MOCK) await MIR_MOCK.cerrar().catch(() => null);
    await prisma.$disconnect();
  });
