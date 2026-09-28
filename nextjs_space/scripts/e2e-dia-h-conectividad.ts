/**
 * Ensayo del DÍA H de Conectividad de Canales contra el simulador local.
 *
 * Recorre, con el código REAL del producto, exactamente lo que pasa el día que
 * llega la respuesta del proveedor —URL, partner id y Basic Auth—, como si esas
 * fueran las claves de verdad:
 *
 *   1. Preflight de la respuesta del proveedor (mismo módulo que la API y la
 *      pantalla). Contraprueba: la pega con un espacio de más se rechaza ANTES
 *      de guardar, que es el 401 que se lleva el operador a casa.
 *   2. Guardado real de credenciales (`saveConnectivityConfig`).
 *   3. `property_details` contra el simulador: el catálogo con el que se
 *      construye el mapping externo (paso 5 del onboarding).
 *   4. Push de inventario y de tarifas (el adapter real) y comprobación, en el
 *      registro del simulador, de lo que recibió de verdad.
 *   5. Contraprueba de credenciales malas: el push falla con 401 y se ve, no se
 *      queda en silencio.
 *   6. El proveedor EMPUJA una reserva (webhook `book` al producto, con Basic
 *      Auth) → la reserva entra en el ERP, con su token de check-in.
 *   6b. Contrapruebas del 401 del webhook ENTRANTE contra el simulador:
 *       sin cabecera (401 sin_cabecera), `basic` en minúsculas (200, RFC
 *       7235) y otro esquema (401 esquema_no_basic con el esquema visto): el
 *       diagnóstico que pinta /admin/conectividad, cubierto en el ensayo.
 *   7. `modify` y `cancel` sobre la misma reserva, y el ciclo `book` repetido
 *      (idempotencia: no duplica).
 *   8. Reconciliación: `data` devuelve la reserva que el proveedor tiene.
 *   9. Limpieza: se borra todo lo que ha creado el ensayo, incluida la
 *      configuración de conectividad previa (se restaura tal cual estaba).
 *
 * APAGADOR: exige `E2E_DIA_H=1`. Sin él no hace nada: escribe en la base de
 * datos del entorno en el que se lance.
 *
 * Uso (lo normal es el lanzador, que además levanta el servidor):
 *   E2E_DIA_H=1 BASE_URL=http://localhost:3097 npx tsx --require dotenv/config \
 *     scripts/e2e-dia-h-conectividad.ts
 *   E2E_DIA_H=1 ... --keep    # deja los datos para mirarlos en la interfaz
 *
 * El detalle de cada comprobación vive aquí; el servidor y el simulador los
 * levanta `scripts/run-e2e-dia-h-conectividad.sh`.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as esperar } from 'node:timers/promises';
import { PrismaClient } from '@prisma/client';

import { preflightConectividad } from '../lib/hospitality/connectivity-preflight';
import {
  CONNECTIVITY_PROVIDER_KEY,
  fetchReservations,
  getConnectivityProvider,
  pushInventory,
  pushRates,
  saveConnectivityConfig,
  testConnectivityConnection,
} from '../lib/hospitality/connectivity';
import { buildTestReservationPayload } from '../lib/hospitality/onboarding';
import { asegurarTokenCheckin } from '../lib/hospitality/checkin-service';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const prisma = new PrismaClient();

const BASE_URL = (process.env.BASE_URL || 'http://localhost:3097').replace(/\/+$/, '');
const CONSERVAR = process.argv.includes('--keep');

// Códigos del ensayo: llevan el prefijo E2E-DIA-H para que una corrida
// interrumpida se pueda limpiar y repetir sin tocar datos de nadie.
const PREFIJO_E2E = 'E2E-DIA-H';
const SLUG_TENANT = 'e2e-dia-h';
const HOTEL_CODE = 'e2e-dia-h-hotel';
const ROOM_CODE = '101';
const RATEPLAN_CODE = 'FLEX-101';
const BOOKING_ID = `${PREFIJO_E2E}-${Date.now()}`;
const EMAIL_HUESPED = 'dia-h@example.invalid';

// ─── Utilidades de informe ──────────────────────────────────────────────────

const VERDE = '\u001b[0;32m';
const ROJO = '\u001b[0;31m';
const AMARILLO = '\u001b[1;33m';
const CIAN = '\u001b[0;36m';
const NC = '\u001b[0m';

let fallos = 0;
let pasos = 0;

function info(mensaje: string): void {
  console.log(`  ${CIAN}→${NC} ${mensaje}`);
}

function exito(mensaje: string): void {
  pasos += 1;
  console.log(`  ${VERDE}✔${NC} ${mensaje}`);
}

function fallo(mensaje: string, detalle?: unknown): void {
  pasos += 1;
  fallos += 1;
  console.log(`  ${ROJO}✘${NC} ${mensaje}`);
  if (detalle !== undefined) console.log(`      ${JSON.stringify(detalle)?.slice(0, 600)}`);
}

function comprobar(condicion: boolean, mensaje: string, detalle?: unknown): void {
  if (condicion) exito(mensaje);
  else fallo(mensaje, detalle);
}

function cabecera(titulo: string): void {
  console.log(`\n${AMARILLO}━━━ ${titulo} ━━━${NC}`);
}

/**
 * Credenciales del ensayo: como las daría un proveedor. Los nombres son los del
 * producto (`username`/`password`), porque el preflight y el guardado son los
 * del producto; el simulador las recibe por sus propios argumentos.
 */
