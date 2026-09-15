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
 */
import { NextResponse } from 'next/server';
import {
  hasPermission,
  type PermissionAction,
  type PermissionModule,
  type UserWithRole,
} from '@/lib/permissions';
import type { ApiKeyAuthResult } from '@/lib/api-key-auth';

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
  // Limpieza y check-in/check-out: el trabajo del día en la propiedad.
  | 'operaciones.ver'
  | 'operaciones.gestionar'
  // Incidencias y mantenimiento de unidades.
  | 'mantenimiento.ver'
  | 'mantenimiento.gestionar'
  // Conectividad: canales, mapping, sync, reconciliación y onboarding.
  | 'integraciones.ver'
  | 'integraciones.gestionar'
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
  | 'automatizaciones.gestionar';

export interface DefinicionCapacidad {
  /** Módulo del sistema de permisos que la concede. */
  modulo: PermissionModule;
  /** Acción del módulo que la concede. */
  accion: PermissionAction;
  /** Cómo se llama la capacidad en la interfaz y en los mensajes. */
  etiqueta: string;
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
  'operaciones.ver': {
    modulo: 'hospitality_operaciones',
    accion: 'ver',
    etiqueta: 'ver limpieza, llegadas y salidas del día',
  },
  'operaciones.gestionar': {
    modulo: 'hospitality_operaciones',
    accion: 'gestionar',
    etiqueta: 'gestionar limpieza y check-in/check-out',
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
};

/**
 * Permisos que un rol necesita para no perder nada de lo que hoy puede hacer en
 * Hospitality. Lo usa el retrollenado `scripts/hospitality-permissions-backfill.mjs`:
 * hasta ahora ninguna ruta comprobaba el rol, así que el acceso de los roles
 * existentes era, de hecho, completo. Al volver a comprobarlo, se les concede
 * explícitamente y el administrador decide después qué recortar.
 */
export const PERMISOS_HOSPITALITY_COMPLETOS: Record<string, Record<string, boolean>> = {
  hospitality_reservas: { ver: true, crear: true, editar: true, cancelar: true },
  hospitality_operaciones: { ver: true, gestionar: true },
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

/**
 * ¿Puede esta sesión ejercer la capacidad? Sin rol, sin permiso.
 */
export function puedeEnHospitality(
  auth: Pick<ApiKeyAuthResult, 'user'>,
  capacidad: CapacidadHospitality
): boolean {
  const definicion = CAPACIDADES_HOSPITALITY[capacidad];
  if (!definicion) return false;
  return hasPermission(
    (auth.user as UserWithRole | undefined) ?? null,
    definicion.modulo,
    definicion.accion
  );
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
