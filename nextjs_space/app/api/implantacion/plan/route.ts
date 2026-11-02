export const dynamic = 'force-dynamic';

/**
 * Personalización del alta: el embudo.
 *
 * GET    → propuesta del descubrimiento, embudo aprobado y estado real del
 *          embudo en la cuenta (etapas y oportunidades dentro).
 * POST   → aplica el embudo: lo crea (o reemplaza sus etapas) con auditoría.
 * DELETE → deshace: borra el embudo creado por el alta si sigue vacío.
 *
 * Nada de esto se dispara solo: el cliente retoca y pulsa aplicar. Y el estado
 * «aplicado» no se guarda a ciegas: se comprueba leyendo el embudo, para que un
 * borrado a mano no deje el alta diciendo que ya está.
 */

import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { withTenantAuth } from '@/lib/api-key-auth'
import { prisma } from '@/lib/db'
import {
  MAX_ETAPAS,
  MIN_ETAPAS,
  embudoPropuesto,
  normalizarEmbudo,
  resumenEmbudo,
  type EmbudoPlan,
} from '@/lib/implantacion/plan'
import {
  aplicarEmbudo,
  deshacerEmbudo,
  limitesDeEmbudos,
  type ResultadoEmbudo,
} from '@/lib/implantacion/aplicar-embudo'

interface PlanGuardado {
  embudo?: unknown
  pipelineId?: string | null
  aplicadoEn?: string
  deshechoEn?: string
}

function leerPlan(plan: unknown): PlanGuardado | null {
  if (!plan || typeof plan !== 'object' || Array.isArray(plan)) return null
  return plan as PlanGuardado
}

function pipelineDelPlan(plan: unknown): string | null {
  const guardado = leerPlan(plan)
  return typeof guardado?.pipelineId === 'string' ? guardado.pipelineId : null
}

/** Lo que hay de verdad en la cuenta, no lo que diga el registro. */
async function estadoDelEmbudo(tenantId: string, pipelineId: string | null) {
  if (!pipelineId) return null

  const pipeline = await prisma.pipeline.findFirst({
    where: { id: pipelineId, tenantId },
    select: {
      id: true,
      nombre: true,
      activo: true,
      stages: {
        select: { nombre: true, descripcion: true, probabilidad: true, orden: true, esEtapaFinal: true },
        orderBy: { orden: 'asc' },
      },
      _count: { select: { deals: true } },
    },
  })

  if (!pipeline) return null

  return {
    pipelineId: pipeline.id,
    nombre: pipeline.nombre,
    activo: pipeline.activo,
    etapas: pipeline.stages.map((etapa) => ({
      nombre: etapa.nombre,
      criterio: etapa.descripcion ?? '',
      probabilidad: etapa.probabilidad,
      esEtapaFinal: etapa.esEtapaFinal,
    })),
    oportunidades: pipeline._count.deals,
  }
}

/** Códigos de la aplicación a su respuesta HTTP. */
const ESTADO_POR_CODIGO: Record<string, number> = {
  nombre_ocupado: 409,
  tope_embudos: 403,
  con_oportunidades: 409,
}

function fallo(resultado: ResultadoEmbudo) {
  const status = resultado.codigo ? ESTADO_POR_CODIGO[resultado.codigo] ?? 400 : 400
  return NextResponse.json(
    { error: resultado.mensaje ?? 'No se pudo aplicar el embudo', codigo: resultado.codigo ?? null },
    { status },
  )
}

// ─── GET ─────────────────────────────────────────────────────────────────────

export const GET = withTenantAuth(async (_request, auth) => {
  try {
    const tenantId = auth.tenant!.id
    const registro = await prisma.implantacionTenant.findUnique({
      where: { tenantId },
      select: { recomendacion: true, plan: true },
    })

    const propuesta = embudoPropuesto(registro?.recomendacion)
    const guardado = leerPlan(registro?.plan)
    const embudo: EmbudoPlan | null =
      normalizarEmbudo(guardado?.embudo ?? propuesta, propuesta).embudo ?? propuesta

    const aplicado = await estadoDelEmbudo(tenantId, pipelineDelPlan(registro?.plan))
    const limites = await limitesDeEmbudos(tenantId)

    return NextResponse.json({
      propuesta,
      embudo,
      resumen: embudo ? resumenEmbudo(embudo) : null,
      aplicado,
      aplicadoEn: guardado?.aplicadoEn ?? null,
      limites,
      topes: { minEtapas: MIN_ETAPAS, maxEtapas: MAX_ETAPAS },
      puedeAplicar: Boolean(embudo),
    })
  } catch (error) {
    console.error('[Implantacion plan GET] Error:', error)
    return NextResponse.json({ error: 'Error al leer la personalización' }, { status: 500 })
  }
}, ['settings:read'])

// ─── POST: aplicar el embudo ─────────────────────────────────────────────────

