/**
 * Reconciliación de reservas (plan maestro §14).
 *
 * Los webhooks no son la única fuente para recuperar inconsistencias. Este
 * módulo consulta las reservas reales del proveedor de conectividad (Fetch
 * Reservations, contrato) y detecta:
 *
 *   - Faltantes: reserva en el proveedor que no existe en Volkern → book.
 *   - Modificaciones no aplicadas: misma bookingId con datos distintos
 *     (fechas, importe, ocupación...) → modify (estado completo nuevo).
 *   - Cancelaciones no aplicadas: item con action "cancel" → cancel.
 *   - Divergencias de disponibilidad: reserva interna activa que el
 *     proveedor ya no reporta → se registra; opcionalmente se cancela.
 *
 * Reglas de seguridad (§14):
 *   - Idempotente: ejecutar dos veces con los mismos datos no duplica ni
 *     reescribe nada (comparación por firma estable antes de escribir).
 *   - No sobrescribir ciegamente: cada cambio queda registrado con motivo
 *     y fuente en HospitalitySyncLog (tipo `reconciliacion`).
 *   - Las reservas ausentes del fetch NO se cancelan por defecto: se
 *     registran como divergencia para revisión manual (puede activarse
 *     con `cancelarAusentes`).
 *   - Aislamiento multi-tenant: todo se filtra por tenantId.
 *
 * ── La ventana del fetch (por qué mira hacia atrás, y hasta dónde) ────────
 * `startDate`/`endDate` del proveedor filtran por FECHA DE RESERVA (`bookedOn`),
 * no por fechas de estancia: está medido y documentado en
 * `lib/hospitality/ventana-reservas.ts`. El barrido que empezaba en HOY solo
 * podía ver reservas hechas hoy —es decir, casi nunca ninguna— y dejaba fuera
 * para siempre toda reserva cuyo push se perdió. Ahora mira el horizonte de
 * venta de los canales (`diasAtras`, por defecto 730 días) y conserva `dias`
 * de margen hacia adelante para las divergencias de disponibilidad.
 *
 * ── Por qué una estancia terminada hace meses NO entra (y se cuenta) ──────
 * Mirar dos años atrás trae también la historia del hotel. Lo que decide si una
 * reserva recién vista entra al ERP no es cuándo se reservó sino cuándo se
 * queda: una estancia futura o en curso entra siempre, y una terminada entra
 * solo si terminó hace menos de `DIAS_ESTANCIA_IMPORTABLE` días (factura, parte
 * de viajeros, conciliación del mes). El resto se cuenta como `historicas` en
 * el log —no desaparece en silencio— y no se escribe nada en la base.
 */

import { prisma } from '@/lib/db';
import type { Prisma } from '@prisma/client';
import { fetchReservations, updateConnectivityStatus } from './connectivity';
import { ESTADOS_RESERVA_VIVA } from './estados';
import { VINCULO_PENDIENTE_REVISION } from './vinculo-revision';
import {
  DIAS_BARRIDO_RESERVAS_ATRAS,
  estanciaImportable,
  toIsoFechaLocal,
  ventanaFetchReservas,
} from './ventana-reservas';
import {
  processBook,
  processModify,
  processCancel,
  resolveMapping,
  type WebhookReservationPayload,
} from './reservations';

export interface ReconciliationInput {
  tenantId: string;
  /** Si se omite, reconcilia todas las propiedades del tenant con mapping. */
  propertyId?: string;
  /** Días hacia adelante a consultar (default 30). */
  dias?: number
  /**
   * Días hacia atrás a consultar (default: el horizonte de venta, 730): el
   * proveedor filtra por fecha de RESERVA, así que es lo que recupera los
   * pushes perdidos — y una reserva viva pudo reservarse hace meses.
   */
  diasAtras?: number;
  /** Cancelar reservas internas activas ausentes del fetch (default false). */
  cancelarAusentes?: boolean;
}

