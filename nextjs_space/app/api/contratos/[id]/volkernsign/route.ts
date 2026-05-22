export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { withTenantAuth } from '@/lib/api-key-auth';
import { SignatureService } from '@/lib/signatures/SignatureService';
import { generatePdf } from '@/lib/pdf-generator';

// Logic based on app/api/contratos/public/[id]/pdf/route.ts
function formatCurrency(amount: number, currency: string): string {
  const symbols: Record<string, string> = { MXN: '$', USD: '$', EUR: '€' };
  const symbol = symbols[currency] || '$';
  return `${symbol}${amount.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`;
}

function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString('es-MX', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

/**
 * Generates the HTML specifically designed for PDF conversion with VolkernSign placeholders.
 */
function generateContratoHTML(contrato: any, tenant: any): string {
  const items = contrato.items as any[];

  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Contrato ${contrato.numero}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 11px; color: #333; line-height: 1.6; }
    .container { max-width: 800px; margin: 0 auto; padding: 40px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 30px; border-bottom: 3px solid #6366f1; padding-bottom: 20px; }
    .company-info h1 { font-size: 22px; color: #3D3D3D; margin-bottom: 5px; }
    .company-info p { color: #666; font-size: 10px; }
    .contract-info { text-align: right; }
    .contract-number { font-size: 18px; font-weight: bold; color: #6366f1; }
    .contract-dates { margin-top: 8px; font-size: 10px; color: #666; }
    .section-title { font-size: 12px; color: #6366f1; margin-bottom: 10px; text-transform: uppercase; border-bottom: 1px solid #e5e7eb; padding-bottom: 5px; }
    .items-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
    .items-table th { background: #6366f1; color: white; padding: 10px 12px; text-align: left; font-size: 10px; text-transform: uppercase; }
    .items-table td { padding: 12px; border-bottom: 1px solid #e5e7eb; }
    .text-right { text-align: right; }
    .grand-total { background: #6366f1; color: white; padding: 10px 12px; border-radius: 6px; margin-top: 8px; font-size: 14px; font-weight: bold; }
    
    /* VolkernSign Visual Anchors */
    .signature-slot { margin-top: 60px; padding: 20px; border: 2px dashed #6366f1; border-radius: 12px; text-align: center; background: #f5f3ff; }
    .signature-badge { display: inline-block; background: #6366f1; color: white; padding: 4px 12px; border-radius: 20px; font-size: 9px; font-weight: 800; text-transform: uppercase; margin-bottom: 10px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="company-info">
        <h1>${tenant?.nombre || 'Empresa'}</h1>
        <p>${tenant?.direccion || ''}</p>
      </div>
      <div class="contract-info">
        <div class="contract-number">${contrato.numero}</div>
        <div class="contract-dates">
          <span>Fecha: ${formatDate(contrato.fechaCreacion)}</span>
        </div>
      </div>
    </div>
    
    <h2 style="font-size: 16px; color: #1e293b; margin-bottom: 20px;">${contrato.titulo}</h2>
    
    <div class="section">
      <div class="section-title">Conceptos</div>
      <table class="items-table">
        <thead>
          <tr>
            <th>Descripción</th>
            <th class="text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          ${items.map(item => `
            <tr>
              <td>${item.concepto}</td>
              <td class="text-right">${formatCurrency(item.cantidad * item.precioUnitario, contrato.moneda)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      <div class="grand-total text-right">
        <span>Total: ${formatCurrency(contrato.total, contrato.moneda)}</span>
      </div>
    </div>

    <!-- EIDAS SIGNATURE AREAS -->
    <div style="display: flex; gap: 40px; margin-top: 50px;">
      <div class="signature-slot" style="flex: 1;">
        <span class="signature-badge">Firmante: Empresa</span>
        <div style="height: 60px;"></div>
        <p style="font-weight: 800;">REPRESENTANTE LEGAL</p>
        <p style="font-size: 10px;">${tenant?.nombre || ''}</p>
      </div>
      
      <div class="signature-slot" style="flex: 1;">
        <span class="signature-badge">Firmante: Cliente</span>
        <div style="height: 60px;"></div>
        <p style="font-weight: 800;">${contrato.clienteNombre || 'CLIENTE'}</p>
        <p style="font-size: 10px;">${contrato.clienteEmail || ''}</p>
      </div>
    </div>
  </div>
</body>
</html>
  `;
}

export const POST = withTenantAuth(async (request, auth, { params }) => {
  try {
    const tenantId = auth.tenant!.id;
    const contratoId = params.id;

    // 1. Fetch Contract data
    const contrato = await prisma.contrato.findFirst({
      where: { id: contratoId, tenantId },
      include: { items: true, lead: true }
    });

    if (!contrato) {
      return NextResponse.json({ error: 'Contrato no encontrado' }, { status: 404 });
    }

    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    const htmlContent = generateContratoHTML(contrato, tenant);

    // 2. Convert HTML to PDF (via Puppeteer local — reemplaza Abacus AI)
    const pdfBuffer = await generatePdf(htmlContent, {
      format: 'A4',
      printBackground: true,
    });

    // 3. Create VolkernSign Request
    const signatureRequest = await SignatureService.createSignatureRequest({
      tenantId,
      contratoId,
      leadId: contrato.leadId || undefined,
      title: `Contrato ${contrato.numero} - ${contrato.titulo}`,
      documentBuffer: pdfBuffer,
      fileName: `${contrato.numero}.pdf`,
      signers: [
        { email: auth.user!.email!, name: auth.user!.name || 'Empresa', role: 'Representante' },
        { email: contrato.clienteEmail!, name: contrato.clienteNombre || 'Cliente', role: 'Cliente' }
      ]
    });

    return NextResponse.json({ 
      success: true, 
      requestId: signatureRequest.id,
      uuid: signatureRequest.libreSignUuid 
    });

  } catch (error: any) {
    console.error('[VolkernSignProcess] Error:', error.message);
    return NextResponse.json({ error: 'Error al procesar solicitud de firma', details: error.message }, { status: 500 });
  }
}, ['contratos:write']);
