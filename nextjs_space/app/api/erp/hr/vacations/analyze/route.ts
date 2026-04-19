import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { HRService } from '@/lib/erp/hr-service'
import { analyze_vacation_impact } from '@/lib/skills/hr-management-skills'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id || !(session.user as any).tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { employeeId, startDate, endDate } = await req.json()
    
    // 1. Obtener datos técnicos para el contexto de la IA
    const data = await HRService.checkVacationPolicy(
      employeeId, 
      (session.user as any).tenantId,
      new Date(startDate),
      new Date(endDate)
    )

    // 2. Procesar análisis con Gemma 4
    const analysis = await analyze_vacation_impact(data)

    return NextResponse.json(analysis)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
