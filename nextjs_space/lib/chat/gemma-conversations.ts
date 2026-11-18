import { prisma } from '@/lib/db'

/**
 * Conversaciones de Gemma
 * -----------------------
 * Cada conversación es un `ChatChannel` privado por usuario. El nombre del
 * canal codifica el dueño y el título para poder listar el historial sin
 * migraciones ni columnas nuevas:
 *
 *     gemma-chat:<userId>:<título>
 *
 * El prefijo identifica al dueño; lo que sigue es el título visible. Los
 * canales históricos (`chat-agente-<userId>`) se renombran la primera vez que
 * se listan para que su historial no se pierda.
 */

const NAME_PREFIX = 'gemma-chat:'

export const channelPrefix = (userId: string) => `${NAME_PREFIX}${userId}:`

const legacyChannelName = (userId: string) => `chat-agente-${userId}`

/** ¿El canal pertenece al usuario? (formato nuevo o histórico) */
export function ownsChannelName(name: string | null | undefined, userId: string): boolean {
  if (!name) return false
  return name.startsWith(channelPrefix(userId)) || name === legacyChannelName(userId)
}

/** Título corto a partir del primer mensaje del usuario. */
export function tituloDesde(texto: string): string {
  const limpio = String(texto || '').replace(/\s+/g, ' ').trim()
  if (!limpio) return 'Nueva conversación'
  return limpio.length > 60 ? `${limpio.slice(0, 57)}…` : limpio
}

/** Renombra el canal histórico al formato nuevo (idempotente). */
async function migrateLegacyChannel(userId: string, tenantId: string): Promise<void> {
  const legacy = await prisma.chatChannel.findFirst({
    where: { tenantId, name: legacyChannelName(userId), type: 'private' },
    select: { id: true },
  })
  if (!legacy) return
  await prisma.chatChannel.update({
    where: { id: legacy.id },
    data: { name: `${channelPrefix(userId)}Conversación anterior` },
  })
}

export interface ConversationSummary {
  id: string
  titulo: string
  preview: string
  actualizado: Date
}

/** Historial del usuario, de la conversación más reciente a la más antigua. */
export async function listConversations(userId: string, tenantId: string): Promise<ConversationSummary[]> {
  await migrateLegacyChannel(userId, tenantId)

  const canales = await prisma.chatChannel.findMany({
    where: {
      tenantId,
      type: 'private',
      name: { startsWith: channelPrefix(userId) },
      messages: { some: { deletedAt: null } },
    },
    orderBy: { updatedAt: 'desc' },
    take: 60,
    include: {
      messages: {
        where: { deletedAt: null },
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { content: true, createdAt: true },
      },
    },
  })

  return canales.map((canal) => ({
    id: canal.id,
    titulo: canal.name.slice(channelPrefix(userId).length).trim() || 'Nueva conversación',
    preview: (canal.messages[0]?.content || '').replace(/\s+/g, ' ').slice(0, 90),
    actualizado: canal.messages[0]?.createdAt ?? canal.updatedAt,
  }))
}

/** Crea una conversación vacía y devuelve su id. */
export async function createConversation(userId: string, tenantId: string): Promise<{ id: string }> {
  const canal = await prisma.chatChannel.create({
    data: { tenantId, name: channelPrefix(userId), type: 'private' },
    select: { id: true },
  })
  return { id: canal.id }
}

/**
 * Resuelve la conversación activa:
 *  - con `conversationId`, la valida y comprueba que sea del usuario;
 *  - sin id, devuelve la más reciente con mensajes;
 *  - si no hay ninguna, crea una (salvo `createIfMissing: false`).
 * Devuelve `null` cuando el id no existe o no pertenece al usuario.
 */
export async function resolveConversation(opts: {
  userId: string
  tenantId: string
  conversationId?: string | null
  createIfMissing?: boolean
}): Promise<string | null> {
  const { userId, tenantId, conversationId } = opts

  if (conversationId) {
    const canal = await prisma.chatChannel.findFirst({
      where: { id: conversationId, tenantId, type: 'private' },
      select: { id: true, name: true },
    })
    if (!canal || !ownsChannelName(canal.name, userId)) return null
    return canal.id
  }

  await migrateLegacyChannel(userId, tenantId)

  const reciente = await prisma.chatChannel.findFirst({
    where: {
      tenantId,
      type: 'private',
      name: { startsWith: channelPrefix(userId) },
      messages: { some: { deletedAt: null } },
    },
    orderBy: { updatedAt: 'desc' },
    select: { id: true },
  })
  if (reciente) return reciente.id
  if (opts.createIfMissing === false) return null

  const { id } = await createConversation(userId, tenantId)
  return id
}

/** Marca actividad en la conversación para ordenar el historial. */
export async function touchConversation(id: string): Promise<void> {
  try {
    await prisma.chatChannel.update({ where: { id }, data: { updatedAt: new Date() } })
  } catch {
    /* el orden del historial no debe romper el envío del mensaje */
  }
}
