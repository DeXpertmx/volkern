/**
 * Lectura de la cabecera Basic de los webhooks ENTRANTES del proveedor.
 *
 * Webhook de reservas y webhook de mensajes comparten el mismo par (usuario y
 * contraseña de la capa de conectividad) y el mismo diagnóstico del 401: si
 * cada ruta lo implementara por su cuenta, un día una de las dos diría «no
 * autorizado» a secas y el operador no sabría si falta la cabecera, si el
 * base64 llegó partido o si el emisor tiene otro par configurado. Aquí vive una
 * sola vez, y es pura: no toca BD ni red — solo la cabecera que llega.
 *
 * Regla de secretos: nada de lo que se devuelve o se registra contiene el par.
 * Las huellas son SHA-256 truncado de lo RECIBIDO, para que quien emite pueda
 * hashear el suyo y comparar sin que el valor viaje.
 */

import { createHash } from 'crypto';
import type { MotivoRechazo } from './conectividad-rechazo';

export type AuthAttempt =
  | { ok: true; username: string; password: string }
  | { ok: false; motivo: MotivoRechazo; esquema: string | null };

/** Lo mínimo que necesitamos de una petición: su cabecera Authorization. */
export interface ConCabecera {
  headers: { get(name: string): string | null };
}

/**
 * Huella no reversible (SHA-256 truncado) para comparar credenciales **sin
 * transportarlas**.
 */
export function huellaCredencial(...partes: string[]): string {
  return createHash('sha256').update(partes.join(':')).digest('hex').slice(0, 12);
}

export function readBasicAuth(request: ConCabecera): AuthAttempt {
  const header = request.headers.get('authorization');
  if (!header) return { ok: false, motivo: 'sin_cabecera', esquema: null };
  // RFC 7235: el nombre del esquema es insensible a mayúsculas y admite más de
  // un espacio detrás. Exigir `Basic ` literal convertía un `basic` válido en
  // el mismo 401 que unas credenciales equivocadas.
  const partes = /^\s*([^\s]+)\s*(.*)$/.exec(header);
  if (!partes) return { ok: false, motivo: 'cabecera_malformada', esquema: null };
  const esquema = partes[1].toLowerCase();
  if (esquema !== 'basic') return { ok: false, motivo: 'esquema_no_basic', esquema };
  // Los emisores descuidados parten el base64 en varias líneas: se unen.
  const payload = partes[2].replace(/\s+/g, '');
  if (!payload) return { ok: false, motivo: 'cabecera_malformada', esquema };
  const decoded = Buffer.from(payload, 'base64').toString('utf8');
  // U+FFFD = la credencial traía bytes que no son UTF-8 (p. ej. latin-1).
  if (decoded.includes('\uFFFD')) return { ok: false, motivo: 'encoding_no_utf8', esquema };
  const idx = decoded.indexOf(':');
  if (idx < 0) return { ok: false, motivo: 'sin_separador', esquema };
  return {
    ok: true,
    username: decoded.slice(0, idx),
    password: decoded.slice(idx + 1),
  };
}

/** Comparación de longitud constante: el tiempo no debe decir cuánto acertó. */
export function credencialesCoinciden(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
