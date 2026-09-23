#!/usr/bin/env node
/**
 * Simulador LOCAL del servicio de Conectividad de Canales.
 *
 * Para qué sirve: el día de la homologación y del go-live dependemos de que el
 * proveedor conteste. Este simulador responde por él en local, con el MISMO
 * contrato que implementa el adapter del producto
 * (`lib/hospitality/connectivity.ts` y
 * `docs/hospitality-connectivity-contract.md`), para poder ensayar el día H
 * completo —credenciales, catálogo, push de inventario y tarifas, reserva
 * empujada por webhook— sin esperar a nadie y sin riesgo de tocar producción.
 *
 * Qué implementa (todo bajo el prefijo del contrato, `/api/v2/cm` por defecto):
 *   GET  {prefijo}/property_details/{hotelCode}?partnerId={pms}
 *        → el catálogo de la propiedad: habitaciones y planes de tarifa, que
 *          es lo que el hotel necesita para construir el mapping externo.
 *   POST {prefijo}/update/{partnerId}         → push de inventario y de
 *                                               restricciones (registra y responde).
 *   POST {prefijo}/update-rates/{partnerId}   → push de tarifas y restricciones.
 *   POST {prefijo}/data/{partnerId}           → `type: "reservation"`: las
 *                                               reservas que el proveedor dice
 *                                               tener (las que le empujamos).
 *
 * Autenticación: **HTTP Basic Auth en TODAS las rutas del contrato**, igual que
 * el proveedor real. Es la parte que más se rompe al copiar y pegar (un espacio
 * de más en la contraseña da 401), así que el simulador la exige en serio:
 * usuario o contraseña distintos → 401; partnerId desconocido → 403.
 *
 * Rutas de CONTROL (solo en loopback, NO forman parte del contrato). El
 * proveedor no las tiene: existen para que el ensayo pueda hacer de proveedor
 * (empujar una reserva) y después inspeccionar qué recibió de verdad el
 * simulador:
 *   GET  /_control/estado        → configuración y contadores
 *   GET  /_control/peticiones    → registro de lo recibido (sin contraseñas)
 *   POST /_control/reset         → limpia el registro
 *   POST /_control/empujar-reserva → envía el webhook `book|modify|cancel` al
 *                                    producto, con el Basic Auth del proveedor
 *
 * Uso:
 *   node scripts/simulador-conectividad.mjs                     # puerto libre
 *   node scripts/simulador-conectividad.mjs --port 4510 \
 *     --partner-id socio-1234 --usuario hotel.api --password Secreto1 \
 *     --hotel-code sandbox-pms
 *
 * Imprime `SIMULADOR_LISTO puerto=<n> url=<url>/api/v2/cm` para que un script
 * lo arranque, lea el puerto y apunte ahí `CONNECTIVITY_BASE_URL`. No guarda
 * nada en disco ni habla con ningún servicio externo.
 */
import http from 'node:http';

function arg(nombre, porDefecto) {
  const i = process.argv.indexOf(`--${nombre}`);
  return i >= 0 ? process.argv[i + 1] : porDefecto;
}

const PUERTO = Number(arg('port', '0'));
const PREFIJO = (arg('prefijo', '/api/v2/cm') || '/api/v2/cm').replace(/\/+$/, '');
const PARTNER_ID = arg('partner-id', 'partner-sandbox');
const USUARIO = arg('usuario', 'sandbox-user');
const PASSWORD = arg('password', 'sandbox-pass');
const HOTEL_CODE = arg('hotel-code', 'sandbox-pms');
const MONEDA = arg('moneda', 'EUR');
const SILENCIO = process.argv.includes('--silencio');

/** Catálogo que devuelve `property_details`: lo que el mapping necesita. */
const HABITACIONES = [
  {
    room_id: '101',
    room_name: 'Apartamento 101',
    description: 'Dos habitaciones, cocina y terraza',
    count: 1,
    active: true,
    type: 'apartamento',
    min_occ: 1,
    max_occ: 4,
    rateplans: [
      { rateplan_id: 'FLEX-101', rateplan_name: 'Flexible', occupancy: 2, no_of_meals: 0, extra_adult: 20 },
      { rateplan_id: 'NOREF-101', rateplan_name: 'No reembolsable', occupancy: 2, no_of_meals: 0, extra_adult: 20 },
    ],
  },
  {
    room_id: '102',
    room_name: 'Apartamento 102',
    description: 'Estudio con vistas',
    count: 1,
    active: true,
    type: 'apartamento',
    min_occ: 1,
    max_occ: 2,
    rateplans: [{ rateplan_id: 'FLEX-102', rateplan_name: 'Flexible', occupancy: 2, no_of_meals: 0, extra_adult: null }],
  },
];

/** Reservas que el proveedor "tiene" (lo que devuelve `/data/{pms}`). */
const reservas = [];
/** Registro de todo lo que ha recibido, para poder comprobarlo en el ensayo. */
const peticiones = [];

