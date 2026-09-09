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