const CLAVES = {
  partnerId: `partner-e2e-dia-h-${Date.now().toString(36)}`,
  username: 'hotel.api.e2e',
  password: 'S3creto-E2E!con#simbolos',
};

// ─── Simulador ──────────────────────────────────────────────────────────────

let simulador: ChildProcess | null = null;
let simuladorUrl = '';

async function levantarSimulador(): Promise<string> {
  const script = path.join(RAIZ, 'scripts', 'simulador-conectividad.mjs');
  simulador = spawn(
    process.execPath,
    [
      script,
      '--port',
      '0',
      '--partner-id',
      CLAVES.partnerId,
      '--usuario',
      CLAVES.username,
      '--password',
      CLAVES.password,
      '--hotel-code',
      HOTEL_CODE,
      '--moneda',
      'EUR',
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );

  // El simulador imprime la URL del CONTRATO (con el prefijo). El ensayo y las
  // rutas de control trabajan con el origen: el prefijo lo añade el adapter.
  const urlContrato = await new Promise<string>((resolve, reject) => {
    const temporizador = setTimeout(() => reject(new Error('El simulador no arrancó en 10 s')), 10_000);
    const leer = (trozo: Buffer) => {
      const coincidencia = /SIMULADOR_LISTO puerto=\d+ url=(\S+)/.exec(trozo.toString());
      if (coincidencia) {
        clearTimeout(temporizador);
        resolve(coincidencia[1]);
      }
    };
    simulador!.stdout?.on('data', leer);
    simulador!.stderr?.on('data', (trozo: Buffer) => process.stderr.write(`[simulador] ${trozo}`));
    simulador!.on('exit', (codigo) => reject(new Error(`El simulador se cerró (código ${codigo})`)));
  });

  return urlContrato.replace(/\/api\/v2\/cm\/?$/, '').replace(/\/+$/, '');
}

/** Registro de lo que el simulador ha recibido (lado proveedor de la verdad). */
async function peticionesDelSimulador(): Promise<Array<Record<string, unknown>>> {
  const res = await fetch(`${simuladorUrl}/_control/peticiones`);
  const datos = (await res.json()) as { peticiones: Array<Record<string, unknown>> };
  return datos.peticiones;
}

/** El proveedor empuja un evento al webhook del producto. */
async function empujarWebhook(
  payload: Record<string, unknown>,
  credenciales?: { usuario: string; password: string },
  /** Contrapruebas del 401: cabecera Authorization EXACTA o ninguna. */
  opciones?: { cabecera?: string; sinCabecera?: boolean },
): Promise<{ httpStatus: number; cuerpo: any; envoltorio: any }> {
  const res = await fetch(`${simuladorUrl}/_control/empujar-reserva`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: `${BASE_URL}/api/hospitality/webhook/reservations`,
      ...(credenciales ? { basicAuth: credenciales } : {}),
      ...(opciones?.cabecera !== undefined ? { cabecera: opciones.cabecera } : {}),
      ...(opciones?.sinCabecera ? { sinCabecera: true } : {}),
      ...payload,
    }),
  });
  // El control del simulador responde `{ ok, httpStatus, respuesta }`, y
  // `respuesta` es lo que contestó el producto: se devuelve ESE cuerpo, que es
  // el que el ensayo tiene que comprobar.
  const envoltorio = (await res.json().catch(() => null)) as any;
  return {
    httpStatus: envoltorio?.httpStatus ?? res.status,
    cuerpo: envoltorio?.respuesta ?? envoltorio,
    envoltorio,
  };
}

