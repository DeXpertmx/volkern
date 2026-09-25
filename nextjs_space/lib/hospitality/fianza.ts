/**
 * Fianza manual (vía 1 de las tres del análisis contra Lodgify).
 *
 * Qué es: un depósito de garantía que el operador registra como PENDIENTE en
 * la reserva, cobra (o no) con los medios de siempre —el panel de cobros de
 * Finanzas, un link de Stripe, el mostrador—, y devuelve (o compensa) al
 * salir. Sin Stripe para nada de esto: la pre-autorización real es la vía 2,
 * que llegará cuando el hotel piloto tenga su cuenta Stripe probada.
 *
 * Por qué una LÍNEA de reserva y no una tabla nueva (mismo molde que la
 * penalización por no-show): Hospitality ya añade "lo que la reserva debe
 * reflejar" como líneas tipadas —el informe financiero suma líneas, la
 * factura legal sale del ERP y la analítica no las cuenta como alojamiento—.
 * Una tabla nueva sería una segunda contabilidad que habrá que reconciliar
 * para siempre.
 *
 * El ciclo entero vive en la línea:
 * - Se registra → línea `tipo: 'fianza'` con concepto "Pendiente de cobro".
 * - Se cobra → `concepto: 'Cobrada'` + el pago real lo registra Finanzas.
 * - Se devuelve → `concepto: 'Devuelta'` (la salida ya no la debe).
 * - Se compensa con daños → `concepto: 'Aplicada a daños'` + importe reducido
 *   a lo efectivamente retenido; el resto, devuelto.
 *
 * Regla 1 de la tenencia: la fianza es un DEPÓSITO del huésped, no un ingreso
 * de la estancia — solo el importe retenido por daños deviene ingreso, y esa
 * conversión la hace el ERP al facturar la línea retenida.
 */

import { prisma } from '@/lib/db';
import { monedaEscritura } from '@/lib/moneda';
import { formatearImporte } from '@/lib/moneda';
import {
  CONCEPTOS,
  TIPO_LINEA_FIANZA,
  estadoDesdeConcepto,
  fianzaAusente,
  type EstadoFianza,
  type ResultadoFianza,
} from './fianza-estados';

// Reexport del módulo puro: la API (servidor) sigue importando todo desde aquí,
// y el navegador importa las etiquetas desde './fianza-estados' sin arrastrar
// Prisma. Ver el comentario de cabecera de ese archivo.
export * from './fianza-estados';

/** Lee el estado de la fianza de una reserva. Sin línea = sin fianza. */
export async function estadoFianza(
  tenantId: string,
  reservationId: string
): Promise<EstadoFianza> {
  const item = await prisma.hospitalityReservationItem.findFirst({
    where: { tenantId, reservationId, tipo: TIPO_LINEA_FIANZA },
    orderBy: { fechaCreacion: 'desc' },
    select: { id: true, concepto: true, importeTotal: true, moneda: true, fechaEdicion: true },
  });

  if (!item) return fianzaAusente();

  return {
    existe: true,
    estado: estadoDesdeConcepto(item.concepto),
    importe: item.importeTotal,
    moneda: item.moneda,
    itemId: item.id,
    actualizadaEn: item.fechaEdicion,
  };
}

/**
 * Registra la fianza pendiente. Idempotente: si ya hay línea, no crea otra
 * (la segunda contabilidad prohibida); responder con la existente.
 */
export async function registrarFianza(
  tenantId: string,
  reservationId: string,
  importe: number,
  opts?: { moneda?: string | null }
): Promise<ResultadoFianza> {
  try {
    const reserva = await prisma.hospitalityReservation.findFirst({
      where: { id: reservationId, tenantId },
      select: { id: true, propertyId: true, unitId: true, currency: true },
    });
    if (!reserva) {
      return { ok: false, motivo: 'no_encontrada', error: 'Reserva no encontrada' };
    }
    const importeValido = Number(importe);
    if (!Number.isFinite(importeValido) || importeValido <= 0) {
      return { ok: false, motivo: 'importe', error: 'El importe de la fianza debe ser mayor a 0' };
    }

    const previa = await prisma.hospitalityReservationItem.findFirst({
      where: { tenantId, reservationId, tipo: TIPO_LINEA_FIANZA },
      select: { id: true, importeTotal: true, moneda: true },
    });
    if (previa) {
      return {
        ok: false,
        motivo: 'ya_existe',
        error: `Esta reserva ya tiene una fianza de ${formatearImporte(previa.importeTotal, previa.moneda)}. Usa las acciones de cobro o devolución.`,
      };
    }

    const moneda = monedaEscritura(opts?.moneda, reserva.currency);
    const item = await prisma.hospitalityReservationItem.create({
      data: {
        tenantId,
        reservationId,
        propertyId: reserva.propertyId,
        unitId: reserva.unitId,
        tipo: TIPO_LINEA_FIANZA,
        concepto: CONCEPTOS.pendiente,
        cantidad: 1,
        importeUnitario: importeValido,
        importeTotal: importeValido,
        moneda,
      },
      select: { id: true },
    });

    return { ok: true, accion: 'registrada', importe: importeValido, moneda, itemId: item.id };
  } catch (error) {
    console.error('[Hospitality] Error registrando la fianza:', error);
    return { ok: false, motivo: 'error', error: error instanceof Error ? error.message : 'Error registrando la fianza' };
  }
}

