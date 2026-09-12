export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { authenticateRequest } from '@/lib/api-key-auth';
import { monedaEscritura } from '@/lib/hospitality/moneda';
import { logAuditAction } from '@/lib/permissions';
import { dispatchConnectivityPush } from '@/lib/hospitality/sync';
import { unitOccupiedOnDay, type ActiveReservationSpan } from '@/lib/hospitality/availability';

const ESTADOS_VALIDOS = ['pending', 'confirmed', 'cancelled', 'checked_in', 'checked_out', 'no_show'];
const CANALES_COMUNES = ['Airbnb', 'Booking.com', 'Expedia', 'Directa', 'Volkern'];

// GET /api/hospitality/reservations — listar reservas del tenant
// Filtros: propertyId, unitId, estado (uno o varios separados por coma),
// canal, q (búsqueda por huésped/referencia), from, to, limit.
export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.valid) return NextResponse.json({ error: auth.error }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const propertyId = searchParams.get('propertyId');
    const unitId = searchParams.get('unitId');
    const estadoParam = searchParams.get('estado');
    const canal = searchParams.get('canal');
    const q = searchParams.get('q');
    const from = searchParams.get('from'); // ISO fecha inclusiva (check-out >=)
    const to = searchParams.get('to'); // ISO fecha exclusiva (check-in <)
    const limit = Math.min(parseInt(searchParams.get('limit') || '500') || 500, 1000);

    const where: any = { tenantId: auth.tenant!.id };
    if (propertyId) where.propertyId = propertyId;
    if (unitId) where.unitId = unitId;

    if (estadoParam) {
      const estados = estadoParam.split(',').map((e) => e.trim()).filter(Boolean);
      if (estados.length === 1) where.estado = estados[0];
      else if (estados.length > 1) where.estado = { in: estados };
    }
    if (canal) where.channel = { contains: canal, mode: 'insensitive' };
    if (q) {
      where.OR = [
        { externalBookingId: { contains: q, mode: 'insensitive' } },
        { cmBookingId: { contains: q, mode: 'insensitive' } },
        { guestData: { path: ['firstName'], string_contains: q } },
        { guestData: { path: ['lastName'], string_contains: q } },
        { guestData: { path: ['email'], string_contains: q } },
        { contact: { nombre: { contains: q, mode: 'insensitive' } } },
        { contact: { email: { contains: q, mode: 'insensitive' } } },
      ];
    }
    if (from) {
      where.checkOut = { gte: new Date(from) };
    }
    if (to) {
      where.checkIn = { lt: new Date(to) };
    }

    const reservations = await prisma.hospitalityReservation.findMany({
      where,
      include: {
        unit: { select: { id: true, nombre: true, codigo: true } },
        property: { select: { id: true, nombre: true } },
        contact: { select: { id: true, nombre: true, email: true, telefono: true } },
      },
      orderBy: [{ checkIn: 'asc' }],
      take: limit,
    });

    return NextResponse.json({ reservations, moneda: auth.tenant!.moneda ?? null });
  } catch (error) {
    console.error('Error obteniendo reservas:', error);
    return NextResponse.json({ error: 'Error al obtener reservas' }, { status: 500 });
  }
}

/**
 * Prevención de overbooking (§16): la unidad no debe tener otra reserva
 * activa que se solape con [checkIn, checkOut) (el día de salida no cuenta).
 * Devuelve la reserva en conflicto o null.
 */
