import { prisma } from '@/lib/db';
import { encrypt, decrypt } from '@/lib/core/crypto';
import { TIPOS_SYNC_CONECTIVIDAD, type FalloConectividad } from './conectividad-causa';
import { sanitizarRespuestaExterna } from './conectividad-secreto';
// Último rechazo del webhook entrante (401): normalización pura para
// persistirlo y para exponerlo ya legible al panel.
import {
  rechazoDesdeDiagnostico,
  rechazoLegible,
  type RechazoLegible,
} from './conectividad-rechazo';
import {
  preflightConectividad,
  resumenPreflight,
  type AvisoPreflight,
} from './connectivity-preflight';

/**
 * Capa de Conectividad de Canales (Hospitality).
 *
 * Abstracción interna sobre el proveedor de conectividad que sincroniza
 * inventario, tarifas y reservas con los canales de distribución (OTAs).
 *
 * REGLA DE MARCA: el nombre del proveedor externo NO debe aparecer en la UI,
 * correos, PDFs ni ningún texto visible al cliente. En el producto se llama
 * "Conectividad de Canales". El nombre técnico y la URL del servicio solo
 * existen dentro de este módulo y del adapter de integración.
 */

export const CONNECTIVITY_PROVIDER_KEY = 'channel_connectivity';

export const CONNECTIVITY_PROVIDER_NOMBRE = 'Conectividad de Canales';

/**
 * Prefijo de ruta del contrato de la API de conectividad (v2 / channel manager).
 * Es una ruta del contrato, no un nombre de proveedor, por eso puede vivir en
 * el código: así ningún llamador necesita conocerla.
 */
export const CONNECTIVITY_API_PREFIX = '/api/v2/cm';

/**
 * URL del servicio de conectividad (solo uso interno del adapter).
 * Se lee de variable de entorno para que el nombre del proveedor nunca
 * aparezca en el código fuente ni en la UI.
 *
 * La variable puede traer solo el host o la URL completa del contrato; si
 * falta el prefijo de la API se añade aquí. Sin este prefijo todos los
 * endpoints responden 404 desde el borde (nginx), que fue el fallo real que
 * dejó la conectividad inoperante.
 */
export function getConnectivityBaseUrl(): string {
  const url = process.env.CONNECTIVITY_BASE_URL;
  if (!url) {
    throw new Error(
      '[Conectividad] CONNECTIVITY_BASE_URL no configurada: sin ella no se puede llamar al servicio de conectividad.'
    );
  }
  const base = url.trim().replace(/\/+$/, '');
  if (!base) {
    throw new Error(
      '[Conectividad] CONNECTIVITY_BASE_URL está vacía: sin ella no se puede llamar al servicio de conectividad.'
    );
  }
  return base.endsWith(CONNECTIVITY_API_PREFIX) ? base : `${base}${CONNECTIVITY_API_PREFIX}`;
}

export type ConnectivityEstado =
  | 'sin_configurar'
  | 'configurado'
  | 'conectado'
  | 'error';

export interface ConnectivityCredentials {
  partnerId: string;
  username: string;
  password: string;
}

/**
 * Devuelve la fila del proveedor de conectividad o null si nunca se configuró.
 */
export async function getConnectivityProvider() {
  return prisma.connectivityProvider.findUnique({
    where: { providerKey: CONNECTIVITY_PROVIDER_KEY },
  });
}

/**
 * Versión pública (sanitizada) para la API admin: nunca expone secretos ni
 * la URL del servicio (revelaría el proveedor). Solo marcadores de presencia.
 */
