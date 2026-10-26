/**
 * Credencial de NOBEDS **por propiedad** y cliente listo para usar.
 *
 * Sus tokens son por hotel y viajan en la ruta de cada petición, así que se
 * guardan cifrados en `hospitality_connectivity_property_config` (modelo nuevo,
 * convive con el `partnerId` por tenant del proveedor actual) y **no salen de
 * aquí**: ni en mensajes de error, ni en logs, ni en una respuesta de API.
 *
 * Todavía no lo usa el sincronizador: es la pieza que permite leer una propiedad
 * real en cuanto el hotel pase su token, sin tocar el camino vivo.
 */

import { prisma } from '@/lib/db';
import { decrypt } from '@/lib/core/crypto';
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
