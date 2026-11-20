/**
 * Context Manager del agente conversacional (Etapa B).
 *
 * Sustituye el uso de `chatbotAuditLog` como memoria de trabajo: el resumen,
 * las entidades activas y el contexto pendiente viven en
 * `AgentConversationContext`, con `tenantId` real y claves sintéticas que no
 * mezclan conversaciones, usuarios ni tenants.
 *
 * Ventana: los últimos 10 turnos van completos al modelo; a partir de 20
 * turnos, lo anterior se resume de forma determinista para no disparar el
 * coste ni la latencia del LLM en el camino caliente.
 */

import { prisma } from '@/lib/db'
import { logger } from '@/lib/logger'
import { cargarHistorialDeConversacion, type MensajeDeHistorial } from './conversation-history'

/** Turnos que viajan completos al modelo. */
export const TURNOS_VENTANA = 10
/** A partir de cuántos turnos se resume la parte anterior a la ventana. */
export const TURNOS_RESUMEN = 20
/** Mensajes de la ventana: un turno son dos mensajes (usuario + agente). */
export const MENSAJES_VENTANA = TURNOS_VENTANA * 2
/** Un turno resumido son dos mensajes; el doble de la ventana activa. */
export const MENSAJES_RESUMEN = TURNOS_RESUMEN * 2

/** Cuánto vive el contexto pendiente del flujo determinista. */
export const TTL_PENDIENTE_MS = 5 * 60 * 1000

export interface EntidadActiva {
  /** Id real del registro en el CRM; sin id no es una entidad resuelta. */
  id?: string
  /** Nombre o título legible para el modelo. */
  etiqueta: string
}

/** Entidades de trabajo de la conversación (persona/propiedad/oportunidad/tarea). */
export interface EntidadesActivas {
  persona?: EntidadActiva
  propiedad?: EntidadActiva
  oportunidad?: EntidadActiva
  tarea?: EntidadActiva
}

export interface ResumenConversacion {
  texto: string
  /** Cuántos mensajes quedaron resumidos (fuera de la ventana). */
  mensajesResumidos: number
  actualizadoEn: string
}

export interface ContextoDeConversacion {
  historial: MensajeDeHistorial[]
  resumen: string | null
  entidadesActivas: EntidadesActivas
}

const claveDeConversacion = (channelId: string) => `conversacion:${channelId}`
const claveDePendiente = (userId: string) => `pendiente:${userId}`

/**
 * Quita surrogates UTF-16 sin pareja. Prisma no puede serializarlos en un campo
 * Json y rechaza la escritura entera (`InvalidArg: unexpected end of hex
 * escape`); un recorte que parte un emoji por la mitad los produce.
 */
function sinSurrogatesSueltos(texto: string): string {
  return texto.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '')
}

/** Normaliza y recorta a `max` caracteres sin dejar un emoji partido. */
function recortar(texto: string, max: number): string {
  return sinSurrogatesSueltos(texto.replace(/\s+/g, ' ').trim().slice(0, max))
}

/** Resumen determinista de los mensajes que quedan fuera de la ventana. */
export function resumirMensajes(mensajes: Array<{ role: string; content: string }>): ResumenConversacion {
  const plano = mensajes.map((m) => String(m.content || '')).filter(Boolean)
  const primero = recortar(plano[0] || '', 160)
  const ultimo = recortar(plano[plano.length - 1] || '', 160)

  return {
    texto: [
      `Resumen de ${plano.length} mensajes anteriores (la ventana reciente va completa).`,
      primero ? `Inicio: «${primero}»` : '',
      ultimo ? `Último tema antes de la ventana: «${ultimo}»` : '',
    ]
      .filter(Boolean)
      .join(' '),
    mensajesResumidos: plano.length,
    actualizadoEn: new Date().toISOString(),
  }
}

/**
 * Carga el contexto de una conversación: historial (últimos 10 turnos),
 * resumen (si el hilo supera 20 turnos) y entidades activas persistidas.
 *
 * Todas las lecturas van filtradas por `tenantId` y por el canal: no se leen
 * mensajes de otra conversación ni de otro tenant aunque llegue un id ajeno.
 */
