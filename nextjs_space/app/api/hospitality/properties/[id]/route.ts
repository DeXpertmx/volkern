export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { authenticateRequest } from '@/lib/api-key-auth';
import { logAuditAction } from '@/lib/permissions';
import { esPoliticaNoShow } from '@/lib/hospitality/no-show';
import {
  esPoliticaSalidaAnticipada,
  politicaSalidaAnticipadaEfectiva,
  notificarCambioSalidaAnticipada,
} from '@/lib/hospitality/checkout';
import { esHoldHorasValidas } from '@/lib/hospitality/holds';

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

    const { id } = await ctx.params;
    const existing = await getProperty(auth.tenant!.id, id);
    if (!existing) return NextResponse.json({ error: 'Propiedad no encontrada' }, { status: 404 });

    const data = await req.json();
    const {
      nombre, descripcion, codigo, zona, direccion, ciudad, estadoProvincia,
      pais, cp, latitud, longitud, fotos, timezone, estado, politicaNoShow,
      politicaSalidaAnticipada, holdHoras,
    } = data || {};

    // La política de no-show decide cuánto se cobra: si llega, tiene que ser
    // válida (el módulo puro es el único que define las opciones).
    if (politicaNoShow !== undefined && !esPoliticaNoShow(politicaNoShow)) {
      return NextResponse.json(
        { error: 'Política de no-show inválida. Valores: ninguna, primera_noche, estancia_completa.' },
        { status: 400 }
      );
    }

    // Apagador de salida anticipada (A/B): si llega, tiene que ser válida (el
    // módulo puro checkout es el único que define las opciones).
    if (politicaSalidaAnticipada !== undefined && !esPoliticaSalidaAnticipada(politicaSalidaAnticipada)) {
      return NextResponse.json(
        { error: 'Política de salida anticipada inválida. Valores: cerrar_estancia, salida_real.' },
        { status: 400 }
      );
    }

    // Ventana de caducidad de holds: entero entre 0 (sin caducidad) y 720 h.
    if (holdHoras !== undefined && !esHoldHorasValidas(holdHoras)) {
      return NextResponse.json(
        { error: 'Horas de retención de holds inválidas. Entero entre 0 (sin caducidad) y 720.' },
        { status: 400 }
      );
    }

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
        ...(politicaNoShow !== undefined ? { politicaNoShow } : {}),
        ...(politicaSalidaAnticipada !== undefined ? { politicaSalidaAnticipada } : {}),
        ...(holdHoras !== undefined ? { holdHoras: Number(holdHoras) } : {}),
      },
    });

    // El apagador cambia el criterio de liberación de noches A PARTIR DEL
    // PRÓXIMO check-out: los operadores del tenant se enteran del cambio y
    // desde cuándo aplica (nunca rompe la respuesta: es un aviso).
    if (
      politicaSalidaAnticipada !== undefined &&
      politicaSalidaAnticipada !== existing.politicaSalidaAnticipada
    ) {
      await notificarCambioSalidaAnticipada({
        tenantId: auth.tenant!.id,
        propertyId: property.id,
        property: property.nombre,
        antes: politicaSalidaAnticipadaEfectiva(existing.politicaSalidaAnticipada),
        despues: politicaSalidaAnticipada,
      }).catch((e: unknown) =>
        console.error('[Hospitality] Error al notificar el cambio de política:', e)
      );
    }

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