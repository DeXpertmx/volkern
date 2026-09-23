/**
 * Enlace firmado de una reserva directa.
 *
 * Sirve para que el propio huésped consulte el estado de la reserva que acaba de
 * hacer (y para que la pasarela de pago pueda devolverlo a su página), sin abrir
 * un endpoint público que permita leer reservas ajenas probando identificadores.
 *
 * La carga lleva solo el id de la reserva y su caducidad. Para que el enlace no
 * caduque mientras el huésped prepara el viaje, la ventana es amplia: el enlace
 * no escribe nada, solo enseña la reserva a quien ya la conoce.
 */

import { firmarCarga, verificarCarga } from './signed-link';

/** Caducidad del enlace: 180 días. */
const CADUCIDAD_MS = 180 * 24 * 60 * 60 * 1000;

interface CargaReserva {
  reservaId: string;
  expiraEn: number;
}

function secreto(): string {
  return process.env.BOOKING_LINK_SECRET || process.env.NEXTAUTH_SECRET || '';
}

export type ResultadoVerificacionReserva =
  | { ok: true; reservaId: string }
  | { ok: false; motivo: 'firma_invalida' | 'caducado' | 'malformado' };

export function firmarTokenReserva(reservaId: string, ahora: number = Date.now()): string {
  return firmarCarga<CargaReserva>({ reservaId, expiraEn: ahora + CADUCIDAD_MS }, secreto());
}

export function verificarTokenReserva(
  token: string,
  ahora: number = Date.now()
): ResultadoVerificacionReserva {
  const resultado = verificarCarga<CargaReserva>(token, secreto(), ahora);
  if (!resultado.ok) return resultado;
  if (!resultado.carga.reservaId) return { ok: false, motivo: 'malformado' };
  return { ok: true, reservaId: resultado.carga.reservaId };
}

/** URL pública de la confirmación de una reserva directa. */
export function urlConfirmacionReserva(
  appUrl: string,
  slug: string,
  reservaId: string,
  ahora: number = Date.now()
): string {
  const token = firmarTokenReserva(reservaId, ahora);
  return `${appUrl.replace(/\/+$/, '')}/reservar/${slug}/confirmacion/${token}`;
}
