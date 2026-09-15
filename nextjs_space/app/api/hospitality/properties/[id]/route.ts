export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { authenticateRequest } from '@/lib/api-key-auth';
import { exigirPermisoHospitality } from '@/lib/hospitality/permissions';
import { logAuditAction } from '@/lib/permissions';

interface Params {
  params: Promise<{ id: string }> | { id: string };
}

async function getProperty(tenantId: string, id: string) {
  return prisma.hospitalityProperty.findFirst({
    where: { id, tenantId },
    include: { units: { orderBy: { nombre: 'asc' } }, _count: { select: { reservations: true } } },
  });
}

// GET /api/hospitality/properties/[id] — detalle (con unidades)
export async function GET(_req: NextRequest, ctx: Params) {
  try {
    const auth = await authenticateRequest(_req);
    if (!auth.valid) return NextResponse.json({ error: auth.error }, { status: 401 });
    const sinPermiso = exigirPermisoHospitality(auth, 'reservas.ver');
    if (sinPermiso) return sinPermiso;

    const { id } = await ctx.params;
    const property = await getProperty(auth.tenant!.id, id);
    if (!property) return NextResponse.json({ error: 'Propiedad no encontrada' }, { status: 404 });

    return NextResponse.json({ property });
  } catch (error) {
    console.error('Error obteniendo propiedad:', error);
    return NextResponse.json({ error: 'Error al obtener propiedad' }, { status: 500 });
  }
}

// PATCH /api/hospitality/properties/[id] — actualizar
export async function PATCH(req: NextRequest, ctx: Params) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.valid) return NextResponse.json({ error: auth.error }, { status: 401 });
    const sinPermiso = exigirPermisoHospitality(auth, 'reservas.editar');
    if (sinPermiso) return sinPermiso;

    const { id } = await ctx.params;
    const existing = await getProperty(auth.tenant!.id, id);
    if (!existing) return NextResponse.json({ error: 'Propiedad no encontrada' }, { status: 404 });

    const data = await req.json();
    const {
      nombre, descripcion, codigo, zona, direccion, ciudad, estadoProvincia,
      pais, cp, latitud, longitud, fotos, timezone, estado, sesHospedajes,
    } = data || {};

    const property = await prisma.hospitalityProperty.update({
      where: { id: existing.id },
      data: {
        ...(nombre !== undefined ? { nombre: String(nombre).trim() } : {}),
        ...(descripcion !== undefined ? { descripcion } : {}),
        ...(codigo !== undefined ? { codigo } : {}),
        ...(zona !== undefined ? { zona } : {}),
        ...(direccion !== undefined ? { direccion } : {}),
        ...(ciudad !== undefined ? { ciudad } : {}),
        ...(estadoProvincia !== undefined ? { estadoProvincia } : {}),
        ...(pais !== undefined ? { pais } : {}),
        ...(cp !== undefined ? { cp } : {}),
        ...(latitud !== undefined ? { latitud: latitud === null || latitud === '' ? null : Number(latitud) } : {}),
        ...(longitud !== undefined ? { longitud: longitud === null || longitud === '' ? null : Number(longitud) } : {}),
        ...(fotos !== undefined ? { fotos: Array.isArray(fotos) ? (fotos as Prisma.InputJsonValue[]) : Prisma.DbNull } : {}),
        ...(timezone !== undefined ? { timezone } : {}),
        ...(estado !== undefined ? { estado } : {}),
        // Registro de viajeros: el código oficial del establecimiento ante
        // SES.HOSPEDAJES (referencia externa; el Ministerio lo asigna al alta).
        ...(sesHospedajes !== undefined
          ? {
              sesHospedajes:
                sesHospedajes && typeof sesHospedajes === 'object'
                  ? {
                      codigo: String((sesHospedajes as Record<string, unknown>).codigo ?? '').trim() || null,
                      codigoMunicipio:
                        String((sesHospedajes as Record<string, unknown>).codigoMunicipio ?? '').trim() || null,
                    }
                  : Prisma.DbNull,
            }
          : {}),
      },
    });

    await logAuditAction(
      auth.user!.id,
      auth.tenant!.id,
      'actualizar',
      'hospitality_property',
      property.id,
      `Propiedad "${property.nombre}" actualizada`
    ).catch(() => {});

    return NextResponse.json({ property });
  } catch (error) {
    console.error('Error actualizando propiedad:', error);
    return NextResponse.json({ error: 'Error al actualizar propiedad' }, { status: 500 });
  }
}

// DELETE /api/hospitality/properties/[id] — eliminar
export async function DELETE(req: NextRequest, ctx: Params) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.valid) return NextResponse.json({ error: auth.error }, { status: 401 });
    const sinPermiso = exigirPermisoHospitality(auth, 'reservas.editar');
    if (sinPermiso) return sinPermiso;

    const { id } = await ctx.params;
    const existing = await getProperty(auth.tenant!.id, id);
    if (!existing) return NextResponse.json({ error: 'Propiedad no encontrada' }, { status: 404 });

    await prisma.hospitalityProperty.delete({ where: { id: existing.id } });

    await logAuditAction(
      auth.user!.id,
      auth.tenant!.id,
      'eliminar',
      'hospitality_property',
      existing.id,
      `Propiedad "${existing.nombre}" eliminada`
    ).catch(() => {});

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error eliminando propiedad:', error);
    return NextResponse.json({ error: 'Error al eliminar propiedad' }, { status: 500 });
  }
}