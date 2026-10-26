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
 * cosa de `guardarCredencialPropiedad`, que cifra antes de escribir y devuelve
 * el estado —nunca el token— para que la API no tenga que acordarse de quitarlo.
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
      estado: 'configurado',
    },
    update: {
      externalPropertyId,
      ...(tokenEnc === undefined ? {} : { tokenEnc }),
      activo,
      modo,
      // Guardar no es haber probado: el chequeo real lo marca la sonda de
      // salud. Se limpia el error anterior para no arrastrar uno ya resuelto.
      estado: 'configurado',
      ultimoError: null,
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
  };
}
