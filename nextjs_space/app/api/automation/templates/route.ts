export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

/**
 * GET /api/automation/templates
 * Lista los templates de workflows disponibles
 * El usuario NUNCA ve workflows de n8n directamente, solo estos templates
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const category = searchParams.get('category')

    const templates = await prisma.workflowTemplate.findMany({
      where: {
        isActive: true,
        ...(category ? { category } : {}),
      },
      select: {
        id: true,
        name: true,
        displayName: true,
        description: true,
        category: true,
        icon: true,
        color: true,
        isPremium: true,
        isActive: true,
      },
      orderBy: [
        { category: 'asc' },
        { displayName: 'asc' },
      ],
    })

    return NextResponse.json({ templates })
  } catch (error: any) {
    console.error('[API Templates] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Error al cargar templates' },
      { status: 500 }
    )
  }
}
