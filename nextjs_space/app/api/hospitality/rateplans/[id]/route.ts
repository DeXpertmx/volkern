export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { authenticateRequest } from '@/lib/api-key-auth';
import { monedaEscritura } from '@/lib/moneda';

/**
 * PATCH /api/hospitality/rateplans/[id] — editar tarifa/restricciones.
 * DELETE /api/hospitality/rateplans/[id] — eliminar plan.
 * Ambas disparan el push de tarifas hacia la capa de conectividad.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.valid) return NextResponse.json({ error: auth.error }, { status: 401 });

    const { id } = await params;
    const tenantId = auth.tenant!.id;

    const existing = await prisma.hospitalityRatePlan.findFirst({
      where: { id, tenantId },
      select: { id: true, propertyId: true },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Plan tarifario no encontrado' }, { status: 404 });
    }

    const body = await req.json().catch(() => ({}));
    const data: any = { fechaEdicion: new Date() };

    if (body.nombre !== undefined) data.nombre = String(body.nombre).trim();
    if (body.codigo !== undefined) data.codigo = body.codigo ? String(body.codigo).trim() : null;
    if (body.tarifa !== undefined) {
      if (typeof body.tarifa !== 'number' || body.tarifa <= 0) {
        return NextResponse.json({ error: 'La tarifa debe ser un número mayor a 0' }, { status: 400 });
      }
      data.tarifa = body.tarifa;
    }
    // Si el cliente deja la moneda vacía, se hereda la del tenant. La red de
    // seguridad de la escritura vive en el módulo, no aquí.
    if (body.moneda !== undefined) {
      data.moneda = monedaEscritura(body.moneda, auth.tenant!.moneda);
    }
    if (body.minNoches !== undefined) data.minNoches = Math.max(1, parseInt(body.minNoches) || 1);
    if (body.maxNoches !== undefined) data.maxNoches = body.maxNoches != null ? parseInt(body.maxNoches) : null;
    if (body.checkInDias !== undefined) {
      data.checkInDias = Array.isArray(body.checkInDias) && body.checkInDias.length ? body.checkInDias : null;
    }
    if (body.checkOutDias !== undefined) {
      data.checkOutDias = Array.isArray(body.checkOutDias) && body.checkOutDias.length ? body.checkOutDias : null;
    }
    if (body.activo !== undefined) data.activo = body.activo === true;

    const plan = await prisma.hospitalityRatePlan.update({ where: { id }, data });

    // Push de tarifas (no bloquea el flujo; los fallos quedan en sync-logs).
    const { dispatchConnectivityPush } = await import('@/lib/hospitality/sync');
    dispatchConnectivityPush(tenantId, existing.propertyId, 'manual', { diasHorizonte: 180 })
      .catch((e: unknown) => console.error('[Hospitality] Push de tarifas falló:', e));

    return NextResponse.json({ ratePlan: plan });
  } catch (error) {
    console.error('Error actualizando plan tarifario:', error);
    return NextResponse.json({ error: 'Error al actualizar el plan tarifario' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.valid) return NextResponse.json({ error: auth.error }, { status: 401 });

    const { id } = await params;
    const tenantId = auth.tenant!.id;

    const existing = await prisma.hospitalityRatePlan.findFirst({
      where: { id, tenantId },
      select: { id: true, propertyId: true },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Plan tarifario no encontrado' }, { status: 404 });
    }

    await prisma.hospitalityRatePlan.delete({ where: { id } });

    // Tras eliminar, re-empujar tarifas (el plan ya no aplica).
    const { dispatchConnectivityPush } = await import('@/lib/hospitality/sync');
    dispatchConnectivityPush(tenantId, existing.propertyId, 'manual', { diasHorizonte: 180 })
      .catch((e: unknown) => console.error('[Hospitality] Push de tarifas falló:', e));

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Error eliminando plan tarifario:', error);
    return NextResponse.json({ error: 'Error al eliminar el plan tarifario' }, { status: 500 });
  }
}