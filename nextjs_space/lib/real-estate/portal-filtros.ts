import { formatOperationLabel } from './operation-labels';

/**
 * Opciones de los buscadores del portal.
 *
 * La portada y el catálogo enseñan los mismos filtros; tenerlos aquí evita que
 * una página publique una operación o un tipo que la otra no ofrece.
 */

export const OPERACIONES_PORTAL = [
  'venta',
  'alquiler',
  'alquiler_temporada',
  'traspaso',
] as const;

export const TIPOS_INMUEBLE_PORTAL = [
  'Casa',
  'Departamento',
  'Oficina',
  'Local Comercial',
  'Terreno',
] as const;

/** Etiqueta visible de una operación, la misma que la insignia de la tarjeta. */
export function etiquetaOperacionPortal(operacion: string): string {
  return formatOperationLabel(operacion);
}
