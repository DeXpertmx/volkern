/**
 * app/api/cron/hospitality-reconcile/route.ts
 *
 * GET /api/cron/hospitality-reconcile
 *
 * Job diario (plan maestro §14) que ejecuta la reconciliación de reservas
 * contra la capa de conectividad para TODOS los tenants con propiedades
 * mapeadas. Detecta reservas faltantes, modificaciones y cancelaciones no
 * aplicadas, aplicándolas de forma idempotente y conservadora.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * SEGURIDAD
 * ────────────────────────────────────────────────────────────────────────────
 *   • Auth: Header `Authorization: Bearer ${CRON_SECRET}` (solo en producción).
 *           Fuera de producción se permite sin auth para desarrollo local
 *           (mismo patrón que cleanup-attendance / uptime-developers).
 *   • `cancelarAusentes` SIEMPRE en false: las reservas internas activas que
 *     el proveedor ya no reporta solo se registran como divergencia, nunca
 *     se cancelan automáticamente (conservador, §14).
 *   • Idempotente: sin diferencias no hay escrituras; cada corrida queda
 *     auditada en HospitalitySyncLog (tipo `reconciliacion`).
 *   • Si la conectividad no está configurada, no hay nada que reconciliar.
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { runReconciliation } from '@/lib/hospitality/reconciliation';

export async function GET(request: NextRequest) {
  // ── Auth (Bearer CRON_SECRET, solo en producción) ──────────────────────
  if (process.env.NODE_ENV === 'production') {
    const authHeader = request.headers.get('authorization');
    if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json(
        { error: 'No autorizado. CRON_SECRET requerido en producción.' },
        { status: 401 },
      );
    }
  }

  const startedAt = Date.now();

  try {
    // Tenants con al menos una propiedad mapeada a conectividad activa.
    const props = await prisma.hospitalityProperty.findMany({
      where: { mappings: { some: { provider: 'channel_connectivity', estado: 'activo' } } },
      select: { tenantId: true },
      distinct: ['tenantId'],
    });
    const tenantIds = props.map((p) => p.tenantId);

    if (tenantIds.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'Sin tenants con mappings de conectividad activos.',
        tenants: 0,
        durationMs: Date.now() - startedAt,
      });
    }

    const resumenes: Array<{
      tenantId: string;
      ok: boolean;
      propiedades?: number;
      fetchFallidos?: number;
      totalFetch?: number;
      creadas?: number;
      actualizadas?: number;
      canceladas?: number;
      sinCambios?: number;
      divergencias?: number;
      errores: string[];
    }> = [];
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

    return NextResponse.json({
      success: fallidos === 0,
      message: `Reconciliación diaria completada: ${totalCreadas} creadas, ${totalActualizadas} actualizadas, ${totalCanceladas} canceladas, ${totalDivergencias} divergencias.`,
      tenants: resumenes.length,
      totalCreadas,
      totalActualizadas,
      totalCanceladas,
      totalDivergencias,
      errores,
      durationMs: Date.now() - startedAt,
    });
  } catch (error: any) {
    console.error('[Cron/HospitalityReconcile] Error fatal:', error);
    return NextResponse.json(
      { success: false, error: error?.message ?? 'Error en hospitality-reconcile' },
      { status: 500 },
    );
  }
}

export const POST = GET;