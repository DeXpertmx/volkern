export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    
    // Telegram envía actualizaciones en este formato
    // https://core.telegram.org/bots/api#update
    // ============================================
    // Manejo de Interacciones (Callbacks) - WATCHDOG
    // ============================================
    if (body.callback_query) {
      const { callback_query } = body;
      const chatId = callback_query.message.chat.id.toString();
      const data = callback_query.data; // Formato: "accion:itemId:tenantId"
      
      const [action, itemId, tenantId] = data.split(':');

      // 1. Verificar Seguridad: ¿Es el remitente un ADMIN legítimo de ese tenant?
      const admin = await prisma.user.findFirst({
        where: { 
          tenantId,
          role: { nombre: 'ADMIN' },
          metadata: { contains: { telegram_chat_id: chatId } }
        }
      });

      if (!admin) {
        return NextResponse.json({
          method: 'answerCallbackQuery',
          callback_query_id: callback_query.id,
          text: '❌ ERROR: No tienes permisos para autorizar acciones en este Tenant.',
          show_alert: true
        });
      }

      if (action === 'reject_buy') {
        return NextResponse.json({
          method: 'editMessageText',
          chat_id: chatId,
          message_id: callback_query.message.message_id,
          text: `${callback_query.message.text}\n\n❌ <b>COMPRA RECHAZADA</b> por ${admin.name}.`
        });
      }

      if (action === 'auth_buy') {
        const { skills } = await import('@/lib/skills');
        
        // Obtener datos del item para el gasto
        const item = await prisma.catalogoItem.findUnique({
          where: { id: itemId },
          select: { nombre: true, sku: true, precio: true }
        });

        // REGLA: Crear gasto con status PENDING_RECEIPT
        const expense = await skills.create_expense({
          tenantId,
          createdById: admin.id,
          description: `COMPRA PROACTIVA (Watchdog): ${item?.nombre || 'Item'} - SKU: ${item?.sku}`,
          amount: item?.precio || 0,
          category: 'Proactivo',
          status: 'PENDING_RECEIPT' as any,
          supplierId: 'watchdog-system', // O un ID de proveedor genérico
        });

        return NextResponse.json({
          method: 'editMessageText',
          chat_id: chatId,
          message_id: callback_query.message.message_id,
          text: `${callback_query.message.text}\n\n✅ <b>COMPRA AUTORIZADA</b> por ${admin.name}.\nGasto: <b>€${expense.amount}</b> registrado como <i>PENDIENTE DE RECIBO</i>.`
        });
      }
    }

    // ============================================
    // Manejo de Mensajes Directos
    // ============================================
    if (body.message) {
      const { message } = body
      const chatId = message.chat.id.toString()
      const senderName = message.from.first_name + (message.from.last_name ? ` ${message.from.last_name}` : '')
      const messageText = message.text || ''

      // ============================================
      // Comando /start - Configurar notificaciones
      // ============================================
      // ============================================
      // Comando /start - Configurar notificaciones
      // ============================================
      if (messageText.startsWith('/start')) {
        const parts = messageText.split(' ');
        const tenantIdParam = parts.length > 1 ? parts[1] : null;

        // 1. Buscar integración de Telegram
        let integration = null;

        if (tenantIdParam) {
          // Si tenemos el tenantId en el /start, buscamos directo
          integration = await prisma.integration.findFirst({
            where: { tenantId: tenantIdParam, tipo: 'telegram', activo: true },
            select: { id: true, credenciales: true, nombre: true, tenantId: true }
          });
        }

        // Si no hay parámetro o no se encontró por ID, intentar búsqueda global (fallback lento)
        if (!integration) {
          const tenants = await prisma.tenant.findMany({
            where: { estado: 'activo' },
            select: { id: true }
          });
          
          for (const tenant of tenants) {
            const found = await prisma.integration.findFirst({
              where: { tenantId: tenant.id, tipo: 'telegram', activo: true },
              select: { id: true, credenciales: true, nombre: true, tenantId: true }
            });
            if (found) {
              integration = found;
              break;
            }
          }
        }
        
        if (integration?.credenciales) {
          const creds = integration.credenciales as any;
          // Actualizar admin_chat_id
          await prisma.integration.update({
            where: { id: integration.id },
            data: {
              credenciales: {
                ...creds,
                admin_chat_id: chatId
              }
            }
          });
          
          console.log(`[Telegram] Admin chat_id configurado: ${chatId} para tenant ${integration.tenantId}`);
          
          return NextResponse.json({
            method: 'sendMessage',
            chat_id: chatId,
            text: `✅ *¡Configuración completa!*\n\nAhora recibirás notificaciones de Volkern en este chat.\n\n📱 *Tu Chat ID:* \`${chatId}\``,
            parse_mode: 'Markdown'
          });
        }
        
        // No se encontró ninguna integración
        return NextResponse.json({
          method: 'sendMessage',
          chat_id: chatId,
          text: `⚠️ No se encontró una integración de Telegram activa para vincular tu cuenta.`
        });
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