export async function getConnectivityPublic() {
  const provider = await getConnectivityProvider();
  if (!provider) {
    return {
      configurado: false,
      estado: 'sin_configurar' as ConnectivityEstado,
      nombre: CONNECTIVITY_PROVIDER_NOMBRE,
      partnerId: '',
      username: '',
      tieneCredenciales: false,
      ultimaSincronizacion: null,
      ultimoEvento: null,
      ultimaVerificacion: null,
      contadorErrores: 0,
      // Sin configuración no puede haber fallo previo de la capa.
      ultimoFallo: null,
      // Sin configuración tampoco puede haber rechazos del webhook entrante.
      ultimoRechazo: null as RechazoLegible | null,
    };
  }

  // Último SyncLog fallido de la capa de conectividad (push/fetch): alimenta el
  // diagnóstico del badge. Campos de diagnóstico solamente — nada de payloads.
  // Si la consulta de diagnóstico falla, se degrada a null: el estado del panel
  // no puede morir por un dato auxiliar.
  let ultimoFallo: FalloConectividad | null = null;
  try {
    ultimoFallo = await prisma.hospitalitySyncLog.findFirst({
      where: { estado: 'error', tipo: { in: [...TIPOS_SYNC_CONECTIVIDAD] } },
      orderBy: { fechaCreacion: 'desc' },
      select: { httpStatus: true, errorMensaje: true, fechaCreacion: true },
    });
  } catch {
    ultimoFallo = null;
  }

  return {
    configurado: true,
    estado: (provider.estado as ConnectivityEstado) || 'configurado',
    nombre: provider.nombreVisible || CONNECTIVITY_PROVIDER_NOMBRE,
    // Solo marcadores de presencia, nunca el valor cifrado.
    partnerId: provider.partnerIdEnc ? '••••••' : '',
    username: provider.usernameEnc ? '••••••' : '',
    tieneCredenciales: !!(provider.partnerIdEnc && provider.usernameEnc && provider.passwordEnc),
    ultimaSincronizacion: provider.ultimaSincronizacion,
    ultimoEvento: provider.ultimoEvento,
    /** Última verificación activa de la capa (health-check diario o «Probar»). */
    ultimaVerificacion: provider.ultimaVerificacion ?? null,
    contadorErrores: provider.contadorErrores,
    /** Último fallo de la capa (push/fetch de conectividad), en crudo para derivar la causa en el cliente. */
    ultimoFallo: ultimoFallo,
    /** Último rechazo del webhook ENTRANTE (401), ya legible (motivo, longitudes, huellas, hora). */
    ultimoRechazo: rechazoLegible(
      (provider.configuracion as Record<string, unknown> | null)?.ultimoRechazoWebhook
    ),
  };
}

/**
 * Lee las credenciales descifradas (solo uso interno del adapter).
 * Devuelve null si no están configuradas.
 */
export async function getConnectivityCredentials(): Promise<ConnectivityCredentials | null> {
  const provider = await getConnectivityProvider();
  if (!provider || !provider.partnerIdEnc || !provider.usernameEnc || !provider.passwordEnc) {
    return null;
  }
  return {
    partnerId: decrypt(provider.partnerIdEnc),
    username: decrypt(provider.usernameEnc),
    password: decrypt(provider.passwordEnc),
  };
}

/**
 * Guarda (o actualiza) la configuración del proveedor de conectividad.
 * Cifra los secretos antes de persistir. Los campos que llegan vacíos se
 * ignoran (no borran lo existente).
 *
 * Antes de escribir pasa por el preflight: es la última puerta antes de que un
 * espacio de más, unas comillas de un PDF o un `usuario:contraseña` mal pegado
 * se conviertan en un 401 indistinguible de «credenciales inválidas». Con
 * errores no se escribe nada y se devuelven los avisos. La contraseña va
 * BYTE A BYTE (nunca se recorta): el Basic Auth se compara tal cual y
 * recortarla la convertiría en otra credencial distinta a la que mandó el
 * proveedor.
 */
