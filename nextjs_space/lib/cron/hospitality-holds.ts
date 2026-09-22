/**
 * Cron `hospitality_holds_expirados` — libera los holds olvidados.
 *
 * Una reserva `pending` es una retención: bloquea la unidad en todas las
 * vistas mientras nadie decide. Nada la caducaba (observación abierta de
 * `docs/hospitality-estados-auditoria.md`), así que un hold olvidado bloqueaba
 * la unidad indefinidamente. Este barrido los cierra:
 *
 *  - **Regla** (módulo puro `lib/hospitality/holds.ts`): caduca un `pending`
 *    que superó la ventana de su propiedad (`holdHoras`, defecto 24 h; `0` =
 *    sin caducidad). **Nunca** caduca uno con pagos registrados: eso es una
 *    decisión humana, no un barrido.
 *  - **Efecto**: el hold pasa a `cancelled` — no produce nada (no ocupó, no
 *    facturó) y toda la vertical ya sabe qué hacer con una cancelada. La
 *    unidad vuelve al inventario y se empuja a los canales (una vez por
 *    propiedad afectada, no una por reserva).
 *  - **Traza**: cada caducidad deja un `AuditLog` (`hospitality_hold_expirado`)
 *    con la ventana aplicada, y emite `reservation.cancelled` para las reglas
 *    de automatización del tenant.
 *  - **Aviso**: un push resumen por tenant (no uno por reserva) para que el
 *    operador sepa qué se liberó y por qué.
 *
 * El cierre es idempotente y seguro ante carreras: la cancelación exige que la
 * reserva siga en `pending` (`updateMany` con el estado en el `where`), así que
 * un confirmado a la vez no se pisa. El barrido corre cada hora; una ventana
 * menor que la cadencia se aplica en el primer barrido posterior.
 */

import { prisma } from '../db';
import {
  ACCION_AUDIT_HOLD_CADUCADO,
  HOLD_HORAS_POR_DEFECTO,
  holdHorasEfectivas,
  evaluarHold,
} from '../hospitality/holds';
import { dispatchConnectivityPush } from '../hospitality/sync';
import { emitReservationCancelled } from '../hospitality/events';

/**
 * Id del job en el panel de estado (`/api/cron-status`) y en el scheduler.
 * Una sola definición: la ruta del cron y el scheduler comparten el nombre.
 */
export const JOB_ID_HOLDS_CADUCADOS = 'hospitality-holds-expirados';

/** Etiqueta y cadencia del job, para el panel de estado. */
export const JOB_LABEL_HOLDS_CADUCADOS = 'Hospitality Holds Caducados';
export const JOB_SCHEDULE_HOLDS_CADUCADOS = '0 * * * *';

/** Edad mínima para mirar un hold: por debajo, ninguna ventana puede cumplirse. */
const PREFILTRO_MS = 30 * 60 * 1000;

/** Tope de reservas por barrido (el mismo orden de magnitud que los otros crons). */
const LIMITE_POR_BARRIDO = 200;

export interface ResultadoBarridoHolds {
  total: number;
  caducados: number;
  omitidos: number;
  sinCaducidad: number;
  pushes: number;
  errores: number;
  error?: string;
}

