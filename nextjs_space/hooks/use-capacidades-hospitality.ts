'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  puedePorRol,
  type CapacidadHospitality,
  type RolConPermisos,
} from '@/lib/hospitality/capacidades';

/**
 * Capacidades de Hospitality del rol de la sesión, para la interfaz.
 *
 * La regla no se reimplementa aquí: se llama a `puedePorRol`, que es la misma
 * que decide en la API. Eso es lo que evita el fallo clásico de ofrecer un botón
 * que el backend va a rechazar.
 *
 * De dónde sale el rol: `/api/users/me`, que ya devuelve `role.nombre` y
 * `role.permisos` y que la barra lateral ya pide. Se cachea en el módulo para no
 * repetir la petición en cada componente; el rol de una sesión no cambia sin
 * recargar, y no tiene sentido duplicar la llamada diez veces por página.
 */

let rolEnCache: RolConPermisos | null | undefined;
let peticionEnVuelo: Promise<RolConPermisos | null> | null = null;

function cargarRol(): Promise<RolConPermisos | null> {
  if (rolEnCache !== undefined) return Promise.resolve(rolEnCache);
  if (!peticionEnVuelo) {
    peticionEnVuelo = fetch('/api/users/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((datos) => {
        rolEnCache = (datos?.role as RolConPermisos) ?? null;
        return rolEnCache;
      })
      .catch(() => {
        // Si no se puede saber el rol, no se concede nada. La API decidirá.
        rolEnCache = null;
        return null;
      })
      .finally(() => {
        peticionEnVuelo = null;
      });
  }
  return peticionEnVuelo;
}

export interface CapacidadesHospitality {
  /**
   * ¿Puede el rol ejercer esta capacidad?
   *
   * Devuelve `false` mientras se está resolviendo el rol: es preferible que una
   * acción tarde una fracción de segundo en aparecer a que aparezca y desaparezca
   * —o peor, a que alguien pulse un botón que su rol no tiene—.
   */
  puede: (capacidad: CapacidadHospitality) => boolean;
  /** El rol todavía se está resolviendo. */
  cargando: boolean;
}

export function useCapacidadesHospitality(): CapacidadesHospitality {
  const [rol, setRol] = useState<RolConPermisos | null | undefined>(rolEnCache);

  useEffect(() => {
    let vivo = true;
    if (rolEnCache !== undefined) {
      setRol(rolEnCache);
      return;
    }
    cargarRol().then((r) => {
      if (vivo) setRol(r);
    });
    return () => {
      vivo = false;
    };
  }, []);

  const cargando = rol === undefined;

  const puede = useCallback(
    (capacidad: CapacidadHospitality) => (cargando ? false : puedePorRol(rol, capacidad)),
    [rol, cargando]
  );

  return { puede, cargando };
}

/**
 * Olvida el rol cacheado. La usan las pruebas; en la aplicación el rol de la
 * sesión no cambia sin una recarga.
 */
export function olvidarRolCacheado(): void {
  rolEnCache = undefined;
  peticionEnVuelo = null;
}
