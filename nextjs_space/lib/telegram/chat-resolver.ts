/**
 * Resuelve los `chatId` del panel de estado del webhook al contacto/lead/usuario
 * real detrás de cada uno, para no mostrar solo el id crudo.
 *
 * Cómo se resuelve según el canal:
 *   - Telegram: a) un User cuyo `metadata.telegram_chat_id` / `metadata.telegram.chat_id`
 *     coincide (el `/start u_<userId>_<token>` vincula el chat al usuario);
 *     b) si no, un Lead con `externalContactRef === "telegram:<chatId>"`.
 *   - Evolution/WhatsApp: un Lead o Contact cuyo `telefono` termina en el chatId
 *     (el remoteJid puede venir con `@s.whatsapp.net` o con ceros a la izquierda).
 *
 * Si no se encuentra nada (p.ej. chats de prueba o no vinculados), se devuelve
 * el id crudo tal cual.
 */

import { prisma } from '@/lib/db'

export interface ChatIdentity {
  /** Nombre legible (usuario, lead o contacto) o el chatId si no se pudo resolver. */
  name: string
  /** Tipo de identidad resuelta, o null si no se resolvió. */
  kind: 'user' | 'lead' | 'contact' | null
}

function normalizePhone(raw: string): string {
  // Quita todo lo que no sea dígito (país + número). p.ej. 5214499880002@s.whatsapp.net
  return raw.replace(/\D/g, '')
}

async function resolveTelegram(nameMap: Map<string, string>, chatId: string): Promise<string | null> {
  // 1) User vinculado por /start (metadata.telegram_chat_id o metadata.telegram.chat_id)
  const users = await prisma.user.findMany({
    where: {
      OR: [{ metadata: { path: ['telegram_chat_id'], equals: chatId } }],
    },
    select: { id: true, name: true, metadata: true as any },
  })

  // Prisma JSON filtering por metadata anidado es propenso; recorremos también
  // en memoria por si acaso la clave varía (telegram_chat_id plano o telegram.chat_id).
  for (const u of users) {
    const meta = (u.metadata as any) || {}
    const flat = meta.telegram_chat_id
    const nested = meta.telegram?.chat_id
    if (String(flat) === chatId || String(nested) === chatId) {
      nameMap.set(u.id, u.name)
      if (u.name) return u.name
    }
  }

  // 2) Lead con externalContactRef "telegram:<chatId>" (conversación abierta)
  const lead = await prisma.lead.findFirst({
    where: { externalContactRef: `telegram:${chatId}` },
    select: { nombre: true },
  })
  if (lead?.nombre) return lead.nombre

  return null
}

async function resolveWhatsApp(chatId: string): Promise<string | null> {
  const digits = normalizePhone(chatId)
  if (!digits) return null

  // 1) Contacto cuyo teléfono termina en el id (puede tener distinto formateo)
  const contact = await prisma.contact.findFirst({
    where: { telefono: { contains: digits } },
    select: { nombre: true },
  })
  const contactName = contact?.nombre?.trim()
  if (contactName) return contactName

  // 2) Lead con el mismo teléfono
  const lead = await prisma.lead.findFirst({
    where: { telefono: { contains: digits } },
    select: { nombre: true },
  })
  const leadName = lead?.nombre?.trim()
  if (leadName) return leadName

  return null
}

/**
 * Devuelve un mapa chatId → { name, kind } para los chats dados.
 * Los chatbots / id de tenant (p.ej. administración) no se resuelven y
 * devuelven el id crudo.
 */
export async function resolveChatIdentities(
  channel: 'telegram' | 'evolution',
  chatIds: string[]
): Promise<Map<string, ChatIdentity>> {
  const result = new Map<string, ChatIdentity>()

  // Evita consultas innecesarias (vinculación /start del bot, ids numéricos de tenant)
  for (const chatId of chatIds) {
    if (!chatId) {
      result.set(chatId, { name: chatId, kind: null })
      continue
    }
    let resolved: string | null = null
    try {
      if (channel === 'telegram') {
        const nameMap = new Map<string, string>()
        resolved = await resolveTelegram(nameMap, chatId)
      } else {
        resolved = await resolveWhatsApp(chatId)
      }
    } catch (e) {
      // Si la consulta falla, no romper el panel: se muestra el id crudo.
      console.warn(`[ChatResolver] No se pudo resolver ${chatId}:`, (e as Error).message)
      resolved = null
    }

    if (resolved) {
      result.set(chatId, { name: resolved, kind: channel === 'telegram' ? 'user' : 'contact' })
    } else {
      result.set(chatId, { name: chatId, kind: null })
    }
  }

  return result
}