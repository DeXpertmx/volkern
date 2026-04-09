export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/db'

// Obtener historial de comunicaciones de un contacto específico
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const leadId = searchParams.get('leadId')
    const estudianteId = searchParams.get('estudianteId')
    const canal = searchParams.get('canal')

    if (!leadId && !estudianteId) {
      return NextResponse.json(
        { error: 'Se requiere leadId o estudianteId' },
        { status: 400 }
      )
    }

    const where: any = {}
    
    if (leadId) {
      where.leadId = leadId
    }
    
    if (estudianteId) {
      where.estudianteId = estudianteId
    }
    
    if (canal && canal !== 'todos') {
      where.canal = canal
    }

    const conversaciones = await prisma.conversation.findMany({
      where,
      include: {
        mensajes: {
          orderBy: { fechaCreacion: 'asc' },
        },
      },
      orderBy: { fechaCreacion: 'desc' },
    })

    // Contar mensajes por canal
    const estadisticas = {
      totalConversaciones: conversaciones.length,
      totalMensajes: conversaciones.reduce((acc, conv) => acc + conv.mensajes.length, 0),
      porCanal: {
        whatsapp: conversaciones.filter(c => c.canal === 'whatsapp').length,
        email: conversaciones.filter(c => c.canal === 'email').length,
      },
    }

    return NextResponse.json({
      conversaciones,
      estadisticas,
    })
  } catch (error: any) {
    console.error('Error obteniendo historial:', error)
    return NextResponse.json(
      { error: error.message || 'Error obteniendo historial' },
      { status: 500 }
    )
  }
}
