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
 * El fetch mira hacia ATRÁS (30 días por defecto): el proveedor filtra por
 * FECHA DE RESERVA, así que es lo que recupera las reservas cuyo push se perdió
 * o llegó rechazado. Ver `lib/hospitality/ventana-reservas.ts`.
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
 * Además del fetch de reservas, cada tenant pasa por el barrido de **noches sin
 * justificante** (§29): no se le pide inventario al proveedor (`Fetch Inventory`
 * sin implementar), así que se compara lo que le empujamos (el último push que
 * cubre cada noche) con lo que justifica el estado interno. Es la guardia que
 * caza las noches fantasma —el proveedor sin vender días que aquí están libres—
 * y la sobreventa al revés.
 *
 * Se invoca desde el scheduler (job diario) y desde
 * `GET /api/cron/hospitality-reconcile` (disparo a demanda con CRON_SECRET).
 */

import { prisma } from '@/lib/db';
import { runReconciliation } from '@/lib/hospitality/reconciliation';
import { detectarDivergenciasInventario } from '@/lib/hospitality/inventario-divergencias';
import {
  DIAS_BARRIDO_RESERVAS_ADELANTE,
  DIAS_BARRIDO_RESERVAS_ATRAS,
} from '@/lib/hospitality/ventana-reservas';
import { VINCULO_PENDIENTE_REVISION } from '@/lib/hospitality/vinculo-revision';

/**
 * Tope de avisos de inventario que se listan en el panel de crons: con muchos
 * hoteles la lista se vuelve ilegible, así que se nombran las propiedades
 * afectadas y el resto se resume en una línea.
 */
const MAX_AVISOS_INVENTARIO = 5;

export interface HospitalityReconcileScanResult {
  success: boolean;
  message: string;
  tenants: number;
  totalCreadas: number;
  totalActualizadas: number;
  totalCanceladas: number;
  totalDivergencias: number;
  /** Noches que el proveedor no vende y aquí sí son vendibles (se pierden ventas). */
  totalNochesCerradasSinJustificar: number;
  /** Noches que el proveedor vende y el estado interno ya no justifica (sobreventa). */
  totalNochesAbiertasSinJustificar: number;
  /** Avisos para el panel de crons (no son errores del job). */
  avisos: string[];
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

  // Tenants con al menos una propiedad mapeada a conectividad. El barrido es
  // IMPORTACIÓN (ver vinculo-revision.ts): los vínculos pendientes de revisión
  // también delimitan a qué tenant reconciliar.
  const props = await prisma.hospitalityProperty.findMany({
    where: {
      mappings: {
        some: {
          provider: 'channel_connectivity',
          estado: { in: ['activo', VINCULO_PENDIENTE_REVISION] },
        },
      },
    },
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
      totalNochesCerradasSinJustificar: 0,
      totalNochesAbiertasSinJustificar: 0,
      avisos: [],
      errores: [],
      durationMs: Date.now() - startedAt,
    };
  }

  const resumenes: ResumenTenant[] = [];
  const avisosInventario: string[] = [];
  const erroresInventario: string[] = [];
  let totalNochesCerradas = 0;
  let totalNochesAbiertas = 0;
  let fallidosInventario = 0;

  for (const tid of tenantIds) {
    try {
      const resumen = await runReconciliation({
        tenantId: tid,
        dias: DIAS_BARRIDO_RESERVAS_ADELANTE,
        diasAtras: DIAS_BARRIDO_RESERVAS_ATRAS,
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

    // Guardia de inventario (§29): independiente del fetch de reservas, así que
    // va en su propio try — un proveedor caído no debe dejar sin auditar lo que
    // ya le empujamos. Diagnóstico puro: no empuja nada por su cuenta.
    try {
      const inventario = await detectarDivergenciasInventario({ tenantId: tid, dias: 30 });
      totalNochesCerradas += inventario.cerradasSinJustificar;
      totalNochesAbiertas += inventario.abiertasSinJustificar;
      avisosInventario.push(...inventario.avisos);
    } catch (err: any) {
      // Un barrido que no corre deja el calendario del canal sin auditar: eso es
      // un fallo del job y se ve, no se traga.
      fallidosInventario += 1;
      erroresInventario.push(`[inventario] ${err?.message ?? String(err)}`);
      console.error(
        `[Cron/HospitalityReconcile] Barrido de inventario del tenant ${tid} falló:`,
        err?.message ?? err
      );
    }
  }

  const totalCreadas = resumenes.reduce((a, r) => a + (r.creadas || 0), 0);
  const totalActualizadas = resumenes.reduce((a, r) => a + (r.actualizadas || 0), 0);
  const totalCanceladas = resumenes.reduce((a, r) => a + (r.canceladas || 0), 0);
  const totalDivergencias = resumenes.reduce((a, r) => a + (r.divergencias || 0), 0);
  const errores = [...resumenes.flatMap((r) => r.errores || []), ...erroresInventario];
  const fallidos = resumenes.filter((r) => !r.ok).length;

  console.log(
    `[Cron/HospitalityReconcile] DONE tenants=${resumenes.length} ` +
      `creadas=${totalCreadas} actualizadas=${totalActualizadas} ` +
      `canceladas=${totalCanceladas} divergencias=${totalDivergencias} ` +
      `nochesCerradas=${totalNochesCerradas} nochesAbiertas=${totalNochesAbiertas} ` +
      `fallidos=${fallidos} fallidosInventario=${fallidosInventario} durationMs=${Date.now() - startedAt}`,
  );

  const resumenNoches =
    totalNochesCerradas + totalNochesAbiertas > 0
      ? ` ${totalNochesCerradas} noches que el proveedor no vende y ${totalNochesAbiertas} que vende sin justificar.`
      : '';

  // Los avisos del panel no crecen sin límite: se nombran las propiedades
  // afectadas y el resto se resume en una línea.
  const avisos = avisosInventario.slice(0, MAX_AVISOS_INVENTARIO);
  if (avisosInventario.length > avisos.length) {
    avisos.push(
      `… y ${avisosInventario.length - avisos.length} propiedad(es) más con noches sin justificar en el proveedor.`
    );
  }

  return {
    success: fallidos === 0 && fallidosInventario === 0,
    message:
      `Reconciliación diaria completada: ${totalCreadas} creadas, ${totalActualizadas} actualizadas, ` +
      `${totalCanceladas} canceladas, ${totalDivergencias} divergencias.${resumenNoches}`,
    tenants: resumenes.length,
    totalCreadas,
    totalActualizadas,
    totalCanceladas,
    totalDivergencias,
    totalNochesCerradasSinJustificar: totalNochesCerradas,
    totalNochesAbiertasSinJustificar: totalNochesAbiertas,
    avisos,
    errores,
    durationMs: Date.now() - startedAt,
  };
}
