export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { authenticateRequest } from '@/lib/api-key-auth';
import { exigirPermisoHospitality } from '@/lib/hospitality/permissions';
import { startOfDay, nightsBetween } from '@/lib/hospitality/calendar';
import {
  perPropertyOccupancy,
  perChannelRevenueTrend,
  type AnalyticsReservationInput,
} from '@/lib/hospitality/analytics';
import { monedaEfectiva } from '@/lib/moneda';

/**
 * GET /api/hospitality/dashboard — KPIs operativos del módulo (plan §23).
 *
 * Lectura pura (sin escrituras): ocupación, llegadas/salidas de hoy, reservas
 * activas, cancelaciones, ingresos, ADR, mix de canales, próximos 7 días y
 * operaciones (limpieza/mantenimiento).
 *
 * Parámetros: dias (período de ingresos, default 30).
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.valid) return NextResponse.json({ error: auth.error }, { status: 401 });
    const sinPermiso = exigirPermisoHospitality(auth, 'reservas.ver');
    if (sinPermiso) return sinPermiso;

    const { searchParams } = new URL(req.url);
    const dias = Math.min(Math.max(parseInt(searchParams.get('dias') || '30') || 30, 1), 90);

    const hoy = startOfDay(new Date());
    const finPeriodo = new Date(hoy);
    finPeriodo.setDate(finPeriodo.getDate() + dias);
    const inicioPeriodo = new Date(hoy);
    inicioPeriodo.setDate(inicioPeriodo.getDate() - dias);

    const tenantId = auth.tenant!.id;

    // ── Unidades, propiedades y reservas del período ──
    const [units, properties, reservations] = await Promise.all([
      prisma.hospitalityUnit.findMany({
        where: { tenantId },
        select: { id: true, estado: true, propertyId: true },
      }),
      prisma.hospitalityProperty.findMany({
        where: { tenantId },
        select: { id: true, nombre: true },
        orderBy: { nombre: 'asc' },
      }),
      prisma.hospitalityReservation.findMany({
        where: {
          tenantId,
          checkIn: { lt: finPeriodo },
          checkOut: { gt: inicioPeriodo },
        },
        select: {
          id: true,
          propertyId: true,
          unitId: true,
          channel: true,
          estado: true,
          checkIn: true,
          checkOut: true,
          amountAfterTax: true,
          currency: true,
        },
      }),
    ]);

    const totalUnidades = units.length;
    const unidadesPorEstado: Record<string, number> = {};
    for (const u of units) unidadesPorEstado[u.estado] = (unidadesPorEstado[u.estado] || 0) + 1;

    // ── Ocupación de hoy (reservas activas que cubren hoy) ──
    const activas = reservations.filter((r) => r.estado !== 'cancelled' && r.estado !== 'no_show');
    const ocupadasHoy = new Set<string>();
    const llegadasHoy: any[] = [];
    const salidasHoy: any[] = [];
    for (const r of activas) {
      if (r.checkIn.getTime() <= hoy.getTime() && r.checkOut.getTime() > hoy.getTime() && r.unitId) {
        ocupadasHoy.add(r.unitId);
      }
      if (r.checkIn.getTime() >= hoy.getTime() && r.checkIn.getTime() < hoy.getTime() + 86_400_000) {
        llegadasHoy.push(r);
      }
      if (r.checkOut.getTime() >= hoy.getTime() && r.checkOut.getTime() < hoy.getTime() + 86_400_000) {
        salidasHoy.push(r);
      }
    }
    const ocupacionHoy = totalUnidades > 0 ? ocupadasHoy.size / totalUnidades : 0;

    // ── Reservas activas y cancelaciones del período ──
    const reservasActivas = reservations.filter((r) => ['pending', 'confirmed', 'checked_in'].includes(r.estado)).length;
    const cancelaciones = reservations.filter((r) => r.estado === 'cancelled').length;

    // ── Ingresos, noches y ADR (período; solo reservas no canceladas con importe) ──
    const conIngreso = activas.filter((r) => r.amountAfterTax != null);
    const ingresos = conIngreso.reduce((a, r) => a + (r.amountAfterTax || 0), 0);
    const nochesVendidas = activas.reduce((a, r) => a + nightsBetween(r.checkIn, r.checkOut), 0);
    const adr = nochesVendidas > 0 ? ingresos / nochesVendidas : null;

    // ── Mix de canales ──
    const canalMap = new Map<string, { canal: string; reservas: number; ingresos: number }>();
    for (const r of activas) {
      const canal = r.channel || 'Otro';
      const e = canalMap.get(canal) || { canal, reservas: 0, ingresos: 0 };
      e.reservas += 1;
      e.ingresos += r.amountAfterTax || 0;
      canalMap.set(canal, e);
    }
    const mixCanales = Array.from(canalMap.values()).sort((a, b) => b.reservas - a.reservas);

    // ── Próximos 7 días: ocupación por día ──
    const proximos7 = [];
    for (let i = 0; i < 7; i++) {
      const dia = new Date(hoy);
      dia.setDate(dia.getDate() + i);
      const diaStart = dia.getTime();
      const diaEnd = diaStart + 86_400_000;
      const ocupadas = new Set<string>();
      for (const r of activas) {
        if (r.unitId && r.checkIn.getTime() <= diaStart && r.checkOut.getTime() >= diaEnd) {
          ocupadas.add(r.unitId);
        }
      }
      proximos7.push({
        fecha: dia.toISOString().slice(0, 10),
        dia: dia.getDate(),
        mes: dia.toLocaleDateString('es-MX', { month: 'short' }),
        ocupadas: ocupadas.size,
        total: totalUnidades,
        ocupacion: totalUnidades > 0 ? ocupadas.size / totalUnidades : 0,
      });
    }

    // ── Operaciones: limpieza y mantenimiento ──
    const [cleaningTasks, maintenanceTasks] = await Promise.all([
      prisma.hospitalityCleaningTask.groupBy({
        by: ['estado'],
        where: { tenantId },
        _count: { _all: true },
      }),
      prisma.hospitalityMaintenanceTask.groupBy({
        by: ['estado'],
        where: { tenantId },
        _count: { _all: true },
      }),
    ]);
    const limpiezaPorEstado: Record<string, number> = {};
    for (const t of cleaningTasks) limpiezaPorEstado[t.estado] = t._count._all;
    const mantenimientoPorEstado: Record<string, number> = {};
    for (const t of maintenanceTasks) mantenimientoPorEstado[t.estado] = t._count._all;

    // ── Drill-downs (plan §23): ocupación por propiedad e ingresos por canal ──
    // La ventana de la consulta (checkIn < fin, checkOut > inicio) cubre todo
    // lo que puede aportar noches a los últimos `dias` días.
    const reservasAnalytics: AnalyticsReservationInput[] = reservations.map((r) => ({
      id: r.id,
      propertyId: r.propertyId,
      unitId: r.unitId,
      channel: r.channel,
      estado: r.estado,
      checkIn: r.checkIn,
      checkOut: r.checkOut,
      amountAfterTax: r.amountAfterTax,
      currency: r.currency,
    }));
    const ocupacionPropiedades = perPropertyOccupancy({
      properties: properties.map((p) => ({ id: p.id, nombre: p.nombre })),
      units: units.map((u) => ({ id: u.id, propertyId: u.propertyId })),
      reservations: reservasAnalytics,
      dias,
    });
    const ingresosPorCanal = perChannelRevenueTrend({
      reservations: reservasAnalytics,
      dias,
    });

    return NextResponse.json({
      // La moneda la dictan las reservas reales y, si no las hay, la del tenant.
      // El valor por defecto del esquema no entra: la página la usa para escribir
      // los importes y 'MXN' no es una decisión del negocio.
      moneda: monedaEfectiva(reservations.map((r) => r.currency), auth.tenant!.moneda),
      kpis: {
        totalUnidades,
        unidadesPorEstado,
        ocupacionHoy,
        ocupadasHoy: ocupadasHoy.size,
        llegadasHoy: llegadasHoy.length,
        salidasHoy: salidasHoy.length,
        reservasActivas,
        cancelaciones,
        ingresos,
        nochesVendidas,
        adr,
      },
      mixCanales,
      proximos7,
      ocupacionPropiedades,
      ingresosPorCanal,
      operaciones: {
        limpieza: limpiezaPorEstado,
        mantenimiento: mantenimientoPorEstado,
      },
    });
  } catch (error) {
    console.error('Error obteniendo dashboard:', error);
    return NextResponse.json({ error: 'Error al obtener dashboard' }, { status: 500 });
  }
}