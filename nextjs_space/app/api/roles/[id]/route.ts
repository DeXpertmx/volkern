export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { hasPermission } from '@/lib/permissions';
import {
  esRolDeCatalogoEnUso,
  permisosTocanHospitality,
  puedeGestionarRolesDeHospitality,
} from '@/lib/hospitality/roles';
import { esNombreDeRolBasico } from '@/lib/roles-basicos';

export async function PATCH(
  req: NextRequest,
  { params: paramsPromise }: { params: Promise<{ id: string }> }
) {
  const params = await paramsPromise;
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

    // Verificar permiso (solo Admin o Superadmin pueden editar roles)
    if (!hasPermission(currentUser, 'equipo', 'editar')) {
      return NextResponse.json({ error: 'Sin permiso para editar roles' }, { status: 403 });
    }

    const { nombre, descripcion, permisos } = await req.json();

    // No permitir editar el rol 'Superadmin'
    const targetRole = await prisma.role.findUnique({ where: { id: params.id } });
    if (targetRole?.nombre === 'Superadmin') {
      return NextResponse.json({ error: 'No se puede editar el rol Superadmin' }, { status: 403 });
    }

    // El catálogo básico forma parte del vocabulario de la cuenta: sus roles
    // no se renombran (rompería la idempotencia del alta), pero sí se ajustan
    // — para eso está la matriz de permisos.
    if (esNombreDeRolBasico(targetRole?.nombre) && nombre && nombre !== targetRole?.nombre) {
      return NextResponse.json(
        {
          error: `«${targetRole?.nombre}» es parte del catálogo básico de la cuenta: no se renombra, pero se le ajustan las capacidades`,
        },
        { status: 409 }
      );
    }

    // Un rol de Hospitality —el que toca hoy o el que va a tocar con este
    // cambio— no lo reparte cualquiera. La llave es `equipo.roles`, y el
    // Anfitrión del catálogo la tiene.
    const tocaHospitality =
      permisosTocanHospitality(targetRole?.permisos) || permisosTocanHospitality(permisos);
    if (tocaHospitality && !puedeGestionarRolesDeHospitality(currentUser.role)) {
      return NextResponse.json(
        {
          error: 'Solo quien administra los roles de Hospitality puede cambiar este rol',
          permisoRequerido: 'equipo.roles',
        },
        { status: 403 }
      );
    }

    // El vocabulario del producto no se renombra: hay textos y reglas que lo
    // nombran. Sus capacidades, en cambio, se ajustan — para eso está la matriz.
    if (esRolDeCatalogoEnUso(targetRole?.nombre, targetRole?.permisos) && nombre && nombre !== targetRole?.nombre) {
      return NextResponse.json(
        {
          error: `«${targetRole?.nombre}» es parte del vocabulario de Hospitality: no se renombra, pero se le ajustan las capacidades`,
        },
        { status: 409 }
      );
    }

    const updatedRole = await prisma.role.update({
      where: { id: params.id },
      data: {
        nombre,
        descripcion,
        permisos: permisos || undefined,
      },
    });

    return NextResponse.json(updatedRole);
  } catch (error: any) {
    console.error('Error al actualizar rol:', error);
    return NextResponse.json({ error: 'Error al actualizar rol' }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params: paramsPromise }: { params: Promise<{ id: string }> }
) {
  const params = await paramsPromise;
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

    if (!hasPermission(currentUser, 'equipo', 'eliminar')) {
      return NextResponse.json({ error: 'Sin permiso para eliminar roles' }, { status: 403 });
    }

    const targetRole = await prisma.role.findUnique({ where: { id: params.id } });
    if (targetRole?.nombre === 'Superadmin' || esNombreDeRolBasico(targetRole?.nombre)) {
      return NextResponse.json({ error: 'No se pueden eliminar roles protegidos' }, { status: 403 });
    }

    // Quitar un rol de Hospitality deja a sus usuarios sin poder entrar al
    // módulo. Es tan delicado como cambiarlo, así que pide la misma llave.
    if (permisosTocanHospitality(targetRole?.permisos) && !puedeGestionarRolesDeHospitality(currentUser.role)) {
      return NextResponse.json(
        {
          error: 'Solo quien administra los roles de Hospitality puede eliminar este rol',
          permisoRequerido: 'equipo.roles',
        },
        { status: 403 }
      );
    }

    // Y los del catálogo no se borran: se aplican.
    if (esRolDeCatalogoEnUso(targetRole?.nombre, targetRole?.permisos)) {
      return NextResponse.json(
        { error: `«${targetRole?.nombre}» es un rol del vocabulario de Hospitality y no se elimina` },
        { status: 409 }
      );
    }

    await prisma.role.delete({ where: { id: params.id } });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error al eliminar rol:', error);
    return NextResponse.json({ error: 'Error al eliminar rol' }, { status: 500 });
  }
}
