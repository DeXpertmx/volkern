export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { generatePdf } from '@/lib/pdf-generator';
import { authenticateRequest } from '@/lib/api-key-auth';

// ─── Helpers ───────────────────────────────────────────────────

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

function amountInWords(amount: number): string {
  // Simplificación: devuelve el número en formato legible
  const euros = Math.floor(amount);
  const cents = Math.round((amount - euros) * 100);
  return `${euros.toLocaleString('es-ES')} euros con ${cents} céntimos`;
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
  tasaImpuestoNombre?: string;
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
}

// ─── HTML Generator ────────────────────────────────────────────

function generateInvoiceHTML(invoice: any, tenant: any): string {
  const meta = (invoice.metadata || {}) as InvoiceMetadata;
  const items = meta.items || [];

  const moneda = invoice.moneda || 'EUR';

  // Datos del cliente: prioridad metadata, luego contact/lead
  const clienteNombre = meta.clienteNombre || invoice.contact?.nombre || invoice.lead?.nombre || 'Cliente';
  const clienteNif = meta.clienteNif || invoice.contact?.perfilFiscal?.nif || '';
  const clienteDireccion = meta.clienteDireccion || invoice.contact?.perfilFiscal?.address || invoice.contact?.ubicacion || '';
  const clienteEmail = invoice.contact?.email || invoice.lead?.email || '';

  // Datos del emisor (tenant)
  const emisorNombre = tenant?.razonSocial || tenant?.nombre || 'Empresa';
  const emisorNif = tenant?.nifCif || '';
  const emisorDireccion = tenant?.direccionFiscal || '';
  const emisorEmail = tenant?.billingEmail || '';

  // Cálculos
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

  // Calcular IVA desglosado por tasa
  const itemsConIva = items.map(item => {
    const base = item.cantidad * item.precioUnitario;
    const dto = tipoDescuento === 'linea' ? base * (item.descuento || 0) / 100 : 0;
    const tasa = item.tasaImpuestoPorcentaje || 0;
    return {
      ...item,
      baseItem: base,
      descuentoItem: dto,
      tasa,
      importe: base - dto
    };
  });

  // Agrupar IVA por tasa
  const ivaPorTasa: Record<number, number> = {};
  itemsConIva.forEach(item => {
    const tasa = item.tasa;
    const ivaAmount = item.importe * tasa / 100;
    ivaPorTasa[tasa] = (ivaPorTasa[tasa] || 0) + ivaAmount;
  });

  const totalImpuestos = itemsConIva.reduce((sum, item) =>
    sum + (item.importe * item.tasa / 100), 0);

  const total = baseImponible + totalImpuestos;

  // Render items rows
  const itemsRows = itemsConIva.map((item, i) => `
    <tr>
      <td>
        <div class="item-name">${escapeHtml(item.concepto)}</div>
        ${item.descripcion ? `<div class="item-desc">${escapeHtml(item.descripcion)}</div>` : ''}
      </td>
      <td class="text-center">${item.cantidad}</td>
      <td class="text-right">${formatCurrency(item.precioUnitario, moneda)}</td>
      <td class="text-center">${item.tasa > 0 ? `${item.tasa}%` : 'Exento'}</td>
      <td class="text-right">${formatCurrency(item.importe, moneda)}</td>
    </tr>
  `).join('');

  // Render IVA breakdown rows
  const ivaBreakdownRows = Object.entries(ivaPorTasa)
    .sort(([a], [b]) => Number(b) - Number(a))
    .map(([tasaStr, monto]) => `
      <div class="total-row">
        <span>IVA ${Number(tasaStr)}%</span>
        <span>${formatCurrency(monto, moneda)}</span>
      </div>
    `).join('');

  // Render descuento info
  const descuentoHtml = tipoDescuento === 'linea' && descuentoLineas > 0 ? `
    <div class="total-row text-muted">
      <span>Descuentos por l&iacute;nea</span>
      <span>-${formatCurrency(descuentoLineas, moneda)}</span>
    </div>
  ` : tipoDescuento === 'total' && descuentoGlobal > 0 ? `
    <div class="total-row text-muted">
      <span>Descuento global (${descuentoGlobal}%)</span>
      <span>-${formatCurrency(subtotal * descuentoGlobal / 100, moneda)}</span>
    </div>
  ` : '';

  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Factura ${escapeHtml(invoice.numero)}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', 'Inter', Arial, sans-serif;
      font-size: 12px;
      color: #1e293b;
      line-height: 1.5;
    }
    .invoice-container {
      max-width: 800px;
      margin: 0 auto;
      padding: 40px;
      background: #ffffff;
      min-height: 1000px;
      display: flex;
      flex-direction: column;
    }

    /* ── Header ── */
    .invoice-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 3px solid #1e40af;
      padding-bottom: 24px;
      margin-bottom: 28px;
    }
    .emisor-block { flex: 1; }
    .logo-placeholder {
      width: 56px;
      height: 56px;
      background: #1e40af;
      color: white;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 900;
      font-size: 10px;
      border-radius: 10px;
      margin-bottom: 10px;
      letter-spacing: 1px;
    }
    .emisor-name {
      font-size: 18px;
      font-weight: 800;
      color: #0f172a;
      margin: 0 0 4px 0;
    }
    .emisor-nif,
    .emisor-address,
    .emisor-contact {
      font-size: 11px;
      color: #64748b;
      margin: 1px 0;
    }
    .invoice-meta { text-align: right; }
    .meta-badge {
      display: inline-block;
      background: #1e40af;
      color: white;
      font-size: 14px;
      font-weight: 900;
      padding: 4px 16px;
      border-radius: 6px;
      letter-spacing: 2px;
      margin-bottom: 10px;
    }
    .meta-number {
      font-size: 16px;
      font-weight: 700;
      color: #1e293b;
      margin: 4px 0;
    }
    .meta-date {
      font-size: 11px;
      color: #64748b;
      margin: 2px 0;
    }
    .fingerprint {
      font-size: 8px;
      color: #94a3b8;
      word-break: break-all;
      margin-top: 6px;
      max-width: 220px;
    }

    /* ── Cliente ── */
    .cliente-block {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 20px;
      margin-bottom: 28px;
    }
    .section-label {
      display: block;
      font-size: 10px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #1e40af;
      margin-bottom: 8px;
    }
    .cliente-name {
      font-size: 17px;
      font-weight: 700;
      color: #0f172a;
      margin: 0 0 8px 0;
    }
    .cliente-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
      font-size: 12px;
      color: #334155;
    }
    .cliente-grid p { margin: 2px 0; }

    /* ── Items Table ── */
    .invoice-items {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 24px;
      flex-shrink: 0;
    }
    .invoice-items thead { background: #1e40af; color: white; }
    .invoice-items th {
      padding: 12px 10px;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }
    .invoice-items th:first-child { border-radius: 8px 0 0 0; }
    .invoice-items th:last-child { border-radius: 0 8px 0 0; }
    .invoice-items td {
      padding: 14px 10px;
      border-bottom: 1px solid #e2e8f0;
      font-size: 13px;
    }
    .invoice-items tbody tr:last-child td { border-bottom: none; }
    .col-desc { width: 42%; }
    .col-qty { width: 8%; }
    .col-price { width: 16%; }
    .col-tax { width: 12%; }
    .col-total { width: 22%; }

    .item-name { font-weight: 600; color: #0f172a; }
    .item-desc { font-size: 11px; color: #64748b; margin-top: 2px; }
    .text-center { text-align: center; }
    .text-right { text-align: right; }

    /* ── Totals ── */
    .totals-section {
      display: flex;
      justify-content: flex-end;
      margin-bottom: 24px;
    }
    .totals-box { width: 340px; }
    .total-row {
      display: flex;
      justify-content: space-between;
      padding: 7px 0;
      font-size: 14px;
      border-bottom: 1px solid #f1f5f9;
    }
    .total-row:last-child { border-bottom: none; }
    .grand-total {
      border-top: 2px solid #1e40af;
      margin-top: 8px;
      padding-top: 12px;
      font-weight: 900;
      font-size: 20px;
      color: #1e40af;
    }
    .text-muted {
      font-size: 11px;
      color: #94a3b8;
      font-style: italic;
    }

    /* ── Notas ── */
    .notes-section {
      margin-top: auto;
      margin-bottom: 20px;
    }
    .notes-block {
      background: #f8fafc;
      border-radius: 8px;
      padding: 16px;
    }
    .notes-block h3 {
      font-size: 11px;
      font-weight: 800;
      text-transform: uppercase;
      color: #1e40af;
      margin: 0 0 8px 0;
      letter-spacing: 0.05em;
    }
    .notes-block p {
      font-size: 11px;
      color: #64748b;
      margin: 0;
      white-space: pre-wrap;
    }

    /* ── Compliance ── */
    .compliance-footer {
      background: #fffbeb;
      border: 1px solid #fde68a;
      border-radius: 8px;
      padding: 12px 16px;
      margin-bottom: 16px;
    }
    .compliance-text {
      font-size: 10px;
      color: #92400e;
      margin: 0 0 4px 0;
      line-height: 1.4;
    }
    .compliance-ref {
      font-size: 9px;
      color: #a16207;
      font-weight: 600;
      margin: 0;
    }

    /* ── Footer ── */
    .doc-footer {
      text-align: center;
      font-size: 10px;
      color: #94a3b8;
      border-top: 1px solid #e2e8f0;
      padding-top: 16px;
    }
    .doc-footer p { margin: 2px 0; }
    .footer-small { font-size: 9px; color: #cbd5e1; }
  </style>
</head>
<body>
  <div class="invoice-container">
    <!-- Header: Emisor -->
    <div class="invoice-header">
      <div class="emisor-block">
        <div class="logo-placeholder">ERP</div>
        <h1 class="emisor-name">${escapeHtml(emisorNombre)}</h1>
        ${emisorNif ? `<p class="emisor-nif">NIF: ${escapeHtml(emisorNif)}</p>` : ''}
        ${emisorDireccion ? `<p class="emisor-address">${escapeHtml(emisorDireccion)}</p>` : ''}
        ${emisorEmail ? `<p class="emisor-contact">${escapeHtml(emisorEmail)}</p>` : ''}
      </div>
      <div class="invoice-meta">
        <div class="meta-badge">FACTURA</div>
        <p class="meta-number">${escapeHtml(invoice.numero)}</p>
        <p class="meta-date">Fecha emisi&oacute;n: ${formatISODate(invoice.fechaEmision)}</p>
        ${invoice.fechaVencimiento ? `<p class="meta-date">Vencimiento: ${formatISODate(invoice.fechaVencimiento)}</p>` : ''}
        ${invoice.fingerprint ? `<p class="fingerprint">CSV: ${invoice.fingerprint.substring(0, 28)}...</p>` : ''}
      </div>
    </div>

    <!-- Cliente -->
    <div class="cliente-block">
      <span class="section-label">CLIENTE</span>
      <h2 class="cliente-name">${escapeHtml(clienteNombre)}</h2>
      <div class="cliente-grid">
        <div>
          ${clienteNif ? `<p><strong>NIF/CIF:</strong> ${escapeHtml(clienteNif)}</p>` : ''}
          ${clienteDireccion ? `<p><strong>Direcci&oacute;n:</strong> ${escapeHtml(clienteDireccion)}</p>` : ''}
        </div>
        <div>
          ${clienteEmail ? `<p><strong>Email:</strong> ${escapeHtml(clienteEmail)}</p>` : ''}
        </div>
      </div>
    </div>

    <!-- Tabla de conceptos -->
    <table class="invoice-items">
      <thead>
        <tr>
          <th class="col-desc">Descripci&oacute;n</th>
          <th class="col-qty">Cant.</th>
          <th class="col-price">Precio Unit.</th>
          <th class="col-tax">IVA</th>
          <th class="col-total">Importe</th>
        </tr>
      </thead>
      <tbody>
        ${itemsRows || `
        <tr>
          <td colspan="5" class="text-center" style="color:#94a3b8; padding:30px;">
            Sin conceptos detallados
          </td>
        </tr>
        `}
      </tbody>
    </table>

    <!-- Resumen de importes -->
    <div class="totals-section">
      <div class="totals-box">
        <div class="total-row">
          <span>Base Imponible</span>
          <span>${formatCurrency(baseImponible, moneda)}</span>
        </div>
        ${descuentoHtml}
        ${ivaBreakdownRows || '<div class="total-row text-muted"><span>IVA</span><span>0,00 €</span></div>'}
        <div class="total-row grand-total">
          <span>TOTAL FACTURA</span>
          <span>${formatCurrency(total, moneda)}</span>
        </div>
        <div class="total-row text-muted">
          <span>Importe en letra:</span>
          <span>${amountInWords(total)}</span>
        </div>
      </div>
    </div>

    <!-- Notas -->
    ${meta.notas ? `
    <div class="notes-section">
      <div class="notes-block">
        <h3>Notas</h3>
        <p>${escapeHtml(meta.notas)}</p>
      </div>
    </div>
    ` : ''}

    <!-- Cumplimiento Veri*Factu -->
    <div class="compliance-footer">
      <p class="compliance-text">
        Esta factura cumple con los requisitos establecidos en el Reglamento Veri*Factu (RD 1007/2023)
        y la Ley Crea y Crece. Sistema inform&aacute;tico declarado responsablemente ante la AEAT.
      </p>
      <p class="compliance-ref">
        Volkern ERP ${invoice.isSealed ? '· Factura sellada Veri*Factu v2.0' : '· Factura emitida sin sellado electrónico'}
        ${invoice.fingerprint ? `· ${invoice.fingerprint.substring(0, 16)}...` : ''}
      </p>
    </div>

    <!-- Footer -->
    <div class="doc-footer">
      <p>Documento generado electr&oacute;nicamente por ${escapeHtml(emisorNombre)}.</p>
      <p>Conserve esta factura a efectos fiscales.</p>
      <p class="footer-small">Volkern ERP - www.volkern.com</p>
    </div>
  </div>
</body>
</html>
  `;
}

// ─── Route Handler ─────────────────────────────────────────────

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const auth = await authenticateRequest(request, ['billing:read', 'invoices:read']);
    if (!auth.valid || !auth.tenant) {
      return NextResponse.json({ error: auth.error || 'No autorizado' }, { status: 401 });
    }

    const tenantId = auth.tenant.id;

    const invoice = await prisma.invoice.findFirst({
      where: {
        id: params.id,
        tenantId: tenantId
      },
      include: {
        contact: {
          select: {
            nombre: true,
            email: true,
            ubicacion: true,
            perfilFiscal: {
              select: {
                nif: true,
                address: true,
                razonSocial: true
              }
            }
          }
        },
        lead: {
          select: {
            nombre: true,
            email: true
          }
        }
      }
    });

    if (!invoice) {
      return NextResponse.json({ error: 'Factura no encontrada' }, { status: 404 });
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        nombre: true,
        razonSocial: true,
        nifCif: true,
        direccionFiscal: true,
        billingEmail: true
      }
    });

    const htmlContent = generateInvoiceHTML(invoice, tenant);

    // Generar PDF localmente con Puppeteer
    const pdfBuffer = await generatePdf(htmlContent, {
      format: 'A4',
      margin: { top: '20mm', right: '15mm', bottom: '20mm', left: '15mm' },
      printBackground: true,
    });

    const filename = `factura_${invoice.numero.replace(/[^a-zA-Z0-9-]/g, '_')}.pdf`;

    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`
      }
    });
  } catch (error) {
    console.error('[Invoice-PDF] Error generating PDF:', error);
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 });
  }
}
