export const dynamic = 'force-dynamic';

/**
 * Webhook receiver para eventos de Evolution API
 * Documentación: https://doc.evolution-api.com/v1/en/configuration/webhooks#instance-webhook-events
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';

/**
 * POST - Recibir eventos de Evolution API
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { instanceName: string } }
) {
  try {
    const instanceName = params.instanceName;
    const body = await request.json();

    console.log('📨 Webhook recibido para instancia:', instanceName);
    console.log('📦 Evento:', body.event);
    console.log('📄 Datos completos:', JSON.stringify(body, null, 2));

    // Buscar la instancia en la base de datos
    const instance = await prisma.userWhatsAppInstance.findFirst({
      where: { instanceName }
    });

    if (!instance) {
      console.log('⚠️ Instancia no encontrada en BD:', instanceName);
      console.log('💡 Esto puede ser normal si la instancia fue eliminada');
      // Respondemos 200 para que Evolution no reintente
      return NextResponse.json({ 
        success: true, 
        message: 'Instancia no encontrada en BD',
        instanceName 
      });
    }

    console.log('✅ Instancia encontrada en BD:', instance.id);

    // Procesar según el tipo de evento
    switch (body.event) {
      case 'QRCODE_UPDATED':
        console.log('🔍 Procesando QRCODE_UPDATED...');
        // Actualizar QR code en la base de datos
        // Evolution API puede enviar el QR en diferentes formatos
        let qrBase64 = null;
        
        if (body.data?.qrcode?.base64) {
          qrBase64 = body.data.qrcode.base64;
        } else if (body.data?.qrcode) {
          qrBase64 = body.data.qrcode;
        } else if (body.data?.base64) {
          qrBase64 = body.data.base64;
        } else if (body.data?.code) {
          qrBase64 = body.data.code;
        }

        if (qrBase64) {
          await prisma.userWhatsAppInstance.update({
            where: { id: instance.id },
            data: {
              qrCode: qrBase64,
              qrCodeExpiry: new Date(Date.now() + 60000),
              status: 'connecting'
            }
          });
          console.log('✅ QR Code actualizado vía webhook');
        } else {
          console.log('⚠️ No se encontró QR code en el payload');
        }
        break;

      case 'CONNECTION_UPDATE':
        console.log('🔍 Procesando CONNECTION_UPDATE...');
        // Actualizar estado de conexión
        // Evolution API puede enviar el estado en diferentes campos
        const state = body.data?.state || body.data?.status || body.data?.connection;
        console.log('🔄 Estado de conexión recibido:', state);
        console.log('🔍 Estructura completa de data:', JSON.stringify(body.data, null, 2));
        
        let newStatus = 'disconnected';
        if (state === 'open' || state === 'connected') {
          newStatus = 'connected';
          
          // Si se conectó, limpiar el QR code
          await prisma.userWhatsAppInstance.update({
            where: { id: instance.id },
            data: {
              status: newStatus,
              fechaConexion: new Date(),
              qrCode: null,
              qrCodeExpiry: null
            }
          });
          console.log('✅ Instancia conectada exitosamente');
          
          // Intentar obtener info del perfil
          console.log('📱 Intentando obtener info del perfil...');
        } else if (state === 'connecting') {
          newStatus = 'connecting';
          await prisma.userWhatsAppInstance.update({
            where: { id: instance.id },
            data: { status: newStatus }
          });
          console.log('⏳ Instancia en proceso de conexión');
        } else if (state === 'close' || state === 'closed' || state === 'disconnected') {
          newStatus = 'disconnected';
          await prisma.userWhatsAppInstance.update({
            where: { id: instance.id },
            data: { status: newStatus }
          });
          console.log('⚠️ Instancia desconectada');
        } else {
          console.log('❓ Estado desconocido:', state);
        }
        break;

      case 'MESSAGES_UPSERT':
        console.log('🔍 Procesando MESSAGES_UPSERT...');
        // Mensaje nuevo recibido o enviado
        console.log('💬 Mensaje:', body.data);
        
        // Actualizar contador de mensajes si el mensaje fue enviado por esta instancia
        if (body.data?.key?.fromMe) {
          await prisma.userWhatsAppInstance.update({
            where: { id: instance.id },
            data: {
              totalMensajes: { increment: 1 },
              ultimoMensaje: new Date()
            }
          });
          console.log('✅ Contador de mensajes actualizado');
        }
        break;

      case 'MESSAGES_UPDATE':
        console.log('🔍 Procesando MESSAGES_UPDATE...');
        console.log('📝 Actualización de mensaje:', body.data);
        break;

      case 'MESSAGES_DELETE':
        console.log('🔍 Procesando MESSAGES_DELETE...');
        console.log('🗑️ Mensaje eliminado:', body.data);
        break;

      case 'SEND_MESSAGE':
        console.log('🔍 Procesando SEND_MESSAGE...');
        console.log('📤 Mensaje enviado:', body.data);
        break;

      case 'MESSAGES_SET':
        console.log('🔍 Procesando MESSAGES_SET...');
        console.log('📥 Conjunto de mensajes recibido');
        break;

      default:
        console.log('ℹ️ Evento no procesado:', body.event);
        console.log('📦 Data del evento:', JSON.stringify(body.data, null, 2));
    }

    return NextResponse.json({ 
      success: true, 
      message: 'Webhook procesado correctamente',
      event: body.event,
      instanceName 
    });
  } catch (error) {
    console.error('❌ Error al procesar webhook:', error);
    console.error('❌ Stack trace:', error instanceof Error ? error.stack : 'No stack trace');
    
    // Respondemos 200 de todas formas para evitar reintentos infinitos
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : 'Error al procesar webhook',
        instanceName: params.instanceName
      },
      { status: 200 }
    );
  }
}

/**
 * GET - Información del webhook (para debugging)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { instanceName: string } }
) {
  return NextResponse.json({
    message: 'Webhook endpoint para Evolution API',
    instanceName: params.instanceName,
    url: `${process.env.NEXTAUTH_URL || 'https://volkern.app'}/api/webhook/evolution/${params.instanceName}`,
    events: [
      'QRCODE_UPDATED',
      'CONNECTION_UPDATE',
      'MESSAGES_SET',
      'MESSAGES_UPSERT',
      'MESSAGES_UPDATE',
      'MESSAGES_DELETE',
      'SEND_MESSAGE'
    ]
  });
}