function registrar(entrada) {
  peticiones.push({ fecha: new Date().toISOString(), ...entrada });
  if (entrada.auth) delete entrada.auth.password;
}

function json(res, codigo, cuerpo) {
  const texto = JSON.stringify(cuerpo);
  res.writeHead(codigo, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(texto) });
  res.end(texto);
}

function leerCuerpo(req) {
  return new Promise((resolve) => {
    let datos = '';
    req.on('data', (trozo) => {
      datos += trozo;
      if (datos.length > 2_000_000) req.destroy();
    });
    req.on('end', () => {
      try {
        resolve(datos ? JSON.parse(datos) : null);
      } catch {
        resolve(undefined); // JSON inválido
      }
    });
  });
}

/** Basic Auth del contrato. Devuelve `{ ok, usuario, password }`. */
function basicAuth(req) {
  const cabecera = req.headers.authorization || '';
  if (!cabecera.startsWith('Basic ')) return { ok: false };
  const decodificado = Buffer.from(cabecera.slice(6), 'base64').toString('utf8');
  const corte = decodificado.indexOf(':');
  if (corte < 0) return { ok: false };
  const usuario = decodificado.slice(0, corte);
  const password = decodificado.slice(corte + 1);
  return { ok: usuario === USUARIO && password === PASSWORD, usuario, password };
}

function esLoopback(req) {
  const ip = req.socket.remoteAddress || '';
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
}

