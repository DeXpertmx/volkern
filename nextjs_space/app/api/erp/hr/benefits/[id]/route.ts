export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withTenantAuth } from '@/lib/api-key-auth';

export const DELETE = withTenantAuth(async (request, auth) => {
  const url = new URL(request.url);
  const pathParts = url.pathname.split('/');
  const id = pathParts[pathParts.length - 1];

  try {
    await prisma.employeeBenefit.update({
      where: { id, tenantId: auth.tenant!.id },
      data: { active: false }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Error al desactivar el beneficio' }, { status: 500 });
  }
}, ['erp:write']);
