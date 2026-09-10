import { prisma } from '../db';
import { emitCheckinDue } from '../hospitality/events';

/**
 * Cron `hospitality_checkin_due` (plan maestro §22) — escanea reservas
 * confirmadas/pendientes con check-in en las próximas 24 horas y emite el
 * evento `hospitality_checkin_due` para que las reglas de automatización
 * del tenant (p.ej. "enviar instrucciones de acceso") se disparen.
 *
 * Guard contra repetidos: se registra un AuditLog (accion
 * `hospitality_checkin_due`, entidad `reservation`, entidadId =
 * reservation.id) en cada disparo; si la reserva ya tiene un log de este
 * tipo en las últimas 24h, se omite (auditable y trazable). Solo emite
 * cuando el tenant tiene al menos una regla activa con ese trigger.
 */
export async function runHospitalityCheckinDueScan(hours = 24) {
  const now = new Date();
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
      return { total: 0, fired: 0, skipped: 0 };
    }

    // 2. Tenants con reglas activas para el trigger (evitar emitir en vano).
    const trigger = 'hospitality_checkin_due';
    const tenantsWithRules = await prisma.automationRule.findMany({
      where: { triggerType: trigger, isActive: true },
      select: { tenantId: true },
      distinct: ['tenantId'],
    });
    const activeTenantIds = new Set(tenantsWithRules.map((t) => t.tenantId));
    console.log(`[Cron] ${activeTenantIds.size} tenants con reglas activas para ${trigger}`);

    let fired = 0;
    let skipped = 0;

    for (const res of candidates) {
      if (!activeTenantIds.has(res.tenantId)) {
        skipped++;
        continue;
      }

      // Guard contra repetidos: ya disparado en las últimas 24h.
      const alreadyFired = await prisma.auditLog.findFirst({
        where: {
          tenantId: res.tenantId,
          accion: 'hospitality_checkin_due',
          entidad: 'reservation',
          entidadId: res.id,
          fechaCreacion: { gte: now },
        },
        select: { id: true },
      });
      if (alreadyFired) {
        skipped++;
        continue;
      }

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
          },
        },
      });
      fired++;
    }

    console.log(`[Cron] ✅ hospitality_checkin_due: ${fired} disparados, ${skipped} omitidos, ${candidates.length} candidatos`);
    return { total: candidates.length, fired, skipped };
  } catch (err: any) {
    console.error('[Cron] ❌ Error fatal en scan hospitality_checkin_due:', err);
    return { total: 0, fired: 0, skipped: 0, error: err?.message };
  }
}