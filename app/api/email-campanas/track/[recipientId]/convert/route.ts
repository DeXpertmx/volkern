export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { triggerAutomation } from '@/lib/automation-engine';

// POST /api/email-campanas/track/[recipientId]/convert - Marcar conversión desde email
export async function POST(
  request: NextRequest,
  { params }: { params: { recipientId: string } }
) {
  try {
    const body = await request.json();
    const { valor, tipo } = body; // valor monetario opcional, tipo de conversión

    // Buscar el destinatario
    const recipient = await prisma.campaignRecipient.findUnique({
      where: { id: params.recipientId },
      include: {
        campana: true,
        lead: true
      }
    });

    if (!recipient) {
      return NextResponse.json({ error: 'Destinatario no encontrado' }, { status: 404 });
    }

    // Actualizar estado a "convertido"
    if (!recipient.convertido) {
      await prisma.campaignRecipient.update({
        where: { id: params.recipientId },
        data: {
          convertido: true,
          fechaConversion: new Date()
        }
      });

      // Actualizar contador de conversiones en la campaña
      await prisma.emailCampaign.update({
        where: { id: recipient.campanaId },
        data: {
          totalConversiones: {
            increment: 1
          }
        }
      });

      // Registrar interacción en el lead
      if (recipient.leadId) {
        await prisma.interaction.create({
          data: {
            leadId: recipient.leadId,
            tipo: 'conversion',
            contenido: `Conversión desde email: ${recipient.campana?.nombre || 'Campaña'}`,
            resultado: 'muy_positivo',
            metadatos: {
              campanaId: recipient.campanaId,
              recipientId: recipient.id,
              tipoConversion: tipo || 'general',
              valor: valor || 0,
              varianteAB: recipient.varianteAsignada
            }
          }
        });

        // Actualizar score del lead significativamente
        await prisma.lead.update({
          where: { id: recipient.leadId },
          data: {
            scoreValue: {
              increment: 20 // +20 puntos por conversión
            },
            estado: 'calificado',
            fechaUltimaActividad: new Date()
          }
        });

        // Disparar automatizaciones basadas en conversión
        try {
          await triggerAutomation('email_conversion', {
            tenantId: recipient.tenantId,
            leadId: recipient.leadId,
            data: {
              campanaId: recipient.campanaId,
              campanaNombre: recipient.campana?.nombre,
              recipientId: recipient.id,
              tipoConversion: tipo || 'general',
              valor: valor || 0,
              varianteAB: recipient.varianteAsignada,
              fechaConversion: new Date().toISOString()
            }
          });
        } catch (autoError) {
          console.error('Error disparando automatización:', autoError);
        }
      }
    }

    return NextResponse.json({ success: true, message: 'Conversión registrada' });
  } catch (error: any) {
    console.error('Error en tracking de conversión:', error);
    return NextResponse.json(
      { error: error.message || 'Error al registrar conversión' },
      { status: 500 }
    );
  }
}
