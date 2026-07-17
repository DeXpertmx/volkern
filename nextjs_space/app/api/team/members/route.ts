export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withTenantAuth } from '@/lib/api-key-auth';

/**
 * GET /api/team/members
 * Devuelve los miembros activos del tenant para asignación de leads, citas y tareas.
 * No requiere permiso de "equipo: ver" — cualquier usuario autenticado del tenant puede usar esto.
 */
export const GET = withTenantAuth(async (req, auth) => {
  try {
    const tenantId = auth.tenant!.id;

    const employees = await prisma.employee.findMany({
      where: {
        tenantId,
        isActive: true,
      },
      select: {
        id: true,
        fullName: true,
        email: true,
        jobTitle: true,
        department: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
            estado: true,
          },
        },
      },
      orderBy: { fullName: 'asc' },
    });

    const members = employees
      .filter((emp) => emp.user && emp.user.estado !== 'inactivo')
      .map((emp) => ({
        id: emp.user!.id,
        name: emp.fullName || emp.user!.name || emp.user!.email,
        email: emp.email || emp.user!.email,
        image: emp.user!.image,
        jobTitle: emp.jobTitle,
        department: emp.department,
      }));

    return NextResponse.json({ members });
  } catch (error: any) {
    console.error('[GET /api/team/members] Error:', error);
    return NextResponse.json(
      { error: 'Error al obtener miembros del equipo' },
      { status: 500 }
    );
  }
}, ['leads:read']);
