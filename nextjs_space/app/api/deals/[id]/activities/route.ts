export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { prisma } from '@/lib/db'
import { authOptions } from '@/lib/auth'
import { actividadBloqueada, puertaActivaEnEtiquetas } from '@/lib/sales/training-gate'

// POST - Crear actividad del deal
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    })

    if (!user?.tenantId) {
      return NextResponse.json({ error: 'Usuario sin tenant' }, { status: 403 })
    }

    // Verificar que el deal existe
    const deal = await prisma.deal.findFirst({
      where: {
        id: params.id,
        tenantId: user.tenantId,
      },
    })

    if (!deal) {
      return NextResponse.json({ error: 'Deal no encontrado' }, { status: 404 })
    }

    const body = await req.json()
    const { tipo, titulo, descripcion, resultado, duracion, fechaActividad } = body

    if (!tipo) {
      return NextResponse.json({ error: 'Tipo de actividad requerido' }, { status: 400 })
    }

    // PUERTA DE PRÁCTICA (bucle riesgo → roleplay): con la puerta activa,
    // la oportunidad no se toca con el cliente — llamada, cita o interacción
    // (actividad/cita/interaccion) devuelven 423 con el motivo y el enlace al
    // simulador. Lo interno (nota, tarea, cotización, cambio de etapa…)
    // sigue permitido: preparar la venta no se bloquea — se exige.
    if (actividadBloqueada(tipo, puertaActivaEnEtiquetas(deal.tags))) {
      return NextResponse.json(
        {
          error:
            'Esta oportunidad está en riesgo crítico: exige práctica antes de contactar al cliente.',
          codigo: 'PRACTICA_REQUERIDA',
          simulador: `/api/training/roleplay?leadId=${deal.leadId ?? ''}`,
        },
        { status: 423 }
      )
    }

    const actividad = await prisma.dealActivity.create({
      data: {
        dealId: params.id,
        tenantId: user.tenantId,
        userId: user.id,
        tipo,
        titulo,
        descripcion,
        resultado,
        duracion: duracion ? parseInt(duracion) : null,
        fechaActividad: fechaActividad ? new Date(fechaActividad) : null,
      },
      include: {
        usuario: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    })

    // Actualizar última actividad del deal
    await prisma.deal.update({
      where: { id: params.id },
      data: {
        fechaUltimaActividad: new Date(),
        numeroActividades: { increment: 1 },
      },
    })

    return NextResponse.json({ actividad }, { status: 201 })
  } catch (error: any) {
    console.error('Error al crear actividad:', error)
    return NextResponse.json(
      { error: 'Error al crear actividad', details: error.message },
      { status: 500 }
    )
  }
}
