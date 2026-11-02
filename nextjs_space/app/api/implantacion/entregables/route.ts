export const dynamic = 'force-dynamic';

/**
 * Informes y plantillas del alta guiada.
 *
 * GET  → catálogo, propuesta del perfil, elección guardada y el estado real de
 *        cada informe fijado (con datos, o con el primer paso si aún no hay).
 * POST → guarda la elección **y la aplica**: crea las plantillas que se pueden
 *        crear y deja fijados los informes.
 *
 * La propuesta de partida es la que el cliente vio en su descubrimiento
 * (`ImplantacionTenant.recomendacion`), no un recálculo: si mañana cambia el
 * plan, sus informes fijados no deben cambiar solos por detrás.
 */

import { NextResponse } from 'next/server'
import { withTenantAuth } from '@/lib/api-key-auth'
import { prisma } from '@/lib/db'
import {
  INFORMES_ENTREGABLES,
  MAX_INFORMES,
  MAX_PLANTILLAS,
  MIN_INFORMES,
  MIN_PLANTILLAS,
  PLANTILLAS_ENTREGABLES,
  normalizarEntregables,
  resumenSeleccion,
  seleccionRecomendada,
  type SeleccionEntregables,
} from '@/lib/implantacion/entregables'
import { aplicarEntregables } from '@/lib/implantacion/aplicar-entregables'
import { cargarInformes } from '@/lib/implantacion/informes-datos'

interface RecomendacionGuardada {
  informes?: string[]
  plantillas?: string[]
}

function propuestaDelPerfil(recomendacion: unknown): SeleccionEntregables {
  const guardada = (recomendacion ?? {}) as RecomendacionGuardada
  return seleccionRecomendada({
    informes: Array.isArray(guardada.informes) ? guardada.informes : [],
    plantillas: Array.isArray(guardada.plantillas) ? guardada.plantillas : [],
  })
}

function topes() {
  return { informes: MAX_INFORMES, plantillas: MAX_PLANTILLAS, minInformes: MIN_INFORMES, minPlantillas: MIN_PLANTILLAS }
}

export const GET = withTenantAuth(async (_req, auth) => {
  try {
    const tenantId = auth.tenant!.id
    const registro = await prisma.implantacionTenant.findUnique({
      where: { tenantId },
      select: { recomendacion: true, informes: true, plantillas: true, entregablesAplicadosEn: true },
    })

    const recomendada = propuestaDelPerfil(registro?.recomendacion)
    const guardada: SeleccionEntregables = {
      informes: registro?.informes ?? [],
      plantillas: registro?.plantillas ?? [],
    }
    const seleccion: SeleccionEntregables =
      guardada.informes.length > 0 || guardada.plantillas.length > 0 ? guardada : recomendada

    const informes = await cargarInformes(tenantId, seleccion.informes)
    const aplicadoEn = registro?.entregablesAplicadosEn ?? null

    return NextResponse.json({
      seleccion,
      recomendada,
      catalogo: { informes: INFORMES_ENTREGABLES, plantillas: PLANTILLAS_ENTREGABLES },
      topes: topes(),
      resumen: resumenSeleccion(seleccion),
      aplicadoEn,
      // Lo que se pinta sin haber aplicado es la **propuesta** del alta, no algo
      // que el cliente haya fijado: el panel lo dice en vez de aparentar que
      // esos informes ya son suyos y están vacíos por falta de datos.
      pendienteDeAplicar: !aplicadoEn && seleccion.informes.length > 0,
      informes,
    })
  } catch (error) {
    console.error('[Implantacion entregables GET] Error:', error)
    return NextResponse.json({ error: 'Error al leer tus informes y plantillas' }, { status: 500 })
  }
}, ['settings:read'])

export const POST = withTenantAuth(async (request, auth) => {
  try {
    const tenantId = auth.tenant!.id
    const usuarioId = auth.user?.id
    if (!usuarioId) {
      return NextResponse.json({ error: 'Necesitas una sesión de usuario para aplicar el alta' }, { status: 403 })
    }

    const registro = await prisma.implantacionTenant.findUnique({
      where: { tenantId },
      select: { recomendacion: true },
    })
    if (!registro) {
      return NextResponse.json(
        { error: 'Primero hay que completar el descubrimiento del alta guiada' },
        { status: 409 },
      )
    }
    const recomendada = propuestaDelPerfil(registro.recomendacion)

    const cuerpo = await request.json().catch(() => ({}))
    const { seleccion, avisos } = normalizarEntregables(cuerpo, recomendada)

    const aplicacion = await aplicarEntregables(tenantId, usuarioId, seleccion)
    const ahora = new Date()

    await prisma.implantacionTenant.update({
      where: { tenantId },
      data: {
        informes: seleccion.informes,
        plantillas: seleccion.plantillas,
        entregablesAplicadosEn: ahora,
      },
    })

    await prisma.auditLog.create({
      data: {
        tenantId,
        userId: usuarioId,
        accion: 'implantacion_entregables',
        entidad: 'implantacion',
        entidadId: tenantId,
        descripcion: `Informes y plantillas del alta aplicados: ${seleccion.informes.length} informes, ${seleccion.plantillas.length} plantillas (${aplicacion.creadas} creadas)`,
        metadata: {
          informes: seleccion.informes,
          plantillas: seleccion.plantillas,
          creadas: aplicacion.creadas,
          manuales: aplicacion.manuales,
        },
      },
    })

    const informes = await cargarInformes(tenantId, seleccion.informes)

    return NextResponse.json({
      seleccion,
      avisos,
      aplicacion,
      aplicadoEn: ahora.toISOString(),
      pendienteDeAplicar: false,
      resumen: resumenSeleccion(seleccion),
      informes,
    })
  } catch (error) {
    console.error('[Implantacion entregables POST] Error:', error)
    return NextResponse.json({ error: 'No se pudieron aplicar tus informes y plantillas' }, { status: 500 })
  }
}, ['settings:write'])
