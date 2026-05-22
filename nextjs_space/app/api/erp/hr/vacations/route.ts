export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { HRService } from '@/lib/erp/hr-service'
import { prisma } from '@/lib/db'
import { validateBody } from '@/lib/validation'
import { VacationRequestSchema } from '@/lib/validation/schemas'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id || !(session.user as any).tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const tenantId = (session.user as any).tenantId
  const vacations = await (prisma as any).erp_vacation_requests.findMany({
    where: { tenantId },
    include: { erp_employees: true },
    orderBy: { startDate: 'desc' }
  })

  return NextResponse.json(vacations)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id || !(session.user as any).tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const raw = await req.json()
    const body = validateBody(VacationRequestSchema, raw)
    if (body instanceof NextResponse) return body

    const vacation = await HRService.requestVacation({
      ...body,
      tenantId: (session.user as any).tenantId,
      startDate: new Date(body.fechaInicio),
      endDate: new Date(body.fechaFin)
    })
    return NextResponse.json(vacation)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id || !(session.user as any).tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const { id, action } = body
    
    if (action === 'APPROVE') {
      const vacation = await HRService.approveVacation(id, (session.user as any).tenantId, (session.user as any).id)
      return NextResponse.json(vacation)
    }
    
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
