export const dynamic = 'force-dynamic';

/**
 * Webhook receiver para eventos de Evolution API
 * Documentación: https://doc.evolution-api.com/v1/en/configuration/webhooks#instance-webhook-events
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import {
  buildEvolutionWebhookUrl,
  configureWebhooks,
  ensureChatwootInboxForInstance,
  extractOwnerProfileFromConnection,
  getProfileInfo,
  isMessageKeyRecentlySent,
  refreshPlatformPhoneNumber,
  verifyEvolutionWebhookToken
} from '@/lib/evolution-instances';
import { isChatRateLimited } from '@/lib/telegram/chat-rate-limit';

// Reconfiguración automática de webhooks legacy (sin token): cooldown por
// instancia para no llamar a Evolution API en cada evento.
const reconfigureCooldownMs = 5 * 60 * 1000;
const lastReconfigureAt = new Map<string, number>();

async function reconfigureWebhookWithToken(instanceName: string): Promise<void> {
  const now = Date.now();
  const last = lastReconfigureAt.get(instanceName) ?? 0;
  if (now - last < reconfigureCooldownMs) return;
  lastReconfigureAt.set(instanceName, now);
  try {
    await configureWebhooks(instanceName, buildEvolutionWebhookUrl(instanceName));
    console.log(`🔐 Webhook de ${instanceName} reconfigurado con token firmado (migración automática)`);
  } catch (err) {
    console.warn(`⚠️ No se pudo reconfigurar el webhook de ${instanceName}:`, err);
  }
}

// Respuesta 429 explícita: Evolution API reintenta el webhook con backoff
// (WEBHOOK_RETRY_* configurado en el contenedor) y el mensaje no se pierde
// (antes un exceso de mensajes del mismo chat se procesaba sin límite y los
// errores se tragaban devolviendo 200).
function rateLimitedResponse(instanceName: string) {
  return NextResponse.json(
    {
      success: false,
      error: 'rate_limited',
      retry_after: 2,
      instanceName,
    },
    { status: 429, headers: { 'Retry-After': '2' } }
  );
}

/** Actualiza la fila de la instancia (usuario, negocio o plataforma) según su tipo. */
async function updateInstanceRow(
  inst: { id: string },
  kind: 'user' | 'tenant' | 'platform',
  data: any
) {
  if (kind === 'platform') {
    return prisma.platformWhatsAppInstance.update({ where: { id: inst.id }, data });
  }
  if (kind === 'tenant') {
    return prisma.tenantWhatsAppInstance.update({ where: { id: inst.id }, data });
  }
  return prisma.userWhatsAppInstance.update({ where: { id: inst.id }, data });
}

/** Lee la fila de la instancia (usuario, negocio o plataforma) según su tipo. */
async function readInstanceRow(
  inst: { id: string },
  kind: 'user' | 'tenant' | 'platform',
  select: any
) {
  if (kind === 'platform') {
    return prisma.platformWhatsAppInstance.findUnique({ where: { id: inst.id }, select });
  }
  if (kind === 'tenant') {
    return prisma.tenantWhatsAppInstance.findUnique({ where: { id: inst.id }, select });
  }
  return prisma.userWhatsAppInstance.findUnique({ where: { id: inst.id }, select });
}

/**
 * POST - Recibir eventos de Evolution API
 */
