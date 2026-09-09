/**
 * Generador del documento oficial de Orden de Venta (HTML → PDF server-side,
 * misma técnica que lib/cotizaciones/cotizacion-pdf.ts + lib/pdf-generator.ts).
 *
 * El PDF es un documento REAL (texto vectorial, A4, paginable), no una captura:
 * se genera con Chromium headless a partir de este HTML autocontenido.
 */

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

const CURRENCY_SYMBOLS: Record<string, string> = {
  EUR: '€',
  USD: '$',
  MXN: '$',
  GBP: '£',
  JPY: '¥',
  CNY: '¥',
}

/**
 * Formatea un importe con símbolo de moneda y 2 decimales, de forma
 * determinista (sin depender del ICU de Node):
 *   EUR/GBP → "2.380,00 €" (punto de miles, coma decimal)
 *   resto   → "$2,380.00" (coma de miles, punto decimal)
 */
export function formatOrdenCurrency(amount: number, currency: string): string {
  const symbol = CURRENCY_SYMBOLS[currency] || `${currency} `
  const value = numberValue(amount)
  const esEuropea = currency === 'EUR' || currency === 'GBP'
  const sepMiles = esEuropea ? '.' : ','
  const sepDecimal = esEuropea ? ',' : '.'

  const negativo = value < 0
  const abs = Math.abs(value)
  const entero = Math.trunc(abs).toString().replace(/\B(?=(\d{3})+(?!\d))/g, sepMiles)
  const decimales = abs.toFixed(2).split('.')[1]
  const monto = `${entero}${sepDecimal}${decimales}`
  const prefijo = negativo ? '-' : ''

  if (esEuropea) {
    return `${prefijo}${monto} ${symbol}`
  }
  return `${prefijo}${symbol}${monto}`
}

export function formatOrdenDate(date: Date | string | null | undefined): string {
  if (!date) return '—'
  const parsed = typeof date === 'string' ? new Date(date) : date
  if (!parsed || Number.isNaN(parsed.getTime())) return '—'
  const dd = String(parsed.getDate()).padStart(2, '0')
  const mm = String(parsed.getMonth() + 1).padStart(2, '0')
  const yyyy = parsed.getFullYear()
  return `${dd}/${mm}/${yyyy}`
}

/** Estados en los que la orden ya fue aceptada (soporte para el cliente). */
const ESTADOS_ACEPTADA = new Set([
  'confirmada', 'en_proceso', 'pendiente_finanzas', 'facturada', 'entregada', 'completada',
])

const ESTADO_LABEL: Record<string, string> = {
  borrador: 'Registrada',
  confirmada: 'Confirmada',
  en_proceso: 'En proceso',
  pendiente_finanzas: 'En revisión financiera',
  facturada: 'Facturada',
  entregada: 'Entregada',
  completada: 'Completada',
  cancelada: 'Cancelada',
}

interface OrdenLineaPdf {
  concepto: string
  descripcion: string
  cantidad: number
  precioUnitario: number
  descuento: number
  subtotal: number
}

function normalizeLineas(orden: any): OrdenLineaPdf[] {
  return (Array.isArray(orden.items) ? orden.items : []).map((item: any) => {
    const cantidad = numberValue(item.cantidad, 1)
    const precioUnitario = numberValue(item.precioUnitario)
    const importeBruto = Math.round(cantidad * precioUnitario * 100) / 100
    const descuento = Math.max(0, numberValue(item.descuento))
    // descuento guardado como % sobre el bruto de línea
    const descuentoMonto = Math.min(importeBruto, (importeBruto * descuento) / 100)
    const subtotal = Math.round((importeBruto - descuentoMonto) * 100) / 100
    return {
      concepto: item.concepto || 'Servicio',
      descripcion: item.descripcion || '',
      cantidad,
      precioUnitario,
      descuento,
      subtotal,
    }
  })
}

function joinAddress(parts: Array<string | null | undefined>): string {
  return parts.filter(Boolean).join(', ')
}

