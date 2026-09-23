export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { hasPermission } from '@/lib/permissions';
import {
  esNombreDeRolHospitality,
  permisosTocanHospitality,
  puedeGestionarRolesDeHospitality,
} from '@/lib/hospitality/roles';

// GET /api/roles - Listar roles del tenant
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const currentUser = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: { role: true },
    });

    if (!currentUser) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });
    }

    // Verificar permiso
    if (!hasPermission(currentUser, 'equipo', 'ver')) {
      return NextResponse.json({ error: 'Sin permiso para ver roles' }, { status: 403 });
    }

    // Obtener roles del mismo tenant
    const roles = await prisma.role.findMany({
      where: {
        tenantId: currentUser.tenantId || undefined,
      },
      orderBy: {
        orden: 'asc',
      },
    });

    return NextResponse.json(roles);
  } catch (error: any) {
    console.error('Error al obtener roles:', error);
    return NextResponse.json({ error: 'Error al obtener roles' }, { status: 500 });
  }
}

// POST /api/roles - Crear nuevo rol
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const currentUser = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: { role: true },
    });

    if (!currentUser) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });
    }

    if (!hasPermission(currentUser, 'equipo', 'crear')) {
      return NextResponse.json({ error: 'Sin permiso para crear roles' }, { status: 403 });
    }

    const { nombre, descripcion, permisos } = await req.json();

    // Crear un rol con capacidades de Hospitality es repartir el acceso al
    // alojamiento —incluido, si se concede, el certificado de la entidad ante el
    // Ministerio—. Eso no va con «gestionar el equipo»: tiene su propia llave, y
    // es la que separa al Anfitrión del resto.
    if (permisosTocanHospitality(permisos) && !puedeGestionarRolesDeHospitality(currentUser.role)) {
      return NextResponse.json(
        {
          error: 'Solo quien administra los roles de Hospitality puede crear un rol con esas capacidades',
          permisoRequerido: 'equipo.roles',
        },
        { status: 403 }
      );
    }

    // Los nombres del vocabulario los crea el catálogo, para que el rol que
    // nace sea el rol que el producto describe. Se exige que además lleve
    // capacidades del módulo: «Agente» es una palabra corriente —una correduría
    // de seguros tiene agentes— y no se puede bloquear un rol ajeno al alojamiento
    // solo por cómo se llama.
    if (esNombreDeRolHospitality(nombre) && permisosTocanHospitality(permisos)) {
      return NextResponse.json(
        {
          error: `«${nombre}» es un rol del vocabulario de Hospitality: se crea aplicando el catálogo del módulo`,
        },
        { status: 409 }
      );
    }

    const role = await prisma.role.create({
      data: {
        nombre,
        descripcion,
        permisos: permisos || {},
        tenantId: currentUser.tenantId,
        orden: (await prisma.role.count({ where: { tenantId: currentUser.tenantId } })) + 1,
      },
    });

    return NextResponse.json(role);
  } catch (error: any) {
    console.error('Error al crear rol:', error);
    return NextResponse.json({ error: 'Error al crear rol' }, { status: 500 });
  }
}
