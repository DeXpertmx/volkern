export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

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
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 30px; border-bottom: 3px solid #1e40af; padding-bottom: 20px; }
    .company-info h1 { font-size: 22px; color: #1e40af; margin-bottom: 5px; }
    .company-info p { color: #666; font-size: 10px; }
    .contract-info { text-align: right; }
    .contract-number { font-size: 18px; font-weight: bold; color: #1e40af; }
    .contract-dates { margin-top: 8px; font-size: 10px; color: #666; }
    .contract-dates span { display: block; }
    .status-badge { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 9px; font-weight: 600; text-transform: uppercase; margin-top: 8px; }
    .status-borrador { background: #e5e7eb; color: #374151; }
    .status-enviado { background: #dbeafe; color: #1d4ed8; }
    .status-firmado { background: #d1fae5; color: #065f46; }
    .status-vigente { background: #dcfce7; color: #166534; }
    .status-completado { background: #f3f4f6; color: #6b7280; }
    .status-cancelado { background: #fee2e2; color: #991b1b; }
    .parties-section { display: flex; gap: 30px; margin-bottom: 25px; }
    .party-box { flex: 1; background: #f8fafc; border-radius: 8px; padding: 15px; }
    .party-box h3 { font-size: 11px; color: #64748b; text-transform: uppercase; margin-bottom: 8px; }
    .party-name { font-size: 14px; font-weight: 600; color: #1e293b; }
    .party-details { color: #64748b; font-size: 10px; margin-top: 4px; }
    .section { margin-bottom: 25px; }
    .section-title { font-size: 12px; color: #1e40af; margin-bottom: 10px; text-transform: uppercase; border-bottom: 1px solid #e5e7eb; padding-bottom: 5px; }
    .items-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
    .items-table th { background: #1e40af; color: white; padding: 10px 12px; text-align: left; font-size: 10px; text-transform: uppercase; }
    .items-table th:first-child { border-radius: 6px 0 0 0; }
    .items-table th:last-child { border-radius: 0 6px 0 0; text-align: right; }
    .items-table td { padding: 12px; border-bottom: 1px solid #e5e7eb; }
    .items-table tr:last-child td { border-bottom: none; }
    .items-table .item-name { font-weight: 500; color: #1e293b; }
    .items-table .item-desc { font-size: 9px; color: #64748b; margin-top: 2px; }
    .items-table .text-right { text-align: right; }
    .totals-section { display: flex; justify-content: flex-end; margin-bottom: 25px; }
    .totals-box { width: 280px; }
    .total-row { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #e5e7eb; }
    .total-row:last-child { border-bottom: none; }
    .total-row.grand-total { background: #1e40af; color: white; padding: 10px 12px; border-radius: 6px; margin-top: 8px; font-size: 14px; font-weight: bold; }
    .total-label { color: #64748b; }
    .total-row.grand-total .total-label { color: white; }
    .terms-box { background: #f8fafc; border-radius: 8px; padding: 15px; font-size: 10px; color: #64748b; white-space: pre-wrap; }
    .signatures-section { display: flex; gap: 40px; margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e7eb; }
    .signature-box { flex: 1; text-align: center; }
    .signature-line { border-bottom: 1px solid #333; margin-bottom: 8px; height: 50px; }
    .signature-label { font-size: 10px; color: #64748b; }
    .signature-name { font-size: 11px; font-weight: 600; margin-top: 4px; }
    .signature-date { font-size: 9px; color: #64748b; margin-top: 2px; }
    .signed-badge { color: #059669; font-size: 10px; margin-top: 4px; }
    .footer { border-top: 1px solid #e5e7eb; padding-top: 15px; margin-top: 30px; text-align: center; color: #94a3b8; font-size: 9px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="company-info">
        <h1>${tenant?.nombre || 'Empresa'}</h1>
        ${tenant?.direccion ? `<p>${tenant.direccion}</p>` : ''}
        ${tenant?.telefono ? `<p>Tel: ${tenant.telefono}</p>` : ''}
      </div>
      <div class="contract-info">
        <div class="contract-number">${contrato.numero}</div>
        <div class="contract-dates">
          <span>Fecha: ${formatDate(contrato.fechaCreacion)}</span>
          ${contrato.fechaInicio ? `<span>Vigencia: ${formatDate(contrato.fechaInicio)}${contrato.fechaFin ? ` - ${formatDate(contrato.fechaFin)}` : ''}</span>` : ''}
        </div>
        <span class="status-badge status-${contrato.estado.toLowerCase()}">${contrato.estado}</span>
      </div>
    </div>
    
    <h2 style="font-size: 16px; color: #1e293b; margin-bottom: 20px;">${contrato.titulo}</h2>
    ${contrato.descripcion ? `<p style="color: #64748b; margin-bottom: 20px;">${contrato.descripcion}</p>` : ''}
    
    <div class="parties-section">
      <div class="party-box">
        <h3>Prestador</h3>
        <div class="party-name">${tenant?.nombre || 'Empresa'}</div>
      </div>
      <div class="party-box">
        <h3>Cliente</h3>
        <div class="party-name">${contrato.clienteNombre || 'Sin nombre'}</div>
        <div class="party-details">
          ${contrato.clienteEmpresa ? `${contrato.clienteEmpresa}<br>` : ''}
          ${contrato.clienteEmail || ''}
        </div>
      </div>
    </div>
    
    <div class="section">
      <div class="section-title">Objeto del Contrato</div>
      <table class="items-table">
        <thead>
          <tr>
            <th style="width: 45%">Descripción</th>
            <th style="width: 15%; text-align: center;">Cantidad</th>
            <th style="width: 20%; text-align: right;">Precio Unit.</th>
            <th style="width: 20%; text-align: right;">Subtotal</th>
          </tr>
        </thead>
        <tbody>
          ${items.map(item => `
            <tr>
              <td>
                <div class="item-name">${item.concepto}</div>
                ${item.descripcion ? `<div class="item-desc">${item.descripcion}</div>` : ''}
              </td>
              <td style="text-align: center;">${item.cantidad}</td>
              <td class="text-right">${formatCurrency(item.precioUnitario, contrato.moneda)}</td>
              <td class="text-right">${formatCurrency(item.cantidad * item.precioUnitario, contrato.moneda)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      
      <div class="totals-section">
        <div class="totals-box">
          <div class="total-row">
            <span class="total-label">Subtotal</span>
            <span>${formatCurrency(contrato.subtotal, contrato.moneda)}</span>
          </div>
          ${contrato.descuentoMonto > 0 ? `
            <div class="total-row">
              <span class="total-label">Descuento</span>
              <span>-${formatCurrency(contrato.descuentoMonto, contrato.moneda)}</span>
            </div>
          ` : ''}
          ${contrato.impuestos > 0 ? `
            <div class="total-row">
              <span class="total-label">IVA (16%)</span>
              <span>${formatCurrency(contrato.impuestos, contrato.moneda)}</span>
            </div>
          ` : ''}
          <div class="total-row grand-total">
            <span class="total-label">Total ${contrato.moneda}</span>
            <span>${formatCurrency(contrato.total, contrato.moneda)}</span>
          </div>
        </div>
      </div>
    </div>
    
    ${contrato.condicionesPago ? `
      <div class="section">
        <div class="section-title">Condiciones de Pago</div>
        <div class="terms-box">${contrato.condicionesPago}</div>
      </div>
    ` : ''}
    
    ${contrato.clausulas ? `
      <div class="section">
        <div class="section-title">Términos y Condiciones</div>
        <div class="terms-box">${contrato.clausulas}</div>
      </div>
    ` : ''}
    
    <div class="signatures-section">
      <div class="signature-box">
        <div class="signature-line"></div>
        <div class="signature-label">Por ${tenant?.nombre || 'la Empresa'}</div>
        ${contrato.firmadoPorEmpresa ? `
          <div class="signature-name">${contrato.nombreFirmaEmpresa}</div>
          <div class="signature-date">${formatDate(contrato.fechaFirmaEmpresa!)}</div>
          <div class="signed-badge">✓ Firmado</div>
        ` : ''}
      </div>
      <div class="signature-box">
        <div class="signature-line"></div>
        <div class="signature-label">Por el Cliente</div>
        ${contrato.firmadoPorCliente ? `
          <div class="signature-name">${contrato.nombreFirmaCliente}</div>
          <div class="signature-date">${formatDate(contrato.fechaFirmaCliente!)}</div>
          <div class="signed-badge">✓ Firmado</div>
        ` : ''}
      </div>
    </div>
    
    <div class="footer">
      <p>Contrato generado por ${tenant?.nombre || 'Volkern CRM'}</p>
      <p>Documento generado el ${formatDate(new Date())}</p>
    </div>
  </div>
</body>
</html>
  `;
}

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const contrato = await prisma.contrato.findUnique({
      where: { tokenPublico: params.id },
      include: { items: true }
    });

    if (!contrato) {
      return NextResponse.json({ error: 'Contrato no encontrado' }, { status: 404 });
    }

    const tenant = await prisma.tenant.findUnique({ where: { id: contrato.tenantId } });
    const htmlContent = generateContratoHTML(contrato, tenant);

    const createResponse = await fetch('https://apps.abacus.ai/api/createConvertHtmlToPdfRequest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deployment_token: process.env.ABACUSAI_API_KEY,
        html_content: htmlContent,
        pdf_options: { format: 'A4', margin: { top: '15mm', right: '15mm', bottom: '15mm', left: '15mm' }, print_background: true }
      })
    });

    if (!createResponse.ok) {
      return NextResponse.json({ error: 'Error creando PDF' }, { status: 500 });
    }

    const { request_id } = await createResponse.json();
    if (!request_id) {
      return NextResponse.json({ error: 'No request ID' }, { status: 500 });
    }

    let attempts = 0;
    while (attempts < 60) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      const statusResponse = await fetch('https://apps.abacus.ai/api/getConvertHtmlToPdfStatus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ request_id, deployment_token: process.env.ABACUSAI_API_KEY })
      });

      const statusResult = await statusResponse.json();
      if (statusResult?.status === 'SUCCESS' && statusResult?.result?.result) {
        const pdfBuffer = Buffer.from(statusResult.result.result, 'base64');
        const filename = `${contrato.numero.replace(/[^a-zA-Z0-9-]/g, '_')}.pdf`;
        return new NextResponse(pdfBuffer, {
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="${filename}"`
          }
        });
      } else if (statusResult?.status === 'FAILED') {
        return NextResponse.json({ error: 'Error generando PDF' }, { status: 500 });
      }
      attempts++;
    }

    return NextResponse.json({ error: 'Timeout' }, { status: 500 });
  } catch (error) {
    console.error('Error generating public PDF:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
