export const dynamic = 'force-dynamic';

/**
 * GET /api/hospitality/reservations/export — CSV de la lista de reservas.
 *
 * La recepción trabaja la lista del día (llegadas, salidas, teléfonos y las
 * respuestas a las preguntas del hotel) sin entrar reserva a reserva.
 *
 * Exporta EXACTAMENTE la lista que se ve en pantalla: los mismos filtros de
 * la API de reservas (propertyId, unitId, estado, canal, q, from, to) viajan
 * en la URL y se resuelven con la misma función `whereDeFiltrosReservas`.
 * Sin filtros exporta el listado completo del tenant (hasta 1000 reservas).
 *
 * El CSV lleva BOM UTF-8 y separador `;` para que Excel (locale con coma
 * decimal) separe bien las columnas y respete los acentos. Con 0 reservas
 * responde 404 razonado: un CSV sin filas solo confunde al que lo abre.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { authenticateRequest } from '@/lib/api-key-auth';
import { partesDeViajerosPorReserva } from '@/lib/hospitality/registro-viajeros-service';
import {
  construirReservasCsv,
  diaLocalIso,
  nombreArchivoReservasCsv,
  type ReservaExportable,
} from '@/lib/hospitality/reservas-csv';
import { whereDeFiltrosReservas } from '@/app/api/hospitality/reservations/route';

const LIMITE_EXPORT = 1000;

export async function GET(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (!auth.valid) return NextResponse.json({ error: auth.error }, { status: 401 });
    const tenantId = auth.tenant!.id;

    const { searchParams } = new URL(req.url);
    const where = whereDeFiltrosReservas(searchParams, tenantId);

    const [reservations, preguntas] = await Promise.all([
      prisma.hospitalityReservation.findMany({
        where,
        include: {
          unit: { select: { id: true, nombre: true, codigo: true } },
          property: { select: { id: true, nombre: true } },
          contact: { select: { id: true, nombre: true, email: true, telefono: true } },
        },
        orderBy: [{ checkIn: 'asc' }],
        take: LIMITE_EXPORT,
      }),
      // Auxiliar: si la consulta de preguntas falla, el CSV sale con las
      // columnas fijas — perder el archivo entero por las columnas extra no.
      prisma.hospitalityCheckinPregunta
        .findMany({ where: { tenantId }, orderBy: [{ orden: 'asc' }, { fechaCreacion: 'asc' }] })
        .catch(() => []),
    ]);

    if (reservations.length === 0) {
      return NextResponse.json(
        { error: 'No hay reservas que coincidan con los filtros' },
        { status: 404 }
      );
    }

    const partes = await partesDeViajerosPorReserva(tenantId, reservations);
    const preguntasConTexto = preguntas.map((p) => ({ id: p.id, texto: String(p.es ?? p.id) }));

    const filas: ReservaExportable[] = reservations.map((r) => {
      const gd = (r.guestData || {}) as Record<string, unknown>;
      const huesped =
        (gd.firstName || gd.lastName
          ? [gd.firstName, gd.lastName].filter(Boolean).join(' ')
          : r.contact?.nombre) || '';
      const parte = partes.get(r.id) ?? null;
      return {
        referencia: r.externalBookingId ?? '',
        estado: r.estado,
        huesped,
        email: String(gd.email ?? r.contact?.email ?? ''),
        telefono: String(gd.phone ?? gd.telefono ?? r.contact?.telefono ?? ''),
        propiedad: r.property?.nombre ?? '',
        unidad: r.unit?.nombre ?? r.unit?.codigo ?? '',
        checkIn: diaLocalIso(r.checkIn),
        checkOut: diaLocalIso(r.checkOut),
        noches: Math.max(
          0,
          Math.round(
            (new Date(r.checkOut).getTime() - new Date(r.checkIn).getTime()) / 86_400_000
          )
        ),
        canal: r.channel ?? '',
        importe: r.amountAfterTax ?? null,
        moneda: r.currency ?? '',
        parteEstado: String(parte?.estado ?? ''),
        respuestas: ((r.respuestasCheckin ?? {}) as Record<string, string>) || {},
      };
    });

    const csv = construirReservasCsv(filas, preguntasConTexto);
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${nombreArchivoReservasCsv()}"`,
      },
    });
  } catch (error) {
    console.error('Error exportando reservas:', error);
    return NextResponse.json({ error: 'Error al exportar reservas' }, { status: 500 });
  }
}
