/**
 * Ensayo E2E del no-show y la disponibilidad (decisión de producto: el no-show
 * no bloquea la unidad — ver docs/hospitality-booking-payments-plan.md §0).
 *
 * Recorre el camino REAL, con HTTP de verdad, contra un servidor de desarrollo:
 *
 *   1. Levanta un **mock del proveedor de conectividad** en local y lo configura
 *      como destino real del adaptador (CONNECTIVITY_BASE_URL). Así el push que
 *      hace la app se captura tal cual sale, sin tocar ningún servicio externo.
 *   2. Publica una propiedad con dos unidades por las APIs de gestión y vincula
 *      las unidades con el catálogo del proveedor por el wizard REAL de onboarding
 *      (`POST /api/hospitality/onboarding/mapping`, que valida contra el mock).
 *   3. Crea una reserva en la unidad A → push `reserva_creada`: el canal ve la
 *      habitación a 0 disponibles.
 *   4. Marca la reserva como `no_show` por la API → push `reserva_modificada`:
 *      la unidad vuelve al inventario, **la disponibilidad empujada sube a 1** y
 *      la **penalización por no-show se emite sola** (la política por defecto es
 *      «primera noche»: la mitad de un importe de 2 noches).
 *   4b. Comprueba la penalización: la devuelve el PATCH, la previsualiza el GET,
 *      y repetir la emisión NO la duplica (idempotencia).
 *   4c. Factura el cargo **por el ERP real** (`/penalizacion/facturar`): primero
 *      falla sin receptor fiscal, luego crea el contacto del CRM, vincula al
 *      huésped (`guests/link`) y la factura sale con su `invoiceId` — y una
 *      segunda llamada NO emite otra factura.
 *   4d. Finanzas muestra la reserva con **bruto 0** (no es ingreso de
 *      alojamiento), `penalizacion` en su campo y `pendiente` = el cargo.
 *   4e. Se cobra la penalización con un pago manual (el mismo POST de
 *      Finanzas que usa la UI): la respuesta deriva el estado de cobro y la
 *      fila pasa a `pagado` con pendiente 0 — el circuito queda cerrado sin
 *      pasar por Stripe.
 *   5. Vuelve a reservar esas mismas fechas por la API pública del booking engine:
 *      antes chocaba con 409 (bloqueo fantasma), ahora entra — y su reserva
 *      vuelve a empujar la disponibilidad a 0 al canal.
 *   5b. Vía B: el mismo no-show reportado por el proveedor (`action: no_show`
 *       por el webhook, con Basic Auth) sobre una SEGUNDA reserva viva (la
 *       unidad B): misma penalización, mismo push de inventario, idempotente
 *       al repetir el evento y 404 para una reserva que no existe.
 *   5c. Salida anticipada (el apagador A/B del Anfitrión): el check-out de la
 *       re-reserva con la política B por defecto guarda `checkOutReal` y deja
 *       el `checkOut` previsto intacto — y el inventario liberado vuelve al
 *       canal (la disponibilidad empujada SUBE). Cambiar el apagador a A y
 *       hacer un check-out equivalente en la unidad B: el `checkOut` queda
 *       pisado al día del check-out, sin `checkOutReal`, y el canal recibe la
 *       misma subida — la diferencia entre A y B es qué pasa con lo PREVISTO,
 *       no con el inventario.
 *   5d. Vista Mes del planning: las noches liberadas dejan de pintarse. El
 *       ensayo reproduce la vista pura (`occupancyByDay`) con el MISMO payload
 *       que sirve el API de reservas a la página, y contrasta contra el
 *       comportamiento anterior (con el `checkOut` previsto) para probar que
 *       es el fin real lo que libera las noches.
 *   6. Limpia todo (propiedad, mappings, proveedor, facturas del ERP, logs y
 *      API key temporal).
 *
 * Uso:
 *   E2E_MOCK_PORT=4599 npx tsx --require ./scripts/cargar-entorno.cjs scripts/e2e-no-show.ts
 *   ... --keep       # conserva los datos para mirarlos en la UI
 *   ... --cleanup    # borra lo que dejó un --keep
 *
 * Lo normal es lanzarlo con `npm run test:e2e:noshow`, que arranca el servidor
 * de desarrollo con la variable CONNECTIVITY_BASE_URL apuntando al mock.
 */
import { createHash, randomBytes } from 'node:crypto';
import http from 'node:http';
import { PrismaClient } from '@prisma/client';
import { encrypt } from '../lib/core/crypto';
import {
  occupancyByDay,
  buildMonthGrid,
  type CalendarReservation,
} from '../lib/hospitality/calendar';

// ─── Configuración ──────────────────────────────────────────────────────────
const BASE = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/+$/, '');
const MOCK_PORT = Number(process.env.E2E_MOCK_PORT || 4599);
const EMAIL_USUARIO = process.env.E2E_TENANT_EMAIL || 'admin@volkern.com';

const MODO = process.argv.includes('--cleanup')
  ? 'cleanup'
  : process.argv.includes('--keep') || process.env.KEEP === '1'
    ? 'keep'
    : 'ensayo';
const KEEP = MODO === 'keep';

const CODIGO_PROPIEDAD = 'E2E-NS';
const HOTEL_CODE = 'E2E-NS-HOTEL';
const EMAIL_PREFIJO = 'ensayo-noshow+';
const NOMBRE_API_KEY = 'Ensayo E2E no-show';
/** Slug de la página pública que el ensayo publica (y borra en la limpieza). */
const SLUG_BOOKING = 'e2e-noshow-ensayo';
const NOMBRE_PROPIEDAD = 'Ensayo No-Show (Hotel Ceniza)';
const PARTNER_ID = 'e2e-partner';

/** Credenciales Basic del webhook: las mismas que el ensayo cifra en el proveedor. */
const CREDS_WEBHOOK = { username: 'usuario-ensayo', password: 'clave-ensayo' };

/** bookingId que el ensayo pone en su reserva para que el webhook la encuentre. */
const EXTERNAL_BOOKING_ID = 'E2E-NS-BKG';

/** Datos fiscales de emisor que siembra el ensayo (InvoicingService los exige). */
const EMISOR_FISCAL = {
  razonSocial: 'Hotel Ceniza Ensayo SA de CV',
  nombreComercial: 'Hotel Ceniza (ensayo)',
  pais: 'MEX',
  tipoIdFiscal: 'RFC',
  idFiscal: 'E2E240917XXX',
  regimenFiscal: '601',
  direccion: 'Real de Guadalupe 1',
  ciudad: 'San Cristóbal de las Casas',
  estadoProvincia: 'Chiapas',
  codigoPostal: '29200',
  email: 'fiscal@ensayo.test',
  monedaPredeterminada: 'MXN',
  esPrincipal: true,
  activo: true,
  verifactuEnabled: false,
};

/** Las dos unidades del ensayo, con su habitación externa del mock. */
const UNIDADES = [
  { codigo: 'E2E-NS-A', nombre: 'Suite Ceniza', capacidad: 2, tarifaBase: 1000, tarifa: 1500, roomCode: 'E2E-NS-ROOM-A', rateplanCode: 'E2E-NS-RP-A' },
  { codigo: 'E2E-NS-B', nombre: 'Loft Humo', capacidad: 3, tarifaBase: 900, tarifa: 1200, roomCode: 'E2E-NS-ROOM-B', rateplanCode: 'E2E-NS-RP-B' },
];

const noches = 2;
// La estancia cubre HOY: así el panel de Operaciones (que solo mira el día en
// curso) ve la unidad ocupada, y el contraste con el no-show es real.
const checkIn = hoy();
const checkOut = sumarDias(checkIn, noches);
const EMAIL_HUESPED = `${EMAIL_PREFIJO}${iso(checkIn)}@ensayo.test`;
// Importe de la reserva: 2 noches × tarifa. La penalización por defecto (primera
// noche) cobra la mitad, y así el ensayo puede exigir el importe exacto.
const IMPORTE_RESERVA = UNIDADES[0].tarifa * noches;
const PENALIZACION_ESPERADA = Math.round((IMPORTE_RESERVA / noches) * 100) / 100;

