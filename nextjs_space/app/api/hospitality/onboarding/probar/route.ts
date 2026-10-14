export const dynamic = 'force-dynamic';

/**
 * POST /api/hospitality/onboarding/probar — pasos 7, 8 y 9 de §31.
 *
 * - `disponibilidad`: empuja el inventario de la propiedad y comprueba que el
 *   proveedor lo acepta.
 * - `tarifas`: empuja precios y restricciones y comprueba que los acepta.
 * - `reserva`: envía una reserva de prueba por el mismo camino que las reales
 *   (Reservation Engine, idempotente) y verifica que se registra. Después se
 *   elimina la reserva, sus eventos y el contacto de prueba: la prueba no debe
 *   dejar rastro en los datos del cliente. Borrarla NO deshace el push que hizo
 *   al crearse, así que la limpieza vuelve a empujar la disponibilidad: sin eso
 *   el proveedor se queda con las noches de la prueba cerradas —noches fantasma
 *   que el hotel pierde en los canales y en su propia web—.
 *
 * Cada prueba queda auditada en HospitalitySyncLog con `operacion: onboarding`,
 * que es lo que lee el wizard para saber si el paso pasó.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { authenticateRequest } from '@/lib/api-key-auth';
import { exigirPermisoHospitality } from '@/lib/hospitality/permissions';
import { logAuditAction } from '@/lib/permissions';
import { loadOnboardingSnapshot } from '@/lib/hospitality/onboarding-status';
import { dispatchConnectivityPush } from '@/lib/hospitality/sync';
import { processReservationWebhook } from '@/lib/hospitality/reservations';
import {
  buildTestReservationPayload,
  SYNC_TIPOS_ONBOARDING,
  type PruebaOnboarding,
} from '@/lib/hospitality/onboarding';

const PRUEBAS: PruebaOnboarding[] = ['disponibilidad', 'tarifas', 'reserva'];

/**
 * Días que cubre la reposición de disponibilidad tras limpiar la prueba.
 * La estancia de prueba entra mañana (2 noches por defecto), así que este
 * horizonte la cubre de sobra y coincide con el de la prueba de disponibilidad.
 */
const DIAS_REPOSICION = 30;

function respuesta(ok: boolean, prueba: string, extra: Record<string, unknown>) {
  return NextResponse.json({ ok, prueba, ...extra }, { status: 200 });
}

