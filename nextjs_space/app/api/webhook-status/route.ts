import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getRateLimitMetrics, resetRateLimitMetrics } from '@/lib/telegram/rate-limit-metrics'
import { resolveChatIdentities } from '@/lib/telegram/chat-resolver'
import { isAdminRequest } from '@/lib/auth-helpers'

export const dynamic = 'force-dynamic'

/**
 * GET /api/webhook-status
 *
 * Métricas de rate-limit de los webhooks (Telegram + Evolution/WhatsApp):
 * cuántos mensajes se rechazan con 429 por chat y por día. Cada chatId de los
 * top chats se resuelve al contacto/lead/usuario real en BD para mostrarlo con
 * nombre en el panel.
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const metrics = await getRateLimitMetrics()
    const topChats = await resolveTopChats(metrics.topChats)
    const lastRejected = await resolveLastRejected(
      metrics.lastRejectedChatId,
      metrics.lastRejectedChannel,
      metrics.lastRejectedAt
    )
    const roleName = (session.user as any)?.roleName as string | undefined
    const isAdmin = roleName === 'Superadmin' || roleName === 'Administrador' || roleName === 'Admin'

    return NextResponse.json({
      metrics: { ...metrics, topChats, lastRejected },
      isAdmin,
      processUptime: Math.round(process.uptime()),
      processPid: process.pid,
      timestamp: new Date().toISOString(),
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * POST /api/webhook-status/reset
 *
 * Reinicia las métricas de rate-limit del día actual. Solo superadmins y
 * administradores (rota la métrica de "quién reinició" para auditoría).
 */
export async function POST(request: Request) {
  try {
    const auth = await isAdminRequest(request)
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error || 'No autorizado' }, { status: auth.error?.includes('autentic') ? 401 : 403 })
    }

    await resetRateLimitMetrics()

    console.log(`[WebhookStatus] Métricas reiniciadas por ${auth.email} (${auth.userId})`)
    return NextResponse.json({ ok: true, message: 'Métricas del día reiniciadas' })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

function channelForChatId(chatId: string): 'telegram' | 'evolution' {
  // Canal aproximado: ids largos que empiezan en 52 (código país México) = WhatsApp,
  // el resto (chat id numérico de Telegram) = Telegram.
  const isWhatsApp = /^\d{10,}$/.test(chatId) && chatId.startsWith('52')
  return isWhatsApp ? 'evolution' : 'telegram'
}

async function resolveTopChats(topChats: { chatId: string; count: number }[]): Promise<{ chatId: string; count: number; name: string }[]> {
  const topById = new Map<string, string>()
  for (const chat of topChats) {
    const channel = channelForChatId(chat.chatId)
    const identities = await resolveChatIdentities(channel, [chat.chatId])
    const name = identities.get(chat.chatId)?.name ?? chat.chatId
    topById.set(chat.chatId, name)
  }
  return topChats.map((chat) => ({
    ...chat,
    name: topById.get(chat.chatId) ?? chat.chatId,
  }))
}

/**
 * Envuelve el último rechazo con el chatId y su nombre resuelto, para que el
 * panel muestre quién fue (Bruno Hess, un lead, un contacto) y no solo la hora.
 */
async function resolveLastRejected(
  chatId: string | null,
  channel: 'telegram' | 'evolution' | null,
  at: string | null
): Promise<{ chatId: string | null; name: string | null; channel: 'telegram' | 'evolution' | null; at: string | null }> {
  if (!chatId) {
    return { chatId: null, name: null, channel, at }
  }
  const identities = await resolveChatIdentities(channel ?? channelForChatId(chatId), [chatId])
  return {
    chatId,
    name: identities.get(chatId)?.name ?? null,
    channel,
    at,
  }
}
