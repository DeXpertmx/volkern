/**
 * Lógica del retrollenado de permisos de Hospitality (sin base de datos).
 *
 * Vive aparte del script (`scripts/backfill-hospitality-permissions.ts`) para
 * poder probarse: decidir si un rol ya está cubierto y cómo se fusiona el
 * conjunto completo son decisiones que no deberían depender de tener Postgres
 * delante.
 */
import { PERMISOS_HOSPITALITY_COMPLETOS } from '@/lib/hospitality/permissions';

export type Permisos = Record<string, unknown>;

/**
 * ¿Este rol ya puede ejercer Hospitality sin retrollenar?
 *
 *  - `{ all: true }` concede todo (shape de `bootstrap-admin`).
 *  - Un rol llamado Superadmin pasa cualquier comprobación por nombre, así que
 *    no necesita claves explícitas.
 *  - Cualquier clave `hospitality_*` significa que ya se retrollenó.
 */
export function rolYaCubierto(
  permisos: Permisos | null | undefined,
  nombreRol?: string | null
): boolean {
  if (nombreRol === 'Superadmin') return true;
  if (!permisos || typeof permisos !== 'object') return false;
  if ((permisos as { all?: unknown }).all === true) return true;
  return Object.keys(permisos).some((clave) => clave.startsWith('hospitality_'));
}

/**
 * Fusiona el conjunto completo sin pisar lo que el rol ya tuviera concedido.
 * Devuelve un objeto nuevo: no muta el que se le pasa.
 */
export function conPermisosHospitality(permisos: Permisos | null | undefined): Permisos {
  const base: Permisos = permisos && typeof permisos === 'object' ? { ...permisos } : {};

  for (const [modulo, acciones] of Object.entries(PERMISOS_HOSPITALITY_COMPLETOS)) {
    const previo = base[modulo];
    base[modulo] = {
      ...(previo && typeof previo === 'object' ? (previo as Permisos) : {}),
      ...acciones,
    };
  }

  return base;
}
