/**
 * lib/cron/hospitality-vinculos-pendientes.ts
 *
 * Resumen periódico de los vínculos de conectividad que el sistema creó solo
 * (webhook) y que nadie ha confirmado todavía.
 *
 * Un vínculo automático cambia la configuración de canales sin que nadie lo
 * pida: su aviso puntual se pierde si el operador no está, así que este job
 * recuerda que siguen ahí hasta que alguien los guarde desde el wizard (ese
 * guardado los marca como revisados).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * GARANTÍAS
 * ────────────────────────────────────────────────────────────────────────────
 *   • Sin vínculos pendientes no se envía nada (ni marca): el resumen nunca
 *     aparece "en vacío".
 *   • No repite el mismo recordatorio todos los días: entre resúmenes hay un
 *     intervalo mínimo, y se adelanta solo si hay vínculos nuevos desde el
 *     último aviso.
 *   • Cada envío queda auditado en HospitalitySyncLog (tipo
 *     `resumen_vinculos_automaticos`), que es también la marca del intervalo.
 *   • Un tenant que falla no impide avisar a los demás.
 *
 * Se invoca desde el scheduler (job diario) y desde
 * `GET /api/cron/hospitality-vinculos-pendientes` (disparo a demanda con
 * CRON_SECRET).
 */

import { prisma } from '@/lib/db';
import { formatDistance } from 'date-fns';
import { es } from 'date-fns/locale';
import {
  TIPO_RESUMEN_VINCULOS,
  listarVinculosAutomaticosPendientes,
  operadoresDelTenant,
  ultimoResumenVinculos,
  type VinculoAutomaticoPendiente,
} from '@/lib/hospitality/incidencias';

/** Intervalo mínimo entre resúmenes del mismo tenant. */
export const INTERVALO_RESUMEN_MS = 3 * 24 * 60 * 60 * 1000;
/** Vínculos que se detallan en el cuerpo del aviso (el resto se cuenta). */
const MAX_DETALLE = 5;

export interface HospitalityVinculosPendientesResult {
  success: boolean;
  message: string;
  tenantsConPendientes: number;
  tenantsAvisados: number;
  tenantsEnEspera: number;
  vinculosPendientes: number;
  vinculosAvisados: number;
  errores: string[];
  durationMs: number;
}

interface ResumenTenant {
  tenantId: string;
  avisado: boolean;
  pendientes: number;
  motivo?: string;
  error?: string;
}

/** ¿Toca avisar? Nunca si no hay nada; siempre si hay vínculos nuevos. */
export function tocaAvisar(
  pendientes: VinculoAutomaticoPendiente[],
  ultimoResumen: Date | null,
  ahora: Date
): { avisar: boolean; motivo: string } {
  if (pendientes.length === 0) return { avisar: false, motivo: 'sin_pendientes' };
  if (!ultimoResumen) return { avisar: true, motivo: 'primer_resumen' };

  const hayNuevos = pendientes.some((v) => new Date(v.creadoEn).getTime() > ultimoResumen.getTime());
  if (hayNuevos) return { avisar: true, motivo: 'vinculos_nuevos' };

  const desde = ahora.getTime() - ultimoResumen.getTime();
  if (desde >= INTERVALO_RESUMEN_MS) return { avisar: true, motivo: 'intervalo' };

  return { avisar: false, motivo: 'resumen_reciente' };
}

/** Cuerpo del aviso: qué vínculos esperan revisión y desde cuándo. */
export function construirResumen(pendientes: VinculoAutomaticoPendiente[], ahora: Date): string {
  const lineas = pendientes.slice(0, MAX_DETALLE).map((v) => {
    const donde = v.property || v.hotelCode;
    const hacia = v.unit ? ` → ${v.unit}` : '';
    const hace = formatDistance(new Date(v.creadoEn), ahora, { addSuffix: true, locale: es });
    return `• ${v.roomCode} · ${donde}${hacia} (${hace})`;
  });
  const resto =
    pendientes.length > MAX_DETALLE ? `\n… y ${pendientes.length - MAX_DETALLE} más.` : '';

  return (
    `Hay ${pendientes.length} vínculo(s) de conectividad creados automáticamente sin revisar:\n` +
    lineas.join('\n') +
    resto +
    '\nGuarda los vínculos en Puesta en marcha para darlos por revisados.'
  );
}

