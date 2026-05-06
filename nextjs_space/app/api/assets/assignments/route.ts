export const dynamic = "force-dynamic";
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withTenantAuth } from '@/lib/api-key-auth';

export const GET = withTenantAuth(async (request, auth) => {
  try {
    const tenantId = auth.tenant!.id;

    const assignments = await prisma.assetAssignment.findMany({
      where: { tenantId },
      include: {
        asset: {
          select: { name: true, category: true, serialNumber: true }
        },
        employee: {
          select: { fullName: true, email: true }
        }
      },
      orderBy: { assignedAt: 'desc' }
    });

    return NextResponse.json(assignments);
  } catch (error: any) {
    console.error('[AssetsAssignments] Error:', error);
    return NextResponse.json({ error: 'Error al cargar asignaciones' }, { status: 500 });
  }
}, { requiredScopes: ['hr:read'] });
