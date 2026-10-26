/**
 * Credencial de NOBEDS **por propiedad** y cliente listo para usar.
 *
 * Sus tokens son por hotel y viajan en la ruta de cada petición, así que se
 * guardan cifrados en `hospitality_connectivity_property_config` (modelo nuevo,
 * convive con el `partnerId` por tenant del proveedor actual) y **no salen de
 * aquí**: ni en mensajes de error, ni en logs, ni en una respuesta de API.
 *
 * Todavía no lo usa el sincronizador: es la pieza que permite leer una propiedad
 * real en cuanto el hotel pase su token, sin tocar el camino vivo. Guardar es
 * cosa de `guardarCredencialPropiedad`, que cifra antes de escribir, prueba la
 * credencial con un GET de estado y devuelve el resultado —nunca el token— para
 * que la API no tenga que acordarse de quitarlo.
 */

import { prisma } from '@/lib/db';
import { decrypt, encrypt } from '@/lib/core/crypto';
import {
  decidirEscritor,
  describirDecision,
  type ModoProveedor,
} from '../conectividad-proveedores';
import {
  crearClienteNobeds,
  ErrorNobeds,
  NOBEDS_BASE_URL_POR_DEFECTO,
  NOBEDS_PROVIDER_KEY,
  type ClienteNobeds,
} from './cliente';

/** URL base del proveedor; configurable para sandbox sin tocar código. */
export function baseUrlNobeds(): string {
  return (process.env.NOBEDS_BASE_URL ?? NOBEDS_BASE_URL_POR_DEFECTO).replace(/\/+$/, '');
}

