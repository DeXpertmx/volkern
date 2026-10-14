import { prisma } from '@/lib/db';
import { encrypt, decrypt } from '@/lib/core/crypto';
import {
  causaDeFalloConectividad,
  TIPOS_SYNC_CONECTIVIDAD,
  type FalloConectividad,
} from './conectividad-causa';
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
      completo: false,
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
    // «Tiene credenciales» = hay ALGO guardado: el guardado parcial permite
    // introducir el par Basic sin el ID de socio y añadirlo después.
    tieneCredenciales: !!(provider.partnerIdEnc || provider.usernameEnc || provider.passwordEnc),
    // «Completo» = los TRES secretos: lo que necesita la capa para llamar.
    completo: !!(provider.partnerIdEnc && provider.usernameEnc && provider.passwordEnc),
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
 * ID de socio (partner id) PROPIO del cliente, ya descifrado.
 *
 * El proveedor emite un partner id al registrarse cada hotel: es la clave con
 * la que se piden SUS propiedades (`?partnerId=`) y con la que se empuja su
 * inventario. Devuelve null cuando el cliente no tiene el suyo, y entonces
 * manda el de la fila de plataforma.
 *
 * `activo: false` se lee igual que «no lo tiene»: es la forma de retirarlo sin
 * borrar el valor.
 */
export async function getTenantPartnerId(tenantId?: string | null): Promise<string | null> {
  const id = (tenantId ?? '').trim();
  if (!id) return null;

  const config = await prisma.hospitalityConnectivityConfig.findUnique({
    where: { tenantId: id },
    select: { partnerIdEnc: true, activo: true },
  });
  if (!config || !config.activo || !config.partnerIdEnc) return null;

  const descifrado = decrypt(config.partnerIdEnc);
  if (!descifrado) return null;

  // `decrypt` es tolerante por diseño: si el valor no está en el formato
  // cifrado —o la clave de cifrado cambió— devuelve el texto tal cual. Un valor
  // así viaja al proveedor y vuelve como 403 «partner desconocido»: un fallo
  // mudo que dejaría a ese hotel sin ver sus propiedades. Se valida con el
  // MISMO preflight que la entrada y, si no lo pasa, se cae al ID de
  // plataforma en vez de condenarlo.
  const revision = preflightConectividad({ partnerId: descifrado });
  if (!revision.ok) {
    console.warn(
      '[Conectividad] El ID de socio guardado del cliente no tiene un formato válido; se usa el de plataforma.'
    );
    return null;
  }
  return revision.valores.partnerId ?? null;
}

/**
 * Lee las credenciales descifradas (solo uso interno del adapter).
 * Devuelve null si no están configuradas.
 *
 * El par Basic (usuario y contraseña) es de la plataforma para todos los
 * clientes; el **partner id es lo único que puede ser del cliente**: si tiene
 * el suyo, gana; si no, se usa el de la fila de plataforma —el comportamiento
 * que había antes de existir el ID por cliente—. Sin `tenantId` (llamadas de
 * plataforma: health-check, panel admin) se usa siempre el de plataforma.
 */
export async function getConnectivityCredentials(
  tenantId?: string | null
): Promise<ConnectivityCredentials | null> {
  const provider = await getConnectivityProvider();
  if (!provider || !provider.usernameEnc || !provider.passwordEnc) {
    return null;
  }

  const partnerId =
    (await getTenantPartnerId(tenantId)) ??
    (provider.partnerIdEnc ? decrypt(provider.partnerIdEnc) : null);
  if (!partnerId) return null;

  return {
    partnerId,
    username: decrypt(provider.usernameEnc),
    password: decrypt(provider.passwordEnc),
  };
}

