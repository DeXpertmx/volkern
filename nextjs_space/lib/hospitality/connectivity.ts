import { prisma } from '@/lib/db';
import { encrypt, decrypt } from '@/lib/core/crypto';

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
 * URL del servicio de conectividad (solo uso interno del adapter).
 * Se lee de variable de entorno para que el nombre del proveedor nunca
 * aparezca en el código fuente ni en la UI.
 */
export function getConnectivityBaseUrl(): string {
  const url = process.env.CONNECTIVITY_BASE_URL;
  if (!url) {
    throw new Error(
      '[Conectividad] CONNECTIVITY_BASE_URL no configurada: sin ella no se puede llamar al servicio de conectividad.'
    );
  }
  return url;
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
      contadorErrores: 0,
    };
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
    contadorErrores: provider.contadorErrores,
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
 * ignoran (no borran lo existente); usa null explícito para limpiar.
 */
export async function saveConnectivityConfig(input: {
  partnerId?: string;
  username?: string;
  password?: string;
  estado?: ConnectivityEstado;
}): Promise<{ ok: true; configurado: boolean }> {
  const existing = await getConnectivityProvider();

  const data: any = {
    nombreVisible: CONNECTIVITY_PROVIDER_NOMBRE,
    fechaEdicion: new Date(),
  };

  if (input.estado !== undefined) data.estado = input.estado;
  if (input.partnerId !== undefined && input.partnerId !== '') {
    data.partnerIdEnc = encrypt(input.partnerId.trim());
  }
  if (input.username !== undefined && input.username !== '') {
    data.usernameEnc = encrypt(input.username.trim());
  }
  if (input.password !== undefined && input.password !== '') {
    data.passwordEnc = encrypt(input.password.trim());
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
 * Marca estado y contadores del proveedor (errores, última sincronización).
 */
export async function updateConnectivityStatus(input: {
  estado?: ConnectivityEstado;
  ultimaSincronizacion?: Date;
  ultimoEvento?: Date;
  error?: boolean;
  resetErrores?: boolean;
}) {
  const provider = await getConnectivityProvider();
  if (!provider) return null;

  const data: any = { fechaEdicion: new Date() };
  if (input.estado !== undefined) data.estado = input.estado;
  if (input.ultimaSincronizacion !== undefined) data.ultimaSincronizacion = input.ultimaSincronizacion;
  if (input.ultimoEvento !== undefined) data.ultimoEvento = input.ultimoEvento;
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

  const code = (hotelCode && hotelCode.trim()) || CONNECTIVITY_SANDBOX_HOTEL;
  const baseUrl = getConnectivityBaseUrl();
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

  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = await res.text().catch(() => null);
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

export interface PushResult {
  ok: boolean;
  tipo: 'inventory' | 'rates';
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
 * Lee el cuerpo de una respuesta (JSON preferido, texto como fallback).
 */
async function readBody(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return await res.text().catch(() => null);
  }
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