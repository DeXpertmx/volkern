export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { triggerAutomation } from '@/lib/automation-engine';

// GET /api/email-campanas/track/[recipientId]/unsubscribe - Procesar desuscripción
export async function GET(
  request: NextRequest,
  { params }: { params: { recipientId: string } }
) {
  try {
    // Buscar el destinatario
    const recipient = await prisma.campaignRecipient.findUnique({
      where: { id: params.recipientId },
      include: {
        campana: true,
        lead: true
      }
    });

    if (!recipient) {
      return new NextResponse(
        `<!DOCTYPE html>
        <html>
        <head>
          <title>Volkern - Error</title>
          <meta charset="UTF-8">
          <style>
            body { font-family: system-ui; max-width: 600px; margin: 50px auto; padding: 20px; text-align: center; }
            .error { color: #dc2626; }
          </style>
        </head>
        <body>
          <h1 class="error">Error</h1>
          <p>No se pudo procesar tu solicitud de desuscripción.</p>
        </body>
        </html>`,
        {
          status: 404,
          headers: { 'Content-Type': 'text/html; charset=utf-8' }
        }
      );
    }

    // Agregar a lista de desuscritos
    await prisma.unsubscribeList.create({
      data: {
        tenantId: recipient.tenantId,
        email: recipient.emailDestinatario,
        leadId: recipient.leadId,
        campanaId: recipient.campanaId,
        motivo: 'usuario_solicito',
      }
    });

    // Actualizar estado del lead si existe
    if (recipient.leadId) {
      await prisma.lead.update({
        where: { id: recipient.leadId },
        data: {
          estado: 'no_contactar',
          fechaUltimaActividad: new Date()
        }
      });

      // Registrar interacción
      await prisma.interaction.create({
        data: {
          leadId: recipient.leadId,
          tipo: 'email',
          contenido: `Desuscripción de: ${recipient.campana?.nombre || 'Campaña'}`,
          resultado: 'negativo',
          metadatos: {
            campanaId: recipient.campanaId,
            recipientId: recipient.id,
            accion: 'unsubscribe'
          }
        }
      });

      // Disparar automatizaciones basadas en desuscripción
      try {
        await triggerAutomation('opt_out_campana', {
          tenantId: recipient.tenantId,
          leadId: recipient.leadId,
          data: {
            campanaId: recipient.campanaId,
            campanaNombre: recipient.campana?.nombre,
            email: recipient.emailDestinatario,
            fechaDesuscripcion: new Date().toISOString()
          }
        });
      } catch (autoError) {
        console.error('Error disparando automatización:', autoError);
      }
    }

    // Mostrar página de confirmación
    return new NextResponse(
      `<!DOCTYPE html>
      <html>
      <head>
        <title>Volkern - Desuscripción Confirmada</title>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body {
            font-family: system-ui, -apple-system, sans-serif;
            max-width: 600px;
            margin: 50px auto;
            padding: 20px;
            text-align: center;
            background: #f9fafb;
          }
          .container {
            background: white;
            border-radius: 8px;
            padding: 40px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
          }
          h1 { color: #16a34a; margin-bottom: 20px; }
          p { color: #64748b; line-height: 1.6; }
          .icon { font-size: 64px; margin-bottom: 20px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="icon">✓</div>
          <h1>Desuscripción Confirmada</h1>
          <p>Has sido desuscrito exitosamente de nuestras comunicaciones por email.</p>
          <p>Ya no recibirás emails de marketing de nuestra parte.</p>
          <p style="margin-top: 30px; font-size: 14px;">Si esto fue un error, puedes contactarnos directamente.</p>
        </div>
      </body>
      </html>`,
      {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      }
    );
  } catch (error: any) {
    console.error('Error en desuscripción:', error);
    return new NextResponse(
      `<!DOCTYPE html>
      <html>
      <head>
        <title>Volkern - Error</title>
        <meta charset="UTF-8">
        <style>
          body { font-family: system-ui; max-width: 600px; margin: 50px auto; padding: 20px; text-align: center; }
          .error { color: #dc2626; }
        </style>
      </head>
      <body>
        <h1 class="error">Error</h1>
        <p>Hubo un error al procesar tu desuscripción. Por favor intenta más tarde.</p>
      </body>
      </html>`,
      {
        status: 500,
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      }
    );
  }
}
