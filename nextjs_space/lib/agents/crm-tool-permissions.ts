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
import {
  hasPermisoDeRol,
  type PermissionAction,
  type PermissionModule,
} from '@/lib/permissions-core';

/**
 * Cada herramienta declara **su** módulo, porque el agente toca más de uno.
 *
 * - Tareas y notas cuelgan del lead (`Task.leadId`, `Note.leadId`): se
 *   autorizan en `leads`, igual que la ficha. Quien puede editarla puede
 *   anotar y crear seguimiento; quien solo la consulta, no.
 * - `buscar_propiedades` lee `CatalogoItem`, que es el catálogo de la cuenta
 *   (inmuebles, productos y servicios) y tiene su propia llave. Autorizarla
 *   con `leads.ver` dejaba ver la cartera a quien solo tenía el pipeline.
 */
export interface PoliticaHerramienta {
  modulo: PermissionModule;
  accion: PermissionAction;
}

/** Mapa de políticas: cada herramienta expuesta declara módulo y acción. */
export type PoliticasHerramientas = Record<string, PoliticaHerramienta>;

export const PERMISOS_HERRAMIENTAS = {
  buscar_persona: { modulo: 'leads', accion: 'ver' },
  buscar_propiedades: { modulo: 'catalogo', accion: 'ver' },
  crear_lead: { modulo: 'leads', accion: 'crear' },
  registrar_interaccion: { modulo: 'leads', accion: 'editar' },
  crear_nota: { modulo: 'leads', accion: 'editar' },
  crear_tarea: { modulo: 'leads', accion: 'editar' },
  completar_tarea: { modulo: 'leads', accion: 'editar' },
  reprogramar_tarea: { modulo: 'leads', accion: 'editar' },
} as const satisfies Record<string, PoliticaHerramienta>;

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
  { role, existe }: RolDeUsuario,
  /** Políticas a consultar; por defecto, las nativas del agente. */
  politicas: PoliticasHerramientas = PERMISOS_HERRAMIENTAS
): ResultadoPermiso {
  const politica = politicas[herramienta];
  if (!politica) {
    return { permitido: false, motivo: `herramienta sin política de permisos: ${herramienta}` };
  }

  if (!role) {
    return {
      permitido: false,
      motivo: existe ? 'el usuario no tiene rol asignado' : 'el usuario no pertenece a este tenant',
    };
  }

  const { modulo, accion } = politica;
  if (!hasPermisoDeRol(role, modulo, accion)) {
    return {
      permitido: false,
      motivo: `el rol "${role.nombre}" no tiene ${modulo}.${accion}`,
    };
  }

  return { permitido: true };
}
