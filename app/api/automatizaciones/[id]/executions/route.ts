export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')

    const executions = await prisma.automationExecution.findMany({
      where: { automationId: params.id },
      include: {
        logs: {
          orderBy: {
            fechaCreacion: 'asc'
          }
        }
      },
      orderBy: {
        fechaInicio: 'desc'
      },
      take: limit,
      skip: offset
    })

    const total = await prisma.automationExecution.count({
      where: { automationId: params.id }
    })

    return NextResponse.json({
      executions,
      total,
      limit,
      offset
    })
  } catch (error) {
    console.error('Error al obtener ejecuciones:', error)
    return NextResponse.json(
      { error: 'Error al obtener ejecuciones' },
      { status: 500 }
    )
  }
}
