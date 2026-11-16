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
import { buscarMensajeEnChatwoot, enviarWhatsAppPorChatwoot } from '@/lib/chatwoot-tenant'

/**
 * Envío de WhatsApp con el Hub como camino preferente: el inbox de Chatwoot
 * es el que tiene la instancia de Evolution conectada, mientras que la
 * instancia directa del tenant puede estar desconectada. Si el hub rechaza el
 * envío de forma explícita, se cae a Evolution; si falla de forma ambigua
 * (timeout/red/5xx) se comprueba antes en el hub y, sin certeza, no se
 * reenvía: el cliente podría recibirlo dos veces.
 */
async function enviarWhatsAppConFallback(opts: {
  tenantId: string
  conversacion: any
  contenido: string
  mediaUrl?: string
  mediaType?: string
}): Promise<{ success: boolean; messageId?: string; error?: string; sinConfirmar?: boolean }> {
  const porHub = await enviarWhatsAppPorChatwoot({
    tenantId: opts.tenantId,
    conversacion: opts.conversacion,
    contenido: opts.contenido,
  })
  if (porHub.success) {
    return { success: true, messageId: porHub.messageId != null ? String(porHub.messageId) : undefined }
  }

  if (porHub.ambiguo) {
    const verificacion = await buscarMensajeEnChatwoot({
      tenantId: opts.tenantId,
      conversacion: opts.conversacion,
      contenido: opts.contenido,
      // Ventana reciente: un mensaje idéntico de hace días no es prueba de
      // que este intento haya salido.
      desde: new Date(Date.now() - 10 * 60 * 1000),
    })
    if (verificacion.encontrado) {
      return {
        success: true,
        messageId:
          verificacion.messageId != null ? String(verificacion.messageId) : undefined,
      }
    }
    return {
      success: false,
      sinConfirmar: true,
      error: `Hub: ${porHub.error || 'sin respuesta'} (sin confirmación del hub; no se envió por Evolution para no duplicar)`,
    }
  }

  let finalMediaUrl = opts.mediaUrl
  if (finalMediaUrl && finalMediaUrl.includes('mensajes/') && !finalMediaUrl.startsWith('http')) {
    finalMediaUrl = await getDownloadUrl(finalMediaUrl)
  }

  const directo = finalMediaUrl
    ? await sendWhatsAppMessageWithMedia(
        opts.conversacion.contactoTelefono,
        opts.contenido,
        finalMediaUrl,
        (opts.mediaType as 'image' | 'video' | 'document') || 'image',
        opts.tenantId
      )
    : await sendWhatsAppMessage(opts.conversacion.contactoTelefono, opts.contenido, opts.tenantId)

  if (directo.success) {
    return { success: true, messageId: directo.messageId }
  }
  return {
    success: false,
    error: `${porHub.error ? `Hub: ${porHub.error} · ` : ''}Evolution: ${directo.error}`,
  }
}

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

    // 1. Manejo de Templates. Las plantillas son por tenant: se busca también
    // por tenantId para no poder enviar el contenido de otro cliente.
    if (templateId) {
      const template = await prisma.messageTemplate.findFirst({
        where: { id: templateId, tenantId },
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
    let envioIncierto = false
    let errorMensaje: string | undefined

    // Prioridad: Si la conversación está vinculada a Chatwoot (Hub de Comunicaciones)
    if (conversacion.externalRef?.startsWith('chatwoot_')) {
      // WhatsApp: enviar por la instancia Evolution (nuevo flujo Mi WhatsApp
      // Personal o legacy) y reflejar el mensaje en Chatwoot para que el agente
      // lo vea en la bandeja. El puente entrante (webhook Evolution) crea la
      // conversación en Chatwoot; aquí cerramos el ciclo enviando al cliente.
      if (canal === 'whatsapp') {
        if (!conversacion.contactoTelefono) {
          return NextResponse.json({ error: 'No hay número de teléfono para WhatsApp' }, { status: 400 })
        }
        const envio = await enviarWhatsAppConFallback({
          tenantId,
          conversacion,
          contenido: contenidoFinal,
          mediaUrl,
          mediaType,
        })
        resultado = { success: envio.success, messageId: envio.messageId, error: envio.error }
        envioIncierto = Boolean(envio.sinConfirmar)
        if (!envio.success) {
          estado = 'error'
          errorMensaje = envio.error
        }
      } else {
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
      }
    } else if (canal === 'whatsapp') {
      if (!conversacion.contactoTelefono) {
        return NextResponse.json({ error: 'No hay número de teléfono para WhatsApp' }, { status: 400 })
      }

      const envio = await enviarWhatsAppConFallback({
        tenantId,
        conversacion,
        contenido: contenidoFinal,
        mediaUrl,
        mediaType,
      })
      resultado = { success: envio.success, messageId: envio.messageId, error: envio.error }
      envioIncierto = Boolean(envio.sinConfirmar)

      if (!envio.success) {
        estado = 'error'
        errorMensaje = envio.error
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
                // (Integration legacy → Channel moderno). Sin bot propio del tenant NO
                // se envía: el mensaje no sale por el bot global del sistema.
                const creds = await loadTelegramCredentials(tenantId);
                if (!creds.bot_token) {
                    estado = 'error';
                    errorMensaje = 'El tenant no tiene bot de Telegram propio configurado';
                    resultado = { success: false, error: errorMensaje };
                } else {
                    const tgResult = await sendTelegramMessage(
                        conversacion.contactoTelefono!,
                        contenidoFinal,
                        creds.bot_token,
                    );
                    if (!tgResult.success) {
                        estado = 'error';
                        errorMensaje = tgResult.error || 'Error enviando por Telegram';
                        resultado = { success: false, error: errorMensaje };
                    }
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
          ...(envioIncierto ? { envioIncierto: true } : {}),
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

    // Si el proveedor rechazó el envío, NO devolver 200: el mensaje queda
    // registrado en el hilo con estado "error" (evidencia en el Hub), pero la
    // UI debe enterarse de que no salió (antes se reportaba éxito y el agente
    // creía haber enviado cuando el WhatsApp estaba desconectado).
    if (estado === 'error') {
      return NextResponse.json(
        {
          success: false,
          error: errorMensaje || 'No se pudo enviar el mensaje',
          mensaje,
          conversacion,
          resultado,
        },
        { status: 502 }
      )
    }

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