async function findConflict(
  tenantId: string,
  unitId: string,
  checkIn: Date,
  checkOut: Date,
  excludeReservationId?: string
) {
  const candidates = await prisma.hospitalityReservation.findMany({
    where: {
      tenantId,
      unitId,
      estado: { notIn: ['cancelled', 'no_show'] },
      checkIn: { lt: checkOut },
      checkOut: { gt: checkIn },
    },
    select: { id: true, externalBookingId: true, checkIn: true, checkOut: true, estado: true },
  });
  const spans: ActiveReservationSpan[] = candidates.map((r) => ({
    unitId,
    checkIn: r.checkIn,
    checkOut: r.checkOut,
    estado: r.estado,
  }));
  // Día a día (misma regla que el Availability Engine: checkout no ocupa).
  const cursor = new Date(checkIn);
  cursor.setHours(0, 0, 0, 0);
  const last = new Date(checkOut);
  last.setHours(0, 0, 0, 0);
  while (cursor.getTime() < last.getTime()) {
    if (unitOccupiedOnDay(unitId, cursor, spans)) {
      return candidates.find(
        (r) => r.checkIn.getTime() < new Date(cursor.getTime() + 86_400_000).getTime() && r.checkOut.getTime() > cursor.getTime()
      );
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return null;
}

// POST /api/hospitality/reservations — crear reserva manual
// Body: { propertyId, unitId?, contactoId?, huespedNombre?, huespedEmail?, huespedTelefono?,
//         canal, checkin (YYYY-MM-DD), checkout (YYYY-MM-DD), estado?, importe?, moneda?, notas? }
export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.valid) return NextResponse.json({ error: auth.error }, { status: 401 });

    const body = await req.json();
    const {
      propertyId, unitId, contactoId, huespedNombre, huespedEmail, huespedTelefono,
      canal, checkin, checkout, estado, importe, moneda, notas,
    } = body || {};

    if (!propertyId) return NextResponse.json({ error: 'La propiedad es requerida' }, { status: 400 });
    if (!canal || !String(canal).trim()) return NextResponse.json({ error: 'El canal es requerido' }, { status: 400 });
    if (!checkin || !checkout) return NextResponse.json({ error: 'Las fechas de entrada y salida son requeridas' }, { status: 400 });

    const ci = new Date(`${checkin}T15:00:00`);
    const co = new Date(`${checkout}T11:00:00`);
    if (isNaN(ci.getTime()) || isNaN(co.getTime())) {
      return NextResponse.json({ error: 'Fechas inválidas' }, { status: 400 });
    }
    if (co.getTime() <= ci.getTime()) {
      return NextResponse.json({ error: 'La salida debe ser posterior a la entrada' }, { status: 400 });
    }

    // Propiedad del tenant.
    const property = await prisma.hospitalityProperty.findFirst({
      where: { id: propertyId, tenantId: auth.tenant!.id },
      select: { id: true },
    });
    if (!property) return NextResponse.json({ error: 'Propiedad no encontrada' }, { status: 404 });

    // Unidad del tenant y de esa propiedad.
    let unitIdFinal: string | null = null;
    if (unitId) {
      const unit = await prisma.hospitalityUnit.findFirst({
        where: { id: unitId, tenantId: auth.tenant!.id, propertyId },
        select: { id: true },
      });
      if (!unit) return NextResponse.json({ error: 'Unidad no encontrada para esa propiedad' }, { status: 404 });
      unitIdFinal = unit.id;
    }

    // Contacto: por id, o crear/resolver por email/teléfono/nombre (CRM).
    let contactId: string | null = null;
    if (contactoId) {
      const contact = await prisma.contact.findFirst({
        where: { id: contactoId, tenantId: auth.tenant!.id },
        select: { id: true },
      });
      if (!contact) return NextResponse.json({ error: 'Contacto no encontrado' }, { status: 404 });
      contactId = contact.id;
    } else if (huespedEmail || huespedTelefono || huespedNombre) {
      let contact = null;
      if (huespedEmail) {
        contact = await prisma.contact.findFirst({ where: { tenantId: auth.tenant!.id, email: huespedEmail } });
      }
      if (!contact && huespedTelefono) {
        contact = await prisma.contact.findFirst({ where: { tenantId: auth.tenant!.id, telefono: huespedTelefono } });
      }
      if (contact) {
        contactId = contact.id;
      } else if (huespedNombre) {
        const created = await prisma.contact.create({
          data: {
            tenantId: auth.tenant!.id,
            nombre: huespedNombre.trim(),
            email: huespedEmail || '',
            telefono: huespedTelefono || null,
            tipo: 'person',
            tags: 'huesped',
          },
        });
        contactId = created.id;
      }
    }

    // Overbooking §16: rechazar si la unidad ya está ocupada en el rango.
    if (unitIdFinal) {
      const conflict = await findConflict(auth.tenant!.id, unitIdFinal, ci, co);
      if (conflict) {
        return NextResponse.json(
          {
            error: `Conflicto de disponibilidad: la unidad ya tiene una reserva activa del ${conflict.checkIn.toISOString().slice(0, 10)} al ${conflict.checkOut.toISOString().slice(0, 10)} (${conflict.externalBookingId || conflict.estado}).`,
          },
          { status: 409 }
        );
      }
    }

    const reservation = await prisma.hospitalityReservation.create({
      data: {
        tenantId: auth.tenant!.id,
        propertyId,
        unitId: unitIdFinal,
        contactId,
        channel: String(canal).trim(),
        externalBookingId: body.referencia || `MAN-${Date.now().toString(36).toUpperCase()}`,
        action: 'book',
        estado: ESTADOS_VALIDOS.includes(estado) ? estado : 'confirmed',
        checkIn: ci,
        checkOut: co,
        bookedOn: new Date(),
        segment: 'Directa',
        specialRequests: notas || null,
        pah: false,
        amountAfterTax: importe != null && importe !== '' ? Number(importe) : null,
        // La divisa de la reserva la decide quien la crea; si no la indica, la del
        // tenant. El valor por defecto del esquema dejaba reservas en pesos dentro
        // de una cuenta europea.
        currency: monedaEscritura(moneda, auth.tenant!.moneda),
        guestData: !contactId && (huespedNombre || huespedEmail || huespedTelefono)
          ? { firstName: huespedNombre || null, email: huespedEmail || null, phone: huespedTelefono || null }
          : undefined,
      },
      include: {
        unit: { select: { id: true, nombre: true } },
        property: { select: { id: true, nombre: true } },
        contact: { select: { id: true, nombre: true } },
      },
    });

    await logAuditAction(
      auth.user!.id,
      auth.tenant!.id,
      'crear',
      'hospitality_reservation',
      reservation.id,
      `Reserva manual ${reservation.externalBookingId} creada (${reservation.channel})`
    ).catch(() => {});

    // Push de disponibilidad (la unidad queda ocupada en el rango).
    try {
      await dispatchConnectivityPush(auth.tenant!.id, propertyId, 'reserva_creada', { skipRates: true });
    } catch (e) {
      console.error('[Hospitality] Error en push tras reserva manual:', e);
    }

    return NextResponse.json({ reservation }, { status: 201 });
  } catch (error) {
    console.error('Error creando reserva:', error);
    return NextResponse.json({ error: 'Error al crear reserva' }, { status: 500 });
  }
}
