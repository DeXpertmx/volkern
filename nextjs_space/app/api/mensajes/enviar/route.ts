export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withTenantAuth } from '@/lib/api-key-auth'
import { sendWhatsAppMessage, sendWhatsAppMessageWithMedia } from '@/lib/whatsapp'
import { sendEmail, replaceTemplateVariables } from '@/lib/ses-email'
import { sendSMS } from '@/lib/sms'
import { sendTelegramMessage, loadTelegramCredentials } from '@/lib/telegram'
import { sendFacebookMessage, sendInstagramMessage } from '@/lib/meta-messenger'
import { getDownloadUrl } from '@/lib/s3'
import { checkFeatureLimit, incrementUsage } from '@/lib/subscription'

// POST /api/mensajes/enviar - Enviar un mensaje multicanal
export const POST = withTenantAuth(async (request, auth) => {
  try {
    const tenantId = auth.tenant!.id;
    const userId = auth.user?.id;

    const body = await request.json()
    const {
      conversationId,
      contenido,
      canal,
      destinatario, // { nombre, email?, telefono? }
      asunto, // Solo para emails
      templateId, // ID del template (opcional)
      variables, // Variables para reemplazar en el template
      mediaUrl, // URL de la imagen/archivo (opcional)
      mediaType, // Tipo de media: 'image' | 'video' | 'document' (opcional)
    } = body

    let contenidoFinal = contenido

    // 1. Manejo de Templates (Intelligent Proxy redirige a la DB del Tenant si es necesario)
    // Nota: MessageTemplate debe ser un modelo de Tenant.
    if (templateId) {
      const template = await prisma.messageTemplate.findFirst({
        where: { id: templateId } as any,
      })

      if (!template) {
        return NextResponse.json({ error: 'Template no encontrado' }, { status: 404 })
      }

      contenidoFinal = replaceTemplateVariables(template.contenido, variables || {})
    } else if (variables) {
      contenidoFinal = replaceTemplateVariables(contenido, variables)
    }

    let conversacion
    
    // 2. Obtener o crear conversación en la DB física del Tenant
    if (!conversationId) {
      // Validación básica para creación
      if (!destinatario?.nombre || !canal) {
         return NextResponse.json({ error: 'Datos de destinatario y canal requeridos' }, { status: 400 })
      }

      conversacion = await prisma.conversation.create({
        data: {
          tenantId,
          contactoNombre: destinatario.nombre,
          contactoEmail: destinatario.email,
          contactoTelefono: destinatario.telefono,
          canal,
          estado: 'abierta',
          ultimoMensaje: contenidoFinal.substring(0, 100),
          fechaUltimoMensaje: new Date(),
        },
      })
    } else {
      conversacion = await prisma.conversation.findFirst({
        where: { id: conversationId, tenantId },
      })

      if (!conversacion) {
        return NextResponse.json({ error: 'Conversación no encontrada' }, { status: 404 })
      }
    }

    // 3. Enviar mensaje según el canal
    let resultado: any
    let estado = 'enviado'
    let errorMensaje: string | undefined

    // Prioridad: Si la conversación está vinculada a Chatwoot (Hub de Comunicaciones)
    if (conversacion.externalRef?.startsWith('chatwoot_')) {
      try {
        const { syncOutgoingChatwootMessage } = await import('@/lib/skills/chatwoot-sync-skill');
        const chatwootRes = await syncOutgoingChatwootMessage({
          tenantId,
          conversationId: conversacion.id,
          content: contenidoFinal,
          messageId: 'PENDING_SYNC' // Se manejará dentro o lo actualizaremos luego
        });

        if (chatwootRes.success) {
          resultado = { success: true, messageId: chatwootRes.chatwootMessageId };
        } else {
          estado = 'error';
          errorMensaje = chatwootRes.reason || 'Error al enviar a través del Hub';
          resultado = { success: false, error: errorMensaje };
        }
      } catch (e: any) {
        estado = 'error';
        errorMensaje = e.message;
        resultado = { success: false, error: e.message };
      }
    } else if (canal === 'whatsapp') {
      if (!conversacion.contactoTelefono) {
        return NextResponse.json({ error: 'No hay número de teléfono para WhatsApp' }, { status: 400 })
      }

      if (mediaUrl) {
        let finalMediaUrl = mediaUrl
        if (mediaUrl.includes('mensajes/') && !mediaUrl.startsWith('http')) {
          finalMediaUrl = await getDownloadUrl(mediaUrl)
        }
        
        resultado = await sendWhatsAppMessageWithMedia(
          conversacion.contactoTelefono,
          contenidoFinal,
          finalMediaUrl,
          (mediaType as 'image' | 'video' | 'document') || 'image',
          tenantId
        )
      } else {
        resultado = await sendWhatsAppMessage(conversacion.contactoTelefono, contenidoFinal, tenantId)
      }
      
      if (!resultado.success) {
        estado = 'error'
        errorMensaje = resultado.error
      }
    } else if (canal === 'email') {
      if (!conversacion.contactoEmail) {
        return NextResponse.json({ error: 'No hay email para enviar' }, { status: 400 })
      }

      resultado = await sendEmail({
        to: conversacion.contactoEmail,
        subject: asunto || 'Mensaje de Volkern CRM',
        html: contenidoFinal.replace(/\n/g, '<br>'),
        text: contenidoFinal,
        tenantSubdomain: tenantId,
      })
      
      if (!resultado.success) {
        estado = 'error'
        errorMensaje = resultado.error
      }
    } else if (['sms', 'telegram', 'facebook', 'instagram'].includes(canal)) {
        // Implementación simplificada para otros canales (Siguen usando librerías existentes)
        try {
            if (canal === 'sms') {
                await sendSMS(conversacion.contactoTelefono!, contenidoFinal);
            } else if (canal === 'telegram') {
                // FIX sincronización hub→Telegram: resolver el bot_token del tenant
                // (Integration legacy → Channel moderno → env). Antes se enviaba con el
                // bot global de process.env, por lo que el mensaje no llegaba al cliente
                // cuando el tenant usa su propio bot de Telegram.
                const creds = await loadTelegramCredentials(tenantId);
                const tgResult = await sendTelegramMessage(
                    conversacion.contactoTelefono!,
                    contenidoFinal,
                    creds.bot_token || undefined,
                );
                if (!tgResult.success) {
                    estado = 'error';
                    errorMensaje = tgResult.error || 'Error enviando por Telegram';
                    resultado = { success: false, error: errorMensaje };
                }
            } else if (canal === 'facebook') {
                await sendFacebookMessage(conversacion.contactoTelefono!, contenidoFinal);
            } else if (canal === 'instagram') {
                await sendInstagramMessage(conversacion.contactoTelefono!, contenidoFinal);
            }
            // Solo marcar éxito si el canal no declaró error
            if (!resultado) {
                resultado = { success: true, messageId: `${canal}-${Date.now()}` }
            }
        } catch (e: any) {
            estado = 'error';
            errorMensaje = e.message;
            resultado = { success: false, error: e.message };
        }
    } else {
      return NextResponse.json({ error: 'Canal no soportado' }, { status: 400 })
    }

    // 4. Guardar registro del mensaje en la DB física del Tenant
    const mensaje = await prisma.message.create({
      data: {
        conversationId: conversacion.id,
        contenido: contenidoFinal,
        direccion: 'saliente',
        canal,
        estado,
        errorMensaje,
        metadatos: {
          messageId: resultado.messageId,
          asunto: asunto,
          mediaUrl: mediaUrl || undefined,
          mediaType: mediaType || undefined,
        },
      },
    })

    // Actualizar metadata de conversación
    await prisma.conversation.update({
      where: { id: conversacion.id },
      data: {
        ultimoMensaje: contenidoFinal.substring(0, 100),
        fechaUltimoMensaje: new Date(),
      },
    })

    // Track usage after successful message send
    if (estado === 'enviado') {
      try {
        let featureName: 'whatsapp_messages' | 'emails_per_month' | 'sms_messages' | 'whatsapp_messages';
        
        if (canal === 'whatsapp') {
          featureName = 'whatsapp_messages';
        } else if (canal === 'email') {
          featureName = 'emails_per_month';
        } else if (canal === 'sms') {
          featureName = 'sms_messages';
        } else {
          featureName = 'whatsapp_messages'; // Default for other channels
        }

        // Check limit before incrementing
        const limitCheck = await checkFeatureLimit(tenantId, featureName, 1);
        if (!limitCheck.allowed) {
          return NextResponse.json(
            { 
              error: `Has alcanzado el límite de ${limitCheck.limit} mensajes para tu plan`,
              code: 'LIMIT_REACHED'
            },
            { status: 403 }
          );
        }

        await incrementUsage(tenantId, featureName, 1);
      } catch (usageError) {
        console.error('[POST /mensajes/enviar] Error tracking usage:', usageError);
      }
    }

    return NextResponse.json({
      success: true,
      mensaje,
      conversacion,
      resultado,
    })
  } catch (error: any) {
    console.error('Error enviando mensaje:', error)
    return NextResponse.json(
      { error: error.message || 'Error enviando mensaje' },
      { status: 500 }
    )
  }
}, ['messages:write'])