/**
 * Lee el par Basic de plataforma SIN exigir ID de socio.
 *
 * Lo pide el webhook ENTRANTE: ahí el proveedor nos llama a nosotros, así que
 * se autentica con usuario y contraseña y el ID de socio no participa —el
 * hotel sale del mapeo `hotelCode`/`roomCode` → propiedad—. Exigirlo dejaba el
 * webhook en 503, y con él fuera LAS RESERVAS DE TODOS LOS HOTELES, en cuanto
 * el ID de socio viviera solo en cada hotel, que es como debe vivir.
 */
export async function getConnectivityBasicAuth(): Promise<{
  username: string;
  password: string;
} | null> {
  const provider = await getConnectivityProvider();
  if (!provider?.usernameEnc || !provider?.passwordEnc) return null;
  return {
    username: decrypt(provider.usernameEnc),
    password: decrypt(provider.passwordEnc),
  };
}

/**
 * ¿La plataforma tiene par Basic pero NO un ID de socio propio?
 *
 * Es el estado normal cuando el ID de socio es de cada hotel: la plataforma
 * guarda el par Basic (compartido por todos) y cada hotel el suyo. Lo que NO
 * puede pasar en ese estado es que algo de plataforma lo lea como «sin
 * configurar» o como error: no falta nada, simplemente la sonda de plataforma
 * no aplica.
 *
 * Es una función pura sobre la fila ya leída: quien la llama no paga una
 * segunda consulta, y la regla vive en un solo sitio (health-check, prueba del
 * panel admin) en vez de repetida en cada consumidor.
 */
export function partnerIdEsDeCadaHotel(
  provider:
    | { partnerIdEnc?: string | null; usernameEnc?: string | null; passwordEnc?: string | null }
    | null
    | undefined
): boolean {
  return !!provider && !provider.partnerIdEnc && !!provider.usernameEnc && !!provider.passwordEnc;
}

/**
 * Guarda (o borra) el ID de socio del cliente.
 *
 * Pasa por el MISMO preflight que el guardado de plataforma: un espacio de más
 * o unas comillas pegadas de un PDF se convertirían aquí en un 403 «partner
 * desconocido», indistinguible de estar usando el id de otro hotel. `null` o
 * vacío borra el valor y devuelve al cliente al ID de plataforma.
 */
export async function saveTenantPartnerId(
  tenantId: string,
  partnerId?: string | null
): Promise<{ ok: boolean; avisos?: AvisoPreflight[] }> {
  const id = (tenantId ?? '').trim();
  if (!id) return { ok: false };

  const crudo = (partnerId ?? '').trim();
  let partnerIdEnc: string | null = null;
  if (crudo) {
    const revision = preflightConectividad({ partnerId: crudo });
    if (!revision.ok) return { ok: false, avisos: revision.bloqueantes };
    // Valor normalizado por el preflight (recortes y comillas fuera).
    partnerIdEnc = encrypt(revision.valores.partnerId ?? crudo);
  }

  await prisma.hospitalityConnectivityConfig.upsert({
    where: { tenantId: id },
    create: { tenantId: id, partnerIdEnc },
    update: { partnerIdEnc },
  });
  return { ok: true };
}

/**
 * Estado de la conectividad para la pantalla del CLIENTE: sin secretos y sin
 * nombrar al proveedor (regla de marca). Dice si la plataforma ya tiene con qué
 * llamar y si el cliente tiene ya su propio ID de socio.
 */