export async function saveConnectivityConfig(input: {
  partnerId?: string;
  username?: string;
  password?: string;
  estado?: ConnectivityEstado;
}): Promise<{ ok: boolean; configurado: boolean; avisos?: AvisoPreflight[] }> {
  const existing = await getConnectivityProvider();

  const revision = preflightConectividad({
    partnerId: input.partnerId,
    username: input.username,
    password: input.password,
  });
  if (!revision.ok) {
    return { ok: false, configurado: false, avisos: revision.bloqueantes };
  }

  const data: any = {
    nombreVisible: CONNECTIVITY_PROVIDER_NOMBRE,
    fechaEdicion: new Date(),
  };

  if (input.estado !== undefined) data.estado = input.estado;
  // Valores normalizados por el preflight (usuario y partner id recortados,
  // contraseña intacta). Los campos que llegan vacíos se ignoran: el guardado
  // parcial sigue funcionando igual que antes.
  const { partnerId, username, password } = revision.valores;
  if (partnerId !== null && partnerId !== '') {
    data.partnerIdEnc = encrypt(partnerId);
  }
  if (username !== null && username !== '') {
    data.usernameEnc = encrypt(username);
  }
  if (password !== null && password !== '') {
    data.passwordEnc = encrypt(password);
  }

  const provider = await prisma.connectivityProvider.upsert({
    where: { providerKey: CONNECTIVITY_PROVIDER_KEY },
    create: {
      providerKey: CONNECTIVITY_PROVIDER_KEY,
      nombreVisible: CONNECTIVITY_PROVIDER_NOMBRE,
      baseUrl: getConnectivityBaseUrl(),
      partnerIdEnc: data.partnerIdEnc,
      usernameEnc: data.usernameEnc,
      passwordEnc: data.passwordEnc,
      estado: input.estado || 'configurado',
    },
    update: data,
  });

  return {
    ok: true,
    configurado: !!(provider.partnerIdEnc && provider.usernameEnc && provider.passwordEnc),
  };
}

/**
 * Borra las credenciales guardadas y devuelve el proveedor a
 * `sin_configurar`, para poder volver a introducirlas desde cero (rotación
 * del par, paso de sandbox a producción…).
 *
 * NO toca nada más: los mapeos (`ConnectivityMapping`) y el historial de
 * sincronizaciones quedan como están — reconfigurar credenciales no debe
 * perder el trabajo de vínculos ni la auditoría. Los counters de error y la
 * última sincronización sí se resetean: describen la credencial anterior.
 */
export async function resetConnectivityCredentials(): Promise<boolean> {
  const provider = await getConnectivityProvider();
  if (!provider) return true; // nada que limpiar: ya está sin configurar
  await prisma.connectivityProvider.update({
    where: { providerKey: CONNECTIVITY_PROVIDER_KEY },
    data: {
      partnerIdEnc: null,
      usernameEnc: null,
      passwordEnc: null,
      estado: 'sin_configurar',
      contadorErrores: 0,
      ultimaSincronizacion: null,
      ultimoEvento: null,
      fechaEdicion: new Date(),
    },
  });
  return true;
}

/**
 * Marca estado y contadores del proveedor (errores, última sincronización).
 */
export async function updateConnectivityStatus(input: {
  estado?: ConnectivityEstado;
  ultimaSincronizacion?: Date;
  ultimoEvento?: Date;
  error?: boolean;
  resetErrores?: boolean;
  /** Marca del health-check diario (sonda property_details) y de «Probar». */
  ultimaVerificacion?: Date;
  /**
   * Diagnóstico del 401 del webhook ENTRANTE tal como se construyó en la
   * ruta. Se persiste en `configuracion.ultimoRechazoWebhook` con su marca
   * horaria para que el panel lo muestre sin depender de los logs del
   * servicio. Solo metadatos: la pieza pura normaliza y descarta otra forma.
   */
  registroRechazo?: Record<string, unknown>;
}) {
  const provider = await getConnectivityProvider();
  if (!provider) return null;

  const data: any = { fechaEdicion: new Date() };
  if (input.registroRechazo) {
    const rechazo = rechazoDesdeDiagnostico(input.registroRechazo, new Date());
    if (rechazo) {
      data.configuracion = {
        ...((provider.configuracion as Record<string, unknown> | null) ?? {}),
        ultimoRechazoWebhook: rechazo,
      };
    }
  }
  if (input.estado !== undefined) data.estado = input.estado;
  if (input.ultimaSincronizacion !== undefined) data.ultimaSincronizacion = input.ultimaSincronizacion;
  if (input.ultimoEvento !== undefined) data.ultimoEvento = input.ultimoEvento;
  if (input.ultimaVerificacion !== undefined) data.ultimaVerificacion = input.ultimaVerificacion;
  if (input.error) data.contadorErrores = (provider.contadorErrores || 0) + 1;
  if (input.resetErrores) data.contadorErrores = 0;

  return prisma.connectivityProvider.update({
    where: { id: provider.id },
    data,
  });
}

/**
 * Construye la URL del webhook de reservas de la plataforma.
 * El proveedor llama a este endpoint con book/modify/cancel.
 */
