'use client';

import type { ReactNode } from 'react';
import { useCapacidadesHospitality } from '@/hooks/use-capacidades-hospitality';
import type { CapacidadHospitality } from '@/lib/hospitality/capacidades';

/**
 * Envuelve una acción de Hospitality para que solo se muestre a quien puede
 * hacerla.
 *
 * Por qué un componente y no un `if` con el hook en cada página: la capacidad
 * que exige cada acción queda escrita junto a la acción
 * (`<AccionHospitality capacidad="reservas.cancelar">`), así que se lee en el
 * sitio donde importa y el guardia de tests puede comprobarla. Un `puede(...)`
 * suelto se puede olvidar; esto se ve.
 *
 * Oculta en lugar de deshabilitar: un botón permanentemente gris es ruido que no
 * explica nada, y para saber por qué no se puede hacer algo está el 403 de la
 * API, que sí dice qué permiso falta. Lo que no se hace nunca es enseñar la
 * acción y dejar que el backend la rechace.
 *
 * Esto es comodidad, no seguridad: el permiso lo sigue validando la API y hay
 * un test que lo exige en cada método.
 */
export function AccionHospitality({
  capacidad,
  children,
}: {
  capacidad: CapacidadHospitality;
  children: ReactNode;
}) {
  const { puede } = useCapacidadesHospitality();
  if (!puede(capacidad)) return null;
  return <>{children}</>;
}
