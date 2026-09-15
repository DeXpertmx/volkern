/**
 * El paso que convierte en permisos lo que la plataforma concedía por nombre.
 *
 * Hospitality ya dejó de conceder nada por el nombre del rol
 * (`lib/hospitality/roles-rollout.ts`), pero fuera del módulo quedaban puertas
 * que sí, y son dos clases distintas de puerta:
 *
 *  1. **Acceso.** Cambiar el modo de compliance, escribir la marca de la cuenta
 *     y ver el cockpit financiero consolidado se otorgaban a quien se llamara
 *     «Admin» o «Administrador». Ahora lo concede `configuracion.gestionar`.
 *  2. **Alcance.** El pipeline de leads se veía entero salvo para quien se
 *     llamara «Sales Agent» o «Support», que solo veían lo suyo. Ahora lo
 *     decide `leads.ver_todos`.
 *
 * El problema no es el nombre en sí, es que el cliente puede renombrar ese rol
 * o crear otro que lo reutilice: la etiqueta acababa siendo la credencial, y
 * renombrar un rol concedía o retiraba datos sin que nadie lo hubiera pedido.
 *
 * Al sustituirlas hay roles que tenían privilegio por llamarse así y no tienen
 * la llave escrita. Sin este paso, el administrador de una cuenta se encuentra
 * de un día para otro con un 403 en su propio cockpit, o con el pipeline vacío
 * porque solo se ven sus leads.
 *
 * Es **solo aditivo** y **idempotente**: nunca retira nada y repetirlo no
 * cambia nada. A partir de ahí lo administra el Anfitrión desde la matriz de
 * roles como cualquier otro permiso.
 *
 * Excepción explícita: Superadmin no recibe nada. Su acceso no viene de un
 * permiso, viene de su bypass (`lib/permissions-core.ts`), así que copiarle
 * claves solo escribiría en el rol más privilegiado de la plataforma.
 */

import { PERMISO_PIPELINE_COMPLETO } from './permissions-core';

export type Permisos = Record<string, unknown>;

export interface PermisoConcedido {
  modulo: string;
  accion: string;
}

/**
 * Los nombres que hoy administran una cuenta.
 *
 * Son exactamente los que pasaban las puertas por nombre. Se comparan sin
 * distinguir mayúsculas ni espacios porque la base tiene las dos formas
 * (`Admin`, `admin`).
 */
export const NOMBRES_QUE_ADMINISTRABAN = ['admin', 'administrador'];

/** La llave que administra la cuenta: configuración, marca y modo de compliance. */
export const LLAVE_DE_ADMINISTRACION: PermisoConcedido = {
  modulo: 'configuracion',
  accion: 'gestionar',
};

/**
 * Los nombres que hoy solo veían sus propios leads.
 *
 * Son la otra mitad del defecto: el alcance del pipeline se recortaba por
 * etiqueta. Se comparan sin distinguir mayúsculas ni espacios porque la base
 * tiene las dos formas (`Support`, `support`).
 */
export const NOMBRES_QUE_VEIAN_SOLO_LOS_SUYOS = ['sales agent', 'support'];

/**
 * La llave del pipeline entero. Su definición vive con la regla que la lee
 * (`lib/permissions-core.ts`), para que la herencia no copie una acción que
 * nadie consulta.
 */
export const LLAVE_DEL_PIPELINE_COMPLETO: PermisoConcedido = {
  modulo: PERMISO_PIPELINE_COMPLETO.modulo,
  accion: PERMISO_PIPELINE_COMPLETO.accion,
};

export function tiene(
  permisos: Permisos | null | undefined,
  modulo: string,
  accion: string
): boolean {
  if (!permisos || typeof permisos !== 'object') return false;
  // El shape con wildcard (`{ all: true }`) lo usan los administradores creados
  // por `scripts/bootstrap-admin.ts`: ya lo tienen todo.
  if ((permisos as { all?: unknown }).all === true) return true;
  const delModulo = (permisos as Record<string, unknown>)[modulo];
  if (delModulo === true) return true;
  if (!delModulo || typeof delModulo !== 'object') return false;
  return (delModulo as Record<string, unknown>)[accion] === true;
}

/**
 * Qué permisos le corresponden a este rol por lo que era, y solo los que le
 * faltan. Devuelve vacío cuando no hay nada que heredar.
 */
export function permisosQueHereda(
  permisos: Permisos | null | undefined,
  nombreRol?: string | null
): PermisoConcedido[] {
  // La base tiene las dos grafías (`Admin`, `admin`) y espacios de más, así que
  // el nombre se normaliza antes de compararlo: espacios de dentro incluidos.
  const nombre = (nombreRol || '').trim().replace(/\s+/g, ' ').toLowerCase();
  if (nombre === 'superadmin') return [];

  const claves: PermisoConcedido[] = [];

  // 1. Administrar la cuenta: lo tenían por llamarse «Admin».
  if (
    NOMBRES_QUE_ADMINISTRABAN.includes(nombre) &&
    !tiene(permisos, LLAVE_DE_ADMINISTRACION.modulo, LLAVE_DE_ADMINISTRACION.accion)
  ) {
    claves.push(LLAVE_DE_ADMINISTRACION);
  }

  // 2. El pipeline entero: lo veían todos menos «Sales Agent» y «Support». Solo
  //    se copia a quien puede entrar al pipeline (`leads.ver`), porque a quien
  //    no lo ve la llave no le cambia nada; y a los dos nombres restringidos no
  //    se les copia, que es exactamente el privilegio que se convierte. Quien
  //    tiene el módulo entero o el wildcard ya la tiene: `tiene` lo resuelve.
  const veiaTodoElPipeline = !NOMBRES_QUE_VEIAN_SOLO_LOS_SUYOS.includes(nombre);
  if (
    veiaTodoElPipeline &&
    tiene(permisos, 'leads', 'ver') &&
    !tiene(permisos, LLAVE_DEL_PIPELINE_COMPLETO.modulo, LLAVE_DEL_PIPELINE_COMPLETO.accion)
  ) {
    claves.push(LLAVE_DEL_PIPELINE_COMPLETO);
  }

  return claves;
}

/**
 * Los permisos con lo heredado añadido. No muta ni retira nada: devuelve un
 * objeto nuevo.
 */
export function conPermisosHeredados(
  permisos: Permisos | null | undefined,
  nombreRol?: string | null
): Permisos {
  const hereda = permisosQueHereda(permisos, nombreRol);
  const base: Permisos = permisos && typeof permisos === 'object' ? { ...permisos } : {};
  if (!hereda.length) return base;

  for (const permiso of hereda) {
    const previo = base[permiso.modulo];
    base[permiso.modulo] = {
      ...(previo && typeof previo === 'object' ? (previo as Permisos) : {}),
      [permiso.accion]: true,
    };
  }

  return base;
}
