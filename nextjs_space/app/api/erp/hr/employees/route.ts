import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withTenantAuth } from '@/lib/api-key-auth';
import { AdoptionTelemetry } from '@/lib/telemetry/adoption-kpis';

export const GET = withTenantAuth(async (request, auth) => {
  try {
    const tenantId = auth.tenant!.id;
    // Telemetry
    AdoptionTelemetry.trackHubView(tenantId, auth.user!.id, 'HR').catch(() => {});

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
    });

    return NextResponse.json(employees);
  } catch (error: any) {
    console.error('Error fetching employees:', error);
    return NextResponse.json({ 
      data: [], 
      fallback: true, 
      error: error.message 
    });
  }
}, ['hr:read']);
