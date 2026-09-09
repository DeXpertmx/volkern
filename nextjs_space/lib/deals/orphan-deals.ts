/**
 * Cura de deals huérfanos (pipelineId = null).
 *
 * Los deals creados antes de existir pipelines (o desde formularios que no
 * envían pipelineId) quedan con pipelineId NULL y no aparecen en el tablero
 * de Pipeline cuando se filtra por pipeline. Este helper los reasigna al
 * primer pipeline ACTIVO del tenant (por orden), una sola vez.
 *
 * IDEMPOTENTE y seguro de re-ejecutar:
 *   · si no hay pipeline activo, no toca nada (devuelve 0);
 *   · si no hay huérfanos, no toca nada (devuelve 0);
 *   · re-asignar un deal ya asignado no cambia nada.
 *
 * SOLO debe invocarse desde operaciones de ESCRITURA (POST/PATCH/sync),
 * nunca desde un GET: las lecturas no deben tener efectos secundarios.
 */

import { prisma } from '@/lib/db';

/**
 * Reasigna todos los deals del tenant con pipelineId NULL al primer pipeline
 * activo (por orden). Devuelve cuántos deals se reasignaron.
 */
export async function assignOrphanDealsToDefaultPipeline(tenantId: string): Promise<number> {
  const defaultPipeline = await prisma.pipeline.findFirst({
    where: { tenantId, activo: true },
    orderBy: { orden: 'asc' },
    select: { id: true },
  });
  if (!defaultPipeline) return 0;

  const result = await prisma.deal.updateMany({
    where: { tenantId, pipelineId: null },
    data: { pipelineId: defaultPipeline.id },
  });
  return result.count;
}