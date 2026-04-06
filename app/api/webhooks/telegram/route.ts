export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    
    // Telegram envía actualizaciones en este formato
    // https://core.telegram.org/bots/api#update
    if (body.message) {
      const { message } = body
      const chatId = message.chat.id.toString()
      const senderName = message.from.first_name + (message.from.last_name ? ` ${message.from.last_name}` : '')
      const messageText = message.text || ''

      // Buscar o crear conversación
      let conversacion = await prisma.conversation.findFirst({
        where: {
          contactoTelefono: chatId, // Usamos el chatId como identificador
          canal: 'telegram',
        },
      })

      if (!conversacion) {
        conversacion = await prisma.conversation.create({
          data: {
            contactoNombre: senderName,
            contactoTelefono: chatId,
            canal: 'telegram',
            estado: 'abierta',
            ultimoMensaje: messageText.substring(0, 100),
            fechaUltimoMensaje: new Date(),
            noLeidos: 1,
          },
        })
      } else {
        await prisma.conversation.update({
          where: { id: conversacion.id },
          data: {
            ultimoMensaje: messageText.substring(0, 100),
            fechaUltimoMensaje: new Date(),
            noLeidos: { increment: 1 },
          },
        })
      }

      // Guardar mensaje
      await prisma.message.create({
        data: {
          conversationId: conversacion.id,
          contenido: messageText,
          direccion: 'entrante',
          canal: 'telegram',
          estado: 'recibido',
          metadatos: {
            messageId: message.message_id,
            chatId: chatId,
            senderId: message.from.id,
          },
        },
      })
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Error en webhook de Telegram:', error)
    return NextResponse.json({ error: 'Error procesando webhook' }, { status: 500 })
  }
}
