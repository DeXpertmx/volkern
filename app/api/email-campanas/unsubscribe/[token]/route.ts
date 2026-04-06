export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// GET /api/email-campanas/unsubscribe/[token] - Cancelar suscripción
export async function GET(
  request: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    // Decodificar token
    const decoded = Buffer.from(params.token, 'base64').toString('utf-8');
    const [tenantId, email] = decoded.split(':');

    if (!tenantId || !email) {
      return new NextResponse(
        `<!DOCTYPE html>
        <html>
          <head><title>Error</title></head>
          <body style="font-family: Arial, sans-serif; padding: 40px; text-align: center;">
            <h1 style="color: #e74c3c;">Token inválido</h1>
            <p>El enlace de cancelación no es válido.</p>
          </body>
        </html>`,
        {
          status: 400,
          headers: { 'Content-Type': 'text/html' }
        }
      );
    }

    // Verificar si ya existe en la lista
    const yaExiste = await prisma.unsubscribeList.findFirst({
      where: { tenantId, email }
    });

    if (yaExiste) {
      return new NextResponse(
        `<!DOCTYPE html>
        <html>
          <head>
            <title>Ya cancelado</title>
            <meta name="viewport" content="width=device-width, initial-scale=1">
          </head>
          <body style="font-family: Arial, sans-serif; padding: 40px; text-align: center; max-width: 600px; margin: 0 auto;">
            <div style="background: #f8f9fa; padding: 30px; border-radius: 8px;">
              <h1 style="color: #2c3e50;">✓ Ya estás dado de baja</h1>
              <p style="color: #7f8c8d; font-size: 16px;">
                Tu email ya se encuentra en nuestra lista de exclusión.
              </p>
              <p style="color: #7f8c8d; font-size: 14px; margin-top: 20px;">
                No recibirás más correos de nuestras campañas.
              </p>
            </div>
          </body>
        </html>`,
        {
          status: 200,
          headers: { 'Content-Type': 'text/html' }
        }
      );
    }

    // Buscar lead
    const lead = await prisma.lead.findFirst({
      where: { tenantId, email }
    });

    // Agregar a lista de unsuscribe
    await prisma.unsubscribeList.create({
      data: {
        tenantId,
        email,
        leadId: lead?.id,
        motivo: 'link_email',
        tokenReactivacion: Buffer.from(`${tenantId}:${email}:${Date.now()}`).toString('base64')
      }
    });

    return new NextResponse(
      `<!DOCTYPE html>
      <html>
        <head>
          <title>Suscripción cancelada</title>
          <meta name="viewport" content="width=device-width, initial-scale=1">
        </head>
        <body style="font-family: Arial, sans-serif; padding: 40px; text-align: center; max-width: 600px; margin: 0 auto;">
          <div style="background: #f8f9fa; padding: 30px; border-radius: 8px;">
            <h1 style="color: #27ae60;">✓ Suscripción cancelada</h1>
            <p style="color: #7f8c8d; font-size: 16px;">
              Has sido dado de baja exitosamente de nuestras campañas de email.
            </p>
            <p style="color: #7f8c8d; font-size: 14px; margin-top: 20px;">
              Lamentamos verte partir. Si cambias de opinión, puedes contactarnos para reactivar tu suscripción.
            </p>
            <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
            <p style="color: #95a5a6; font-size: 12px;">
              Email: ${email}
            </p>
          </div>
        </body>
      </html>`,
      {
        status: 200,
        headers: { 'Content-Type': 'text/html' }
      }
    );
  } catch (error: any) {
    console.error('Error al procesar unsuscribe:', error);
    return new NextResponse(
      `<!DOCTYPE html>
      <html>
        <head><title>Error</title></head>
        <body style="font-family: Arial, sans-serif; padding: 40px; text-align: center;">
          <h1 style="color: #e74c3c;">Error</h1>
          <p>Ocurrió un error al procesar tu solicitud. Por favor intenta nuevamente.</p>
        </body>
      </html>`,
      {
        status: 500,
        headers: { 'Content-Type': 'text/html' }
      }
    );
  }
}
