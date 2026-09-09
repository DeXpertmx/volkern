export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { authenticateRequest } from '@/lib/api-key-auth';
import { startOfDay, toIsoDate } from '@/lib/hospitality/calendar';

// GET /api/hospitality/operations — Operations Board (plan maestro §19)
// Llegadas hoy · Salidas hoy · Limpieza · Mantenimiento · Unidades
export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.valid) return NextResponse.json({ error: auth.error }, { status: 401 });

    const tenantId = auth.tenant!.id;
    const today = startOfDay(new Date());
    const todayIso = toIsoDate(today);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    const where = { tenantId };

    const [reservations, units, cleaning, maintenance] = await Promise.all([
      prisma.hospitalityReservation.findMany({
        where: {
          ...where,
          estado: { not: 'cancelled' },
          OR: [
            { checkIn: { gte: today, lt: tomorrow } },
            { checkOut: { gte: today, lt: tomorrow } },
          ],
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

    const arriv = reservations.filter((r) => toIsoDate(r.checkIn) === todayIso);
    const depart = reservations.filter((r) => toIsoDate(r.checkOut) === todayIso);

    // Estado operativo por unidad (plan §17): occupied si hay reserva activa
    const unitStatus = units.map((u) => {
      const hasActive = reservations.some(
        (r) =>
          r.unitId === u.id &&
          r.checkIn.getTime() < tomorrow.getTime() &&
          r.checkOut.getTime() > today.getTime()
      );
      return {
        ...u,
        estadoOperativo: hasActive ? 'occupied' : u.estado,
      };
    });

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