export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { triggerAutomation } from '@/lib/automation-engine';

// GET /api/email-campanas/track/[recipientId]/click - Tracking de clics en emails
export async function GET(
  request: NextRequest,
  { params }: { params: { recipientId: string } }
) {
  try {
    const { searchParams } = new URL(request.url);
    const url = searchParams.get('url') || '';

    // Buscar el destinatario
    const recipient = await prisma.campaignRecipient.findUnique({
      where: { id: params.recipientId },
      include: {
        campana: true,
        lead: true
      }
    });

    if (recipient) {
      // Actualizar estado a "clicado" si es el primer clic
      if (!recipient.clicado) {
        await prisma.campaignRecipient.update({
          where: { id: params.recipientId },
          data: {
            clicado: true,
            fechaClic: new Date()
          }
        });

        // Actualizar contador de clics en la campaña
        await prisma.emailCampaign.update({
          where: { id: recipient.campanaId },
          data: {
            totalClics: {
              increment: 1
            }
          }
        });

        // Registrar interacción en el lead
        if (recipient.leadId) {
          await prisma.interaction.create({
            data: {
              leadId: recipient.leadId,
              tipo: 'email',
              contenido: `Clic en email: ${recipient.campana?.nombre || 'Campaña'}`,
              resultado: 'muy_positivo',
              metadatos: {
                campanaId: recipient.campanaId,
                recipientId: recipient.id,
                url: url,
                primerClic: true,
                varianteAB: recipient.varianteAsignada
              }
            }
          });

          // Actualizar score del lead por engagement
          await prisma.lead.update({
            where: { id: recipient.leadId },
            data: {
              scoreValue: {
                increment: 5 // +5 puntos por hacer clic
              },
              fechaUltimaActividad: new Date()
            }
          });

          // Disparar automatizaciones basadas en clic en email
          try {
            await triggerAutomation('email_clicado', {
              tenantId: recipient.tenantId,
              leadId: recipient.leadId,
              data: {
                campanaId: recipient.campanaId,
                campanaNombre: recipient.campana?.nombre,
                recipientId: recipient.id,
                url: url,
                varianteAB: recipient.varianteAsignada,
                fechaClic: new Date().toISOString()
              }
            });
          } catch (autoError) {
            console.error('Error disparando automatización:', autoError);
          }
        }
      }

      // Redirigir a la URL original
      if (url) {
        return NextResponse.redirect(url);
      }
    }

    // Si no hay URL, devolver 404
    return NextResponse.json({ error: 'URL no encontrada' }, { status: 404 });
  } catch (error: any) {
    console.error('Error en tracking de clic:', error);
    return NextResponse.json({ error: 'Error en tracking' }, { status: 500 });
  }
}
