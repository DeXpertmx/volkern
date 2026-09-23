/**
 * Enlaces públicos firmados de Hospitality.
 *
 * Hospitality manda por WhatsApp y por correo enlaces que permiten escribir o
 * leer datos de una persona concreta (el viajero completa sus datos, el huésped
 * revisa su reserva). Todos comparten las mismas reglas:
 *
 * - La carga lleva **solo identificadores internos y la caducidad**, firmados con
 *   HMAC-SHA256. Nada de datos personales, documentos ni importes dentro del
 *   enlace.
 * - Un identificador interno (`cuid`) no es adivinable, y la firma añade que no
 *   sea falsificable ni reutilizable pasada la caducidad.
 * - La comparación de firmas es en tiempo constante: comparar con `===` filtra
 *   por tiempo cuántos bytes acertó quien lo intenta.
 *
 * Vive aquí una sola vez porque el módulo de viajeros y el de reservas directas
 * piden exactamente lo mismo; tener dos copias del HMAC significaría que un
 * arreglo de seguridad hubiera que hacerlo dos veces.
 */

import crypto from 'crypto';

export interface CargaFirmada {
  /** Momento (epoch ms) a partir del cual el enlace deja de valer. */
  expiraEn: number;
}

export type ResultadoVerificacionFirma<T> =
  | { ok: true; carga: T }
  | { ok: false; motivo: 'firma_invalida' | 'caducado' | 'malformado' };

/** Firma una carga con el secreto dado. El resultado es `<carga>.<firma>`. */
export function firmarCarga<T extends CargaFirmada>(carga: T, secreto: string): string {
  if (!secreto) throw new Error('No hay secreto configurado para firmar enlaces');
  const cuerpo = Buffer.from(JSON.stringify(carga), 'utf8').toString('base64url');
  const firma = crypto.createHmac('sha256', secreto).update(cuerpo).digest('base64url');
  return `${cuerpo}.${firma}`;
}

/**
 * Verifica un token y devuelve su carga.
 *
 * `ahora` existe para poder probar la caducidad sin esperar a que pase el tiempo.
 */
export function verificarCarga<T extends CargaFirmada>(
  token: string,
  secreto: string,
  ahora: number = Date.now()
): ResultadoVerificacionFirma<T> {
  if (!secreto) return { ok: false, motivo: 'firma_invalida' };

  const partes = (token || '').split('.');
  if (partes.length !== 2 || !partes[0] || !partes[1]) return { ok: false, motivo: 'malformado' };

  const [cuerpo, firma] = partes;
  const esperada = crypto.createHmac('sha256', secreto).update(cuerpo).digest('base64url');
  const a = Buffer.from(firma);
  const b = Buffer.from(esperada);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, motivo: 'firma_invalida' };
  }

  let carga: T;
  try {
    carga = JSON.parse(Buffer.from(cuerpo, 'base64url').toString('utf8')) as T;
  } catch {
    return { ok: false, motivo: 'malformado' };
  }

  if (!carga || typeof carga !== 'object' || typeof carga.expiraEn !== 'number') {
    return { ok: false, motivo: 'malformado' };
  }
  if (ahora > carga.expiraEn) return { ok: false, motivo: 'caducado' };

  return { ok: true, carga };
}