export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.valid) return NextResponse.json({ error: auth.error }, { status: 401 });
    // La capacidad la decide el rol (§27): sin ella, 403 con el permiso exacto.
    const sinPermiso = exigirPermisoHospitality(auth, 'integraciones.gestionar');
    if (sinPermiso) return sinPermiso;

    const tenantId = auth.tenant!.id;
    const body = await req.json().catch(() => ({}));
    const propertyId = typeof body?.propertyId === 'string' ? body.propertyId.trim() : '';
    const prueba = body?.prueba as PruebaOnboarding;

    if (!propertyId) {
      return respuesta(false, String(prueba || ''), { error: 'propertyId es requerido' });
    }
    if (!PRUEBAS.includes(prueba)) {
      return respuesta(false, String(prueba || ''), { error: 'Prueba no soportada' });
    }

    const resultado = await loadOnboardingSnapshot(tenantId, propertyId);
    if (!resultado.ok) {
      return respuesta(false, prueba, { error: resultado.error });
    }
    const { snapshot } = resultado;

    // ── Pruebas de push (7 y 8) ────────────────────────────────────────────
    if (prueba === 'disponibilidad' || prueba === 'tarifas') {
      const soloTarifas = prueba === 'tarifas';

      if (!snapshot.hotelCode || snapshot.unidadesVinculadas === 0) {
        return respuesta(false, prueba, {
          error: 'Primero vincula al menos una unidad con su habitación y tarifa.',
        });
      }

      const push = await dispatchConnectivityPush(tenantId, propertyId, 'onboarding', {
        diasHorizonte: 30,
        skipRates: !soloTarifas,
        skipInventory: soloTarifas,
      });

      const detalle = {
        inventory: push.inventory,
        rates: push.rates,
        inventoryRestrictions: push.inventoryRestrictions,
        rateRestrictions: push.rateRestrictions,
        pushCount: push.pushCount,
        errores: push.errores,
        // Qué descartó el canal, atribuido a las unidades del hotel. El error de
        // abajo solo puede nombrar códigos del proveedor; esto nombra la unidad
        // que hay que arreglar, que es lo único accionable.
        rechazo: push.rechazo,
      };

      if (push.pushCount === 0) {
        return respuesta(false, prueba, {
          error: soloTarifas
            ? 'No se empujó ninguna tarifa: revisa que las unidades tengan un plan de tarifa activo con precio.'
            : 'No se empujó ninguna disponibilidad: revisa que la propiedad tenga unidades vinculadas.',
          detalle,
        });
      }

      const ok = soloTarifas ? push.ok && push.rates.ok : push.ok && push.inventory.ok;
      return respuesta(ok, prueba, {
        detalle,
        ...(ok
          ? {}
          : {
              error: soloTarifas
                ? push.rates.error || 'El proveedor rechazó la actualización de tarifas'
                : push.inventory.error || 'El proveedor rechazó la actualización de disponibilidad',
            }),
      });
    }

    // ── Prueba de reserva (9) ─────────────────────────────────────────────
    const unidad = snapshot.unidades.find((u) => u.vinculada && u.roomCode);
    if (!snapshot.hotelCode || !unidad) {
      return respuesta(false, prueba, {
        error: 'Primero vincula al menos una unidad con su habitación y tarifa.',
      });
    }

    const payload = buildTestReservationPayload({
      hotelCode: snapshot.hotelCode,
      roomCode: unidad.roomCode!,
      rateplanCode: unidad.rateplanCode,
      sufijo: `${propertyId}-${Date.now()}`,
      // La prueba se emite en la divisa del hotel: si volviera en pesos, la
      // reserva de prueba enseñaría un importe que el hotel no reconoce.
      moneda: auth.tenant!.moneda,
    });

    const inicio = Date.now();
    const process = await processReservationWebhook(payload);
    const duracionMs = Date.now() - inicio;

    const reserva = await prisma.hospitalityReservation.findFirst({
      where: { tenantId, externalBookingId: payload.bookingId },
      select: { id: true, unitId: true, checkIn: true, checkOut: true, channel: true },
    });

    const ok = process.ok && !!reserva;

    // Limpieza: la reserva de prueba no debe quedar en los datos del cliente.
    let limpieza: 'completa' | 'parcial' = 'completa';
    // Si la reserva llegó a borrarse: es lo que decide si hay que reponer
    // disponibilidad (ver más abajo).
    let reservaBorrada = false;
    try {
      if (reserva) {
        await prisma.hospitalityReservation.delete({ where: { id: reserva.id } });
        reservaBorrada = true;
      }
      await prisma.hospitalityWebhookEvent.deleteMany({ where: { bookingId: payload.bookingId } });

      const email = payload.guest?.email;
      if (email) {
        const contacto = await prisma.contact.findFirst({
          where: { tenantId, email },
          select: { id: true },
        });
        if (contacto) {
          const otras = await prisma.hospitalityReservation.count({
            where: { tenantId, contactId: contacto.id },
          });
          if (otras === 0) {
            await prisma.contact.delete({ where: { id: contacto.id } });
          }
        }
      }
    } catch (e) {
      console.error('[onboarding] Error limpiando la reserva de prueba:', e);
      limpieza = 'parcial';
    }

    // ── Reposición de disponibilidad ───────────────────────────────────────
    // Crear la reserva de prueba empujó inventario y restricciones al proveedor
    // (`reserva_creada`, el mismo camino que las reservas reales). Borrarla del
    // ERP no deshace ese push: sin volver a empujar, el calendario externo se
    // queda con esas noches cerradas y el hotel las pierde en los canales. La
    // disponibilidad se recalcula SIEMPRE desde el estado interno —que ya no
    // tiene la reserva—, así que re-empujar por el dispatcher normal es
    // exactamente lo que reabre las noches.
    //
    // Solo cuando la reserva llegó a borrarse: con la limpieza parcial la
    // reserva sigue en el sistema y sus noches siguen ocupadas de verdad.
    let reposicion: { ok: boolean; pushCount: number; errores: number } | null = null;
    if (reservaBorrada) {
      try {
        const rep = await dispatchConnectivityPush(tenantId, propertyId, 'onboarding_limpieza', {
          diasHorizonte: DIAS_REPOSICION,
        });
        reposicion = { ok: rep.ok, pushCount: rep.pushCount, errores: rep.errores };
      } catch (e) {
        console.error('[onboarding] Error reponiendo la disponibilidad de la prueba:', e);
        reposicion = { ok: false, pushCount: 0, errores: 1 };
      }
      // Un pushCount en 0 también deja las noches cerradas: no se reabrió nada.
      if (!reposicion.ok || reposicion.pushCount === 0) {
        console.error(
          '[onboarding] La reserva de prueba se borró pero la disponibilidad no se repuso:',
          JSON.stringify(reposicion)
        );
      }
    }
    const reposicionCorrecta = !!reposicion && reposicion.ok && reposicion.pushCount > 0;

    const errorMensaje = ok
      ? null
      : process.error || 'La reserva de prueba no se registró en el sistema';

    try {
      await prisma.hospitalitySyncLog.create({
        data: {
          tenantId,
          propertyId,
          tipo: SYNC_TIPOS_ONBOARDING.reserva,
          operacion: 'onboarding',
          estado: ok ? 'exito' : 'error',
          duracionMs,
          responseBody: {
            bookingId: payload.bookingId,
            estado: process.status,
            unidad: unidad.nombre,
            roomCode: unidad.roomCode,
            rateplanCode: unidad.rateplanCode,
            limpieza,
            reposicion,
          } as any,
          errorMensaje,
        },
      });
    } catch (e) {
      console.error('[onboarding] Error registrando la prueba de reserva:', e);
    }

    await logAuditAction(
      auth.user!.id,
      tenantId,
      'ejecutar',
      'hospitality_onboarding_reserva_prueba',
      propertyId,
      ok
        ? `Reserva de prueba recibida y eliminada (${unidad.nombre} · ${unidad.roomCode})`
        : `Reserva de prueba fallida: ${errorMensaje}`
    ).catch(() => {});

    // Si la reserva se borró pero las noches no se reabrieron, el operador tiene
    // que enterarse: es el único momento en el que alguien está mirando esta
    // prueba. El paso no se marca fallido —la reserva llegó bien—, pero la
    // prueba lo dice y queda en el log.
    const aviso =
      ok && reservaBorrada && !reposicionCorrecta
        ? 'La reserva de prueba se eliminó, pero no se pudo reponer la disponibilidad: esas noches siguen cerradas en el proveedor. Vuelve a empujar la disponibilidad desde el panel de conectividad.'
        : null;

    return respuesta(ok, prueba, {
      detalle: {
        estado: process.status,
        unidad: unidad.nombre,
        roomCode: unidad.roomCode,
        rateplanCode: unidad.rateplanCode,
        checkIn: reserva?.checkIn ?? payload.checkin,
        checkOut: reserva?.checkOut ?? payload.checkout,
        canal: payload.channel,
        limpieza,
        reposicion,
      },
      ...(ok ? {} : { error: errorMensaje }),
      ...(aviso ? { aviso } : {}),
    });
  } catch (error) {
    console.error('Error ejecutando la prueba del onboarding:', error);
    return respuesta(false, 'desconocida', { error: 'Error al ejecutar la prueba' });
  }
}
