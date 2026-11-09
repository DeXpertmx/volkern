export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { triggerAutomation } from '@/lib/automation-engine';

// GET /api/email-campanas/track/[recipientId] - Tracking de apertura de emails
export async function GET(
  request: NextRequest,
  { params: paramsPromise }: { params: Promise<{ recipientId: string }> }
) {
  const params = await paramsPromise;
  try {
    // Buscar el destinatario
    const recipient = await prisma.campaignRecipient.findUnique({
      where: { id: params.recipientId },
      include: {
        campana: true,
        lead: true
      }
    });

    if (recipient && recipient.estado === 'enviado') {
      // Actualizar estado a "abierto" si es la primera apertura
      if (!recipient.abierto) {
        await prisma.campaignRecipient.update({
          where: { id: params.recipientId },
          data: {
            abierto: true,
            fechaApertura: new Date()
          }
        });

        // Actualizar contador de abiertos en la campaña
        await prisma.emailCampaign.update({
          where: { id: recipient.campanaId },
          data: {
            totalAbiertos: {
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
              contenido: `Email abierto: ${recipient.campana?.nombre || 'Campaña'}`,
              resultado: 'positivo',
              metadatos: {
                campanaId: recipient.campanaId,
                recipientId: recipient.id,
                primeraApertura: true,
                varianteAB: recipient.varianteAsignada
              }
            }
          });

          // Disparar automatizaciones basadas en apertura de email
          try {
            await triggerAutomation('email_abierto', {
              tenantId: recipient.tenantId,
              leadId: recipient.leadId,
              data: {
                campanaId: recipient.campanaId,
                campanaNombre: recipient.campana?.nombre,
                recipientId: recipient.id,
                varianteAB: recipient.varianteAsignada,
                fechaApertura: new Date().toISOString()
              }
            });
          } catch (autoError) {
            console.error('Error disparando automatización:', autoError);
            // No fallar el tracking si la automatización falla
          }
        }
      }
    }

    // Devolver un pixel transparente 1x1
    const pixel = Buffer.from(
      'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
      'base64'
    );

    return new NextResponse(pixel, {
      status: 200,
      headers: {
        'Content-Type': 'image/gif',
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    });
  } catch (error: any) {
    console.error('Error en tracking de email:', error);
    
    // Devolver pixel aunque haya error
    const pixel = Buffer.from(
      'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
      'base64'
    );

    return new NextResponse(pixel, {
      status: 200,
      headers: {
        'Content-Type': 'image/gif',
        'Cache-Control': 'no-store'
      }
    });
  }
}
