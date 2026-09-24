export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { authenticateRequest } from '@/lib/api-key-auth';

import { exigirPermisoHospitality } from '@/lib/hospitality/permissions';
import { monedaEscritura } from '@/lib/moneda';
import { normalizarEstacionalidad } from '@/lib/hospitality/estacionalidad';
/**
 * PATCH /api/hospitality/rateplans/[id] — editar tarifa/restricciones.
 * DELETE /api/hospitality/rateplans/[id] — eliminar plan.
 * Ambas disparan el push de tarifas hacia la capa de conectividad.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.valid) return NextResponse.json({ error: auth.error }, { status: 401 });
    // La capacidad la decide el rol (§27): sin ella, 403 con el permiso exacto.
    const sinPermiso = exigirPermisoHospitality(auth, 'reservas.editar');
    if (sinPermiso) return sinPermiso;

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
    // El campo vacío significa «la del tenant», no una divisa en blanco: la
    // columna no admite nulos y guardar cadena vacía dejaría la tarifa sin divisa.
    if (body.moneda !== undefined) {
      data.moneda = monedaEscritura(body.moneda, (auth.tenant as { moneda?: string | null }).moneda);
    }
    if (body.minNoches !== undefined) data.minNoches = Math.max(1, parseInt(body.minNoches) || 1);
    if (body.maxNoches !== undefined) data.maxNoches = body.maxNoches != null ? parseInt(body.maxNoches) : null;
    if (body.checkInDias !== undefined) {
      data.checkInDias = Array.isArray(body.checkInDias) && body.checkInDias.length ? body.checkInDias : null;
    }
    if (body.checkOutDias !== undefined) {
      data.checkOutDias = Array.isArray(body.checkOutDias) && body.checkOutDias.length ? body.checkOutDias : null;
    }
    // Estacionalidad: los dos capas viajan juntas (el UI las edita en el mismo
    // formulario), se normalizan una vez y se guardan canónicas. Enviar un
    // array vacío de temporadas limpia la capa (vuelve a la tarifa plana).
    if (body.temporadas !== undefined || body.finDeSemana !== undefined) {
      const estacionalidad = normalizarEstacionalidad({
        temporadas: body.temporadas ?? [],
        finDeSemana: body.finDeSemana ?? null,
      });
      const pideTemporadas = Array.isArray(body.temporadas) && body.temporadas.length > 0;
      const pideFinDe = body.finDeSemana != null && typeof body.finDeSemana === 'object' && Array.isArray(body.finDeSemana.dias) && body.finDeSemana.dias.length > 0;
      if (pideTemporadas && !estacionalidad?.temporadas) {
        return NextResponse.json(
          { error: 'Hay temporadas con datos inválidos (fechas YYYY-MM-DD, hasta ≥ desde, tarifa > 0)' },
          { status: 400 }
        );
      }
      if (pideFinDe && !estacionalidad?.finDeSemana) {
        return NextResponse.json(
          { error: 'El recargo de fin de semana es inválido (días 0-6, porcentaje > 0)' },
          { status: 400 }
        );
      }
      data.temporadas = estacionalidad?.temporadas ?? null;
      data.finDeSemana = estacionalidad?.finDeSemana ?? null;
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
    // La capacidad la decide el rol (§27): sin ella, 403 con el permiso exacto.
    const sinPermiso = exigirPermisoHospitality(auth, 'reservas.editar');
    if (sinPermiso) return sinPermiso;

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