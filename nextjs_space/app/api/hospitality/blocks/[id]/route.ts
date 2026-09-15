export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { authenticateRequest } from '@/lib/api-key-auth';
import { exigirPermisoHospitality } from '@/lib/hospitality/permissions';
import { logAuditAction } from '@/lib/permissions';
import { dispatchConnectivityPush } from '@/lib/hospitality/sync';
import { normalizarTipoBloqueo } from '@/lib/hospitality/block-types';

interface Params {
  params: Promise<{ id: string }> | { id: string };
}

function parseDateOnly(value: unknown): Date | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function serializeDate(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

async function getBlock(tenantId: string, id: string) {
  return prisma.hospitalityUnitBlock.findFirst({
    where: { id, tenantId },
    include: {
      unit: { select: { id: true, nombre: true, codigo: true, propertyId: true } },
    },
  });
}

async function pushProperty(tenantId: string, propertyId: string) {
  try {
    await dispatchConnectivityPush(tenantId, propertyId, 'unidad_cambiada', { skipRates: true });
  } catch (error) {
    console.error('[Hospitality] Error en push tras actualizar bloqueo:', error);
  }
}

// PATCH /api/hospitality/blocks/[id]
export async function PATCH(req: NextRequest, ctx: Params) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.valid) return NextResponse.json({ error: auth.error }, { status: 401 });
    const sinPermiso = exigirPermisoHospitality(auth, 'reservas.editar');
    if (sinPermiso) return sinPermiso;

    const { id } = await ctx.params;
    const existing = await getBlock(auth.tenant!.id, id);
    if (!existing) return NextResponse.json({ error: 'Bloqueo no encontrado' }, { status: 404 });

    const body = await req.json().catch(() => ({}));
    const fechaInicio = body.fechaInicio === undefined
      ? existing.fechaInicio
      : parseDateOnly(body.fechaInicio);
    const fechaFin = body.fechaFin === undefined
      ? existing.fechaFin
      : parseDateOnly(body.fechaFin);
    const motivo = body.motivo === undefined
      ? existing.motivo
      : typeof body.motivo === 'string' ? body.motivo.trim().slice(0, 500) || null : null;
    const estado = body.estado === undefined ? existing.estado : body.estado;
    const tipo = body.tipo === undefined
      ? existing.tipo
      : normalizarTipoBloqueo(body.tipo);

    if (!fechaInicio || !fechaFin) {
      return NextResponse.json({ error: 'Las fechas deben tener formato YYYY-MM-DD' }, { status: 400 });
    }
    if (fechaFin.getTime() <= fechaInicio.getTime()) {
      return NextResponse.json({ error: 'La fecha fin debe ser posterior a la fecha inicio' }, { status: 400 });
    }
    if (estado !== 'activo' && estado !== 'cancelado') {
      return NextResponse.json({ error: 'estado debe ser activo o cancelado' }, { status: 400 });
    }

    if (estado === 'activo') {
      const overlap = await prisma.hospitalityUnitBlock.findFirst({
        where: {
          tenantId: auth.tenant!.id,
          unitId: existing.unitId,
          estado: 'activo',
          id: { not: id },
          fechaInicio: { lt: fechaFin },
          fechaFin: { gt: fechaInicio },
        },
        select: { id: true },
      });
      if (overlap) {
        return NextResponse.json({ error: 'El intervalo se solapa con otro bloqueo activo de esta unidad' }, { status: 409 });
      }
    }

    const block = await prisma.hospitalityUnitBlock.update({
      where: { id },
      data: { fechaInicio, fechaFin, tipo, motivo, estado },
      include: { unit: { select: { id: true, nombre: true, codigo: true, propertyId: true } } },
    });

    await logAuditAction(
      auth.user!.id,
      auth.tenant!.id,
      'actualizar',
      'hospitality_unit_block',
      id,
      `Bloqueo actualizado para "${existing.unit.nombre}"`
    ).catch(() => {});

    await pushProperty(auth.tenant!.id, existing.unit.propertyId);

    return NextResponse.json({
      block: { ...block, fechaInicio: serializeDate(block.fechaInicio), fechaFin: serializeDate(block.fechaFin) },
    });
  } catch (error) {
    console.error('Error actualizando bloqueo:', error);
    return NextResponse.json({ error: 'Error al actualizar bloqueo' }, { status: 500 });
  }
}

// DELETE /api/hospitality/blocks/[id]
export async function DELETE(req: NextRequest, ctx: Params) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.valid) return NextResponse.json({ error: auth.error }, { status: 401 });
    const sinPermiso = exigirPermisoHospitality(auth, 'reservas.editar');
    if (sinPermiso) return sinPermiso;

    const { id } = await ctx.params;
    const existing = await getBlock(auth.tenant!.id, id);
    if (!existing) return NextResponse.json({ error: 'Bloqueo no encontrado' }, { status: 404 });

    await prisma.hospitalityUnitBlock.delete({ where: { id } });
    await logAuditAction(
      auth.user!.id,
      auth.tenant!.id,
      'eliminar',
      'hospitality_unit_block',
      id,
      `Bloqueo eliminado para "${existing.unit.nombre}"`
    ).catch(() => {});
    await pushProperty(auth.tenant!.id, existing.unit.propertyId);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Error eliminando bloqueo:', error);
    return NextResponse.json({ error: 'Error al eliminar bloqueo' }, { status: 500 });
  }
}
