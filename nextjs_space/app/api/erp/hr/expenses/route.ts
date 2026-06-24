export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { HRService } from '@/lib/erp/hr-service'
import { prisma } from '@/lib/db'
import { validateBody } from '@/lib/validation'
import { ExpenseCreateSchema } from '@/lib/validation/schemas'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id || !(session.user as any).tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const tenantId = (session.user as any).tenantId
  const status = req.nextUrl.searchParams.get('status') || 'PENDING'
  
  const claims = await (prisma as any).erp_expense_claims.findMany({
    where: { tenantId, status },
    include: { erp_employees: true },
    orderBy: { createdAt: 'desc' }
  })

  return NextResponse.json(claims)
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id || !(session.user as any).tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const raw = await req.json()
    const body = validateBody(ExpenseCreateSchema, raw)
    if (body instanceof NextResponse) return body

    const claim = await HRService.submitExpenseClaim({
      ...body,
      tenantId: (session.user as any).tenantId
    } as any)
    return NextResponse.json(claim)
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
      const expense = await HRService.authorizeExpense(id, (session.user as any).tenantId, (session.user as any).id)
      return NextResponse.json(expense)
    }
    
    if (action === 'REJECT') {
      const claim = await HRService.rejectExpense(id, (session.user as any).tenantId)
      return NextResponse.json(claim)
    }
    
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
