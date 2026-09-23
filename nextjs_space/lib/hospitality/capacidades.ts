/**
 * Capacidades de Hospitality → permisos por acción del rol (§27 del plan maestro).
 *
 * El módulo del plan (`Tenant.enabledModules`) dice si la cuenta tiene
 * Hospitality contratado; no dice quién puede hacer qué dentro. Eso lo decide
 * el rol, y hasta ahora ninguna ruta lo comprobaba: cualquier usuario del
 * tenant podía cancelar una reserva o ver los ingresos. Aquí vive la
 * traducción entre lo que la API ofrece y lo que el rol concede.
 *
 * Las capacidades se nombran como las nombra el producto (reservas, limpieza,
 * mantenimiento, integraciones, finanzas) y cada una apunta a un par
 * módulo + acción del sistema de permisos que ya existe en la plataforma. No
 * hay un segundo sistema de permisos: se reutiliza `hasPermission`, con sus
 * reglas de Superadmin y del wildcard `{ all: true }`.
 *
 * Regla de oro de este archivo: **si falta el permiso, se deniega**. Un rol
 * sin claves de Hospitality no puede nada; el acceso de los roles que ya
 * existían se conservó con un retrollenado explícito, no con un "si no hay
 * claves, dejo pasar".
 *
 * Y una segunda regla, hija de la anterior: **la capacidad privilegiada no
 * viaja en el conjunto completo**. Ver más abajo.
 */

/**
 * Este módulo es el **único** lugar donde se decide qué capacidad tiene un rol,
 * y no importa nada de servidor: lo usa tanto la guardia de la API como la
 * interfaz, para que no puedan discrepar.
 */
import {
  hasPermisoDeRol,
  type PermissionAction,
  type PermissionModule,
  type UserWithRole,
} from '@/lib/permissions-core';

/** El rol de la sesión, tal y como lo entrega la API (`/api/users/me`). */
export type RolConPermisos = NonNullable<UserWithRole['role']>;

/**
 * Capacidades de Hospitality. El nombre es `área.acción` para que el mensaje
 * de error diga algo útil sin tener que consultar el código.
 */
export type CapacidadHospitality =
  // Reservas y todo lo que las hace posibles: planning, bloqueos, propiedades,
  // unidades, tarifas, huéspedes y el registro de viajeros de la reserva.
  | 'reservas.ver'
  | 'reservas.crear'
  | 'reservas.editar'
  | 'reservas.cancelar'
  // El huésped no es un rol recortado: es otra puerta. `reservas.ver` enseña
  // las reservas del tenant entero; esta enseña solo las del contacto al que
  // está vinculado el usuario. Si compartieran capacidad, no habría forma de
  // dar acceso al huésped sin abrirle la casa entera.
  | 'reservas.propias'
  // Ver el número de documento sin enmascarar. Es un privilegio sobre datos
  // personales, no una consecuencia de poder ver la reserva.
  | 'viajeros.documento_completo'
  // Limpieza, preparación de unidades y check-in/check-out. El check-in es una
  // capacidad aparte porque quien limpia una habitación no es, por eso, quien
  // entrega las llaves.
  | 'operaciones.ver'
  | 'operaciones.gestionar'
  | 'operaciones.checkin'
  // Incidencias y mantenimiento de unidades.
  | 'mantenimiento.ver'
  | 'mantenimiento.gestionar'
  // Conectividad: canales, mapping, sync, reconciliación y onboarding.
  | 'integraciones.ver'
  | 'integraciones.gestionar'
  // Instalar el certificado de la entidad y las credenciales del registro de
  // viajeros. Es la **identidad con la que el tenant firma ante el Ministerio**:
  // configurar un canal y firmar en nombre del propietario no son el mismo
  // acto, y por eso no es la misma llave.
  | 'integraciones.administrar'
  // Dinero.
  | 'finanzas.ver'
  | 'finanzas.gestionar'
  | 'finanzas.exportar'
  // Comunicaciones al huésped y automatizaciones de Hospitality. Tienen módulo
  // propio en vez de reutilizar `mensajes` y `automatizaciones` de la
  // plataforma: son las plantillas y los flujos del alojamiento, y concederlos
  // no debería conceder también las campañas de marketing.
  | 'comunicaciones.ver'
  | 'comunicaciones.gestionar'
  | 'comunicaciones.enviar'
  | 'automatizaciones.ver'
  | 'automatizaciones.gestionar'
  // Quién reparte los permisos dentro de Hospitality. Es la única capacidad que
  // se concede a sí misma: sin ella, el Anfitrión no podría nombrar a nadie.
  | 'roles.gestionar';

