/**
 * Permisos de las herramientas del agente CRM.
 *
 * El modelo elige qué herramienta llamar, pero **no decide si puede**: la
 * comprobación se hace aquí, en backend, con el rol del usuario leído de la BD
 * y la misma lógica que el resto de la app (`hasPermisoDeRol` sobre el JSON
 * `role.permisos`). No hay un sistema de permisos nuevo.
 *
 * Regla de diseño: **denegar por defecto**. Una herramienta sin política
 * declarada no se ejecuta, así que añadir una al agente obliga a decidir su
 * permiso.
 */
import { prisma } from '@/lib/db';
import { hasPermisoDeRol, type PermissionAction } from '@/lib/permissions-core';

/**
 * Las tareas y las notas cuelgan del lead en este modelo (`Task.leadId`,
 * `Note.leadId`), así que todo se autoriza en el módulo `leads`: quien puede
 * editar la ficha puede anotar y crear seguimiento; quien solo la consulta, no.
 */
const MODULO = 'leads' as const;

export const PERMISOS_HERRAMIENTAS = {
  buscar_persona: 'ver',
  crear_lead: 'crear',
  registrar_interaccion: 'editar',
  crear_nota: 'editar',
  crear_tarea: 'editar',
  completar_tarea: 'editar',
  reprogramar_tarea: 'editar',
} as const satisfies Record<string, PermissionAction>;

export type HerramientaCrm = keyof typeof PERMISOS_HERRAMIENTAS;

export interface ResultadoPermiso {
  permitido: boolean;
  /** Motivo legible para el log y para explicar al usuario por qué no se hizo. */
  motivo?: string;
}

export interface RolDeUsuario {
  /** `null` si el usuario no existe en el tenant o no tiene rol. */
  role: { id: string; nombre: string; permisos?: unknown } | null;
  /** Distingue «no pertenece al tenant» de «sin rol» para el log. */
  existe: boolean;
}

/**
 * Lee el rol del usuario **una vez por turno** (no una vez por herramienta).
 *
 * La búsqueda va **con** `tenantId`: un id de usuario de otro tenant no
 * resuelve (`existe: false`) y se deniega, aunque el rol exista.
 */
export async function cargarRolDeUsuario(params: {
  userId: string;
  tenantId: string;
}): Promise<RolDeUsuario> {
  const usuario = await prisma.user.findFirst({
    where: { id: params.userId, tenantId: params.tenantId },
    select: { role: { select: { id: true, nombre: true, permisos: true } } },
  });

  return { existe: Boolean(usuario), role: usuario?.role ?? null };
}

/**
 * ¿Puede este rol ejecutar esta herramienta? Función pura: se puede llamar
 * tantas veces como herramientas ejecute el mensaje sin volver a la BD.
 */
export function evaluarPermisoHerramienta(
  herramienta: string,
  { role, existe }: RolDeUsuario
): ResultadoPermiso {
  const accion = PERMISOS_HERRAMIENTAS[herramienta as HerramientaCrm];
  if (!accion) {
    return { permitido: false, motivo: `herramienta sin política de permisos: ${herramienta}` };
  }

  if (!role) {
    return {
      permitido: false,
      motivo: existe ? 'el usuario no tiene rol asignado' : 'el usuario no pertenece a este tenant',
    };
  }

  if (!hasPermisoDeRol(role, MODULO, accion)) {
    return {
      permitido: false,
      motivo: `el rol "${role.nombre}" no tiene ${MODULO}.${accion}`,
    };
  }

  return { permitido: true };
}
