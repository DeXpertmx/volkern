export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { authenticateRequest } from '@/lib/api-key-auth';
import { exigirPermisoHospitality } from '@/lib/hospitality/permissions';
import { startOfDay } from '@/lib/hospitality/calendar';
import { unitOccupiedOnDay, type ActiveReservationSpan } from '@/lib/hospitality/availability';
import { llegadasDelDia, salidasDelDia } from '@/lib/hospitality/analytics';

// GET /api/hospitality/operations — Operations Board (plan maestro §19)
// Llegadas hoy · Salidas hoy · Limpieza · Mantenimiento · Unidades
export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req, ['hospitality:read']);
    if (!auth.valid) return NextResponse.json({ error: auth.error }, { status: 401 });
    // La capacidad la decide el rol (§27): sin ella, 403 con el permiso exacto.
    const sinPermiso = exigirPermisoHospitality(auth, 'operaciones.ver');
    if (sinPermiso) return sinPermiso;

    const tenantId = auth.tenant!.id;
    const today = startOfDay(new Date());
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    const where = { tenantId };

    const [reservations, units, cleaning, maintenance] = await Promise.all([
      // Reservas que OCUPAN hoy (o llegan o salen hoy): es el conjunto que
      // necesita el estado operativo por unidad. Con solo llegadas y salidas,
      // un huésped a mitad de estancia no aparecía y su unidad se pintaba libre.
      prisma.hospitalityReservation.findMany({
        where: {
          ...where,
          estado: { not: 'cancelled' },
          checkIn: { lt: tomorrow },
          checkOut: { gt: today },
        },
        include: {
          unit: { select: { id: true, nombre: true, codigo: true } },
          property: { select: { id: true, nombre: true } },
        },
      }),
      prisma.hospitalityUnit.findMany({
        where,
        include: {
          property: { select: { id: true, nombre: true } },
          _count: { select: { reservations: true } },
        },
      }),
      prisma.hospitalityCleaningTask.findMany({
        where: { ...where, estado: { in: ['pending', 'in_progress', 'blocked'] } },
        include: {
          unit: { select: { id: true, nombre: true, codigo: true } },
          reservation: { select: { id: true, externalBookingId: true, guestData: true } },
        },
        orderBy: [{ fecha: 'asc' }],
      }),
      prisma.hospitalityMaintenanceTask.findMany({
        where: { ...where, estado: { in: ['abierta', 'en_proceso'] } },
        include: {
          unit: { select: { id: true, nombre: true, codigo: true } },
        },
        orderBy: [{ prioridad: 'desc' }, { fecha: 'asc' }],
      }),
    ]);

    // Llegadas y salidas del día: comparación por días, del módulo puro (no
    // por instantes, que corría un día la frontera).
    const arriv = llegadasDelDia(reservations, today);
    const depart = salidasDelDia(reservations, today);

    // Estado operativo por unidad (plan §17): la ocupación la decide el MOTOR
    // de disponibilidad (§8), la misma regla que la disponibilidad del booking
    // y del planning.
    const spans: ActiveReservationSpan[] = reservations.map((r) => ({
      unitId: r.unitId as string,
      checkIn: r.checkIn,
      checkOut: r.checkOut,
      estado: r.estado,
    }));
    const unitStatus = units.map((u) => ({
      ...u,
      estadoOperativo: unitOccupiedOnDay(u.id, today, spans) ? 'occupied' : u.estado,
    }));

    return NextResponse.json({
      llegadasHoy: arriv.map((r) => ({
        id: r.id,
        guestName: (r.guestData as any)?.nombre || 'Huésped',
        channel: r.channel,
        estado: r.estado,
        checkIn: r.checkIn,
        unit: r.unit ? { id: r.unit.id, nombre: r.unit.nombre, codigo: r.unit.codigo } : null,
        property: r.property?.nombre || null,
        externalBookingId: r.externalBookingId,
      })),
      salidasHoy: depart.map((r) => ({
        id: r.id,
        guestName: (r.guestData as any)?.nombre || 'Huésped',
        channel: r.channel,
        estado: r.estado,
        checkOut: r.checkOut,
        unit: r.unit ? { id: r.unit.id, nombre: r.unit.nombre, codigo: r.unit.codigo } : null,
        property: r.property?.nombre || null,
        externalBookingId: r.externalBookingId,
      })),
      unidades: unitStatus,
      limpieza: cleaning,
      mantenimiento: maintenance,
    });
  } catch (error) {
    console.error('Error obteniendo operaciones:', error);
    return NextResponse.json({ error: 'Error al obtener operaciones' }, { status: 500 });
  }
}