import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
    })

    if (!user?.tenantId) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 })
    }

    const { pgcPlan, fiscalYear, ivaDefecto } = await req.json()
    const tenantId = user.tenantId

    const AccountingInitializer = (await import('@/lib/accounting/initializer')).AccountingInitializer
    if (AccountingInitializer?.initializeTenant) {
      await AccountingInitializer.initializeTenant(tenantId, pgcPlan || 'PYMES', "NINGUNO")
    }

    await prisma.tenant.update({
      where: { id: tenantId },
      data: {
        configuracion: {
          ...(await prisma.tenant.findUnique({ where: { id: tenantId }, select: { configuracion: true } }))?.configuracion as any || {},
          pgcPlan: pgcPlan || 'PYMES',
          fiscalYear: fiscalYear || new Date().getFullYear(),
          ivaDefecto: ivaDefecto || 21,
        },
      },
    })

    await prisma.onboardingProgress.upsert({
      where: { tenantId },
      update: { pasoActual: 6 },
      create: { tenantId, pasoActual: 6 },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Accounting Setup] Error:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error' }, { status: 500 })
  }
}