export async function POST(
  request: NextRequest,
  { params: paramsPromise }: { params: Promise<{ instanceName: string }> }
) {
  const params = await paramsPromise;
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

    // Buscar la instancia en la BD: primero la del usuario (Mi WhatsApp), luego
    // la del negocio (tenant) y finalmente la de la PLATAFORMA (número oficial
    // de Volkern usado para notificaciones salientes).
    const userInstance = await prisma.userWhatsAppInstance.findFirst({
      where: { instanceName }
    });
    const tenantInstance = userInstance
      ? null
      : await prisma.tenantWhatsAppInstance.findUnique({ where: { instanceName } }).catch(() => null);
    const platformInstance = userInstance || tenantInstance
      ? null
      : await prisma.platformWhatsAppInstance.findUnique({ where: { instanceName } }).catch(() => null);

    if (!userInstance && !tenantInstance && !platformInstance) {
      console.log('⚠️ Instancia no encontrada en BD:', instanceName);
      console.log('💡 Esto puede ser normal si la instancia fue eliminada');
      // Respondemos 200 para que Evolution no reintente
      return NextResponse.json({
        success: true,
        message: 'Instancia no encontrada en BD',
        instanceName,
      });
    }

    // ── AUTENTICACIÓN DEL WEBHOOK ───────────────────────────────────────────
    // El token firmado (HMAC del secreto compartido) viaja como query param
    // ?token=... en la URL del webhook. Política:
    //   · token presente y válido   → procesar normal.
    //   · token presente e inválido → 401 (posible intento de inyección).
    //   · sin token                 → modo transición (por defecto): la instancia
    //     existente aún apunta a la URL vieja (configurada antes del hardening),
    //     así que se procesa igual PERO se reconfigura su webhook con la URL
    //     firmada para que el siguiente evento venga autenticado. Si se define
    //     EVOLUTION_WEBHOOK_AUTH_REQUIRED=1, el modo transición se desactiva y
    //     se exige token siempre (usar tras confirmar que toda la flota migró).
    const token = request.nextUrl.searchParams.get('token');
    const authRequired = process.env.EVOLUTION_WEBHOOK_AUTH_REQUIRED === '1';
    if (token) {
      if (!verifyEvolutionWebhookToken(instanceName, token)) {
        console.warn(`⛔ Webhook de Evolution rechazado: token inválido para instancia ${instanceName}`);
        return NextResponse.json({ success: false, error: 'Token de webhook inválido' }, { status: 401 });
      }
    } else if (authRequired) {
      console.warn(`⛔ Webhook de Evolution rechazado: falta token para ${instanceName} (modo estricto)`);
      return NextResponse.json({ success: false, error: 'Token de webhook requerido' }, { status: 401 });
    } else {
      console.warn(`⚠️ Webhook de Evolution sin token para ${instanceName} (modo transición; se reconfigurará con token)`);
      await reconfigureWebhookWithToken(instanceName);
    }


    // ── INSTANCIA DE LA PLATAFORMA ──
    // El número oficial de Volkern solo emite notificaciones salientes: sus
    // eventos se procesan de forma independiente (estado/QR) sin tocar el
    // puente de tenant (leads/conversaciones/Chatwoot).
    if (platformInstance) {
      console.log('📢 Webhook de instancia de PLATAFORMA:', platformInstance.instanceName);
      if (event === 'QRCODE_UPDATED') {
        let pQr: string | null = null;
        if (body.data?.qrcode?.base64) pQr = body.data.qrcode.base64;
        else if (body.data?.qrcode) pQr = body.data.qrcode;
        else if (body.data?.base64) pQr = body.data.base64;
        else if (body.data?.code) pQr = body.data.code;
        if (pQr) {
          await prisma.platformWhatsAppInstance.update({
            where: { id: platformInstance.id },
            data: { qrCode: pQr, qrCodeExpiry: new Date(Date.now() + 60000), status: 'connecting' },
          });
        }
      } else if (event === 'CONNECTION_UPDATE') {
        const pState = body.data?.state || body.data?.status || body.data?.connection;
        let pStatus = 'disconnected';
        if (pState === 'open' || pState === 'connected') {
          pStatus = 'connected';
          const profile = extractOwnerProfileFromConnection(body.data);
          const pData: any = {
            status: pStatus,
            fechaConexion: new Date(),
            qrCode: null,
            qrCodeExpiry: null,
          };
          if (profile.phoneNumber) pData.phoneNumber = profile.phoneNumber;
          if (profile.profileName) pData.profileName = profile.profileName;
          if (profile.profilePicUrl) pData.profilePicUrl = profile.profilePicUrl;
          await prisma.platformWhatsAppInstance.update({ where: { id: platformInstance.id }, data: pData });
          // El payload de conexión no siempre trae el número: se consulta a
          // Evolution y se guarda, para que la ficha pueda ofrecerlo como
          // número del sistema cuando el negocio no tenga uno propio.
          if (!pData.phoneNumber) {
            await refreshPlatformPhoneNumber().catch((err) =>
              console.warn('⚠️ No se pudo recuperar el número de la plataforma:', err)
            );
          }
          console.log('✅ WhatsApp oficial de la plataforma conectado:', platformInstance.instanceName);
        } else if (pState === 'connecting') {
          pStatus = 'connecting';
          await prisma.platformWhatsAppInstance.update({
            where: { id: platformInstance.id },
            data: { status: pStatus },
          });
        } else {
          await prisma.platformWhatsAppInstance.update({
            where: { id: platformInstance.id },
            data: { status: 'disconnected' },
          });
        }
      } else {
        // MESSAGES_* en la instancia de plataforma: solo se contabiliza, no se
        // sincroniza a ningún tenant (es un número emisor de la plataforma).
        if (event === 'MESSAGES_UPSERT' || event === 'MESSAGES_UPDATE' || event === 'MESSAGES_SET') {
          await prisma.platformWhatsAppInstance.update({
            where: { id: platformInstance.id },
            data: { totalMensajes: { increment: 1 }, ultimoMensaje: new Date() },
          });
        }
      }
      return NextResponse.json({ success: true, message: 'Webhook de plataforma procesado', event: body.event, instanceName });
    }

    if (userInstance || tenantInstance) {
      const instance = (userInstance || tenantInstance) as NonNullable<typeof userInstance>;
      const kind: 'user' | 'tenant' = userInstance ? 'user' : 'tenant';

      console.log(`✅ Instancia (${kind}) encontrada en BD:`, instance.id);
      // El resto del switch (puente user/tenant) continúa a continuación.

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
          await updateInstanceRow(instance, kind, {
            qrCode: qrBase64,
            qrCodeExpiry: new Date(Date.now() + 60000),
            status: 'connecting'
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

          await updateInstanceRow(instance, kind, updateData);
          console.log('✅ Instancia conectada exitosamente');

          // Backfill: si el payload no trajo el número, consultarlo a Evolution
          // (getProfileInfo también persiste nombre/foto en la BD)
          const current = await readInstanceRow(instance, kind, { phoneNumber: true, profileName: true });
          if (!current?.phoneNumber || !current?.profileName) {
            try {
              await getProfileInfo(instance.instanceName);
            } catch (profileError) {
              console.warn('⚠️ No se pudo obtener el perfil del propietario:', profileError);
            }
          }

          // Conectar el canal a Chatwoot con el número real del propietario
          // (la instancia de la PLATAFORMA se procesa aparte, arriba: solo
          // emite notificaciones y no crea inbox de tenant).
          console.log('🔗 Conectando instancia a Chatwoot...');
          const chatwootResult = await ensureChatwootInboxForInstance(instance.instanceName, kind);
          console.log('📦 Chatwoot inbox result:', chatwootResult);
        } else if (state === 'connecting') {
          newStatus = 'connecting';
          await updateInstanceRow(instance, kind, { status: newStatus });
          console.log('⏳ Instancia en proceso de conexión');
        } else if (state === 'close' || state === 'closed' || state === 'disconnected') {
          newStatus = 'disconnected';
          await updateInstanceRow(instance, kind, { status: newStatus });
          console.log('⚠️ Instancia desconectada');
        } else {
          console.log('❓ Estado desconocido:', state);
        }
        break;

      case 'MESSAGES_UPSERT':
        console.log('🔍 Procesando MESSAGES_UPSERT...');
        console.log('💬 Mensaje:', body.data);

        // Contador de mensajes de la instancia (entrantes y salientes)
        await updateInstanceRow(instance, kind, {
          totalMensajes: { increment: 1 },
          ultimoMensaje: new Date()
        });

        // 🔄 PUENTE BIDIRECCIONAL: mensajes de un contacto (entrantes) Y
        // mensajes enviados desde el propio WhatsApp (salientes, fromMe) se
        // sincronizan en la bandeja local de Volkern (lead + conversación +
        // mensaje) y en Chatwoot para que el agente vea el hilo completo.
        try {
          const remoteJid = body.data?.key?.remoteJid || '';
          const fromMe = !!body.data?.key?.fromMe;
          const messageKeyId = body.data?.key?.id || '';
          const textContent =
            body.data?.message?.conversation ||
            body.data?.message?.extendedTextMessage?.text ||
            body.data?.message?.imageMessage?.caption ||
            body.data?.message?.documentMessage?.caption ||
            body.data?.message?.videoMessage?.caption ||
            '';
          const pushName = body.data?.pushName || '';

          // Sin remitente o sin contenido (medios sin caption, etc.) solo cuenta
          if (!remoteJid || !textContent) {
            console.log('⚠️ Mensaje sin contenido/remitente; solo se actualizó el contador');
            break;
          }

          // 🔁 ECO DEL PUENTE: si el mensaje fromMe fue enviado POR NOSOTROS
          // (sendMessageWithUserInstance — respuesta del agente o del chatbot),
          // Evolution lo reenvía aquí como eco. Se descarta: la respuesta ya
          // quedó en la bandeja (vía sendResponseToChatwoot/sync del webhook de
          // Chatwoot) y re-sincronizarla crearía un bucle infinito.
          if (fromMe && isMessageKeyRecentlySent(messageKeyId)) {
            console.log('🔁 Eco del puente ignorado (mensaje enviado por Volkern):', messageKeyId);
            break;
          }

          const phoneNumber = remoteJid.replace('@s.whatsapp.net', '').replace('@g.us', '');
          const cleanPhone = phoneNumber.replace(/[\s\-\()]/g, '');

          // Chat con uno mismo (notas de WhatsApp): el remitente es el propio
          // número de la instancia. No se crea lead ni conversación ni se
          // sincroniza al hub; solo cuenta en el contador de la instancia.
          const ownerPhone = (instance.phoneNumber || '').replace(/[\s\-\()]/g, '');
          if (ownerPhone && cleanPhone === ownerPhone) {
            console.log('ℹ️ Self-chat (mensaje a uno mismo) ignorado para la bandeja:', cleanPhone);
            break;
          }

          // ⏱️ Rate-limit por chat (compartido entre instancias vía Redis): si
          // el mismo remitente envía mensajes más rápido que la ventana, se
          // responde 429 + Retry-After para que Evolution reintente el payload
          // en vez de procesarlo sin límite. Se evalúa ANTES de tocar la BD
          // (lead/conversación/mensaje) para que el reintento procese el
          // mensaje completo y no quede estado a medias.
          if (await isChatRateLimited(cleanPhone, 'evolution')) {
            console.log('⏱️ Rate-limit: mensaje de', cleanPhone, 'rechazado con 429 (Evolution reintentará)');
            return rateLimitedResponse(instanceName);
          }

          // En salientes el pushName es el del propietario, no del contacto
          const contactName = !fromMe && pushName ? pushName : `WhatsApp ${cleanPhone.slice(-4)}`;

          // ── Sincronización local (bandeja de Volkern) ──
          let lead = await prisma.lead.findFirst({
            where: { tenantId: instance.tenantId, telefono: { contains: cleanPhone.slice(-10) } },
          });
          if (!lead) {
            lead = await prisma.lead.create({
              data: {
                tenantId: instance.tenantId,
                nombre: contactName,
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
                noLeidos: fromMe ? 0 : 1,
                externalRef: `evolution_${cleanPhone.slice(-10)}`,
              },
            });
          } else {
            await prisma.conversation.update({
              where: { id: localConversation.id },
              data: {
                ultimoMensaje: textContent,
                fechaUltimoMensaje: new Date(),
                ...(fromMe ? {} : { noLeidos: { increment: 1 } }),
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
                direccion: fromMe ? 'saliente' : 'entrante',
                canal: 'whatsapp',
                estado: 'entregado',
                externalRef,
                metadatos: {
                  evolutionMessageId: body.data?.key?.id,
                  evolutionInstance: instance.instanceName,
                  fromNumber: phoneNumber,
                  fromName: pushName,
                  fromMe,
                },
              },
            });
            console.log(`✅ Mensaje ${fromMe ? 'saliente' : 'entrante'} guardado localmente:`, localConversation.id);
          }

          // ── Sincronización a Chatwoot (agente ve el hilo en la bandeja del hub) ──
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

            // Persistir el vínculo Chatwoot en la conversación local ANTES del
            // espejo: sin esto, syncOutgoingChatwootMessage (respuesta del
            // chatbot/agente) no encuentra la conversación y la respuesta nunca
            // sale por WhatsApp; y el webhook de Chatwoot no sabría a qué
            // conversación local vincular el espejo.
            await prisma.conversation.update({
              where: { id: localConversation.id },
              data: {
                chatwootAccountId: hubConfig.chatwootAccountId,
                chatwootInboxId: channel.chatwootInboxId,
                hubMetadata: {
                  chatwootConversationId: conversation.id,
                  chatwootAccountId: hubConfig.chatwootAccountId,
                  chatwootInboxId: channel.chatwootInboxId,
                },
              },
            }).catch(err => console.warn('⚠️ No se pudo persistir vínculo Chatwoot en la conversación:', err instanceof Error ? err.message : err));

            // Espejo en Chatwoot marcado con volkernOrigin: el webhook de
            // Chatwoot lo detectará y NO lo reenviará a Evolution (evita
            // duplicados/bucles). El mensaje real ya está en WhatsApp.
            await chatwootApi.sendMessage(
              hubConfig.chatwootAccountId,
              conversation.id,
              textContent,
              accountToken,
              {
                messageType: fromMe ? 'outgoing' : 'incoming',
                contentAttributes: {
                  volkernOrigin: 'evolution-bridge',
                  evolutionKey: messageKeyId,
                },
              },
            );
            console.log(`✅ Mensaje ${fromMe ? 'saliente' : 'entrante'} sincronizado a Chatwoot:`, conversation.id);

            // Asignar la conversación al agente por defecto del tenant (el
            // primer no-bot persistido en el config del canal) para que
            // aparezca en su vista asignada del hub.
            const assigneeId = (channel.config as any)?.defaultAssigneeId;
            if (assigneeId) {
              try {
                await chatwootApi.assignConversation(
                  hubConfig.chatwootAccountId,
                  conversation.id,
                  assigneeId,
                  accountToken,
                );
                console.log('✅ Conversación asignada al agente:', assigneeId);
              } catch (assignErr) {
                console.warn('⚠️ No se pudo asignar la conversación:', assignErr instanceof Error ? assignErr.message : assignErr);
              }
            } else {
              console.log('ℹ️ Sin asignado por defecto configurado para el canal; conversación sin asignar');
            }
          } else {
            console.log('⚠️ Sin canal/hub Chatwoot configurado aún para sincronizar mensaje');
          }

          // 🔔 Emitir evento solo para entrantes (el chatbot responde a contactos)
          if (!fromMe) {
            try {
              // Asegurar que el chatbot (Gemma) escucha en ESTE bundle/process:
              // en Next.js standalone, el listener registrado desde
              // instrumentation.ts puede vivir en otra instancia del event bus
              // (bundles separados) y nunca recibiría el evento. El registro es
              // idempotente (flag interno).
              const { initGemmaChatbot } = await import('@/lib/agents/chatwoot-chatbot-handler');
              initGemmaChatbot();

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
                    name: pushName || lead.nombre,
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
          console.error('❌ Error sincronizando mensaje del puente:', bridgeError);
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
    }
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
  { params: paramsPromise }: { params: Promise<{ instanceName: string }> }
) {
  const params = await paramsPromise;
  return NextResponse.json({
    message: 'Webhook endpoint para Evolution API',
    instanceName: params.instanceName,
    url: buildEvolutionWebhookUrl(params.instanceName),
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
