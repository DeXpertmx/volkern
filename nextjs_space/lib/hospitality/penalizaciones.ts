/**
 * Emisión de la penalización por no-show — módulo de BD.
 *
 * Cuando una reserva pasa a `no_show`, la habitación vuelve al inventario
 * (regla 7 del plan) **y** se emite el cargo por no presentarse, si la política
 * de la propiedad y el canal lo permiten. La decisión de cuánto se cobra está
 * en el módulo puro `./no-show`; aquí solo se persiste.
 *
 * El cargo es una **línea de la propia reserva** (`hospitality_reservation_items`
 * con `tipo: 'penalizacion'`), no una entidad nueva: Hospitality añade «lo
 * específico de reservas: líneas, pagos y rentabilidad» (regla 4 del plan) y el
 * ERP sigue siendo el único sistema financiero. El pago se registra después con
 * el mismo POST de Finanzas que cualquier otro cobro.
 *
 * Garantías:
 *  - **Idempotente**: repetir la emisión no duplica el cargo (una línea por
 *    reserva). Es lo que hace segura la re-llamada desde el PATCH.
 *  - **Solo para no-show**: nunca emite sobre una reserva en otro estado.
 *  - **Nunca rompe el flujo**: un fallo al emitir no debe impedir marcar el
 *    no-show (el inventario manda).
 *  - **Nunca produce ocupación**: el cargo es una línea de la reserva, no un
 *    cambio de estado. La unidad sigue vendible y la analítica sigue ignorando
 *    la reserva (`aportaProduccion`); el dinero entra por el neto (ver
 *    `lib/hospitality/finance.ts`).
 *
 * La **factura legal** no se emite aquí: la emite el ERP (`InvoicingService`,
 * Veri*factu) cuando el operador la pide con `facturarPenalizacionNoShow`. Es
 * una acción explícita porque facturar es consecuente (numeración fiscal,
 * impuestos, AEAT) y no debe ser un efecto colateral de marcar un no-show.
 */

import { prisma } from '@/lib/db';
import { nightsBetween } from './calendar';
import {
  calcularPenalizacionNoShow,
  politicaEfectiva,
  elHotelEmiteElCargo,
  type MotivoSinPenalizacion,
  type PoliticaNoShow,
} from './no-show';

/** Tipo de línea de la penalización en `hospitality_reservation_items`. */
export const TIPO_LINEA_PENALIZACION = 'penalizacion';

export type MotivoNoEmitida =
  | MotivoSinPenalizacion
  | 'ya_emitida'
  | 'estado_no_es_no_show'
  | 'reserva_no_encontrada';

export interface ResultadoPenalizacion {
  ok: boolean;
  /** ¿Se acaba de crear el cargo? */
  emitida: boolean;
  /** Importe del cargo (el ya emitido si existía). */
  importe: number;
  moneda: string;
  nochesPenalizadas: number;
  politica: PoliticaNoShow;
  motivo: MotivoNoEmitida | null;
  itemId?: string;
  error?: string;
}

/**
 * Emite (o confirma que ya estaba emitida) la penalización por no-show de una
 * reserva.
 *
 * @param opts.politica Política para ESTA emisión (si no, la de la propiedad).
 * @param opts.cobrarEnCanal El operador decide emitirla aunque el canal externo
 *   cobre la suya (por ejemplo, si el canal finalmente no la aplicó).
 */
export async function aplicarPenalizacionNoShow(
  tenantId: string,
  reservationId: string,
  opts?: { politica?: PoliticaNoShow; cobrarEnCanal?: boolean }
): Promise<ResultadoPenalizacion> {
  const base = {
    ok: true,
    emitida: false,
    importe: 0,
    moneda: 'MXN',
    nochesPenalizadas: 0,
    politica: opts?.politica ?? politicaEfectiva(null),
  };

  try {
    const reserva = await prisma.hospitalityReservation.findFirst({
      where: { id: reservationId, tenantId },
      select: {
        id: true,
        estado: true,
        channel: true,
        checkIn: true,
        checkOut: true,
        amountAfterTax: true,
        currency: true,
        propertyId: true,
        unitId: true,
        property: { select: { politicaNoShow: true } },
        items: {
          where: { tipo: TIPO_LINEA_PENALIZACION },
          select: { id: true, importeTotal: true, invoiceId: true },
        },
      },
    });

    if (!reserva) {
      return { ...base, ok: false, motivo: 'reserva_no_encontrada', error: 'Reserva no encontrada' };
    }

    const moneda = reserva.currency || 'MXN';
    const politica = opts?.politica ?? politicaEfectiva(reserva.property?.politicaNoShow);

    // Ya emitida: se devuelve la existente (idempotencia).
    const yaEmitida = reserva.items[0];
    if (yaEmitida) {
      return {
        ...base,
        emitida: false,
        importe: yaEmitida.importeTotal || 0,
        moneda,
        politica,
        motivo: 'ya_emitida',
        itemId: yaEmitida.id,
      };
    }

    // Solo un no-show genera penalización.
    if (reserva.estado !== 'no_show') {
      return { ...base, moneda, politica, motivo: 'estado_no_es_no_show' };
    }

    const calculo = calcularPenalizacionNoShow({
      politica,
      canal: reserva.channel,
      importeTotal: reserva.amountAfterTax,
      noches: nightsBetween(reserva.checkIn, reserva.checkOut),
      cobrarEnCanal: opts?.cobrarEnCanal,
    });

    if (!calculo.aplica) {
      return {
        ...base,
        moneda,
        politica,
        motivo: calculo.motivo,
        // Traza útil para el operador: el canal cobra la suya.
        ok: true,
      };
    }

    const item = await prisma.hospitalityReservationItem.create({
      data: {
        tenantId,
        reservationId: reserva.id,
        propertyId: reserva.propertyId,
        unitId: reserva.unitId,
        tipo: TIPO_LINEA_PENALIZACION,
        concepto: calculo.concepto,
        // cantidad 1 y el importe completo: así cantidad × unitario es exacto y
        // el cargo no baila un céntimo al normalizar la línea al leerla.
        cantidad: 1,
        importeUnitario: calculo.importe,
        importeTotal: calculo.importe,
        moneda,
      },
      select: { id: true },
    });

    return {
      ok: true,
      emitida: true,
      importe: calculo.importe,
      moneda,
      nochesPenalizadas: calculo.nochesPenalizadas,
      politica,
      motivo: null,
      itemId: item.id,
    };
  } catch (error) {
    console.error('[Hospitality] Error emitiendo la penalización por no-show:', error);
    return {
      ...base,
      ok: false,
      motivo: null,
      error: error instanceof Error ? error.message : 'Error emitiendo la penalización',
    };
  }
}