export interface ReconciliationSummary {
  ok: boolean;
  propiedades: number;
  fetchFallidos: number;
  totalFetch: number;
  creadas: number;
  actualizadas: number;
  canceladas: number;
  sinCambios: number;
  divergencias: number;
  /**
   * Reservas que el proveedor devuelve y NO se traen porque su estancia
   * terminó hace más de `DIAS_ESTANCIA_IMPORTABLE` días: historia del hotel,
   * no incidencias. Se cuentan para que la ventana profunda no parezca
   * silenciosa.
   */
  historicas: number;
  errores: string[];
  detalle?: Array<{
    propertyId: string;
    propertyNombre: string;
    hotelCode: string;
    creadas: number;
    actualizadas: number;
    canceladas: number;
    sinCambios: number;
    divergencias: number;
    historicas: number;
    error?: string;
    /** Reservas internas activas que el proveedor ya no reporta
     *  (divergencias de disponibilidad). Vacío cuando no hubo ninguna;
     *  es la lista que revisa el operador en el panel de admin. */
    ausentes?: ReservaAusente[];
    /**
     * Resultado del push de disponibilidad que se dispara cuando el barrido
     * tocó algo: recuperar una reserva sin reflejarla en el canal dejaría la
     * unidad vendida aquí y abierta allí. Ausente = no hubo nada que empujar.
     */
    push?: { ok: boolean; pushCount: number; errores: number } | null;
  }>;
}

/** Reserva activa del PMS que el fetch del proveedor ya no devuelve. */
export interface ReservaAusente {
  reservationId: string;
  externalBookingId: string;
  channel: string;
  estado: string;
  checkIn: string | null;
  checkOut: string | null;
  unidad: string | null;
  huespedes: number;
}

/**
 * Puerta de forma del contrato: de un item crudo del proveedor a un payload
 * utilizable, o null si no se puede ni comparar.
 *
 * Es la MISMA puerta para el barrido y para el aviso temprano
 * (`lib/hospitality/reservas-faltantes.ts`): si los dos decidieran por su
 * cuenta qué item es una reserva, el aviso y el barrido contarían cosas
 * distintas sobre la misma respuesta.
 */
export function normalizePayload(item: Record<string, unknown>): WebhookReservationPayload | null {
  const bookingId = item.bookingId as string | undefined;
  const channel = item.channel as string | undefined;
  const hotelCode = item.hotelCode as string | undefined;
  // Las cancelaciones pueden llegar sin fechas (payload reducido del contrato).
  if (!bookingId || !channel || !hotelCode) return null;
  if (item.action !== 'cancel' && (!item.checkin || !item.checkout)) return null;
  return item as unknown as WebhookReservationPayload;
}

/** Firma estable de los datos que deben compararse para detectar cambios. */
function reservationFingerprint(payload: WebhookReservationPayload, estado: string): string {
  const amount = payload.amount as any;
  const room = payload.rooms?.[0] as any;
  return JSON.stringify({
    estado,
    channel: payload.channel,
    cmBookingId: payload.cmBookingId ?? null,
    checkin: payload.checkin,
    checkout: payload.checkout,
    bookedOn: payload.bookedOn ?? null,
    segment: payload.segment ?? null,
    specialRequests: payload.specialRequests ?? null,
    pah: payload.pah ?? false,
    amountAfterTax: amount?.amountAfterTax ?? null,
    amountBeforeTax: amount?.amountBeforeTax ?? null,
    tax: amount?.tax ?? null,
    currency: amount?.currency ?? null,
    commission: amount?.commission ?? null,
    adults: room?.occupancy?.adults ?? 1,
    children: room?.occupancy?.children ?? 0,
  });
}

/**
 * Ejecuta la reconciliación de un tenant contra el proveedor de conectividad.
 * Idempotente: sin diferencias no hay escrituras, solo el log de auditoría.
 */
