export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { generatePdf } from '@/lib/pdf-generator';
import { authenticateRequest } from '@/lib/api-key-auth';
import { sendEmail } from '@/lib/ses-email';

// ─── Helpers (misma lógica que el endpoint PDF) ───────────────

function formatCurrency(amount: number, currency: string): string {
  const symbols: Record<string, string> = { EUR: '€', USD: '$', MXN: '$' };
  const symbol = symbols[currency] || '€';
  return `${amount.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${symbol}`;
}

function formatISODate(date: Date | string): string {
  return new Date(date).toLocaleDateString('es-ES', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ─── Interfaces ────────────────────────────────────────────────

interface InvoiceItem {
  concepto: string;
  descripcion?: string;
  cantidad: number;
  precioUnitario: number;
  descuento?: number;
  tasaImpuestoPorcentaje?: number;
}

interface InvoiceMetadata {
  clienteNombre?: string;
  clienteNif?: string;
  clienteDireccion?: string;
  notas?: string;
  items?: InvoiceItem[];
  isManual?: boolean;
  tipoDescuento?: 'linea' | 'total';
  descuentoGlobal?: number;
  clienteEmail?: string;
}

// ─── Generar HTML de la factura (misma plantilla que el PDF) ──

function generateInvoiceHTML(invoice: any, tenant: any): string {
  const meta = (invoice.metadata || {}) as InvoiceMetadata;
  const items = meta.items || [];
  const moneda = invoice.moneda || 'EUR';

  const clienteNombre = meta.clienteNombre || invoice.contact?.nombre || invoice.lead?.nombre || 'Cliente';
  const clienteNif = meta.clienteNif || invoice.contact?.perfilFiscal?.nif || '';
  const clienteDireccion = meta.clienteDireccion || invoice.contact?.perfilFiscal?.address || invoice.contact?.ubicacion || '';
  const clienteEmail = invoice.contact?.email || invoice.lead?.email || '';

  const emisorNombre = tenant?.razonSocial || tenant?.nombre || 'Empresa';
  const emisorNif = tenant?.nifCif || '';
  const emisorDireccion = tenant?.direccionFiscal || '';
  const emisorEmail = tenant?.billingEmail || '';

  const subtotal = items.reduce((sum: number, item: InvoiceItem) =>
    sum + (item.cantidad * item.precioUnitario), 0);

  const tipoDescuento = meta.tipoDescuento || 'linea';
  const descuentoGlobal = meta.descuentoGlobal || 0;

  const descuentoLineas = items.reduce((sum: number, item: InvoiceItem) => {
    const base = item.cantidad * item.precioUnitario;
    return sum + (base * (item.descuento || 0) / 100);
  }, 0);

  const baseImponible = tipoDescuento === 'total'
    ? subtotal * (1 - descuentoGlobal / 100)
    : subtotal - descuentoLineas;

  const itemsConIva = items.map(item => {
    const base = item.cantidad * item.precioUnitario;
    const dto = tipoDescuento === 'linea' ? base * (item.descuento || 0) / 100 : 0;
    const tasa = item.tasaImpuestoPorcentaje || 0;
    return { ...item, baseItem: base, descuentoItem: dto, tasa, importe: base - dto };
  });

  const ivaPorTasa: Record<number, number> = {};
  itemsConIva.forEach(item => {
    const tasa = item.tasa;
    ivaPorTasa[tasa] = (ivaPorTasa[tasa] || 0) + (item.importe * tasa / 100);
  });

  const totalImpuestos = itemsConIva.reduce((sum, item) => sum + (item.importe * item.tasa / 100), 0);
  const total = baseImponible + totalImpuestos;

  const itemsRows = itemsConIva.map(item => `
    <tr>
      <td style="padding:10px 8px; border-bottom:1px solid #e2e8f0; font-size:13px;">
        <div style="font-weight:600; color:#0f172a;">${escapeHtml(item.concepto)}</div>
        ${item.descripcion ? `<div style="font-size:11px; color:#64748b; margin-top:2px;">${escapeHtml(item.descripcion)}</div>` : ''}
      </td>
      <td style="padding:10px 8px; border-bottom:1px solid #e2e8f0; text-align:center; font-size:13px;">${item.cantidad}</td>
      <td style="padding:10px 8px; border-bottom:1px solid #e2e8f0; text-align:right; font-size:13px;">${formatCurrency(item.precioUnitario, moneda)}</td>
      <td style="padding:10px 8px; border-bottom:1px solid #e2e8f0; text-align:center; font-size:13px;">${item.tasa > 0 ? `${item.tasa}%` : 'Exento'}</td>
      <td style="padding:10px 8px; border-bottom:1px solid #e2e8f0; text-align:right; font-size:13px; font-weight:600;">${formatCurrency(item.importe, moneda)}</td>
    </tr>
  `).join('');

  const ivaBreakdownRows = Object.entries(ivaPorTasa)
    .sort(([a], [b]) => Number(b) - Number(a))
    .map(([tasaStr, monto]) => `
      <div style="display:flex; justify-content:space-between; padding:5px 0; font-size:13px; border-bottom:1px solid #f1f5f9;">
        <span>IVA ${Number(tasaStr)}%</span>
        <span>${formatCurrency(monto, moneda)}</span>
      </div>
    `).join('');

  const descuentoHtml = tipoDescuento === 'linea' && descuentoLineas > 0
    ? `<div style="display:flex; justify-content:space-between; padding:5px 0; font-size:12px; color:#94a3b8; font-style:italic; border-bottom:1px solid #f1f5f9;">
        <span>Descuentos por l&iacute;nea</span>
        <span>-${formatCurrency(descuentoLineas, moneda)}</span>
      </div>`
    : tipoDescuento === 'total' && descuentoGlobal > 0
    ? `<div style="display:flex; justify-content:space-between; padding:5px 0; font-size:12px; color:#94a3b8; font-style:italic; border-bottom:1px solid #f1f5f9;">
        <span>Descuento global (${descuentoGlobal}%)</span>
        <span>-${formatCurrency(subtotal * descuentoGlobal / 100, moneda)}</span>
      </div>`
    : '';

  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Factura ${escapeHtml(invoice.numero)}</title>
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 12px; color: #1e293b; line-height: 1.5; margin: 0; padding: 0; }
    .container { max-width: 700px; margin: 0 auto; padding: 30px; }
    .header { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:3px solid #1e40af; padding-bottom:20px; margin-bottom:24px; }
    .emisor-name { font-size:18px; font-weight:800; color:#0f172a; margin:0 0 4px 0; }
    .emisor-nif, .emisor-address { font-size:11px; color:#64748b; margin:1px 0; }
    .meta-badge { display:inline-block; background:#1e40af; color:white; font-size:14px; font-weight:900; padding:4px 16px; border-radius:6px; letter-spacing:2px; margin-bottom:10px; }
    .meta-number { font-size:16px; font-weight:700; color:#1e293b; margin:4px 0; }
    .meta-date { font-size:11px; color:#64748b; margin:2px 0; }
    .cliente-box { background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:16px; margin-bottom:24px; }
    .cliente-name { font-size:16px; font-weight:700; color:#0f172a; margin:0 0 6px 0; }
    .cliente-detail { font-size:12px; color:#334155; margin:2px 0; }
    table.items { width:100%; border-collapse:collapse; margin-bottom:20px; }
    table.items thead { background:#1e40af; color:white; }
    table.items th { padding:10px; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.03em; }
    table.items th:first-child { border-radius:8px 0 0 0; }
    table.items th:last-child { border-radius:0 8px 0 0; }
    .totals { width:320px; margin-left:auto; }
    .total-row { display:flex; justify-content:space-between; padding:6px 0; font-size:14px; border-bottom:1px solid #f1f5f9; }
    .grand-total { border-top:2px solid #1e40af; margin-top:8px; padding-top:10px; font-weight:900; font-size:18px; color:#1e40af; }
    .footer { text-align:center; font-size:10px; color:#94a3b8; border-top:1px solid #e2e8f0; padding-top:14px; margin-top:20px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div>
        <div style="width:48px;height:48px;background:#1e40af;color:white;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:9px;border-radius:10px;margin-bottom:8px;letter-spacing:1px;">ERP</div>
        <div class="emisor-name">${escapeHtml(emisorNombre)}</div>
        ${emisorNif ? `<div class="emisor-nif">NIF: ${escapeHtml(emisorNif)}</div>` : ''}
        ${emisorDireccion ? `<div class="emisor-address">${escapeHtml(emisorDireccion)}</div>` : ''}
      </div>
      <div style="text-align:right;">
        <div class="meta-badge">FACTURA</div>
        <div class="meta-number">${escapeHtml(invoice.numero)}</div>
        <div class="meta-date">Emisi&oacute;n: ${formatISODate(invoice.fechaEmision)}</div>
        ${invoice.fechaVencimiento ? `<div class="meta-date">Vencimiento: ${formatISODate(invoice.fechaVencimiento)}</div>` : ''}
      </div>
    </div>

    <div class="cliente-box">
      <div class="cliente-name">${escapeHtml(clienteNombre)}</div>
      ${clienteNif ? `<div class="cliente-detail"><strong>NIF/CIF:</strong> ${escapeHtml(clienteNif)}</div>` : ''}
      ${clienteDireccion ? `<div class="cliente-detail"><strong>Direcci&oacute;n:</strong> ${escapeHtml(clienteDireccion)}</div>` : ''}
      <div class="cliente-detail"><strong>Email:</strong> ${escapeHtml(clienteEmail)}</div>
    </div>

    <table class="items">
      <thead>
        <tr>
          <th style="width:42%;">Descripci&oacute;n</th>
          <th style="width:8%;">Cant.</th>
          <th style="width:16%;">Precio Unit.</th>
          <th style="width:12%;">IVA</th>
          <th style="width:22%;">Importe</th>
        </tr>
      </thead>
      <tbody>
        ${itemsRows || '<tr><td colspan="5" style="text-align:center;color:#94a3b8;padding:30px;">Sin conceptos detallados</td></tr>'}
      </tbody>
    </table>

    <div class="totals">
      <div class="total-row"><span>Base Imponible</span><span>${formatCurrency(baseImponible, moneda)}</span></div>
      ${descuentoHtml}
      ${ivaBreakdownRows || '<div class="total-row" style="color:#94a3b8;font-size:12px;"><span>IVA</span><span>0,00 €</span></div>'}
      <div class="total-row grand-total"><span>TOTAL FACTURA</span><span>${formatCurrency(total, moneda)}</span></div>
    </div>

    ${meta.notas ? `
    <div style="background:#f8fafc;border-radius:8px;padding:14px;margin-top:20px;">
      <div style="font-size:11px;font-weight:800;color:#1e40af;margin-bottom:6px;">NOTAS</div>
      <p style="font-size:11px;color:#64748b;margin:0;white-space:pre-wrap;">${escapeHtml(meta.notas)}</p>
    </div>` : ''}

    <div class="footer">
      <p>Documento generado electr&oacute;nicamente por ${escapeHtml(emisorNombre)}.</p>
      <p>Conserve esta factura a efectos fiscales.</p>
    </div>
  </div>
</body>
</html>`;
}

// ─── Generar HTML del email ────────────────────────────────────

function generateEmailHTML(invoice: any, tenant: any, pdfFilename: string): string {
  const meta = (invoice.metadata || {}) as InvoiceMetadata;
  const items = meta.items || [];
  const moneda = invoice.moneda || 'EUR';
  const total = items.reduce((sum, item) => sum + (item.cantidad * item.precioUnitario), 0);
  const emisorNombre = tenant?.razonSocial || tenant?.nombre || 'Empresa';

  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Factura ${escapeHtml(invoice.numero)}</title>
</head>
<body style="font-family:'Segoe UI',Arial,sans-serif;line-height:1.6;color:#333;max-width:600px;margin:0 auto;padding:20px;">
  <div style="background:linear-gradient(135deg,#1e40af,#3b82f6);padding:30px;border-radius:10px;text-align:center;">
    <h1 style="color:white;margin:0;font-size:22px;">Factura ${escapeHtml(invoice.numero)}</h1>
  </div>

  <div style="padding:24px;background:#f9f9f9;border-radius:10px;margin-top:20px;">
    <p style="font-size:16px;">Estimado/a cliente,</p>
    <p>Adjuntamos la factura <strong>${escapeHtml(invoice.numero)}</strong> emitida por <strong>${escapeHtml(emisorNombre)}</strong>.</p>

    <div style="background:white;padding:16px;border-radius:8px;margin:20px 0;border:1px solid #e2e8f0;">
      <table style="width:100%;font-size:13px;">
        <tr><td style="padding:4px 0;color:#64748b;">Nº Factura:</td><td style="padding:4px 0;font-weight:600;text-align:right;">${escapeHtml(invoice.numero)}</td></tr>
        <tr><td style="padding:4px 0;color:#64748b;">Fecha emisi&oacute;n:</td><td style="padding:4px 0;text-align:right;">${formatISODate(invoice.fechaEmision)}</td></tr>
        ${invoice.fechaVencimiento ? `<tr><td style="padding:4px 0;color:#64748b;">Vencimiento:</td><td style="padding:4px 0;text-align:right;">${formatISODate(invoice.fechaVencimiento)}</td></tr>` : ''}
        <tr><td style="padding:4px 0;color:#64748b;">Total:</td><td style="padding:4px 0;font-weight:800;font-size:18px;color:#1e40af;text-align:right;">${formatCurrency(total, moneda)}</td></tr>
      </table>
    </div>

    <p>Puede descargar el PDF adjunto para su archivo o impresi&oacute;n.</p>

    <p style="font-size:14px;color:#666;">Si tiene alguna duda sobre esta factura, no dude en contactarnos respondiendo a este email.</p>
  </div>

  <div style="text-align:center;margin-top:20px;padding-top:20px;border-top:1px solid #eee;color:#999;font-size:12px;">
    <p>${escapeHtml(emisorNombre)} &mdash; Sistema de facturaci&oacute;n electr&oacute;nica</p>
    <p>Documento generado el ${new Date().toLocaleDateString('es-ES', { year:'numeric', month:'long', day:'numeric' })}</p>
  </div>
</body>
</html>`;
}

// ─── Route Handler ─────────────────────────────────────────────

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const auth = await authenticateRequest(request, ['billing:write', 'invoices:send']);
    if (!auth.valid || !auth.tenant) {
      return NextResponse.json({ error: auth.error || 'No autorizado' }, { status: 401 });
    }

    const tenantId = auth.tenant.id;

    // Parsear body opcional: to, subject, message
    let body: { to?: string; subject?: string; message?: string } = {};
    try {
      body = await request.json();
    } catch {
      // Sin body, usa valores por defecto
    }

    // Cargar factura con datos del contacto/lead
    const invoice = await prisma.invoice.findFirst({
      where: { id: params.id, tenantId },
      include: {
        contact: {
          select: {
            nombre: true,
            email: true,
            ubicacion: true,
            perfilFiscal: { select: { nif: true, address: true, razonSocial: true } }
          }
        },
        lead: { select: { nombre: true, email: true } }
      }
    });

    if (!invoice) {
      return NextResponse.json({ error: 'Factura no encontrada' }, { status: 404 });
    }

    // Cargar tenant para datos del emisor
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { nombre: true, razonSocial: true, nifCif: true, direccionFiscal: true, billingEmail: true, slug: true, subdomain: true }
    });

    if (!tenant) {
      return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 404 });
    }

    // Determinar destinatario
    const meta = (invoice.metadata || {}) as InvoiceMetadata;
    const destinatario = body.to || invoice.contact?.email || invoice.lead?.email || meta.clienteEmail;

    if (!destinatario) {
      return NextResponse.json({
        error: 'No se encontró email del cliente. Proporciona un email en el body o asegúrate de que la factura tenga un contacto asociado.',
      }, { status: 400 });
    }

    // Generar HTML de la factura para el PDF
    const invoiceHtml = generateInvoiceHTML(invoice, tenant);

    // Generar PDF
    const pdfBuffer = await generatePdf(invoiceHtml, {
      format: 'A4',
      margin: { top: '20mm', right: '15mm', bottom: '20mm', left: '15mm' },
      printBackground: true,
    });

    // Generar HTML del email
    const pdfFilename = `factura_${invoice.numero.replace(/[^a-zA-Z0-9-]/g, '_')}.pdf`;
    const emisorNombre = tenant?.razonSocial || tenant?.nombre || 'Empresa';
    const subject = body.subject || `Factura ${invoice.numero} - ${emisorNombre}`;
    const emailHtml = body.message
      ? `<div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;"><p>${body.message.replace(/\n/g, '<br>')}</p><hr style="margin:20px 0;"><p style="font-size:12px;color:#94a3b8;">Documento adjunto: ${pdfFilename}</p></div>`
      : generateEmailHTML(invoice, tenant, pdfFilename);

    // Enviar email con PDF adjunto via SES (nodemailer)
    const result = await sendEmail({
      to: destinatario,
      subject,
      html: emailHtml,
      tenantSubdomain: tenant.subdomain || tenant.slug || undefined,
      attachments: [{
        filename: pdfFilename,
        content: pdfBuffer,
        contentType: 'application/pdf',
      }],
    });

    if (!result.success) {
      console.error('[Invoice-SendEmail] SES error:', result.error);
      return NextResponse.json({
        error: 'Error al enviar el email: ' + (result.error || 'Error desconocido')
      }, { status: 500 });
    }

    // Registrar el envío en la metadata de la factura
    await prisma.invoice.update({
      where: { id: invoice.id },
      data: {
        metadata: {
          ...(invoice.metadata as any || {}),
          emailEnviado: true,
          emailDestinatario: destinatario,
          emailFecha: new Date().toISOString(),
          emailMessageId: result.messageId || null,
        }
      }
    });

    return NextResponse.json({
      success: true,
      message: 'Factura enviada correctamente',
      data: {
        to: destinatario,
        subject,
        messageId: result.messageId,
        pdfFilename,
      }
    });

  } catch (error) {
    console.error('[Invoice-SendEmail] Error:', error);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
