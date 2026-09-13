/**
 * Enlace "Pedir por WhatsApp": el huésped recibe una URL firmada donde completa
 * sus datos obligatorios (nombre, apellidos, documento, nacimiento) y al
 * guardarlos quedan declarados como viajero de su reserva.
 *
 * Reglas del diseño:
 * - El token lleva solo el id del viajero y su caducidad, firmado con HMAC.
 *   Nada de tenantId, número de documento ni datos personales en el enlace.
 * - El id interno es un cuid: no es adivinable, y la firma añade que no sea
 *   falsificable ni reutilizable pasada la caducidad.
 * - La caducidad existe porque el enlace da capacidad de escribir datos; una
 *   semana cubre pedirlos al reservar y completarlos antes de la llegada.
 */
import crypto from 'crypto';

/** Caducidad del enlace: 7 días en milisegundos. */
const CADUCIDAD_MS = 7 * 24 * 60 * 60 * 1000;

function secreto(): string {
  return process.env.TRAVELER_LINK_SECRET || process.env.NEXTAUTH_SECRET || '';
}

export class EnlaceNoConfigurado extends Error {
  constructor() {
    super('No hay secreto configurado para firmar enlaces de viajeros');
    this.name = 'EnlaceNoConfigurado';
  }
}

export interface CargaEnlace {
  viajeroId: string;
  expiraEn: number;
}

export function firmarTokenEnlace(viajeroId: string, ahora: number = Date.now()): string {
  const secretoHex = secreto();
  if (!secretoHex) throw new EnlaceNoConfigurado();

  const carga: CargaEnlace = { viajeroId, expiraEn: ahora + CADUCIDAD_MS };
  const cuerpo = Buffer.from(JSON.stringify(carga), 'utf8').toString('base64url');
  const firma = crypto.createHmac('sha256', secretoHex).update(cuerpo).digest('base64url');
  return `${cuerpo}.${firma}`;
}

export type ResultadoVerificacion =
  | { ok: true; viajeroId: string }
  | { ok: false; motivo: 'firma_invalida' | 'caducado' | 'malformado' };

export function verificarTokenEnlace(token: string, ahora: number = Date.now()): ResultadoVerificacion {
  const secretoHex = secreto();
  if (!secretoHex) return { ok: false, motivo: 'firma_invalida' };

  const partes = token.split('.');
  if (partes.length !== 2 || !partes[0] || !partes[1]) return { ok: false, motivo: 'malformado' };

  const [cuerpo, firma] = partes;
  const esperada = crypto.createHmac('sha256', secretoHex).update(cuerpo).digest('base64url');
  const a = Buffer.from(firma);
  const b = Buffer.from(esperada);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, motivo: 'firma_invalida' };
  }

  let carga: CargaEnlace;
  try {
    carga = JSON.parse(Buffer.from(cuerpo, 'base64url').toString('utf8')) as CargaEnlace;
  } catch {
    return { ok: false, motivo: 'malformado' };
  }
  if (!carga?.viajeroId || typeof carga.expiraEn !== 'number') return { ok: false, motivo: 'malformado' };
  if (Date.now() > carga.expiraEn) return { ok: false, motivo: 'caducado' };

  return { ok: true, viajeroId: carga.viajeroId };
}

/** URL pública del formulario del huésped (`viajeros` está en TOP_LEVEL para que el middleware no la toque). */
export function urlPedirDatos(appUrl: string, token: string): string {
  return `${appUrl.replace(/\/+$/, '')}/viajeros/${token}`;
}

/** URL base de la aplicación, igual que el resto de la plataforma. */
export function getEnlaceAppUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || 'https://volkern.app';
}
