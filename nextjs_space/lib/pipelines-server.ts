/**
 * Server-only pipeline utilities (Prisma-dependent)
 *
 * These functions were moved from lib/pipelines.ts to prevent Prisma from
 * being bundled into client-side code. Only import this file from API routes
 * or server components, never from client components.
 */

import { prisma } from '@/lib/db'
import {
  type PipelineDefinition,
  PIPELINE_LIMITS_BY_PLAN,
  getPipelinesForModules,
  getStagesForCategory,
} from '@/lib/pipelines'

// ─── Max pipelines per plan (shared with admin panel) ────────────────────

/**
 * Returns the max number of pipelines allowed for a tenant.
 * Checks TenantFeature with key 'max_pipelines'.
 * Falls back to plan-based default if no TenantFeature override.
 */
export async function getMaxPipelines(tenantId: string, plan: string): Promise<number> {
  // Check TenantFeature override first
  const feature = await prisma.tenantFeature.findUnique({
    where: {
      tenantId_feature: {
        tenantId,
        feature: 'max_pipelines',
      },
    },
  })

  if (feature?.limitePersonalizado) {
    return feature.limitePersonalizado
  }

  // Fallback to plan-based limits
  return getPlanDefaultMaxPipelines(plan)
}

/**
 * Returns the default max pipelines value for a given plan.
 * Pure function — no DB call.
 */
export function getPlanDefaultMaxPipelines(plan: string): number {
  return PIPELINE_LIMITS_BY_PLAN[plan.toLowerCase()] || 1
}

/**
 * Seeds/creates the predefined pipelines for a tenant based on their modules.
 * Also creates default stages for each pipeline.
 * Skips pipelines that already exist for the tenant.
 */
export async function seedTenantPipelines(
  tenantId: string,
  enabledModules: string[]
): Promise<string[]> {
  const pipelines = getPipelinesForModules(enabledModules)
  const created: string[] = []

  for (const pipe of pipelines) {
    const existing = await prisma.pipeline.findUnique({
      where: {
        tenantId_nombre: {
          tenantId,
          nombre: pipe.nombre,
        },
      },
    })

    if (existing) {
      created.push(existing.id)
      continue
    }

    const pipeline = await prisma.pipeline.create({
      data: {
        tenantId,
        nombre: pipe.nombre,
        categoria: pipe.categoria,
        descripcion: pipe.descripcion,
        orden: pipe.orden,
      },
    })

    // Create default stages for this pipeline (custom per category)
    const pipelineStages = getStagesForCategory(pipe.categoria)
    for (const stage of pipelineStages) {
      await prisma.pipelineStage.create({
        data: {
          tenantId,
          pipelineId: pipeline.id,
          nombre: stage.nombre,
          probabilidad: stage.probabilidad,
          orden: stage.orden,
          color: stage.color,
          esEtapaFinal: stage.esEtapaFinal,
          tipoEtapaFinal: stage.tipoEtapaFinal,
          activo: true,
        },
      })
    }

    created.push(pipeline.id)
  }

  // Migrate existing stages and deals with null pipelineId to the first pipeline
  const firstPipeline = await prisma.pipeline.findFirst({
    where: { tenantId },
    orderBy: { orden: 'asc' },
  })

  if (firstPipeline) {
    // Migrate stages
    await prisma.pipelineStage.updateMany({
      where: {
        tenantId,
        pipelineId: null,
      },
      data: {
        pipelineId: firstPipeline.id,
      },
    })

    // Migrate existing deals so they don't get lost when filtering by pipeline
    await prisma.deal.updateMany({
      where: {
        tenantId,
        pipelineId: null,
      },
      data: {
        pipelineId: firstPipeline.id,
      },
    })
  }

  // ─── Migration: desactivar pipeline 'Inmobiliario' antiguo (categoria: inmobiliario) ───
  // Reemplazado por Captación (captacion) y Compra (compra)
  const oldPipeline = await prisma.pipeline.findFirst({
    where: {
      tenantId,
      categoria: 'inmobiliario',
      activo: true,
    },
  })

  if (oldPipeline) {
    await prisma.pipeline.update({
      where: { id: oldPipeline.id },
      data: {
        activo: false,
        nombre: 'Inmobiliario (Legacy)',
        descripcion: 'Pipeline migrado. Reemplazado por Captación y Compra.',
      },
    })
  }

  // ─── Migration: corregir orden del pipeline Finanzas (5 → 6) ───
  // Tenants creados antes del fix tenían Finanzas en orden 5 (duplicado con Compra)
  const finanzasWrongOrder = await prisma.pipeline.findFirst({
    where: {
      tenantId,
      categoria: 'finanzas',
      orden: 5,
    },
  })

  if (finanzasWrongOrder) {
    await prisma.pipeline.update({
      where: { id: finanzasWrongOrder.id },
      data: { orden: 6 },
    })
  }

  return created
}