// ─── Datos del ensayo (paso 5 del onboarding: el mapping externo) ───────────

interface Fixtures {
  tenantId: string;
  tenantCreado: boolean;
  propertyId: string;
  unitId: string;
  mappingId: string;
}

async function sembrarMapping(): Promise<Fixtures> {
  let tenant = await prisma.tenant.findUnique({ where: { slug: SLUG_TENANT } });
  let tenantCreado = false;
  if (!tenant) {
    tenant = await prisma.tenant.create({
      data: {
        nombre: 'Ensayo día H (conectividad)',
        slug: SLUG_TENANT,
        moneda: 'EUR',
        plan: 'basico',
        estado: 'activo',
      },
    });
    tenantCreado = true;
  }

  const property = await prisma.hospitalityProperty.create({
    data: {
      tenantId: tenant.id,
      nombre: `${PREFIJO_E2E} Apartamentos`,
      codigo: HOTEL_CODE,
      estado: 'activa',
      timezone: 'Europe/Madrid',
    },
  });

  const unit = await prisma.hospitalityUnit.create({
    data: {
      tenantId: tenant.id,
      propertyId: property.id,
      nombre: `${PREFIJO_E2E} 101`,
      codigo: `${HOTEL_CODE}-${ROOM_CODE}`,
      moneda: 'EUR',
      estado: 'available',
    },
  });

  const mapping = await prisma.connectivityMapping.create({
    data: {
      tenantId: tenant.id,
      propertyId: property.id,
      unitId: unit.id,
      provider: 'channel_connectivity',
      externalPropertyId: HOTEL_CODE,
      externalUnitCode: ROOM_CODE,
      externalRatePlanCode: RATEPLAN_CODE,
      estado: 'activo',
    },
  });

  return { tenantId: tenant.id, tenantCreado, propertyId: property.id, unitId: unit.id, mappingId: mapping.id };
}

// ─── Configuración de conectividad: se restaura tal cual estaba ─────────────

let proveedorPrevio: Awaited<ReturnType<typeof getConnectivityProvider>> | null = null;

async function snapshotProveedor(): Promise<void> {
  proveedorPrevio = await getConnectivityProvider();
}

async function restaurarProveedor(): Promise<void> {
  if (proveedorPrevio) {
    // Se reponen los valores CIFRADOS tal cual estaban: el ensayo no descifra
    // nada ni deja las credenciales del simulador en la configuración real.
    await prisma.connectivityProvider.update({
      where: { id: proveedorPrevio.id },
      data: {
        partnerIdEnc: proveedorPrevio.partnerIdEnc,
        usernameEnc: proveedorPrevio.usernameEnc,
        passwordEnc: proveedorPrevio.passwordEnc,
        estado: proveedorPrevio.estado,
        ultimaSincronizacion: proveedorPrevio.ultimaSincronizacion,
        ultimoEvento: proveedorPrevio.ultimoEvento,
        ultimaVerificacion: proveedorPrevio.ultimaVerificacion,
        contadorErrores: proveedorPrevio.contadorErrores,
      },
    });
    info('Configuración de conectividad anterior restaurada');
  } else {
    await prisma.connectivityProvider.deleteMany({ where: { providerKey: CONNECTIVITY_PROVIDER_KEY } });
    info('No había configuración de conectividad: se deja como estaba (sin fila)');
  }
}

