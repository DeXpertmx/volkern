export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/conectividad/divergencias — divergencias pendientes de revisión.
 * POST /api/admin/conectividad/divergencias — cancelar la reserva de una divergencia.
 *
 * La reconciliación diaria (lib/cron/hospitality-reconcile.ts, §14) detecta
 * reservas internas activas que el proveedor ya no reporta — el caso típico es
 * un `cancel` que el webhook perdió: la reserva queda activa en el PMS y
 * cancelada en el canal, con la unidad vendida dos veces. El cron NUNCA cancela
 * solo: registra cada reserva ausente en HospitalitySyncLog (tipo
 * `reconciliacion`) y la cancelación queda para una persona. Este endpoint es
 * la parte de "esa persona": lista las divergencias de los últimos logs y
 * permite cancelar la reserva de una tras revisarla.
 *
 * GET: lee el responseBody de los logs de reconciliación exitosos con
 * `ausentes`, y anota el estado ACTUAL de cada reserva en el PMS (una
 * cancelada en otra parte o ya cerrada no es una divergencia activa).
 *
 * Devuelve además `inventario`: el último barrido de **noches sin justificar**
 * por propiedad (`divergencias_inventario`, §29) — las noches que el proveedor
 * no vende y aquí están libres, y las que vende sin que el estado interno las
 * justifique. Es la otra mitad del mismo problema: la reconciliación mira las
 * reservas, este mira el calendario que le enseñamos al canal (hoy no se le
 * pide inventario al proveedor: `Fetch Inventory` sigue sin implementar).
 *
 * POST body: { reservationId, syncLogId }
 *   Antes de cancelar re-verifica contra el proveedor (fetch de las reservas
 *   hechas alrededor de la fecha de RESERVA — no del rango de estancia: el
 *   proveedor filtra por `bookedOn`, ver lib/hospitality/ventana-reservas.ts).
 *   Si la reserva VUELVE a aparecer reportada, la divergencia era ruido
 *   transitorio del fetch — no se cancela y se pide re-ejecutar la
 *   reconciliación. Solo se cancela si sigue ausente.
 *
 *   La ventana se abre hasta cubrir cuándo se hizo la reserva: con una ventana
 *   fija de 30 días, una reserva de hace medio año no aparecería nunca y su
 *   ausencia del fetch se leería como «el proveedor ya no la reporta».
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import prisma from '@/lib/db';
import { fetchReservations } from '@/lib/hospitality/connectivity';
import { ventanaParaReserva } from '@/lib/hospitality/ventana-reservas';
import { processCancel } from '@/lib/hospitality/reservations';
import { esReservaViva } from '@/lib/hospitality/estados';
import { logAuditAction } from '@/lib/permissions';
import { notifyDeveloperSensitiveAction } from '@/lib/telegram/developer-notify';
import { TIPO_LOG_DIVERGENCIAS_INVENTARIO } from '@/lib/hospitality/inventario-divergencias';
import { VINCULO_PENDIENTE_REVISION } from '@/lib/hospitality/vinculo-revision';

async function requireSuperadmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return { error: NextResponse.json({ error: 'No autorizado' }, { status: 401 }) };
  }
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: { role: true },
  });
  if (!user || user.role?.nombre !== 'Superadmin') {
    return { error: NextResponse.json({ error: 'Acceso denegado' }, { status: 403 }) };
  }
  return { user };
}

/** Los logs de reconciliación que se revisan: hasta 90 días atrás. */
const DIAS_LOGS = 90;
/** Barridos de inventario que se miran: el último por propiedad basta. */
const MAX_LOGS_INVENTARIO = 60;

/** Una noche en la que lo que cree el proveedor no lo justifica el ERP. */
interface NocheInventario {
  roomCode: string;
  fecha: string;
  proveedor: number;
  interno: number;
  empujadoEn: string | null;
}

/** Último barrido de noches sin justificar de una propiedad. */
interface InventarioDivergente {
  syncLogId: string;
  syncLogFecha: string;
  tenantId: string;
  tenantNombre: string | null;
  propertyId: string | null;
  propertyNombre: string | null;
  /** El proveedor no vende noches que aquí sí son vendibles. */
  cerradasSinJustificar: number;
  /** El proveedor vende noches que el estado interno ya no justifica. */
  abiertasSinJustificar: number;
  comparadas: number;
  sinDato: number;
  cerradas: NocheInventario[];
  abiertas: NocheInventario[];
}

