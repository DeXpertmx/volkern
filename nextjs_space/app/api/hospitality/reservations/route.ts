export const dynamic = 'force-dynamic';

import { TIPO_LINEA_FIANZA } from '@/lib/hospitality/fianza';

import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { authenticateRequest } from '@/lib/api-key-auth';
import { exigirPermisoHospitality } from '@/lib/hospitality/permissions';
import { logAuditAction } from '@/lib/permissions';
import { dispatchConnectivityPush } from '@/lib/hospitality/sync';
import { unitOccupiedOnDay, type ActiveReservationSpan } from '@/lib/hospitality/availability';
import { toIsoDate, ventanaDeDiaLocal } from '@/lib/hospitality/calendar';
import { esEstadoValido, esMovimientoDelDia, estadosSinMovimiento } from '@/lib/hospitality/estados';
import { partesDeViajerosPorReserva } from '@/lib/hospitality/registro-viajeros-service';
import { monedaEscritura } from '@/lib/moneda';

const CANALES_COMUNES = ['Airbnb', 'Booking.com', 'Expedia', 'Directa', 'Volkern'];

// GET /api/hospitality/reservations — listar reservas del tenant
// Filtros: propertyId, unitId, estado (uno o varios separados por coma),
// canal, q (búsqueda por huésped/referencia), from, to, limit.
export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.valid) return NextResponse.json({ error: auth.error }, { status: 401 });
    // La capacidad la decide el rol (§27): sin ella, 403 con el permiso exacto.
    const sinPermiso = exigirPermisoHospitality(auth, 'reservas.ver');
    if (sinPermiso) return sinPermiso;

    const { searchParams } = new URL(req.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '500') || 500, 1000);
    const where = whereDeFiltrosReservas(searchParams, auth.tenant!.id);

    const reservations = await prisma.hospitalityReservation.findMany({
      where,
      include: {
        unit: { select: { id: true, nombre: true, codigo: true } },
        property: { select: { id: true, nombre: true } },
        contact: { select: { id: true, nombre: true, email: true, telefono: true } },
        // La fianza (depósito del huésped): la ficha necesita su estado para el
        // badge y las acciones. Solo la línea tipada — nunca todas las items.
        items: {
          where: { tipo: TIPO_LINEA_FIANZA },
          select: { concepto: true, importeTotal: true, moneda: true },
        },
      },
      orderBy: [{ checkIn: 'asc' }],
      take: limit,
    });

    // El parte de viajeros (RD 933/2021) de cada reserva, en lote: la pantalla
    // avisa de los huéspedes a los que les faltan datos y ofrece completarlos
    // desde ahí mismo. Se calcula con las reglas del check-in, así que el aviso
    // sale desde que entra la reserva y no cuando el barrido ya la miró.
    const partes = await partesDeViajerosPorReserva(auth.tenant!.id, reservations);

    // Textos de las preguntas personalizadas del check-in (id → pregunta): la
    // reserva guarda las respuestas por id, y la pantalla las enseña con su
    // pregunta. Asunto del hotel — no salen en el parte del Ministerio.
    // Auxiliar: si la consulta falla, la lista de reservas no se tumba.
    const preguntas = await prisma.hospitalityCheckinPregunta
      .findMany({
        where: { tenantId: auth.tenant!.id },
        select: { id: true, es: true },
      })
      .catch(() => [] as Array<{ id: string; es: string }>);

    // La carga de trabajo del día de recepción: cuántas llegadas y salidas
    // hay HOY en todo el tenant. Va INDEPENDIENTE de los filtros (la recepción
    // puede estar filtrando por propiedad o buscando a alguien, y aún así
    // quiere ver la carga completa del día); con el chip activo coincide con
    // lo que lista la pantalla, porque el where del chip es el mismo. Se
    // cuenta en lote (una consulta por campo, no N por fila) y es AUXILIAR:
    // si falla, la lista sale sin resumen — el listado no se tumba por esto.
    let resumenHoy: { llegadas: number; salidas: number } | null = null;
    try {
      const whereDia = (campo: 'checkIn' | 'checkOut') => {
        const w: any = { tenantId: auth.tenant!.id };
        aplicarMovimientoRecepcion(w, campo === 'checkIn' ? 'llegadas' : 'salidas');
        return prisma.hospitalityReservation.count({ where: w });
      };
      const [llegadas, salidas] = await Promise.all([whereDia('checkIn'), whereDia('checkOut')]);
      resumenHoy = { llegadas, salidas };
    } catch (err) {
      console.error('No se pudo calcular el resumen del día de reservas:', err);
    }

    return NextResponse.json({
      reservations: reservations.map((reserva) => ({
        ...reserva,
        parteViajeros: partes.get(reserva.id) ?? null,
      })),
      resumenHoy,
      preguntasCheckin: Object.fromEntries(preguntas.map((p) => [p.id, p.es])),
    });
  } catch (error) {
    console.error('Error obteniendo reservas:', error);
    return NextResponse.json({ error: 'Error al obtener reservas' }, { status: 500 });
  }
}

