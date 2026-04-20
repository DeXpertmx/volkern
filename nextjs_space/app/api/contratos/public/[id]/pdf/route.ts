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

function hydrateTemplate(html: string, contrato: any, tenant: any): string {
  const items = contrato.items as any[];
  
  // 1. Table Generation
  const itemsTableHTML = `
    <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
      <thead>
        <tr style="border-bottom: 2px solid #333;">
          <th style="padding: 10px; text-align: left;">Descripción</th>
          <th style="padding: 10px; text-align: center; width: 60px;">Cant.</th>
          <th style="padding: 10px; text-align: right; width: 100px;">Precio</th>
          <th style="padding: 10px; text-align: right; width: 100px;">Total</th>
        </tr>
      </thead>
      <tbody>
        ${items.map(item => `
          <tr style="border-bottom: 1px solid #eee;">
            <td style="padding: 10px;">
              <div style="font-weight: bold;">${item.concepto}</div>
              <div style="font-size: 10px; color: #666;">${item.descripcion || ''}</div>
            </td>
            <td style="padding: 10px; text-align: center;">${item.cantidad}</td>
            <td style="padding: 10px; text-align: right;">${formatCurrency(item.precioUnitario, contrato.moneda)}</td>
            <td style="padding: 10px; text-align: right;">${formatCurrency(item.cantidad * item.precioUnitario, contrato.moneda)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;

  // 2. Totals Summary Generation
  const totalsSummaryHTML = `
    <div style="display: flex; justify-content: flex-end; margin: 20px 0;">
      <div style="width: 250px;">
        <div style="display: flex; justify-content: space-between; padding: 5px 0;">
          <span>Subtotal</span>
          <span>${formatCurrency(contrato.subtotal, contrato.moneda)}</span>
        </div>
        ${contrato.descuentoMonto > 0 ? `
          <div style="display: flex; justify-content: space-between; padding: 5px 0; color: #dc2626;">
            <span>Descuento</span>
            <span>-${formatCurrency(contrato.descuentoMonto, contrato.moneda)}</span>
          </div>
        ` : ''}
        ${contrato.impuestos > 0 ? `
          <div style="display: flex; justify-content: space-between; padding: 5px 0;">
            <span>Impuestos (IVA)</span>
            <span>${formatCurrency(contrato.impuestos, contrato.moneda)}</span>
          </div>
        ` : ''}
        <div style="display: flex; justify-content: space-between; padding: 10px 0; border-top: 2px solid #333; font-weight: bold; font-size: 14px;">
          <span>TOTAL</span>
          <span>${formatCurrency(contrato.total, contrato.moneda)}</span>
        </div>
      </div>
    </div>
  `;

  // 3. Token Dictionary
  const tokens: Record<string, string> = {
    '{{lead.nombre}}': contrato.clienteNombre || 'Cliente',
    '{{lead.email}}': contrato.clienteEmail || '',
    '{{lead.empresa}}': contrato.clienteEmpresa || '',
    '{{empresa.nombre}}': tenant?.nombre || 'Nuestra Empresa',
    '{{empresa.direccion}}': tenant?.direccion || '',
    '{{contrato.numero}}': contrato.numero || '',
    '{{fecha.hoy}}': formatDate(new Date()),
    '{{items.tabla}}': itemsTableHTML,
    '{{totales.resumen}}': totalsSummaryHTML,
    '{{totales.total}}': formatCurrency(contrato.total, contrato.moneda),
    '{{totales.subtotal}}': formatCurrency(contrato.subtotal, contrato.moneda),
  };

  let hydrated = html;
  Object.entries(tokens).forEach(([token, value]) => {
    // Escape regex special chars in token if any
    const escapedToken = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    hydrated = hydrated.replace(new RegExp(escapedToken, 'g'), value);
  });

  return hydrated;
}

function generateContratoHTML(contrato: any, tenant: any): string {
  // Check if we have a customized GrapesJS template in 'clausulas'
  const isCustomTemplate = contrato.clausulas && contrato.clausulas.includes('<div') && !contrato.clausulas.includes('terms-box');
  
  if (isCustomTemplate) {
    const css = contrato.templateData?.css || '';
    return `
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="UTF-8">
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'Inter', 'Segoe UI', Arial, sans-serif; font-size: 11px; color: #333; line-height: 1.5; padding: 20mm; }
          ${css}
          @page { size: A4; margin: 0; }
        </style>
      </head>
      <body>
        ${hydrateTemplate(contrato.clausulas, contrato, tenant)}
      </body>
      </html>
    `;
  }

  // Fallback to legacy static template
  const items = contrato.items as any[];
  return `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <style>
        body { font-family: sans-serif; padding: 40px; }
        .signatures-section { display: flex; justify-content: space-between; margin-top: 50px; }
        .signature-box { width: 45%; text-align: center; }
        .signature-line { border-top: 1px solid #000; margin-bottom: 10px; }
      </style>
    </head>
    <body>
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
