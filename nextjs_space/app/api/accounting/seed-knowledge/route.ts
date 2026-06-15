import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { seedKnowledgeBase } from '@/lib/accounting/seed-knowledge-base'

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const body = await req.json().catch(() => ({}))
    const tenantId = body.tenantId || (session.user as any).tenantId

    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant ID requerido' }, { status: 400 })
    }

    const created = await seedKnowledgeBase(tenantId, session.user.id)

    return NextResponse.json({
      success: true,
      created,
      message: `Knowledge base poblada con ${created} artículos contables/fiscales`,
    })
  } catch (error) {
    console.error('[SeedKB] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error desconocido' },
      { status: 500 }
    )
  }
}
