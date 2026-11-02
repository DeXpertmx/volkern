/**
 * Escritura del plan de personalización: crear el embudo aprobado en la cuenta.
 *
 * La ruta llama aquí solo cuando el cliente pulsa aplicar, y cada aplicación
 * deja `auditLog`. Reversible mientras el embudo no tenga oportunidades: en
 * cuanto las tiene, se edita desde Pipeline, que es donde avisa de qué se mueve.
 *
 * SERVER-ONLY: usa Prisma.
 */

import { prisma } from '@/lib/db'
import { getMaxPipelines } from '@/lib/pipelines-server'
import { getCrmEntitlements } from '@/lib/crm-entitlements'
import type { EmbudoPlan } from './plan'

export type CodigoEmbudo = 'nombre_ocupado' | 'tope_embudos' | 'con_oportunidades'

export interface ResultadoEmbudo {
  ok: boolean
  codigo?: CodigoEmbudo
  /** Motivo en lenguaje de cliente, listo para pintar. */
  mensaje?: string
  pipelineId?: string
  accion?: 'creado' | 'actualizado' | 'deshecho'
  etapas?: number
}

export interface LimitesEmbudos {
  maximo: number
  usados: number
  tier: string
}

/** Los mismos topes que la pantalla de Pipeline: plan y nivel de CRM. */
export async function limitesDeEmbudos(tenantId: string): Promise<LimitesEmbudos> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { plan: true },
  })
  const ent = await getCrmEntitlements(tenantId)
  const maximo = Math.min(
    await getMaxPipelines(tenantId, tenant?.plan || 'esencial'),
    ent.limits.maxPipelines,
  )
  const usados = await prisma.pipeline.count({ where: { tenantId, activo: true } })

  return { maximo, usados, tier: ent.tierName }
}

const COLORES = ['#94a3b8', '#3b82f6', '#8b5cf6', '#f59e0b', '#10b981', '#0ea5e9', '#6366f1', '#059669']

/**
 * La última etapa se marca como final (ganado). Las perdidas no necesitan
 * etapa: se marcan con motivo desde la oportunidad.
 */
function etapasParaCrear(tenantId: string, pipelineId: string, embudo: EmbudoPlan) {
  const ultima = embudo.etapas.length - 1

  return embudo.etapas.map((etapa, i) => ({
    tenantId,
    pipelineId,
    nombre: etapa.nombre,
    descripcion: etapa.criterio || null,
    orden: i + 1,
    probabilidad: etapa.probabilidad,
    color: COLORES[i % COLORES.length],
    esEtapaFinal: i === ultima,
    tipoEtapaFinal: i === ultima ? 'ganado' : null,
    activo: true,
  }))
}

export async function aplicarEmbudo(
  tenantId: string,
  embudo: EmbudoPlan,
  pipelinePrevioId?: string | null,
): Promise<ResultadoEmbudo> {
  const existente = await prisma.pipeline.findUnique({
    where: { tenantId_nombre: { tenantId, nombre: embudo.nombre } },
    select: { id: true, _count: { select: { deals: true } } },
  })

  // Un embudo con ese nombre que no salió de este alta: no se pisa.
  if (existente && existente.id !== pipelinePrevioId) {
    return {
      ok: false,
      codigo: 'nombre_ocupado',
      mensaje: `Ya tienes un embudo llamado «${embudo.nombre}». Cambia el nombre aquí o edítalo desde Pipeline.`,
    }
  }

  if (existente) {
    if (existente._count.deals > 0) {
      return {
        ok: false,
        codigo: 'con_oportunidades',
        mensaje: `«${embudo.nombre}» ya tiene ${existente._count.deals} oportunidad${existente._count.deals === 1 ? '' : 'es'}: cámbialo desde Pipeline, donde se avisa de lo que se mueve.`,
      }
    }

    // Reaplicar sin datos dentro es seguro: se reemplazan las etapas.
    await prisma.pipelineStage.deleteMany({ where: { tenantId, pipelineId: existente.id } })
    await prisma.pipelineStage.createMany({
      data: etapasParaCrear(tenantId, existente.id, embudo),
    })
    return { ok: true, pipelineId: existente.id, accion: 'actualizado', etapas: embudo.etapas.length }
  }

  const { maximo, usados, tier } = await limitesDeEmbudos(tenantId)
  if (usados >= maximo) {
    return {
      ok: false,
      codigo: 'tope_embudos',
      mensaje: `Tu plan ${tier} permite ${maximo} ${maximo === 1 ? 'embudo' : 'embudos'} y ya ${maximo === 1 ? 'está ocupado' : 'están ocupados'}. Puedes ajustar el que tienes desde Pipeline.`,
    }
  }

  const ultimo = await prisma.pipeline.findFirst({
    where: { tenantId },
    orderBy: { orden: 'desc' },
    select: { orden: true },
  })

  const pipeline = await prisma.pipeline.create({
    data: {
      tenantId,
      nombre: embudo.nombre,
      categoria: 'ventas',
      descripcion: 'Embudo aprobado en el alta guiada',
      orden: (ultimo?.orden ?? 0) + 1,
    },
    select: { id: true },
  })

  await prisma.pipelineStage.createMany({ data: etapasParaCrear(tenantId, pipeline.id, embudo) })

  return { ok: true, pipelineId: pipeline.id, accion: 'creado', etapas: embudo.etapas.length }
}

/** Deshacer = borrar el embudo creado por el alta, solo si está vacío. */
export async function deshacerEmbudo(tenantId: string, pipelineId: string): Promise<ResultadoEmbudo> {
  const pipeline = await prisma.pipeline.findFirst({
    where: { id: pipelineId, tenantId },
    select: { id: true, nombre: true, _count: { select: { deals: true } } },
  })

  // Ya no está (lo borraron a mano): nada que deshacer.
  if (!pipeline) return { ok: true, accion: 'deshecho' }

  if (pipeline._count.deals > 0) {
    return {
      ok: false,
      codigo: 'con_oportunidades',
      mensaje: `«${pipeline.nombre}» ya tiene ${pipeline._count.deals} oportunidad${pipeline._count.deals === 1 ? '' : 'es'}: se queda, porque borrarlo se llevaría el trabajo hecho.`,
    }
  }

  await prisma.pipelineStage.deleteMany({ where: { tenantId, pipelineId } })
  await prisma.pipeline.delete({ where: { id: pipelineId } })

  return { ok: true, accion: 'deshecho' }
}
