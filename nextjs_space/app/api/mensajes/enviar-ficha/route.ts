export const dynamic = 'force-dynamic';

/**
 * POST /api/mensajes/enviar-ficha
 *
 * Envía un WhatsApp desde la ficha de un Lead o Contacto:
 *  1. Reutiliza (o crea) la conversación del Hub ligada a esa ficha, para que
 *     el mensaje aparezca en la misma conversación del lead y no en una
 *     conversación suelta sin vínculo.
 *  2. Envía por el Hub (Chatwoot) cuando la conversación está puenteada o hay
 *     hub configurado: es el camino que usa la instancia de Evolution del
 *     inbox (la que recibe los mensajes del negocio).
 *  3. Si el Hub no está disponible, cae a la instancia Evolution directa del
 *     tenant.
 *  4. Registra SIEMPRE el mensaje en la conversación (estado `enviado` o
 *     `error` con el motivo), de modo que queda evidencia en el Hub incluso
 *     cuando el proveedor falla. Solo crea la interacción del timeline cuando
 *     el envío salió bien.
 *
 * Body: { tipo: 'lead' | 'contact', entityId: string, mensaje: string }
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { withTenantAuth } from '@/lib/api-key-auth'
import { sendWhatsAppMessage } from '@/lib/whatsapp'
import { chatwootApi } from '@/lib/nexus/chatwoot-api'
import { obtenerTokenChatwootTenant } from '@/lib/chatwoot-tenant'
import { logAuditAction } from '@/lib/permissions'

const soloDigitos = (valor?: string | null) => (valor || '').replace(/[^0-9]/g, '')


export const POST = withTenantAuth(async (request, auth) => {
  try {
    const tenantId = auth.tenant!.id
    const userId = auth.user?.id
    const body = await request.json()
    const { tipo, entityId, mensaje } = body as {
      tipo?: 'lead' | 'contact'
      entityId?: string
      mensaje?: string
    }

    if (tipo !== 'lead' && tipo !== 'contact') {
      return NextResponse.json({ error: 'tipo debe ser lead o contact' }, { status: 400 })
    }
    if (!entityId || !mensaje?.trim()) {
      return NextResponse.json({ error: 'entityId y mensaje son requeridos' }, { status: 400 })
    }

    // 1. Ficha origen (valida pertenencia al tenant)
    let nombre = ''
    let telefono: string | null = null
    let email: string | null = null

    if (tipo === 'lead') {
      const lead = await prisma.lead.findFirst({
        where: { id: entityId, tenantId },
        select: { id: true, nombre: true, telefono: true, email: true },
      })
      if (!lead) return NextResponse.json({ error: 'Lead no encontrado' }, { status: 404 })
      nombre = lead.nombre
      telefono = lead.telefono
      email = lead.email
    } else {
      const contacto = await prisma.contact.findFirst({
        where: { id: entityId, tenantId },
        select: { id: true, nombre: true, telefono: true, email: true },
      })
      if (!contacto) return NextResponse.json({ error: 'Contacto no encontrado' }, { status: 404 })
      nombre = contacto.nombre
      telefono = contacto.telefono
      email = contacto.email
    }

    const digitos = soloDigitos(telefono)
    if (!digitos) {
      return NextResponse.json({ error: 'La ficha no tiene un teléfono válido' }, { status: 400 })
    }

    // 2. Conversación del Hub ligada a la ficha (o la del mismo teléfono)
    const conversaciones = await prisma.conversation.findMany({
      where: { tenantId, canal: 'whatsapp' },
      orderBy: [{ fechaUltimoMensaje: 'desc' }, { fechaCreacion: 'desc' }],
      take: 100,
    })

    const esPuente = (c: any) =>
      !!(
        c.chatwootAccountId &&
        ((c.hubMetadata as any)?.chatwootConversationId ||
          (typeof c.externalRef === 'string' && c.externalRef.startsWith('chatwoot_')))
      )

    const ultimos9 = digitos.slice(-9)
    const coincideTelefono = (c: any) => {
      const d = soloDigitos(c.contactoTelefono)
      if (!d) return false
      return d.slice(-9) === ultimos9 || d.endsWith(ultimos9) || digitos.slice(-9) === d.slice(-9)
    }

    const porFicha = conversaciones.filter((c) =>
      tipo === 'lead' ? c.leadId === entityId : c.contactId === entityId
    )
    const porTelefono = conversaciones.filter(coincideTelefono)

    let conversacion =
      porFicha.find(esPuente) ||
      porFicha[0] ||
      porTelefono.find(esPuente) ||
      porTelefono[0] ||
      null

    if (!conversacion) {
      conversacion = await prisma.conversation.create({
        data: {
          tenantId,
          contactoNombre: nombre,
          contactoEmail: email || undefined,
          contactoTelefono: telefono,
          canal: 'whatsapp',
          estado: 'abierta',
          leadId: tipo === 'lead' ? entityId : null,
          contactId: tipo === 'contact' ? entityId : null,
        },
      })
    } else {
      // Completar el vínculo si faltaba (p. ej. conversación creada antes sin
      // leadId) sin robar la ficha de otro lead ya vinculado.
      const data: any = { estado: 'abierta' }
      if (tipo === 'lead' && !conversacion.leadId) data.leadId = entityId
      if (tipo === 'contact' && !conversacion.contactId) data.contactId = entityId
      if (!conversacion.contactoNombre || conversacion.contactoNombre === 'este lead') {
        data.contactoNombre = nombre
      }
      if (!conversacion.contactoTelefono) data.contactoTelefono = telefono

      conversacion = await prisma.conversation.update({
        where: { id: conversacion.id },
        data,
      })
    }

    // 3. Registro del mensaje (evidencia también si el envío falla)
    const mensajeRow = await prisma.message.create({
      data: {
        conversationId: conversacion.id,
        contenido: mensaje.trim(),
        direccion: 'saliente',
        canal: 'whatsapp',
        estado: 'pendiente',
      },
    })

    let enviado = false
    let errorEnvio: string | undefined
    let chatwootMessageId: number | undefined
    let proveedorMessageId: string | undefined

    // 4a. Camino preferente: Hub (Chatwoot). Así el mensaje queda en la misma
    // conversación del lead y sale por la instancia del inbox del hub.
    let accountId: number | null = conversacion.chatwootAccountId || null
    let chatwootConvId: number | null =
      (conversacion.hubMetadata as any)?.chatwootConversationId ||
      (typeof conversacion.externalRef === 'string' && conversacion.externalRef.startsWith('chatwoot_')
        ? parseInt(conversacion.externalRef.replace('chatwoot_', ''), 10)
        : null)

    // La cuenta y el inbox de WhatsApp viven en la config del hub; el inbox es
    // el que asegura que la conversación se cree en el canal correcto de
    // Chatwoot y no en el primero que aparezca.
    let hubInboxId: number | null = null
    {
      const hub = await prisma.messagingHubConfig.findFirst({
        where: { tenantId },
        select: { chatwootAccountId: true, whatsappInboxId: true },
      })
      if (!accountId && hub?.chatwootAccountId) accountId = hub.chatwootAccountId
      hubInboxId = hub?.whatsappInboxId ?? null
    }

    // Solo se intenta el hub si hay token de AGENTE: el token del hub es del
    // usuario bot y Chatwoot responde 401 al crear conversaciones o enviar.
    // Sin token de agente se omite el intento (sin error) y se pasa directo a
    // Evolution, evitando latencia y mensajes de error confusos.
    const tokenChatwoot = accountId
      ? await obtenerTokenChatwootTenant(tenantId, accountId)
      : ''

    if (accountId && tokenChatwoot) {
      const token = tokenChatwoot
      try {
        if (!chatwootConvId) {
          const canal = await prisma.channel.findFirst({
            where: { tenantId, type: 'whatsapp', isActive: true },
            select: { config: true },
          })
          const cfg: any = canal?.config || {}
          const inboxId =
            cfg.inboxId ||
            conversacion.chatwootInboxId ||
            hubInboxId ||
            conversaciones.find((c) => c.chatwootInboxId)?.chatwootInboxId ||
            null

          if (!inboxId) throw new Error('El hub no tiene un inbox de WhatsApp configurado')

          const creada = await chatwootApi.getOrCreateConversation(
            accountId,
            inboxId,
            digitos,
            token
          )
          chatwootConvId = creada.id

          conversacion = await prisma.conversation.update({
            where: { id: conversacion.id },
            data: {
              chatwootAccountId: accountId,
              chatwootInboxId: inboxId,
              hubMetadata: {
                ...((conversacion.hubMetadata as any) || {}),
                chatwootConversationId: creada.id,
                chatwootAccountId: accountId,
                chatwootInboxId: inboxId,
              },
            },
          })
        }

        const respuesta = await chatwootApi.sendMessage(
          accountId,
          chatwootConvId,
          mensaje.trim(),
          token,
          { messageType: 'outgoing', contentAttributes: { volkernOrigin: 'app' } }
        )
        enviado = true
        chatwootMessageId = respuesta.id
      } catch (hubError: any) {
        errorEnvio = `Hub: ${hubError?.message || 'error desconocido'}`
      }
    }

    // 4b. Fallback: instancia Evolution directa del tenant.
    if (!enviado) {
      const directo = await sendWhatsAppMessage(telefono, mensaje.trim(), tenantId)
      if (directo.success) {
        enviado = true
        proveedorMessageId = directo.messageId
      } else {
        errorEnvio = errorEnvio
          ? `${errorEnvio} · Evolution: ${directo.error}`
          : `Evolution: ${directo.error}`
      }
    }

    // 5. Persistir resultado real del envío. El externalRef permite que el
    // webhook de Chatwoot reconozca este mensaje como ya sincronizado; si el
    // webhook llegó antes y ya lo insertó, no se reutiliza (evita choque con
    // la restricción única).
    let externalRefMensaje: string | undefined
    if (chatwootMessageId) {
      const ref = `chatwoot_msg_${chatwootMessageId}`
      const existente = await prisma.message
        .findUnique({ where: { externalRef: ref }, select: { id: true } })
        .catch(() => null)
      if (!existente) externalRefMensaje = ref
    }

    const mensajeFinal = await prisma.message.update({
      where: { id: mensajeRow.id },
      data: {
        estado: enviado ? 'enviado' : 'error',
        errorMensaje: enviado ? null : errorEnvio,
        chatwootMessageId,
        externalRef: externalRefMensaje,
        metadatos: {
          proveedor: chatwootMessageId ? 'chatwoot' : 'evolution',
          messageId: proveedorMessageId,
          telefono: digitos,
          origen: 'ficha',
        },
      },
    })

    // Cuando sale por Evolution se guarda también el id del proveedor como
    // externalRef para que MESSAGES_UPDATE (entregado/leído) encuentre la fila
    // sin depender de comparar JSON.
    if (!chatwootMessageId && proveedorMessageId) {
      const refEvolution = `evolution_msg_${proveedorMessageId}`
      const yaExiste = await prisma.message
        .findUnique({ where: { externalRef: refEvolution }, select: { id: true } })
        .catch(() => null)
      if (!yaExiste) {
        await prisma.message
          .update({ where: { id: mensajeFinal.id }, data: { externalRef: refEvolution } })
          .catch(() => undefined)
      }
    }

    await prisma.conversation.update({
      where: { id: conversacion.id },
      data: {
        ultimoMensaje: mensaje.trim().slice(0, 100),
        fechaUltimoMensaje: new Date(),
        leadId: tipo === 'lead' ? entityId : conversacion.leadId,
        contactId: tipo === 'contact' ? entityId : conversacion.contactId,
      },
    })

    if (!enviado) {
      return NextResponse.json(
        {
          success: false,
          error: errorEnvio || 'No se pudo enviar el WhatsApp',
          conversationId: conversacion.id,
          messageId: mensajeFinal.id,
        },
        { status: 502 }
      )
    }

    // 6. Timeline del lead/contacto y actividad
    if (tipo === 'lead') {
      const interaccion = await prisma.interaction.create({
        data: {
          leadId: entityId,
          tipo: 'whatsapp',
          contenido: mensaje.trim(),
          resultado: 'positivo',
          creadoPor: userId || null,
          metadatos: {
            canal: 'whatsapp',
            conversacionId: conversacion.id,
            messageId: mensajeFinal.id,
            chatwootMessageId: chatwootMessageId || null,
            telefono: digitos,
          },
        },
      })

      await prisma.lead.update({
        where: { id: entityId },
        data: { fechaUltimaActividad: new Date() },
      })

      if (userId) {
        await logAuditAction(
          userId,
          tenantId,
          'INTERACCION_CREADA',
          'Interaction',
          interaccion.id,
          `WhatsApp enviado al lead ${entityId}`,
          undefined,
          { leadId: entityId, conversacionId: conversacion.id, tipo: 'whatsapp' }
        ).catch(() => undefined)
      }
    } else {
      await prisma.interaction.create({
        data: {
          contactId: entityId,
          tipo: 'whatsapp',
          contenido: mensaje.trim(),
          resultado: 'positivo',
          creadoPor: userId || null,
          metadatos: {
            canal: 'whatsapp',
            conversacionId: conversacion.id,
            messageId: mensajeFinal.id,
            chatwootMessageId: chatwootMessageId || null,
            telefono: digitos,
          },
        },
      })
    }

    return NextResponse.json({
      success: true,
      conversationId: conversacion.id,
      messageId: mensajeFinal.id,
      proveedor: chatwootMessageId ? 'chatwoot' : 'evolution',
    })
  } catch (error: any) {
    console.error('[enviar-ficha] Error:', error)
    return NextResponse.json(
      { error: error?.message || 'Error enviando WhatsApp' },
      { status: 500 }
    )
  }
}, ['messages:write'])
