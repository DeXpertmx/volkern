export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withTenantAuth } from '@/lib/api-key-auth'

// GET /api/campanas/[id] - Obtener campaña específica
export const GET = withTenantAuth(async (request, auth, { params }) => {
  try {
    const tenantId = auth.tenant!.id

    const campana = await prisma.campaign.findFirst({
      where: { id: params.id, tenantId },
      include: {
        mensajes: { orderBy: { orden: 'asc' } },
        executions: { take: 100, orderBy: { fechaCreacion: 'desc' } },
        metrics: { orderBy: { fecha: 'desc' }, take: 10 }
      }
    })

    if (!campana) {
      return NextResponse.json({ error: 'Campaña no encontrada' }, { status: 404 })
    }

    return NextResponse.json(campana)
  } catch (error: any) {
    console.error('Error al obtener campaña:', error)
    return NextResponse.json({ error: 'Error al obtener campaña' }, { status: 500 })
  }
}, ['campaigns:read'])

// PUT /api/campanas/[id] - Actualizar campaña
export const PUT = withTenantAuth(async (request, auth, { params }) => {
  try {
    const tenantId = auth.tenant!.id
    const data = await request.json()

    const existing = await prisma.campaign.findFirst({
      where: { id: params.id, tenantId }
    })

    if (!existing) {
      return NextResponse.json({ error: 'Campaña no encontrada' }, { status: 404 })
    }

    if (existing.estado === 'en_curso' || existing.estado === 'completada') {
      return NextResponse.json(
        { error: 'No se puede modificar una campaña en ejecución o completada' },
        { status: 400 }
      )
    }

    const campana = await prisma.campaign.update({
      where: { id: params.id },
      data: {
        nombre: data.nombre,
        descripcion: data.descripcion,
        tipo: data.tipo,
        canales: data.canales,
        targetType: data.targetType,
        targetConfig: data.targetConfig,
        fechaProgramada: data.fechaProgramada ? new Date(data.fechaProgramada) : null,
        frecuencia: data.frecuencia,
        fechaFin: data.fechaFin ? new Date(data.fechaFin) : null
      }
    })

    if (data.mensajes) {
      await prisma.campaignMessage.deleteMany({ where: { campaignId: params.id } })
      for (const mensaje of data.mensajes) {
        await prisma.campaignMessage.create({
          data: {
            campaignId: campana.id,
            canal: mensaje.canal,
            asunto: mensaje.asunto,
            contenido: mensaje.contenido,
            mediaUrl: mensaje.mediaUrl,
            orden: mensaje.orden || 0,
            delayMinutos: mensaje.delayMinutos
          }
        })
      }
    }

    const campanaCompleta = await prisma.campaign.findUnique({
      where: { id: params.id },
      include: { mensajes: true }
    })

    return NextResponse.json(campanaCompleta)
  } catch (error: any) {
    console.error('Error al actualizar campaña:', error)
    return NextResponse.json({ error: 'Error al actualizar campaña' }, { status: 500 })
  }
}, ['campaigns:write'])

// DELETE /api/campanas/[id] - Eliminar campaña
export const DELETE = withTenantAuth(async (request, auth, { params }) => {
  try {
    const tenantId = auth.tenant!.id

    const existing = await prisma.campaign.findFirst({
      where: { id: params.id, tenantId }
    })

    if (!existing) {
      return NextResponse.json({ error: 'Campaña no encontrada' }, { status: 404 })
    }

    if (existing.estado === 'en_curso') {
      return NextResponse.json(
        { error: 'No se puede eliminar una campaña en ejecución' },
        { status: 400 }
      )
    }

    await prisma.campaign.delete({ where: { id: params.id } })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Error al eliminar campaña:', error)
    return NextResponse.json({ error: 'Error al eliminar campaña' }, { status: 500 })
  }
}, ['campaigns:write'])