export async function cargarContextoDeConversacion(params: {
  channelId: string
  tenantId: string
  userId: string
}): Promise<ContextoDeConversacion> {
  const { channelId, tenantId, userId } = params

  const [historial, total, fila] = await Promise.all([
    cargarHistorialDeConversacion({ channelId, tenantId }),
    prisma.chatMessage.count({ where: { channelId, tenantId, deletedAt: null } }),
    prisma.agentConversationContext.findUnique({ where: { clave: claveDeConversacion(channelId) } }),
  ])

  let resumen = (fila?.resumen as ResumenConversacion | null)?.texto ?? null

  // A partir de 20 turnos, la parte anterior a la ventana se resume. Se
  // persiste para no recalcular en cada mensaje; si cambió la cola, se repite.
  if (total > MENSAJES_RESUMEN) {
    const antiguos = await prisma.chatMessage.findMany({
      where: { channelId, tenantId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      skip: MENSAJES_VENTANA,
      take: 200,
      select: { content: true, senderId: true },
    })
    const resumido = resumirMensajes(
      antiguos.map((m) => ({ role: m.senderId ? 'user' : 'assistant', content: m.content }))
    )
    resumen = resumido.texto
    await persistir(claveDeConversacion(channelId), tenantId, userId, {
      resumen: resumido,
      entidades: fila?.entidades,
      pendiente: fila?.pendiente,
    })
  }

  return {
    historial,
    resumen,
    entidadesActivas: (fila?.entidades as EntidadesActivas | null) ?? {},
  }
}

/**
 * Actualiza las entidades activas de la conversación. Cada tipo se sobrescribe
 * con la última resuelta; los tipos no mencionados se conservan.
 */
export async function registrarEntidadesActivas(params: {
  channelId: string
  tenantId: string
  userId: string
  entidades: EntidadesActivas
}): Promise<void> {
  const { channelId, tenantId, userId, entidades } = params
  const clave = claveDeConversacion(channelId)
  const fila = await prisma.agentConversationContext.findUnique({ where: { clave } })

  const actuales = (fila?.entidades as EntidadesActivas | null) ?? {}
  const mezcladas: EntidadesActivas = { ...actuales, ...entidades }
  // La etiqueta viene del modelo: se limpia antes de guardarla en un Json.
  for (const tipo of Object.keys(mezcladas) as Array<keyof EntidadesActivas>) {
    const entidad = mezcladas[tipo]
    if (entidad?.etiqueta) mezcladas[tipo] = { ...entidad, etiqueta: sinSurrogatesSueltos(entidad.etiqueta) }
  }

  await persistir(clave, tenantId, userId, {
    resumen: fila?.resumen,
    entidades: mezcladas,
    pendiente: fila?.pendiente,
  })
}

/**
 * Guarda el contexto pendiente del flujo determinista (intención + parámetros
 * que faltan). Sustituye la fila `ctx_<userId>` que se escribía en
 * `chatbotAuditLog` con `tenantId: 'pending'`.
 */
export async function guardarContextoPendiente(params: {
  userId: string
  tenantId: string
  pendiente: unknown
}): Promise<void> {
  const { userId, tenantId, pendiente } = params
  await persistir(claveDePendiente(userId), tenantId, userId, {
    resumen: undefined,
    entidades: undefined,
    pendiente,
  })
}

/** Lee el contexto pendiente si aún no ha caducado; si caducó, lo limpia. */
export async function obtenerContextoPendiente(params: {
  userId: string
  tenantId: string
}): Promise<unknown> {
  const { userId, tenantId } = params
  const fila = await prisma.agentConversationContext.findUnique({
    where: { clave: claveDePendiente(userId) },
  })

  if (!fila || !fila.pendiente) return null
  if (!fila.tenantId || fila.tenantId !== tenantId) return null

  const vigente = Date.now() - fila.updatedAt.getTime() < TTL_PENDIENTE_MS
  if (!vigente) {
    await limpiarContextoPendiente({ userId })
    return null
  }

  return fila.pendiente
}

export async function limpiarContextoPendiente(params: {
  userId: string
}): Promise<void> {
  const { userId } = params
  await prisma.agentConversationContext
    .delete({ where: { clave: claveDePendiente(userId) } })
    .catch(() => {})
}

/**
 * Upsert sin depender de `upsert` del cliente (el doble en memoria no lo trae).
 *
 * El contexto es una caché derivada que se recalcula en cada turno: si la
 * escritura falla, se avisa en el log y el turno continúa. Dejarlo propagar
 * dejaba al usuario sin respuesta por un detalle de persistencia.
 */
async function persistir(
  clave: string,
  tenantId: string,
  userId: string,
  datos: { resumen?: any; entidades?: any; pendiente?: any }
): Promise<void> {
  try {
    const existente = await prisma.agentConversationContext.findUnique({ where: { clave } })
    if (existente) {
      await prisma.agentConversationContext.update({ where: { clave }, data: datos })
    } else {
      await prisma.agentConversationContext.create({ data: { clave, tenantId, userId, ...datos } })
    }
  } catch (e) {
    logger.warn(
      { err: e, event: 'agent_context_persist_failed', clave, tenantId },
      'No se pudo guardar el contexto de la conversación; el turno continúa'
    )
  }
}

/** Bloque para el prompt del modelo con las entidades ya identificadas. */
export function bloqueDeEntidades(entidades: EntidadesActivas): string {
  const lineas: string[] = []
  const orden: Array<[keyof EntidadesActivas, string]> = [
    ['persona', 'persona'],
    ['propiedad', 'propiedad'],
    ['oportunidad', 'oportunidad/negocio'],
    ['tarea', 'tarea'],
  ]
  for (const [tipo, nombre] of orden) {
    const entidad = entidades[tipo]
    if (entidad?.etiqueta) {
      lineas.push(`- ${nombre}: ${entidad.etiqueta}${entidad.id ? ` (${entidad.id})` : ''}`)
    }
  }
  if (!lineas.length) return ''
  return ['Entidades activas de esta conversación (ya identificadas):', ...lineas].join('\n')
}
