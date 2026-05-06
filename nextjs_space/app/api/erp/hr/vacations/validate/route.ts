export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { HRService } from '@/lib/erp/hr-service'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id || !(session.user as any).tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { employeeId, startDate, endDate } = await req.json()
    
    if (!employeeId || !startDate || !endDate) {
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 })
    }

    const validation = await HRService.checkVacationPolicy(
      employeeId, 
      (session.user as any).tenantId,
      new Date(startDate),
      new Date(endDate)
    )

    return NextResponse.json(validation)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
