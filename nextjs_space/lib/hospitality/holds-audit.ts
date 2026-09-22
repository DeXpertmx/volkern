/**
 * Traza de la CONFIRMACIÓN de un hold — módulo de servidor (usa la BD).
 *
 * El barrido de caducidad escribe `hospitality_hold_expirado` por cada hold que
 * murió (ver `lib/cron/hospitality-holds.ts`). Este módulo escribe su par,
 * `hospitality_hold_confirmado`, cuando un `pending` pasa a `confirmed` — la
 * decisión humana (o del canal) que rescata el hold.
 *
 * Con los dos eventos, la tasa de abandono de holds se calcula exacta y con la
 * misma fuente que el resto de la vertical (la auditoría), sin contadores
 * paralelos que puedan desviarse de lo que realmente pasó.
 *
 * **Nunca lanza**: una traza no puede romper la operación que la produce.
 */

import { prisma } from '../db';
import { ACCION_AUDIT_HOLD_CONFIRMADO } from './holds';

export interface EntradaHoldConfirmado {
  tenantId: string;
  reservationId: string;
  propertyId?: string | null;
  /** Canal de la reserva (para separar holds propios de los del canal). */
  channel?: string | null;
  /** Quién confirmó: el operador (API/UI) o el canal (webhook). */
  origen: 'operador' | 'canal';
}

/**
 * Deja traza de un hold confirmado. Devuelve `true` si la traza quedó escrita.
 * Cualquier fallo se registra y se devuelve `false`: la confirmación de la
 * reserva ya ocurrió y no se revierte por no poder auditar.
 */
export async function registrarHoldConfirmado(
  entrada: EntradaHoldConfirmado
): Promise<boolean> {
  try {
    await prisma.auditLog.create({
      data: {
        tenantId: entrada.tenantId,
        accion: ACCION_AUDIT_HOLD_CONFIRMADO,
        entidad: 'reservation',
        entidadId: entrada.reservationId,
        descripcion: `Hold confirmado por ${entrada.origen}`,
        metadata: {
          reservationId: entrada.reservationId,
          propertyId: entrada.propertyId ?? null,
          channel: entrada.channel ?? null,
          origen: entrada.origen,
        },
      },
    });
    return true;
  } catch (e) {
    console.error('[Hospitality] Error registrando el hold confirmado:', e);
    return false;
  }
}
