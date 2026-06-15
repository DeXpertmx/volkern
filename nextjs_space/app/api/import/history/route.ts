import { NextResponse } from 'next/server'
import { withTenantAuth } from '@/lib/api-key-auth'
import { prisma } from '@/lib/db'

export const GET = withTenantAuth(async (_req, auth) => {
  const logs = await prisma.importLog.findMany({
    where: { tenantId: auth.tenant!.id },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })

  return NextResponse.json(logs)
})
