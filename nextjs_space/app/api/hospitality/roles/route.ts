export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { authenticateRequest } from '@/lib/api-key-auth';
import { exigirPermisoHospitality } from '@/lib/hospitality/permissions';
import { ROLES_HOSPITALITY, permisosDeRol, definicionDeRol } from '@/lib/hospitality/roles';
import {
  capacidadesFaltantes,
  conLoQueFalta,
  type Permisos,
} from '@/lib/hospitality/roles-apply';
import { logAuditAction } from '@/lib/permissions';

/**
 * GET /api/hospitality/roles — el catálogo de roles de Hospitality y en qué
 * estado está en esta cuenta.
 *
 * Devuelve, por cada rol del vocabulario, si ya existe, cuántos usuarios lo
 * tienen y qué capacidades le faltan respecto a su definición. La interfaz no
 * tiene que deducir nada: lo que falta viene calculado aquí, con la misma
 * definición que aplica el botón.
 *
 * **No lo ve cualquiera.** Administrar los roles de una propiedad es el trabajo
 * del Anfitrión; quien no lo sea recibe el 403 con la capacidad que le falta, y
 * la pantalla lo explica en lugar de mostrar un error.
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.valid) return NextResponse.json({ error: auth.error }, { status: 401 });
    const sinPermiso = exigirPermisoHospitality(auth, 'roles.gestionar');
    if (sinPermiso) return sinPermiso;

    const tenantId = auth.tenant!.id;

    const roles = await prisma.role.findMany({
      where: { tenantId },
      select: {
        id: true,
        nombre: true,
        descripcion: true,
        permisos: true,
        _count: { select: { users: true } },
      },
    });
    const porNombre = new Map(roles.map((rol) => [rol.nombre, rol]));

    const catalogo = ROLES_HOSPITALITY.map((definicion) => {
      const existente = porNombre.get(definicion.nombre);
      const faltantes = capacidadesFaltantes(
        existente ? (existente.permisos as Permisos) : undefined,
        permisosDeRol(definicion.id)
      );

      return {
        id: definicion.id,
        nombre: definicion.nombre,
        descripcion: definicion.descripcion,
        protegido: definicion.protegido,
        capacidades: definicion.capacidades,
        existe: !!existente,
        rolId: existente?.id ?? null,
        usuarios: existente?._count.users ?? 0,
        // Al día = no le falta nada del diseño. Puede tener permisos de más: la
        // matriz de roles es del Anfitrión y este catálogo no se la recorta.
        alDia: !!existente && faltantes.length === 0,
        faltantes,
      };
    });

    return NextResponse.json({ catalogo });
  } catch (error) {
    console.error('[Hospitality] Error al leer el catálogo de roles:', error);
    return NextResponse.json({ error: 'No se pudo leer el catálogo de roles' }, { status: 500 });
  }
}

/**
 * POST /api/hospitality/roles — aplicar el catálogo.
 *
 * Dos acciones, las dos explícitas:
 *
 *  - `aplicar` (por defecto): crea los roles que faltan con su definición y, a
 *    los que ya existen, les **añade** lo que les falte. Nunca retira permisos,
 *    así que repetirlo no puede dejar a nadie sin acceso.
 *  - `restablecer` con `rolId`: deja ese rol exactamente como lo define el
 *    catálogo. Es el único camino que recorta, y por eso hay que pedirlo.
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.valid) return NextResponse.json({ error: auth.error }, { status: 401 });
    const sinPermiso = exigirPermisoHospitality(auth, 'roles.gestionar');
    if (sinPermiso) return sinPermiso;

    const tenantId = auth.tenant!.id;
    const usuarioId = auth.user?.id ?? auth.apiKey?.id ?? 'sistema';
    const cuerpo = await req.json().catch(() => ({}));
    const accion = cuerpo?.accion === 'restablecer' ? 'restablecer' : 'aplicar';

    if (accion === 'restablecer') {
      const rolId = typeof cuerpo?.rolId === 'string' ? cuerpo.rolId : null;
      if (!rolId) return NextResponse.json({ error: 'Falta el rol que se quiere restablecer' }, { status: 400 });

      const rol = await prisma.role.findFirst({ where: { id: rolId, tenantId } });
      if (!rol) return NextResponse.json({ error: 'El rol no existe en esta cuenta' }, { status: 404 });

      const definicion = definicionDeRol(rol.nombre);
      if (!definicion) {
        return NextResponse.json(
          { error: `«${rol.nombre}» no es un rol del catálogo de Hospitality` },
          { status: 400 }
        );
      }

      const actualizado = await prisma.role.update({
        where: { id: rol.id },
        data: { permisos: permisosDeRol(definicion.id), descripcion: definicion.descripcion },
      });

      await logAuditAction(
        usuarioId,
        tenantId,
        'editar',
        'role',
        rol.id,
        `Restablecido el rol de Hospitality «${rol.nombre}» a su definición del catálogo`
      ).catch(() => {});

      return NextResponse.json({ ok: true, accion, rol: { id: actualizado.id, nombre: actualizado.nombre } });
    }

    const creados: string[] = [];
    const completados: { nombre: string; faltantes: string[] }[] = [];
    let orden = await prisma.role.count({ where: { tenantId } });

    for (const definicion of ROLES_HOSPITALITY) {
      const esperado = permisosDeRol(definicion.id);
      const existente = await prisma.role.findFirst({
        where: { tenantId, nombre: definicion.nombre },
        select: { id: true, permisos: true },
      });

      if (!existente) {
        orden += 1;
        await prisma.role.create({
          data: {
            tenantId,
            nombre: definicion.nombre,
            descripcion: definicion.descripcion,
            permisos: esperado,
            orden,
          },
        });
        creados.push(definicion.nombre);
        continue;
      }

      const faltantes = capacidadesFaltantes(existente.permisos as Permisos, esperado);
      if (!faltantes.length) continue;

      await prisma.role.update({
        where: { id: existente.id },
        data: {
          permisos: conLoQueFalta(existente.permisos as Permisos, esperado) as Prisma.InputJsonValue,
        },
      });
      completados.push({ nombre: definicion.nombre, faltantes });
    }

    if (creados.length || completados.length) {
      await logAuditAction(
        usuarioId,
        tenantId,
        'crear',
        'role',
        tenantId,
        `Aplicado el catálogo de roles de Hospitality: ${creados.length} creado(s)${
          creados.length ? ` (${creados.join(', ')})` : ''
        }, ${completados.length} completado(s)`
      ).catch(() => {});
    }

    return NextResponse.json({ ok: true, accion, creados, completados });
  } catch (error) {
    console.error('[Hospitality] Error al aplicar el catálogo de roles:', error);
    return NextResponse.json({ error: 'No se pudo aplicar el catálogo de roles' }, { status: 500 });
  }
}
