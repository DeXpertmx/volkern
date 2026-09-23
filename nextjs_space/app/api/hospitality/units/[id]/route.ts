export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { authenticateRequest } from '@/lib/api-key-auth';
import { exigirPermisoHospitality } from '@/lib/hospitality/permissions';
import { logAuditAction } from '@/lib/permissions';

interface Params {
  params: Promise<{ id: string }> | { id: string };
}

async function getUnit(tenantId: string, id: string) {
  return prisma.hospitalityUnit.findFirst({
    where: { id, tenantId },
    include: {
      property: { select: { id: true, nombre: true } },
      _count: { select: { reservations: true } },
    },
  });
}

// GET /api/hospitality/units/[id]
export async function GET(_req: NextRequest, ctx: Params) {
  try {
    const auth = await authenticateRequest(_req);
    if (!auth.valid) return NextResponse.json({ error: auth.error }, { status: 401 });

    const sinPermiso = exigirPermisoHospitality(auth, 'reservas.ver');
    if (sinPermiso) return sinPermiso;

    const { id } = await ctx.params;
    const unit = await getUnit(auth.tenant!.id, id);
    if (!unit) return NextResponse.json({ error: 'Unidad no encontrada' }, { status: 404 });

    return NextResponse.json({ unit });
  } catch (error) {
    console.error('Error obteniendo unidad:', error);
    return NextResponse.json({ error: 'Error al obtener unidad' }, { status: 500 });
  }
}

// PATCH /api/hospitality/units/[id]
export async function PATCH(req: NextRequest, ctx: Params) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.valid) return NextResponse.json({ error: auth.error }, { status: 401 });
    // La capacidad la decide el rol (§27): sin ella, 403 con el permiso exacto.
    const sinPermiso = exigirPermisoHospitality(auth, 'reservas.editar');
    if (sinPermiso) return sinPermiso;

    const { id } = await ctx.params;
    const existing = await getUnit(auth.tenant!.id, id);
    if (!existing) return NextResponse.json({ error: 'Unidad no encontrada' }, { status: 404 });

    const data = await req.json();
    const { propertyId, nombre, codigo, tipo, capacidad, estado, tarifaBase, moneda } = data || {};

    // Si se cambia de propiedad, verificar aislamiento
    if (propertyId !== undefined && propertyId !== existing.propertyId) {
      const property = await prisma.hospitalityProperty.findFirst({
        where: { id: propertyId, tenantId: auth.tenant!.id },
      });
      if (!property) {
        return NextResponse.json({ error: 'Propiedad no encontrada' }, { status: 404 });
      }
    }

    // Código único por tenant
    if (codigo) {
      const dup = await prisma.hospitalityUnit.findFirst({
        where: { tenantId: auth.tenant!.id, codigo, NOT: { id: existing.id } },
      });
      if (dup) {
        return NextResponse.json({ error: 'Ya existe una unidad con ese código' }, { status: 400 });
      }
    }

    const unit = await prisma.hospitalityUnit.update({
      where: { id: existing.id },
      data: {
        ...(propertyId !== undefined ? { propertyId } : {}),
        ...(nombre !== undefined ? { nombre: String(nombre).trim() } : {}),
        ...(codigo !== undefined ? { codigo: codigo ? String(codigo).trim() : null } : {}),
        ...(tipo !== undefined ? { tipo } : {}),
        ...(capacidad !== undefined ? { capacidad: parseInt(capacidad) } : {}),
        ...(tarifaBase !== undefined ? { tarifaBase: parseFloat(tarifaBase) || null } : {}),
        ...(moneda !== undefined ? { moneda: String(moneda).toUpperCase().trim() } : {}),
        ...(estado !== undefined ? { estado } : {}),
      },
      include: { property: { select: { id: true, nombre: true } } },
    });

    await logAuditAction(
      auth.user!.id,
      auth.tenant!.id,
      'actualizar',
      'hospitality_unit',
      unit.id,
      `Unidad "${unit.nombre}" actualizada`
    ).catch(() => {});

    // ── Push de disponibilidad al exterior (plan §15.2) ──
    // Un cambio de estado (a cleaning, maintenance, etc.) afecta la
    // disponibilidad: recalcular y empujar. Nunca bloquea ni rompe el flujo.
    if (estado !== undefined && estado !== existing.estado) {
      try {
        const { dispatchConnectivityPush } = await import('@/lib/hospitality/sync');
        await dispatchConnectivityPush(
          auth.tenant!.id,
          unit.propertyId,
          'unidad_cambiada',
          { skipRates: true }
        );
      } catch (e) {
        console.error('[Hospitality] Error en push de conectividad por cambio de unidad:', e);
      }
    }

    return NextResponse.json({ unit });
  } catch (error) {
    console.error('Error actualizando unidad:', error);
    return NextResponse.json({ error: 'Error al actualizar unidad' }, { status: 500 });
  }
}

// DELETE /api/hospitality/units/[id]
export async function DELETE(req: NextRequest, ctx: Params) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.valid) return NextResponse.json({ error: auth.error }, { status: 401 });
    // La capacidad la decide el rol (§27): sin ella, 403 con el permiso exacto.
    const sinPermiso = exigirPermisoHospitality(auth, 'reservas.editar');
    if (sinPermiso) return sinPermiso;

    const { id } = await ctx.params;
    const existing = await getUnit(auth.tenant!.id, id);
    if (!existing) return NextResponse.json({ error: 'Unidad no encontrada' }, { status: 404 });

    await prisma.hospitalityUnit.delete({ where: { id: existing.id } });

    await logAuditAction(
      auth.user!.id,
      auth.tenant!.id,
      'eliminar',
      'hospitality_unit',
      existing.id,
      `Unidad "${existing.nombre}" eliminada`
    ).catch(() => {});

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error eliminando unidad:', error);
    return NextResponse.json({ error: 'Error al eliminar unidad' }, { status: 500 });
  }
}