export interface EntradaPropiedad {
  tenantId: string;
  propertyId: string;
  /** Inyección para pruebas: el `fetch` real respeta el timeout del cliente. */
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

interface FilaCredencial {
  tokenEnc: string | null;
  activo: boolean;
  estado: string;
  externalPropertyId: string;
}

async function leerCredencial(entrada: EntradaPropiedad): Promise<FilaCredencial | null> {
  return prisma.hospitalityConnectivityPropertyConfig.findUnique({
    where: {
      tenantId_propertyId_provider: {
        tenantId: entrada.tenantId,
        propertyId: entrada.propertyId,
        provider: NOBEDS_PROVIDER_KEY,
      },
    },
    select: { tokenEnc: true, activo: true, estado: true, externalPropertyId: true },
  });
}

/**
 * Construye el cliente de lectura de una propiedad concreta.
 *
 * Falla con `ErrorNobeds` de tipo `token` en los tres casos que parecen «sin
 * datos» y no lo son: no hay configuración, está desactivada o le falta la
 * credencial. Ninguno de los mensajes incluye el token.
 */
export async function crearClienteNobedsDePropiedad(
  entrada: EntradaPropiedad
): Promise<ClienteNobeds> {
  const fila = await leerCredencial(entrada);

  if (!fila) {
    throw new ErrorNobeds(
      'token',
      'Esta propiedad no tiene configurada la conectividad de canales'
    );
  }
  if (!fila.activo) {
    throw new ErrorNobeds(
      'token',
      'La conectividad de esta propiedad está desactivada'
    );
  }
  if (!fila.tokenEnc) {
    throw new ErrorNobeds('token', 'Falta el token de la propiedad');
  }

  const token = decrypt(fila.tokenEnc).trim();
  if (!token) {
    throw new ErrorNobeds('token', 'El token guardado de la propiedad está vacío');
  }

  return crearClienteNobeds({
    token,
    baseUrl: baseUrlNobeds(),
    fetchImpl: entrada.fetchImpl,
    timeoutMs: entrada.timeoutMs,
  });
}

export interface EstadoConfiguracionPropiedad {
  proveedor: string;
  configurado: boolean;
  activo: boolean;
  estado: string;
  externalPropertyId: string | null;
}

/**
 * Estado **sin secretos**, para panel y API. `configurado` dice si hay token,
 * no cuál: el valor no se devuelve nunca.
 */
export async function estadoConfiguracionNobeds(
  entrada: Omit<EntradaPropiedad, 'fetchImpl' | 'timeoutMs'>
): Promise<EstadoConfiguracionPropiedad> {
  const fila = await leerCredencial(entrada);

  if (!fila) {
    return {
      proveedor: NOBEDS_PROVIDER_KEY,
      configurado: false,
      activo: false,
      estado: 'sin_configurar',
      externalPropertyId: null,
    };
  }

  return {
    proveedor: NOBEDS_PROVIDER_KEY,
    configurado: Boolean(fila.tokenEnc),
    activo: fila.activo,
    estado: fila.estado,
    externalPropertyId: fila.externalPropertyId,
  };
}

// ─── Guardado de la credencial ────────────────────────────────────────────

/** Máximos de longitud: un token es un segmento de URL, no un documento. */
const MAX_CODIGO_EXTERNO = 64;
const MAX_TOKEN = 512;

/**
 * Espera máxima de la sonda que corre al guardar. Guardar es una acción de la
 * pantalla: si el proveedor no contesta en este tiempo, se guarda igual y se
 * anota el fallo, en vez de dejar al hotel esperando el timeout normal.
 */
const TIMEOUT_SONDEO_MS = 8_000;

/** Un motivo de fallo es una línea de estado, no un volcado de la respuesta. */
const MAX_ERROR = 300;

/** Espacios, saltos de línea o controles romperían la URL y los logs. */
const CON_ESPACIOS = /\s/;

const MODOS: ReadonlyArray<ModoProveedor> = ['escritura', 'lectura'];

export type CampoInvalido =
  | 'propertyId'
  | 'externalPropertyId'
  | 'token'
  | 'modo';

export interface EntradaGuardado {
  tenantId: string;
  propertyId: string;
  /** Código de la propiedad en el proveedor (`hotel_id` en NOBEDS). */
  externalPropertyId: string;
  /**
   * Token **nuevo**. Si se omite se conserva el guardado: rotarlo y cambiar
   * solo `activo` o `modo` no obliga a volver a pegarlo en la pantalla.
   */
  token?: string;
  activo?: boolean;
  modo?: ModoProveedor;
  /** Inyección para pruebas: la sonda usa el `fetch` real por defecto. */
  fetchImpl?: typeof fetch;
  /** Espera máxima de la sonda; por defecto 8 s. */
  timeoutMs?: number;
}

export interface ResultadoGuardado {
  ok: boolean;
  /** Campo que hay que corregir; la API lo usa para señalar el input. */
  campo?: CampoInvalido;
  error?: string;
  /** Convivencia entre proveedores. No impide guardar: es un aviso. */
  avisos: string[];
  /** Estado sin secretos, listo para devolver tal cual. */
  estado?: EstadoConfiguracionPropiedad;
  /** Lo que dijo el proveedor al probar la credencial recién guardada. */
  sondeo?: ResultadoSondeo;
}

/**
 * Resultado de la sonda de guardado. No contiene el token y puede devolverse
 * tal cual: es lo que la pantalla necesita para decir «responde» o «el
 * proveedor lo rechazó» sin insinuar el secreto.
 */
export interface ResultadoSondeo {
  /** `false` cuando no se probó (credencial desactivada): no es un fallo. */
  probado: boolean;
  ok: boolean;
  /** Lo que queda escrito en la fila: `conectado`, `error` o `configurado`. */
  estado: 'conectado' | 'error' | 'configurado';
  /** Motivo saneado del fallo, o `null`. Nunca incluye el token. */
  error: string | null;
  /** Nombre del establecimiento que responde al token. */
  hotel: string | null;
  /** `isActive` del proveedor: el hotel puede existir y estar dado de baja. */
  hotelActivo: boolean | null;
  /** Alojamientos que ve el token (`rentalsCount`). */
  rentals: number | null;
  suscripcionHasta: string | null;
  /** Instante del sondeo; `null` si no se probó. */
  ultimoChequeo: Date | null;
}

/**
 * Quita el token de un mensaje antes de guardarlo en la fila.
 *
 * El cliente ya sanea sus propios errores, pero esto escribe en la base y de
 * ahí salta a la pantalla y a la API: se limpia otra vez, sin confiar en que el
 * camino que produjo el error lo haya hecho.
 */
function limpiarError(mensaje: string, token: string): string {
  let limpio = mensaje;
  if (token) {
    limpio = limpio.split(token).join('•••').split(encodeURIComponent(token)).join('•••');
  }
  limpio = limpio.replace(/\s+/g, ' ').trim();
  if (!limpio) return 'El proveedor no dio un motivo legible';
  return limpio.length > MAX_ERROR ? `${limpio.slice(0, MAX_ERROR - 1)}…` : limpio;
}

/**
 * Prueba el token **en solo lectura**: un `GET /api/Status` con la credencial.
 *
 * No escribe nada en el proveedor ni valida el código de propiedad —el token es
 * por hotel y `Status` no devuelve ese código—; dice exactamente una cosa: si la
 * credencial responde o no. Un fallo no se propaga: se devuelve como estado
 * para que quien llama decida (aquí, guardar y marcar el error).
 */
async function sondearToken(
  token: string,
  entrada: { fetchImpl?: typeof fetch; timeoutMs?: number }
): Promise<ResultadoSondeo> {
  const ultimoChequeo = new Date();

  try {
    const cliente = crearClienteNobeds({
      token,
      baseUrl: baseUrlNobeds(),
      fetchImpl: entrada.fetchImpl,
      timeoutMs: entrada.timeoutMs ?? TIMEOUT_SONDEO_MS,
    });
    const estado = await cliente.estado();

    return {
      probado: true,
      ok: true,
      estado: 'conectado',
      error: null,
      hotel: estado.hotel,
      hotelActivo: estado.activo,
      rentals: estado.rentalsCount,
      suscripcionHasta: estado.suscripcionHasta,
      ultimoChequeo,
    };
  } catch (e: unknown) {
    const crudo = e instanceof Error ? e.message : 'Error desconocido al probar la credencial';
    return {
      probado: true,
      ok: false,
      estado: 'error',
      error: limpiarError(crudo, token),
      hotel: null,
      hotelActivo: null,
      rentals: null,
      suscripcionHasta: null,
      ultimoChequeo,
    };
  }
}

function texto(valor: unknown): string {
  return typeof valor === 'string' ? valor.trim() : '';
}

function fallo(campo: CampoInvalido, error: string): ResultadoGuardado {
  return { ok: false, campo, error, avisos: [] };
}

/**
 * Guarda (o rota) la credencial de **esta** propiedad.
 *
 * Tres decisiones que importan:
 *
 * - El token se **cifra aquí**, en el servidor, antes de tocar la base. La API
 *   recibe texto plano una vez y no vuelve a verlo: el resultado trae
 *   `configurado: true`, no el valor.
 * - Sin token en la petición se **conserva** el existente. Borrarlo no es un
 *   efecto colateral de cambiar `activo` o `modo`.
 * - Si con esto quedan dos proveedores activos en escritura, se guarda igual y
 *   se devuelve el aviso de la política: rechazarlo dejaría al hotel sin poder
 *   registrar su credencial por un conflicto que se resuelve en otro sitio.
 * - **Guardar es probar.** Con la credencial que queda en uso se hace un
 *   `GET /api/Status` (solo lectura) y su resultado se escribe en la misma
 *   operación: `estado` (`conectado`/`error`), `ultimoChequeo` y `ultimoError`.
 *   Un fallo **no** tumba el guardado: perder el token tecleado porque el
 *   proveedor está caído sería peor que guardarlo marcado en rojo. Una
 *   credencial desactivada no se prueba (no se gastan peticiones con un secreto
 *   que el hotel acaba de apagar) y queda en `configurado`.
 *
 * La pertenencia de la propiedad al tenant la comprueba quien llama: aquí solo
 * se escribe la clave (tenantId, propertyId, provider).
 */
export async function guardarCredencialPropiedad(
  entrada: EntradaGuardado
): Promise<ResultadoGuardado> {
  const propertyId = texto(entrada.propertyId);
  if (!propertyId) return fallo('propertyId', 'Falta la propiedad.');

  const externalPropertyId = texto(entrada.externalPropertyId);
  if (!externalPropertyId) {
    return fallo('externalPropertyId', 'Falta el código de la propiedad en el proveedor.');
  }
  if (externalPropertyId.length > MAX_CODIGO_EXTERNO || CON_ESPACIOS.test(externalPropertyId)) {
    return fallo(
      'externalPropertyId',
      `El código de la propiedad no puede llevar espacios ni pasar de ${MAX_CODIGO_EXTERNO} caracteres.`
    );
  }

  const tokenNuevo = entrada.token === undefined ? undefined : texto(entrada.token);
  if (tokenNuevo !== undefined) {
    if (!tokenNuevo) return fallo('token', 'El token no puede estar vacío.');
    if (tokenNuevo.length > MAX_TOKEN || CON_ESPACIOS.test(tokenNuevo)) {
      return fallo(
        'token',
        `El token no puede llevar espacios ni pasar de ${MAX_TOKEN} caracteres.`
      );
    }
  }

  if (entrada.modo !== undefined && !MODOS.includes(entrada.modo)) {
    return fallo('modo', "El modo debe ser 'escritura' o 'lectura'.");
  }

  const existente = await prisma.hospitalityConnectivityPropertyConfig.findUnique({
    where: {
      tenantId_propertyId_provider: {
        tenantId: entrada.tenantId,
        propertyId,
        provider: NOBEDS_PROVIDER_KEY,
      },
    },
    select: { tokenEnc: true, modo: true, activo: true },
  });

  // Guardar sin token solo vale si ya hay uno: si no, quedaría una fila
  // «configurada» que en realidad no puede leer nada.
  if (tokenNuevo === undefined && !existente?.tokenEnc) {
    return fallo('token', 'Falta el token de la propiedad.');
  }

  const modoExistente = existente?.modo as ModoProveedor | undefined;
  const modo: ModoProveedor =
    entrada.modo ?? (modoExistente && MODOS.includes(modoExistente) ? modoExistente : 'escritura');
  // Rotar un token no reactiva por sorpresa una credencial que estaba apagada.
  const activo = entrada.activo ?? existente?.activo ?? true;
  const tokenEnc = tokenNuevo === undefined ? undefined : encrypt(tokenNuevo);

  // Se prueba lo que va a QUEDAR en uso, no lo que llegó por el cable: guardar
  // sin token rota el estado o el modo y la sonda tiene que usar el guardado.
  const tokenEnUso =
    tokenNuevo ?? (existente?.tokenEnc ? decrypt(existente.tokenEnc).trim() : '');
  const sondeo = activo && tokenEnUso ? await sondearToken(tokenEnUso, entrada) : null;
  const estadoFila = sondeo ? sondeo.estado : 'configurado';

  await prisma.hospitalityConnectivityPropertyConfig.upsert({
    where: {
      tenantId_propertyId_provider: {
        tenantId: entrada.tenantId,
        propertyId,
        provider: NOBEDS_PROVIDER_KEY,
      },
    },
    create: {
      tenantId: entrada.tenantId,
      propertyId,
      provider: NOBEDS_PROVIDER_KEY,
      externalPropertyId,
      tokenEnc: tokenEnc ?? null,
      activo,
      modo,
      estado: estadoFila,
      ultimoChequeo: sondeo?.ultimoChequeo ?? null,
      ultimoError: sondeo && !sondeo.ok ? sondeo.error : null,
    },
    update: {
      externalPropertyId,
      ...(tokenEnc === undefined ? {} : { tokenEnc }),
      activo,
      modo,
      estado: estadoFila,
      // Sin sonda se conserva la fecha del último chequeo (apagar la credencial
      // no borra cuándo se comprobó); el error viejo sí se limpia para no
      // arrastrar uno que ya no describe nada.
      ...(sondeo ? { ultimoChequeo: sondeo.ultimoChequeo } : {}),
      ultimoError: sondeo && !sondeo.ok ? sondeo.error : null,
    },
  });

  const avisos: string[] = [];
  const configs = await prisma.hospitalityConnectivityPropertyConfig.findMany({
    where: { tenantId: entrada.tenantId, propertyId },
    select: { provider: true, activo: true, modo: true },
  });
  const decision = decidirEscritor(
    configs.map((c) => ({
      provider: c.provider,
      activo: c.activo,
      // La columna es texto libre; la política solo entiende dos modos.
      modo: c.modo === 'lectura' ? ('lectura' as const) : ('escritura' as const),
    }))
  );
  if (decision.motivo === 'dos_escritores' || decision.motivo === 'desconocido') {
    avisos.push(describirDecision(decision));
  }

  return {
    ok: true,
    avisos,
    estado: await estadoConfiguracionNobeds({ tenantId: entrada.tenantId, propertyId }),
    ...(sondeo ? { sondeo } : {}),
  };
}
