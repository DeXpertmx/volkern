export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withTenantAuth } from '@/lib/api-key-auth';

/**
 * GET /api/team/members
 * Devuelve los miembros del equipo del tenant para asignación de leads, citas y tareas.
 * No requiere permiso de "equipo: ver" — cualquier usuario autenticado del tenant puede usar esto.
 *
 * Fuente primaria: los usuarios del tenant (User.tenantId) — el Equipo.
 * La ficha de empleado (RRHH) es un enriquecimiento opcional: si el tenant tiene
 * `erp_employees` la usamos para nombre/departamento/cargo; si no (tenant sin RRHH),
 * el usuario aparece igualmente con sus propios datos.
 */
export const GET = withTenantAuth(async (req, auth) => {
  try {
    const tenantId = auth.tenant!.id;

    const users = await prisma.user.findMany({
      where: {
        tenantId,
        estado: { not: 'inactivo' },
      },
      include: {
        employee: {
          select: {
            id: true,
            fullName: true,
            email: true,
            jobTitle: true,
            department: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    const members = users.map((u) => ({
      id: u.id,
      name: u.employee?.fullName || u.name || u.email,
      email: u.employee?.email || u.email,
      image: u.image,
      jobTitle: u.employee?.jobTitle || null,
      department: u.employee?.department || null,
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