/**
 * El `where` de los filtros de la lista de reservas, compartido por la
 * consulta JSON y por la exportación CSV: la recepción exporta EXACTAMENTE
 * la lista que ve en pantalla (mismos filtros, sin segundo criterio).
 */
/**
 * Movimiento del día para recepción: los chips de «Llegadas hoy» y «Salidas
 * hoy». La ventana es el DÍA LOCAL del servidor —la misma regla con la que el
 * planning pinta los días y el CSV exporta las fechas (una sola definición de
 * «día» en el módulo)— y solo cuentan las reservas con movimiento posible
 * (`esMovimientoDelDia`): la cancelada no llega ni se va.
 */
export type MovimientoRecepcion = 'llegadas' | 'salidas';

export function aplicarMovimientoRecepcion(
  where: any,
  movimiento: MovimientoRecepcion,
  hoy: Date = new Date()
): void {
  const { inicio, fin } = ventanaDeDiaLocal(hoy);
  if (movimiento === 'llegadas') {
    where.checkIn = { gte: inicio, lt: fin };
  } else {
    where.checkOut = { gte: inicio, lt: fin };
  }
  // La cancelada carece de movimiento (la regla del módulo de estados): no
  // puede aparecer como llegada ni como salida. Si ya hay filtro de estado se
  // respeta: un objeto se combina con el notIn; un string de estado sin
  // movimiento (p. ej. «canceladas») con el chip activo no tiene resultado
  // posible y se responde vacío en vez de contradecir el chip.
  const sinMovimiento = estadosSinMovimiento();
  const estadoActual = where.estado;
  if (typeof estadoActual === 'string') {
    where.estado = esMovimientoDelDia(estadoActual) ? estadoActual : { in: [] };
  } else if (estadoActual && typeof estadoActual === 'object') {
    where.estado = { ...estadoActual, notIn: sinMovimiento };
  } else {
    where.estado = { notIn: sinMovimiento };
  }
}

export function whereDeFiltrosReservas(searchParams: URLSearchParams, tenantId: string) {
  const where: any = { tenantId };
  const propertyId = searchParams.get('propertyId');
  const unitId = searchParams.get('unitId');
  const estadoParam = searchParams.get('estado');
  const canal = searchParams.get('canal');
  const q = searchParams.get('q');
  const from = searchParams.get('from'); // ISO fecha inclusiva (check-out >=)
  const to = searchParams.get('to'); // ISO fecha exclusiva (check-in <)

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
  // Movimiento del día (chips de recepción): se aplica al final para que su
  // ventana de día local no sea pisada por los filtros de rango from/to.
  const movimiento = searchParams.get('movimiento');
  if (movimiento === 'llegadas' || movimiento === 'salidas') {
    aplicarMovimientoRecepcion(where, movimiento);
  }
  return where;
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
  // El id viaja con el span para poder devolver la reserva en conflicto sin
  // volver a comparar fechas a mano.
  const spans: Array<ActiveReservationSpan & { id: string }> = candidates.map((r) => ({
    id: r.id,
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
      // La reserva que ocupa ese día se identifica con la MISMA regla por días
      // (nada de comparar instantes: la hora del check-out corre un día).
      const span = spans.find((s) => unitOccupiedOnDay(unitId, cursor, [s]));
      return candidates.find((c) => c.id === span?.id) ?? null;
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
    // La capacidad la decide el rol (§27): sin ella, 403 con el permiso exacto.
    const sinPermiso = exigirPermisoHospitality(auth, 'reservas.crear');
    if (sinPermiso) return sinPermiso;

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
            error: `Conflicto de disponibilidad: la unidad ya tiene una reserva activa del ${toIsoDate(conflict.checkIn)} al ${toIsoDate(conflict.checkOut)} (${conflict.externalBookingId || conflict.estado}).`,
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
        estado: esEstadoValido(estado) ? estado : 'confirmed',
        checkIn: ci,
        checkOut: co,
        bookedOn: new Date(),
        segment: 'Directa',
        specialRequests: notas || null,
        pah: false,
        amountAfterTax: importe != null && importe !== '' ? Number(importe) : null,
        // Divisa de la reserva: la indicada, si no la de reporte del tenant.
        // El valor del esquema es solo la red de seguridad de la escritura.
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
