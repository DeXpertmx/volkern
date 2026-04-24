import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withTenantAuth } from '@/lib/api-key-auth';

/**
 * POST /api/erp/projects/[id]/milestones - Crear hito
 */
export const POST = withTenantAuth(async (request, auth, { params }) => {
  try {
    const { id: projectId } = params;
    const body = await request.json();

    if (!body.name) {
      return NextResponse.json({ error: 'El nombre es obligatorio' }, { status: 400 });
    }

    const milestone = await prisma.projectMilestone.create({
      data: {
        tenantId: auth.tenant!.id,
        projectId,
        name: body.name,
        description: body.description,
        status: body.status || 'PENDING',
        dueDate: body.dueDate ? new Date(body.dueDate) : null,
        isCritical: body.isCritical || false,
        billingPercentage: body.billingPercentage || 0
      }
    });

    return NextResponse.json(milestone);
  } catch (error) {
    console.error('Error creating milestone:', error);
    return NextResponse.json({ error: 'Error al crear hito' }, { status: 500 });
  }
}, ['erp:write']);
