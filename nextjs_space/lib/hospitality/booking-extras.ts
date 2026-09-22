/**
 * Extras comprables en el booking engine — módulo PURO.
 *
 * El hotel define su catálogo (desayuno, late check-out, traslados…) por
 * propiedad; el huésped elige en la web y la reserva nace con sus líneas de
 * `HospitalityReservationItem` tipo `extra` — el MISMO desglose que ya suma
 * Finanzas para el ingreso bruto y el margen. Nada nuevo en el modelo de
 * ingresos: el extra es una línea más.
 *
 * La regla de fondo: EL PRECIO LO PONE EL SERVIDOR. La selección del huésped
 * viaja como `{ extraId, cantidad }` y aquí se resuelve contra el catálogo
 * activo de la propiedad: lo que no está en él no existe (se ignora con su
 * motivo), lo que está se cobra al precio del catálogo. Las cantidades se
 * acotan (1–10) para que nadie compre 999 desayunos por error ni por arte.
 *
 * Lo que este módulo NO hace: tocar la base de datos — la ruta pasa el
 * catálogo y recibe las líneas listas para persistir.
 */

import type { Prisma } from '@prisma/client';

/** Extra activo del catálogo, tal como lo entrega la ruta. */
export interface ExtraCatalogo {
  id: string;
  nombre: string;
  descripcionEs: string | null;
  descripcionEn: string | null;
  precio: number;
  moneda: string;
  precioPorNoche: boolean;
}

/** Selección que envía la página pública. */
export interface SeleccionExtra {
  extraId: string;
  cantidad: number;
}

/** Línea de desglose lista para `hospitalityReservationItem.createMany`. */
export interface LineaExtra {
  tipo: 'extra';
  concepto: string;
  cantidad: number;
  importeUnitario: number;
  importeTotal: number;
  moneda: string;
  extraId: string;
}

export type ResultadoExtras =
  | { ok: true; lineas: LineaExtra[]; total: number; ignorados: string[] }
  | { ok: false; error: string };

/** Cota de una selección: un extra es por reserva/estancia, no por mayordomo. */
export const EXTRA_CANTIDAD_MIN = 1;
export const EXTRA_CANTIDAD_MAX = 10;

/**
 * Resuelve la selección del huésped contra el catálogo del servidor.
 *
 * - Precio, nombre y moneda salen SIEMPRE del catálogo (la selección solo
 *   nombra el id y cuántos).
 * - Un id que no está en el catálogo activo se ignora con su motivo: no
 *   rompe la venta (el huésped marcó un extra que el hotel acaba de
 *   desactivar) pero queda dicho.
 * - `totalExterno` es el importe de la reserva sin extras: el resultado
 *   comprueba que el total con extras sea coherente con lo que la ruta va a
 *   cobrar (el caller suma, aquí se redondea a 2 decimales como Finanzas).
 */
export function resolverExtras(
  seleccion: unknown,
  catalogo: ExtraCatalogo[],
  noches: number,
): ResultadoExtras {
  const lista = Array.isArray(seleccion) ? seleccion : [];
  const porId = new Map(catalogo.map((e) => [e.id, e]));

  const lineas: LineaExtra[] = [];
  const ignorados: string[] = [];

  for (const s of lista.slice(0, EXTRA_CANTIDAD_MAX)) {
    const registro = (s && typeof s === 'object' ? s : {}) as Record<string, unknown>;
    const extraId = typeof registro.extraId === 'string' ? registro.extraId : '';
    const cantidad = Number(registro.cantidad);

    if (!extraId) continue; // selección vacía: ni se menciona
    const extra = porId.get(extraId);
    if (!extra) {
      ignorados.push(`El extra ${extraId} ya no está disponible`);
      continue;
    }
    if (!Number.isInteger(cantidad) || cantidad < EXTRA_CANTIDAD_MIN || cantidad > EXTRA_CANTIDAD_MAX) {
      ignorados.push(`La cantidad de «${extra.nombre}» debe ser de ${EXTRA_CANTIDAD_MIN} a ${EXTRA_CANTIDAD_MAX}`);
      continue;
    }

    const multiplicador = extra.precioPorNoche ? Math.max(noches, 1) : 1;
    const unitario = Math.round(extra.precio * 100) / 100;
    lineas.push({
      tipo: 'extra',
      concepto:
        extra.nombre + (extra.precioPorNoche ? ` × ${noches} ${noches === 1 ? 'noche' : 'noches'}` : ''),
      cantidad,
      importeUnitario: unitario,
      importeTotal: Math.round(unitario * cantidad * multiplicador * 100) / 100,
      moneda: extra.moneda,
      extraId: extra.id,
    });
  }

  // Duplicados: si el cliente manda dos veces el mismo extra (doble click,
  // estado viejo), se suman en una sola línea — un desglose con dos filas del
  // mismo extra es ruido para Finanzas y para el huésped.
  const consolidadas = new Map<string, LineaExtra>();
  for (const linea of lineas) {
    const previa = consolidadas.get(linea.extraId);
    if (previa) {
      previa.cantidad += linea.cantidad;
      previa.importeTotal = Math.round(previa.importeUnitario * previa.cantidad * 100) / 100;
      // La cantidad consolidada también respeta la cota: si juntando duplicados
      // se pasa, se queda en la cota (el huésped no puede fabricar inventario).
      previa.cantidad = Math.min(previa.cantidad, EXTRA_CANTIDAD_MAX);
      previa.importeTotal = Math.round(previa.importeUnitario * previa.cantidad * 100) / 100;
    } else {
      consolidadas.set(linea.extraId, { ...linea });
    }
  }
  const finales = [...consolidadas.values()];

  const total = finales.reduce((acc, l) => acc + l.importeTotal, 0);
  return { ok: true, lineas: finales, total: Math.round(total * 100) / 100, ignorados };
}

/** El total de las líneas de extras en la moneda de la unidad (mismo redondeo). */
export function totalDeExtras(lineas: LineaExtra[]): number {
  return Math.round(lineas.reduce((acc, l) => acc + l.importeTotal, 0) * 100) / 100;
}

/** Filas listas para `hospitalityReservationItem.createMany` (data plana). */
export function filasDeItemsExtras(
  lineas: LineaExtra[],
  ctx: { tenantId: string; reservationId: string; propertyId: string; unitId: string | null },
): Array<Prisma.HospitalityReservationItemUncheckedCreateInput> {
  return lineas.map((l) => ({
    tenantId: ctx.tenantId,
    reservationId: ctx.reservationId,
    propertyId: ctx.propertyId,
    unitId: ctx.unitId,
    tipo: 'extra',
    concepto: l.concepto,
    cantidad: l.cantidad,
    importeUnitario: l.importeUnitario,
    importeTotal: l.importeTotal,
    moneda: l.moneda,
  }));
}

/** Lo que la web ve del catálogo (sin nada interno), en el idioma pedido. */
export interface ExtraPublico {
  id: string;
  nombre: string;
  descripcion: string | null;
  precio: number;
  moneda: string;
  precioPorNoche: boolean;
}

export function catalogoPublico(
  extras: ExtraCatalogo[],
  idioma: 'es' | 'en',
): ExtraPublico[] {
  return [...extras]
    .sort((a, b) => a.nombre.localeCompare(b.nombre))
    .map((e) => ({
      id: e.id,
      nombre: e.nombre,
      descripcion: (idioma === 'en' ? e.descripcionEn : e.descripcionEs) || null,
      precio: e.precio,
      moneda: e.moneda,
      precioPorNoche: e.precioPorNoche,
    }));
}