function esNocheValida(n: unknown): n is NocheInventario {
  if (typeof n !== 'object' || n === null) return false;
  const noche = n as NocheInventario;
  return (
    typeof noche.roomCode === 'string' &&
    typeof noche.fecha === 'string' &&
    typeof noche.proveedor === 'number' &&
    typeof noche.interno === 'number'
  );
}

function nochesValidas(v: unknown): NocheInventario[] {
  return Array.isArray(v) ? v.filter(esNocheValida) : [];
}

interface AusenteLog {
  reservationId?: unknown;
  externalBookingId?: unknown;
  channel?: unknown;
  estado?: unknown;
  checkIn?: unknown;
  checkOut?: unknown;
  unidad?: unknown;
  huespedes?: unknown;
}

function esAusenteValido(a: unknown): a is AusenteLog {
  return (
    typeof a === 'object' &&
    a !== null &&
    typeof (a as AusenteLog).reservationId === 'string' &&
    typeof (a as AusenteLog).externalBookingId === 'string' &&
    typeof (a as AusenteLog).channel === 'string'
  );
}

function aTexto(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}

function aNumero(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

// GET — una fila por reserva ausente (aunque varios logs la mencionen). El
// estado actual del PMS se consulta en vivo para que una reserva ya cancelada
// o cerrada no aparezca para siempre como pendiente.
export async function GET() {
  try {
    const auth = await requireSuperadmin();
    if ('error' in auth) return auth.error;

    const desde = new Date(Date.now() - DIAS_LOGS * 24 * 60 * 60 * 1000);
    const logs = await prisma.hospitalitySyncLog.findMany({
      where: {
        tipo: 'reconciliacion',
        estado: 'exito',
        fechaCreacion: { gte: desde },
      },
      include: {
        tenant: { select: { id: true, nombre: true } },
        property: { select: { id: true, nombre: true } },
      },
      orderBy: { fechaCreacion: 'desc' },
      take: 200,
    });

    // ── Noches sin justificar en el proveedor (§29) ────────────────────────
    // Un barrido por propiedad y día: el más reciente describe el presente.
    // Consulta aparte de los logs de reconciliación para que el tope de uno no
    // pueda dejar fuera al otro.
    const logsInventario = await prisma.hospitalitySyncLog.findMany({
      where: {
        tipo: TIPO_LOG_DIVERGENCIAS_INVENTARIO,
        estado: 'exito',
        fechaCreacion: { gte: desde },
      },
      include: {
        tenant: { select: { id: true, nombre: true } },
        property: { select: { id: true, nombre: true } },
      },
      orderBy: { fechaCreacion: 'desc' },
      take: MAX_LOGS_INVENTARIO,
    });

    const inventario: InventarioDivergente[] = [];
    const propiedadesYaVistas = new Set<string>();
    for (const log of logsInventario) {
      const clave = `${log.tenantId}|${log.propertyId ?? '—'}`;
      if (propiedadesYaVistas.has(clave)) continue; // solo el último barrido
      propiedadesYaVistas.add(clave);

      const body = log.responseBody as {
        cerradasSinJustificar?: unknown;
        abiertasSinJustificar?: unknown;
        comparadas?: unknown;
        sinDato?: unknown;
        cerradas?: unknown;
        abiertas?: unknown;
      } | null;
      const comparadas = aNumero(body?.comparadas);
      // Sin contadores no es un barrido de inventario: no se interpreta.
      if (comparadas === null) continue;

      inventario.push({
        syncLogId: log.id,
        syncLogFecha: log.fechaCreacion.toISOString(),
        tenantId: log.tenantId,
        tenantNombre: log.tenant?.nombre ?? null,
        propertyId: log.propertyId,
        propertyNombre: log.property?.nombre ?? null,
        cerradasSinJustificar: aNumero(body?.cerradasSinJustificar) ?? 0,
        abiertasSinJustificar: aNumero(body?.abiertasSinJustificar) ?? 0,
        comparadas,
        sinDato: aNumero(body?.sinDato) ?? 0,
        cerradas: nochesValidas(body?.cerradas),
        abiertas: nochesValidas(body?.abiertas),
      });
    }

    type Acumulada = {
      syncLogId: string;
      syncLogFecha: string;
      tenantId: string;
      tenantNombre: string | null;
      propertyId: string | null;
      propertyNombre: string | null;
      externalBookingId: string;
      channel: string;
      checkIn: string | null;
      checkOut: string | null;
      unidad: string | null;
      huespedes: number | null;
      veces: number;
      estadoActual: string | null;
    };

    const porReserva = new Map<string, Acumulada>();

    for (const log of logs) {
      const body = log.responseBody as { ausentes?: unknown } | null;
      const ausentes = body?.ausentes;
      if (!Array.isArray(ausentes)) continue;

      for (const a of ausentes) {
        if (!esAusenteValido(a)) continue;
        const rid = a.reservationId as string;
        const existente = porReserva.get(rid);
        if (existente) {
          existente.veces += 1;
          continue;
        }
        porReserva.set(rid, {
          syncLogId: log.id,
          syncLogFecha: log.fechaCreacion.toISOString(),
          tenantId: log.tenantId,
          tenantNombre: log.tenant?.nombre ?? null,
          propertyId: log.propertyId,
          propertyNombre: log.property?.nombre ?? null,
          externalBookingId: a.externalBookingId as string,
          channel: a.channel as string,
          checkIn: aTexto(a.checkIn),
          checkOut: aTexto(a.checkOut),
          unidad: aTexto(a.unidad),
          huespedes: aNumero(a.huespedes),
          veces: 1,
          estadoActual: null,
        });
      }
    }

    if (porReserva.size === 0) {
      return NextResponse.json({ divergencias: [], inventario });
    }

    const reservas = await prisma.hospitalityReservation.findMany({
      where: { id: { in: [...porReserva.keys()] } },
      select: { id: true, estado: true },
    });
    const estados = new Map(reservas.map((r) => [r.id, r.estado]));

    const divergencias = [...porReserva.entries()].map(([reservationId, d]) => ({
      reservationId,
      ...d,
      estadoActual: estados.get(reservationId) ?? null,
      reservaExiste: estados.has(reservationId),
    }));

    return NextResponse.json({ divergencias, inventario });
  } catch (error) {
    console.error('Error listando divergencias de reconciliación:', error);
    return NextResponse.json({ error: 'Error al listar divergencias' }, { status: 500 });
  }
}

// POST — cancelar la reserva de una divergencia revisada.
export async function POST(req: NextRequest) {
  try {
    const auth = await requireSuperadmin();
    if ('error' in auth) return auth.error;

    const body = await req.json().catch(() => ({}));
    const { reservationId, syncLogId } = body || {};
    if (typeof reservationId !== 'string' || reservationId.length === 0) {
      return NextResponse.json({ error: 'Falta reservationId' }, { status: 400 });
    }
    if (typeof syncLogId !== 'string' || syncLogId.length === 0) {
      return NextResponse.json({ error: 'Falta syncLogId' }, { status: 400 });
    }

    // 1. El log debe existir y todavía listar la reserva como ausente: evita
    //    cancelar a ciegas con un log viejo de otra realidad.
    const log = await prisma.hospitalitySyncLog.findUnique({
      where: { id: syncLogId },
      select: { id: true, tenantId: true, propertyId: true, responseBody: true },
    });
    if (!log) {
      return NextResponse.json({ error: 'Log de reconciliación no encontrado' }, { status: 404 });
    }

    const responseBody = log.responseBody as { ausentes?: unknown } | null;
    const ausentes = Array.isArray(responseBody?.ausentes) ? responseBody!.ausentes : [];
    const ausente = ausentes.find(
      (a: unknown) => esAusenteValido(a) && (a as AusenteLog).reservationId === reservationId
    );
    if (!ausente) {
      return NextResponse.json(
        { error: 'La reserva ya no figura como ausente en ese log: re-ejecuta la reconciliación.' },
        { status: 409 }
      );
    }
    const bookingId = (ausente as AusenteLog).externalBookingId as string;
    const channel = (ausente as AusenteLog).channel as string;

    // 2. La reserva debe seguir activa en el PMS.
    const reserva = await prisma.hospitalityReservation.findFirst({
      where: { id: reservationId, tenantId: log.tenantId },
      select: {
        id: true,
        estado: true,
        bookedOn: true,
        fechaCreacion: true,
        channel: true,
        externalBookingId: true,
      },
    });
    if (!reserva) {
      return NextResponse.json({ error: 'Reserva no encontrada' }, { status: 404 });
    }
    if (!esReservaViva(reserva.estado)) {
      return NextResponse.json(
        { error: `La reserva ya no está activa (estado: ${reserva.estado}).` },
        { status: 409 }
      );
    }

    // 3. Re-verificación contra el proveedor: si la reserva VUELVE a aparecer
    //    en su rango, el ausente era ruido del fetch. No se cancela nada.
    const propertyId: string | null = log.propertyId;
    if (!propertyId) {
      return NextResponse.json(
        { error: 'El log de reconciliación no tiene propiedad asociada.' },
        { status: 409 }
      );
    }
    // Re-verificación contra el proveedor es IMPORTACIÓN (ver
    // vinculo-revision.ts): un vínculo pendiente de revisión también da el
    // hotelCode contra el que preguntar.
    const mapping = await prisma.connectivityMapping.findFirst({
      where: {
        propertyId,
        tenantId: log.tenantId,
        provider: 'channel_connectivity',
        estado: { in: ['activo', VINCULO_PENDIENTE_REVISION] },
      },
      select: { externalPropertyId: true },
    });
    const hotelCode = mapping?.externalPropertyId ?? null;
    if (!hotelCode) {
      return NextResponse.json(
        {
          error:
            'La propiedad no tiene mapping de conectividad activo: no se puede re-verificar contra el proveedor. Revísalo manualmente.',
        },
        { status: 409 }
      );
    }

    // La ventana del proveedor son FECHAS DE RESERVA: se abre hasta cubrir el
    // día en que esta reserva se hizo (y si no consta, hasta el día en que entró
    // al sistema). Pedir el rango de estancia devolvía [] casi siempre y el
    // «no reaparece» habría cancelado reservas que el proveedor sí reporta.
    const ventana = ventanaParaReserva(reserva.bookedOn ?? reserva.fechaCreacion);
    const fetch = await fetchReservations(
      hotelCode,
      ventana.startDate,
      ventana.endDate,
      log.tenantId
    );

    if (fetch.ok && fetch.reservas) {
      const reaparece = fetch.reservas.some(
        (item: Record<string, unknown>) =>
          item.channel === channel && item.bookingId === bookingId && item.action !== 'cancel'
      );
      if (reaparece) {
        return NextResponse.json(
          {
            error:
              'El proveedor vuelve a reportar la reserva: la divergencia era transitoria. No se canceló nada; re-ejecuta la reconciliación.',
            reaparece: true,
          },
          { status: 409 }
        );
      }
    }
    // Si el fetch falla NO se bloquea: la revisión humana ya decidió, y un
    // error puntual del proveedor no debe dejar la unidad vendida dos veces.

    // 4. Cancelar (respetando el tenant del log, nunca del cliente HTTP).
    const result = await processCancel(log.tenantId, {
      action: 'cancel',
      hotelCode,
      channel,
      bookingId,
    } as Parameters<typeof processCancel>[1]);

    if (!result.ok || result.status !== 'cancelada') {
      return NextResponse.json(
        { error: `No se pudo cancelar la reserva: ${result.error || result.status}` },
        { status: 409 }
      );
    }

    // 5. Trazabilidad de la acción sensible.
    await notifyDeveloperSensitiveAction({
      title: '🧭 Divergencia de reconciliación resuelta',
      accion: 'Reserva cancelada tras revisar divergencia',
      detalle: `Booking ${bookingId} (${channel}) cancelada manualmente tras revisión del operador.`,
      quien: auth.user.name || auth.user.email || auth.user.id,
      userId: auth.user.id,
    }).catch((err) => console.error('[Divergencias] Error al notificar:', err));

    await logAuditAction(
      auth.user.id,
      log.tenantId,
      'hospitality_divergencia_cancelar',
      'HospitalityReservation',
      reserva.id,
      `Reserva ${bookingId} (${channel}) cancelada tras revisar divergencia de reconciliación`,
      { estado: reserva.estado },
      { estado: 'cancelled' },
      req.headers.get('x-forwarded-for') || undefined,
      req.headers.get('user-agent') || undefined
    );

    return NextResponse.json({ ok: true, reservationId: reserva.id, estado: 'cancelled' });
  } catch (error) {
    console.error('Error cancelando reserva de divergencia:', error);
    return NextResponse.json({ error: 'Error al cancelar la reserva' }, { status: 500 });
  }
}