const servidor = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://localhost:${PUERTO}`);
  const ruta = url.pathname;

  // ── Control (solo local; NO es parte del contrato del proveedor) ──
  if (ruta.startsWith('/_control')) {
    if (!esLoopback(req)) return json(res, 403, { error: 'Solo loopback' });

    if (ruta === '/_control/estado') {
      return json(res, 200, {
        partnerId: PARTNER_ID,
        hotelCode: HOTEL_CODE,
        moneda: MONEDA,
        prefijo: PREFIJO,
        habitaciones: HABITACIONES.length,
        peticiones: peticiones.length,
        reservas: reservas.length,
        puntoDeConexion: `http://127.0.0.1:${PUERTO}`,
      });
    }
    if (ruta === '/_control/peticiones') {
      return json(res, 200, { peticiones });
    }
    if (ruta === '/_control/reset' && req.method === 'POST') {
      peticiones.length = 0;
      return json(res, 200, { ok: true });
    }
    if (ruta === '/_control/empujar-reserva' && req.method === 'POST') {
      const cuerpo = await leerCuerpo(req);
      if (!cuerpo || typeof cuerpo !== 'object' || !cuerpo.url) {
        return json(res, 400, { ok: false, error: 'Falta url' });
      }
      const { url: destino, basicAuth, ...payload } = cuerpo;
      // El proveedor llama al webhook del producto CON SU Basic Auth. Se puede
      // forzar otro usuario/contraseña solo para las contrapruebas (que el
      // producto rechace unas credenciales que no son las suyas).
      const usuario = basicAuth?.usuario ?? USUARIO;
      const password = basicAuth?.password ?? PASSWORD;
      const credenciales = Buffer.from(`${usuario}:${password}`).toString('base64');
      try {
        const respuesta = await fetch(destino, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Basic ${credenciales}`,
          },
          body: JSON.stringify(payload),
        });
        const texto = await respuesta.text();
        let cuerpoRespuesta = texto;
        try {
          cuerpoRespuesta = JSON.parse(texto);
        } catch {
          /* se devuelve el texto tal cual */
        }
        registrar({
          tipo: 'webhook_empujado',
          accion: payload.action,
          bookingId: payload.bookingId,
          httpStatus: respuesta.status,
        });
        if (payload.action === 'book' || payload.action === 'modify') {
          const indice = reservas.findIndex((r) => r.bookingId === payload.bookingId);
          if (indice >= 0) reservas[indice] = payload;
          else reservas.push(payload);
        }
        if (payload.action === 'cancel') {
          const indice = reservas.findIndex((r) => r.bookingId === payload.bookingId);
          if (indice >= 0) reservas.splice(indice, 1);
        }
        return json(res, 200, { ok: true, httpStatus: respuesta.status, respuesta: cuerpoRespuesta });
      } catch (error) {
        registrar({ tipo: 'webhook_empujado', accion: payload.action, error: String(error?.message || error) });
        return json(res, 502, { ok: false, error: `No se pudo entregar el webhook: ${error?.message || error}` });
      }
    }
    return json(res, 404, { error: 'Control desconocido' });
  }

  // ── Contrato del proveedor: SIEMPRE Basic Auth ──
  if (!ruta.startsWith(PREFIJO)) {
    return json(res, 404, { success: false, message: 'Not found' });
  }

  const auth = basicAuth(req);
  if (!auth.ok) {
    registrar({ metodo: req.method, ruta, authOk: false, httpStatus: 401 });
    return json(res, 401, { success: false, message: 'Invalid credentials' });
  }

  const resto = ruta.slice(PREFIJO.length); // p. ej. /property_details/sandbox-pms
  const partes = resto.split('/').filter(Boolean);
  const [recurso, codigo] = partes;

  if (recurso === 'property_details' && req.method === 'GET') {
    const hotelCode = decodeURIComponent(codigo || '');
    const partnerId = url.searchParams.get('partnerId');
    if (partnerId !== PARTNER_ID) {
      registrar({ metodo: 'GET', ruta, authOk: true, hotelCode, partnerId, httpStatus: 403 });
      return json(res, 403, { success: false, message: 'Unknown partner' });
    }
    if (hotelCode !== HOTEL_CODE) {
      registrar({ metodo: 'GET', ruta, authOk: true, hotelCode, httpStatus: 404 });
      return json(res, 404, { success: false, message: `Unknown hotel ${hotelCode}` });
    }
    registrar({ metodo: 'GET', ruta, authOk: true, hotelCode, httpStatus: 200 });
    return json(res, 200, {
      hotel_id: HOTEL_CODE,
      hotel_name: 'Hotel del ensayo (simulador)',
      property_category: 'apartamentos',
      currency: MONEDA,
      timezone: 'Europe/Madrid',
      tax_id: 'B00000000',
      address: { line: 'Calle del Ensayo 1', city: 'Madrid', state: 'Madrid', country_code: 'ES' },
      rooms: HABITACIONES,
    });
  }

  const cuerpo = req.method === 'POST' ? await leerCuerpo(req) : null;
  if (req.method === 'POST' && cuerpo === undefined) {
    return json(res, 400, { success: false, message: 'Invalid JSON' });
  }

  if ((recurso === 'update' || recurso === 'update-rates') && req.method === 'POST') {
    const partnerId = decodeURIComponent(codigo || '');
    if (partnerId !== PARTNER_ID) {
      registrar({ metodo: 'POST', ruta, authOk: true, partnerId, httpStatus: 403 });
      return json(res, 403, { success: false, message: 'Unknown partner' });
    }
    const actualizaciones = Array.isArray(cuerpo?.updates) ? cuerpo.updates.length : 0;
    const sinHotelCode = !cuerpo?.hotelCode;
    registrar({
      metodo: 'POST',
      ruta,
      authOk: true,
      partnerId,
      hotelCode: cuerpo?.hotelCode || null,
      actualizaciones,
      httpStatus: sinHotelCode ? 400 : 200,
      cuerpo,
    });
    if (sinHotelCode) {
      return json(res, 400, { success: false, message: 'hotelCode is required' });
    }
    return json(res, 200, {
      success: true,
      message: `${recurso === 'update' ? 'Inventory' : 'Rates'} updated for ${cuerpo.hotelCode} (${actualizaciones} rangos)`,
    });
  }

  if (recurso === 'data' && req.method === 'POST') {
    const partnerId = decodeURIComponent(codigo || '');
    if (partnerId !== PARTNER_ID) {
      registrar({ metodo: 'POST', ruta, authOk: true, partnerId, httpStatus: 403 });
      return json(res, 403, { success: false, message: 'Unknown partner' });
    }
    if (cuerpo?.type !== 'reservation') {
      registrar({ metodo: 'POST', ruta, authOk: true, partnerId, tipo: cuerpo?.type ?? null, httpStatus: 400 });
      return json(res, 400, { success: false, message: 'Unsupported data type' });
    }
    const desde = String(cuerpo.startDate || '');
    const hasta = String(cuerpo.endDate || '');
    const filtradas = reservas.filter((r) => {
      const llegada = String(r.checkin || '').slice(0, 10);
      return (!desde || llegada >= desde) && (!hasta || llegada <= hasta);
    });
    registrar({
      metodo: 'POST',
      ruta,
      authOk: true,
      partnerId,
      hotelCode: cuerpo.hotelCode,
      devueltas: filtradas.length,
      httpStatus: 200,
    });
    return json(res, 200, filtradas);
  }

  registrar({ metodo: req.method, ruta, authOk: true, httpStatus: 404 });
  return json(res, 404, { success: false, message: 'Not found' });
});

servidor.listen(PUERTO, '127.0.0.1', () => {
  const puerto = servidor.address().port;
  if (!SILENCIO) {
    console.log(`SIMULADOR_LISTO puerto=${puerto} url=http://127.0.0.1:${puerto}${PREFIJO}`);
    console.log(`  partner id : ${PARTNER_ID}`);
    console.log(`  hotel code : ${HOTEL_CODE}`);
    console.log(`  basic auth : ${USUARIO}:*** (se exige en todas las rutas del contrato)`);
    console.log('  (Ctrl+C para parar; no guarda nada y no habla con nadie fuera de loopback)');
  }
});

process.on('SIGTERM', () => servidor.close(() => process.exit(0)));
process.on('SIGINT', () => servidor.close(() => process.exit(0)));
