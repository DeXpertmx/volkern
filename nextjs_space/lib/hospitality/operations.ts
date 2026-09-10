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
 * §18.3 → §17 (cierre del ciclo): al completar una tarea de limpieza,
 *   - la tarea pasa a completed
 *   - la unidad vuelve a available (o occupied si hay una reserva activa
 *     que la ocupe hoy — prevención de overbooking §16)
 *   - se empuja la disponibilidad al exterior (unidad_cambiada)
 *
 * Reglas transversales:
 *   - Aislamiento por tenant: las consultas filtran por { id, tenantId }.
 *   - Los errores de sincronización NUNCA rompen el flujo principal.
 *   - Una tarea de limpieza duplicada (misma unidad + reserva) se evita.
 *   - Completar una tarea ya completada es idempotente (no re-empuja).
 */

import { prisma } from '@/lib/db';
import { dispatchConnectivityPush } from './sync';
import { dispararComunicacionReserva } from '@/lib/hospitality/comunicaciones';

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

    // Comunicación automática §21: instrucciones de check-in (no bloqueante).
    dispararComunicacionReserva({ tenantId, reservationId: reservation.id, evento: 'check_in' })
      .catch((e: unknown) => console.error('[Hospitality] Error en comunicación de check-in:', e));

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

  // Comunicación automática §21: agradecimiento post-salida (no bloqueante).
  dispararComunicacionReserva({ tenantId, reservationId: reservation.id, evento: 'post_salida' })
    .catch((e: unknown) => console.error('[Hospitality] Error en comunicación de post-salida:', e));

  return {
    ok: true,
    status: updated.estado,
    reservationId: updated.id,
    cleaningTaskId,
  };
}

export interface CompleteCleaningResult {
  ok: boolean;
  task?: any;
  /** Estado final de la unidad tras cerrar el ciclo. */
  unitEstado?: string;
  error?: string;
}

/**
 * Cierra el ciclo de limpieza (§18.3 → §17).
 *
 * Al completar una tarea de limpieza:
 *   1. La tarea pasa a `completed`.
 *   2. La unidad vuelve a `available`, salvo que exista una reserva activa
 *      que la ocupe HOY (entonces `occupied` — no sobrevender, §16).
 *   3. Se empuja la disponibilidad al exterior (`unidad_cambiada`).
 *
 * Idempotente: si la tarea ya está completada, devuelve ok sin re-empujar.
 * Los errores de sincronización nunca rompen el cierre del ciclo.
 */
export async function completeCleaningTask(
  tenantId: string,
  taskId: string,
  extraData?: { notas?: string; responsable?: string; prioridad?: string }
): Promise<CompleteCleaningResult> {
  const task = await prisma.hospitalityCleaningTask.findFirst({
    where: { id: taskId, tenantId },
    include: { unit: { select: { id: true, propertyId: true, estado: true } } },
  });
  if (!task) {
    return { ok: false, error: 'Tarea no encontrada' };
  }
  if (task.estado === 'completed') {
    return { ok: true, task, unitEstado: task.unit?.estado };
  }

  // 1. Marcar la tarea como completada (con datos extra si vienen).
  const data: any = { estado: 'completed' };
  if (extraData?.notas !== undefined) data.notas = extraData.notas;
  if (extraData?.responsable !== undefined) data.responsable = extraData.responsable;
  if (extraData?.prioridad !== undefined) data.prioridad = extraData.prioridad;

  const updated = await prisma.hospitalityCleaningTask.update({
    where: { id: task.id },
    data,
  });

  // 2. Unidad → available (u occupied si hay reserva activa hoy).
  let unitEstado: string | undefined;
  if (task.unit) {
    const today = new Date();
    const startToday = new Date(today);
    startToday.setHours(0, 0, 0, 0);
    const endToday = new Date(startToday);
    endToday.setDate(startToday.getDate() + 1);

    const activeReservation = await prisma.hospitalityReservation.findFirst({
      where: {
        tenantId,
        unitId: task.unit.id,
        estado: { notIn: ['cancelled', 'checked_out', 'no_show'] },
        checkIn: { lt: endToday },
        checkOut: { gt: startToday },
      },
      select: { id: true },
    });

    unitEstado = activeReservation ? 'occupied' : 'available';
    await prisma.hospitalityUnit
      .update({
        where: { id: task.unit.id },
        data: { estado: unitEstado },
      })
      .catch((e) =>
        console.error('[Hospitality] Error actualizando unidad tras limpieza:', e)
      );
  }

  // 3. Push de disponibilidad (la unidad vuelve al inventario vendible).
  try {
    await dispatchConnectivityPush(tenantId, task.unit?.propertyId ?? null, 'unidad_cambiada', {
      skipRates: true,
    });
  } catch (e) {
    console.error('[Hospitality] Error en push tras limpiar unidad:', e);
  }

  return { ok: true, task: updated, unitEstado };
}