export async function getTenantConnectivityPublic(tenantId: string) {
  const [provider, propio] = await Promise.all([
    getConnectivityProvider(),
    getTenantPartnerId(tenantId),
  ]);
  const parBasic = !!(provider?.usernameEnc && provider?.passwordEnc);

  return {
    nombre: provider?.nombreVisible || CONNECTIVITY_PROVIDER_NOMBRE,
    /** La plataforma tiene el par Basic cargado: sin él no hay ninguna vía. */
    plataformaConfigurada: parBasic,
    /** El cliente ya guardó su propio ID de socio. */
    tienePartnerIdPropio: !!propio,
    /** Marcador de presencia, nunca el valor. */
    partnerId: propio ? '••••••' : '',
    /** Hay con qué llamar por este cliente: par Basic + algún ID de socio. */
    completo: parBasic && (!!propio || !!provider?.partnerIdEnc),
    estado: (provider?.estado as ConnectivityEstado) || 'sin_configurar',
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

/**
 * Hotel con el que se sondea la capa: health-check diario y botón «Probar»
 * cuando no se indica un hotel.
 *
 * La sonda nació apuntando al hotel del sandbox del proveedor, pero un partner
 * de producción puede no tener concedido ese hotel de pruebas (Aiosell lo
 * retiró: `property_details/sandbox-pms` pasó de 200 a 403, y hoy responde
 * `403 Access Denied - sandbox-pms`). Cuando eso ocurre el panel queda en rojo
 * aunque el tráfico real funcione: el hotel de la sonda es configurable, en
 * este orden:
 *
 *   1. `CONNECTIVITY_HEALTH_HOTEL` (entorno), p. ej. el hotel real del partner.
 *   2. `configuracion.healthHotelCode` de la fila del proveedor.
 *   3. `hotelVinculado`: el `hotelCode` de una propiedad YA vinculada
 *      (`ConnectivityMapping.externalPropertyId`), que es el mismo código con
 *      el que la capa empuja inventario y pide reservas — ver
 *      `resolverHotelDeSonda`.
 *   4. `CONNECTIVITY_SANDBOX_HOTEL`, el sandbox documentado en el contrato.
 *
 * Es una función pura sobre la fila ya leída y el vínculo ya resuelto: quien la
 * llama no paga ninguna consulta a la base de datos. El vínculo entra como
 * parámetro (no se consulta aquí) para que la regla viva en un solo sitio y
 * siga siendo probable sin base de datos.
 */
export function resolveProbeHotelCode(
  provider?: { configuracion?: unknown } | null,
  hotelVinculado?: string | null,
): string {
  const desdeEntorno = (process.env.CONNECTIVITY_HEALTH_HOTEL || '').trim();
  if (desdeEntorno) return desdeEntorno;

  const cfg = (provider?.configuracion ?? null) as Record<string, unknown> | null;
  const desdeConfig =
    typeof cfg?.healthHotelCode === 'string' ? cfg.healthHotelCode.trim() : '';
  if (desdeConfig) return desdeConfig;

  const vinculado = (hotelVinculado ?? '').trim();
  return vinculado || CONNECTIVITY_SANDBOX_HOTEL;
}

/**
 * `hotelCode` del proveedor de una propiedad YA vinculada, con el que sí se
 * puede sondear la capa.
 *
 * Con `tenantId` devuelve el del primer vínculo activo de ESE cliente; sin él
 * (sondas de plataforma: health-check, botón «Probar» del panel admin) el de
 * cualquier cliente ya vinculado, que es un dato que la plataforma ya tiene y
 * no un secreto de nadie.
 *
 * Por qué existe: sondear `sandbox-pms` dice muy poco —el sandbox es del
 * contrato, no de la cuenta— y un partner de producción recibe `403 Access
 * Denied` aunque su capa funcione. El código de un hotel real ya vinculado es
 * la sonda que sí dice algo: es el mismo que viaja en cada push y cada fetch.
 */
export async function getHotelVinculadoParaSonda(
  tenantId?: string | null,
): Promise<string | null> {
  const id = (tenantId ?? '').trim();
  const mapping = await prisma.connectivityMapping.findFirst({
    where: {
      provider: CONNECTIVITY_PROVIDER_KEY,
      estado: 'activo',
      ...(id ? { tenantId: id } : {}),
    },
    orderBy: { fechaCreacion: 'asc' },
    select: { externalPropertyId: true },
  });
  const code = (mapping?.externalPropertyId ?? '').trim();
  return code || null;
}

/**
 * Hotel con el que sondear la capa, resuelto de verdad: lo configurado
 * (entorno → `configuracion.healthHotelCode`) y, si no hay nada configurado, el
 * hotel REAL ya vinculado antes de caer al sandbox del contrato.
 *
 * Es la versión asíncrona de `resolveProbeHotelCode` —la que mira los vínculos
 * en la base de datos— y la usan la misma sonda del botón «Probar» y el
 * health-check diario, para que panel y cron no puedan discrepar.
 */
export async function resolverHotelDeSonda(
  provider?: { configuracion?: unknown } | null,
  tenantId?: string | null,
): Promise<string> {
  const configurado = resolveProbeHotelCode(provider);
  if (configurado !== CONNECTIVITY_SANDBOX_HOTEL) return configurado;

  const vinculado = await getHotelVinculadoParaSonda(tenantId);
  return vinculado ?? CONNECTIVITY_SANDBOX_HOTEL;
}

/**
 * Mensaje que el proveedor pone en el cuerpo de una respuesta fallida
 * (`{ success:false, message }`, contrato). Normalmente es la única parte útil
 * del fallo; se devuelve tal cual, ya saneado.
 */
function mensajeDeRespuestaExterna(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const posible = (body as Record<string, unknown>).message ?? (body as Record<string, unknown>).error;
  return typeof posible === 'string' ? posible : null;
}

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
 *
 * Con `tenantId` se usa el ID de socio de ESE cliente —es lo que le deja ver
 * sus propiedades—; sin él (panel admin, health-check) se usa el de plataforma.
 *
 * Sin `hotelCode` sondea el sandbox del contrato; quien llama decide el hotel
 * por defecto con `resolverHotelDeSonda` (hotel real ya vinculado antes que
 * sandbox), que es lo que hacen el botón «Probar», la Conectividad del hotel y
 * el health-check.
 */
export async function testConnectivityConnection(
  hotelCode?: string,
  tenantId?: string | null
): Promise<TestConnectionResult> {
  const creds = await getConnectivityCredentials(tenantId);
  if (!creds) {
    // Diagnóstico útil: puede ser que no haya nada guardado o que falte solo
    // el ID de socio (el par Basic se guarda de forma independiente).
    const provider = await getConnectivityProvider();
    if (!provider || (!provider.usernameEnc && !provider.passwordEnc)) {
      return { ok: false, error: 'Conectividad no configurada: guarda primero las credenciales en esta pantalla.' };
    }
    return {
      ok: false,
      error: tenantId
        ? 'Falta tu ID de socio: guárdalo en Conectividad para poder consultar tus propiedades.'
        : 'Falta el ID de socio: guárdalo en esta pantalla (junto al usuario y la contraseña) para poder llamar al servicio.',
    };
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
    // El mensaje del proveedor trae la causa cuando el problema es el ID de
    // socio («Partner is disabled!» es 400 y «partner desconocido» es 403) o el
    // hotel («Access Denied - <hotelCode>»), y esas causas se arreglan distinto
    // que unas credenciales rechazadas. Al pulsar «Comprobar» el hotel tiene que
    // leerlo tal cual: la regla vive en el módulo de causas — aquí no se
    // duplican literales.
    const causa = causaDeFalloConectividad({
      httpStatus: res.status,
      errorMensaje: mensajeDeRespuestaExterna(body),
    });
    const esProblemaDeAccesoAlHotel =
      causa.clave === 'partner_deshabilitado' ||
      causa.clave === 'partner_desconocido' ||
      causa.clave === 'hotel_sin_concesion';
    return {
      ok: false,
      error: esProblemaDeAccesoAlHotel
        ? `${causa.texto}: ${causa.consejo}`
        : `La conexión respondió con estado ${res.status}`,
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
 * Advertencias que el proveedor adjunta a una respuesta `success: true`.
 *
 * No son cortesía: significan que la petición se recibió y ALGO SE DESCARTÓ
 * (por ejemplo `INVALID_RATEPLAN_CODE : 2b` cuando el rateplanCode empujado no
 * existe en su catálogo). Leer eso como éxito deja el calendario del canal sin
 * lo que le mandamos y el panel en verde — el fallo más caro de diagnosticar,
 * porque se ve desde fuera (el canal no cambia) y no desde dentro.
 *
 * Se normalizan a strings no vacíos: cualquier otra forma se ignora.
 */
export function advertenciasDeRespuesta(respuesta: unknown): string[] {
  if (typeof respuesta !== 'object' || respuesta === null) return [];
  const bruto = (respuesta as { warnings?: unknown }).warnings;
  if (!Array.isArray(bruto)) return [];
  return bruto
    .map((w) => (typeof w === 'string' ? w.trim() : ''))
    .filter((w) => w !== '');
}

/**
 * Resultado único de un push. Solo `success: true` **sin advertencias** cuenta
 * como éxito: si el proveedor avisa de que descartó algo, el push vuelve con
 * `ok: false` (conservando el HTTP real en `httpStatus`) para que el llamador
 * lo registre como lo que es —datos perdidos— y lo enseñe.
 */
function resultadoDePush(
  tipo: PushResult['tipo'],
  res: Response,
  respuestaExterna: unknown,
  duracionMs: number
): PushResult {
  const success =
    typeof respuestaExterna === 'object' &&
    respuestaExterna !== null &&
    (respuestaExterna as { success?: unknown }).success === true;
  const message = (respuestaExterna as { message?: string } | null)?.message;

  if (!res.ok || !success) {
    return {
      ok: false,
      tipo,
      httpStatus: res.status,
      message,
      respuestaExterna,
      error: message || `HTTP ${res.status}`,
      duracionMs,
    };
  }

  const advertencias = advertenciasDeRespuesta(respuestaExterna);
  if (advertencias.length > 0) {
    const error = `El proveedor aceptó la petición pero descartó datos: ${advertencias.join(' · ')}`;
    return {
      ok: false,
      tipo,
      httpStatus: res.status,
      message,
      respuestaExterna,
      error,
      duracionMs,
    };
  }

  return { ok: true, tipo, httpStatus: res.status, message, respuestaExterna, duracionMs };
}

/**
 * Inventory Push — POST /update/{pms} (upsert por rango).
 * Verifica el campo `success` de la respuesta (y sus `warnings`); expone
 * `message` en fallos.
 */
export async function pushInventory(
  hotelCode: string,
  updates: InventoryPushUpdate[],
  tenantId?: string | null
): Promise<PushResult> {
  const started = Date.now();
  try {
    const creds = await getConnectivityCredentials(tenantId);
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
    return resultadoDePush('inventory', res, respuestaExterna, duracionMs);
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
 * Consulta las reservas recibidas vía OTAs para un hotel.
 * Se usa por la reconciliación (§14). NO hace retries ciegos.
 *
 * OJO con `startDate`/`endDate`: el proveedor filtra por FECHA DE RESERVA
 * (`bookedOn`), NO por fechas de estancia — medido contra el servicio real, ver
 * `lib/hospitality/ventana-reservas.ts`—. Quien pase un rango a mano tiene que
 * pensar en «reservas hechas en ese rango», no en «estancias de ese rango»; el
 * barrido usa `ventanaFetchReservas()` para no volver a equivocarse.
 */
export async function fetchReservations(
  hotelCode: string,
  startDate: string,
  endDate: string,
  tenantId?: string | null
): Promise<FetchReservationsResult> {
  const started = Date.now();
  try {
    const creds = await getConnectivityCredentials(tenantId);
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
  updates: RatePushUpdate[],
  tenantId?: string | null
): Promise<PushResult> {
  const started = Date.now();
  try {
    const creds = await getConnectivityCredentials(tenantId);
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
    return resultadoDePush('rates', res, respuestaExterna, duracionMs);
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
  tipo: PushResult['tipo'],
  tenantId?: string | null
): Promise<PushResult> {
  const started = Date.now();
  try {
    const creds = await getConnectivityCredentials(tenantId);
    if (!creds) {
      return { ok: false, tipo, error: 'Conectividad no configurada.', duracionMs: 0 };
    }
    const { res, duracionMs } = await connectivityFetch(
      `${endpoint}/${encodeURIComponent(creds.partnerId)}`,
      { hotelCode, updates },
      creds
    );
    const respuestaExterna = await readBody(res);
    return resultadoDePush(tipo, res, respuestaExterna, duracionMs);
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
  updates: InventoryRestrictionsPushUpdate[],
  tenantId?: string | null
): Promise<PushResult> {
  return postConnectivityUpdate('/update', hotelCode, updates, 'inventory_restrictions', tenantId);
}

/**
 * Rate Restrictions Push — POST /update-rates/{pms} (plan maestro §5).
 * Restricciones por (roomCode, rateplanCode): estancia mínima/máxima y
 * cierre de llegada/salida por día de la semana.
 */
export async function pushRateRestrictions(
  hotelCode: string,
  updates: RateRestrictionsPushUpdate[],
  tenantId?: string | null
): Promise<PushResult> {
  return postConnectivityUpdate('/update-rates', hotelCode, updates, 'rates_restrictions', tenantId);
}

// ─── Mensajería del canal (respuesta al huésped) ──────────────────────────

/**
 * Resultado de enviar una respuesta de mensajería al canal.
 *
 * La regla de éxito es la INVERSA de un push, a propósito: aquí lo peligroso no
 * es creer que se envió algo que no se aplicó, sino dar por fallida una
 * respuesta que el huésped ya recibió (el hotel volvería a escribirle). El
 * contrato devuelve `success: true`; un 2xx que no diga `success: false` cuenta
 * como enviado, y solo las advertencias del proveedor —que aquí sí significan
 * «algo se descartó»— lo bajan a fallo.
 */
export interface MensajeCanalResult {
  ok: boolean;
  httpStatus?: number;
  message?: string;
  respuestaExterna?: unknown;
  error?: string;
  duracionMs: number;
}

/**
 * Message Reply — POST /message-reply/{pms}.
 *
 * El cuerpo lo construye y valida `construirRespuestaCanal`
 * (`lib/hospitality/mensajes-canal.ts`): aquí solo viaja. NO hace retries
 * ciegos: un fallo vuelve al llamador para que quede en el hilo del hotel como
 * lo que es (una respuesta que NO salió) y este decida si la reescribe.
 */
export async function enviarMensajeCanal(
  body: Record<string, unknown>,
  tenantId?: string | null
): Promise<MensajeCanalResult> {
  const started = Date.now();
  try {
    const creds = await getConnectivityCredentials(tenantId);
    if (!creds) {
      return { ok: false, error: 'Conectividad no configurada.', duracionMs: 0 };
    }
    const { res, duracionMs } = await connectivityFetch(
      `/message-reply/${encodeURIComponent(creds.partnerId)}`,
      body,
      creds
    );
    const respuestaExterna = await readBody(res);
    const message = (respuestaExterna as { message?: string } | null)?.message;

    if (!res.ok) {
      return {
        ok: false,
        httpStatus: res.status,
        message,
        respuestaExterna,
        error: message || `HTTP ${res.status}`,
        duracionMs,
      };
    }
    if ((respuestaExterna as { success?: unknown } | null)?.success === false) {
      return {
        ok: false,
        httpStatus: res.status,
        message,
        respuestaExterna,
        error: message || 'El canal rechazó la respuesta',
        duracionMs,
      };
    }
    const advertencias = advertenciasDeRespuesta(respuestaExterna);
    if (advertencias.length > 0) {
      return {
        ok: false,
        httpStatus: res.status,
        message,
        respuestaExterna,
        error: `El canal aceptó la respuesta pero descartó datos: ${advertencias.join(' · ')}`,
        duracionMs,
      };
    }

    return { ok: true, httpStatus: res.status, message, respuestaExterna, duracionMs };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Error de red';
    return { ok: false, error: msg, duracionMs: Date.now() - started };
  }
}