// ─── Limpieza ───────────────────────────────────────────────────────────────

/**
 * Borra SOLO lo que crea el ensayo: reservas con el prefijo de booking del
 * ensayo, eventos del hotel del ensayo, el mapping, la unidad y la propiedad
 * del ensayo, y el tenant si lo creó el ensayo. Un tenant preexistente no se
 * toca (y sus reservas tampoco).
 */
async function limpiar(fixtures: Fixtures | null): Promise<void> {
  try {
    const tenantId = fixtures?.tenantId ?? '';
    if (tenantId) {
      const reservas = await prisma.hospitalityReservation.findMany({
        where: { tenantId, externalBookingId: { startsWith: PREFIJO_E2E } },
        select: { id: true },
      });
      const ids = reservas.map((r) => r.id);
      if (ids.length > 0) {
        await prisma.hospitalityWebhookEvent.deleteMany({ where: { reservationId: { in: ids } } });
        await prisma.hospitalityTraveler.deleteMany({ where: { reservationId: { in: ids } } });
        await prisma.hospitalityReservation.deleteMany({ where: { id: { in: ids } } });
      }
      await prisma.hospitalityWebhookEvent.deleteMany({ where: { hotelCode: HOTEL_CODE } });
      await prisma.contact.deleteMany({ where: { tenantId, email: EMAIL_HUESPED } });

      await prisma.connectivityMapping.deleteMany({ where: { tenantId, externalPropertyId: HOTEL_CODE } });
      await prisma.hospitalityUnit.deleteMany({
        where: { tenantId, codigo: { startsWith: HOTEL_CODE } },
      });
      await prisma.hospitalityProperty.deleteMany({ where: { tenantId, codigo: HOTEL_CODE } });
      if (fixtures?.tenantCreado) {
        await prisma.tenant.deleteMany({ where: { id: tenantId, slug: SLUG_TENANT } });
      }
    }
    info('Datos del ensayo borrados');
  } catch (error: any) {
    console.log(`  ${AMARILLO}⚠${NC}  La limpieza falló: ${error?.message || error}`);
  }
}

