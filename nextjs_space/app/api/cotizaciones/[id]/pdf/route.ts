export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { authenticateRequest } from '@/lib/api-key-auth';

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

function generateCotizacionHTML(cotizacion: any, tenant: any): string {
  const items = cotizacion.items as any[];
  const subtotal = items.reduce((sum: number, item: any) => sum + (item.cantidad * item.precioUnitario), 0);
  const descuentoAmount = cotizacion.descuentoGlobal ? (subtotal * cotizacion.descuentoGlobal / 100) : 0;
  const subtotalConDescuento = subtotal - descuentoAmount;
  const ivaAmount = cotizacion.incluyeIva ? (subtotalConDescuento * 0.16) : 0;
  const total = subtotalConDescuento + ivaAmount;

  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Cotización ${cotizacion.numero}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 12px; color: #333; line-height: 1.5; }
    .container { max-width: 800px; margin: 0 auto; padding: 40px; }
    
    /* Header */
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; border-bottom: 3px solid #2563eb; padding-bottom: 20px; }
    .company-info h1 { font-size: 24px; color: #1e40af; margin-bottom: 5px; }
    .company-info p { color: #666; font-size: 11px; }
    .quote-info { text-align: right; }
    .quote-number { font-size: 20px; font-weight: bold; color: #1e40af; }
    .quote-dates { margin-top: 10px; font-size: 11px; color: #666; }
    .quote-dates span { display: block; }
    
    /* Status Badge */
    .status-badge { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 10px; font-weight: 600; text-transform: uppercase; margin-top: 10px; }
    .status-borrador { background: #e5e7eb; color: #374151; }
    .status-enviada { background: #dbeafe; color: #1d4ed8; }
    .status-vista { background: #fef3c7; color: #92400e; }
    .status-aceptada { background: #d1fae5; color: #065f46; }
    .status-rechazada { background: #fee2e2; color: #991b1b; }
    .status-vencida { background: #f3f4f6; color: #6b7280; }
    
    /* Client Section */
    .client-section { background: #f8fafc; border-radius: 8px; padding: 20px; margin-bottom: 30px; }
    .client-section h3 { font-size: 12px; color: #64748b; text-transform: uppercase; margin-bottom: 10px; letter-spacing: 0.5px; }
    .client-name { font-size: 16px; font-weight: 600; color: #1e293b; }
    .client-details { color: #64748b; font-size: 11px; margin-top: 5px; }
    
    /* Items Table */
    .items-table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
    .items-table th { background: #1e40af; color: white; padding: 12px 15px; text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; }
    .items-table th:first-child { border-radius: 8px 0 0 0; }
    .items-table th:last-child { border-radius: 0 8px 0 0; text-align: right; }
    .items-table td { padding: 15px; border-bottom: 1px solid #e5e7eb; }
    .items-table tr:last-child td { border-bottom: none; }
    .items-table .item-name { font-weight: 500; color: #1e293b; }
    .items-table .item-desc { font-size: 10px; color: #64748b; margin-top: 3px; }
    .items-table .text-right { text-align: right; }
    .items-table .text-center { text-align: center; }
    
    /* Totals */
    .totals-section { display: flex; justify-content: flex-end; margin-bottom: 30px; }
    .totals-box { width: 300px; }
    .total-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #e5e7eb; }
    .total-row:last-child { border-bottom: none; }
    .total-row.grand-total { background: #1e40af; color: white; padding: 12px 15px; border-radius: 8px; margin-top: 10px; font-size: 16px; font-weight: bold; }
    .total-label { color: #64748b; }
    .total-row.grand-total .total-label { color: white; }
    
    /* Notes & Terms */
    .notes-section { margin-bottom: 30px; }
    .notes-section h4 { font-size: 12px; color: #1e40af; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.5px; }
    .notes-content { background: #f8fafc; border-radius: 8px; padding: 15px; font-size: 11px; color: #64748b; }
    
    /* Footer */
    .footer { border-top: 1px solid #e5e7eb; padding-top: 20px; text-align: center; color: #94a3b8; font-size: 10px; }
    .footer p { margin-bottom: 5px; }
    
    /* Validity Notice */
    .validity-notice { background: #fef3c7; border-radius: 8px; padding: 12px 15px; margin-bottom: 30px; font-size: 11px; color: #92400e; text-align: center; }
  </style>
</head>
<body>
  <div class="container">
    <!-- Header -->
    <div class="header">
      <div class="company-info">
        <h1>${tenant.nombre || 'Empresa'}</h1>
        ${tenant.direccion ? `<p>${tenant.direccion}</p>` : ''}
        ${tenant.telefono ? `<p>Tel: ${tenant.telefono}</p>` : ''}
        ${tenant.email ? `<p>${tenant.email}</p>` : ''}
      </div>
      <div class="quote-info">
        <div class="quote-number">${cotizacion.numero}</div>
        <div class="quote-dates">
          <span>Fecha: ${formatDate(cotizacion.fechaCreacion)}</span>
          <span>Válida hasta: ${formatDate(cotizacion.fechaVencimiento)}</span>
        </div>
        <span class="status-badge status-${cotizacion.estado.toLowerCase()}">${cotizacion.estado}</span>
      </div>
    </div>
    
    <!-- Client Info -->
    <div class="client-section">
      <h3>Cliente</h3>
      <div class="client-name">${cotizacion.clienteNombre || 'Sin nombre'}</div>
      <div class="client-details">
        ${cotizacion.clienteEmpresa ? `${cotizacion.clienteEmpresa}<br>` : ''}
        ${cotizacion.clienteEmail ? `${cotizacion.clienteEmail}<br>` : ''}
        ${cotizacion.clienteTelefono || ''}
      </div>
    </div>
    
    <!-- Validity Notice -->
    ${new Date(cotizacion.fechaVencimiento) < new Date() ? 
      `<div class="validity-notice">⚠️ Esta cotización ha vencido el ${formatDate(cotizacion.fechaVencimiento)}</div>` : 
      `<div class="validity-notice">📅 Esta cotización es válida hasta el ${formatDate(cotizacion.fechaVencimiento)}</div>`
    }
    
    <!-- Items Table -->
    <table class="items-table">
      <thead>
        <tr>
          <th style="width: 45%">Descripción</th>
          <th class="text-center" style="width: 15%">Cantidad</th>
          <th class="text-right" style="width: 20%">Precio Unit.</th>
          <th class="text-right" style="width: 20%">Subtotal</th>
        </tr>
      </thead>
      <tbody>
        ${items.map(item => `
          <tr>
            <td>
              <div class="item-name">${item.nombre}</div>
              ${item.descripcion ? `<div class="item-desc">${item.descripcion}</div>` : ''}
            </td>
            <td class="text-center">${item.cantidad}</td>
            <td class="text-right">${formatCurrency(item.precioUnitario, cotizacion.moneda)}</td>
            <td class="text-right">${formatCurrency(item.cantidad * item.precioUnitario, cotizacion.moneda)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    
    <!-- Totals -->
    <div class="totals-section">
      <div class="totals-box">
        <div class="total-row">
          <span class="total-label">Subtotal</span>
          <span>${formatCurrency(subtotal, cotizacion.moneda)}</span>
        </div>
        ${cotizacion.descuentoGlobal ? `
          <div class="total-row">
            <span class="total-label">Descuento (${cotizacion.descuentoGlobal}%)</span>
            <span>-${formatCurrency(descuentoAmount, cotizacion.moneda)}</span>
          </div>
        ` : ''}
        ${cotizacion.incluyeIva ? `
          <div class="total-row">
            <span class="total-label">IVA (16%)</span>
            <span>${formatCurrency(ivaAmount, cotizacion.moneda)}</span>
          </div>
        ` : ''}
        <div class="total-row grand-total">
          <span class="total-label">Total ${cotizacion.moneda}</span>
          <span>${formatCurrency(total, cotizacion.moneda)}</span>
        </div>
      </div>
    </div>
    
    <!-- Payment Terms -->
    ${cotizacion.condicionesPago ? `
      <div class="notes-section">
        <h4>Condiciones de Pago</h4>
        <div class="notes-content">${cotizacion.condicionesPago}</div>
      </div>
    ` : ''}
    
    <!-- Notes -->
    ${cotizacion.notasCliente ? `
      <div class="notes-section">
        <h4>Notas</h4>
        <div class="notes-content">${cotizacion.notasCliente}</div>
      </div>
    ` : ''}
    
    <!-- Footer -->
    <div class="footer">
      <p>Cotización generada por ${tenant.nombre || 'Volkern CRM'}</p>
      <p>Documento generado el ${formatDate(new Date())}</p>
    </div>
  </div>
</body>
</html>
  `;
}

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const auth = await authenticateRequest(request, ['cotizaciones:read']);
    if (!auth.valid || !auth.tenant) {
      return NextResponse.json({ error: auth.error || 'No autorizado' }, { status: 401 });
    }

    const tenantId = auth.tenant.id;

    const cotizacion = await prisma.cotizacion.findFirst({
      where: {
        id: params.id,
        tenantId: tenantId
      },
      include: {
        deal: true,
        lead: true,
        items: true
      }
    });

    if (!cotizacion) {
      return NextResponse.json({ error: 'Cotización no encontrada' }, { status: 404 });
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId }
    });

    const htmlContent = generateCotizacionHTML(cotizacion, tenant);

    // Step 1: Create PDF request
    const createResponse = await fetch('https://apps.abacus.ai/api/createConvertHtmlToPdfRequest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deployment_token: process.env.ABACUSAI_API_KEY,
        html_content: htmlContent,
        pdf_options: { 
          format: 'A4',
          margin: { top: '20mm', right: '15mm', bottom: '20mm', left: '15mm' },
          print_background: true
        },
        base_url: process.env.NEXTAUTH_URL || ''
      })
    });

    if (!createResponse.ok) {
      const error = await createResponse.json().catch(() => ({ error: 'Failed to create PDF request' }));
      return NextResponse.json({ success: false, error: error.error }, { status: 500 });
    }

    const { request_id } = await createResponse.json();
    if (!request_id) {
      return NextResponse.json({ success: false, error: 'No request ID returned' }, { status: 500 });
    }

    // Step 2: Poll for completion
    const maxAttempts = 60;
    let attempts = 0;

    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 1000));

      const statusResponse = await fetch('https://apps.abacus.ai/api/getConvertHtmlToPdfStatus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          request_id: request_id, 
          deployment_token: process.env.ABACUSAI_API_KEY 
        })
      });

      const statusResult = await statusResponse.json();
      const status = statusResult?.status || 'FAILED';
      const result = statusResult?.result || null;

      if (status === 'SUCCESS') {
        if (result && result.result) {
          const pdfBuffer = Buffer.from(result.result, 'base64');
          const filename = `${cotizacion.numero.replace(/[^a-zA-Z0-9-]/g, '_')}.pdf`;
          
          return new NextResponse(pdfBuffer, {
            headers: {
              'Content-Type': 'application/pdf',
              'Content-Disposition': `attachment; filename="${filename}"`
            }
          });
        }
        return NextResponse.json({ success: false, error: 'PDF sin datos' }, { status: 500 });
      } else if (status === 'FAILED') {
        return NextResponse.json({ success: false, error: result?.error || 'Error generando PDF' }, { status: 500 });
      }
      attempts++;
    }

    return NextResponse.json({ success: false, error: 'Timeout generando PDF' }, { status: 500 });
  } catch (error) {
    console.error('Error generating PDF:', error);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