export function buildReservationWebhookUrl(): string {
  const base = process.env.NEXTAUTH_URL || 'https://volkern.app';
  return `${base}/api/hospitality/webhook/reservations`;
}

// ─── Prueba de conexión ────────────────────────────────────────────────────

/** Hotel de prueba del sandbox documentado en el contrato. */
export const CONNECTIVITY_SANDBOX_HOTEL = 'sandbox-pms';

export interface PropertyDetailsRatePlan {
  rateplan_id: string;
  rateplan_name?: string | null;
  occupancy?: number | null;
  no_of_meals?: number | null;
  extra_adult?: number | null;
}

export interface PropertyDetailsRoom {
  room_id: string;
  room_name?: string | null;
  description?: string | null;
  count?: number | null;
  active?: boolean | null;
  type?: string | null;
  min_occ?: number | null;
  max_occ?: number | null;
  rateplans?: PropertyDetailsRatePlan[] | null;
}

export interface PropertyDetailsResponse {
  hotel_id: string;
  hotel_name?: string | null;
  property_category?: string | null;
  currency?: string | null;
  timezone?: string | null;
  tax_id?: string | null;
  address?: {
    line?: string | null;
    city?: string | null;
    state?: string | null;
    country_code?: string | null;
  } | null;
  rooms?: PropertyDetailsRoom[] | null;
}

export interface TestConnectionResult {
  ok: boolean;
  conectado?: boolean;
  error?: string;
  /** Cuerpo de la respuesta externa (el contrato exige mostrarlo en fallos). */
  respuestaExterna?: unknown;
  hotelCode?: string;
  property?: PropertyDetailsResponse | null;
}

/**
 * Prueba la conexión contra el servicio de conectividad llamando al endpoint
 * de detalle de propiedad (contrato: GET /property_details/{hotelCode}?partnerId={pms}).
 * Devuelve la configuración de la propiedad (habitaciones y planes de tarifa),
 * que es exactamente lo que se necesita para construir el mapping.
 */
export async function testConnectivityConnection(hotelCode?: string): Promise<TestConnectionResult> {
  const creds = await getConnectivityCredentials();
  if (!creds) {
    return { ok: false, error: 'Conectividad no configurada: guarda primero las credenciales en esta pantalla.' };
  }

  // Preflight de la URL antes de llamar. Sin esto, una URL mal pegada o sin
  // configurar se convierte en un error de red o en un 404 del borde, que en el
  // panel se lee como «las credenciales fallan». El mensaje dice qué arreglar.
  const revisionUrl = preflightConectividad({ baseUrl: process.env.CONNECTIVITY_BASE_URL ?? '' });
  if (!revisionUrl.ok) {
    return { ok: false, error: `URL del servicio: ${resumenPreflight(revisionUrl)}` };
  }

  const code = (hotelCode && hotelCode.trim()) || CONNECTIVITY_SANDBOX_HOTEL;
  const baseUrl = revisionUrl.urlContrato ?? getConnectivityBaseUrl();
  const url = `${baseUrl}/property_details/${encodeURIComponent(code)}?partnerId=${encodeURIComponent(creds.partnerId)}`;

  const auth = Buffer.from(`${creds.username}:${creds.password}`).toString('base64');

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      // Timeout: no colgar el panel admin esperando una respuesta externa.
      signal: AbortSignal.timeout(15000),
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Error de red';
    return { ok: false, error: `No se pudo conectar: ${msg}` };
  }

  // El cuerpo del proveedor puede reflejar el header Authorization u otros
  // secretos: se sanea antes de exponerlo (contrato: se muestra en fallos).
  let body: unknown = null;
  try {
    body = sanitizarRespuestaExterna(await res.json());
  } catch {
    body = sanitizarRespuestaExterna(await res.text().catch(() => null));
  }

  if (!res.ok) {
    return {
      ok: false,
      error: `La conexión respondió con estado ${res.status}`,
      respuestaExterna: body,
      hotelCode: code,
    };
  }

  const property = body as PropertyDetailsResponse;
  return {
    ok: true,
    conectado: true,
    hotelCode: code,
    property,
  };
}

// ─── Push de inventario y tarifas (plan maestro §15.2, contrato) ──────────

