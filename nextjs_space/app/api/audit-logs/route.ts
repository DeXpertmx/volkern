export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { hasPermission } from '@/lib/permissions'


// GET /api/audit-logs - Obtener logs de auditoría
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const currentUser = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: { role: true },
    })

    if (!currentUser) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 })
    }

    // Verificar permiso
    if (!hasPermission(currentUser, 'configuracion', 'ver')) {
      return NextResponse.json({ error: 'Sin permiso para ver logs' }, { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    const entityId = searchParams.get('entityId')
    const entity = searchParams.get('entity')
    const limit = parseInt(searchParams.get('limit') || '50')

    const whereClause: any = {
      tenantId: currentUser.tenantId || undefined,
    }

    if (entityId) {
      whereClause.entidadId = entityId
    }

    if (entity) {
      whereClause.entidad = entity
    }

    const logs = await prisma.auditLog.findMany({
      where: whereClause,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: {
        fechaCreacion: 'desc',
      },
      take: limit,
    })

    return NextResponse.json({ logs })
  } catch (error: any) {
    console.error('Error al obtener audit logs:', error)
    return NextResponse.json({ error: 'Error al obtener logs' }, { status: 500 })
  }
}
