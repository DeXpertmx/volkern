export const dynamic = 'force-dynamic';

/**
 * Anytimebot Lead Capture Webhook
 * Receives lead information from Anytimebot chatbot conversations
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { transformAnytimebotLead, transformAnytimebotConversation, validateAnytimebotWebhook, type AnytimebotLeadCapture } from '@/lib/anytimebot';
import { triggerAutomation } from '@/lib/automation-engine';

export async function POST(request: NextRequest) {
  try {
    const payload: AnytimebotLeadCapture = await request.json();
    
    // Validate webhook signature (placeholder for future implementation)
    const signature = request.headers.get('x-anytimebot-signature') || '';
    if (!validateAnytimebotWebhook(signature, payload)) {
      return NextResponse.json(
        { error: 'Invalid webhook signature' },
        { status: 401 }
      );
    }

    // Extract contact information
    const { contactInfo, conversationId, source } = payload;

    // Validate required fields
    if (!contactInfo.email && !contactInfo.telefono) {
      return NextResponse.json(
        { error: 'Email o teléfono requerido' },
        { status: 400 }
      );
    }

    // Find tenant by Anytimebot integration
    // For now, we'll look for any active integration (in production, use username from payload)
    const integration = await prisma.anytimebotIntegration.findFirst({
      where: {
        activo: true,
        sincronizarLeads: true,
      },
      include: {
        tenant: true,
      },
    });

    if (!integration) {
      return NextResponse.json(
        { error: 'No se encontró integración activa de Anytimebot' },
        { status: 404 }
      );
    }

    const tenantId = integration.tenantId;

    // Check if lead already exists (by email or phone)
    const existingLead = await prisma.lead.findFirst({
      where: {
        tenantId,
        OR: [
          contactInfo.email ? { email: contactInfo.email } : {},
          contactInfo.telefono ? { telefono: contactInfo.telefono } : {},
        ].filter(condition => Object.keys(condition).length > 0),
      },
    });

    if (existingLead) {
      // Update existing lead with new conversation data
      const conversationSummary = payload.messages
        .map(msg => `[${msg.role.toUpperCase()}]: ${msg.content}`)
        .join('\n');

      const updatedNotes = `${existingLead.notas || ''}\n\n--- Nueva Conversación (${new Date().toLocaleString()}) ---\nID: ${conversationId}\nCanal: ${source}\n\n${conversationSummary}`;

      await prisma.lead.update({
        where: { id: existingLead.id },
        data: {
          notas: updatedNotes,
          fechaUltimaActividad: new Date(),
          // Update contact info if it was missing
          nombre: existingLead.nombre || contactInfo.nombre,
          email: existingLead.email || contactInfo.email,
          telefono: existingLead.telefono || contactInfo.telefono,
          empresa: existingLead.empresa || contactInfo.empresa,
        },
      });

      // Create/Update conversation in Messages module
      try {
        const conversationData = transformAnytimebotConversation(payload, tenantId, existingLead.id);
        
        // Check if conversation already exists for this Anytimebot conversationId
        const existingConversation = await prisma.conversation.findFirst({
          where: {
            tenantId,
            leadId: existingLead.id,
            canal: conversationData.conversation.canal,
          },
          orderBy: {
            fechaUltimoMensaje: 'desc',
          },
        });

        if (existingConversation) {
          // Update existing conversation with new messages
          await prisma.conversation.update({
            where: { id: existingConversation.id },
            data: {
              ultimoMensaje: conversationData.conversation.ultimoMensaje,
              fechaUltimoMensaje: conversationData.conversation.fechaUltimoMensaje,
              noLeidos: { increment: conversationData.conversation.noLeidos },
              estado: 'abierta', // Reabrir si estaba cerrada
            },
          });

          // Add new messages to existing conversation
          await prisma.message.createMany({
            data: conversationData.messages.map(msg => ({
              ...msg,
              conversationId: existingConversation.id,
            })),
          });
        } else {
          // Create new conversation with messages
          await prisma.conversation.create({
            data: {
              ...conversationData.conversation,
              mensajes: {
                createMany: {
                  data: conversationData.messages,
                },
              },
            },
          });
        }
      } catch (error) {
        console.error('Error syncing conversation to Messages module:', error);
        // Don't fail the webhook if conversation sync fails
      }

      // Update integration statistics
      await prisma.anytimebotIntegration.update({
        where: { id: integration.id },
        data: {
          ultimaSincronizacion: new Date(),
        },
      });

      // Log audit event
      await prisma.auditLog.create({
        data: {
          tenantId,
          userId: null,
          accion: 'lead_actualizado',
          entidad: 'Lead',
          entidadId: existingLead.id,
          descripcion: `Lead actualizado con nueva conversación desde Anytimebot (${source}) - Conversación ID: ${conversationId}`,
        },
      });

      return NextResponse.json({
        success: true,
        leadId: existingLead.id,
        action: 'updated',
        message: 'Lead existente actualizado con nueva conversación',
      });
    }

    // Transform Anytimebot lead to Volkern format
    const leadData = transformAnytimebotLead(payload);

    // Create new lead (score is already calculated in transformAnytimebotLead)
    const newLead = await prisma.lead.create({
      data: {
        ...leadData,
        tenantId,
        asignadoA: integration.asignacionAutomatica && integration.usuarioAsignadoId
          ? integration.usuarioAsignadoId
          : null,
        fechaUltimaActividad: new Date(),
      },
    });

    // Create conversation in Messages module
    try {
      const conversationData = transformAnytimebotConversation(payload, tenantId, newLead.id);
      
      await prisma.conversation.create({
        data: {
          ...conversationData.conversation,
          mensajes: {
            createMany: {
              data: conversationData.messages,
            },
          },
        },
      });
    } catch (error) {
      console.error('Error creating conversation in Messages module:', error);
      // Don't fail the webhook if conversation creation fails
    }

    // Update integration statistics
    await prisma.anytimebotIntegration.update({
      where: { id: integration.id },
      data: {
        totalLeadsCapturados: { increment: 1 },
        ultimaSincronizacion: new Date(),
      },
    });

    // Log audit event
    await prisma.auditLog.create({
      data: {
        tenantId,
        userId: null,
        accion: 'lead_creado',
        entidad: 'Lead',
        entidadId: newLead.id,
        descripcion: `Lead creado desde Anytimebot (${source}) - Conversación ID: ${conversationId}`,
      },
    });

    // Trigger automation if configured
    try {
      await triggerAutomation(
        'lead_creado',
        {
          leadId: newLead.id,
          tenantId,
          fuente: leadData.fuente,
        }
      );
    } catch (error) {
      console.error('Error triggering automation:', error);
      // Don't fail the webhook if automation fails
    }

    return NextResponse.json({
      success: true,
      leadId: newLead.id,
      action: 'created',
      message: 'Lead creado exitosamente',
      score: newLead.scoreValue,
    });

  } catch (error) {
    console.error('Error processing Anytimebot lead capture webhook:', error);
    return NextResponse.json(
      {
        error: 'Error al procesar webhook de Anytimebot',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