export function generateOrdenVentaHTML(
  orden: any,
  opts: { companyName?: string; logoUrl?: string } = {}
): string {
  const numero = orden.numero || 'OV'
  const moneda = orden.moneda || 'EUR'
  const estado = String(orden.estado || 'borrador').toLowerCase()
  const aceptada = ESTADOS_ACEPTADA.has(estado)
  const lineas = normalizeLineas(orden)

  // Emisor: emisor fiscal configurado > identidad del tenant
  const emisor = orden.emisor || {}
  const nombreEmisor = emisor.razonSocial || emisor.nombreComercial || opts.companyName || orden.tenant?.nombre || 'Empresa'
  const direccionEmisor = joinAddress([emisor.direccion, emisor.ciudad, emisor.codigoPostal, emisor.pais])
  const logoUrl = opts.logoUrl || emisor.logoUrl || ''
  const idFiscalEmisor = emisor.idFiscal || ''
  const emailEmisor = emisor.email || ''
  const telefonoEmisor = emisor.telefono || ''

  const cliente = orden.lead || orden.contact || {}
  const nombreCliente = cliente.nombre || 'Cliente'
  const empresaCliente = cliente.empresa || ''
  const emailCliente = cliente.email || ''
  const telefonoCliente = cliente.telefono || ''

  const descuentoGlobal = Math.max(0, numberValue(orden.descuentoGlobal))
  const totalImpuestos = Math.max(0, numberValue(orden.totalImpuestos))
  const totalRetenciones = Math.max(0, numberValue(orden.totalRetenciones))
  const subtotal = Math.max(0, numberValue(orden.subtotal))
  const total = numberValue(orden.total, subtotal - descuentoGlobal + totalImpuestos - totalRetenciones)

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>Orden de Venta ${escapeHtml(numero)}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 11px; color: #1f2937; line-height: 1.5; }
  .page { width: 100%; }
  .accept-band { background: #059669; color: #fff; border-radius: 8px; padding: 12px 18px; margin-bottom: 22px; }
  .accept-band .title { font-size: 15px; font-weight: 800; text-transform: uppercase; letter-spacing: .3px; }
  .accept-band .sub { font-size: 10px; opacity: .92; margin-top: 2px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; gap: 20px; margin-bottom: 20px; border-bottom: 3px solid #111827; padding-bottom: 14px; }
  .brand { display: flex; align-items: center; gap: 12px; min-width: 0; }
  .brand img { max-height: 64px; max-width: 200px; object-fit: contain; }
  .brand-name { font-size: 17px; font-weight: 800; color: #1d4ed8; text-transform: uppercase; letter-spacing: -.2px; }
  .brand-id { font-size: 9px; color: #6b7280; font-family: 'Courier New', monospace; }
  .doc-info { text-align: right; }
  .doc-title { font-size: 24px; font-weight: 800; text-transform: uppercase; letter-spacing: -.5px; color: #111827; }
  .doc-number { font-size: 15px; color: #6b7280; font-family: 'Courier New', monospace; margin-top: 2px; }
  .doc-date { font-size: 9px; text-transform: uppercase; color: #6b7280; font-weight: 700; margin-top: 8px; }
  .doc-date strong { display: block; font-size: 13px; color: #111827; }
  .partes { display: flex; justify-content: space-between; gap: 26px; margin-bottom: 22px; }
  .parte { flex: 1; }
  .parte h3 { font-size: 9px; letter-spacing: 1.4px; text-transform: uppercase; color: #1d4ed8; font-weight: 800; margin-bottom: 4px; }
  .parte .nombre { font-size: 15px; font-weight: 700; color: #111827; }
  .parte .detalle { font-size: 10px; color: #6b7280; margin-top: 3px; }
  table.items { width: 100%; border-collapse: collapse; margin-bottom: 18px; }
  table.items th { background: #111827; color: #fff; padding: 8px 8px; font-size: 8.5px; text-transform: uppercase; letter-spacing: .5px; text-align: left; }
  table.items th.r, table.items td.r { text-align: right; }
  table.items th.c, table.items td.c { text-align: center; }
  table.items td { padding: 9px 8px; border-bottom: 1px solid #e5e7eb; vertical-align: top; }
  .item-name { font-weight: 600; color: #111827; }
  .item-desc { font-size: 9px; color: #6b7280; margin-top: 2px; white-space: pre-wrap; }
  .summary { display: flex; justify-content: flex-end; margin-bottom: 20px; }
  .totals { width: 300px; }
  .row { display: flex; justify-content: space-between; padding: 5px 0; color: #4b5563; font-size: 11px; }
  .row.grand { background: #0f172a; color: #fff; padding: 11px 12px; border-radius: 8px; margin-top: 8px; font-size: 13px; font-weight: 800; }
  .row.grand .lbl { text-transform: uppercase; font-size: 10px; letter-spacing: 1px; }
  .row.grand .amt { font-size: 18px; font-weight: 800; }
  .row.negative span:last-child { color: #047857; }
  .notas { margin-bottom: 16px; }
  .notas h4 { font-size: 9.5px; letter-spacing: 1px; text-transform: uppercase; color: #1d4ed8; margin-bottom: 4px; }
  .notas .contenido { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 7px; padding: 10px 12px; color: #475569; font-size: 10px; white-space: pre-wrap; }
  .footer { border-top: 1px solid #e5e7eb; padding-top: 12px; text-align: center; color: #9ca3af; font-size: 8.5px; margin-top: 18px; }
  .footer p { margin-bottom: 3px; }
</style>
</head>
<body>
<div class="page">
  ${aceptada ? `<div class="accept-band">
    <div class="title">Trabajo aceptado y confirmado</div>
    <div class="sub">Este documento confirma que el servicio ha sido aceptado y la orden registrada en el sistema.</div>
  </div>` : ''}

  <div class="header">
    <div class="brand">
      ${logoUrl
        ? `<img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(nombreEmisor)}" />`
        : `<div>
             <div class="brand-name">${escapeHtml(nombreEmisor)}</div>
             ${idFiscalEmisor ? `<div class="brand-id">${escapeHtml(idFiscalEmisor)}</div>` : ''}
           </div>`}
    </div>
    <div class="doc-info">
      <div class="doc-title">Orden de Venta</div>
      <div class="doc-number">${escapeHtml(numero)}</div>
      <div class="doc-date">Fecha de emisión<strong>${formatOrdenDate(orden.fechaOrden)}</strong></div>
      <div style="display:inline-block;margin-top:8px;padding:4px 12px;border-radius:20px;font-size:9px;font-weight:700;text-transform:uppercase;background:#eef2ff;color:#4338ca;">${escapeHtml(ESTADO_LABEL[estado] || estado)}</div>
    </div>
  </div>

  <div class="partes">
    <div class="parte">
      <h3>De:</h3>
      <div class="nombre">${escapeHtml(nombreEmisor)}</div>
      <div class="detalle">
        ${direccionEmisor ? escapeHtml(direccionEmisor) : ''}
        ${emailEmisor ? `<br>${escapeHtml(emailEmisor)}` : ''}
        ${telefonoEmisor ? `<br>${escapeHtml(telefonoEmisor)}` : ''}
      </div>
    </div>
    <div class="parte">
      <h3>Para:</h3>
      <div class="nombre">${escapeHtml(nombreCliente)}</div>
      <div class="detalle">
        ${empresaCliente ? escapeHtml(empresaCliente) : ''}
        ${emailCliente ? `<br>${escapeHtml(emailCliente)}` : ''}
        ${telefonoCliente ? `<br>${escapeHtml(telefonoCliente)}` : ''}
      </div>
    </div>
  </div>

  <table class="items">
    <thead>
      <tr>
        <th style="width:42%">Descripción</th>
        <th class="c" style="width:8%">Cant.</th>
        <th class="r" style="width:16%">Precio</th>
        <th class="r" style="width:12%">Dto. %</th>
        <th class="r" style="width:22%">Total</th>
      </tr>
    </thead>
    <tbody>
      ${lineas.map(linea => `
        <tr>
          <td>
            <div class="item-name">${escapeHtml(linea.concepto)}</div>
            ${linea.descripcion ? `<div class="item-desc">${escapeHtml(linea.descripcion)}</div>` : ''}
          </td>
          <td class="c">${linea.cantidad}</td>
          <td class="r">${formatOrdenCurrency(linea.precioUnitario, moneda)}</td>
          <td class="r">${linea.descuento > 0 ? `${linea.descuento}%` : '—'}</td>
          <td class="r"><strong>${formatOrdenCurrency(linea.subtotal, moneda)}</strong></td>
        </tr>
      `).join('')}
      ${lineas.length === 0 ? '<tr><td colspan="5" style="text-align:center;color:#9ca3af;padding:16px;">Sin líneas</td></tr>' : ''}
    </tbody>
  </table>

  <div class="summary">
    <div class="totals">
      <div class="row"><span>Subtotal</span><span>${formatOrdenCurrency(subtotal, moneda)}</span></div>
      ${descuentoGlobal > 0 ? `<div class="row negative"><span>Descuento</span><span>-${formatOrdenCurrency(descuentoGlobal, moneda)}</span></div>` : ''}
      <div class="row"><span>Impuestos</span><span>${formatOrdenCurrency(totalImpuestos, moneda)}</span></div>
      ${totalRetenciones > 0 ? `<div class="row negative"><span>Retenciones</span><span>-${formatOrdenCurrency(totalRetenciones, moneda)}</span></div>` : ''}
      <div class="row grand">
        <span class="lbl">Total documento</span>
        <span class="amt">${formatOrdenCurrency(total, moneda)}</span>
      </div>
      <div style="text-align:right;font-size:9px;color:#9ca3af;font-weight:700;text-transform:uppercase;margin-top:5px;">Moneda: ${escapeHtml(moneda)}</div>
    </div>
  </div>

  ${orden.condicionesVenta ? `<div class="notas"><h4>Términos y Condiciones</h4><div class="contenido">${escapeHtml(orden.condicionesVenta)}</div></div>` : ''}
  ${orden.notas ? `<div class="notas"><h4>Notas</h4><div class="contenido">${escapeHtml(orden.notas)}</div></div>` : ''}
  ${orden.referenciaCliente ? `<div class="notas"><h4>Referencia</h4><div class="contenido">${escapeHtml(orden.referenciaCliente)}</div></div>` : ''}

  <div class="footer">
    <p>Documento generado electrónicamente por ${escapeHtml(nombreEmisor)}</p>
    <p>Si tienes dudas sobre esta orden, contacta con ${escapeHtml(nombreEmisor)}.</p>
  </div>
</div>
</body>
</html>`
}