/**
 * ¿Esta reserva tiene un canal externo que cobra su propia penalización?
 * Lo usa la UI/API para explicar por qué no se emite ningún cargo.
 */
export function canalExterno(canal: string | null | undefined): boolean {
  return !elHotelEmiteElCargo(canal);
}

// ─── Emisión de la factura por el ERP ────────────────────────────────────────

/** Por qué NO se facturó la penalización (null cuando sí se facturó). */
export type MotivoNoFacturada =
  | 'sin_penalizacion'
  | 'sin_contacto_fiscal'
  | 'ya_facturada';

export interface ResultadoFacturaPenalizacion {
  ok: boolean;
  /** ¿Se acaba de crear la factura? */
  facturada: boolean;
  /** Id de la factura del ERP (el existente si ya lo estaba). */
  invoiceId?: string;
  numero?: string;
  /** Importe facturado. */
  importe: number;
  moneda: string;
  motivo: MotivoNoFacturada | null;
  error?: string;
}

/**
 * Factura la penalización por no-show **por el circuito del ERP**
 * (`InvoicingService`, la misma vía que una orden de venta o un hito de
 * proyecto): Volkern no tiene un segundo sistema financiero (regla 4), así que
 * hospitality aporta el concepto y el importe, y el ERP la numeración, los
 * impuestos y la firma Veri*factu.
 *
 * El importe que viaja es el del cargo, que sale de `amountAfterTax` de la
 * reserva y por tanto **ya lleva el impuesto**: no se pasa `taxRate` para no
 * duplicarlo. Desglosar el impuesto es del ERP, no de hospitality.
 *
 * Sin `contactId` no hay receptor fiscal y no se factura: se devuelve el motivo
 * para que el operador vincule el huésped al CRM (`POST /guests/link`) y vuelva
 * a intentarlo. Es preferible a inventar un receptor.
 */
export async function facturarPenalizacionNoShow(
  tenantId: string,
  reservationId: string
): Promise<ResultadoFacturaPenalizacion> {
  const base = { ok: true, facturada: false, importe: 0, moneda: 'MXN' };

  try {
    const reserva = await prisma.hospitalityReservation.findFirst({
      where: { id: reservationId, tenantId },
      select: {
        id: true,
        contactId: true,
        currency: true,
        externalBookingId: true,
        items: {
          where: { tipo: TIPO_LINEA_PENALIZACION },
          select: { id: true, concepto: true, importeTotal: true, invoiceId: true },
        },
      },
    });

    if (!reserva || reserva.items.length === 0) {
      return { ...base, motivo: 'sin_penalizacion' };
    }

    const item = reserva.items[0];
    const moneda = reserva.currency || 'MXN';
    const importe = item.importeTotal || 0;

    // Ya facturada: se devuelve la misma (no se factura dos veces).
    if (item.invoiceId) {
      return {
        ...base,
        importe,
        moneda,
        invoiceId: item.invoiceId,
        motivo: 'ya_facturada',
      };
    }

    if (!reserva.contactId) {
      return { ...base, importe, moneda, motivo: 'sin_contacto_fiscal' };
    }

    // Import dinámico: hospitality no arrastra la cadena del ERP (AEAT, colas,
    // Stripe) en cada import.
    const { InvoicingService } = await import('@/lib/invoicing-service');
    const invoice = await InvoicingService.createInvoice({
      tenantId,
      contactId: reserva.contactId,
      amount: importe,
      currency: moneda,
      description: item.concepto || `Penalización por no-show · reserva ${reserva.externalBookingId}`,
      items: [{ name: item.concepto, quantity: 1, price: importe }],
    });

    // Traza en la línea: qué factura saldó este cargo (regla 5) y por qué no
    // debe volver a facturarse.
    await prisma.hospitalityReservationItem.update({
      where: { id: item.id },
      data: { invoiceId: invoice.id },
    });

    return {
      ok: true,
      facturada: true,
      invoiceId: invoice.id,
      numero: invoice.numero,
      importe,
      moneda,
      motivo: null,
    };
  } catch (error) {
    console.error('[Hospitality] Error facturando la penalización por el ERP:', error);
    return {
      ...base,
      ok: false,
      motivo: null,
      error: error instanceof Error ? error.message : 'Error facturando la penalización',
    };
  }
}
