export const dynamic = 'force-dynamic';

/**
 * Webhook receiver para eventos de Evolution API
 * Documentación: https://doc.evolution-api.com/v1/en/configuration/webhooks#instance-webhook-events
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import {
  ensureChatwootInboxForInstance,
  extractOwnerProfileFromConnection,
  getProfileInfo
} from '@/lib/evolution-instances';

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

    // Evolution envía los eventos en minúsculas con puntos (messages.upsert,
    // connection.update, qrcode.updated...); normalizar a MAYÚSCULAS_CON_GUION
    // para que el switch los procese.
    const event = String(body.event || '').toUpperCase().replace(/\./g, '_');

    console.log('📨 Webhook recibido para instancia:', instanceName);
    console.log('📦 Evento:', body.event, '→ normalizado:', event);
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
    switch (event) {
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

          // Si se conectó, limpiar el QR code y persistir número/perfil del
          // propietario (Evolution envía `phone` y `name` en CONNECTION_UPDATE)
          const profile = extractOwnerProfileFromConnection(body.data);
          const updateData: any = {
            status: newStatus,
            fechaConexion: new Date(),
            qrCode: null,
            qrCodeExpiry: null
          };
          if (profile.phoneNumber) updateData.phoneNumber = profile.phoneNumber;
          if (profile.profileName) updateData.profileName = profile.profileName;
          if (profile.profilePicUrl) updateData.profilePicUrl = profile.profilePicUrl;

          await prisma.userWhatsAppInstance.update({
            where: { id: instance.id },
            data: updateData
          });
          console.log('✅ Instancia conectada exitosamente');

          // Backfill: si el payload no trajo el número, consultarlo a Evolution
          // (getProfileInfo también persiste nombre/foto en la BD)
          const current = await prisma.userWhatsAppInstance.findUnique({
            where: { id: instance.id },
            select: { phoneNumber: true, profileName: true }
          });
          if (!current?.phoneNumber || !current?.profileName) {
            try {
              await getProfileInfo(instance.instanceName);
            } catch (profileError) {
              console.warn('⚠️ No se pudo obtener el perfil del propietario:', profileError);
            }
          }

          // Conectar el canal a Chatwoot con el número real del propietario
          console.log('🔗 Conectando instancia a Chatwoot...');
          const chatwootResult = await ensureChatwootInboxForInstance(instance.instanceName);
          console.log('📦 Chatwoot inbox result:', chatwootResult);
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

        // 🔄 PUENTE ENTRANTE: mensaje de un contacto → sincronizar en la bandeja
        // local de Volkern (lead + conversación + mensaje) y crear la conversación
        // en Chatwoot para que el agente la vea (canal API + REST).
        if (!body.data?.key?.fromMe) {
          try {
            const remoteJid = body.data?.key?.remoteJid || '';
            const textContent =
              body.data?.message?.conversation ||
              body.data?.message?.extendedTextMessage?.text ||
              body.data?.message?.imageMessage?.caption ||
              body.data?.message?.documentMessage?.caption ||
              body.data?.message?.videoMessage?.caption ||
              '';
            const fromName = body.data?.pushName || '';

            if (remoteJid && textContent) {
              const phoneNumber = remoteJid.replace('@s.whatsapp.net', '').replace('@g.us', '');
              const cleanPhone = phoneNumber.replace(/[\s\-\()]/g, '');

              // ── Sincronización local (bandeja de Volkern) ──
              let lead = await prisma.lead.findFirst({
                where: { tenantId: instance.tenantId, telefono: { contains: cleanPhone.slice(-10) } },
              });
              if (!lead) {
                lead = await prisma.lead.create({
                  data: {
                    tenantId: instance.tenantId,
                    nombre: fromName || `WhatsApp ${cleanPhone.slice(-4)}`,
                    telefono: phoneNumber,
                    email: `wa-${cleanPhone.slice(-10)}@temp.volkern.com`,
                    fuente: 'whatsapp-evolution',
                    estado: 'nuevo',
                    scoreValue: 30,
                  },
                });
              }

              let localConversation = await prisma.conversation.findFirst({
                where: { leadId: lead.id, canal: 'whatsapp', tenantId: instance.tenantId },
              });
              if (!localConversation) {
                localConversation = await prisma.conversation.create({
                  data: {
                    tenantId: instance.tenantId,
                    leadId: lead.id,
                    contactoNombre: lead.nombre,
                    contactoTelefono: phoneNumber,
                    canal: 'whatsapp',
                    estado: 'abierta',
                    ultimoMensaje: textContent,
                    fechaUltimoMensaje: new Date(),
                    noLeidos: 1,
                    externalRef: `evolution_${cleanPhone.slice(-10)}`,
                  },
                });
              } else {
                await prisma.conversation.update({
                  where: { id: localConversation.id },
                  data: {
                    ultimoMensaje: textContent,
                    fechaUltimoMensaje: new Date(),
                    noLeidos: { increment: 1 },
                    estado: 'abierta',
                  },
                });
              }

              const externalRef = `evolution_msg_${body.data?.key?.id || Date.now()}`;
              const existingMsg = await prisma.message.findUnique({ where: { externalRef } }).catch(() => null);
              if (!existingMsg) {
                await prisma.message.create({
                  data: {
                    conversationId: localConversation.id,
                    contenido: textContent,
                    direccion: 'entrante',
                    canal: 'whatsapp',
                    estado: 'entregado',
                    externalRef,
                    metadatos: {
                      evolutionMessageId: body.data?.key?.id,
                      evolutionInstance: instance.instanceName,
                      fromNumber: phoneNumber,
                      fromName,
                    },
                  },
                });
                console.log('✅ Mensaje entrante guardado localmente:', localConversation.id);
              }

              // ── Sincronización a Chatwoot (agente lo ve en la bandeja del hub) ──
              const channel = await prisma.channel.findFirst({
                where: { tenantId: instance.tenantId, type: 'whatsapp' },
              });
              const hubConfig = await prisma.messagingHubConfig.findUnique({
                where: { tenantId: instance.tenantId },
              });

              if (channel?.chatwootInboxId && hubConfig?.chatwootAccountId) {
                const { chatwootApi } = await import('@/lib/nexus/chatwoot-api');
                const accountToken = await chatwootApi.ensureBotUserInAccount(hubConfig.chatwootAccountId);
                const conversation = await chatwootApi.getOrCreateConversation(
                  hubConfig.chatwootAccountId,
                  channel.chatwootInboxId,
                  phoneNumber,
                  accountToken,
                );
                await chatwootApi.sendMessage(
                  hubConfig.chatwootAccountId,
                  conversation.id,
                  textContent,
                  accountToken,
                  { messageType: 'incoming' },
                );
                console.log('✅ Mensaje entrante sincronizado a Chatwoot:', conversation.id);
              } else {
                console.log('⚠️ Sin canal/hub Chatwoot configurado aún para sincronizar mensaje');
              }

              // 🔔 Emitir evento para que el chatbot procese la respuesta entrante
              try {
                const { eventBus, EVENTS } = await import('@/lib/skills/event-bus');
                eventBus.emitEvent(EVENTS.MESSAGE_RECEIVED as any, {
                  tenantId: instance.tenantId,
                  messageId: body.data?.key?.id || String(Date.now()),
                  conversationId: localConversation.id,
                  content: textContent,
                  canal: 'whatsapp',
                  source: 'evolution',
                  timestamp: new Date(),
                  metadata: {
                    sender_type: 'contact',
                    channel_type: 'whatsapp',
                    contact: {
                      name: fromName || lead.nombre,
                      phone: phoneNumber,
                    },
                    localConversationId: localConversation.id,
                  },
                } as any);
              } catch (eventErr) {
                console.error('❌ Error emitiendo evento MESSAGE_RECEIVED:', eventErr);
              }
            }
          } catch (bridgeError) {
            console.error('❌ Error sincronizando mensaje entrante:', bridgeError);
          }
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
