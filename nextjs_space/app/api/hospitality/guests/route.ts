export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { authenticateRequest } from '@/lib/api-key-auth';
import { nightsBetween } from '@/lib/hospitality/calendar';

/**
 * GET /api/hospitality/guests — huéspedes del tenant con su historial de
 * estancias (plan maestro §20: CRM de huéspedes reutilizando el CRM existente).
 *
 * Los huéspedes se agrupan por identidad:
 *   1. contactId cuando la reserva está vinculada a un Contact del CRM;
 *   2. email / teléfono / nombre de guestData cuando no hay contacto.
 * Nunca se crea ni escribe nada: es una lectura pura.
 *
 * Parámetros: q (búsqueda por nombre/email/teléfono), limit, order.
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.valid) return NextResponse.json({ error: auth.error }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const q = (searchParams.get('q') || '').trim().toLowerCase();
    const limit = Math.min(parseInt(searchParams.get('limit') || '200') || 200, 500);
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

    // ── Agrupación por identidad de huésped ──
    const guestMap = new Map<string, any>();

    for (const r of reservations) {
      const gd: any = r.guestData || {};
      const gdNombre = [gd.firstName, gd.lastName].filter(Boolean).join(' ').trim() || gd.name || '';
      const gdEmail = (gd.email || '').trim().toLowerCase();
      const gdPhone = (gd.phone || '').trim();

      const nombre = r.contact?.nombre || gdNombre || null;
      const email = r.contact?.email?.toLowerCase() || gdEmail || null;
      const telefono = r.contact?.telefono || gdPhone || null;

      // Clave de identidad: contacto CRM > email > teléfono > nombre.
      let key: string;
      if (r.contactId) key = `contact:${r.contactId}`;
      else if (email) key = `email:${email}`;
      else if (telefono) key = `phone:${telefono}`;
      else if (nombre) key = `name:${nombre.toLowerCase()}`;
      else key = `anon:${r.id}`; // huésped sin datos: estancia huérfana, una entrada por reserva

      if (q) {
        const haystack = [nombre, email, telefono].filter(Boolean).join(' ').toLowerCase();
        if (!haystack.includes(q)) continue;
      }

      let guest = guestMap.get(key);
      if (!guest) {
        guest = {
          id: key,
          nombre: nombre || 'Huésped sin datos',
          email: email || '',
          telefono: telefono || '',
          contactId: r.contactId || null,
          totalEstancias: 0,
          totalNoches: 0,
          totalGasto: 0,
          ultimaEstancia: null,
          reservas: [],
        };
        guestMap.set(key, guest);
      }

      const noches = nightsBetween(r.checkIn, r.checkOut);
      guest.totalEstancias += 1;
      guest.totalNoches += noches;
      guest.totalGasto += r.amountAfterTax || 0;
      if (!guest.ultimaEstancia || r.checkIn > guest.ultimaEstancia) {
        guest.ultimaEstancia = r.checkIn;
      }
      guest.reservas.push({
        id: r.id,
        externalBookingId: r.externalBookingId,
        channel: r.channel,
        estado: r.estado,
        checkIn: r.checkIn,
        checkOut: r.checkOut,
        noches,
        amountAfterTax: r.amountAfterTax,
        currency: r.currency,
        specialRequests: r.specialRequests,
        propertyNombre: r.property?.nombre || null,
        unitNombre: r.unit?.nombre || null,
      });
    }

    let guests = Array.from(guestMap.values());
    if (order === 'nombre') {
      guests.sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
    } else {
      guests.sort((a, b) => (b.ultimaEstancia ? new Date(b.ultimaEstancia).getTime() : 0) - (a.ultimaEstancia ? new Date(a.ultimaEstancia).getTime() : 0));
    }
    guests = guests.slice(0, limit);

    return NextResponse.json({ guests, total: guests.length });
  } catch (error) {
    console.error('Error obteniendo huéspedes:', error);
    return NextResponse.json({ error: 'Error al obtener huéspedes' }, { status: 500 });
  }
}