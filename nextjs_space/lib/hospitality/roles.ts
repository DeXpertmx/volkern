/**
 * Los roles de Hospitality (§27 del plan maestro).
 *
 * El módulo no se organiza con los nombres genéricos de la plataforma —Admin,
 * Sales Agent— porque en una propiedad los trabajos no son esos. Quien
 * administra el alojamiento es el **Anfitrión**; quien limpia es Limpieza;
 * quien arregla, Mantenimiento; la empresa que gestiona por encargo es el
 * **Agente**; y el **Huésped** es el cliente, que solo puede ver lo suyo.
 *
 * Aquí está **la definición**, una sola vez: qué capacidades tiene cada rol y
 * qué rol puede tocarse. El retrollenado, la interfaz y las guardias leen de
 * este archivo, así que no puede haber dos versiones de "qué es un Anfitrión".
 *
 * Dos reglas que este catálogo hace cumplir:
 *
 * 1. **El nombre no decide nada.** Los permisos sí. `Superadmin` sigue siendo
 *    la única excepción, y es deliberada: es la salida de emergencia que deja
 *    recuperable a un tenant que se quede sin nadie que administre.
 * 2. **Las capacidades privilegiadas no se reparten solas.** Ver
 *    `CAPACIDADES_HOSPITALITY` en `capacidades.ts`.
 */
import {
  CAPACIDADES_HOSPITALITY,
  puedePorRol,
  type CapacidadHospitality,
  type RolConPermisos,
} from './capacidades';

export type RolHospitalityId = 'anfitrion' | 'agente' | 'mantenimiento' | 'limpieza' | 'huesped';

export interface DefinicionRolHospitality {
  id: RolHospitalityId;
  /** El nombre con el que el rol nace en el tenant. */
  nombre: string;
  /** Qué hace este rol, en una frase, para quien lo asigna sin conocer el código. */
  descripcion: string;
  capacidades: readonly CapacidadHospitality[];
  /**
   * El rol es parte del vocabulario del producto: se puede ajustar qué
   * capacidades tiene, pero no renombrarlo ni borrarlo, porque hay reglas y
   * mensajes que lo nombran.
   */
  protegido: boolean;
}

/**
 * El catálogo. El orden es el de la interfaz: primero quien administra, luego
 * quien opera por encargo, después los oficios y al final el huésped.
 */
export const ROLES_HOSPITALITY: readonly DefinicionRolHospitality[] = [
  {
    id: 'anfitrion',
    nombre: 'Anfitrión',
    descripcion:
      'Administra la propiedad entera: reservas, operaciones, dinero, canales y quién puede entrar al módulo.',
    capacidades: [
      'reservas.ver',
      'reservas.crear',
      'reservas.editar',
      'reservas.cancelar',
      'viajeros.documento_completo',
      'operaciones.ver',
      'operaciones.gestionar',
      'operaciones.checkin',
      'mantenimiento.ver',
      'mantenimiento.gestionar',
      'integraciones.ver',
      'integraciones.gestionar',
      'integraciones.administrar',
      'finanzas.ver',
      'finanzas.gestionar',
      'finanzas.exportar',
      'comunicaciones.ver',
      'comunicaciones.gestionar',
      'comunicaciones.enviar',
      'automatizaciones.ver',
      'automatizaciones.gestionar',
      'roles.gestionar',
    ],
    protegido: true,
  },
  {
    id: 'agente',
    nombre: 'Agente',
    descripcion:
      'La empresa administradora: lleva la operación, las reservas y los cobros del día a día, sin poder firmar en nombre del propietario ni repartir permisos.',
    capacidades: [
      'reservas.ver',
      'reservas.crear',
      'reservas.editar',
      'reservas.cancelar',
      'operaciones.ver',
      'operaciones.gestionar',
      'operaciones.checkin',
      'mantenimiento.ver',
      'mantenimiento.gestionar',
      'integraciones.ver',
      'integraciones.gestionar',
      'finanzas.ver',
      'finanzas.gestionar',
      'finanzas.exportar',
      'comunicaciones.ver',
      'comunicaciones.gestionar',
      'comunicaciones.enviar',
      'automatizaciones.ver',
    ],
    protegido: true,
  },
  {
    id: 'mantenimiento',
    nombre: 'Mantenimiento',
    descripcion:
      'Abre y cierra incidencias y ve el día de la propiedad para saber por dónde puede entrar a trabajar.',
    capacidades: ['operaciones.ver', 'mantenimiento.ver', 'mantenimiento.gestionar'],
    protegido: true,
  },
  {
    id: 'limpieza',
    nombre: 'Limpieza',
    descripcion:
      'Ve las llegadas y salidas del día y marca las limpiezas. No entrega llaves ni ve dinero ni documentos.',
    capacidades: ['operaciones.ver', 'operaciones.gestionar'],
    protegido: true,
  },
  {
    id: 'huesped',
    nombre: 'Huésped',
    descripcion:
      'El cliente: entra al módulo y ve únicamente las reservas del contacto al que está vinculado. Sin vínculo, no ve ninguna.',
    capacidades: ['reservas.propias'],
    protegido: true,
  },
] as const;

