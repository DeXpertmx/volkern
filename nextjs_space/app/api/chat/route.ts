export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { orchestrator } from '@/lib/agents/orchestrator'
import {
  channelPrefix,
  resolveConversation,
  tituloDesde,
  touchConversation,
} from '@/lib/chat/gemma-conversations'
import { cargarHistorialDeConversacion } from '@/lib/agents/conversation-history'

/** Mensajes de una conversación (la más reciente si no se indica cuál). */
export async function GET(req: Request) {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const conversationId = new URL(req.url).searchParams.get('conversationId')
  const channelId = await resolveConversation({
    userId: session.user.id,
    tenantId: session.user.tenantId!,
    conversationId,
  })

  if (!channelId) {
    return NextResponse.json({ error: 'Conversación no encontrada' }, { status: 404 })
  }

  const messages = await prisma.chatMessage.findMany({
    where: { channelId, tenantId: session.user.tenantId!, deletedAt: null },
    orderBy: { createdAt: 'asc' },
    take: 200,
    include: { sender: { select: { id: true, name: true, email: true } } },
  })

  return NextResponse.json({
    conversationId: channelId,
    messages: messages.map((m) => ({
      id: m.id,
      role: m.senderId === session.user.id ? 'user' : 'agent',
      content: m.content,
      createdAt: m.createdAt,
      estructura: (m.metadata as any)?.estructura ?? null,
    })),
  })
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const { message, conversationId } = await req.json()

  if (!message || typeof message !== 'string') {
    return NextResponse.json({ error: 'Mensaje requerido' }, { status: 400 })
  }

  const tenantId = session.user.tenantId!
  const userId = session.user.id

  const channelId = await resolveConversation({ userId, tenantId, conversationId })

  if (!channelId) {
    return NextResponse.json({ error: 'Conversación no encontrada' }, { status: 404 })
  }

  // Antes de guardar el mensaje actual: si se leyera después, llegaría
  // duplicado al modelo. Un historial vacío significa que es el primer mensaje
  // del canal, y de ahí sale el título.
  const historial = await cargarHistorialDeConversacion({ channelId, tenantId })

  // 1. Guardar mensaje del usuario
  const userMessage = await prisma.chatMessage.create({
    data: {
      tenantId,
      channelId,
      senderId: userId,
      content: message,
    },
  })

  if (historial.length === 0) {
    await prisma.chatChannel.update({
      where: { id: channelId },
      data: { name: `${channelPrefix(userId)}${tituloDesde(message)}` },
    })
  }

  // 2. Ejecutar el orquestador para obtener la respuesta del agente
  const result = await orchestrator.process({
    message,
    userId,
    tenantId,
    chatId: channelId,
    isAuthenticated: true,
    userRole: (session.user as any).roleName,
    historial,
  })

  // 3. Guardar respuesta del agente
  const estructura = result.metadata?.estructura
  const agentMessage = await prisma.chatMessage.create({
    data: {
      tenantId,
      channelId,
      senderId: null,
      content: result.response || 'No se pudo obtener una respuesta.',
      // La salida estructurada viaja en metadata para que el chat la pinte
      // también al recargar el historial, sin tocar el contenido de texto.
      metadata: estructura ? { estructura } : {},
    },
  })

  await touchConversation(channelId)

  return NextResponse.json({
    success: true,
    conversationId: channelId,
    userMessage: {
      id: userMessage.id,
      role: 'user',
      content: userMessage.content,
      createdAt: userMessage.createdAt,
    },
    agentMessage: {
      id: agentMessage.id,
      role: 'agent',
      content: agentMessage.content,
      createdAt: agentMessage.createdAt,
      estructura: estructura ?? null,
    },
    metadata: result.metadata,
  })
}
