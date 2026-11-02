export const dynamic = 'force-dynamic';

/**
 * Personalización del alta: marca y canales de captación.
 *
 * GET    → propuesta de nombre, color y canales según el perfil, con lo que ya
 *          hay en la cuenta (leads por canal, integraciones conectadas).
 * POST   → escribe el nombre comercial y el color, y crea una tarea por canal
 *          para que cada uno se ponga en marcha de verdad.
 * DELETE → deshace: devuelve la marca como estaba y borra las tareas que nadie
 *          ha completado.
 *
 * El logo **no se escribe aquí**: es del cliente y se sube en Identidad Visual.
 */

import { NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { withTenantAuth } from '@/lib/api-key-auth'
import { prisma } from '@/lib/db'
import { normalizarDescubrimiento } from '@/lib/implantacion/descubrimiento'
import {
  proponerCanales,
  proponerMarca,
  normalizarSeleccionMarcaCanales,
  resumenMarcaCanales,
  type ContextoCanales,
  type ContextoMarca,
  type SeleccionMarcaCanales,
} from '@/lib/implantacion/marca-canales'
import { aplicarMarcaCanales, deshacerMarcaCanales, type TareaCanal } from '@/lib/implantacion/aplicar-marca-canales'

interface MarcaGuardada {
  nombre?: string
  color?: string
  seleccion?: string[]
  tareas?: TareaCanal[]
  anteriores?: { nombre?: string | null; color?: string | null }
  aplicadoEn?: string | null
  deshechoEn?: string
}

function leerPlan(plan: unknown): Record<string, unknown> {
  if (!plan || typeof plan !== 'object' || Array.isArray(plan)) return {}
  return plan as Record<string, unknown>
}

function marcaDelPlan(plan: unknown): MarcaGuardada {
  const marca = leerPlan(plan).marca
  if (!marca || typeof marca !== 'object' || Array.isArray(marca)) return {}
  return marca as MarcaGuardada
}

function tareasDelPlan(plan: unknown): TareaCanal[] {
  const bruto = marcaDelPlan(plan).tareas
  if (!Array.isArray(bruto)) return []
  return bruto.filter(
    (tarea): tarea is TareaCanal =>
      Boolean(tarea) &&
      typeof (tarea as TareaCanal).canal === 'string' &&
      typeof (tarea as TareaCanal).id === 'string',
  )
}

async function leerConfig(clave: string, tenantId: string): Promise<string | null> {
  const fila = await prisma.configuracion.findUnique({
    where: { tenantId_clave: { tenantId, clave } },
    select: { valor: true },
  })
  const valor = fila?.valor
  return typeof valor === 'string' && valor.trim() ? valor.trim() : null
}

/**
 * Contexto de la propuesta: la marca que ya existe y lo que la cuenta sabe de
 * sus canales. Se lee de la base en cada pasada a propósito: si alguien conectó
 * WhatsApp o cambió el nombre desde Configuración, la pantalla se lo cree.
 */
async function leerContexto(tenantId: string): Promise<{
  marca: ContextoMarca
  canales: ContextoCanales
}> {
  const [tenant, nombreComercial, logoConfig, canalesLeads, social, whatsapp] = await Promise.all([
    prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { nombre: true, brandingConfig: true, emailDomainStatus: true },
    }),
    leerConfig('business_name', tenantId),
    leerConfig('logo_corporativo', tenantId),
    prisma.lead.groupBy({
      by: ['canal'],
      where: { tenantId },
      _count: { _all: true },
    }),
    prisma.socialPlatformConfig.count({ where: { tenantId, isActive: true } }),
    prisma.tenantWhatsAppInstance.count({ where: { tenantId, status: 'connected' } }),
  ])

  const branding = tenant?.brandingConfig as { logoUrl?: unknown; primaryColor?: unknown } | null
  const colorActual = typeof branding?.primaryColor === 'string' ? branding.primaryColor : null
  const tieneLogo = Boolean(logoConfig) || Boolean(branding?.logoUrl)

  const leadsPorCanal: Record<string, number> = {}
  for (const fila of canalesLeads) {
    if (typeof fila.canal === 'string' && fila.canal) {
      leadsPorCanal[fila.canal] = fila._count._all
    }
  }

  const conectados: string[] = []
  if (whatsapp > 0) conectados.push('whatsapp')
  if (social > 0) conectados.push('redes_sociales')
  if (tenant?.emailDomainStatus === 'verified') conectados.push('email')

  return {
    marca: {
      nombreCuenta: tenant?.nombre ?? '',
      nombreComercial,
      colorActual,
      tieneLogo,
    },
    canales: { leadsPorCanal, conectados },
  }
}