/**
 * Cambia el estado de la fianza existente. `importeRetenido` solo aplica a
 * `aplicada`: reduce la línea al importe retenido por daños (el resto se
 * devuelve) — y esa línea retenida es la que el ERP factura como ingreso.
 */
export async function cambiarEstadoFianza(
  tenantId: string,
  reservationId: string,
  accion: 'cobrar' | 'devolver' | 'aplicar',
  opts?: { importeRetenido?: number | null }
): Promise<ResultadoFianza> {
  try {
    const item = await prisma.hospitalityReservationItem.findFirst({
      where: { tenantId, reservationId, tipo: TIPO_LINEA_FIANZA },
      orderBy: { fechaCreacion: 'desc' },
      select: { id: true, importeTotal: true, moneda: true, concepto: true },
    });
    if (!item) {
      return { ok: false, motivo: 'sin_fianza', error: 'Esta reserva no tiene fianza registrada.' };
    }

    if (item.concepto.includes('Devuelta') || item.concepto.includes('Aplicada')) {
      return { ok: false, motivo: 'cerrada', error: 'La fianza ya está cerrada (devuelta o aplicada).' };
    }

    if (accion === 'aplicar') {
      const retenido = Number(opts?.importeRetenido);
      if (!Number.isFinite(retenido) || retenido <= 0) {
        return { ok: false, motivo: 'importe', error: 'Indica el importe que se retiene por daños.' };
      }
      if (retenido > item.importeTotal) {
        return { ok: false, motivo: 'importe', error: `El importe retenido no puede superar la fianza (${formatearImporte(item.importeTotal, item.moneda)}).` };
      }
      await prisma.hospitalityReservationItem.update({
        where: { id: item.id },
        data: {
          concepto: CONCEPTOS['aplicada_daños'],
          importeUnitario: retenido,
          importeTotal: retenido,
        },
      });
      return { ok: true, accion: 'aplicada', importe: retenido, moneda: item.moneda, itemId: item.id };
    }

    const concepto = accion === 'cobrar' ? CONCEPTOS.cobrada : CONCEPTOS.devuelta;
    await prisma.hospitalityReservationItem.update({
      where: { id: item.id },
      data: { concepto },
    });
    return {
      ok: true,
      accion: accion === 'cobrar' ? 'cobrada' : 'devuelta',
      importe: item.importeTotal,
      moneda: item.moneda,
      itemId: item.id,
    };
  } catch (error) {
    console.error('[Hospitality] Error cambiando el estado de la fianza:', error);
    return { ok: false, motivo: 'error', error: error instanceof Error ? error.message : 'Error actualizando la fianza' };
  }
}

/**
 * Quita una fianza registrada por error. Solo si sigue pendiente: una cobrada
 * ya movió dinero del huésped y su corrección es un reembolso de Finanzas, no
 * un borrado.
 */
export async function quitarFianza(
  tenantId: string,
  reservationId: string
): Promise<{ ok: true } | { ok: false; motivo: string; error: string }> {
  try {
    const item = await prisma.hospitalityReservationItem.findFirst({
      where: { tenantId, reservationId, tipo: TIPO_LINEA_FIANZA },
      orderBy: { fechaCreacion: 'desc' },
      select: { id: true, concepto: true },
    });
    if (!item) {
      return { ok: false, motivo: 'sin_fianza', error: 'Esta reserva no tiene fianza registrada.' };
    }
    if (!item.concepto.includes('pendiente')) {
      return { ok: false, motivo: 'cerrada', error: 'Solo se puede quitar una fianza pendiente de cobro.' };
    }
    await prisma.hospitalityReservationItem.delete({ where: { id: item.id } });
    return { ok: true };
  } catch (error) {
    console.error('[Hospitality] Error quitando la fianza:', error);
    return { ok: false, motivo: 'error', error: error instanceof Error ? error.message : 'Error quitando la fianza' };
  }
}