export const POST = withTenantAuth(async (request, auth) => {
  try {
    const tenantId = auth.tenant!.id
    const usuarioId = auth.user?.id
    if (!usuarioId) {
      return NextResponse.json(
        { error: 'Necesitas una sesión de usuario para aplicar el alta' },
        { status: 403 },
      )
    }

    const registro = await prisma.implantacionTenant.findUnique({
      where: { tenantId },
      select: { recomendacion: true, plan: true, estado: true },
    })
    if (!registro) {
      return NextResponse.json(
        { error: 'Primero hay que completar el descubrimiento del alta guiada' },
        { status: 409 },
      )
    }

    const propuesta = embudoPropuesto(registro.recomendacion)
    const cuerpo = (await request.json().catch(() => ({}))) as Record<string, unknown>
    const { embudo, avisos } = normalizarEmbudo(cuerpo.embudo ?? cuerpo, propuesta)

    if (!embudo) {
      return NextResponse.json(
        { error: avisos[avisos.length - 1] ?? 'El embudo no es aplicable', avisos },
        { status: 400 },
      )
    }

    const previo = leerPlan(registro.plan)
    const resultado = await aplicarEmbudo(tenantId, embudo, previo?.pipelineId ?? null)
    if (!resultado.ok) return fallo(resultado)

    const ahora = new Date()
    await prisma.implantacionTenant.update({
      where: { tenantId },
      data: {
        // `plan` guarda todas las piezas del alta (el embudo y los roles): se
        // escribe encima lo que cambia esta pieza, sin borrar las demás.
        plan: {
          ...(leerPlan(registro.plan) ?? {}),
          embudo,
          pipelineId: resultado.pipelineId ?? null,
          aplicadoEn: ahora.toISOString(),
          aplicadoPor: usuarioId,
        } as unknown as Prisma.InputJsonValue,
      },
    })

    await prisma.auditLog.create({
      data: {
        tenantId,
        userId: usuarioId,
        accion: 'implantacion_plan',
        entidad: 'implantacion',
        entidadId: tenantId,
        descripcion: `Embudo «${embudo.nombre}» ${resultado.accion === 'actualizado' ? 'actualizado' : 'creado'} desde el alta guiada: ${embudo.etapas.length} etapas (${embudo.etapas.map((e) => e.nombre).join(' → ')})`,
        metadata: {
          pieza: 'embudo',
          pipelineId: resultado.pipelineId ?? null,
          accion: resultado.accion ?? null,
          nombre: embudo.nombre,
          etapas: embudo.etapas as unknown as Prisma.InputJsonValue,
          estadoPrevio: registro.estado,
        },
      },
    })

    const aplicado = await estadoDelEmbudo(tenantId, resultado.pipelineId ?? null)
    const limites = await limitesDeEmbudos(tenantId)

    return NextResponse.json({
      ok: true,
      embudo,
      avisos,
      accion: resultado.accion ?? null,
      aplicado,
      aplicadoEn: ahora.toISOString(),
      limites,
      resumen: resumenEmbudo(embudo),
    })
  } catch (error) {
    console.error('[Implantacion plan POST] Error:', error)
    return NextResponse.json({ error: 'No se pudo aplicar el embudo' }, { status: 500 })
  }
}, ['settings:write'])

// ─── DELETE: deshacer el embudo del alta ─────────────────────────────────────

export const DELETE = withTenantAuth(async (_request, auth) => {
  try {
    const tenantId = auth.tenant!.id
    const usuarioId = auth.user?.id
    if (!usuarioId) {
      return NextResponse.json(
        { error: 'Necesitas una sesión de usuario para deshacer el alta' },
        { status: 403 },
      )
    }

    const registro = await prisma.implantacionTenant.findUnique({
      where: { tenantId },
      select: { plan: true },
    })
    const guardado = leerPlan(registro?.plan)
    const pipelineId = pipelineDelPlan(registro?.plan)

    if (!pipelineId) {
      return NextResponse.json(
        { error: 'No hay ningún embudo del alta que deshacer' },
        { status: 409 },
      )
    }

    const resultado = await deshacerEmbudo(tenantId, pipelineId)
    if (!resultado.ok) return fallo(resultado)

    await prisma.implantacionTenant.update({
      where: { tenantId },
      data: {
        plan: {
          ...(leerPlan(registro?.plan) ?? {}),
          embudo: guardado?.embudo ?? null,
          pipelineId: null,
          deshechoEn: new Date().toISOString(),
        } as unknown as Prisma.InputJsonValue,
      },
    })

    await prisma.auditLog.create({
      data: {
        tenantId,
        userId: usuarioId,
        accion: 'implantacion_plan_deshacer',
        entidad: 'implantacion',
        entidadId: tenantId,
        descripcion: 'Embudo del alta deshecho: se ha borrado el embudo creado y sus etapas',
        metadata: { pieza: 'embudo', pipelineId },
      },
    })

    const limites = await limitesDeEmbudos(tenantId)

    return NextResponse.json({ ok: true, aplicado: null, aplicadoEn: null, limites })
  } catch (error) {
    console.error('[Implantacion plan DELETE] Error:', error)
    return NextResponse.json({ error: 'No se pudo deshacer el embudo' }, { status: 500 })
  }
}, ['settings:write'])