// ─── GET ─────────────────────────────────────────────────────────────────────

export const GET = withTenantAuth(async (_request, auth) => {
  try {
    const tenantId = auth.tenant!.id

    const registro = await prisma.implantacionTenant.findUnique({
      where: { tenantId },
      select: { descubrimiento: true, plan: true },
    })

    const { descubrimiento } = normalizarDescubrimiento(registro?.descubrimiento)
    const { marca: contextoMarca, canales: contextoCanales } = await leerContexto(tenantId)

    const propuesta = proponerMarca(descubrimiento, contextoMarca)
    const canales = proponerCanales(descubrimiento, contextoCanales)

    // Sin elección guardada se parte de lo propuesto: el nombre de la cuenta,
    // el color del sector y los canales que salieron del perfil.
    const guardada = marcaDelPlan(registro?.plan)
    const porDefecto: SeleccionMarcaCanales = {
      nombre: propuesta.nombre.propuesto,
      color: propuesta.color.propuesto,
      canales: canales.canales.filter((canal) => canal.propuesto).map((canal) => canal.id),
    }

    const normalizada = normalizarSeleccionMarcaCanales(
      {
        nombre: guardada.nombre ?? porDefecto.nombre,
        color: guardada.color ?? porDefecto.color,
        canales: guardada.seleccion ?? porDefecto.canales,
      },
      propuesta,
      canales.canales,
    )

    return NextResponse.json({
      propuesta,
      canales: canales.canales,
      origenDeclarado: canales.origenDeclarado,
      seleccion: normalizada.seleccion,
      resumen: resumenMarcaCanales(normalizada.seleccion, propuesta),
      aplicadoEn: guardada.aplicadoEn ?? null,
      // Deshacer existe mientras haya algo aplicado. Al deshacer se retira la
      // marca, así que el botón desaparece en vez de ofrecer un no-op.
      deshacerDisponible: Boolean(guardada.aplicadoEn),
      avisos: [...canales.avisos, ...normalizada.avisos],
    })
  } catch (error) {
    console.error('[Implantacion marca GET] Error:', error)
    return NextResponse.json({ error: 'Error al leer la marca del alta' }, { status: 500 })
  }
}, ['settings:read'])

