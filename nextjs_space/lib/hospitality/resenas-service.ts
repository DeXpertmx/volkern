import { randomBytes } from 'crypto';
import { prisma } from '../db';
import { idiomaDeValor } from './booking-i18n';

/**
 * Enlaces de reseña: mismo patrón que el check-in online (checkin-service).
 * El token es opaco, único y por reserva — es la credencial del enlace que el
 * cron de solicitud (§21) manda al huésped tras el check-out. Vive en la
 * RESERVA (`tokenResena`) y no en la reseña porque se genera ANTES de que
 * exista reseña: la reseña nace cuando el huésped envía el formulario.
 */

/** URL pública de la aplicación (misma convención que el resto del producto). */
function urlPublica(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || 'https://volkern.app').replace(/\/+$/, '');
}

/** Token del enlace de reseña: 24 bytes al azar en base64url (192 bits). */
export function generarTokenResena(): string {
  return randomBytes(24).toString('base64url');
}

/** Enlace que se le manda al huésped, en su idioma. */
export function enlaceResena(token: string, idioma?: unknown): string {
  return `${urlPublica()}/review/${token}?lang=${idiomaDeValor(idioma)}`;
}

/**
 * Devuelve el token de reseña de la reserva, generándolo si aún no lo tiene.
 * Al vuelo (no solo al hacer check-out) para que reservas anteriores tengan
 * enlace la primera vez que se les pide reseña.
 */
export async function asegurarTokenResena(reserva: {
  id: string;
  tokenResena?: string | null;
}): Promise<string> {
  const existente = (reserva.tokenResena || '').trim();
  if (existente) return existente;

  const token = generarTokenResena();
  await prisma.hospitalityReservation.update({
    where: { id: reserva.id },
    data: { tokenResena: token },
    select: { id: true },
  });
  return token;
}