/**
 * Payload de Inventory Push (contrato): POST /update/{pms}
 * ```json
 * { "hotelCode": "...", "updates": [{
 *   "startDate": "YYYY-MM-DD", "endDate": "YYYY-MM-DD",
 *   "rooms": [{ "roomCode": "...", "available": 3 }]
 * }]}
 * ```
 */
export interface InventoryPushUpdate {
  startDate: string;
  endDate: string;
  rooms: Array<{ roomCode: string; available: number }>;
}

/**
 * Payload de Rate Push (contrato): POST /update-rates/{pms}
 * ```json
 * { "hotelCode": "...", "updates": [{
 *   "startDate": "YYYY-MM-DD", "endDate": "YYYY-MM-DD",
 *   "rates": [{ "roomCode": "...", "rateplanCode": "...", "rate": 1749 }]
 * }]}
 * ```
 */
export interface RatePushUpdate {
  startDate: string;
  endDate: string;
  rates: Array<{ roomCode: string; rateplanCode: string; rate: number }>;
}

/**
 * Campos de restricción de venta (contrato). El objeto es el MISMO para
 * restricciones de inventario (nivel habitación) y de tarifas (nivel
 * room+rateplan). Los campos opcionales se envían como `null`, nunca
 * omitidos (regla dura del contrato).
 */
export interface RestrictionFields {
  stopSell: boolean;
  exactStayArrival: number | null;
  maximumStayArrival: number | null;
  minimumAdvanceReservation: number | null;
  minimumStay: number;
  closeOnArrival: boolean;
  minimumStayArrival: number | null;
  maximumStay: number | null;
  maximumAdvanceReservation: number | null;
  closeOnDeparture: boolean;
}

/**
 * Payload de Inventory Restrictions Push (contrato): POST /update/{pms}
 * (el mismo endpoint que el inventario: las restricciones viajan por los
 * endpoints existentes).
 * ```json
 * { "hotelCode": "...", "updates": [{
 *   "startDate": "YYYY-MM-DD", "endDate": "YYYY-MM-DD",
 *   "rooms": [{ "roomCode": "SUITE", "available": 3, "restrictions": { ... } }]
 * }]}
 * ```
 */
export interface InventoryRestrictionsPushUpdate {
  startDate: string;
  endDate: string;
  rooms: Array<{ roomCode: string; available: number; restrictions: RestrictionFields }>;
}

/**
 * Payload de Rate Restrictions Push (contrato): POST /update-rates/{pms}
 * ```json
 * { "hotelCode": "...", "updates": [{
 *   "startDate": "YYYY-MM-DD", "endDate": "YYYY-MM-DD",
 *   "rates": [{ "roomCode": "EXECUTIVE", "rateplanCode": "EXECUTIVE-S-101",
 *               "restrictions": { ... } }]
 * }]}
 * ```
 */
export interface RateRestrictionsPushUpdate {
  startDate: string;
  endDate: string;
  rates: Array<{ roomCode: string; rateplanCode: string; restrictions: RestrictionFields }>;
}

export interface PushResult {
  ok: boolean;
  tipo: 'inventory' | 'rates' | 'inventory_restrictions' | 'rates_restrictions';
  httpStatus?: number;
  message?: string;
  respuestaExterna?: unknown;
  error?: string;
  duracionMs: number;
}

/**
 * Llamada HTTP genérica al servicio de conectividad (Basic Auth, JSON,
 * timeout 20s). NO hace retries ciegos: un fallo se devuelve al llamador
 * para que quede registrado (plan §30).
 */
async function connectivityFetch(
  path: string,
  body: unknown,
  creds: ConnectivityCredentials
): Promise<{ res: Response; duracionMs: number }> {
  const baseUrl = getConnectivityBaseUrl();
  const url = `${baseUrl}${path}`;
  const auth = Buffer.from(`${creds.username}:${creds.password}`).toString('base64');
  const started = Date.now();
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });
  return { res, duracionMs: Date.now() - started };
}

/**
 * Lee el cuerpo de una respuesta (JSON preferido, texto como fallback) y
 * lo SANEa antes de devolverlo: el proveedor puede reflejar el header
 * Authorization u otros secretos en sus errores, y este cuerpo acaba en
 * `HospitalitySyncLog.responseBody` (historial) y en pantallas de admin.
 * La redacción en la fuente cubre todos los consumidores de una vez.
 */