export interface DefinicionCapacidad {
  /** Módulo del sistema de permisos que la concede. */
  modulo: PermissionModule;
  /** Acción del módulo que la concede. */
  accion: PermissionAction;
  /** Cómo se llama la capacidad en la interfaz y en los mensajes. */
  etiqueta: string;
  /**
   * Privilegio que no se reparte con el conjunto completo del retrollenado:
   * tocar la identidad del tenant ante el Ministerio, ver documentos sin
   * enmascarar, repartir permisos o entrar como huésped. Se conceden a mano y
   * a sabiendas.
   */
  privilegiada?: boolean;
}

export const CAPACIDADES_HOSPITALITY: Record<CapacidadHospitality, DefinicionCapacidad> = {
  'reservas.ver': {
    modulo: 'hospitality_reservas',
    accion: 'ver',
    etiqueta: 'ver reservas, planning y bloqueos',
  },
  'reservas.crear': {
    modulo: 'hospitality_reservas',
    accion: 'crear',
    etiqueta: 'crear reservas, propiedades, unidades, tarifas y huéspedes',
  },
  'reservas.editar': {
    modulo: 'hospitality_reservas',
    accion: 'editar',
    etiqueta: 'modificar reservas, bloqueos, propiedades, unidades, tarifas y viajeros',
  },
  'reservas.cancelar': {
    modulo: 'hospitality_reservas',
    accion: 'cancelar',
    etiqueta: 'cancelar reservas',
  },
  'reservas.propias': {
    modulo: 'hospitality_misreservas',
    accion: 'ver',
    etiqueta: 'ver únicamente sus propias reservas',
    privilegiada: true,
  },
  'viajeros.documento_completo': {
    modulo: 'hospitality_reservas',
    accion: 'documento_completo',
    etiqueta: 'ver los documentos de los viajeros sin enmascarar',
    privilegiada: true,
  },
  'operaciones.ver': {
    modulo: 'hospitality_operaciones',
    accion: 'ver',
    etiqueta: 'ver limpieza, llegadas y salidas del día',
  },
  'operaciones.gestionar': {
    modulo: 'hospitality_operaciones',
    accion: 'gestionar',
    etiqueta: 'gestionar la limpieza y la preparación de las unidades',
  },
  'operaciones.checkin': {
    modulo: 'hospitality_operaciones',
    accion: 'checkin',
    etiqueta: 'hacer check-in y check-out de los huéspedes',
  },
  'mantenimiento.ver': {
    modulo: 'hospitality_mantenimiento',
    accion: 'ver',
    etiqueta: 'ver incidencias y mantenimiento',
  },
  'mantenimiento.gestionar': {
    modulo: 'hospitality_mantenimiento',
    accion: 'gestionar',
    etiqueta: 'gestionar incidencias y mantenimiento',
  },
  'integraciones.ver': {
    modulo: 'hospitality_integraciones',
    accion: 'ver',
    etiqueta: 'ver la conectividad y el estado de sincronización',
  },
  'integraciones.gestionar': {
    modulo: 'hospitality_integraciones',
    accion: 'gestionar',
    etiqueta: 'configurar canales, mapping, sincronización y reconciliación',
  },
  'integraciones.administrar': {
    modulo: 'hospitality_integraciones',
    accion: 'administrar',
    etiqueta: 'instalar el certificado de la entidad y las credenciales del registro de viajeros',
    privilegiada: true,
  },
  'finanzas.ver': {
    modulo: 'hospitality_finanzas',
    accion: 'ver',
    etiqueta: 'ver finanzas, reportes y los indicadores de ingresos',
  },
  'finanzas.gestionar': {
    modulo: 'hospitality_finanzas',
    accion: 'gestionar',
    etiqueta: 'registrar cobros y líneas de importe',
  },
  'finanzas.exportar': {
    modulo: 'hospitality_finanzas',
    accion: 'exportar',
    etiqueta: 'exportar reportes',
  },
  'comunicaciones.ver': {
    modulo: 'hospitality_comunicaciones',
    accion: 'ver',
    etiqueta: 'ver las plantillas de comunicación',
  },
  'comunicaciones.gestionar': {
    modulo: 'hospitality_comunicaciones',
    accion: 'editar',
    etiqueta: 'editar las plantillas de comunicación',
  },
  'comunicaciones.enviar': {
    modulo: 'hospitality_comunicaciones',
    accion: 'enviar',
    etiqueta: 'enviar mensajes a huéspedes',
  },
  'automatizaciones.ver': {
    modulo: 'hospitality_automatizaciones',
    accion: 'ver',
    etiqueta: 'ver las automatizaciones de Hospitality',
  },
  'automatizaciones.gestionar': {
    modulo: 'hospitality_automatizaciones',
    accion: 'gestionar',
    etiqueta: 'crear y ejecutar automatizaciones de Hospitality',
  },
  'roles.gestionar': {
    modulo: 'equipo',
    accion: 'roles',
    etiqueta: 'crear y cambiar los roles de Hospitality',
    privilegiada: true,
  },
};

