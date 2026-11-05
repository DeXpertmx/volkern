export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { authenticateRequest } from '@/lib/api-key-auth';
import { exigirPermisoHospitality, capacidadDeTarea } from '@/lib/hospitality/permissions';
import { completeCleaningTask } from '@/lib/hospitality/operations';

// POST /api/hospitality/tasks — crear tarea de limpieza o mantenimiento
// Body: { tipo: 'cleaning'|'maintenance', unitId, prioridad?, responsable?, notas?, incidencia? (solo maintenance) }
export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req, ['hospitality:write']);
    if (!auth.valid) return NextResponse.json({ error: auth.error }, { status: 401 });

    const body = await req.json();
    const { tipo, unitId, prioridad, responsable, notas, incidencia, reservationId, fecha } = body || {};

    if (tipo !== 'cleaning' && tipo !== 'maintenance') {
      return NextResponse.json({ error: 'tipo debe ser cleaning o maintenance' }, { status: 400 });
    }

    // Una limpieza y una incidencia no son el mismo trabajo ni el mismo
    // permiso: el rol decide cuál de los dos puede abrir.
    const sinPermiso = exigirPermisoHospitality(auth, capacidadDeTarea(tipo));
    if (sinPermiso) return sinPermiso;

    if (!unitId) {
      return NextResponse.json({ error: 'unitId es requerido' }, { status: 400 });
    }
    if (tipo === 'maintenance' && !incidencia) {
      return NextResponse.json({ error: 'incidencia es requerida para mantenimiento' }, { status: 400 });
    }

    // Verificar que la unidad pertenezca al tenant
    const unit = await prisma.hospitalityUnit.findFirst({
      where: { id: unitId, tenantId: auth.tenant!.id },
    });
    if (!unit) return NextResponse.json({ error: 'Unidad no encontrada' }, { status: 404 });

    if (tipo === 'cleaning') {
      const task = await prisma.hospitalityCleaningTask.create({
        data: {
          tenantId: auth.tenant!.id,
          unitId,
          reservationId: reservationId || undefined,
          fecha: fecha ? new Date(fecha) : undefined,
          prioridad: prioridad || 'normal',
          responsable: responsable || undefined,
          notas: notas || undefined,
        },
      });
      return NextResponse.json({ task }, { status: 201 });
    }

    const task = await prisma.hospitalityMaintenanceTask.create({
      data: {
        tenantId: auth.tenant!.id,
        unitId,
        incidencia,
        descripcion: notas || undefined,
        prioridad: prioridad || 'media',
        responsable: responsable || undefined,
        fecha: fecha ? new Date(fecha) : undefined,
      },
    });
    return NextResponse.json({ task }, { status: 201 });
  } catch (error) {
    console.error('Error creando tarea:', error);
    return NextResponse.json({ error: 'Error al crear tarea' }, { status: 500 });
  }
}

// PATCH /api/hospitality/tasks?tipo=cleaning|maintenance&id=...
// Body: { estado?, responsable?, notas?, prioridad? }
export async function PATCH(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req, ['hospitality:write']);
    if (!auth.valid) return NextResponse.json({ error: auth.error }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const tipo = searchParams.get('tipo');
    const id = searchParams.get('id');
    if (tipo !== 'cleaning' && tipo !== 'maintenance') {
      return NextResponse.json({ error: 'tipo debe ser cleaning o maintenance' }, { status: 400 });
    }
    if (!id) return NextResponse.json({ error: 'id es requerido' }, { status: 400 });

    const sinPermiso = exigirPermisoHospitality(auth, capacidadDeTarea(tipo));
    if (sinPermiso) return sinPermiso;

    const body = await req.json();
    const data: any = {};
    if (body.estado !== undefined) data.estado = body.estado;
    if (body.responsable !== undefined) data.responsable = body.responsable;
    if (body.prioridad !== undefined) data.prioridad = body.prioridad;
    if (body.notas !== undefined) data.notas = body.notas;

    // Verificar que la tarea pertenezca al tenant
    const existing = tipo === 'cleaning'
      ? await prisma.hospitalityCleaningTask.findFirst({ where: { id, tenantId: auth.tenant!.id } })
      : await prisma.hospitalityMaintenanceTask.findFirst({ where: { id, tenantId: auth.tenant!.id } });
    if (!existing) return NextResponse.json({ error: 'Tarea no encontrada' }, { status: 404 });

    // Cierre del ciclo §18.3 → §17: al completar una limpieza, la unidad
    // vuelve a available (o occupied si hay reserva activa) y se empuja la
    // disponibilidad al exterior. Idempotente si ya estaba completada.
    if (tipo === 'cleaning' && body.estado === 'completed') {
      const result = await completeCleaningTask(auth.tenant!.id, id, data);
      if (!result.ok) {
        const status = result.error?.includes('no encontrada') ? 404 : 400;
        return NextResponse.json({ error: result.error }, { status });
      }
      return NextResponse.json({ task: result.task, unitEstado: result.unitEstado });
    }

    const task = tipo === 'cleaning'
      ? await prisma.hospitalityCleaningTask.update({ where: { id }, data })
      : await prisma.hospitalityMaintenanceTask.update({ where: { id }, data });

    return NextResponse.json({ task });
  } catch (error) {
    console.error('Error actualizando tarea:', error);
    return NextResponse.json({ error: 'Error al actualizar tarea' }, { status: 500 });
  }
}

// DELETE /api/hospitality/tasks?tipo=cleaning|maintenance&id=...
export async function DELETE(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req, ['hospitality:write']);
    if (!auth.valid) return NextResponse.json({ error: auth.error }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const tipo = searchParams.get('tipo');
    const id = searchParams.get('id');
    if (tipo !== 'cleaning' && tipo !== 'maintenance') {
      return NextResponse.json({ error: 'tipo debe ser cleaning o maintenance' }, { status: 400 });
    }
    if (!id) return NextResponse.json({ error: 'id es requerido' }, { status: 400 });

    const sinPermiso = exigirPermisoHospitality(auth, capacidadDeTarea(tipo));
    if (sinPermiso) return sinPermiso;

    const existing = tipo === 'cleaning'
      ? await prisma.hospitalityCleaningTask.findFirst({ where: { id, tenantId: auth.tenant!.id } })
      : await prisma.hospitalityMaintenanceTask.findFirst({ where: { id, tenantId: auth.tenant!.id } });
    if (!existing) return NextResponse.json({ error: 'Tarea no encontrada' }, { status: 404 });

    if (tipo === 'cleaning') {
      await prisma.hospitalityCleaningTask.delete({ where: { id } });
    } else {
      await prisma.hospitalityMaintenanceTask.delete({ where: { id } });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Error eliminando tarea:', error);
    return NextResponse.json({ error: 'Error al eliminar tarea' }, { status: 500 });
  }
}