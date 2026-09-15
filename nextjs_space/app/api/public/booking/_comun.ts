/**
 * Piezas comunes de las rutas públicas del Booking Engine.
 *
 * Viven en una carpeta con guion bajo a propósito: Next.js no la convierte en
 * ruta, y así las tres rutas de reserva directa comparten la lectura del rango y
 * el formato del error en lugar de repetirlos.
 */

import { NextResponse } from 'next/server';

/**
 * Fecha `YYYY-MM-DD` interpretada en el día local del servidor.
 *
 * No se usa `new Date('2026-09-20')`: eso es medianoche UTC, y en una zona con
 * offset negativo se lee como el día anterior. Toda la disponibilidad del módulo
 * razona en días locales (`startOfDay`, `toIsoDate`), así que la reserva directa
 * tiene que entrar por la misma puerta o bloquearía la noche equivocada.
 */
export function parsearFechaLocal(valor: unknown): Date | null {
  if (typeof valor !== 'string') return null;
  const coincidencia = valor.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!coincidencia) return null;

  const anio = Number(coincidencia[1]);
  const mes = Number(coincidencia[2]);
  const dia = Number(coincidencia[3]);
  const fecha = new Date(anio, mes - 1, dia);

  // Rechaza fechas imposibles que `Date` normaliza en silencio (2026-02-31).
  if (
    fecha.getFullYear() !== anio ||
    fecha.getMonth() !== mes - 1 ||
    fecha.getDate() !== dia
  ) {
    return null;
  }
  return fecha;
}

export interface RangoSolicitado {
  checkIn: Date;
  checkOut: Date;
  adultos: number;
  ninos: number;
}

function aEntero(valor: unknown, porDefecto: number): number {
  const numero = Number(valor);
  return Number.isFinite(numero) ? Math.trunc(numero) : porDefecto;
}

export type LecturaRango =
  | { ok: true; rango: RangoSolicitado }
  | { ok: false; error: string };

/** Lee y valida el rango de fechas y la ocupación de una solicitud pública. */
export function leerRango(cuerpo: Record<string, unknown>): LecturaRango {
  const checkIn = parsearFechaLocal(cuerpo.checkIn);
  const checkOut = parsearFechaLocal(cuerpo.checkOut);

  if (!checkIn || !checkOut) {
    return { ok: false, error: 'Indica la fecha de entrada y la de salida.' };
  }
  if (checkOut.getTime() <= checkIn.getTime()) {
    return { ok: false, error: 'La salida tiene que ser posterior a la entrada.' };
  }

  const adultos = Math.min(30, Math.max(1, aEntero(cuerpo.adultos, 1)));
  const ninos = Math.min(30, Math.max(0, aEntero(cuerpo.ninos, 0)));
  if (adultos + ninos > 40) {
    return { ok: false, error: 'Demasiados huéspedes para una sola reserva.' };
  }

  return { ok: true, rango: { checkIn, checkOut, adultos, ninos } };
}

/** Respuesta de error de la API pública: siempre con una frase entendible. */
export function errorPublico(mensaje: string, status = 400) {
  return NextResponse.json({ ok: false, error: mensaje }, { status });
}

/** Lee el cuerpo JSON sin reventar cuando no lo es. */
export async function leerCuerpo(request: Request): Promise<Record<string, unknown>> {
  const cuerpo = await request.json().catch(() => null);
  return cuerpo && typeof cuerpo === 'object' ? (cuerpo as Record<string, unknown>) : {};
}

/** Texto opcional recortado, con el vacío convertido en nulo. */
export function textoOpcional(valor: unknown, maximo = 500): string | null {
  if (typeof valor !== 'string') return null;
  const limpio = valor.trim().slice(0, maximo);
  return limpio.length ? limpio : null;
}
