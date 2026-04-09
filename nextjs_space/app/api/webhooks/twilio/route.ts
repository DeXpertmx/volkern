export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    
    // Twilio envía los datos como form data
    // https://www.twilio.com/docs/sms/twiml#twilios-request-to-your-application
    const from = formData.get('From') as string
    const body = formData.get('Body') as string
    const messageSid = formData.get('MessageSid') as string

    if (!from || !body) {
      return NextResponse.json({ error: 'Datos faltantes' }, { status: 400 })
    }

    // Buscar o crear conversación
    let conversacion = await prisma.conversation.findFirst({
      where: {
        contactoTelefono: from,
        canal: 'sms',
      },
    })

    if (!conversacion) {
      conversacion = await prisma.conversation.create({
        data: {
          contactoNombre: from,
          contactoTelefono: from,
          canal: 'sms',
          estado: 'abierta',
          ultimoMensaje: body.substring(0, 100),
          fechaUltimoMensaje: new Date(),
          noLeidos: 1,
        },
      })
    } else {
      await prisma.conversation.update({
        where: { id: conversacion.id },
        data: {
          ultimoMensaje: body.substring(0, 100),
          fechaUltimoMensaje: new Date(),
          noLeidos: { increment: 1 },
        },
      })
    }

    // Guardar mensaje
    await prisma.message.create({
      data: {
        conversationId: conversacion.id,
        contenido: body,
        direccion: 'entrante',
        canal: 'sms',
        estado: 'recibido',
        metadatos: {
          messageSid: messageSid,
          from: from,
        },
      },
    })

    // Responder a Twilio (TwiML vacío = sin respuesta automática)
    return new NextResponse('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
      headers: { 'Content-Type': 'text/xml' },
    })
  } catch (error) {
    console.error('Error en webhook de Twilio:', error)
    return NextResponse.json({ error: 'Error procesando webhook' }, { status: 500 })
  }
}