// ─── Salida ─────────────────────────────────────────────────────────────────
const verde = (s: string) => `\x1b[32m${s}\x1b[0m`;
const rojo = (s: string) => `\x1b[31m${s}\x1b[0m`;
const cian = (s: string) => `\x1b[36m${s}\x1b[0m`;
const gris = (s: string) => `\x1b[90m${s}\x1b[0m`;
const titulo = (s: string) => `\n\x1b[1m${s}\x1b[0m\n`;

let pasos = 0;
let fallos = 0;
const detalleFallos: string[] = [];

function ok(nombre: string, detalle = '') {
  pasos += 1;
  console.log(`  ${verde('✔')} ${nombre}${detalle ? gris(` — ${detalle}`) : ''}`);
}
function fallo(nombre: string, detalle = '') {
  pasos += 1;
  fallos += 1;
  detalleFallos.push(`${nombre}${detalle ? ` — ${detalle}` : ''}`);
  console.log(`  ${rojo('✘')} ${nombre}${detalle ? ` — ${detalle}` : ''}`);
}
function info(texto: string) {
  console.log(`  ${cian('→')} ${texto}`);
}
function esperar(condicion: unknown, nombre: string, detalle = '') {
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
function sumarDias(fecha: Date, dias: number) {
  const d = new Date(fecha);
  d.setDate(d.getDate() + dias);
  return d;
}
function iso(fecha: Date) {
  const y = fecha.getFullYear();
  const m = String(fecha.getMonth() + 1).padStart(2, '0');
  const d = String(fecha.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// ─── HTTP ───────────────────────────────────────────────────────────────────
async function peticion(
  ruta: string,
  {
    metodo = 'GET',
    cuerpo,
    apiKey,
    basic,
  }: {
    metodo?: string;
    cuerpo?: unknown;
    apiKey?: string;
    basic?: { username: string; password: string };
  } = {}
) {
  const res = await fetch(`${BASE}${ruta}`, {
    method: metodo,
    headers: {
      ...(cuerpo ? { 'content-type': 'application/json' } : {}),
      ...(apiKey ? { 'x-api-key': apiKey } : {}),
      ...(basic
        ? { authorization: `Basic ${Buffer.from(`${basic.username}:${basic.password}`).toString('base64')}` }
        : {}),
    },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  const texto = await res.text();
  let json: any = null;
  try {
    json = texto ? JSON.parse(texto) : null;
  } catch {
    json = { raw: texto.slice(0, 300) };
  }
  return { status: res.status, json };
}

// ─── Mock del proveedor de conectividad ─────────────────────────────────────
interface PushCapturado {
  metodo: string;
  path: string;
  body: any;
  recibidoEn: Date;
}

let pushes: PushCapturado[] = [];

/** Catálogo que el proveedor devuelve en `GET /property_details/{hotelCode}`. */
function catalogo(hotelCode: string) {
  return {
    hotel_id: hotelCode,
    hotel_name: 'Proveedor de ensayo (mock local)',
    property_category: 'hotel',
    currency: 'MXN',
    timezone: 'America/Mexico_City',
    rooms: UNIDADES.map((u) => ({
      room_id: u.roomCode,
      room_name: u.nombre,
      count: 1,
      active: true,
      max_occ: u.capacidad,
      rateplans: [{ rateplan_id: u.rateplanCode, rateplan_name: 'Tarifa estándar', occupancy: u.capacidad }],
    })),
  };
}

async function levantarMock(): Promise<http.Server> {
  const servidor = http.createServer((req, res) => {
    let crudo = '';
    req.on('data', (c) => (crudo += c));
    req.on('end', () => {
      const url = new URL(req.url || '/', `http://127.0.0.1:${MOCK_PORT}`);
      let body: any = null;
      try {
        body = crudo ? JSON.parse(crudo) : null;
      } catch {
        body = { raw: crudo.slice(0, 200) };
      }
      pushes.push({ metodo: req.method || 'GET', path: url.pathname, body, recibidoEn: new Date() });

      res.setHeader('content-type', 'application/json');
      // Catálogo del proveedor (lo consume el wizard de mapping).
      if (req.method === 'GET' && url.pathname.includes('/property_details/')) {
        const hotelCode = decodeURIComponent(url.pathname.split('/property_details/')[1] || '');
        res.end(JSON.stringify(catalogo(hotelCode)));
        return;
      }
      // Cualquier push (inventario, tarifas, restricciones) responde éxito.
      res.end(JSON.stringify({ success: true, message: 'ok (mock del ensayo)' }));
    });
  });

  await new Promise<void>((resolve, reject) => {
    servidor.once('error', reject);
    servidor.listen(MOCK_PORT, '127.0.0.1', () => resolve());
  });
  return servidor;
}

/** Espera a que el mock haya recibido al menos `n` peticiones. */
async function esperarPushes(n: number, timeoutMs = 15000) {
  const limite = Date.now() + timeoutMs;
  while (pesosDePush() < n && Date.now() < limite) {
    await new Promise((r) => setTimeout(r, 150));
  }
  return pesosDePush() >= n;
}

/** Cuenta los pushes de inventario (POST a /update/{pms}), no los GET del catálogo. */
function pesosDePush() {
  return pushes.filter((p) => p.metodo === 'POST' && p.path.startsWith('/api/v2/cm/update/')).length;
}

/**
 * Disponibilidad de un roomCode en una fecha, tal como la vería el canal: el
 * último UPSERT que cubre ese día. `null` si ningún push cubre la fecha.
 */
function disponibilidadEmpujada(roomCode: string, fecha: string): number | null {
  let valor: number | null = null;
  for (const p of pushes) {
    if (p.metodo !== 'POST' || !p.path.startsWith('/api/v2/cm/update/')) continue;
    for (const u of p.body?.updates || []) {
      if (!(u.startDate <= fecha && fecha <= u.endDate)) continue;
      for (const r of u.rooms || []) {
        if (r.roomCode === roomCode) valor = r.available;
      }
    }
  }
  return valor;
}

// ─── Prisma (semilla del proveedor y limpieza) ──────────────────────────────
const prisma = new PrismaClient();

async function limpiar(tenantId: string, restaurarProveedor = true) {
  // Facturas del ERP emitidas por el ensayo: su contacto es del ensayo y las
  // FK de Invoice a Contact no tienen cascade, así que se borran antes.
  const contactosEnsayo = await prisma.contact.findMany({
    where: { tenantId, email: { startsWith: EMAIL_PREFIJO } },
    select: { id: true },
  });
  for (const c of contactosEnsayo) {
    await prisma.invoice.deleteMany({ where: { tenantId, contactId: c.id } });
  }

  // Eventos del webhook: los que vienen sin reservationId (errores) no
  // cascada con la reserva; se van todos por hotelCode, que es del ensayo.
  await prisma.hospitalityWebhookEvent.deleteMany({ where: { hotelCode: HOTEL_CODE } });

  const propiedades = await prisma.hospitalityProperty.findMany({
    where: { tenantId, codigo: CODIGO_PROPIEDAD },
    select: { id: true },
  });
  for (const p of propiedades) {
    await prisma.hospitalitySyncLog.deleteMany({ where: { propertyId: p.id } });
    await prisma.connectivityMapping.deleteMany({ where: { propertyId: p.id } });
    await prisma.hospitalityProperty.delete({ where: { id: p.id } });
  }
  // Mappings que hayan quedado con la propiedad ya borrada.
  await prisma.connectivityMapping.deleteMany({
    where: { tenantId, externalPropertyId: HOTEL_CODE },
  });
  await prisma.contact.deleteMany({ where: { tenantId, email: { startsWith: EMAIL_PREFIJO } } });
  await prisma.apiKey.deleteMany({ where: { tenantId, nombre: NOMBRE_API_KEY } });
  // La página pública que el ensayo abre para poder reservar desde la web
  // (criterio único de publicación: la lista del hotel). Solo su slug.
  await prisma.hospitalityBookingConfig.deleteMany({ where: { tenantId, slug: SLUG_BOOKING } });
  if (restaurarProveedor) {
    // El ensayo configura la conectividad global; se devuelve a su estado previo.
    await prisma.connectivityProvider.deleteMany({ where: { providerKey: 'channel_connectivity' } });
    // Y los datos fiscales del emisor que sembró para poder facturar.
    await prisma.configuracionFiscalEmisor.deleteMany({ where: { tenantId } });
  }
  return propiedades.length;
}

async function crearApiKeyTemporal(tenantId: string, userId: string) {
  const clave = `vk_prod_${randomBytes(32).toString('hex')}`;
  const keyHash = createHash('sha256').update(clave).digest('hex');
  await prisma.apiKey.deleteMany({ where: { tenantId, nombre: NOMBRE_API_KEY } });
  await prisma.apiKey.create({
    data: {
      tenantId,
      userId,
      nombre: NOMBRE_API_KEY,
      descripcion: 'API key temporal del ensayo E2E del no-show',
      keyHash,
      prefix: clave.slice(0, 16),
      // contacts:write para el receptor fiscal de la factura (paso 4c).
      scopes: ['contacts:write'],
      activo: true,
      expiraEn: new Date(Date.now() + 60 * 60 * 1000),
    },
  });
  return clave;
}

/** Configura el proveedor de conectividad apuntando al mock. */
async function configurarProveedor() {
  const baseUrl = `http://127.0.0.1:${MOCK_PORT}/api/v2/cm`;
  await prisma.connectivityProvider.upsert({
    where: { providerKey: 'channel_connectivity' },
    create: {
      providerKey: 'channel_connectivity',
      nombreVisible: 'Conectividad de Canales',
      baseUrl,
      partnerIdEnc: encrypt(PARTNER_ID),
      usernameEnc: encrypt('usuario-ensayo'),
      passwordEnc: encrypt('clave-ensayo'),
      estado: 'conectado',
    },
    update: {
      nombreVisible: 'Conectividad de Canales',
      baseUrl,
      partnerIdEnc: encrypt(PARTNER_ID),
      usernameEnc: encrypt('usuario-ensayo'),
      passwordEnc: encrypt('clave-ensayo'),
      estado: 'conectado',
    },
  });
}

// ─── Ensayo ─────────────────────────────────────────────────────────────────
async function ensayar(servidorMock: http.Server) {
  console.log(titulo(`Ensayo E2E del no-show — ${BASE}`));
  const baseMock = `http://127.0.0.1:${MOCK_PORT}`;

  // 0. Prerrequisitos.
  console.log(titulo('0. Prerrequisitos'));
  const sonda = await peticion('/api/public/booking/propiedad-inexistente');
  if (sonda.status !== 404) {
    throw new Error(
      `No hay servidor de desarrollo en ${BASE} (respuesta ${sonda.status}). ` +
        'Usa npm run test:e2e:noshow, que lo arranca con CONNECTIVITY_BASE_URL.'
    );
  }
  ok('Servidor de desarrollo respondiendo', BASE);

  const usuario = await prisma.user.findFirst({
    where: { email: EMAIL_USUARIO },
    select: { id: true, tenantId: true, tenant: { select: { nombre: true } } },
  });
  if (!usuario?.tenantId) {
    throw new Error(`No existe el usuario ${EMAIL_USUARIO} con tenant. Corre el seed de la base local.`);
  }
  const tenantId = usuario.tenantId;
  ok('Tenant del ensayo resuelto', `${usuario.tenant?.nombre} (${tenantId.slice(0, 8)}…)`);

  // CONNECTIVITY_BASE_URL debe apuntar al mock para que el push se capture aquí.
  info('Comprobando que el servidor empuja al mock…');
  const yaExistiaProveedor = !!(await prisma.connectivityProvider.findUnique({
    where: { providerKey: 'channel_connectivity' },
  }));
  await limpiar(tenantId, false);
  await configurarProveedor();
  pushes = [];
  ok('Proveedor de conectividad apuntando al mock local', baseMock);

  const apiKey = await crearApiKeyTemporal(tenantId, usuario.id);
  ok('API key temporal creada (se elimina al terminar)');

  // Datos fiscales del emisor: el ERP no factura sin ellos (numeración fiscal).
  // Sin Veri*factu el sello es «no sellado», que es exactamente lo que queremos
  // en un ensayo: el circuito completo, sin certificado real.
  const yaHabiaEmisor = !!(await prisma.configuracionFiscalEmisor.findFirst({ where: { tenantId } }));
  await prisma.configuracionFiscalEmisor.deleteMany({ where: { tenantId } });
  await prisma.configuracionFiscalEmisor.create({ data: { tenantId, ...EMISOR_FISCAL } });
  ok('Emisor fiscal sembrado para el ERP', `${EMISOR_FISCAL.razonSocial} · sin certificado`);

  // 1. Propiedad de prueba por las APIs de gestión.
  console.log(titulo('1. Publicar la propiedad de prueba'));
  const crearPropiedad = await peticion('/api/hospitality/properties', {
    metodo: 'POST',
    apiKey,
    cuerpo: {
      nombre: NOMBRE_PROPIEDAD,
      descripcion: 'Propiedad de ensayo del no-show. Se elimina al terminar.',
      codigo: CODIGO_PROPIEDAD,
      ciudad: 'San Cristóbal de las Casas',
      pais: 'México',
      estado: 'activa',
    },
  });
  const propiedadId = crearPropiedad.json?.id;
  if (!esperar(crearPropiedad.status === 201 && !!propiedadId, 'Propiedad creada', `HTTP ${crearPropiedad.status}`)) {
    throw new Error(`No se pudo crear la propiedad de ensayo (HTTP ${crearPropiedad.status})`);
  }

  const unidades: Array<(typeof UNIDADES)[number] & { id: string }> = [];
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
      unidades.push({ ...u, id: res.json.unit.id });
      ok(`Unidad creada: ${u.nombre}`, `código ${u.codigo}`);
    } else {
      fallo(`Unidad no creada: ${u.nombre}`, `HTTP ${res.status}`);
    }
  }
  if (unidades.length !== UNIDADES.length) throw new Error('No se crearon las dos unidades del ensayo');

  for (const u of unidades) {
    const res = await peticion('/api/hospitality/rateplans', {
      metodo: 'POST',
      apiKey,
      cuerpo: { propertyId: propiedadId, unitId: u.id, nombre: 'Tarifa estándar', tarifa: u.tarifa, moneda: 'MXN', activo: true },
    });
    if (res.status === 201) ok(`Tarifa publicada: ${u.nombre}`, `${u.tarifa} MXN/noche`);
    else fallo(`Tarifa no publicada: ${u.nombre}`, `HTTP ${res.status}`);
  }

  // 2. Vínculo con el catálogo del proveedor por el wizard REAL.
  console.log(titulo('2. Vincular las unidades con el catálogo del proveedor'));
  const mapping = await peticion('/api/hospitality/onboarding/mapping', {
    metodo: 'POST',
    apiKey,
    cuerpo: {
      propertyId: propiedadId,
      hotelCode: HOTEL_CODE,
      asignaciones: unidades.map((u) => ({ unitId: u.id, roomCode: u.roomCode, rateplanCode: u.rateplanCode })),
    },
  });
  esperar(
    mapping.status === 200 && mapping.json?.ok === true && mapping.json?.vinculadas?.length === 2,
    'Las unidades quedan vinculadas al catálogo (validado contra el proveedor)',
    `${mapping.json?.vinculadas?.length ?? 0} vínculo(s) · hotelCode ${mapping.json?.hotelCode ?? '—'}`
  );

  const publicar = await peticion(`/api/hospitality/properties/${propiedadId}`, {
    metodo: 'PATCH',
    apiKey,
    cuerpo: { estado: 'conectada' },
  });
  esperar(publicar.status === 200 && publicar.json?.property?.estado === 'conectada', 'Propiedad publicada (estado «conectada»)');

  const unitA = unidades[0];
  const unitB = unidades[1];

  // 3. Reserva manual: el canal debe ver la unidad a 0.
  console.log(titulo('3. Reserva creada y empujada al canal'));
  const reserva = await peticion('/api/hospitality/reservations', {
    metodo: 'POST',
    apiKey,
    cuerpo: {
      propertyId: propiedadId,
      unitId: unitA.id,
      canal: 'Directa',
      checkin: iso(checkIn),
      checkout: iso(checkOut),
      huespedNombre: 'Huésped de Ensayo',
      huespedEmail: EMAIL_HUESPED,
      importe: unitA.tarifa * noches,
      moneda: 'MXN',
    },
  });
  const reservaId = reserva.json?.reservation?.id;
  esperar(reserva.status === 201 && !!reservaId, 'Reserva creada en la unidad A', `HTTP ${reserva.status}`);
  if (!reservaId) throw new Error('No se creó la reserva del ensayo');

  const llego = await esperarPushes(1);
  esperar(llego, 'El push de inventario llegó al proveedor', `${pesosDePush()} push(es)`);

  const disp3 = disponibilidadEmpujada(unitA.roomCode, iso(checkIn));
  esperar(
    disp3 === 0,
    'Con la reserva viva, el canal ve la habitación a 0 disponibles',
    `${unitA.roomCode} el ${iso(checkIn)} → ${disp3}`
  );
  esperar(
    disponibilidadEmpujada(unitB.roomCode, iso(checkIn)) === 1,
    'La otra habitación sigue disponible (control)',
    `${unitB.roomCode} → 1`
  );

  // La unidad aparece ocupada en Operaciones (la misma regla del motor).
  const opsAntes = await peticion(`/api/hospitality/operations`, { apiKey });
  const estadoA = (opsAntes.json?.unidades || []).find((u: any) => u.id === unitA.id)?.estadoOperativo;
  esperar(estadoA === 'occupied', 'Operaciones muestra la unidad A ocupada', `estadoOperativo: ${estadoA}`);

  // 4. El no-show: la unidad vuelve al inventario y la disponibilidad sube.
  console.log(titulo('4. Marcar no-show: la unidad vuelve a venderse'));
  const pushesAntes = pesosDePush();
  const marcarNoShow = await peticion(`/api/hospitality/reservations/${reservaId}`, {
    metodo: 'PATCH',
    apiKey,
    cuerpo: { estado: 'no_show' },
  });
  esperar(
    marcarNoShow.status === 200 && marcarNoShow.json?.reservation?.estado === 'no_show',
    'La reserva queda marcada como no-show',
    `estado: ${marcarNoShow.json?.reservation?.estado}`
  );

  // La misma transición emite el cargo (regla 8: el no-show cobra, pero no
  // produce). La respuesta del PATCH lo informa para que la UI lo avise.
  const pen = marcarNoShow.json?.penalizacion;
  esperar(
    pen?.emitida === true,
    'El PATCH informa de la penalización emitida',
    pen ? `importe ${pen.importe} ${pen.moneda} · política ${pen.politica}` : 'sin penalizacion en la respuesta'
  );
  esperar(
    pen?.importe === PENALIZACION_ESPERADA,
    'El cargo es la primera noche (importe entre noches)',
    `esperado ${PENALIZACION_ESPERADA}, recibido ${pen?.importe}`
  );

  const llegoNoShow = await esperarPushes(pushesAntes + 1);
  esperar(llegoNoShow, 'El no-show dispara un push de inventario nuevo', `${pesosDePush() - pushesAntes} push(es) nuevos`);

  const disp4 = disponibilidadEmpujada(unitA.roomCode, iso(checkIn));
  const disp4b = disponibilidadEmpujada(unitA.roomCode, iso(sumarDias(checkIn, 1)));
  esperar(
    disp4 === 1 && disp4b === 1,
    'La disponibilidad empujada SUBE a 1 en las dos noches del no-show',
    `${unitA.roomCode}: ${iso(checkIn)} → ${disp4}, ${iso(sumarDias(checkIn, 1))} → ${disp4b}`
  );
  esperar(
    disponibilidadEmpujada(unitA.roomCode, iso(checkOut)) === 1,
    'La noche posterior sigue disponible (sin bloqueo residual)',
    `${iso(checkOut)} → 1`
  );

  const opsDespues = await peticion(`/api/hospitality/operations`, { apiKey });
  const estadoADespues = (opsDespues.json?.unidades || []).find((u: any) => u.id === unitA.id)?.estadoOperativo;
  esperar(
    estadoADespues !== 'occupied',
    'Operaciones deja de mostrar la unidad A ocupada',
    `estadoOperativo: ${estadoADespues}`
  );

  // Traza en el log de sincronización: el push quedó registrado como éxito.
  const logNoShow = await prisma.hospitalitySyncLog.findFirst({
    where: { propertyId: propiedadId, tipo: 'inventory', estado: 'exito', operacion: 'reserva_modificada' },
    orderBy: { fechaCreacion: 'desc' },
  });
  esperar(!!logNoShow, 'El push del no-show queda registrado en el log de sincronización', logNoShow ? `HTTP ${logNoShow.httpStatus}` : 'sin registro');

  // 4b. La penalización: previsualización e idempotencia de la emisión.
  console.log(titulo('4b. Penalización por no-show: previsualización e idempotencia'));
  const penGet = await peticion(`/api/hospitality/reservations/${reservaId}/penalizacion`, { apiKey });
  esperar(
    penGet.status === 200 && penGet.json?.politica === 'primera_noche' && penGet.json?.previsto?.aplica === true,
    'El GET previsualiza el cargo con la política de la propiedad',
    `política ${penGet.json?.politica} · previsto ${penGet.json?.previsto?.importe}`
  );
  esperar(
    penGet.json?.emitida?.importe === PENALIZACION_ESPERADA && penGet.json?.emitida?.facturada === false,
    'El GET confirma el cargo ya emitido (pendiente de facturar)',
    penGet.json?.emitida ? `importe ${penGet.json.emitida.importe} ${penGet.json.emitida.moneda}` : 'sin emitida'
  );

  const penRepetida = await peticion(`/api/hospitality/reservations/${reservaId}/penalizacion`, {
    metodo: 'POST',
    apiKey,
    cuerpo: {},
  });
  esperar(
    penRepetida.status === 200 && penRepetida.json?.emitida === false && penRepetida.json?.motivo === 'ya_emitida',
    'Reemitir el cargo no lo duplica (idempotente)',
    `HTTP ${penRepetida.status} · motivo ${penRepetida.json?.motivo}`
  );

  // El receptor fiscal ya existe: la creación de la reserva vinculó el contacto
  // del huésped por email (canal directo). En un caso real, el operador lo
  // vincula desde Huéspedes; aquí basta reutilizar el que la app ya creó.
  const contactoDeLaReserva = penGet.json?.emitida
    ? (await prisma.hospitalityReservation.findFirst({
        where: { id: reservaId },
        select: { contactId: true, contact: { select: { id: true, nombre: true, email: true } } },
      }))
    : null;
  const contactoId = contactoDeLaReserva?.contactId || null;
  esperar(
    !!contactoId,
    'La reserva tiene receptor fiscal (contacto del CRM vinculado por email)',
    contactoDeLaReserva?.contact ? `${contactoDeLaReserva.contact.nombre} <${contactoDeLaReserva.contact.email}>` : 'sin contacto'
  );
  if (!contactoId) throw new Error('La reserva del ensayo no tiene contacto vinculado: no se puede facturar');

  // 4c. Factura por el ERP real (InvoicingService → Veri*factu). Con receptor
  // fiscal listo, la primera llamada emite; la segunda devuelve la MISMA factura.
  console.log(titulo('4c. Facturar la penalización por el ERP'));
  const factura = await peticion(`/api/hospitality/reservations/${reservaId}/penalizacion/facturar`, {
    metodo: 'POST',
    apiKey,
    cuerpo: {},
  });
  const invoiceId = factura.json?.invoiceId;
  esperar(
    factura.status === 201 && factura.json?.facturada === true && !!invoiceId && !!factura.json?.numero,
    'El ERP emite la factura de la penalización',
    factura.json?.numero ? `factura ${factura.json.numero} · ${factura.json.importe} ${factura.json.moneda}` : `HTTP ${factura.status} · ${factura.json?.error || ''}`
  );
  if (!invoiceId) throw new Error('No se emitió la factura del ERP: el resto del ensayo no tiene sentido');

  const facturaRepetida = await peticion(`/api/hospitality/reservations/${reservaId}/penalizacion/facturar`, {
    metodo: 'POST',
    apiKey,
    cuerpo: {},
  });
  esperar(
    facturaRepetida.status === 200 && facturaRepetida.json?.facturada === false && facturaRepetida.json?.motivo === 'ya_facturada',
    'Refacturar devuelve la MISMA factura (no se emite otra)',
    `HTTP ${facturaRepetida.status} · motivo ${facturaRepetida.json?.motivo}`
  );

  // La factura real existe en el ERP, con el receptor y el importe del cargo.
  const invoiceErp = await prisma.invoice.findFirst({
    where: { tenantId, contactId: contactoId },
    orderBy: { fechaEmision: 'desc' },
  });
  esperar(
    !!invoiceErp && invoiceErp.id === invoiceId && invoiceErp.monto === PENALIZACION_ESPERADA,
    'La factura vive en el ERP con el importe del cargo',
    invoiceErp ? `Invoice ${invoiceErp.numero} · monto ${invoiceErp.monto}` : 'sin factura en el ERP'
  );

  // La línea del cargo guarda su factura: la traza que impide refacturar.
  const itemConFactura = await prisma.hospitalityReservationItem.findFirst({
    where: { reservationId: reservaId, tipo: 'penalizacion' },
    select: { invoiceId: true },
  });
  esperar(
    itemConFactura?.invoiceId === invoiceId,
    'La línea del cargo queda trazada con su factura (no se factura dos veces)',
    `invoiceId ${itemConFactura?.invoiceId?.slice(0, 10) ?? '—'}…`
  );

  // 4d. Finanzas: la penalización no es ingreso de alojamiento.
  console.log(titulo('4d. Finanzas: el cargo sin tocar el bruto'));
  const finanzas = await peticion(`/api/hospitality/finanzas?propertyId=${propiedadId}`, { apiKey });
  // Localizamos la fila de la no-show entre las de la propiedad.
  const filaFinanzas = (finanzas.json?.reservas || []).find((r: any) => r.id === reservaId);
  esperar(
    finanzas.status === 200 && !!filaFinanzas,
    'La reserva no-show aparece en Finanzas (es un cargo pendiente, no producción)',
    `${finanzas.json?.reservas?.length ?? 0} fila(s)`
  );
  esperar(
    filaFinanzas?.bruto === 0,
    'El ingreso bruto de la reserva es 0: el no-show no produce alojamiento',
    `bruto ${filaFinanzas?.bruto}`
  );
  esperar(
    filaFinanzas?.penalizacion === PENALIZACION_ESPERADA,
    'La penalización vive en su propio campo (no infla el bruto)',
    `penalizacion ${filaFinanzas?.penalizacion}`
  );
  esperar(
    filaFinanzas?.neto === PENALIZACION_ESPERADA && filaFinanzas?.pendiente === PENALIZACION_ESPERADA && filaFinanzas?.estadoCobro === 'pendiente',
    'Neto y pendiente = el cargo, pendiente de cobrar',
    `neto ${filaFinanzas?.neto} · pendiente ${filaFinanzas?.pendiente} · ${filaFinanzas?.estadoCobro}`
  );

  // 4e. Cobrar la penalización: pago manual por el POST de Finanzas, el mismo
  // circuito que la UI. La ruta deriva el estado de cobro con el módulo puro y
  // lo devuelve; después Finanzas debe mostrar la fila saldada.
  console.log(titulo('4e. Cobrar la penalización (pago manual)'));
  const pagoManual = await peticion('/api/hospitality/finanzas', {
    metodo: 'POST',
    apiKey,
    cuerpo: {
      reservationId: reservaId,
      importe: PENALIZACION_ESPERADA,
      metodo: 'manual',
      estado: 'pagado',
      referenciaExterna: `ensayo-ns-${iso(checkIn)}`,
      notas: 'Pago manual de la penalización (ensayo E2E)',
    },
  });
  const pagoId = pagoManual.json?.pago?.id;
  esperar(
    pagoManual.status === 201 && !!pagoId && pagoManual.json?.estadoCobro === 'pagado' && pagoManual.json?.pendiente === 0,
    'El pago manual salda el cargo (la ruta deriva el estado de cobro)',
    `HTTP ${pagoManual.status} · ${pagoManual.json?.estadoCobro} · pendiente ${pagoManual.json?.pendiente ?? '—'}`
  );
  if (!pagoId) throw new Error('No se registró el pago manual: el resto del ensayo no tiene sentido');

  // Volver a intentar cobrar lo ya pagado debe chocar con la derivación: el
  // pendiente ya es 0 y la ruta lo rechaza (no se cobra dos veces).
  const pagoRepetido = await peticion('/api/hospitality/finanzas', {
    metodo: 'POST',
    apiKey,
    cuerpo: { reservationId: reservaId },
  });
  esperar(
    pagoRepetido.status === 400,
    'Cobrar de nuevo con pendiente 0 se rechaza (no hay doble cobro)',
    `HTTP ${pagoRepetido.status} · ${pagoRepetido.json?.error || ''}`
  );

  // Finanzas, ya saldada: el bruto sigue en 0 (cobrar no es producir) y el
  // estado de cobro derivado de los pagos es «pagado» con pendiente 0.
  const finanzasTrasPago = await peticion(`/api/hospitality/finanzas?propertyId=${propiedadId}`, { apiKey });
  const filaSaldada = (finanzasTrasPago.json?.reservas || []).find((r: any) => r.id === reservaId);
  esperar(
    finanzasTrasPago.status === 200 && filaSaldada?.estadoCobro === 'pagado' && filaSaldada?.pendiente === 0,
    'Finanzas muestra la penalización saldada (estadoCobro pagado, pendiente 0)',
    `estadoCobro ${filaSaldada?.estadoCobro} · pendiente ${filaSaldada?.pendiente}`
  );
  esperar(
    filaSaldada?.bruto === 0,
    'El bruto sigue en 0 tras el cobro: cobrar no convierte la no-show en producción',
    `bruto ${filaSaldada?.bruto}`
  );

  // 5. Re-reservar las mismas fechas (antes: 409 por el bloqueo fantasma).
  console.log(titulo('5. Volver a reservar las mismas fechas'));
  // La página pública es UNA (`/reservar/<slug>`) y publica la lista que el
  // hotel marca en su configuración: el ensayo abre la suya con la propiedad
  // publicada (y la borra al limpiar). Antes bastaba con el estado de la
  // propiedad; ahora el criterio es este.
  const configBooking = await prisma.hospitalityBookingConfig.upsert({
    where: { tenantId },
    create: {
      tenantId,
      slug: SLUG_BOOKING,
      activo: true,
      propiedadesPublicadas: [propiedadId],
    },
    update: { activo: true, propiedadesPublicadas: [propiedadId] },
    select: { slug: true },
  });

  const pushesAntesRealojo = pesosDePush();
  const reReserva = await peticion(`/api/public/booking/${configBooking.slug}/reservar`, {
    metodo: 'POST',
    cuerpo: {
      propertyId: propiedadId,
      unitId: unitA.id,
      checkIn: iso(checkIn),
      checkOut: iso(checkOut),
      adultos: 2,
      ninos: 0,
      // La clave de idempotencia del formulario público.
      solicitudId: `ensayo-ns-${iso(checkIn)}`,
      nombre: 'Huésped Realojo',
      email: `${EMAIL_PREFIJO}realojo@ensayo.test`,
    },
  });
  esperar(
    reReserva.status === 201 && !!reReserva.json?.referencia,
    'La página pública acepta la reserva sobre las fechas del no-show',
    `HTTP ${reReserva.status} · ${reReserva.json?.referencia || reReserva.json?.error || ''}`
  );

  // La reserva directa debe ocupar la unidad en los canales igual que una de
  // OTA: si no empuja, el canal sigue vendiendo la habitación ya vendida.
  const llegoRealojo = await esperarPushes(pushesAntesRealojo + 1);
  esperar(
    llegoRealojo,
    'La reserva del booking engine también empuja disponibilidad al canal',
    `${pesosDePush() - pushesAntesRealojo} push(es) nuevos`
  );
  const disp5 = disponibilidadEmpujada(unitA.roomCode, iso(checkIn));
  esperar(disp5 === 0, 'La nueva reserva vuelve a bajar la disponibilidad empujada a 0', `${unitA.roomCode} el ${iso(checkIn)} → ${disp5}`);

  // Las dos reservas quedan visibles (traza): la no-show y la nueva.
  const listado = await peticion(`/api/hospitality/reservations?propertyId=${propiedadId}`, { apiKey });
  const reservas = listado.json?.reservations || [];
  const noShowRow = reservas.find((r: any) => r.id === reservaId);
  // La respuesta pública trae la REFERENCIA (la clave del canal directo), que es
  // por donde se localiza la reserva en el listado: el id interno no se publica.
  const realojoRow = reservas.find((r: any) => r.externalBookingId === reReserva.json?.referencia);
  esperar(
    noShowRow?.estado === 'no_show' && realojoRow?.estado === 'confirmed',
    'Conviven la reserva no-show (traza) y la nueva (confirmada)',
    `${reservas.length} reserva(s) en la propiedad`
  );
  esperar(
    realojoRow?.unitId === unitA.id,
    'La reserva nueva ocupa la misma unidad que liberó el no-show',
    realojoRow?.unit?.nombre || unitA.nombre
  );

  // 5b. Vía B — el webhook entrante. Un `no_show` reportado por el proveedor
  // debe poder marcar una reserva por el mismo motor que el PATCH del
  // operador: mismo efecto de inventario (push, disponibilidad) y misma
  // penalización. Para que haya una transición REAL que marcar, la vía B usa
  // SU PROPIA reserva: la unidad B sigue viva hasta ahora (la A ya se marcó
  // no-show por el camino del operador en el paso 4, y re-marcara no sería
  // una transición — sería idempotencia, que se comprueba aparte).
  console.log(titulo('5b. Vía B: no_show entrante por el webhook del proveedor'));

  // La reserva de la vía B se crea por la API de gestión con la referencia
  // (= externalBookingId) por la que el proveedor la conocerá.
  const reservaB = await peticion('/api/hospitality/reservations', {
    metodo: 'POST',
    apiKey,
    cuerpo: {
      propertyId: propiedadId,
      unitId: unitB.id,
      canal: 'Directa',
      checkin: iso(checkIn),
      checkout: iso(checkOut),
      huespedNombre: 'Huésped Vía B',
      huespedEmail: `${EMAIL_PREFIJO}viab@ensayo.test`,
      importe: unitB.tarifa * noches,
      moneda: 'MXN',
      referencia: EXTERNAL_BOOKING_ID,
    },
  });
  const reservaBId = reservaB.json?.reservation?.id;
  esperar(
    reservaB.status === 201 && !!reservaBId,
    'Reserva de la vía B creada en la unidad B (con referencia del proveedor)',
    `HTTP ${reservaB.status} · ref ${EXTERNAL_BOOKING_ID}`
  );
  if (!reservaBId) throw new Error('No se creó la reserva de la vía B');

  // Su push de creación deja a la unidad B a 0: control de la vía B.
  await esperarPushes(pesosDePush() + 1);
  esperar(
    disponibilidadEmpujada(unitB.roomCode, iso(checkIn)) === 0,
    'La unidad B parte vendida (0 disponibles) como control de la vía B',
    `${unitB.roomCode} el ${iso(checkIn)} → ${disponibilidadEmpujada(unitB.roomCode, iso(checkIn))}`
  );

  // La penalización esperada de la vía B: la primera noche de la unidad B.
  const PENALIZACION_B = unitB.tarifa;

  /** El evento no_show tal como lo enviaría el proveedor (reutilizable). */
  const eventoNoShow = (bookingId: string = EXTERNAL_BOOKING_ID) => ({
    action: 'no_show',
    hotelCode: HOTEL_CODE,
    channel: 'Directa',
    bookingId,
    checkin: iso(checkIn),
    checkout: iso(checkOut),
    guest: { firstName: 'Huésped', lastName: 'Vía B', email: `${EMAIL_PREFIJO}viab@ensayo.test` },
    // El contexto de habitación: sin él el motor no resuelve el mapping.
    rooms: [{ roomCode: unitB.roomCode, rateplanCode: unitB.rateplanCode, occupancy: { adults: 2 } }],
  });

  const pushesAntesViaB = pesosDePush();
  const viaB = await peticion('/api/hospitality/webhook/reservations', {
    metodo: 'POST',
    basic: CREDS_WEBHOOK,
    cuerpo: eventoNoShow(),
  });
  esperar(
    viaB.status === 200 && viaB.json?.success === true && viaB.json?.reservationId === reservaBId,
    'El webhook acepta action no_show y resuelve la reserva (200, Basic Auth OK)',
    `HTTP ${viaB.status} · status ${viaB.json?.status} · ${viaB.json?.reservationId?.slice(0, 10) ?? '—'}…`
  );

  const penB = viaB.json?.penalizacion;
  esperar(
    penB?.emitida === true && penB?.importe === PENALIZACION_B,
    'La respuesta del webhook informa de la penalización emitida (primera noche de la unidad B)',
    penB ? `emitida ${penB.emitida} · importe ${penB.importe} ${penB.moneda ?? ''}` : 'sin penalizacion en la respuesta'
  );

  const llegoViaB = await esperarPushes(pushesAntesViaB + 1);
  esperar(llegoViaB, 'El no_show entrante también empuja inventario al canal', `${pesosDePush() - pushesAntesViaB} push(es) nuevos`);
  esperar(
    disponibilidadEmpujada(unitB.roomCode, iso(checkIn)) === 1,
    'La disponibilidad empujada de la unidad B sube a 1 con la vía entrante',
    `${unitB.roomCode} el ${iso(checkIn)} → ${disponibilidadEmpujada(unitB.roomCode, iso(checkIn))}`
  );

  // Repetir el evento: idempotente por estado. La reserva ya está no_show,
  // así que el motor no la toca ni re-emite (la respuesta no trae cargo nuevo).
  const viaB2 = await peticion('/api/hospitality/webhook/reservations', {
    metodo: 'POST',
    basic: CREDS_WEBHOOK,
    cuerpo: eventoNoShow(),
  });
  esperar(
    viaB2.status === 200 && viaB2.json?.success === true && viaB2.json?.penalizacion == null,
    'Repetir el no_show entrante no re-emite (idempotente por estado)',
    `HTTP ${viaB2.status} · penalizacion ${viaB2.json?.penalizacion === null ? 'null' : 'presente'}`
  );

  // El emisor es único: pase lo que pase con los reintentos, UN solo cargo.
  const itemsViaB = await prisma.hospitalityReservationItem.findMany({
    where: { reservationId: reservaBId, tipo: 'penalizacion' },
  });
  esperar(
    itemsViaB.length === 1 && itemsViaB[0].importeTotal === PENALIZACION_B,
    'La vía B deja UN solo cargo con el importe exacto (emisor idempotente)',
    itemsViaB.length ? `importe ${itemsViaB[0].importeTotal}` : 'sin cargo'
  );

  // Evento bruto con action no_show, registrado como procesado y a nombre del tenant.
  const eventoViaB = await prisma.hospitalityWebhookEvent.findFirst({
    where: { bookingId: EXTERNAL_BOOKING_ID, action: 'no_show' },
    orderBy: { fechaCreacion: 'desc' },
  });
  esperar(
    !!eventoViaB && eventoViaB.estado === 'procesado' && eventoViaB.tenantId === tenantId,
    'El evento queda en el log del webhook como procesado (auditoría)',
    eventoViaB ? `estado ${eventoViaB.estado} · booking ${eventoViaB.bookingId}` : 'sin evento'
  );

  // Y una reserva inexistente responde 404 (el proveedor sabe que reintentar
  // no cambia nada hasta que la reserva exista aquí).
  const viaBInvalida = await peticion('/api/hospitality/webhook/reservations', {
    metodo: 'POST',
    basic: CREDS_WEBHOOK,
    cuerpo: eventoNoShow('E2E-NO-EXISTE-NS'),
  });
  esperar(
    viaBInvalida.status === 404 && viaBInvalida.json?.success === false,
    'Un no_show de una reserva inexistente responde 404 (contrato)',
    `HTTP ${viaBInvalida.status} · ${viaBInvalida.json?.error ?? ''}`
  );

  // 5c. Salida anticipada: el apagador A/B del Anfitrión. La re-reserva del
  // paso 5 vive en la unidad A con política B (el defecto); el check-out de la
  // vía B deja a la unidad B libre para el check-out con la política A. En
  // AMBAS políticas el inventario liberado vuelve al canal (la subida de
  // disponibilidad); la firma de cada política queda en la base: B guarda
  // `checkOutReal` y conserva el `checkOut` previsto; A pisa el `checkOut` al
  // día del check-out y no anota salida real.
  console.log(titulo('5c. Salida anticipada: el apagador A/B del Anfitrión'));

  // ── Política B (defecto): guardar la salida real, el previsto no se toca ──
  const politicaPropiedad = (await prisma.hospitalityProperty.findUnique({
    where: { id: propiedadId },
    select: { politicaSalidaAnticipada: true },
  }))?.politicaSalidaAnticipada;
  esperar(
    politicaPropiedad === 'salida_real',
    'La propiedad usa la política B por defecto (salida_real)',
    `politicaSalidaAnticipada: ${politicaPropiedad ?? '—'}`
  );

  const pushesAntes5c = pesosDePush();
  const checkoutReal = await peticion(`/api/hospitality/reservations/${realojoRow?.id}/check`, {
    metodo: 'POST',
    apiKey,
    cuerpo: { operacion: 'checkout' },
  });
  const reservaReReserva = await prisma.hospitalityReservation.findFirst({
    where: { id: realojoRow?.id },
    select: { checkOut: true, checkOutReal: true, estado: true },
  });
  esperar(
    checkoutReal.status === 200 && reservaReReserva?.estado === 'checked_out',
    'Check-out de la re-reserva realizado (la estancia termina hoy)',
    `HTTP ${checkoutReal.status} · estado ${reservaReReserva?.estado ?? '—'}`
  );
  esperar(
    !!reservaReReserva?.checkOutReal && iso(reservaReReserva.checkOutReal) === iso(hoy()),
    'Con B se guarda la salida real de hoy (checkOutReal)',
    reservaReReserva?.checkOutReal ? `checkOutReal ${iso(reservaReReserva.checkOutReal)}` : 'sin checkOutReal'
  );
  esperar(
    reservaReReserva && iso(reservaReReserva.checkOut) === iso(checkOut),
    'El checkOut previsto queda intacto con B (noches vendidas y facturación)',
    `checkOut ${iso(reservaReReserva?.checkOut ?? checkOut)} (previsto ${iso(checkOut)})`
  );
  // Con B las noches VENDIDAS no cambian (checkOut intacto), pero el
  // INVENTARIO sí se libera: la habitación vacía vuelve a venderse — ese es
  // el punto de la salida real. La subida de disponibilidad ocurre en ambas
  // políticas; lo que distingue A de B es la firma en la base, no el canal.
  const llegoB = await esperarPushes(pushesAntes5c + 1);
  esperar(
    llegoB,
    'El check-out con B dispara un push de inventario nuevo',
    `${pesosDePush() - pushesAntes5c} push(es) nuevos`
  );
  esperar(
    disponibilidadEmpujada(unitA.roomCode, iso(checkIn)) === 1 &&
      disponibilidadEmpujada(unitA.roomCode, iso(sumarDias(checkIn, 1))) === 1,
    'Con B la disponibilidad empujada SUBE: el inventario se libera aunque las noches sigan vendidas',
    `${unitA.roomCode}: ${iso(checkIn)} → ${disponibilidadEmpujada(unitA.roomCode, iso(checkIn))}, ${iso(sumarDias(checkIn, 1))} → ${disponibilidadEmpujada(unitA.roomCode, iso(sumarDias(checkIn, 1)))}`
  );

  // ── Política A: pisar el checkOut al día del check-out ──
  const cambiaPolitica = await peticion(`/api/hospitality/properties/${propiedadId}`, {
    metodo: 'PATCH',
    apiKey,
    cuerpo: { politicaSalidaAnticipada: 'cerrar_estancia' },
  });
  esperar(
    cambiaPolitica.status === 200 && cambiaPolitica.json?.property?.politicaSalidaAnticipada === 'cerrar_estancia',
    'El Anfitrión cambia el apagador a A (cerrar_estancia) desde la API',
    `HTTP ${cambiaPolitica.status} · politicaSalidaAnticipada ${cambiaPolitica.json?.property?.politicaSalidaAnticipada ?? '—'}`
  );

  // Un check-out equivalente en la unidad B (su reserva quedó no_show por la
  // vía B; una reserva no_show no se puede operar, así que creamos una nueva
  // reserva viva en la unidad B para el check-out de la política A).
  const reservaA2 = await peticion('/api/hospitality/reservations', {
    metodo: 'POST',
    apiKey,
    cuerpo: {
      propertyId: propiedadId,
      unitId: unitB.id,
      canal: 'Directa',
      checkin: iso(checkIn),
      checkout: iso(checkOut),
      huespedNombre: 'Huésped Política A',
      huespedEmail: `${EMAIL_PREFIJO}politica-a@ensayo.test`,
      importe: unitB.tarifa * noches,
      moneda: 'MXN',
    },
  });
  const reservaA2Id = reservaA2.json?.reservation?.id;
  esperar(
    reservaA2.status === 201 && !!reservaA2Id,
    'Reserva viva en la unidad B para el check-out con política A',
    `HTTP ${reservaA2.status}`
  );
  if (!reservaA2Id) throw new Error('No se creó la reserva de la política A');

  // El push de su creación deja a la unidad B a 0: control del caso A.
  await esperarPushes(pesosDePush() + 1);
  esperar(
    disponibilidadEmpujada(unitB.roomCode, iso(checkIn)) === 0,
    'La unidad B parte vendida (0 disponibles) como control del caso A',
    `${unitB.roomCode} el ${iso(checkIn)} → ${disponibilidadEmpujada(unitB.roomCode, iso(checkIn))}`
  );

  const pushesAntesA = pesosDePush();
  const checkoutA = await peticion(`/api/hospitality/reservations/${reservaA2Id}/check`, {
    metodo: 'POST',
    apiKey,
    cuerpo: { operacion: 'checkout' },
  });
  const reservaTrasA = await prisma.hospitalityReservation.findFirst({
    where: { id: reservaA2Id },
    select: { checkOut: true, checkOutReal: true, estado: true },
  });
  esperar(
    checkoutA.status === 200 && reservaTrasA?.estado === 'checked_out',
    'Check-out con política A realizado',
    `HTTP ${checkoutA.status} · estado ${reservaTrasA?.estado ?? '—'}`
  );
  esperar(
    !!reservaTrasA && iso(reservaTrasA.checkOut) === iso(hoy()),
    'Con A el checkOut queda pisado al día del check-out',
    `checkOut ${reservaTrasA ? iso(reservaTrasA.checkOut) : '—'} (era ${iso(checkOut)})`
  );
  esperar(
    reservaTrasA?.checkOutReal == null,
    'Con A no se guarda checkOutReal (la política pisa la fecha, no la anota)',
    reservaTrasA?.checkOutReal ? `checkOutReal ${iso(reservaTrasA.checkOutReal)}` : 'sin checkOutReal (correcto)'
  );

  // El efecto por el que existe la política A: las noches no usadas se
  // liberan y el canal las vuelve a recibir como disponibles.
  const llegoA = await esperarPushes(pushesAntesA + 1);
  esperar(
    llegoA,
    'El check-out con A dispara un push de inventario nuevo',
    `${pesosDePush() - pushesAntesA} push(es) nuevos`
  );
  esperar(
    disponibilidadEmpujada(unitB.roomCode, iso(checkIn)) === 1,
    'Con A la disponibilidad empujada SUBE a 1 (la habitación vacía vuelve a venderse)',
    `${unitB.roomCode} el ${iso(checkIn)} → ${disponibilidadEmpujada(unitB.roomCode, iso(checkIn))}`
  );

  // Restaurar la política por defecto de la propiedad (B) para dejar el
  // estado coherente de cara a la limpieza.
  await peticion(`/api/hospitality/properties/${propiedadId}`, {
    metodo: 'PATCH',
    apiKey,
    cuerpo: { politicaSalidaAnticipada: 'salida_real' },
  });

  // 5d. Vista Mes del planning: la vista es lógica PURA del cliente
  // (`occupancyByDay`) sobre el payload que sirve `/api/hospitality/reservations`.
  // El ensayo reproduce esa vista con el payload REAL para verificar dos cosas:
  // que el fin real de la estancia llega al cliente (`checkOutReal`) y que las
  // noches liberadas dejan de pintarse — con el contraste contra el
  // comportamiento anterior (el `checkOut` previsto).
  console.log(titulo('5d. La vista Mes del planning deja de pintar las noches liberadas'));

  const desde = iso(checkIn);
  const hasta = iso(sumarDias(checkIn, 3));
  const apiReservas = await peticion(
    `/api/hospitality/reservations?from=${desde}&to=${hasta}`,
    { apiKey }
  );
  const payloadReserva = (apiReservas.json?.reservations ?? []).find(
    (r: any) => r.id === realojoRow?.id
  );
  esperar(
    apiReservas.status === 200 && !!payloadReserva,
    'El API de reservas (el que alimenta la vista Mes) devuelve la reserva',
    `HTTP ${apiReservas.status}`
  );
  esperar(
    !!payloadReserva?.checkOutReal,
    'El payload incluye checkOutReal: la vista Mes puede calcular el fin real',
    payloadReserva?.checkOutReal
      ? `checkOutReal ${iso(new Date(payloadReserva.checkOutReal))}`
      : 'sin checkOutReal'
  );

  // Mapeo al tipo del planning (el mismo que hace la página).
  const comoReservaPlanning = (r: any): CalendarReservation => ({
    id: r.id,
    unitId: r.unitId,
    unitNombre: r.unit?.nombre ?? null,
    propertyId: r.propertyId,
    channel: r.channel,
    guestName: null,
    email: null,
    phone: null,
    estado: r.estado,
    checkIn: new Date(r.checkIn),
    checkOut: new Date(r.checkOut),
    checkOutReal: r.checkOutReal ? new Date(r.checkOutReal) : null,
    nights: 0,
    amountAfterTax: r.amountAfterTax ?? null,
    currency: r.currency ?? null,
    specialRequests: null,
    externalBookingId: r.externalBookingId,
  });

  const mes = buildMonthGrid(new Date(checkIn));
  const reservaPlanning = comoReservaPlanning(payloadReserva);
  const vistaMes = occupancyByDay([reservaPlanning], mes.days);
  const ocupadasEnMes = (fecha: Date) => (vistaMes.get(iso(fecha)) ?? []).length;

  esperar(
    ocupadasEnMes(checkIn) === 0 && ocupadasEnMes(sumarDias(checkIn, 1)) === 0,
    'La vista Mes no pinta las noches tras la salida real (0 ocupadas)',
    `${iso(checkIn)} → ${ocupadasEnMes(checkIn)}, ${iso(sumarDias(checkIn, 1))} → ${ocupadasEnMes(sumarDias(checkIn, 1))}`
  );

  // Contraprueba: con el `checkOut` previsto (el comportamiento anterior) esas
  // mismas noches SÍ se pintaban ocupadas — el fin real es lo que las libera.
  const vistaMesAnterior = occupancyByDay(
    [{ ...reservaPlanning, checkOutReal: null }],
    mes.days
  );
  esperar(
    (vistaMesAnterior.get(iso(checkIn)) ?? []).length === 1 &&
      (vistaMesAnterior.get(iso(sumarDias(checkIn, 1))) ?? []).length === 1,
    'Contraprueba: con el checkOut previsto se pintaban las 2 noches (el fin real es lo que las libera)',
    `${iso(checkIn)} → ${(vistaMesAnterior.get(iso(checkIn)) ?? []).length}, ${iso(sumarDias(checkIn, 1))} → ${(vistaMesAnterior.get(iso(sumarDias(checkIn, 1))) ?? []).length}`
  );

  // El caso A converge en la misma vista sin necesitar `checkOutReal`: la
  // política pisa el `checkOut`, así que el planning tampoco pinta sus noches.
  const payloadA = (apiReservas.json?.reservations ?? []).find(
    (r: any) => r.id === reservaA2Id
  );
  if (payloadA) {
    const vistaMesA = occupancyByDay([comoReservaPlanning(payloadA)], mes.days);
    esperar(
      (vistaMesA.get(iso(checkIn)) ?? []).length === 0 &&
        (vistaMesA.get(iso(sumarDias(checkIn, 1))) ?? []).length === 0,
      'Con A (checkOut pisado) la vista Mes tampoco pinta las noches no usadas',
      `${iso(checkIn)} → ${(vistaMesA.get(iso(checkIn)) ?? []).length}`
    );
  }

  console.log(titulo('6. URLs para revisarlo a mano'));
  info(`Planning:  ${BASE}/dashboard/hospitality/calendar   (propiedad «${NOMBRE_PROPIEDAD}»)`);
  info(`Reservas:  ${BASE}/dashboard/hospitality/reservas   (buscar «${EMAIL_PREFIJO}»)`);
  info(`Finanzas:  ${BASE}/dashboard/hospitality/finanzas`);
  info(`Referencia nueva: ${reReserva.json?.referencia}`);
  return { propiedadId, reservaId, yaExistiaProveedor, yaHabiaEmisor };
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
    ok('Datos del ensayo eliminados', `${borradas} propiedad(es) + mappings + proveedor`);
    return;
  }

  const servidorMock = await levantarMock();
  info(`Mock del proveedor escuchando en http://127.0.0.1:${MOCK_PORT}/api/v2/cm`);

  let error: unknown = null;
  let yaExistiaProveedor = false;
  let yaHabiaEmisor = false;
  try {
    const r = await ensayar(servidorMock);
    yaExistiaProveedor = r.yaExistiaProveedor;
    yaHabiaEmisor = r.yaHabiaEmisor;
  } catch (e) {
    error = e;
  }

  if (usuario?.tenantId) {
    console.log(titulo('7. Limpieza'));
    if (KEEP) {
      info('Datos conservados (--keep). Para borrarlos: npx tsx --require ./scripts/cargar-entorno.cjs scripts/e2e-no-show.ts --cleanup');
    } else {
      const borradas = await limpiar(usuario.tenantId, !yaExistiaProveedor);
      ok('Datos del ensayo eliminados', `${borradas} propiedad(es), mappings, logs, contacto y API key`);
      info(
        yaExistiaProveedor
          ? 'Se conservó el proveedor de conectividad que ya existía antes del ensayo.'
          : 'El proveedor de conectividad vuelve a su estado previo (sin configurar).'
      );
      info(
        yaHabiaEmisor
          ? 'OJO: había una configuración fiscal del emisor previa al ensayo y la limpieza la borró. Repónla desde Ajustes si la usabas.'
          : 'La configuración fiscal del emisor sembrada por el ensayo se ha eliminado.'
      );
    }
  }

  await new Promise<void>((resolve) => servidorMock.close(() => resolve()));

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
    await prisma.$disconnect();
  });