export async function runReconciliation(
  input: ReconciliationInput
): Promise<ReconciliationSummary> {
  const dias = input.dias ?? 30;
  const diasAtras = input.diasAtras ?? DIAS_BARRIDO_RESERVAS_ATRAS;
  const summary: ReconciliationSummary = {
    ok: true,
    propiedades: 0,
    fetchFallidos: 0,
    totalFetch: 0,
    creadas: 0,
    actualizadas: 0,
    canceladas: 0,
    sinCambios: 0,
    divergencias: 0,
    historicas: 0,
    errores: [],
    detalle: [],
  };

  // Propiedades del tenant con mapping activo de conectividad (hotelCode).
  const propertyRows = await prisma.hospitalityProperty.findMany({
    where: {
      tenantId: input.tenantId,
      ...(input.propertyId ? { id: input.propertyId } : {}),
    },
    include: {
      mappings: {
        // Lectura de ENTRADA (reconciliación de reservas): los pendientes de
        // revisión también cuentan como hotel del que importar (ver
        // vinculo-revision.ts).
        where: {
          provider: 'channel_connectivity',
          estado: { in: ['activo', VINCULO_PENDIENTE_REVISION] },
        },
        select: { externalPropertyId: true },
        take: 1,
      },
    },
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = new Date(today);
  end.setDate(today.getDate() + dias);
  // La ventana que se le pide al proveedor: hacia atrás lo que se pudo perder
  // (fecha de RESERVA) y hacia adelante el margen de las divergencias.
  const ventana = ventanaFetchReservas(diasAtras, dias, today);

  for (const prop of propertyRows) {
    const hotelCode = prop.mappings?.[0]?.externalPropertyId;
    if (!hotelCode) continue;

    summary.propiedades += 1;
    const detalle: NonNullable<ReconciliationSummary['detalle']>[number] = {
      propertyId: prop.id,
      propertyNombre: prop.nombre,
      hotelCode,
      creadas: 0,
      actualizadas: 0,
      canceladas: 0,
      sinCambios: 0,
      divergencias: 0,
      historicas: 0,
    };
    summary.detalle!.push(detalle);

    // 1. Consultar reservas reales del proveedor (por fecha de RESERVA).
    const fetch = await fetchReservations(
      hotelCode,
      ventana.startDate,
      ventana.endDate,
      input.tenantId
    );
    // Cuántas devolvió el fetch para ESTA propiedad: sin este número, un
    // barrido con la ventana vacía y uno que lo trajo todo malformado se leen
    // igual en el log («0 creadas, 0 divergencias»).
    const devueltas = fetch.reservas?.length ?? 0;
    let sinForma = 0;
    if (!fetch.ok || !fetch.reservas) {
      summary.fetchFallidos += 1;
      summary.ok = false;
      detalle.error = fetch.error || `HTTP ${fetch.httpStatus}`;
      summary.errores.push(`[${prop.nombre}] ${detalle.error}`);

      // §30: el error de integración queda SIEMPRE registrado con su causa,
      // aunque el fetch no devuelva datos.
      try {
        await prisma.hospitalitySyncLog.create({
          data: {
            tenantId: input.tenantId,
            propertyId: prop.id,
            tipo: 'reconciliacion',
            operacion: 'reconciliacion',
            estado: 'error',
            httpStatus: fetch.httpStatus ?? null,
            requestPayload: {
              hotelCode,
              // El rango es el de FECHAS DE RESERVA consultado, no el de estancias.
              rango: `${ventana.startDate} → ${ventana.endDate}`,
              cancelarAusentes: input.cancelarAusentes ?? false,
            },
            errorMensaje: detalle.error,
          },
        });
      } catch (e) {
        console.error('[Hospitality] Error registrando log de reconciliación fallida:', e);
      }
      continue;
    }

    summary.totalFetch += fetch.reservas.length;
    const vistos = new Set<string>(); // bookingId|channel vistos en el fetch

    for (const item of fetch.reservas) {
      const payload = normalizePayload(item);
      if (!payload) {
        // El proveedor devolvió algo que no tiene la forma del contrato: no se
        // puede ni comparar. Se cuenta en el log en vez de desaparecer.
        sinForma += 1;
        continue;
      }
      const key = `${payload.channel}|${payload.bookingId}`;
      vistos.add(key);

      // Estancia terminada hace más de `DIAS_ESTANCIA_IMPORTABLE` días: es
      // historia del hotel, no una reserva que el hotel pueda operar (ni noches
      // que vender, ni factura, ni parte que comunicar). Se cuenta —para que la
      // ventana profunda no parezca silenciosa— y se descarta ANTES de resolver
      // el vínculo y de tocar la base: el barrido pide dos años de reservas y no
      // todas merecen una consulta. Las cancelaciones no pasan por aquí: una
      // cancelación hay que aplicarla a lo que tengamos (ver más abajo).
      if (payload.action !== 'cancel' && !estanciaImportable(payload.checkout, today)) {
        detalle.historicas += 1;
        summary.historicas += 1;
        continue;
      }

      const mapping = await resolveMapping(payload);
      // El hotelCode del item debe coincidir con esta propiedad.
      if (!mapping?.property || mapping.property.id !== prop.id) {
        detalle.divergencias += 1;
        summary.divergencias += 1;
        continue;
      }

      // Cancelación explícita del proveedor.
      if (payload.action === 'cancel') {
        const result = await processCancel(input.tenantId, payload);
        if (result.status === 'cancelada') {
          detalle.canceladas += 1;
          summary.canceladas += 1;
        } else if (result.status === 'duplicado') {
          // Ya estaba cancelada aquí (misma cancelación ya aplicada): no hay
          // cambio que empujar. Sin esta rama el barrido contaba «canceladas: 1»
          // en CADA pasada por la misma cancelación vieja y disparaba con ella
          // un push completo de inventario y tarifas al canal, dos veces al día.
          detalle.sinCambios += 1;
          summary.sinCambios += 1;
        } else if (!estanciaImportable(payload.checkout, today)) {
          // Cancelación de una estancia que ya terminó hace tiempo y que aquí no
          // existe: no puede afectar a nada vivo. Se cuenta como histórica.
          detalle.historicas += 1;
          summary.historicas += 1;
        } else {
          // Cancelación de algo que no tenemos y que aún importa: se registra.
          detalle.divergencias += 1;
          summary.divergencias += 1;
        }
        continue;
      }

      // Book/modify: comparar contra el estado interno.
      const existing = await prisma.hospitalityReservation.findUnique({
        where: {
          tenantId_channel_externalBookingId: {
            tenantId: input.tenantId,
            channel: payload.channel,
            externalBookingId: payload.bookingId,
          },
        },
        select: { id: true, estado: true, payload: true },
      });

      const estadoEsperado =
        payload.action === 'modify' && ['checked_in', 'checked_out'].includes(existing?.estado || '')
          ? existing!.estado
          : 'confirmed';

      if (!existing) {
        // Faltante: crear (book). Idempotente por bookingId. (Lo que se
        // descarta por histórico ya se filtró arriba, antes de tocar la base.)
        const result = await processBook(input.tenantId, prop.id, mapping.unit?.id ?? null, payload);
        if (result.status === 'creada') {
          detalle.creadas += 1;
          summary.creadas += 1;
        } else {
          detalle.divergencias += 1;
          summary.divergencias += 1;
        }
        continue;
      }

      // Existe: comparar firma. Sin diferencias → nada que hacer.
      const currentFingerprint = existing.payload
        ? reservationFingerprint(existing.payload as unknown as WebhookReservationPayload, existing.estado)
        : '';
      const newFingerprint = reservationFingerprint(payload, estadoEsperado);

      if (currentFingerprint === newFingerprint) {
        detalle.sinCambios += 1;
        summary.sinCambios += 1;
        continue;
      }

      // Modificación real: modify (reemplazo completo, nunca mezcla).
      const result = await processModify(input.tenantId, prop.id, mapping.unit?.id ?? null, payload);
      if (result.status === 'actualizada' || result.status === 'creada') {
        detalle.actualizadas += 1;
        summary.actualizadas += 1;
      } else {
        detalle.divergencias += 1;
        summary.divergencias += 1;
      }
    }

    // 2. Divergencias de disponibilidad: reservas internas activas que el
    //    proveedor ya no reporta. Por defecto solo se registran.
    const activas = await prisma.hospitalityReservation.findMany({
      where: {
        tenantId: input.tenantId,
        propertyId: prop.id,
        // Reservas VIVAS (estancia en curso): una estancia terminada ya no es
        // una divergencia pendiente de resolver.
        estado: { in: [...ESTADOS_RESERVA_VIVA] },
        checkIn: { lt: end },
        checkOut: { gt: today },
      },
      select: {
        id: true,
        channel: true,
        externalBookingId: true,
        estado: true,
        checkIn: true,
        checkOut: true,
        occupancyAdults: true,
        occupancyChildren: true,
        unit: { select: { nombre: true } },
      },
    });

    const ausentes: ReservaAusente[] = [];

    for (const r of activas) {
      if (vistos.has(`${r.channel}|${r.externalBookingId}`)) continue;
      detalle.divergencias += 1;
      summary.divergencias += 1;
      if (input.cancelarAusentes) {
        const result = await processCancel(input.tenantId, {
          action: 'cancel',
          hotelCode,
          channel: r.channel,
          bookingId: r.externalBookingId,
        } as WebhookReservationPayload);
        if (result.status === 'cancelada') {
          detalle.canceladas += 1;
          summary.canceladas += 1;
          // Cancelada en esta corrida: ya no es divergencia pendiente de revisión.
          continue;
        }
      }
      ausentes.push({
        reservationId: r.id,
        externalBookingId: r.externalBookingId,
        channel: r.channel,
        estado: r.estado,
        checkIn: r.checkIn ? toIsoFechaLocal(new Date(r.checkIn)) : null,
        checkOut: r.checkOut ? toIsoFechaLocal(new Date(r.checkOut)) : null,
        unidad: r.unit?.nombre ?? null,
        huespedes: (r.occupancyAdults ?? 0) + (r.occupancyChildren ?? 0),
      });
    }

    // La lista viaja también en el resumen devuelto a la ruta/API.
    if (ausentes.length > 0) detalle.ausentes = ausentes;

    // 3. Lo que se recuperó del proveedor tiene que llegar al CANAL. El camino
    //    del webhook ya empuja tras cada reserva; una reserva recuperada por el
    //    barrido (su push se perdió o llegó rechazado) se quedaba sin reflejar
    //    en el calendario del canal: la unidad vendida aquí y abierta allí, que
    //    es exactamente la sobreventa que la guardia de noches sin justificar
    //    acaba de señalar en la misma corrida. Se re-empuja la disponibilidad
    //    completa (la calcula el estado interno, ya con las reservas dentro) y
    //    las noches se cierran/abren solas.
    const cambios = detalle.creadas + detalle.actualizadas + detalle.canceladas;
    if (cambios > 0) {
      try {
        const { dispatchConnectivityPush } = await import('./sync');
        const push = await dispatchConnectivityPush(input.tenantId, prop.id, 'reconciliacion');
        detalle.push = { ok: push.ok, pushCount: push.pushCount, errores: push.errores };
      } catch (e) {
        console.error('[Hospitality] Error empujando la disponibilidad tras la reconciliación:', e);
        detalle.push = { ok: false, pushCount: 0, errores: 1 };
      }
    }

    // Log de auditoría por propiedad (motivo y fuente, §14/§29/§30).
    try {
      await prisma.hospitalitySyncLog.create({
        data: {
          tenantId: input.tenantId,
          propertyId: prop.id,
          tipo: 'reconciliacion',
          operacion: 'reconciliacion',
          estado: detalle.error ? 'error' : 'exito',
          requestPayload: {
            hotelCode,
            // El rango es el de FECHAS DE RESERVA consultado, no el de estancias.
            rango: `${ventana.startDate} → ${ventana.endDate}`,
            cancelarAusentes: input.cancelarAusentes ?? false,
          },
          // La lista concreta de ausentes es lo que revisa el operador:
          // sin ella el log solo dice "hay N divergencias" pero no cuáles.
          responseBody: ((): Prisma.InputJsonValue => {
            const body: Record<string, Prisma.InputJsonValue> = {
              // Lo que devolvió el proveedor y lo que traía forma de reserva.
              reservasDevueltas: devueltas,
              sinForma,
              creadas: detalle.creadas,
              actualizadas: detalle.actualizadas,
              canceladas: detalle.canceladas,
              sinCambios: detalle.sinCambios,
              divergencias: detalle.divergencias,
              historicas: detalle.historicas,
            };
            if (ausentes.length > 0) body.ausentes = ausentes as unknown as Prisma.InputJsonValue;
            if (detalle.push) body.push = detalle.push as unknown as Prisma.InputJsonValue;
            return body;
          })(),
          errorMensaje: detalle.error ?? null,
        },
      });
    } catch (e) {
      console.error('[Hospitality] Error registrando log de reconciliación:', e);
    }
  }

  // Observabilidad §29: actualizar estado del proveedor.
  try {
    if (summary.fetchFallidos > 0) {
      await updateConnectivityStatus({ estado: 'error', error: true, ultimoEvento: new Date() });
    } else {
      await updateConnectivityStatus({
        estado: 'conectado',
        resetErrores: true,
        ultimaSincronizacion: new Date(),
        ultimoEvento: new Date(),
      });
    }
  } catch (e) {
    console.error('[Hospitality] Error actualizando estado del proveedor:', e);
  }

  return summary;
}