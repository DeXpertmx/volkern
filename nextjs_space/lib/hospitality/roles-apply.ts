/**
 * Aplicar el catálogo de roles sin romper nada.
 *
 * Dos operaciones, y las dos tienen que ser aburridas: **medir** qué le falta a
 * un rol respecto a su definición, y **añadirlo** sin quitar nada. Viven aquí y
 * no dentro de la ruta porque son justo las que hay que poder leer y probar:
 * un `PUT` de permisos que se equivoque deja a un tenant sin acceso.
 *
 * La regla que las gobierna: aplicar el catálogo **nunca retira**. Si el
 * Anfitrión ajustó un rol a su manera, volver a aplicar el catálogo le devuelve
 * lo que le falte del diseño y le respeta lo que añadió. Recortar es otra cosa
 * —`restablecer`— y se pide a propósito.
 */
import { CAPACIDADES_HOSPITALITY, type CapacidadHospitality } from './capacidades';

export type Permisos = Record<string, unknown>;

/** ¿El rol concede esta capacidad? Mismo criterio que `hasPermisoDeRol`. */
export function concede(
  permisos: Permisos | null | undefined,
  modulo: string,
  accion: string
): boolean {
  if (!permisos || typeof permisos !== 'object') return false;
  // El wildcard concede todo, y eso incluye lo que estamos midiendo.
  if ((permisos as { all?: unknown }).all === true) return true;

  const delModulo = permisos[modulo];
  if (delModulo === true) return true;
  if (!delModulo || typeof delModulo !== 'object') return false;
  return (delModulo as Record<string, unknown>)[accion] === true;
}

/**
 * Las capacidades de un conjunto de permisos que el rol todavía no concede,
 * como `modulo.accion`. Devuelve vacío si el rol usa el wildcard.
 */
export function capacidadesFaltantes(
  actual: Permisos | null | undefined,
  esperado: Record<string, Record<string, boolean>>
): string[] {
  if (actual && typeof actual === 'object' && (actual as { all?: unknown }).all === true) {
    return [];
  }

  const faltan: string[] = [];
  for (const [modulo, acciones] of Object.entries(esperado)) {
    for (const [accion, concedida] of Object.entries(acciones)) {
      if (concedida !== true) continue;
      if (!concede(actual, modulo, accion)) faltan.push(`${modulo}.${accion}`);
    }
  }
  return faltan;
}

/**
 * Los permisos del rol con lo que le falta del catálogo añadido. Devuelve un
 * objeto nuevo —no muta el que recibe— y no retira ninguna clave existente.
 */
export function conLoQueFalta(
  actual: Permisos | null | undefined,
  esperado: Record<string, Record<string, boolean>>
): Permisos {
  // El wildcard ya lo concede todo: añadirle claves explícitas no cambiaría lo
  // que puede el rol, solo ensuciaría su JSON.
  if (actual && typeof actual === 'object' && (actual as { all?: unknown }).all === true) {
    return { ...actual };
  }

  const base: Permisos = actual && typeof actual === 'object' ? { ...actual } : {};
  for (const [modulo, acciones] of Object.entries(esperado)) {
    const previo = base[modulo];
    base[modulo] = {
      ...(previo && typeof previo === 'object' ? (previo as Permisos) : {}),
      ...acciones,
    };
  }
  return base;
}

/**
 * ¿Estos permisos conceden ya la capacidad? Lo usa la interfaz para marcar un
 * rol como al día sin recalcular el catálogo entero.
 */
export function concedeCapacidad(
  permisos: Permisos | null | undefined,
  capacidad: CapacidadHospitality
): boolean {
  const { modulo, accion } = CAPACIDADES_HOSPITALITY[capacidad];
  return concede(permisos, modulo, accion);
}