// ─── POST: aplicar marca y canales ───────────────────────────────────────────

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
      select: { descubrimiento: true, plan: true, estado: true },
    })
    if (!registro) {
      return NextResponse.json(
        { error: 'Primero hay que completar el descubrimiento del alta guiada' },
        { status: 409 },
      )
    }

    const { descubrimiento } = normalizarDescubrimiento(registro.descubrimiento)
    const { marca: contextoMarca, canales: contextoCanales } = await leerContexto(tenantId)
    const propuesta = proponerMarca(descubrimiento, contextoMarca)
    const canales = proponerCanales(descubrimiento, contextoCanales)

    const cuerpo = (await request.json().catch(() => ({}))) as Record<string, unknown>
    const { seleccion, avisos } = normalizarSeleccionMarcaCanales(cuerpo, propuesta, canales.canales)

    const tareasPrevias = tareasDelPlan(registro.plan)
    const resultado = await aplicarMarcaCanales(
      tenantId,
      usuarioId,
      seleccion,
      canales.canales,
      tareasPrevias,
    )

    if (!resultado.ok) {
      return NextResponse.json({ error: resultado.mensaje, avisos }, { status: 400 })
    }

    const ahora = new Date()
    const tareas: TareaCanal[] = [
      // Las que se quedaron por estar completadas siguen apuntadas: si algún día
      // se vuelven a desmarcar, deshacer ya no las toca y el registro lo dice.
      ...resultado.resultado.conservadas,
      ...resultado.resultado.canales.map(({ canal, id }) => ({ canal, id })),
    ]

    await prisma.implantacionTenant.update({
      where: { tenantId },
      data: {
        plan: {
          ...leerPlan(registro.plan),
          marca: {
            nombre: seleccion.nombre,
            color: seleccion.color,
            seleccion: seleccion.canales,
            tareas,
            anteriores: resultado.resultado.anteriores,
            aplicadoEn: ahora.toISOString(),
            aplicadoPor: usuarioId,
          },
        } as unknown as Prisma.InputJsonValue,
      },
    })

    const cambioMarca = [
      resultado.resultado.nombre.cambiado ? `nombre «${seleccion.nombre}»` : null,
      resultado.resultado.color.cambiado ? `color ${seleccion.color}` : null,
    ].filter(Boolean)

    await prisma.auditLog.create({
      data: {
        tenantId,
        userId: usuarioId,
        accion: 'implantacion_marca',
        entidad: 'implantacion',
        entidadId: tenantId,
        descripcion: `Marca y canales del alta aplicados: ${
          cambioMarca.length ? cambioMarca.join(', ') : 'la marca ya estaba igual'
        }; ${resultado.resultado.canales.length} canal${
          resultado.resultado.canales.length === 1 ? '' : 'es'
        } con tarea${resultado.resultado.borradas.length ? `, ${resultado.resultado.borradas.length} tarea(s) retirada(s)` : ''}`,
        metadata: {
          pieza: 'marca',
          seleccion: seleccion as unknown as Prisma.InputJsonValue,
          resultado: resultado.resultado as unknown as Prisma.InputJsonValue,
          estadoPrevio: registro.estado,
        },
      },
    })

    return NextResponse.json({
      ok: true,
      resultado: resultado.resultado,
      seleccion,
      resumen: resumenMarcaCanales(seleccion, propuesta),
      avisos,
      aplicadoEn: ahora.toISOString(),
      tareas,
    })
  } catch (error) {
    console.error('[Implantacion marca POST] Error:', error)
    return NextResponse.json({ error: 'No se pudo aplicar la marca y los canales' }, { status: 500 })
  }
}, ['settings:write'])

// ─── DELETE: deshacer ────────────────────────────────────────────────────────

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
    const guardada = marcaDelPlan(registro?.plan)
    const tareas = tareasDelPlan(registro?.plan)

    if (!guardada.aplicadoEn) {
      return NextResponse.json(
        { error: 'No hay ninguna marca del alta que deshacer' },
        { status: 409 },
      )
    }

    const resultado = await deshacerMarcaCanales(
      tenantId,
      {
        nombre: guardada.anteriores?.nombre ?? null,
        color: guardada.anteriores?.color ?? null,
      },
      tareas,
    )

    await prisma.implantacionTenant.update({
      where: { tenantId },
      data: {
        plan: {
          ...leerPlan(registro?.plan),
          marca: {
            ...guardada,
            // Lo que se queda porque está completado sigue apuntado: si algún
            // día hace falta, se puede volver a intentar.
            tareas: resultado.conservadas,
            // Sin marca aplicada no hay nada que deshacer: el histórico queda
            // en `deshechoEn` para auditoría.
            aplicadoEn: null,
            deshechoEn: new Date().toISOString(),
          },
        } as unknown as Prisma.InputJsonValue,
      },
    })

    await prisma.auditLog.create({
      data: {
        tenantId,
        userId: usuarioId,
        accion: 'implantacion_marca_deshacer',
        entidad: 'implantacion',
        entidadId: tenantId,
        descripcion: `Marca del alta deshecha: ${
          resultado.borradas.length
            ? `${resultado.borradas.length} tarea(s) retirada(s)`
            : 'no había tareas pendientes que retirar'
        }${resultado.conservadas.length ? `, ${resultado.conservadas.length} conservada(s) por estar hechas` : ''}`,
        metadata: {
          pieza: 'marca',
          borradas: resultado.borradas,
          conservadas: resultado.conservadas,
          restaurado: {
            nombre: resultado.nombreRestaurado,
            color: resultado.colorRestaurado,
          },
        } as unknown as Prisma.InputJsonValue,
      },
    })

    return NextResponse.json({
      ok: true,
      borradas: resultado.borradas,
      conservadas: resultado.conservadas,
      ausentes: resultado.ausentes,
      restaurado: { nombre: resultado.nombreRestaurado, color: resultado.colorRestaurado },
    })
  } catch (error) {
    console.error('[Implantacion marca DELETE] Error:', error)
    return NextResponse.json({ error: 'No se pudo deshacer la marca' }, { status: 500 })
  }
}, ['settings:write'])