// ─── Ensayo ─────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  cabecera('Prerrequisitos');
  if (process.env.E2E_DIA_H !== '1') {
    console.log(
      `${AMARILLO}Ensayo desactivado:${NC} escribe en la base de datos a la que apunte DATABASE_URL.\n` +
        'Si es lo que quieres ahora: E2E_DIA_H=1 (usa el lanzador: npm run test:e2e:dia-h).',
    );
    process.exit(2);
  }
  const urlDb = process.env.DATABASE_URL || '';
  info(`Base de datos: ${urlDb.replace(/\/\/[^@]*@/, '//***@').split('?')[0]}`);
  info(`Producto: ${BASE_URL}`);
  const salud = await fetch(`${BASE_URL}/api/public/booking/__preflight__`).catch(() => null);
  if (!salud) {
    console.log(`${ROJO}El producto no responde en ${BASE_URL}.${NC} Levanta el servidor con el lanzador.`);
    process.exit(1);
  }

  let fixtures: Fixtures | null = null;
  try {
    cabecera('1. Simulador del proveedor');
    simuladorUrl = await levantarSimulador();
    exito(`Simulador en ${simuladorUrl}`);

    cabecera('2. Preflight de la respuesta del proveedor (bloqueo A del runbook)');
    const revision = preflightConectividad({ ...CLAVES, baseUrl: simuladorUrl, exigirTodo: true });
    comprobar(revision.ok, 'La respuesta del proveedor pasa el preflight', revision.bloqueantes);
    comprobar(
      revision.urlContrato === `${simuladorUrl}/api/v2/cm`,
      'La URL del contrato es la que usará el adapter (se le añade el prefijo solo)',
      { urlContrato: revision.urlContrato, esperado: `${simuladorUrl}/api/v2/cm` },
    );

    const pegaConEspacio = preflightConectividad({
      ...CLAVES,
      password: `${CLAVES.password} `,
      baseUrl: simuladorUrl,
      exigirTodo: true,
    });
    comprobar(
      !pegaConEspacio.ok && pegaConEspacio.bloqueantes.some((a) => a.campo === 'password'),
      'Contraprueba: el espacio de más en la contraseña se rechaza antes de guardar (el 401 que no se ve)',
      pegaConEspacio.bloqueantes,
    );

    const pegaConUsuarioYClave = preflightConectividad({
      ...CLAVES,
      username: `${CLAVES.username}:${CLAVES.password}`,
      password: '',
      baseUrl: simuladorUrl,
      exigirTodo: true,
    });
    comprobar(
      pegaConUsuarioYClave.ok && pegaConUsuarioYClave.valores.password === CLAVES.password,
      'Contraprueba: «usuario:contraseña» pegado junto se separa solo',
      pegaConUsuarioYClave.bloqueantes,
    );

    cabecera('3. Configuración y catálogo (property_details)');
    // EL SNAPSHOT VA ANTES DEL PRIMER GUARDADO. Sin él, la restauración final
    // no tenía nada que restaurar y el ensayo dejaba las credenciales del
    // simulador (y su partnerId) en la configuración real de producción.
    // Falló en producción el 2026-09-28: quedó el partnerId del simulador y la
    // conectividad real dejó de llamar al proveedor. Desde aquí, snapshot
    // SIEMPRE precede al primer saveConnectivityConfig.
    await snapshotProveedor();
    exito('Configuración previa guardada para restaurarla al final (snapshot)');
    process.env.CONNECTIVITY_BASE_URL = revision.urlContrato!;
    const guardado = await saveConnectivityConfig(CLAVES);
    comprobar(guardado.ok && guardado.configurado, 'Credenciales guardadas y completas', guardado);

    const conexion = await testConnectivityConnection(HOTEL_CODE);
    comprobar(conexion.ok, 'property_details responde (Basic Auth correcto)', conexion.error);
    const habitaciones = conexion.property?.rooms ?? [];
    comprobar(
      habitaciones.length > 0 && (habitaciones[0].rateplans ?? []).length > 0,
      'El catálogo trae habitaciones con planes de tarifa (lo que el mapping necesita)',
      habitaciones.map((h) => ({ room: h.room_id, planes: (h.rateplans ?? []).map((p) => p.rateplan_id) })),
    );
    const recibidas = await peticionesDelSimulador();
    comprobar(
      recibidas.some((p) => String(p.ruta).includes('property_details') && p.httpStatus === 200 && p.authOk === true),
      'El simulador registró la llamada con Basic Auth',
    );

    cabecera('4. Mapping externo (paso 5 del onboarding)');
    fixtures = await sembrarMapping();
    exito(`Mapping ${HOTEL_CODE} · ${ROOM_CODE} · ${RATEPLAN_CODE} creado`);

    cabecera('5. Push de inventario y tarifas');
    const hoy = new Date();
    const desde = new Date(hoy.getTime() + 86_400_000).toISOString().slice(0, 10);
    const hasta = new Date(hoy.getTime() + 7 * 86_400_000).toISOString().slice(0, 10);

    const pushInv = await pushInventory(HOTEL_CODE, [
      { startDate: desde, endDate: hasta, rooms: [{ roomCode: ROOM_CODE, available: 3 }] },
    ]);
    comprobar(pushInv.ok, 'Push de inventario aceptado por el proveedor', pushInv);

    const pushTar = await pushRates(HOTEL_CODE, [
      {
        startDate: desde,
        endDate: hasta,
        rates: [{ roomCode: ROOM_CODE, rateplanCode: RATEPLAN_CODE, rate: 1749 }],
      },
    ]);
    comprobar(pushTar.ok, 'Push de tarifas aceptado por el proveedor', pushTar);

    const peticionesPush = await peticionesDelSimulador();
    const inventarioRecibido = peticionesPush.find((p) => String(p.ruta).includes('/update/'));
    const tarifasRecibidas = peticionesPush.find((p) => String(p.ruta).includes('/update-rates/'));
    comprobar(
      inventarioRecibido?.hotelCode === HOTEL_CODE && inventarioRecibido?.partnerId === CLAVES.partnerId,
      'El inventario llegó con el hotel y el partner id correctos',
      { hotelCode: inventarioRecibido?.hotelCode, partnerId: inventarioRecibido?.partnerId },
    );
    comprobar(tarifasRecibidas !== undefined, 'El push de tarifas llegó al simulador');

    cabecera('6. Contraprueba: credenciales que no valen se ven');
    await saveConnectivityConfig({ password: `${CLAVES.password}-mal` });
    const pushMalo = await pushInventory(HOTEL_CODE, [
      { startDate: desde, endDate: hasta, rooms: [{ roomCode: ROOM_CODE, available: 1 }] },
    ]);
    comprobar(
      !pushMalo.ok && pushMalo.httpStatus === 401,
      'Con la contraseña equivocada el fallo es visible (401), no un silencio',
      pushMalo,
    );
    await saveConnectivityConfig({ password: CLAVES.password });

    cabecera('7. El proveedor empuja una reserva (book)');
    const huéspedMalo = await empujarWebhook(
      buildTestReservationPayload({
        hotelCode: HOTEL_CODE,
        roomCode: ROOM_CODE,
        rateplanCode: RATEPLAN_CODE,
        moneda: 'EUR',
        sufijo: 'auth-mala',
      }) as unknown as Record<string, unknown>,
      { usuario: CLAVES.username, password: 'no-es-la-clave' },
    );
    comprobar(
      huéspedMalo.httpStatus === 401,
      'Contraprueba: el webhook con Basic Auth incorrecto se rechaza (401)',
      huéspedMalo,
    );
    comprobar(
      huéspedMalo.cuerpo?.diagnostico?.motivo === 'credenciales_no_coinciden',
      'Contraprueba: el 401 nombra el motivo (credenciales_no_coinciden) y las longitudes/huellas',
      huéspedMalo.cuerpo?.diagnostico,
    );

    // Contrapruebas del 401 del webhook ENTRANTE, contra el simulador real: el
    // diagnóstico que ahora vive en /admin/conectividad (motivo, longitudes,
    // huellas) tiene que salir también en el ensayo del día H, no solo en
    // producción con el proveedor delante.
    const payloadSufijo = (s: string) =>
      buildTestReservationPayload({
        hotelCode: HOTEL_CODE,
        roomCode: ROOM_CODE,
        rateplanCode: RATEPLAN_CODE,
        moneda: 'EUR',
        sufijo: s,
      }) as unknown as Record<string, unknown>;

    const sinCabecera = await empujarWebhook(payloadSufijo('sin-cabecera'), undefined, { sinCabecera: true });
    comprobar(
      sinCabecera.httpStatus === 401 && sinCabecera.cuerpo?.diagnostico?.motivo === 'sin_cabecera',
      'Contraprueba: sin cabecera Authorization → 401 con motivo sin_cabecera',
      sinCabecera.cuerpo?.diagnostico,
    );

    // Esta contraprueba SÍ crea reserva (se acepta): el bookingId lleva el
    // prefijo del ensayo y el huésped el email del ensayo para que la limpieza
    // estándar (por PREFIJO_E2E + EMAIL_HUESPED) la borre sin nada extra.
    const payloadMinusculas = {
      ...payloadSufijo('basic-minusculas'),
      bookingId: `${PREFIJO_E2E}-basic-minusculas`,
      guest: {
        firstName: 'Contraprueba',
        lastName: 'Día H',
        email: EMAIL_HUESPED,
        phone: null,
        address: { line1: 'Calle del Ensayo 1', city: 'Madrid', state: 'Madrid', country: 'ES', zipCode: '28001' },
      },
    };
    const basicMinuscula = await empujarWebhook(payloadMinusculas, undefined, {
      cabecera: `basic ${Buffer.from(`${CLAVES.username}:${CLAVES.password}`).toString('base64')}`,
    });
    comprobar(
      basicMinuscula.httpStatus === 200 && basicMinuscula.cuerpo?.success === true,
      'Contraprueba: `basic` en minúsculas se ACEPTA (RFC 7235), no se castiga con 401',
      basicMinuscula.cuerpo,
    );

    const bearer = await empujarWebhook(payloadSufijo('bearer'), undefined, {
      cabecera: 'Bearer abc.def.ghi',
    });
    comprobar(
      bearer.httpStatus === 401 && bearer.cuerpo?.diagnostico?.motivo === 'esquema_no_basic' && bearer.cuerpo?.diagnostico?.esquema === 'bearer',
      'Contraprueba: otro esquema (Bearer) → 401 con motivo esquema_no_basic y el esquema visto',
      bearer.cuerpo?.diagnostico,
    );

    const payload = buildTestReservationPayload({
      hotelCode: HOTEL_CODE,
      roomCode: ROOM_CODE,
      rateplanCode: RATEPLAN_CODE,
      noches: 3,
      moneda: 'EUR',
      sufijo: 'principal',
    });
    payload.bookingId = BOOKING_ID;
    payload.guest = {
      firstName: 'Lucía',
      lastName: 'Ensayo',
      email: EMAIL_HUESPED,
      phone: null,
      address: { line1: 'Calle del Ensayo 1', city: 'Madrid', state: 'Madrid', country: 'ES', zipCode: '28001' },
    };

    const empujada = await empujarWebhook(payload as unknown as Record<string, unknown>);
    comprobar(
      empujada.httpStatus === 200 && empujada.cuerpo?.success === true,
      'El webhook book entra en el producto',
      empujada.cuerpo,
    );
    comprobar(
      empujada.cuerpo?.status === 'creada',
      'La reserva se crea (status que devuelve el producto)',
      empujada.cuerpo,
    );

    const reserva = await prisma.hospitalityReservation.findFirst({
      where: { tenantId: fixtures.tenantId, externalBookingId: BOOKING_ID },
    });
    comprobar(reserva !== null, 'La reserva está en la base de datos del hotel');
    comprobar(reserva?.estado === 'confirmed', 'Queda confirmada', reserva?.estado);
    comprobar(reserva?.unitId === fixtures.unitId, 'Se alojó en la unidad del mapping', {
      unitId: reserva?.unitId,
    });
    comprobar(reserva?.amountAfterTax === 3000, 'Importe del proveedor respetado (3 noches × 1000)', {
      amountAfterTax: reserva?.amountAfterTax,
    });
    comprobar(reserva?.currency === 'EUR', 'Divisa del proveedor respetada', reserva?.currency);
    // El enlace de check-in se acuña cuando hace falta (comunicación de
    // pre-llegada o apertura del formulario), no al crear: es la misma función
    // que usa el producto, así que esta comprobación es la real.
    const token = await asegurarTokenCheckin({ id: reserva!.id, tokenCheckin: reserva?.tokenCheckin ?? null });
    comprobar(typeof token === 'string' && token.length > 0, 'El huésped tiene token de check-in');

    const enlace = await fetch(`${BASE_URL}/api/public/checkin/${token}`);
    comprobar(enlace.status === 200, 'El enlace de check-in del huésped responde 200', enlace.status);

    cabecera('8. Idempotencia, modify, cancel y reconciliación');
    const repetida = await empujarWebhook(payload as unknown as Record<string, unknown>);
    comprobar(repetida.cuerpo?.status === 'duplicado', 'Repetir el book no duplica: lo detecta', repetida.cuerpo);
    const cuantas = await prisma.hospitalityReservation.count({
      where: { tenantId: fixtures.tenantId, externalBookingId: BOOKING_ID },
    });
    comprobar(cuantas === 1, 'Sigue habiendo UNA reserva para ese bookingId', cuantas);

    // `modify` = estado completo nuevo: el proveedor manda la estancia entera.
    const salidaNueva = new Date(new Date(`${payload.checkin}T00:00:00Z`).getTime() + 4 * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const modificado = { ...payload, action: 'modify', checkout: salidaNueva };
    const modRes = await empujarWebhook(modificado as unknown as Record<string, unknown>);
    comprobar(modRes.cuerpo?.status === 'actualizada', 'modify actualiza la estancia', modRes.cuerpo);
    const trasModify = await prisma.hospitalityReservation.findFirst({
      where: { tenantId: fixtures.tenantId, externalBookingId: BOOKING_ID },
    });
    comprobar(
      trasModify?.checkOut.toISOString().slice(0, 10) === salidaNueva,
      'La nueva fecha de salida es la que mandó el proveedor',
      { checkOut: trasModify?.checkOut.toISOString().slice(0, 10), esperado: salidaNueva },
    );

    const traidas = await fetchReservations(HOTEL_CODE, desde, hasta);
    comprobar(
      traidas.ok && (traidas.reservas ?? []).some((r) => r.bookingId === BOOKING_ID),
      'La reconciliación recupera la reserva del proveedor',
      { ok: traidas.ok, devueltas: traidas.reservas?.length, error: traidas.error },
    );

    // no_show ENTRANTE (regla 7 del plan): el proveedor reporta que el huésped
    // no se presentó. El motor marca el estado con el vocabulario único y emite
    // la penalización con el MISMO emisor que el PATCH del operador (regla 8);
    // la respuesta trae cómo quedó el cargo (emitida/importe/motivo).
    const noShowRes = await empujarWebhook({ ...payload, action: 'no_show' } as unknown as Record<string, unknown>);
    comprobar(
      noShowRes.cuerpo?.status === 'actualizada' && noShowRes.cuerpo?.penalizacion !== undefined,
      'no_show marca la reserva y responde cómo quedó la penalización',
      noShowRes.cuerpo,
    );
    const trasNoShow = await prisma.hospitalityReservation.findFirst({
      where: { tenantId: fixtures.tenantId, externalBookingId: BOOKING_ID },
    });
    comprobar(trasNoShow?.estado === 'no_show', 'Estado no_show en la base de datos', trasNoShow?.estado);

    const cancelada = await empujarWebhook({ ...payload, action: 'cancel' } as unknown as Record<string, unknown>);
    comprobar(cancelada.cuerpo?.status === 'cancelada', 'cancel deja la reserva cancelada', cancelada.cuerpo);
    const trasCancel = await prisma.hospitalityReservation.findFirst({
      where: { tenantId: fixtures.tenantId, externalBookingId: BOOKING_ID },
    });
    comprobar(trasCancel?.estado === 'cancelled', 'Estado final en la base de datos', trasCancel?.estado);

    cabecera('9. Estado final de la conectividad');
    const estadoFinal = await getConnectivityProvider();
    comprobar(estadoFinal?.estado === 'conectado', 'El producto marca la conectividad como conectada', {
      estado: estadoFinal?.estado,
    });
    comprobar(
      (estadoFinal?.contadorErrores ?? 0) >= 0 && estadoFinal?.ultimoEvento != null,
      'El último evento del proveedor queda registrado',
      { ultimoEvento: estadoFinal?.ultimoEvento },
    );
  } finally {
    cabecera('Limpieza');
    if (CONSERVAR) {
      console.log(`  ${AMARILLO}--keep:${NC} los datos del ensayo se quedan (tenant ${SLUG_TENANT}).`);
      console.log('  Una corrida posterior sin --keep vuelve a limpiar por el prefijo E2E-DIA-H.');
    } else {
      await limpiar(fixtures);
      await restaurarProveedor();
    }
    simulador?.kill('SIGTERM');
    await esperar(200);
    await prisma.$disconnect();
  }

  cabecera('Resultado');
  console.log(`  ${pasos - fallos}/${pasos} comprobaciones en verde`);
  if (fallos > 0) {
    console.log(`  ${ROJO}${fallos} fallo(s)${NC}`);
    process.exit(1);
  }
  console.log(`  ${VERDE}Día H ensayado de punta a punta contra el simulador.${NC}`);
}

main().catch(async (error) => {
  console.error(`\n${ROJO}El ensayo se rompió:${NC} ${error?.stack || error}`);
  simulador?.kill('SIGTERM');
  await prisma.$disconnect().catch(() => {});
  process.exit(1);
});
