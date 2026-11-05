export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { authenticateRequest } from '@/lib/api-key-auth';
import { exigirPermisoHospitality } from '@/lib/hospitality/permissions';
import { agruparHuespedes, type HuespedReservaInput } from '@/lib/hospitality/guests';
import { monedaEfectiva } from '@/lib/moneda';

/**
 * GET /api/hospitality/guests — huéspedes del tenant con su historial de
 * estancias (plan maestro §20: CRM de huéspedes reutilizando el CRM existente).
 *
 * La agrupación por identidad y los totales (estancias, noches, gasto) viven en
 * el módulo puro `lib/hospitality/guests.ts`: esta ruta solo carga las reservas
 * y delega. Antes la aritmética estaba aquí dentro y sumaba las canceladas.
 *
 * Nunca se crea ni escribe nada: es una lectura pura.
 *
 * Parámetros: q (búsqueda por nombre/email/teléfono), limit, order.
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req, ['hospitality:read']);
    if (!auth.valid) return NextResponse.json({ error: auth.error }, { status: 401 });
    // La capacidad la decide el rol (§27): sin ella, 403 con el permiso exacto.
    const sinPermiso = exigirPermisoHospitality(auth, 'reservas.ver');
    if (sinPermiso) return sinPermiso;

    const { searchParams } = new URL(req.url);
    const q = searchParams.get('q') || '';
    const limit = parseInt(searchParams.get('limit') || '200') || 200;
    const order = searchParams.get('order') === 'nombre' ? 'nombre' : 'ultima';

    // Todas las reservas del tenant con los datos de huésped (contacto + guestData).
    const reservations = await prisma.hospitalityReservation.findMany({
      where: { tenantId: auth.tenant!.id },
      include: {
        contact: { select: { id: true, nombre: true, email: true, telefono: true } },
        property: { select: { id: true, nombre: true } },
        unit: { select: { id: true, nombre: true, codigo: true } },
      },
      orderBy: [{ checkIn: 'desc' }],
    });

    const { guests, total } = agruparHuespedes(reservations as HuespedReservaInput[], {
      q,
      order,
      limit,
    });

    // La divisa con la que se escriben los gastos del listado: la de las
    // reservas (la predominante, si hay varias) y, si no hay ninguna, la moneda
    // de reporte del tenant. La pantalla no fija ninguna.
    return NextResponse.json({
      guests,
      total,
      moneda: monedaEfectiva(
        reservations.map((r) => r.currency),
        auth.tenant?.moneda
      ),
    });
  } catch (error) {
    console.error('Error obteniendo huéspedes:', error);
    return NextResponse.json({ error: 'Error al obtener huéspedes' }, { status: 500 });
  }
}
