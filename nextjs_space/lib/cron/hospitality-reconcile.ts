/**
 * lib/cron/hospitality-reconcile.ts
 *
 * Reconciliación diaria de reservas de Hospitality contra la capa de
 * conectividad (plan maestro §14).
 *
 * Recorre TODOS los tenants con al menos una propiedad mapeada a conectividad
 * activa y ejecuta `runReconciliation` para cada uno. Los webhooks no son la
 * única fuente de verdad: este job detecta reservas faltantes, modificaciones
 * y cancelaciones no aplicadas.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * GARANTÍAS
 * ────────────────────────────────────────────────────────────────────────────
 *   • `cancelarAusentes` SIEMPRE en false: una reserva interna activa que el
 *     proveedor ya no reporta se registra como divergencia, nunca se cancela
 *     automáticamente (conservador, §14).
 *   • Idempotente: sin diferencias no hay escrituras; cada corrida queda
 *     auditada en HospitalitySyncLog (tipo `reconciliacion`).
 *   • Un tenant que falla no impide reconciliar los demás.
 *
 * Se invoca desde el scheduler (job diario) y desde
 * `GET /api/cron/hospitality-reconcile` (disparo a demanda con CRON_SECRET).
 */

import { prisma } from '@/lib/db';
import { runReconciliation } from '@/lib/hospitality/reconciliation';

export interface HospitalityReconcileScanResult {
  success: boolean;
  message: string;
  tenants: number;
  totalCreadas: number;
  totalActualizadas: number;
  totalCanceladas: number;
  totalDivergencias: number;
  errores: string[];
  durationMs: number;
}

interface ResumenTenant {
  tenantId: string;
  ok: boolean;
  creadas?: number;
  actualizadas?: number;
  canceladas?: number;
  divergencias?: number;
  errores: string[];
}

export async function runHospitalityReconcileScan(): Promise<HospitalityReconcileScanResult> {
  const startedAt = Date.now();

  // Tenants con al menos una propiedad mapeada a conectividad activa.
  const props = await prisma.hospitalityProperty.findMany({
    where: { mappings: { some: { provider: 'channel_connectivity', estado: 'activo' } } },
    select: { tenantId: true },
    distinct: ['tenantId'],
  });
  const tenantIds = props.map((p) => p.tenantId);

  if (tenantIds.length === 0) {
    return {
      success: true,
      message: 'Sin tenants con mappings de conectividad activos.',
      tenants: 0,
      totalCreadas: 0,
      totalActualizadas: 0,
      totalCanceladas: 0,
      totalDivergencias: 0,
      errores: [],
      durationMs: Date.now() - startedAt,
    };
  }

  const resumenes: ResumenTenant[] = [];
  for (const tid of tenantIds) {
    try {
      const resumen = await runReconciliation({
        tenantId: tid,
        dias: 30,
        cancelarAusentes: false, // siempre conservador en el cron
      });
      resumenes.push({ tenantId: tid, ...resumen });
    } catch (err: any) {
      resumenes.push({
        tenantId: tid,
        ok: false,
        errores: [err?.message ?? String(err)],
      });
      console.error(`[Cron/HospitalityReconcile] Tenant ${tid} falló:`, err?.message ?? err);
    }
  }

  const totalCreadas = resumenes.reduce((a, r) => a + (r.creadas || 0), 0);
  const totalActualizadas = resumenes.reduce((a, r) => a + (r.actualizadas || 0), 0);
  const totalCanceladas = resumenes.reduce((a, r) => a + (r.canceladas || 0), 0);
  const totalDivergencias = resumenes.reduce((a, r) => a + (r.divergencias || 0), 0);
  const errores = resumenes.flatMap((r) => r.errores || []);
  const fallidos = resumenes.filter((r) => !r.ok).length;

  console.log(
    `[Cron/HospitalityReconcile] DONE tenants=${resumenes.length} ` +
      `creadas=${totalCreadas} actualizadas=${totalActualizadas} ` +
      `canceladas=${totalCanceladas} divergencias=${totalDivergencias} ` +
      `fallidos=${fallidos} durationMs=${Date.now() - startedAt}`,
  );

  return {
    success: fallidos === 0,
    message: `Reconciliación diaria completada: ${totalCreadas} creadas, ${totalActualizadas} actualizadas, ${totalCanceladas} canceladas, ${totalDivergencias} divergencias.`,
    tenants: resumenes.length,
    totalCreadas,
    totalActualizadas,
    totalCanceladas,
    totalDivergencias,
    errores,
    durationMs: Date.now() - startedAt,
  };
}
