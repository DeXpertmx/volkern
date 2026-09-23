export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { CheckCircle2, Clock, CalendarDays, MapPin, Users } from 'lucide-react';
import { prisma } from '@/lib/db';
import { verificarTokenReserva } from '@/lib/hospitality/booking-link';
import { formatearImporte } from '@/lib/moneda';
import { RESERVATION_STATUS, statusLabel, toIsoDate } from '@/lib/hospitality/calendar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

/**
 * Confirmación de una reserva directa.
 *
 * Página pública, pero no abierta: el enlace lleva un token firmado con el id de
 * la reserva, así que solo ve la reserva quien la hizo. No se enseña ningún dato
 * de otras reservas ni el catálogo interno del alojamiento.
 */
export default async function ConfirmacionReservaPage({
  params,
}: {
  params: Promise<{ slug: string; token: string }> | { slug: string; token: string };
}) {
  const { slug, token } = await params;

  const verificacion = verificarTokenReserva(token);
  if (!verificacion.ok) {
    const caducado = verificacion.motivo === 'caducado';
    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="text-2xl font-semibold">
          {caducado ? 'Este enlace ya no vale' : 'Este enlace no es válido'}
        </h1>
        <p className="text-muted-foreground">
          {caducado
            ? 'Pide al alojamiento que te reenvíe la confirmación de tu reserva.'
            : 'Comprueba que has abierto el enlace completo del mensaje de confirmación.'}
        </p>
        <Link className="text-sm underline" href={`/reservar/${slug}`}>
          Volver a la página de reservas
        </Link>
      </main>
    );
  }

  const reserva = await prisma.hospitalityReservation.findUnique({
    where: { id: verificacion.reservaId },
    include: {
      property: { select: { nombre: true, ciudad: true, direccion: true } },
      unit: { select: { nombre: true } },
      items: { select: { concepto: true, importeTotal: true } },
      payments: { select: { importe: true, estado: true } },
      tenant: { select: { nombre: true } },
    },
  });

  if (!reserva) {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="text-2xl font-semibold">No encontramos esa reserva</h1>
        <p className="text-muted-foreground">Escríbenos y la revisamos contigo.</p>
      </main>
    );
  }

  // La divisa sale de la reserva; si el proveedor no la trajo, de la del tenant.
  const moneda = reserva.currency || '';
  const cobrado = reserva.payments
    .filter((p) => p.estado === 'pagado' || p.estado === 'parcial')
    .reduce((total, p) => total + Number(p.importe || 0), 0);
  const confirmada = reserva.estado !== 'pending';
  const estado = RESERVATION_STATUS[reserva.estado];

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-6 p-6">
      <header className="flex flex-col gap-2 text-center">
        {confirmada ? (
          <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-500" aria-hidden />
        ) : (
          <Clock className="mx-auto h-12 w-12 text-amber-500" aria-hidden />
        )}
        <h1 className="text-2xl font-semibold">
          {confirmada ? 'Reserva confirmada' : 'Reserva recibida, pendiente de confirmar'}
        </h1>
        <p className="text-muted-foreground">
          {reserva.tenant?.nombre} · Referencia <span className="font-medium">{reserva.externalBookingId}</span>
        </p>
        {estado ? (
          <span className="mx-auto flex items-center gap-2 text-sm text-muted-foreground">
            <span className={`h-2 w-2 rounded-full ${estado.dot}`} aria-hidden />
            {statusLabel(reserva.estado)}
          </span>
        ) : null}
      </header>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Tu estancia</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm">
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-muted-foreground" aria-hidden />
            <span>
              {reserva.property?.nombre}
              {reserva.unit?.nombre ? ` · ${reserva.unit.nombre}` : ''}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-muted-foreground" aria-hidden />
            <span>
              {toIsoDate(reserva.checkIn)} → {toIsoDate(reserva.checkOut)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" aria-hidden />
            <span>
              {reserva.occupancyAdults} {reserva.occupancyAdults === 1 ? 'adulto' : 'adultos'}
              {reserva.occupancyChildren > 0
                ? ` · ${reserva.occupancyChildren} ${reserva.occupancyChildren === 1 ? 'niño' : 'niños'}`
                : ''}
            </span>
          </div>
          {reserva.specialRequests ? (
            <p className="rounded-md bg-muted p-3 text-muted-foreground">{reserva.specialRequests}</p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Importe</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm">
          {reserva.items.map((item) => (
            <div key={item.concepto} className="flex items-center justify-between">
              <span className="text-muted-foreground">{item.concepto}</span>
              <span>{formatearImporte(Number(item.importeTotal), moneda)}</span>
            </div>
          ))}
          <div className="mt-1 flex items-center justify-between border-t pt-2 font-medium">
            <span>Total</span>
            <span>{formatearImporte(Number(reserva.amountAfterTax || 0), moneda)}</span>
          </div>
          <div className="flex items-center justify-between text-muted-foreground">
            <span>Pagado</span>
            <span>{formatearImporte(cobrado, moneda)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Pendiente</span>
            <Badge variant={cobrado >= Number(reserva.amountAfterTax || 0) ? 'secondary' : 'outline'}>
              {formatearImporte(Number(reserva.amountAfterTax || 0) - cobrado, moneda)}
            </Badge>
          </div>
        </CardContent>
      </Card>

      <p className="text-center text-sm text-muted-foreground">
        Guarda este enlace: es tu comprobante. Para cualquier cambio, responde al mensaje de
        confirmación o escribe al alojamiento.
      </p>
    </main>
  );
}
