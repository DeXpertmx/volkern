/**
 * El paso que convierte en permisos lo que hoy se tenía por nombre de rol.
 *
 * Al retirar las dos puertas que miraban el nombre (`Admin` podía instalar el
 * certificado de la entidad y ver los documentos sin enmascarar), y al separar
 * el check-in de la limpieza y los roles del resto del equipo, hay privilegios
 * que **dejarían de existir** para quien los tiene hoy. Quitarlos de golpe
 * rompería el trabajo de gente que está trabajando: el administrador de una
 * cuenta se encontraría sin poder instalar su propio certificado.
 *
 * Este módulo copia cada privilegio desde la regla que lo concedía, una sola
 * vez y de forma explícita, para que a partir de ahí lo administre el
 * Anfitrión desde la matriz de roles como cualquier otro permiso.
 *
 * Es **solo aditivo**: nunca retira nada. Y vive aparte del script para poder
 * probarse sin base de datos, porque las reglas de herencia son justo lo que
 * hay que poder leer y discutir.
 */
import {
  CAPACIDADES_HOSPITALITY,
  type CapacidadHospitality,
} from './capacidades';
import { esNombreDeRolHospitality } from './roles';

export type Permisos = Record<string, unknown>;

function tiene(permisos: Permisos | null | undefined, modulo: string, accion: string): boolean {
  if (!permisos || typeof permisos !== 'object') return false;
  if ((permisos as { all?: unknown }).all === true) return true;
  const delModulo = (permisos as Record<string, unknown>)[modulo];
  if (delModulo === true) return true;
  if (!delModulo || typeof delModulo !== 'object') return false;
  return (delModulo as Record<string, unknown>)[accion] === true;
}

/**
 * Qué capacidades privilegiadas —o nuevas— le corresponden a este rol por lo
 * que ya tenía concedido. Devuelve solo las que le faltan.
 *
 * Las tres reglas, y por qué cada una:
 *
 *  - **El nombre `Admin`.** Era la puerta de las credenciales del registro de
 *    viajeros y de los documentos sin enmascarar. Se copia a permisos para que
 *    deje de depender de cómo se llame el rol — y para que un rol nuevo pueda
 *    recibirlo.
 *  - **Quien podía gestionar la limpieza.** El check-in pedía el mismo permiso
 *    que limpiar. Al separarlos, quien lo tenía se queda con los dos. Esta
 *    regla **no** se aplica a los roles del catálogo: Limpieza nace ya después
 *    de la separación y dice en `roles.ts` lo que puede —marcar limpiezas, no
 *    entregar llaves—, así que heredarle el check-in sería contradecir su
 *    propia definición y dar a quien limpia una puerta que nadie le concedió.
 *  - **Quien podía editar el equipo.** Los roles colgaban de `equipo.editar` y
 *    `equipo.eliminar`; ahora los de Hospitality tienen su propia llave.
 */
export function capacidadesQueHereda(
  permisos: Permisos | null | undefined,
  nombreRol?: string | null
): CapacidadHospitality[] {
  // Superadmin pasa cualquier comprobación por su propio bypass, así que copiarle
  // claves no le daría nada: solo escribiría en el rol más privilegiado de la
  // plataforma sin motivo. No se toca.
  if ((nombreRol || '').trim() === 'Superadmin') return [];

  const heredadas: CapacidadHospitality[] = [];

  if ((nombreRol || '').trim() === 'Admin') {
    heredadas.push('integraciones.administrar', 'viajeros.documento_completo');
  }

  if (
    !esNombreDeRolHospitality(nombreRol) &&
    tiene(permisos, 'hospitality_operaciones', 'gestionar')
  ) {
    heredadas.push('operaciones.checkin');
  }

  if (tiene(permisos, 'equipo', 'editar') || tiene(permisos, 'equipo', 'eliminar')) {
    heredadas.push('roles.gestionar');
  }

  // Solo las que de verdad le faltan: así el script es idempotente y puede
  // repetirse sin tocar nada.
  return heredadas.filter((capacidad) => {
    const { modulo, accion } = CAPACIDADES_HOSPITALITY[capacidad];
    return !tiene(permisos, modulo, accion);
  });
}

/**
 * Los permisos con los privilegios heredados añadidos. No muta ni retira nada:
 * devuelve un objeto nuevo.
 */
export function conPrivilegiosHeredados(
  permisos: Permisos | null | undefined,
  nombreRol?: string | null
): Permisos {
  const heredadas = capacidadesQueHereda(permisos, nombreRol);
  const base: Permisos = permisos && typeof permisos === 'object' ? { ...permisos } : {};
  if (!heredadas.length) return base;

  for (const capacidad of heredadas) {
    const { modulo, accion } = CAPACIDADES_HOSPITALITY[capacidad];
    const previo = base[modulo];
    base[modulo] = {
      ...(previo && typeof previo === 'object' ? (previo as Permisos) : {}),
      [accion]: true,
    };
  }

  return base;
}