/** Los nombres del vocabulario del producto, para mensajes y guardias. */
export const NOMBRES_ROLES_HOSPITALITY: readonly string[] = ROLES_HOSPITALITY.map((r) => r.nombre);

/**
 * Los módulos del sistema de permisos que tocan Hospitality. Un rol cuyos
 * permisos incluyen alguno de estos es un rol de Hospitality, y por tanto cae
 * bajo su regla de quién puede cambiarlo.
 */
export const MODULOS_HOSPITALITY: readonly string[] = [
  'hospitality_reservas',
  'hospitality_operaciones',
  'hospitality_mantenimiento',
  'hospitality_integraciones',
  'hospitality_finanzas',
  'hospitality_comunicaciones',
  'hospitality_automatizaciones',
  'hospitality_misreservas',
];

/** Una entrada por rol del catálogo, indexada por nombre. */
export const ROL_HOSPITALITY_POR_NOMBRE: Record<string, DefinicionRolHospitality> =
  Object.fromEntries(ROLES_HOSPITALITY.map((rol) => [rol.nombre, rol]));

/** ¿Este nombre es uno de los roles del vocabulario de Hospitality? */
export function esNombreDeRolHospitality(nombre: string | null | undefined): boolean {
  return !!nombre && Object.prototype.hasOwnProperty.call(ROL_HOSPITALITY_POR_NOMBRE, nombre);
}

/** La definición del catálogo para un nombre, si la hay. */
export function definicionDeRol(nombre: string | null | undefined): DefinicionRolHospitality | null {
  if (!nombre) return null;
  return ROL_HOSPITALITY_POR_NOMBRE[nombre] ?? null;
}

/**
 * Los permisos tal y como se guardan en `Role.permisos`: módulo → acción → true.
 *
 * Se compone a partir de las capacidades, no al revés, para que no exista una
 * segunda lista de permisos que pueda divergir del catálogo.
 */
export function permisosDeRol(
  id: RolHospitalityId
): Record<string, Record<string, boolean>> {
  const definicion = ROLES_HOSPITALITY.find((rol) => rol.id === id);
  const permisos: Record<string, Record<string, boolean>> = {};
  if (!definicion) return permisos;

  for (const capacidad of definicion.capacidades) {
    const { modulo, accion } = CAPACIDADES_HOSPITALITY[capacidad];
    permisos[modulo] = { ...(permisos[modulo] ?? {}), [accion]: true };
  }
  return permisos;
}

/**
 * ¿Los permisos de este rol tocan Hospitality? Lo decide el retrollenado para
 * no pisar los roles de otros verticales, y la guardia de roles para saber si
 * hace falta la capacidad de administrarlos.
 */
export function permisosTocanHospitality(permisos: unknown): boolean {
  if (!permisos || typeof permisos !== 'object') return false;
  const claves = Object.keys(permisos as Record<string, unknown>);

  // `{ all: true }` concede todo, y eso incluye Hospitality.
  if ((permisos as { all?: unknown }).all === true) return true;

  return claves.some((clave) => MODULOS_HOSPITALITY.includes(clave));
}

/**
 * ¿Es este uno de los roles del vocabulario y además lleva capacidades del
 * módulo? Las dos cosas, y en ese orden.
 *
 * El nombre solo no basta: «Agente» es una palabra corriente —una correduría de
 * seguros tiene agentes— y bloquear por nombre un rol que no toca Hospitality
 * sería repetir el error que este trabajo viene a corregir. Los permisos son los
 * que dicen de qué va un rol.
 */
export function esRolDeCatalogoEnUso(
  nombre: string | null | undefined,
  permisos: unknown
): boolean {
  return esNombreDeRolHospitality(nombre) && permisosTocanHospitality(permisos);
}

/**
 * ¿Puede este rol cambiar los roles de Hospitality?
 *
 * Una sola pregunta, una sola respuesta: la misma que ve la interfaz para
 * enseñar o esconder el botón. Quien no la tenga verá el 403 con el permiso
 * exacto que le falta, no un botón que no explica nada.
 */
export function puedeGestionarRolesDeHospitality(rol: RolConPermisos | null | undefined): boolean {
  return puedePorRol(rol, 'roles.gestionar');
}
