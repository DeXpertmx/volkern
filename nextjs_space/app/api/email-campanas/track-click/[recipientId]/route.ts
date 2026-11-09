export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// GET /api/email-campanas/track-click/[recipientId] - Tracking de clics en emails
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
      // Actualizar estado de clic
      const isFirstClick = !recipient.clicado;
      
      await prisma.campaignRecipient.update({
        where: { id: params.recipientId },
        data: {
          clicado: true,
          fechaClic: isFirstClick ? new Date() : recipient.fechaClic,
          numeroClics: {
            increment: 1
          }
        }
      });

      // Si es el primer clic, actualizar contador de la campaña
      if (isFirstClick) {
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
              contenido: `Click en email: ${recipient.campana?.nombre || 'Campaña'}`,
              resultado: 'positivo',
              metadatos: {
                campanaId: recipient.campanaId,
                recipientId: recipient.id,
                primerClick: true,
                varianteAB: recipient.varianteAsignada
              }
            }
          });

          // TODO: Disparar automatizaciones con trigger "email_clicado"
          // Requiere actualizar modelo AutomationExecution para soportar leadId
        }
      }

      // Obtener la URL destino del query parameter
      const { searchParams } = new URL(request.url);
      const targetUrl = searchParams.get('url');

      if (targetUrl) {
        // Redirigir a la URL destino
        return NextResponse.redirect(targetUrl);
      }
    }

    // Si no hay URL, devolver un simple mensaje
    return new NextResponse('Click registrado', { status: 200 });
  } catch (error: any) {
    console.error('Error en tracking de click:', error);
    return new NextResponse('Error', { status: 500 });
  }
}
