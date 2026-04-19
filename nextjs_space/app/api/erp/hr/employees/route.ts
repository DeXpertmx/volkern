import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id || !(session.user as any).tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const tenantId = (session.user as any).tenantId
  const employees = await prisma.employee.findMany({
    where: { tenantId },
    select: {
      id: true,
      fullName: true,
      role: true,
      department: true,
      isActive: true
    },
    orderBy: { fullName: 'asc' }
  })

  return NextResponse.json(employees)
}
