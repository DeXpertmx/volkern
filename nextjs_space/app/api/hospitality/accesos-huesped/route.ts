export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { authenticateRequest } from '@/lib/api-key-auth';
import { exigirPermisoHospitality } from '@/lib/hospitality/permissions';
import { ROL_HOSPITALITY_POR_NOMBRE } from '@/lib/hospitality/roles';
import { logAuditAction } from '@/lib/permissions';

/**
 * Accesos de huésped (§20 y §27 del plan maestro).
 *
 * El rol Huésped solo sirve si el usuario está vinculado a su contacto del CRM:
 * el vínculo (`User.contactId`) es lo que convierte «este usuario» en «este
 * huésped», y es lo que filtra la API de reservas. Sin el vínculo, el acceso no
 * ve nada — que es el lado seguro del error, pero también un callejón sin
 * salida si nadie puede ponerlo.
 *
 * Esta ruta es ese sitio: listar quién tiene el rol, vincular, desvincular.
 * Dar de alta la cuenta en sí la sigue haciendo `POST /api/users` con su
 * invitación, sus límites de plan y su auditoría: aquí no se duplica el alta de
 * usuarios.
 */

const ACCIONES = ['vincular', 'desvincular'] as const;
type Accion = (typeof ACCIONES)[number];

/** El rol Huésped del catálogo, tal y como lo crea «aplicar catálogo». */
async function rolHuespedDe(tenantId: string) {
  return prisma.role.findFirst({
    where: { tenantId, nombre: ROL_HOSPITALITY_POR_NOMBRE['Huésped'].nombre },
    select: { id: true, nombre: true },
  });
}

/**
 * GET /api/hospitality/accesos-huesped — quién puede entrar como huésped.
 *
 * Devuelve también si el rol Huésped existe: cuando no existe, la pantalla tiene
 * que decir «aplica el catálogo primero» en vez de ofrecer un botón que no puede
 * funcionar.
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req, ['hospitality:read']);
    if (!auth.valid) return NextResponse.json({ error: auth.error }, { status: 401 });
    const sinPermiso = exigirPermisoHospitality(auth, 'roles.gestionar');
    if (sinPermiso) return sinPermiso;

    const tenantId = auth.tenant!.id;
    const rol = await rolHuespedDe(tenantId);

    if (!rol) {
      return NextResponse.json({ rol: null, accesos: [] });
    }

    const usuarios = await prisma.user.findMany({
      where: { tenantId, roleId: rol.id },
      select: {
        id: true,
        name: true,
        email: true,
        estado: true,
        contactId: true,
        contacto: { select: { id: true, nombre: true, email: true } },
      },
      orderBy: [{ name: 'asc' }],
    });

    return NextResponse.json({
      rol,
      accesos: usuarios.map((u) => ({
        id: u.id,
        nombre: u.name,
        email: u.email,
        estado: u.estado,
        // Sin vínculo, el acceso no ve ninguna reserva: la pantalla tiene que
        // poder decirlo sin que nadie lo deduzca de un campo vacío.
        vinculado: !!u.contactId,
        contacto: u.contacto
          ? { id: u.contacto.id, nombre: u.contacto.nombre, email: u.contacto.email }
          : null,
      })),
    });
  } catch (error) {
    console.error('[Hospitality] Error al leer los accesos de huésped:', error);
    return NextResponse.json({ error: 'No se pudieron leer los accesos de huésped' }, { status: 500 });
  }
}

/**
 * POST /api/hospitality/accesos-huesped — vincular o desvincular.
 *
 * Body: { accion: 'vincular' | 'desvincular', userId, contactId? }
 *
 * Se exige que el usuario tenga el rol Huésped: `contactId` significa «este
 * usuario ES este huésped», y vincularlo a alguien que ve la cuenta entera no
 * cambiaría nada y haría creer que sí.
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req, ['hospitality:write']);
    if (!auth.valid) return NextResponse.json({ error: auth.error }, { status: 401 });
    const sinPermiso = exigirPermisoHospitality(auth, 'roles.gestionar');
    if (sinPermiso) return sinPermiso;

    const tenantId = auth.tenant!.id;
    const usuarioId = auth.user?.id ?? auth.apiKey?.id ?? 'sistema';
    const cuerpo = await req.json().catch(() => null);
    const accion = cuerpo?.accion as Accion | undefined;
    const accesoId = typeof cuerpo?.userId === 'string' ? cuerpo.userId : '';

    if (!accion || !ACCIONES.includes(accion)) {
      return NextResponse.json(
        { error: `Acción no reconocida. Válidas: ${ACCIONES.join(', ')}` },
        { status: 400 }
      );
    }
    if (!accesoId) {
      return NextResponse.json({ error: 'Falta el usuario del acceso' }, { status: 400 });
    }

    const rol = await rolHuespedDe(tenantId);
    if (!rol) {
      return NextResponse.json(
        { error: 'Todavía no existe el rol Huésped en esta cuenta: aplica el catálogo de roles primero' },
        { status: 409 }
      );
    }

    const usuario = await prisma.user.findFirst({
      where: { id: accesoId, tenantId },
      select: { id: true, name: true, email: true, roleId: true },
    });
    if (!usuario) {
      return NextResponse.json({ error: 'El usuario no existe en esta cuenta' }, { status: 404 });
    }
    if (usuario.roleId !== rol.id) {
      return NextResponse.json(
        {
          error:
            'Ese usuario no tiene el rol Huésped: el vínculo con un contacto solo tiene sentido para un acceso de huésped',
        },
        { status: 400 }
      );
    }

    if (accion === 'desvincular') {
      const actualizado = await prisma.user.update({
        where: { id: usuario.id },
        data: { contactId: null },
      });

      await logAuditAction(
        usuarioId,
        tenantId,
        'editar',
        'hospitality_acceso_huesped',
        usuario.id,
        `Desvinculado el acceso de huésped de ${usuario.email}`
      ).catch(() => {});

      return NextResponse.json({
        ok: true,
        acceso: { id: actualizado.id, vinculado: false, contacto: null },
      });
    }

    const contactId = typeof cuerpo?.contactId === 'string' ? cuerpo.contactId : '';
    if (!contactId) {
      return NextResponse.json({ error: 'Falta el contacto que se quiere vincular' }, { status: 400 });
    }

    // El contacto tiene que ser de esta cuenta: vincular el acceso de un huésped
    // al contacto de otro tenant sería abrir reservas ajenas con la puerta buena.
    const contacto = await prisma.contact.findFirst({
      where: { id: contactId, tenantId },
      select: { id: true, nombre: true, email: true },
    });
    if (!contacto) {
      return NextResponse.json({ error: 'El contacto no existe en esta cuenta' }, { status: 404 });
    }

    const actualizado = await prisma.user.update({
      where: { id: usuario.id },
      data: { contactId: contacto.id },
    });

    await logAuditAction(
      usuarioId,
      tenantId,
      'editar',
      'hospitality_acceso_huesped',
      usuario.id,
      `Vinculado el acceso de huésped de ${usuario.email} con el contacto ${contacto.nombre ?? contacto.id}`
    ).catch(() => {});

    return NextResponse.json({
      ok: true,
      acceso: {
        id: actualizado.id,
        vinculado: true,
        contacto: { id: contacto.id, nombre: contacto.nombre, email: contacto.email },
      },
    });
  } catch (error) {
    console.error('[Hospitality] Error al cambiar el vínculo del acceso de huésped:', error);
    return NextResponse.json({ error: 'No se pudo cambiar el vínculo del acceso' }, { status: 500 });
  }
}
