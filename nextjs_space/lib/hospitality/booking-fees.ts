/**
 * Tarifas adicionales de la estancia — módulo PURO.
 *
 * Lo que el huésped paga ADEMÁS del precio de las noches y que no es un producto
 * del catálogo comercial: limpieza, gestión, mascota, ropa de cama, resort,
 * comunidad. Hasta ahora solo existía una (`tarifaLimpieza` de la config del
 * booking); este módulo resuelve la lista por propiedad.
 *
 * Dos clases de tarifa, y la diferencia es quién decide:
 * - **Obligatoria**: entra en TODA estancia de la propiedad. El huésped no la
 *   ve como opción porque no puede quitarla; el motor la suma sin preguntar.
 * - **Opcional**: se ofrece y solo se cobra si el huésped la elige (mascota,
 *   cama extra). La selección viaja como ids y aquí se resuelve contra el
 *   catálogo activo: lo que no está no existe, y el importe NUNCA viene del
 *   navegador.
 *
 * Se cobra una vez por estancia (no por noche): es la única base que el
 * producto ofrece hoy, y por eso no hay campo de periodicidad. Añadirla sería
 * otro contrato, no un detalle de este.
 */

/** Tarifa activa tal como la entrega la base (o la API del panel). */
export interface TarifaCatalogo {
  id: string;
  nombre: string;
  descripcionEs: string | null;
  descripcionEn: string | null;
  importe: number;
  moneda: string;
  /** Si es obligatoria entra siempre; si no, solo cuando el huésped la elige. */
  obligatoria: boolean;
}

/** Línea de desglose lista para `hospitalityReservationItem.createMany`. */
export interface LineaTarifa {
  tarifaId: string;
  concepto: string;
  importe: number;
  moneda: string;
  obligatoria: boolean;
}

export type ResultadoTarifas =
  | { ok: true; lineas: LineaTarifa[]; total: number; ignorados: string[] }
  | { ok: false; error: string };

/** Redondeo a céntimo, con el mismo criterio que el resto del dinero. */
function aCentimo(valor: number): number {
  return Math.round((valor + Number.EPSILON) * 100) / 100;
}

/**
 * Suma de las tarifas OBLIGATORIAS del catálogo.
 *
 * Es lo que la cotización suma sin conocer al huésped: la parte del precio que
 * no depende de ninguna elección. Las opcionales quedan fuera a propósito —una
 * cotización que las cobrara todas estaría enseñando un precio que el huésped
 * no tiene por qué pagar—.
 */
export function totalObligatorias(catalogo: TarifaCatalogo[]): number {
  // Defensivo a propósito: un catálogo que no carga (null) no puede tumbar la
  // cotización; simplemente no suma nada.
  return aCentimo(
    (Array.isArray(catalogo) ? catalogo : []).reduce(
      (total, t) => (t.obligatoria ? total + (Number(t.importe) || 0) : total),
      0
    )
  );
}

/** Tarifas opcionales que la página ofrece al huésped. */
export function tarifasOpcionales(catalogo: TarifaCatalogo[]): TarifaCatalogo[] {
  return (Array.isArray(catalogo) ? catalogo : []).filter((t) => !t.obligatoria);
}

/**
 * Resuelve la selección del huésped contra el catálogo activo.
 *
 * Devuelve las obligatorias (siempre) más las opcionales elegidas, en el orden
 * del catálogo para que el desglose no cambie de orden entre dos reservas
 * iguales. Los ids desconocidos o repetidos no rompen la venta: el primero
 * queda dicho en `ignorados` y el segundo se ignora sin duplicar el cargo.
 */
export function resolverTarifas(catalogo: TarifaCatalogo[], seleccion: unknown): ResultadoTarifas {
  if (!Array.isArray(catalogo)) {
    return { ok: false, error: 'El catálogo de tarifas no es válido' };
  }
  const elegidas = new Set(
    (Array.isArray(seleccion) ? seleccion : [])
      .filter((id): id is string => typeof id === 'string' && id.trim() !== '')
      .map((id) => id.trim())
  );

  const ignorados: string[] = [];
  const lineas: LineaTarifa[] = [];

  for (const tarifa of catalogo) {
    const importe = aCentimo(Math.max(0, Number(tarifa.importe) || 0));
    const aplica = tarifa.obligatoria || elegidas.has(tarifa.id);
    if (!aplica) continue;
    if (importe <= 0) {
      // Una tarifa a cero no es un cargo: se omite sin ruido en el desglose.
      continue;
    }
    lineas.push({
      tarifaId: tarifa.id,
      concepto: tarifa.nombre,
      importe,
      moneda: tarifa.moneda,
      obligatoria: tarifa.obligatoria,
    });
  }

  // Un id que no está en el catálogo activo se menciona una sola vez: puede ser
  // una tarifa que el hotel acaba de desactivar o un envío manipulado.
  const conocidas = new Set(catalogo.map((t) => t.id));
  for (const id of elegidas) {
    if (!conocidas.has(id)) ignorados.push(`La tarifa ${id} ya no está disponible`);
  }

  const total = aCentimo(lineas.reduce((acc, l) => acc + l.importe, 0));
  return { ok: true, lineas, total, ignorados };
}

/** Filas listas para `hospitalityReservationItem.createMany` (data plana). */
export function filasDeItemsTarifas(
  lineas: LineaTarifa[],
  ctx: { tenantId: string; reservationId: string; propertyId: string; unitId: string | null }
) {
  return lineas.map((l) => ({
    tenantId: ctx.tenantId,
    reservationId: ctx.reservationId,
    propertyId: ctx.propertyId,
    unitId: ctx.unitId,
    // `extra` es el cajón de los cargos que no son alojamiento ni limpieza
    // clásica; Finanzas ya lo suma como ingreso y el concepto dice cuál es.
    tipo: 'extra' as const,
    concepto: l.concepto,
    cantidad: 1,
    importeUnitario: l.importe,
    importeTotal: l.importe,
    moneda: l.moneda,
  }));
}

/** Lo que la web ve del catálogo (sin nada interno), en el idioma pedido. */
export interface TarifaPublica {
  id: string;
  nombre: string;
  descripcion: string | null;
  importe: number;
  moneda: string;
  obligatoria: boolean;
}

export function catalogoPublicoDeTarifas(
  tarifas: TarifaCatalogo[],
  idioma: 'es' | 'en'
): TarifaPublica[] {
  return [...tarifas]
    .sort((a, b) => a.nombre.localeCompare(b.nombre))
    .map((t) => ({
      id: t.id,
      nombre: t.nombre,
      descripcion: (idioma === 'en' ? t.descripcionEn : t.descripcionEs) || null,
      importe: aCentimo(Math.max(0, Number(t.importe) || 0)),
      moneda: t.moneda,
      obligatoria: t.obligatoria,
    }));
}