async function readBody(res: Response): Promise<unknown> {
  let cuerpo: unknown;
  try {
    cuerpo = await res.json();
  } catch {
    cuerpo = await res.text().catch(() => null);
  }
  return sanitizarRespuestaExterna(cuerpo);
}

/**
 * Inventory Push — POST /update/{pms} (upsert por rango).
 * Verifica el campo `success` de la respuesta; expone `message` en fallos.
 */
export async function pushInventory(
  hotelCode: string,
  updates: InventoryPushUpdate[]
): Promise<PushResult> {
  const started = Date.now();
  try {
    const creds = await getConnectivityCredentials();
    if (!creds) {
      return { ok: false, tipo: 'inventory', error: 'Conectividad no configurada.', duracionMs: 0 };
    }
    const body = { hotelCode, updates };
    const { res, duracionMs } = await connectivityFetch(
      `/update/${encodeURIComponent(creds.partnerId)}`,
      body,
      creds
    );
    const respuestaExterna = await readBody(res);
    const success =
      typeof respuestaExterna === 'object' &&
      respuestaExterna !== null &&
      (respuestaExterna as any).success === true;

    if (!res.ok || !success) {
      const message =
        (respuestaExterna as any)?.message || `HTTP ${res.status}`;
      return {
        ok: false,
        tipo: 'inventory',
        httpStatus: res.status,
        message,
        respuestaExterna,
        error: message,
        duracionMs,
      };
    }
    return {
      ok: true,
      tipo: 'inventory',
      httpStatus: res.status,
      message: (respuestaExterna as any)?.message,
      respuestaExterna,
      duracionMs,
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Error de red';
    return { ok: false, tipo: 'inventory', error: msg, duracionMs: Date.now() - started };
  }
}

// ─── Fetch de reservas (plan maestro §14, contrato) ───────────────────────

/**
 * Payload de Fetch Reservations (contrato): POST /data/{pms}
 * ```json
 * { "type": "reservation", "hotelCode": "...", "startDate": "YYYY-MM-DD", "endDate": "YYYY-MM-DD" }
 * ```
 * Respuesta: array de reservas con el mismo shape que el webhook Book
 * (action, bookingId, cmBookingId, checkin, checkout, guest, rooms...).
 */
export interface FetchReservationsResult {
  ok: boolean;
  /** Reservas devueltas por el proveedor (mismo shape que el webhook Book). */
  reservas?: Array<Record<string, unknown>>;
  httpStatus?: number;
  message?: string;
  respuestaExterna?: unknown;
  error?: string;
  duracionMs: number;
}

/**
 * Fetch Reservations — POST /data/{pms} con `type: "reservation"`.
 * Consulta las reservas recibidas vía OTAs para un hotel y rango de fechas.
 * Se usa por la reconciliación (§14). NO hace retries ciegos.
 */
export async function fetchReservations(
  hotelCode: string,
  startDate: string,
  endDate: string
): Promise<FetchReservationsResult> {
  const started = Date.now();
  try {
    const creds = await getConnectivityCredentials();
    if (!creds) {
      return { ok: false, error: 'Conectividad no configurada.', duracionMs: 0 };
    }
    const body = { type: 'reservation', hotelCode, startDate, endDate };
    const { res, duracionMs } = await connectivityFetch(
      `/data/${encodeURIComponent(creds.partnerId)}`,
      body,
      creds
    );
    const respuestaExterna = await readBody(res);

    if (!res.ok) {
      const message = (respuestaExterna as any)?.message || `HTTP ${res.status}`;
      return {
        ok: false,
        httpStatus: res.status,
        message,
        respuestaExterna,
        error: message,
        duracionMs,
      };
    }

    const reservas = Array.isArray(respuestaExterna)
      ? (respuestaExterna as Array<Record<string, unknown>>)
      : typeof respuestaExterna === 'object' && respuestaExterna !== null && Array.isArray((respuestaExterna as any).data)
        ? ((respuestaExterna as any).data as Array<Record<string, unknown>>)
        : null;

    if (!reservas) {
      return {
        ok: false,
        httpStatus: res.status,
        message: 'La respuesta no contiene un array de reservas',
        respuestaExterna,
        error: 'La respuesta no contiene un array de reservas',
        duracionMs,
      };
    }

    return { ok: true, reservas, httpStatus: res.status, duracionMs };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Error de red';
    return { ok: false, error: msg, duracionMs: Date.now() - started };
  }
}

/**
 * Rate Push — POST /update-rates/{pms} (los rangos se expanden a tarifas
 * diarias por el proveedor). Verifica `success`; expone `message` en fallos.
 */
export async function pushRates(
  hotelCode: string,
  updates: RatePushUpdate[]
): Promise<PushResult> {
  const started = Date.now();
  try {
    const creds = await getConnectivityCredentials();
    if (!creds) {
      return { ok: false, tipo: 'rates', error: 'Conectividad no configurada.', duracionMs: 0 };
    }
    const body = { hotelCode, updates };
    const { res, duracionMs } = await connectivityFetch(
      `/update-rates/${encodeURIComponent(creds.partnerId)}`,
      body,
      creds
    );
    const respuestaExterna = await readBody(res);
    const success =
      typeof respuestaExterna === 'object' &&
      respuestaExterna !== null &&
      (respuestaExterna as any).success === true;

    if (!res.ok || !success) {
      const message = (respuestaExterna as any)?.message || `HTTP ${res.status}`;
      return {
        ok: false,
        tipo: 'rates',
        httpStatus: res.status,
        message,
        respuestaExterna,
        error: message,
        duracionMs,
      };
    }
    return {
      ok: true,
      tipo: 'rates',
      httpStatus: res.status,
      message: (respuestaExterna as any)?.message,
      respuestaExterna,
      duracionMs,
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Error de red';
    return { ok: false, tipo: 'rates', error: msg, duracionMs: Date.now() - started };
  }
}

/**
 * POST genérico a la capa de conectividad para restricciones. Verifica el
 * campo `success` de la respuesta y expone `message` en fallos. NO hace
 * retries ciegos: el fallo vuelve al llamador para quedar registrado (§30).
 */
async function postConnectivityUpdate(
  endpoint: '/update' | '/update-rates',
  hotelCode: string,
  updates: unknown[],
  tipo: PushResult['tipo']
): Promise<PushResult> {
  const started = Date.now();
  try {
    const creds = await getConnectivityCredentials();
    if (!creds) {
      return { ok: false, tipo, error: 'Conectividad no configurada.', duracionMs: 0 };
    }
    const { res, duracionMs } = await connectivityFetch(
      `${endpoint}/${encodeURIComponent(creds.partnerId)}`,
      { hotelCode, updates },
      creds
    );
    const respuestaExterna = await readBody(res);
    const success =
      typeof respuestaExterna === 'object' &&
      respuestaExterna !== null &&
      (respuestaExterna as any).success === true;

    if (!res.ok || !success) {
      const message = (respuestaExterna as any)?.message || `HTTP ${res.status}`;
      return {
        ok: false,
        tipo,
        httpStatus: res.status,
        message,
        respuestaExterna,
        error: message,
        duracionMs,
      };
    }
    return {
      ok: true,
      tipo,
      httpStatus: res.status,
      message: (respuestaExterna as any)?.message,
      respuestaExterna,
      duracionMs,
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Error de red';
    return { ok: false, tipo, error: msg, duracionMs: Date.now() - started };
  }
}

/**
 * Inventory Restrictions Push — POST /update/{pms} (plan maestro §5).
 * Restricciones a nivel de tipo de habitación: `stopSell` cuando el tipo
 * entero está fuera de servicio y la restricción de estancia más permisiva
 * entre los planes activos. Incluye `available` porque el contrato lo exige
 * en este payload.
 */
export async function pushInventoryRestrictions(
  hotelCode: string,
  updates: InventoryRestrictionsPushUpdate[]
): Promise<PushResult> {
  return postConnectivityUpdate('/update', hotelCode, updates, 'inventory_restrictions');
}

/**
 * Rate Restrictions Push — POST /update-rates/{pms} (plan maestro §5).
 * Restricciones por (roomCode, rateplanCode): estancia mínima/máxima y
 * cierre de llegada/salida por día de la semana.
 */
export async function pushRateRestrictions(
  hotelCode: string,
  updates: RateRestrictionsPushUpdate[]
): Promise<PushResult> {
  return postConnectivityUpdate('/update-rates', hotelCode, updates, 'rates_restrictions');
}