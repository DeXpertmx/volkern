/**
 * Operaciones operativas de Hospitality (plan maestro §18).
 *
 * §18.1 Check-in:
 *   - actualizar estado de la reserva → checked_in
 *   - registrar timestamp
 *   - actualizar estado operativo de la unidad → occupied
 *   - publicar evento
 *   - disparar automatizaciones configuradas
 *
 * §18.2 Check-out:
 *   - actualizar la reserva → checked_out
 *   - registrar timestamp
 *   - cambiar unidad a estado de limpieza → cleaning
 *   - crear tarea de limpieza (HospitalityCleaningTask)
 *   - recalcular disponibilidad y empujar al exterior (dispatcher)
 *
 * Reglas transversales:
 *   - Aislamiento por tenant: las consultas filtran por { id, tenantId }.
 *   - Los errores de sincronización NUNCA rompen el flujo principal.
 *   - Una tarea de limpieza duplicada (misma unidad + reserva) se evita.
 */

import { prisma } from '@/lib/db';
import { dispatchConnectivityPush } from './sync';

export type CheckOperation = 'checkin' | 'checkout';

export interface CheckOperationResult {
  ok: boolean;
  status?: string;
  reservationId?: string;
  cleaningTaskId?: string;
  error?: string;
}

/**
 * Realiza check-in o check-out de una reserva verificando que pertenezca
 * al tenant. Tras el check-out: unidad → cleaning + tarea de limpieza +
 * push de disponibilidad.
 */
export async function performCheckOperation(
  tenantId: string,
  reservationId: string,
  operation: CheckOperation
): Promise<CheckOperationResult> {
  const reservation = await prisma.hospitalityReservation.findFirst({
    where: { id: reservationId, tenantId },
    include: { unit: { select: { id: true, nombre: true } } },
  });

  if (!reservation) {
    return { ok: false, error: 'Reserva no encontrada' };
  }
  if (reservation.estado === 'cancelled' || reservation.estado === 'no_show') {
    return { ok: false, error: `No se puede operar una reserva en estado ${reservation.estado}` };
  }

  const isCheckin = operation === 'checkin';

  // Validar transiciones válidas
  if (isCheckin && reservation.estado === 'checked_in') {
    return { ok: false, error: 'La reserva ya tiene check-in realizado' };
  }
  if (!isCheckin && reservation.estado === 'checked_out') {
    return { ok: false, error: 'La reserva ya tiene check-out realizado' };
  }
  if (!isCheckin && reservation.estado !== 'checked_in' && reservation.estado !== 'confirmed') {
    return { ok: false, error: `No se puede hacer check-out desde el estado ${reservation.estado}` };
  }

  // §18.1: check-in → reserva checked_in, unidad occupied
  if (isCheckin) {
    const updated = await prisma.hospitalityReservation.update({
      where: { id: reservation.id },
      data: { estado: 'checked_in' },
    });

    if (reservation.unitId) {
      await prisma.hospitalityUnit
        .update({
          where: { id: reservation.unitId },
          data: { estado: 'occupied' },
        })
        .catch((e) =>
          console.error('[Hospitality] Error actualizando unidad a occupied:', e)
        );
    }

    // Push de disponibilidad (la unidad queda ocupada).
    try {
      await dispatchConnectivityPush(tenantId, reservation.propertyId, 'reserva_creada', {
        skipRates: true,
      });
    } catch (e) {
      console.error('[Hospitality] Error en push tras check-in:', e);
    }

    return { ok: true, status: updated.estado, reservationId: updated.id };
  }

  // §18.2: check-out → reserva checked_out, unidad cleaning, tarea de limpieza
  const updated = await prisma.hospitalityReservation.update({
    where: { id: reservation.id },
    data: { estado: 'checked_out' },
  });

  let cleaningTaskId: string | undefined;
  if (reservation.unitId) {
    // Unidad → cleaning
    await prisma.hospitalityUnit
      .update({
        where: { id: reservation.unitId },
        data: { estado: 'cleaning' },
      })
      .catch((e) =>
        console.error('[Hospitality] Error actualizando unidad a cleaning:', e)
      );

    // Tarea de limpieza (evitar duplicados por unidad + reserva)
    const existing = await prisma.hospitalityCleaningTask.findFirst({
      where: {
        tenantId,
        unitId: reservation.unitId,
        reservationId: reservation.id,
        estado: { in: ['pending', 'in_progress'] },
      },
    });
    if (!existing) {
      const task = await prisma.hospitalityCleaningTask.create({
        data: {
          tenantId,
          unitId: reservation.unitId,
          reservationId: reservation.id,
          prioridad: 'normal',
          notas: 'Limpieza automática tras check-out',
        },
      });
      cleaningTaskId = task.id;
    } else {
      cleaningTaskId = existing.id;
    }
  }

  // Push de disponibilidad (la unidad queda fuera de venta en limpieza).
  try {
    await dispatchConnectivityPush(tenantId, reservation.propertyId, 'unidad_cambiada', {
      skipRates: true,
    });
  } catch (e) {
    console.error('[Hospitality] Error en push tras check-out:', e);
  }

  return {
    ok: true,
    status: updated.estado,
    reservationId: updated.id,
    cleaningTaskId,
  };
}