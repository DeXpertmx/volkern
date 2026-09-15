/**
 * El paso que convierte en permisos lo que la plataforma concedía por nombre.
 *
 * Hospitality ya dejó de conceder nada por el nombre del rol
 * (`lib/hospitality/roles-rollout.ts`), pero fuera del módulo quedaban puertas
 * que sí: cambiar el modo de compliance, escribir la marca de la cuenta y ver
 * el cockpit financiero consolidado se otorgaban a quien se llamara «Admin» o
 * «Administrador». El problema no es el nombre en sí, es que el cliente puede
 * renombrar ese rol o crear otro que lo reutilice: la etiqueta acababa siendo
 * la credencial.
 *
 * Al sustituir esas puertas por el permiso `configuracion.gestionar` —el de
 * administrar la cuenta— hay roles que lo tenían todo por llamarse así y no
 * tienen la llave escrita. Sin este paso, el administrador de una cuenta se
 * encuentra de un día para otro con un 403 en su propio cockpit.
 *
 * Es **solo aditivo** y **idempotente**: nunca retira nada y repetirlo no
 * cambia nada. A partir de ahí lo administra el Anfitrión desde la matriz de
 * roles como cualquier otro permiso.
 *
 * Excepción explícita: Superadmin no recibe nada. Su acceso no viene de un
 * permiso, viene de su bypass (`lib/permissions-core.ts`), así que copiarle
 * claves solo escribiría en el rol más privilegiado de la plataforma.
 */

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
 * Qué permiso de administración le corresponde a este rol por lo que era, y
 * solo si le falta. Devuelve vacío cuando no hay nada que heredar.
 */
export function permisosQueHereda(
  permisos: Permisos | null | undefined,
  nombreRol?: string | null
): PermisoConcedido[] {
  const nombre = (nombreRol || '').trim().toLowerCase();
  if (nombre === 'superadmin') return [];
  if (!NOMBRES_QUE_ADMINISTRABAN.includes(nombre)) return [];

  return tiene(permisos, LLAVE_DE_ADMINISTRACION.modulo, LLAVE_DE_ADMINISTRACION.accion)
    ? []
    : [LLAVE_DE_ADMINISTRACION];
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
