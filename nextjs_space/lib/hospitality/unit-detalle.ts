/**
 * Detalle declarado de la UNIDAD (habitaciones y distribución de camas).
 *
 * Reencuadre propiedades ↔ unidades: la distribución del alojamiento es de
 * cada unidad (el Loft Marina no tiene las camas de la Suite Océano), y en la
 * propiedad solo viven las áreas comunes e instalaciones del complejo
 * (`detalleAlojamiento.servicios`). Este módulo es puro: normaliza la forma
 * del Json de la unidad, agrega los detalles de sus unidades para la ficha de
 * la propiedad y encoge el detalle de la propiedad a solo servicios. Los
 * catálogos de ids/etiquetas viven en `lib/hospitality/property-editor-config.ts`.
 */

/** Forma del detalle de una unidad: sin `servicios` (el catálogo vivo de la unidad es `amenidades`). */
export interface DetalleUnidad {
  habitaciones: Record<string, number>;
  camas: Record<string, number>;
}

export const DETALLE_UNIDAD_VACIO: DetalleUnidad = { habitaciones: {}, camas: {} };

function contadoresSanos(valor: unknown): Record<string, number> {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return {};
  const salida: Record<string, number> = {};
  for (const [clave, n] of Object.entries(valor as Record<string, unknown>)) {
    const num = Number(n);
    // Solo enteros positivos: un 0 es ruido (no declara nada) y un negativo,
    // basura. Sin entradas a cero el mapa guardado dice lo que hay.
    if (typeof clave === 'string' && clave.length > 0 && Number.isInteger(num) && num > 0) {
      salida[clave] = num;
    }
  }
  return salida;
}

/**
 * Normaliza el Json `detalleAlojamiento` de una unidad. Cualquier otra clave
 * (p. ej. un `servicios` heredado de un copia-pega de la propiedad) se
 * descarta: en la unidad no existe. `null` (o vacío) = sin configurar.
 */
export function normalizarDetalleUnidad(raw: unknown): DetalleUnidad | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const habitaciones = contadoresSanos((raw as Record<string, unknown>).habitaciones);
  const camas = contadoresSanos((raw as Record<string, unknown>).camas);
  if (Object.keys(habitaciones).length === 0 && Object.keys(camas).length === 0) return null;
  return { habitaciones, camas };
}

/** ¿Hay algo declarado en el detalle de la unidad? (para no escribir JSON vacío). */
export function hayDetalleUnidad(d: DetalleUnidad): boolean {
  return Object.keys(d.habitaciones).length > 0 || Object.keys(d.camas).length > 0;
}

/**
 * Agrega los detalles de las unidades de una propiedad: suma los contadores
 * por id de habitación/cama. Devuelve `null` si ninguna unidad declara nada.
 * Es la proyección SOLO LECTURA que la ficha de la propiedad muestra en el
 * lugar donde antes se editaba su propia distribución.
 */
export function agregarDetallesUnidades(
  detalles: Array<unknown>
): DetalleUnidad | null {
  const total: DetalleUnidad = { habitaciones: {}, camas: {} };
  for (const d of detalles) {
    // Acepta las DOS formas que llegan en la práctica: la fila de la unidad
    // (con su `detalleAlojamiento` dentro, como la manda el GET de la
    // propiedad) o el detalle ya extraído.
    const fila = d && typeof d === 'object' && 'detalleAlojamiento' in (d as Record<string, unknown>)
      ? (d as Record<string, unknown>).detalleAlojamiento
      : d;
    const norm = normalizarDetalleUnidad(fila);
    if (!norm) continue;
    for (const [id, n] of Object.entries(norm.habitaciones)) {
      total.habitaciones[id] = (total.habitaciones[id] ?? 0) + n;
    }
    for (const [id, n] of Object.entries(norm.camas)) {
      total.camas[id] = (total.camas[id] ?? 0) + n;
    }
  }
  return hayDetalleUnidad(total) ? total : null;
}

/**
 * Encoge el detalle de una PROPIEDAD a solo servicios (áreas comunes e
 * instalaciones del complejo). Desde el reencuadre, `habitaciones`/`camas` en
 * la propiedad son un agregado de sus unidades: nunca se guardan aquí — la
 * API pisa el valor con esta proyección al guardar. `null` = sin servicios.
 */
export function encogerDetalleAServicios(
  raw: unknown
): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const servicios = (raw as Record<string, unknown>).servicios;
  const limpios = Array.isArray(servicios)
    ? servicios.filter((s): s is string => typeof s === 'string' && s.length > 0)
    : [];
  if (limpios.length === 0) return null;
  return { servicios: limpios };
}
