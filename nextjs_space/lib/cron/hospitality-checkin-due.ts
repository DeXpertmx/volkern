import { prisma } from '../db';
import { emitCheckinDue } from '../hospitality/events';
import { dispararComunicacionReserva } from '../hospitality/comunicaciones';

/**
 * Cron `hospitality_checkin_due` (plan maestro §22) — escanea reservas
 * confirmadas/pendientes con check-in en las próximas 24 horas y, por cada
 * una, hace dos cosas:
 *
 * 1. Envía la plantilla activa `pre_llegada` del tenant (§21: "antes de
 *    llegada") — típica mensaje de bienvenida/instrucciones 24h antes del
 *    check-in. Es un envío directo: no depende de que exista una regla de
 *    automatización.
 *
 * 2. Emite el evento `hospitality_checkin_due` para que las reglas de
 *    automatización del tenant (p.ej. "crear tarea de preparación") se
 *    disparen además por el Automation Engine.
 *
 * Guard contra repetidos (compartido por ambos efectos): se registra un
 * AuditLog (accion `hospitality_checkin_due`, entidad `reservation`,
 * entidadId = reservation.id) en cada disparo; si la reserva ya tiene un log
 * de este tipo desde `since` (24h antes de ahora), se omite — así el scan
 * horario no reenvía el mensaje de pre-llegada cada hora.
 */
export async function runHospitalityCheckinDueScan(hours = 24) {
  const now = new Date();
  const since = new Date(now.getTime() - hours * 60 * 60 * 1000);
  const horizon = new Date(now.getTime() + hours * 60 * 60 * 1000);
  console.log(`[Cron] 🏨 Escaneando reservas con check-in antes de ${horizon.toISOString()}...`);

  try {
    // 1. Reservas candidatas: estado activo, checkIn en (ahora, ahora+24h).
    const candidates = await prisma.hospitalityReservation.findMany({
      where: {
        estado: { in: ['pending', 'confirmed'] },
        checkIn: { gt: now, lte: horizon },
      },
      select: {
        id: true,
        tenantId: true,
        propertyId: true,
        unitId: true,
        contactId: true,
        channel: true,
        externalBookingId: true,
        checkIn: true,
        checkOut: true,
        guestData: true,
      },
      take: 300,
    });

    if (candidates.length === 0) {
      console.log('[Cron] ✅ hospitality_checkin_due: sin candidatos');
      return { total: 0, fired: 0, skipped: 0, preLlegadaEnviados: 0, preLlegadaFallidos: 0 };
    }

    // 2. A quién emitir: tenants con reglas activas O con plantilla
    //    pre_llegada activa (el envío directo no debe depender de reglas).
    const trigger = 'hospitality_checkin_due';
    const [tenantsWithRules, tenantsWithTemplate] = await Promise.all([
      prisma.automationRule.findMany({
        where: { triggerType: trigger, isActive: true },
        select: { tenantId: true },
        distinct: ['tenantId'],
      }),
      prisma.hospitalityCommunicationTemplate.findMany({
        where: { evento: 'pre_llegada', activo: true },
        select: { tenantId: true },
        distinct: ['tenantId'],
      }),
    ]);
    const activeTenantIds = new Set<string>([
      ...tenantsWithRules.map((t) => t.tenantId),
      ...tenantsWithTemplate.map((t) => t.tenantId),
    ]);
    console.log(
      `[Cron] ${activeTenantIds.size} tenants con reglas o plantilla pre_llegada activos para ${trigger}`,
    );

    let fired = 0;
    let skipped = 0;
    let preLlegadaEnviados = 0;
    let preLlegadaFallidos = 0;

    for (const res of candidates) {
      if (!activeTenantIds.has(res.tenantId)) {
        skipped++;
        continue;
      }

      // Guard contra repetidos: ya disparado en las últimas `hours` horas.
      // OJO: es `gte: since` (ventana hacia atrás); con `gte: now` ningún log
      // previo podía coincidir y el envío se repetiría cada ciclo.
      const alreadyFired = await prisma.auditLog.findFirst({
        where: {
          tenantId: res.tenantId,
          accion: 'hospitality_checkin_due',
          entidad: 'reservation',
          entidadId: res.id,
          fechaCreacion: { gte: since },
        },
        select: { id: true },
      });
      if (alreadyFired) {
        skipped++;
        continue;
      }

      // 1. Pre-llegada (§21): envío directo de la plantilla activa del tenant.
      //    Nunca lanza; devuelve por plantilla { ok, error }.
      try {
        const resultados = await dispararComunicacionReserva({
          tenantId: res.tenantId,
          reservationId: res.id,
          evento: 'pre_llegada',
        });
        for (const r of resultados) {
          if (r.ok) preLlegadaEnviados++;
          else preLlegadaFallidos++;
        }
      } catch (err: any) {
        // Aislado a propósito: un fallo de envío no debe impedir el evento.
        console.error(
          `[Cron] pre_llegada falló para reserva ${res.id}:`,
          err?.message || err,
        );
      }

      // 2. Evento para el Automation Engine (reglas del tenant).
      emitCheckinDue({
        tenantId: res.tenantId,
        reservationId: res.id,
        propertyId: res.propertyId,
        unitId: res.unitId,
        contactId: res.contactId,
        channel: res.channel,
        externalBookingId: res.externalBookingId,
        checkIn: res.checkIn,
        checkOut: res.checkOut,
        guestData: res.guestData,
      });

      // Registrar el disparo (auditable) — evita repetir en el siguiente ciclo.
      await prisma.auditLog.create({
        data: {
          tenantId: res.tenantId,
          accion: 'hospitality_checkin_due',
          entidad: 'reservation',
          entidadId: res.id,
          descripcion: `Check-in en las próximas ${hours}h disparado por cron (horizonte ${horizon.toISOString()})`,
          metadata: {
            trigger,
            reservationId: res.id,
            checkIn: res.checkIn?.toISOString(),
            externalBookingId: res.externalBookingId,
            preLlegada: { evento: 'pre_llegada' },
          },
        },
      });
      fired++;
    }

    console.log(
      `[Cron] ✅ hospitality_checkin_due: ${fired} disparados, ${skipped} omitidos, ${candidates.length} candidatos, pre_llegada enviados=${preLlegadaEnviados} fallidos=${preLlegadaFallidos}`,
    );
    return {
      total: candidates.length,
      fired,
      skipped,
      preLlegadaEnviados,
      preLlegadaFallidos,
    };
  } catch (err: any) {
    console.error('[Cron] ❌ Error fatal en scan hospitality_checkin_due:', err);
    return {
      total: 0,
      fired: 0,
      skipped: 0,
      preLlegadaEnviados: 0,
      preLlegadaFallidos: 0,
      error: err?.message,
    };
  }
}
