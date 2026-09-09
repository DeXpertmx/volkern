import { resolvePlaceholders } from '@/lib/contratos/placeholders';

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function numberValue(value: unknown, fallback = 0): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

export function formatCotizacionCurrency(amount: number, currency: string): string {
  const symbols: Record<string, string> = { MXN: '$', USD: '$', EUR: '€' }
  const symbol = symbols[currency] || currency || '$'
  return `${symbol}${numberValue(amount).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function formatCotizacionDate(date: Date | string | null | undefined): string {
  if (!date) return '—'
  const parsed = new Date(date)
  if (Number.isNaN(parsed.getTime())) return '—'
  return parsed.toLocaleDateString('es-MX', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

interface PdfLine {
  concepto: string
  descripcion: string
  cantidad: number
  precioUnitario: number
  importeBruto: number
  descuento: number
  subtotal: number
  porcentajeImpuesto: number
  montoImpuesto: number
  total: number
}

function normalizeLines(cotizacion: any): PdfLine[] {
  return (Array.isArray(cotizacion.items) ? cotizacion.items : []).map((item: any) => {
    const cantidad = numberValue(item.cantidad, 1)
    const precioUnitario = numberValue(item.precioUnitario)
    const importeBruto = Math.round(cantidad * precioUnitario * 100) / 100
    const descuento = Math.min(importeBruto, Math.max(0, numberValue(item.descuento)))
    const calculatedSubtotal = Math.round((importeBruto - descuento) * 100) / 100
    // No arrastrar al PDF totales negativos generados por la versión anterior.
    const subtotal = Math.max(0, numberValue(item.subtotal, calculatedSubtotal))
    const porcentajeImpuesto = Math.max(0, numberValue(item.porcentajeImpuesto))
    const calculatedTax = Math.round(subtotal * porcentajeImpuesto / 100 * 100) / 100
    const montoImpuesto = Math.max(0, numberValue(item.montoImpuesto, calculatedTax))
    const total = Math.max(0, numberValue(item.total, subtotal + montoImpuesto))

    return {
      concepto: item.concepto || item.nombre || 'Concepto',
      descripcion: item.descripcion || '',
      cantidad,
      precioUnitario,
      importeBruto,
      descuento,
      subtotal,
      porcentajeImpuesto,
      montoImpuesto,
      total,
    }
  })
}

export function generateCotizacionHTML(
  cotizacion: any,
  tenant: any,
  opts: { logoUrl?: string; companyName?: string } = {}
): string {
  const safeTenant = tenant || {}
  const currency = cotizacion.moneda || 'EUR'
  const lines = normalizeLines(cotizacion)
  const subtotalBruto = Math.round(lines.reduce((sum, item) => sum + item.importeBruto, 0) * 100) / 100
  const descuentosLineas = Math.round(lines.reduce((sum, item) => sum + item.descuento, 0) * 100) / 100
  const subtotal = Math.round(lines.reduce((sum, item) => sum + item.subtotal, 0) * 100) / 100
  const requestedGlobalDiscount = Math.max(0, numberValue(cotizacion.descuentoMonto))
  const descuentoGlobal = Math.min(subtotal, requestedGlobalDiscount)
  const baseImponible = Math.round((subtotal - descuentoGlobal) * 100) / 100
  const impuestosLineas = lines.reduce((sum, item) => sum + item.montoImpuesto, 0)
  const factorGlobal = subtotal > 0 ? baseImponible / subtotal : 1
  const impuestos = Math.round(impuestosLineas * factorGlobal * 100) / 100
  const total = Math.round((baseImponible + impuestos) * 100) / 100
  const tieneDescuentoGlobal = descuentoGlobal > 0
  const fechaVencimiento = cotizacion.fechaVencimiento
  const vencida = fechaVencimiento && new Date(fechaVencimiento) < new Date()
  const estado = escapeHtml((cotizacion.estado || 'borrador').toLowerCase())
  const descuentoGlobalLabel = numberValue(cotizacion.descuentoPorcentaje) > 0
    ? ` (${numberValue(cotizacion.descuentoPorcentaje)}%)`
    : ''
  const clausulas = resolvePlaceholders(
    cotizacion.clausulas,
    {
      clienteNombre: cotizacion.clienteNombre,
      clienteEmpresa: cotizacion.clienteEmpresa,
      clienteEmail: cotizacion.clienteEmail,
      clienteTelefono: cotizacion.clienteTelefono,
      numero: cotizacion.numero,
      titulo: cotizacion.titulo,
      fechaInicio: cotizacion.fechaCreacion,
      fechaFin: cotizacion.fechaVencimiento,
      moneda: cotizacion.moneda,
      subtotal: cotizacion.subtotal,
      descuentoMonto: cotizacion.descuentoMonto,
      impuestos: cotizacion.impuestos,
      total: cotizacion.total,
    },
    safeTenant,
  )

  return `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Cotización ${escapeHtml(cotizacion.numero)}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 11px; color: #333; line-height: 1.45; }
    .container { max-width: 800px; margin: 0 auto; padding: 36px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 34px; border-bottom: 3px solid #2563eb; padding-bottom: 18px; }
    .company-info h1 { font-size: 24px; color: #1e40af; margin-bottom: 5px; }
    .company-info p { color: #666; font-size: 10px; }
    .company-info img { max-height: 64px; max-width: 220px; object-fit: contain; }
    .quote-info { text-align: right; }
    .quote-number { font-size: 20px; font-weight: bold; color: #1e40af; }
    .quote-dates { margin-top: 8px; font-size: 10px; color: #666; }
    .quote-dates span { display: block; }
    .status-badge { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 9px; font-weight: 600; text-transform: uppercase; margin-top: 8px; }
    .status-borrador { background: #e5e7eb; color: #374151; }
    .status-enviada { background: #dbeafe; color: #1d4ed8; }
    .status-vista { background: #fef3c7; color: #92400e; }
    .status-aceptada { background: #d1fae5; color: #065f46; }
    .status-rechazada { background: #fee2e2; color: #991b1b; }
    .status-vencida { background: #f3f4f6; color: #6b7280; }
    .client-section { background: #f8fafc; border-radius: 8px; padding: 18px; margin-bottom: 26px; }
    .client-section h3 { font-size: 11px; color: #64748b; text-transform: uppercase; margin-bottom: 8px; letter-spacing: .5px; }
    .client-name { font-size: 15px; font-weight: 600; color: #1e293b; }
    .client-details { color: #64748b; font-size: 10px; margin-top: 4px; }
    .validity-notice { background: #fef3c7; border-radius: 8px; padding: 10px 14px; margin-bottom: 26px; font-size: 10px; color: #92400e; text-align: center; }
    .items-table { width: 100%; border-collapse: collapse; margin-bottom: 26px; }
    .items-table th { background: #1e40af; color: white; padding: 10px 8px; text-align: left; font-size: 9px; text-transform: uppercase; letter-spacing: .3px; }
    .items-table th:first-child { border-radius: 7px 0 0 0; }
    .items-table th:last-child { border-radius: 0 7px 0 0; }
    .items-table td { padding: 11px 8px; border-bottom: 1px solid #e5e7eb; vertical-align: top; }
    .items-table .item-name { font-weight: 500; color: #1e293b; }
    .items-table .item-desc { font-size: 9px; color: #64748b; margin-top: 2px; }
    .items-table .item-discount { color: #047857; font-size: 9px; }
    .items-table .item-tax { color: #475569; font-size: 9px; white-space: nowrap; }
    .text-right { text-align: right; }
    .text-center { text-align: center; }
    .totals-section { display: flex; justify-content: flex-end; margin-bottom: 26px; }
    .totals-box { width: 320px; }
    .total-row { display: flex; justify-content: space-between; gap: 20px; padding: 7px 0; border-bottom: 1px solid #e5e7eb; }
    .total-label { color: #64748b; }
    .discount-row .total-label, .discount-row span:last-child { color: #047857; }
    .total-row.grand-total { background: #1e40af; color: white; padding: 11px 14px; border-radius: 7px; margin-top: 8px; font-size: 15px; font-weight: bold; }
    .total-row.grand-total .total-label { color: white; }
    .notes-section { margin-bottom: 26px; }
    .notes-section h4 { font-size: 11px; color: #1e40af; margin-bottom: 7px; text-transform: uppercase; letter-spacing: .5px; }
    .notes-content { background: #f8fafc; border-radius: 7px; padding: 13px; font-size: 10px; color: #64748b; white-space: pre-wrap; }
    .footer { border-top: 1px solid #e5e7eb; padding-top: 18px; text-align: center; color: #94a3b8; font-size: 9px; }
    .footer p { margin-bottom: 4px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="company-info">
        ${opts.logoUrl
          ? `<img src="${escapeHtml(opts.logoUrl)}" alt="${escapeHtml(opts.companyName || safeTenant.nombre || 'Empresa')}" />`
          : `<h1>${escapeHtml(opts.companyName || safeTenant.nombre || 'Empresa')}</h1>`}
        ${safeTenant.direccion ? `<p>${escapeHtml(safeTenant.direccion)}</p>` : ''}
        ${safeTenant.telefono ? `<p>Tel: ${escapeHtml(safeTenant.telefono)}</p>` : ''}
        ${safeTenant.email ? `<p>${escapeHtml(safeTenant.email)}</p>` : ''}
      </div>
      <div class="quote-info">
        <div class="quote-number">${escapeHtml(cotizacion.numero)}</div>
        <div class="quote-dates">
          <span>Fecha: ${formatCotizacionDate(cotizacion.fechaCreacion)}</span>
          <span>Válida hasta: ${formatCotizacionDate(fechaVencimiento)}</span>
        </div>
        <span class="status-badge status-${estado}">${estado}</span>
      </div>
    </div>

    <div class="client-section">
      <h3>Cliente</h3>
      <div class="client-name">${escapeHtml(cotizacion.clienteNombre || 'Sin nombre')}</div>
      <div class="client-details">
        ${cotizacion.clienteEmpresa ? `${escapeHtml(cotizacion.clienteEmpresa)}<br>` : ''}
        ${cotizacion.clienteEmail ? `${escapeHtml(cotizacion.clienteEmail)}<br>` : ''}
        ${escapeHtml(cotizacion.clienteTelefono || '')}
      </div>
    </div>

    <div class="validity-notice">${vencida ? `⚠️ Esta cotización ha vencido el ${formatCotizacionDate(fechaVencimiento)}` : `📅 Esta cotización es válida hasta el ${formatCotizacionDate(fechaVencimiento)}`}</div>

    <table class="items-table">
      <thead>
        <tr>
          <th style="width: 31%">Descripción</th>
          <th class="text-center" style="width: 9%">Cant.</th>
          <th class="text-right" style="width: 15%">Precio Unit.</th>
          <th class="text-right" style="width: 16%">Descuento</th>
          <th class="text-right" style="width: 14%">IVA</th>
          <th class="text-right" style="width: 15%">Total</th>
        </tr>
      </thead>
      <tbody>
        ${lines.map(item => `
          <tr>
            <td>
              <div class="item-name">${escapeHtml(item.concepto)}</div>
              ${item.descripcion ? `<div class="item-desc">${escapeHtml(item.descripcion)}</div>` : ''}
            </td>
            <td class="text-center">${item.cantidad}</td>
            <td class="text-right">${formatCotizacionCurrency(item.precioUnitario, currency)}</td>
            <td class="text-right item-discount">${item.descuento > 0 ? `-${formatCotizacionCurrency(item.descuento, currency)}` : '—'}</td>
            <td class="text-right item-tax">${item.porcentajeImpuesto}%<br>${formatCotizacionCurrency(item.montoImpuesto * factorGlobal, currency)}</td>
            <td class="text-right">${formatCotizacionCurrency(item.subtotal * factorGlobal + item.montoImpuesto * factorGlobal, currency)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>

    <div class="totals-section">
      <div class="totals-box">
        <div class="total-row">
          <span class="total-label">Subtotal bruto</span>
          <span>${formatCotizacionCurrency(subtotalBruto, currency)}</span>
        </div>
        ${descuentosLineas > 0 ? `<div class="total-row discount-row"><span class="total-label">Descuentos por línea</span><span>-${formatCotizacionCurrency(descuentosLineas, currency)}</span></div>` : ''}
        <div class="total-row">
          <span class="total-label">Subtotal</span>
          <span>${formatCotizacionCurrency(subtotal, currency)}</span>
        </div>
        ${tieneDescuentoGlobal ? `<div class="total-row discount-row"><span class="total-label">Descuento global${escapeHtml(descuentoGlobalLabel)}</span><span>-${formatCotizacionCurrency(descuentoGlobal, currency)}</span></div>` : ''}
        <div class="total-row">
          <span class="total-label">Base imponible</span>
          <span>${formatCotizacionCurrency(baseImponible, currency)}</span>
        </div>
        <div class="total-row">
          <span class="total-label">IVA / impuestos</span>
          <span>${formatCotizacionCurrency(impuestos, currency)}</span>
        </div>
        <div class="total-row grand-total">
          <span class="total-label">Total ${escapeHtml(currency)}</span>
          <span>${formatCotizacionCurrency(total, currency)}</span>
        </div>
      </div>
    </div>

    ${cotizacion.terminosPago || cotizacion.condicionesPago ? `<div class="notes-section"><h4>Condiciones de Pago</h4><div class="notes-content">${escapeHtml(cotizacion.terminosPago || cotizacion.condicionesPago)}</div></div>` : ''}
    ${cotizacion.notasCliente ? `<div class="notes-section"><h4>Notas</h4><div class="notes-content">${escapeHtml(cotizacion.notasCliente)}</div></div>` : ''}
    ${clausulas ? `<div class="notes-section"><h4>Cláusulas</h4><div class="notes-content">${escapeHtml(clausulas)}</div></div>` : ''}

    <div class="footer">
      <p>Cotización generada por ${escapeHtml(safeTenant.nombre || 'Volkern CRM')}</p>
      <p>Documento generado el ${formatCotizacionDate(new Date())}</p>
    </div>
  </div>
</body>
</html>
  `
}
