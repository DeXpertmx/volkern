/**
 * Guardia de permisos de Hospitality en la API (§27 del plan maestro).
 *
 * Las capacidades y la regla que las resuelve viven en
 * `lib/hospitality/capacidades.ts` y se reexportan aquí, así que los imports
 * existentes siguen funcionando. Lo que queda en este archivo es la parte que
 * responde HTTP: el 403 con la causa.
 */
import { NextResponse } from 'next/server';
import type { UserWithRole } from '@/lib/permissions-core';
import type { ApiKeyAuthResult } from '@/lib/api-key-auth';
import { CAPACIDADES_HOSPITALITY, puedePorRol, type CapacidadHospitality } from './capacidades';

export * from './capacidades';

/**
 * ¿Puede esta sesión ejercer la capacidad? Sin rol, sin permiso.
 *
 * Delega en la misma regla que usa la interfaz (`puedePorRol`): si alguna vez
 * cambia, cambia para las dos.
 */
export function puedeEnHospitality(
  auth: Pick<ApiKeyAuthResult, 'user'>,
  capacidad: CapacidadHospitality
): boolean {
  const rol = (auth.user as UserWithRole | undefined)?.role ?? null;
  return puedePorRol(rol, capacidad);
}

/**
 * Devuelve la respuesta 403 cuando falta el permiso, o `null` cuando se puede
 * seguir. La forma pensada es:
 *
 * ```ts
 * const sinPermiso = exigirPermisoHospitality(auth, 'reservas.ver');
 * if (sinPermiso) return sinPermiso;
 * ```
 *
 * El cuerpo del error dice qué permiso exacto falta (`hospitality_reservas.ver`)
 * para que el administrador pueda concederlo sin adivinar.
 */
export function exigirPermisoHospitality(
  auth: Pick<ApiKeyAuthResult, 'user'>,
  capacidad: CapacidadHospitality
): NextResponse | null {
  if (puedeEnHospitality(auth, capacidad)) return null;

  const definicion = CAPACIDADES_HOSPITALITY[capacidad];
  if (!definicion) {
    // Capacidad inexistente: error de programación, no una puerta abierta.
    return NextResponse.json({ error: 'Permiso desconocido' }, { status: 403 });
  }

  return NextResponse.json(
    {
      error: `Sin permiso para ${definicion.etiqueta}.`,
      permisoRequerido: `${definicion.modulo}.${definicion.accion}`,
    },
    { status: 403 }
  );
}

/**
 * Las decisiones de capacidad por tipo o por caso (`capacidadDeTarea`,
 * `capacidadDeCambioDeReserva`…) viven en `./capacidades`, que es puro: las usa
 * también la interfaz para no ofrecer un botón que la API va a rechazar. Aquí
 * se reexportan con el resto (`export * from './capacidades'`).
 */

/**
 * Qué reservas puede ver esta sesión.
 *
 * Tres respuestas y ninguna ambigüedad:
 *
 *  - `tenant`: el rol ve las reservas de la cuenta (el trabajo normal).
 *  - `propias`: el rol es el del huésped. Solo las reservas del contacto al que
 *    está vinculado el usuario.
 *  - `ninguno`: no tiene ni una cosa ni la otra. La ruta responde 403 con el
 *    permiso exacto que falta.
 *
 * La distinción es **capacidad**, no filtro: si `reservas.ver` y la vista del
 * huésped fueran el mismo permiso, no habría manera de dar acceso a un huésped
 * sin abrirle la cuenta entera. Y sin vínculo con un contacto, `propias`
 * devuelve cero reservas —nunca todas—, que es el lado seguro del error.
 */
export type AlcanceDeReservas =
  | { tipo: 'tenant' }
  | { tipo: 'propias'; contactId: string | null }
  | { tipo: 'ninguno' };

export function alcanceDeReservas(
  auth: Pick<ApiKeyAuthResult, 'user'>
): AlcanceDeReservas {
  if (puedeEnHospitality(auth, 'reservas.ver')) return { tipo: 'tenant' };

  if (puedeEnHospitality(auth, 'reservas.propias')) {
    const contactId = (auth.user as { contactId?: string | null } | undefined)?.contactId ?? null;
    return { tipo: 'propias', contactId };
  }

  return { tipo: 'ninguno' };
}

/**
 * Lo que se le dice a un huésped cuyo usuario no está vinculado a ningún
 * contacto. No es un error suyo ni una pantalla en blanco sin explicación.
 */
export const AVISO_SIN_VINCULO =
  'Tu usuario todavía no está vinculado a un huésped: pídeselo al Anfitrión de la propiedad.';
