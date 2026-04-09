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

      // ============================================
      // Comando /start - Configurar notificaciones
      // ============================================
      if (messageText === '/start') {
        // Buscar integración de Telegram y guardar admin_chat_id
        const tenants = await prisma.tenant.findMany({
          where: { estado: 'activo' },
          select: { id: true }
        })
        
        for (const tenant of tenants) {
          const integration = await prisma.integration.findFirst({
            where: { tenantId: tenant.id, tipo: 'telegram', activo: true },
            select: { id: true, credenciales: true, nombre: true }
          })
          
          if (integration?.credenciales) {
            const creds = integration.credenciales as any
            // Actualizar admin_chat_id
            await prisma.integration.update({
              where: { id: integration.id },
              data: {
                credenciales: {
                  ...creds,
                  admin_chat_id: chatId
                }
              }
            })
            
            console.log(`[Telegram] Admin chat_id configurado: ${chatId} para tenant ${tenant.id}`)
            
            return NextResponse.json({
              method: 'sendMessage',
              chat_id: chatId,
              text: `✅ *¡Configuración completa!*\n\nAhora recibirás notificaciones de Volkern en este chat.\n\n📱 *Tu Chat ID:* \`${chatId}\``
            })
          }
        }
        
        // No se encontró ninguna integración
        return NextResponse.json({
          method: 'sendMessage',
          chat_id: chatId,
          text: `⚠️ No se encontró una integración de Telegram configurada.`
        })
      }

      // ============================================
      // Guardar conversación (flujo normal)
      // ============================================
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