export async function runHospitalityHoldExpiryScan(
  ahora: Date = new Date(),
  opts?: { limite?: number }
): Promise<ResultadoBarridoHolds> {
  const limite = opts?.limite ?? LIMITE_POR_BARRIDO;
  const prefiltro = new Date(ahora.getTime() - PREFILTRO_MS);
  console.log(
    `[Cron] 🏨 Buscando holds pending caducados (referencia ${ahora.toISOString()})...`
  );

  const resultado: ResultadoBarridoHolds = {
    total: 0,
    caducados: 0,
    omitidos: 0,
    sinCaducidad: 0,
    pushes: 0,
    errores: 0,
  };

  try {
    const candidatas = await prisma.hospitalityReservation.findMany({
      where: {
        estado: 'pending',
        fechaCreacion: { lte: prefiltro },
      },
      select: {
        id: true,
        tenantId: true,
        propertyId: true,
        unitId: true,
        estado: true,
        contactId: true,
        channel: true,
        externalBookingId: true,
        checkIn: true,
        checkOut: true,
        guestData: true,
        fechaCreacion: true,
        payments: { select: { id: true }, take: 1 },
      },
      orderBy: { fechaCreacion: 'asc' },
      take: limite,
    });

    resultado.total = candidatas.length;
    if (candidatas.length === 0) {
      console.log('[Cron] ✅ hospitality_holds_expirados: sin candidatos');
      return resultado;
    }

    // La ventana es por propiedad: una sola consulta para todas las del barrido.
    const propiedadIds = [...new Set(candidatas.map((c) => c.propertyId))];
    const propiedades = await prisma.hospitalityProperty.findMany({
      where: { id: { in: propiedadIds } },
      select: { id: true, nombre: true, holdHoras: true },
    });
    const ventanaPorPropiedad = new Map(
      propiedades.map((p) => [
        p.id,
        { horas: holdHorasEfectivas(p.holdHoras), nombre: p.nombre },
      ])
    );

    // Propiedades y tenants afectados → un push de inventario y un aviso resumen.
    const propiedadesAfectadas = new Map<string, { tenantId: string; propertyId: string }>();
    const liberadosPorTenant = new Map<string, { cantidad: number; propiedades: Set<string> }>();

    for (const reserva of candidatas) {
      const ventana = ventanaPorPropiedad.get(reserva.propertyId);
      const horas = ventana?.horas ?? HOLD_HORAS_POR_DEFECTO;
      if (horas === 0) {
        resultado.sinCaducidad++;
        resultado.omitidos++;
        continue;
      }

      const evaluacion = evaluarHold(
        {
          estado: reserva.estado,
          fechaCreacion: reserva.fechaCreacion,
          tienePagos: reserva.payments.length > 0,
        },
        ahora,
        horas
      );
      if (!evaluacion.caduca) {
        resultado.omitidos++;
        continue;
      }

      try {
        // Carrera segura: solo cancela si sigue en pending. Si alguien la
        // confirmó entre la lectura y ahora, count = 0 y no se pisa nada.
        const cierre = await prisma.hospitalityReservation.updateMany({
          where: { id: reserva.id, estado: 'pending' },
          data: { estado: 'cancelled' },
        });
        if (cierre.count !== 1) {
          resultado.omitidos++;
          continue;
        }

        resultado.caducados++;
        const nombrePropiedad = ventana?.nombre ?? 'la propiedad';

        await prisma.auditLog
          .create({
            data: {
              tenantId: reserva.tenantId,
              accion: ACCION_AUDIT_HOLD_CADUCADO,
              entidad: 'reservation',
              entidadId: reserva.id,
              descripcion: `Hold caducado tras ${horas} h sin confirmar (${nombrePropiedad})`,
              metadata: {
                reservationId: reserva.id,
                propertyId: reserva.propertyId,
                externalBookingId: reserva.externalBookingId,
                horasRetencion: horas,
                fechaCreacion: reserva.fechaCreacion.toISOString(),
                caducaba: evaluacion.caducaEl?.toISOString() ?? null,
              },
            },
          })
          .catch((e) =>
            console.error('[Cron] Error registrando la auditoría del hold caducado:', e)
          );

        emitReservationCancelled({
          tenantId: reserva.tenantId,
          reservationId: reserva.id,
          propertyId: reserva.propertyId,
          unitId: reserva.unitId,
          contactId: reserva.contactId,
          channel: reserva.channel,
          externalBookingId: reserva.externalBookingId,
          estado: 'cancelled',
          checkIn: reserva.checkIn,
          checkOut: reserva.checkOut,
          guestData: reserva.guestData,
        });

        propiedadesAfectadas.set(reserva.propertyId, {
          tenantId: reserva.tenantId,
          propertyId: reserva.propertyId,
        });

        const acumulado = liberadosPorTenant.get(reserva.tenantId) ?? {
          cantidad: 0,
          propiedades: new Set<string>(),
        };
        acumulado.cantidad++;
        acumulado.propiedades.add(nombrePropiedad);
        liberadosPorTenant.set(reserva.tenantId, acumulado);
      } catch (err: any) {
        // Aislado: un fallo en una reserva no detiene el barrido.
        resultado.errores++;
        console.error(
          `[Cron] Error caducando el hold ${reserva.id}:`,
          err?.message || err
        );
      }
    }

    // Inventario: la unidad vuelve al pool vendible → un push por propiedad.
    for (const { tenantId, propertyId } of propiedadesAfectadas.values()) {
      try {
        await dispatchConnectivityPush(tenantId, propertyId, 'reserva_cancelada', {
          skipRates: true,
        });
        resultado.pushes++;
      } catch (e) {
        console.error('[Cron] Error empujando disponibilidad tras caducar holds:', e);
      }
    }

    // Aviso resumen por tenant (nunca rompe el barrido).
    for (const [tenantId, info] of liberadosPorTenant.entries()) {
      try {
        const { operadoresDelTenant } = await import('../hospitality/incidencias');
        const { sendPushNotification } = await import('../services/push-notification');
        const operadores = await operadoresDelTenant(tenantId);
        if (operadores.length === 0) continue;

        const nombrePropiedades = [...info.propiedades].join(', ');
        const cuerpo =
          `${info.cantidad} ${info.cantidad === 1 ? 'reserva pendiente' : 'reservas pendientes'} ` +
          `caducó por falta de confirmación en ${nombrePropiedades}. ` +
          'Las unidades vuelven a estar disponibles para vender.';

        await Promise.all(
          operadores.map((u) =>
            sendPushNotification(u.id, {
              title: 'Holds caducados liberados',
              body: cuerpo,
              url: '/dashboard/hospitality?vista=planning',
              tag: 'hospitality-holds',
              data: { cantidad: info.cantidad },
            }).catch(() => ({ success: false }))
          )
        );
      } catch (e) {
        console.error('[Cron] Error avisando de los holds caducados:', e);
      }
    }

    console.log(
      `[Cron] ✅ hospitality_holds_expirados: ${resultado.caducados} caducados, ${resultado.omitidos} omitidos, ${resultado.pushes} pushes`
    );
    return resultado;
  } catch (error: any) {
    console.error('[Cron] Error en hospitality_holds_expirados:', error);
    return { ...resultado, error: error?.message || 'error inesperado' };
  }
}
