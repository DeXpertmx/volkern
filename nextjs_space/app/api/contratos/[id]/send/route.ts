export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { authenticateRequest } from '@/lib/api-key-auth';

import { sendEmail } from '@/lib/ses-email';

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const auth = await authenticateRequest(request, ['contratos:write']);
    if (!auth.valid || !auth.tenant) {
      return NextResponse.json({ error: auth.error || 'No autorizado' }, { status: 401 });
    }

    const tenantId = auth.tenant.id;
    const userId = auth.user?.id || 'api';
    const body = await request.json();
    const { email, mensaje } = body;

    if (!email) {
      return NextResponse.json({ error: 'Email requerido' }, { status: 400 });
    }

    const contrato = await prisma.contrato.findFirst({
      where: { id: params.id, tenantId },
      include: { items: true }
    });

    if (!contrato) {
      return NextResponse.json({ error: 'Contrato no encontrado' }, { status: 404 });
    }

    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    const baseUrl = process.env.NEXTAUTH_URL || 'https://volkern.app';
    // El portal del cliente: ver el contrato, su estado y firmarlo con verificación por código
    const contratoUrl = `${baseUrl}/firma/${contrato.tokenPublico}`;

    // Formatear moneda
    const formatCurrency = (amount: number) => {
      const symbols: Record<string, string> = { MXN: '$', USD: '$', EUR: '€' };
      return `${symbols[contrato.moneda] || '$'}${amount.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;
    };

    // Generar HTML del email
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="margin:0;padding:0;font-family:Arial,sans-serif;background:#f4f4f4;">
        <div style="max-width:600px;margin:0 auto;padding:20px;">
          <div style="background:#1e40af;padding:30px;border-radius:8px 8px 0 0;text-align:center;">
            <h1 style="color:white;margin:0;font-size:24px;">${tenant?.nombre || 'Empresa'}</h1>
            <p style="color:#93c5fd;margin:10px 0 0;font-size:14px;">Contrato ${contrato.numero}</p>
          </div>
          
          <div style="background:white;padding:30px;border-radius:0 0 8px 8px;">
            <h2 style="color:#1e293b;margin:0 0 20px;">${contrato.titulo}</h2>
            
            ${mensaje ? `<p style="color:#64748b;line-height:1.6;margin-bottom:20px;">${mensaje}</p>` : ''}
            
            <div style="background:#f8fafc;border-radius:8px;padding:20px;margin-bottom:20px;">
              <table style="width:100%;border-collapse:collapse;">
                <tr>
                  <td style="padding:8px 0;color:#64748b;">Tipo:</td>
                  <td style="padding:8px 0;text-align:right;font-weight:600;">${contrato.tipo}</td>
                </tr>
                <tr>
                  <td style="padding:8px 0;color:#64748b;">Total:</td>
                  <td style="padding:8px 0;text-align:right;font-weight:600;color:#1e40af;font-size:18px;">${formatCurrency(contrato.total)}</td>
                </tr>
                ${contrato.fechaInicio ? `
                <tr>
                  <td style="padding:8px 0;color:#64748b;">Vigencia:</td>
                  <td style="padding:8px 0;text-align:right;">
                    ${new Date(contrato.fechaInicio).toLocaleDateString('es-MX')}
                    ${contrato.fechaFin ? ` - ${new Date(contrato.fechaFin).toLocaleDateString('es-MX')}` : ''}
                  </td>
                </tr>` : ''}
              </table>
            </div>
            
            <div style="text-align:center;margin:30px 0;">
              <a href="${contratoUrl}" style="background:#1e40af;color:white;padding:14px 30px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block;">Ver y Firmar Contrato</a>
            </div>
            
            <p style="color:#94a3b8;font-size:12px;text-align:center;margin-top:30px;">
              Si el botón no funciona, copia y pega este enlace en tu navegador:<br>
              <a href="${contratoUrl}" style="color:#3b82f6;">${contratoUrl}</a>
            </p>
          </div>
          
          <p style="color:#94a3b8;font-size:11px;text-align:center;margin-top:20px;">
            Este correo fue enviado por ${tenant?.nombre || 'Volkern CRM'}
          </p>
        </div>
      </body>
      </html>
    `;

    await sendEmail({
      to: email,
      subject: `Contrato ${contrato.numero} - ${contrato.titulo}`,
      html: htmlContent,
      tenantSubdomain: tenantId,
    });

    // Actualizar contrato
    await prisma.contrato.update({
      where: { id: params.id },
      data: {
        estado: 'enviado',
        fechaEnvio: new Date(),
        clienteEmail: email
      }
    });


    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error sending contrato:', error);
    return NextResponse.json({ error: 'Error al enviar' }, { status: 500 });
  }
}
