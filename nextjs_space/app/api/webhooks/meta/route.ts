export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'

// Webhook para Facebook Messenger e Instagram
export async function GET(request: NextRequest) {
  // Verificación del webhook
  const searchParams = request.nextUrl.searchParams
  const mode = searchParams.get('hub.mode')
  const token = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  // El verify token debe configurarse en las variables de entorno
  const VERIFY_TOKEN = process.env.META_VERIFY_TOKEN || 'volkern_verify_token'

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    return new NextResponse(challenge, { status: 200 })
  }

  return new NextResponse('Forbidden', { status: 403 })
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // Meta envía eventos en este formato
    // https://developers.facebook.com/docs/messenger-platform/webhooks
    if (body.object === 'page' || body.object === 'instagram') {
      for (const entry of body.entry) {
        for (const messagingEvent of entry.messaging || []) {
          // Mensaje entrante
          if (messagingEvent.message) {
            const senderId = messagingEvent.sender.id
            const messageText = messagingEvent.message.text || ''
            const platform = body.object === 'instagram' ? 'instagram' : 'facebook'

            // Buscar o crear conversación
            let conversacion = await prisma.conversation.findFirst({
              where: {
                contactoTelefono: senderId, // Usamos el PSID/Instagram ID
                canal: platform,
              },
            })

            if (!conversacion) {
              conversacion = await prisma.conversation.create({
                data: {
                  contactoNombre: `Usuario ${platform}`,
                  contactoTelefono: senderId,
                  canal: platform,
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
                canal: platform,
                estado: 'recibido',
                metadatos: {
                  messageId: messagingEvent.message.mid,
                  senderId: senderId,
                  timestamp: messagingEvent.timestamp,
                },
              },
            })
          }
        }
      }
    }

    return NextResponse.json({ status: 'ok' })
  } catch (error) {
    console.error('Error en webhook de Meta:', error)
    return NextResponse.json({ error: 'Error procesando webhook' }, { status: 500 })
  }
}