/**
 * Permisos que un rol necesita para no perder nada de lo que hoy puede hacer en
 * Hospitality. Lo usa el retrollenado `scripts/backfill-hospitality-permissions.ts`:
 * hasta ahora ninguna ruta comprobaba el rol, así que el acceso de los roles
 * existentes era, de hecho, completo. Al volver a comprobarlo, se les concede
 * explícitamente y el administrador decide después qué recortar.
 *
 * **Las capacidades privilegiadas no están aquí.** Si lo estuvieran, el
 * retrollenado repartiría el certificado de la entidad, los documentos sin
 * enmascarar y la facultad de repartir permisos a cualquier rol que se
 * retrollenara —justo lo que el módulo intenta evitar—. Se conceden a mano, o
 * con el paso aparte que copia el privilegio que hoy se tenía por nombre de
 * rol (`lib/hospitality/roles-rollout.ts`).
 */
export const PERMISOS_HOSPITALITY_COMPLETOS: Record<string, Record<string, boolean>> = {
  hospitality_reservas: { ver: true, crear: true, editar: true, cancelar: true },
  hospitality_operaciones: { ver: true, gestionar: true, checkin: true },
  hospitality_mantenimiento: { ver: true, gestionar: true },
  hospitality_integraciones: { ver: true, gestionar: true },
  hospitality_finanzas: { ver: true, gestionar: true, exportar: true },
  hospitality_comunicaciones: { ver: true, editar: true, enviar: true },
  hospitality_automatizaciones: { ver: true, gestionar: true },
};

/** Todas las capacidades, para inventarios, guardias y documentos. */
export const TODAS_LAS_CAPACIDADES = Object.keys(
  CAPACIDADES_HOSPITALITY
) as CapacidadHospitality[];

/** Las que el retrollenado nunca reparte: se conceden a mano y a sabiendas. */
export const CAPACIDADES_PRIVILEGIADAS = TODAS_LAS_CAPACIDADES.filter(
  (capacidad) => CAPACIDADES_HOSPITALITY[capacidad].privilegiada === true
);


/**
 * ¿Puede este rol ejercer la capacidad? Sin rol, sin permiso.
 *
 * Es la regla en una línea: la interfaz llama aquí para decidir si muestra una
 * acción y la API llama aquí para decidir si la acepta.
 */
export function puedePorRol(
  rol: RolConPermisos | null | undefined,
  capacidad: CapacidadHospitality
): boolean {
  const definicion = CAPACIDADES_HOSPITALITY[capacidad];
  if (!definicion) return false;
  return hasPermisoDeRol(rol ?? null, definicion.modulo, definicion.accion);
}

/*
 * Las tres decisiones que no son «una acción, una capacidad»: hay un endpoint
 * que hace dos cosas y el permiso lo decide el caso. Viven aquí, y no en la
 * guardia de la API, porque **las dos capas tienen que resolverlo igual**: la
 * interfaz esconde el botón con esta función y la API lo rechaza con esta misma
 * función. Este módulo es puro (no importa nada de servidor), así que lo puede
 * usar un componente de cliente.
 */

/**
 * Una tarea de operaciones no es lo mismo que una incidencia. El endpoint de
 * tareas atiende las dos, así que el permiso lo decide el tipo pedido.
 */
export function capacidadDeTarea(tipo: unknown): CapacidadHospitality {
  return tipo === 'maintenance' ? 'mantenimiento.gestionar' : 'operaciones.gestionar';
}

/** Lo mismo para la lectura del listado de tareas. */
export function capacidadDeLecturaDeTarea(tipo: unknown): CapacidadHospitality {
  return tipo === 'maintenance' ? 'mantenimiento.ver' : 'operaciones.ver';
}

/**
 * Cambiar una reserva no es cancelarla. Un rol puede corregir fechas o importe
 * sin poder anular la reserva de un cliente, y al revés.
 */
export function capacidadDeCambioDeReserva(
  estadoNuevo: unknown,
  estadoActual: unknown
): CapacidadHospitality {
  if (estadoNuevo === 'cancelled' && estadoActual !== 'cancelled') {
    return 'reservas.cancelar';
  }
  return 'reservas.editar';
}
