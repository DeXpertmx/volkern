import { prisma } from '../db';
import { dispararComunicacionReserva } from '../hospitality/comunicaciones';

/**
 * Cron de solicitud de reseña (plan maestro §21: "solicitud de reseña — enviar
 * según las reglas configuradas").
 *
 * Escanea reservas que ya hicieron check-out y envía la plantilla activa
 * `resena` del tenant. Dos decisiones de diseño:
 *
 * 1. **Retardo**: no se pide reseña al salir (para eso está `post_salida`),
 *    sino `delayHours` después (24h por defecto), cuando la estancia ya se
 *    puede valorar.
 * 2. **Ventana de recuperación**: se miran los check-outs de las últimas
 *    `maxAgeHours` horas (72h por defecto). Si el cron no corrió un día, la
 *    solicitud no se pierde; el guard por reserva impide duplicados.
 *
 * Idempotencia: se registra un AuditLog (`hospitality_review_request`,
 * entidad `reservation`) SOLO cuando el envío tuvo éxito. Si el envío falla,
 * no se marca y el siguiente ciclo lo reintenta mientras la reserva siga
 * dentro de la ventana — a diferencia de la pre-llegada, aquí reintentar es
 * seguro (el huésped ya se fue y el guard está por reserva, no por ciclo).
 */
export async function runHospitalityReviewRequestScan(delayHours = 24, maxAgeHours = 72) {
  const now = new Date();
  const desde = new Date(now.getTime() - maxAgeHours * 60 * 60 * 1000);
  const hasta = new Date(now.getTime() - delayHours * 60 * 60 * 1000);
  console.log(
    `[Cron] ⭐ Buscando check-outs entre ${desde.toISOString()} y ${hasta.toISOString()} para solicitar reseña...`,
  );

  try {
    // 1. Reservas candidatas: ya salieron, dentro de la ventana de recuperación.
    const candidates = await prisma.hospitalityReservation.findMany({
      where: {
        estado: 'checked_out',
        checkOut: { gte: desde, lte: hasta },
      },
      select: {
        id: true,
        tenantId: true,
        propertyId: true,
        unitId: true,
        checkOut: true,
        externalBookingId: true,
      },
      take: 300,
    });

    if (candidates.length === 0) {
      console.log('[Cron] ✅ hospitality_review_request: sin candidatos');
      return { total: 0, enviados: 0, fallidos: 0, skipped: 0 };
    }

    // 2. Solo tenants con plantilla `resena` activa: sin plantilla no hay nada
    //    que enviar (no se inventan mensajes por defecto).
    const tenantsWithTemplate = await prisma.hospitalityCommunicationTemplate.findMany({
      where: { evento: 'resena', activo: true },
      select: { tenantId: true },
      distinct: ['tenantId'],
    });
    const activeTenantIds = new Set<string>(tenantsWithTemplate.map((t) => t.tenantId));
    console.log(
      `[Cron] ${activeTenantIds.size} tenants con plantilla resena activa (de ${candidates.length} candidatos)`,
    );

    let enviados = 0;
    let fallidos = 0;
    let skipped = 0;

    for (const res of candidates) {
      if (!activeTenantIds.has(res.tenantId)) {
        skipped++;
        continue;
      }

      // Guard por reserva: la reseña se pide una sola vez.
      const yaEnviado = await prisma.auditLog.findFirst({
        where: {
          tenantId: res.tenantId,
          accion: 'hospitality_review_request',
          entidad: 'reservation',
          entidadId: res.id,
        },
        select: { id: true },
      });
      if (yaEnviado) {
        skipped++;
        continue;
      }

      let enviadosReserva = 0;
      let fallidosReserva = 0;
      try {
        const resultados = await dispararComunicacionReserva({
          tenantId: res.tenantId,
          reservationId: res.id,
          evento: 'resena',
        });
        for (const r of resultados) {
          if (r.ok) enviadosReserva++;
          else fallidosReserva++;
        }
      } catch (err: any) {
        // Aislado a propósito: un fallo de envío no debe romper el scan.
        console.error(`[Cron] resena falló para reserva ${res.id}:`, err?.message || err);
        fallidosReserva++;
      }

      if (enviadosReserva === 0) {
        // Sin éxito no se marca: el próximo ciclo lo reintenta dentro de la
        // ventana (72h) en lugar de perder la solicitud en silencio.
        console.error(`[Cron] resena sin envío exitoso para reserva ${res.id}; se reintentará`);
        fallidos += fallidosReserva > 0 ? fallidosReserva : 1;
        continue;
      }

      enviados += enviadosReserva;
      fallidos += fallidosReserva;
      await prisma.auditLog.create({
        data: {
          tenantId: res.tenantId,
          accion: 'hospitality_review_request',
          entidad: 'reservation',
          entidadId: res.id,
          descripcion: `Solicitud de reseña enviada ${delayHours}h después del check-out`,
          metadata: {
            reservationId: res.id,
            propertyId: res.propertyId,
            unitId: res.unitId,
            checkOut: res.checkOut?.toISOString(),
            externalBookingId: res.externalBookingId,
            evento: 'resena',
          },
        },
      });
    }

    console.log(
      `[Cron] ✅ hospitality_review_request: ${enviados} enviados, ${fallidos} fallidos, ${skipped} omitidos, ${candidates.length} candidatos`,
    );
    return { total: candidates.length, enviados, fallidos, skipped };
  } catch (err: any) {
    console.error('[Cron] ❌ Error fatal en scan hospitality_review_request:', err);
    return { total: 0, enviados: 0, fallidos: 0, skipped: 0, error: err?.message };
  }
}
