import { NextResponse } from 'next/server'
import { withTenantAuth } from '@/lib/api-key-auth'
import { prisma } from '@/lib/db'

export const GET = withTenantAuth(async (_req, auth) => {
  // Las previsualizaciones también dejan rastro (sirven de auditoría), pero el
  // historial enseña solo lo que escribió datos.
  const logs = await prisma.importLog.findMany({
    where: { tenantId: auth.tenant!.id, mode: 'commit' },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })

  return NextResponse.json(logs)
}, ['import:read'])