export async function runHospitalityVinculosPendientesScan(
  ahora: Date = new Date()
): Promise<HospitalityVinculosPendientesResult> {
  const startedAt = Date.now();

  const pendientes = await listarVinculosAutomaticosPendientes();
  if (pendientes.length === 0) {
    return {
      success: true,
      message: 'Sin vínculos automáticos pendientes de revisar.',
      tenantsConPendientes: 0,
      tenantsAvisados: 0,
      tenantsEnEspera: 0,
      vinculosPendientes: 0,
      vinculosAvisados: 0,
      errores: [],
      durationMs: Date.now() - startedAt,
    };
  }

  const porTenant = new Map<string, VinculoAutomaticoPendiente[]>();
  for (const vinculo of pendientes) {
    const lista = porTenant.get(vinculo.tenantId);
    if (lista) lista.push(vinculo);
    else porTenant.set(vinculo.tenantId, [vinculo]);
  }

  const resumenes: ResumenTenant[] = [];

  for (const [tenantId, lista] of porTenant) {
    try {
      const ultimo = await ultimoResumenVinculos(tenantId);
      const decision = tocaAvisar(lista, ultimo, ahora);
      if (!decision.avisar) {
        resumenes.push({ tenantId, avisado: false, pendientes: lista.length, motivo: decision.motivo });
        continue;
      }

      const operadores = await operadoresDelTenant(tenantId);
      const propiedades = new Set(lista.map((v) => v.propertyId).filter(Boolean));
      const url =
        propiedades.size === 1
          ? `/dashboard/hospitality/onboarding?propertyId=${[...propiedades][0]}`
          : '/dashboard/hospitality/onboarding';

      if (operadores.length > 0) {
        const { sendPushNotification } = await import('@/lib/services/push-notification');
        const cuerpo = construirResumen(lista, ahora);
        await Promise.all(
          operadores.map((u) =>
            sendPushNotification(u.id, {
              title: `Vínculos automáticos por revisar (${lista.length})`,
              body: cuerpo,
              url,
              tag: 'conectividad',
              data: { motivo: decision.motivo, vinculos: lista.length },
            }).catch(() => ({ success: false }))
          )
        );
      }

      // La marca del intervalo: también sirve de auditoría del envío.
      await prisma.hospitalitySyncLog.create({
        data: {
          tenantId,
          propertyId: propiedades.size === 1 ? [...propiedades][0] : null,
          tipo: TIPO_RESUMEN_VINCULOS,
          operacion: 'manual',
          estado: operadores.length > 0 ? 'exito' : 'pendiente',
          responseBody: {
            motivo: decision.motivo,
            vinculos: lista.length,
            destinatarios: operadores.length,
            detalle: lista.map((v) => ({
              hotelCode: v.hotelCode,
              roomCode: v.roomCode,
              rateplanCode: v.rateplanCode,
              unit: v.unit,
              unitId: v.unitId,
              creadoEn: v.creadoEn,
              bookingId: v.bookingId,
            })),
          } as never,
        },
      });

      resumenes.push({ tenantId, avisado: operadores.length > 0, pendientes: lista.length, motivo: decision.motivo });
    } catch (err) {
      const mensaje = err instanceof Error ? err.message : String(err);
      resumenes.push({ tenantId, avisado: false, pendientes: lista.length, error: mensaje });
      console.error(`[Cron/HospitalityVinculos] Tenant ${tenantId} falló:`, mensaje);
    }
  }

  const avisados = resumenes.filter((r) => r.avisado);
  const enEspera = resumenes.filter((r) => r.motivo === 'resumen_reciente');
  const errores = resumenes.filter((r) => r.error).map((r) => `${r.tenantId}: ${r.error}`);

  console.log(
    `[Cron/HospitalityVinculos] DONE tenants=${resumenes.length} avisados=${avisados.length} ` +
      `enEspera=${enEspera.length} pendientes=${pendientes.length} durationMs=${Date.now() - startedAt}`
  );

  return {
    success: errores.length === 0,
    message:
      `Resumen de vínculos automáticos: ${avisados.length} tenant(s) avisado(s), ` +
      `${enEspera.length} en espera de intervalo, ${pendientes.length} vínculo(s) pendiente(s).`,
    tenantsConPendientes: resumenes.length,
    tenantsAvisados: avisados.length,
    tenantsEnEspera: enEspera.length,
    vinculosPendientes: pendientes.length,
    vinculosAvisados: avisados.reduce((a, r) => a + r.pendientes, 0),
    errores,
    durationMs: Date.now() - startedAt,
  };
}
