export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { generatePdf } from '@/lib/pdf-generator';
import { resolvePlaceholders } from '@/lib/contratos/placeholders';

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
    '{{lead.telefono}}': contrato.clienteTelefono || '',
    '{{empresa.nombre}}': tenant?.nombre || 'Nuestra Empresa',
    '{{empresa.rfc}}': (tenant as any)?.nifCif || (tenant as any)?.rfc || '',
    '{{empresa.direccion}}': (tenant as any)?.direccionFiscal || (tenant as any)?.direccion || '',
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
    // Resolver placeholders dinámicos además de los tokens de hydrateTemplate
    const hydrated = hydrateTemplate(resolvePlaceholders(contrato.clausulas, contrato, tenant), contrato, tenant);
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
        ${hydrated}
      </body>
      </html>
    `;
  }

  // Fallback: documento legal completo con items, totales, condiciones y cláusulas
  const items = (contrato.items as any[]) || [];
  const itemsTableHTML = `
    <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
      <thead>
        <tr style="border-bottom: 2px solid #333; text-align: left;">
          <th style="padding: 8px;">Descripción</th>
          <th style="padding: 8px; text-align: center; width: 60px;">Cant.</th>
          <th style="padding: 8px; text-align: right; width: 110px;">P. unitario</th>
          <th style="padding: 8px; text-align: right; width: 110px;">Total</th>
        </tr>
      </thead>
      <tbody>
        ${items.map((item: any) => `
          <tr style="border-bottom: 1px solid #eee;">
            <td style="padding: 8px;">
              <div style="font-weight: bold;">${item.concepto || ''}</div>
              ${item.descripcion ? `<div style="font-size: 10px; color: #666;">${item.descripcion}</div>` : ''}
            </td>
            <td style="padding: 8px; text-align: center;">${item.cantidad}</td>
            <td style="padding: 8px; text-align: right;">${formatCurrency(item.precioUnitario, contrato.moneda)}</td>
            <td style="padding: 8px; text-align: right;">${formatCurrency((item.cantidad || 0) * (item.precioUnitario || 0), contrato.moneda)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;

  const descuentoMonto = contrato.descuentoMonto || 0;
  const impuestos = contrato.impuestos || 0;
  const clausulasTexto = resolvePlaceholders((contrato.clausulas || '').trim(), contrato, tenant);
  const condicionesPagoTexto = resolvePlaceholders(contrato.condicionesPago || '', contrato, tenant);

  return `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <style>
        body { font-family: 'Inter', 'Segoe UI', Arial, sans-serif; font-size: 11px; color: #333; line-height: 1.55; padding: 40px; }
        h1 { font-size: 18px; margin: 0 0 4px; }
        h2 { font-size: 13px; margin: 20px 0 8px; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
        .header-meta { color: #555; font-size: 11px; margin-bottom: 20px; }
        .party-block { margin: 8px 0; }
        .party-label { font-weight: bold; font-size: 10px; color: #777; text-transform: uppercase; letter-spacing: 0.5px; }
        .totals { width: 260px; margin-left: auto; margin-top: 8px; }
        .totals div { display: flex; justify-content: space-between; padding: 3px 0; }
        .totals .total-row { border-top: 2px solid #333; font-weight: bold; font-size: 13px; padding-top: 6px; margin-top: 4px; }
        .clausulas { white-space: pre-wrap; text-align: justify; }
        .condiciones { white-space: pre-wrap; text-align: justify; }
        .signatures-section { display: flex; justify-content: space-between; margin-top: 60px; gap: 40px; }
        .signature-box { width: 45%; text-align: center; }
        .signature-line { border-top: 1px solid #000; margin-bottom: 10px; }
        .signature-label { font-size: 10px; }
        .signed-badge { color: #15803d; font-weight: bold; margin-top: 4px; }
        .footer { margin-top: 50px; border-top: 1px solid #ddd; padding-top: 8px; font-size: 9px; color: #888; text-align: center; }
      </style>
    </head>
    <body>
      <h1>${contrato.titulo || 'Contrato de servicios'}</h1>
      <div class="header-meta">
        Contrato <strong>${contrato.numero || ''}</strong> · ${formatDate(contrato.fechaCreacion || new Date())}
        ${contrato.fechaInicio ? ` · Inicio: ${formatDate(contrato.fechaInicio)}` : ''}
        ${contrato.fechaFin ? ` · Fin: ${formatDate(contrato.fechaFin)}` : ''}
      </div>

      <h2>Partes</h2>
      <div class="party-block">
        <div class="party-label">El Prestador</div>
        <div>${tenant?.razonSocial || tenant?.nombre || ''}</div>
        <div>${(tenant as any)?.nifCif || (tenant as any)?.rfc || ''}${(tenant as any)?.direccionFiscal ? ` · ${(tenant as any)?.direccionFiscal}` : ''}</div>
      </div>
      <div class="party-block">
        <div class="party-label">El Cliente</div>
        <div>${contrato.clienteNombre || contrato.clienteEmpresa || ''}</div>
        <div>${[contrato.clienteEmpresa, contrato.clienteIdFiscal, contrato.clienteDireccion].filter(Boolean).join(' · ')}</div>
        ${contrato.clienteEmail ? `<div>${contrato.clienteEmail}</div>` : ''}
      </div>

      <h2>Objeto y servicios</h2>
      ${contrato.descripcion ? `<p style="white-space: pre-wrap; text-align: justify;">${contrato.descripcion}</p>` : ''}
      ${itemsTableHTML}
      <div class="totals">
        <div><span>Subtotal</span><span>${formatCurrency(contrato.subtotal || 0, contrato.moneda)}</span></div>
        ${descuentoMonto > 0 ? `<div style="color: #dc2626;"><span>Descuento</span><span>-${formatCurrency(descuentoMonto, contrato.moneda)}</span></div>` : ''}
        ${impuestos > 0 ? `<div><span>Impuestos (IVA)</span><span>${formatCurrency(impuestos, contrato.moneda)}</span></div>` : ''}
        <div class="total-row"><span>TOTAL</span><span>${formatCurrency(contrato.total || 0, contrato.moneda)}</span></div>
      </div>

      ${condicionesPagoTexto ? `
        <h2>Condiciones de pago</h2>
        <div class="condiciones">${condicionesPagoTexto}</div>
      ` : ''}

      ${clausulasTexto ? `
        <h2>Cláusulas</h2>
        <div class="clausulas">${clausulasTexto}</div>
      ` : ''}

      <h2>Firmas</h2>
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
        <p>Contrato generado por ${tenant?.nombre || 'Volkern CRM'} · ${formatDate(new Date())}</p>
        <p>Documento electrónico con valor legal según el marco normativo aplicable.</p>
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

    // Generar PDF localmente con Puppeteer
    const pdfBuffer = await generatePdf(htmlContent, {
      format: 'A4',
      margin: { top: '15mm', right: '15mm', bottom: '15mm', left: '15mm' },
      printBackground: true,
    });

    const filename = `${contrato.numero.replace(/[^a-zA-Z0-9-]/g, '_')}.pdf`;
    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`
      }
    });
  } catch (error) {
    console.error('Error generating public PDF:', error);
    return NextResponse.json({ error: 'Error interno' }, { status: 500 });
  }
}
