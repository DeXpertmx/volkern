export const dynamic = 'force-dynamic';
export const maxDuration = 30;

import { NextResponse } from 'next/server'
import { withTenantAuth } from '@/lib/api-key-auth'
import { createWorker } from 'tesseract.js'
import { uploadFile } from '@/lib/s3'

function extractExpenseData(text: string) {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0)
  const fullText = text.toLowerCase()

  const amountRegex = /(\d{1,3}(?:\.\d{3})*(?:,\d{2})|\d+[.,]\d{2}|\d+)/g
  const nifRegex = /([A-Za-z]\d{8})/g
  const dateRegex = /(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/g
  const invoiceRegex = /(?:factura|foli[oó]|n°|nº|no\.?|serie)\s*[:.\s]*([a-z0-9][-a-z0-9/\\s]+)/gi
  const spanishNifRegex = /(([XYZ]|[A-HJ-NPQRSUVW])\d{7}[A-Z]|\d{8}[A-Z])/g

  // ── Totales ──
  const amounts = text.match(amountRegex) || []
  const nifs = text.match(nifRegex) || []

  let total = null
  for (const a of amounts.reverse()) {
    const num = parseFloat(a.replace(/\./g, '').replace(',', '.'))
    if (num > 0 && num < 999999) { total = num; break }
  }

  // ── Número de factura ──
  let invoiceNumber: string | null = null
  const invMatch = text.match(invoiceRegex)
  if (invMatch) {
    invoiceNumber = invMatch[0].replace(/^factura|foli[oó]|n°|nº|no\.?|serie\s*[:.\s]*/i, '').trim()
    if (invoiceNumber.length > 30) invoiceNumber = invoiceNumber.substring(0, 30)
  }

  // ── Proveedor (razón social del emisor) ──
  let supplier = ''
  let issuerName: string | null = null
  // Skip empty/date/number-only lines, find first real text line
  for (const l of lines) {
    const cleaned = l.replace(/[.,:;!?]+$/, '').trim()
    if (cleaned.length < 3) continue
    if (/^\d/.test(cleaned)) continue
    if (/^(factura|foli[oó]|n°|nº|recibo|ticket)/i.test(cleaned)) continue
    if (/^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}/.test(cleaned)) continue
    supplier = cleaned
    break
  }
  if (!supplier && lines.length > 0) supplier = lines[0]
  issuerName = supplier || null

  // ── NIF del emisor (priorizar formato español) ──
  let issuerTaxId: string | null = null
  const spanishNifs = text.match(spanishNifRegex)
  if (spanishNifs) {
    issuerTaxId = spanishNifs[0]
  } else if (nifs.length > 0) {
    issuerTaxId = nifs[0]
  }

  // ── Fechas ──
  const dates = text.match(dateRegex) || []
  let date: string | null = dates[0] || null
  let operationDate: string | null = dates.length > 1 ? dates[1] : null
  // Si la segunda fecha es igual a la primera, ignorar
  if (operationDate === date) operationDate = null

  // ── Base imponible, IVA ──
  let taxableBase: number | null = null
  let vatRate: number | null = null
  let vatAmount: number | null = null

  // Buscar línea que contenga "base" o "subtotal" y extraer el número
  const baseLine = lines.find(l => /base\s*(imponible)?|subtotal/i.test(l))
  if (baseLine) {
    const baseAmounts = baseLine.match(amountRegex)
    if (baseAmounts) {
      for (const a of baseAmounts) {
        const num = parseFloat(a.replace(/\./g, '').replace(',', '.'))
        if (num > 0 && num < 999999) { taxableBase = num; break }
      }
    }
  }
  // Fallback: asumir que taxableBase es ~total/1.21 si no se detecta
  if (taxableBase === null && total !== null) {
    // Solo como respaldo si no hay base visible (heuristic)
  }

  // Buscar IVA rate (e.g., "21%", "IVA 21", "16%")
  const vatRateMatch = text.match(/(?:iva|impuesto)\s*[:.]?\s*(\d{1,2}(?:[.,]\d)?)\s*%/i)
  if (vatRateMatch) {
    vatRate = parseFloat(vatRateMatch[1].replace(',', '.'))
  }

  // Buscar cuota IVA (e.g., "IVA 21,00", "CUOTA IVA 10.50", "TOTAL IVA")
  const vatAmountLine = lines.find(l => /(?:iva|cuota)\s*/.test(l) && /[\d]+[.,]\d{2}/.test(l))
  if (vatAmountLine) {
    const vatAmounts = vatAmountLine.match(amountRegex)
    if (vatAmounts) {
      for (const a of vatAmounts) {
        const num = parseFloat(a.replace(/\./g, '').replace(',', '.'))
        if (num > 0 && num < 999999) { vatAmount = num; break }
      }
    }
  }

  // ── Dirección del emisor ──
  let issuerAddress: string | null = null
  const addressLine = lines.find(l =>
    /^(c\/|calle|avda|av\.|avenida|plaza|pl|paseo|ps|ronda|carrera|camino|via)/i.test(l)
  )
  if (addressLine) {
    issuerAddress = addressLine.replace(/^[.,:;!?\s]+/, '').trim()
  }

  // ── Categoría ──
  const categoryKeywords: Record<string, string[]> = {
    alimentacion: ['supermercado', 'restaurante', 'comida', 'bar', 'cafeteria', 'alimentacion'],
    transporte: ['gasolina', 'combustible', 'parking', 'peaje', 'taxi', 'uber', 'transporte', 'aena', 'renfe'],
    suministros: ['luz', 'agua', 'gas', 'telefono', 'internet', 'suministro'],
    oficina: ['papeleria', 'material', 'oficina', 'amazon', 'libreria'],
    tecnologia: ['software', 'hosting', 'dominio', 'informatica', 'ordenador'],
    marketing: ['publicidad', 'ads', 'google', 'meta', 'instagram'],
    profesional: ['asesoria', 'gestoria', 'notario', 'abogado', 'registro'],
  }

  let category = 'otros'
  for (const [cat, keywords] of Object.entries(categoryKeywords)) {
    if (keywords.some(k => fullText.includes(k))) { category = cat; break }
  }

  return {
    supplier: supplier || null,
    total,
    nif: issuerTaxId,
    date,
    category,
    invoiceNumber,
    taxableBase,
    vatRate,
    vatAmount,
    operationDate,
    issuerName,
    issuerAddress,
    issuerTaxId,
    rawText: text.substring(0, 500),
  }
}

function ocrWithTimeout(buffer: Buffer, timeoutMs = 20000): Promise<string> {
  return new Promise(async (resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('OCR_TIMEOUT'))
    }, timeoutMs)

    try {
      const worker = await createWorker('spa')
      const { data: { text } } = await worker.recognize(buffer)
      await worker.terminate()
      clearTimeout(timer)
      resolve(text)
    } catch (err) {
      clearTimeout(timer)
      reject(err)
    }
  })
}

export const POST = withTenantAuth(async (req, auth) => {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: 'No se proporcionó imagen' }, { status: 400 })
    }

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)

    const receiptUrl = await uploadFile(buffer, `receipts/${auth.tenant!.id}/${Date.now()}-${file.name}`, file.type || 'image/jpeg')

    let text = ''
    let ocrOk = false
    try {
      text = await ocrWithTimeout(buffer)
      ocrOk = true
    } catch (err: any) {
      if (err?.message === 'OCR_TIMEOUT') {
        console.warn('[ExpenseScan] OCR timed out')
      } else {
        console.error('[ExpenseScan] OCR error:', err)
      }
    }

    const extracted = ocrOk ? extractExpenseData(text) : {
      supplier: null,
      total: null,
      nif: null,
      date: null,
      category: 'otros',
      invoiceNumber: null,
      taxableBase: null,
      vatRate: null,
      vatAmount: null,
      operationDate: null,
      issuerName: null,
      issuerAddress: null,
      issuerTaxId: null,
      rawText: '',
    }

    return NextResponse.json({
      success: ocrOk,
      receiptUrl,
      ocrTimedOut: !ocrOk,
      extracted,
    })
  } catch (error: any) {
    console.error('[ExpenseScan] Error:', error)
    return NextResponse.json({ error: 'Error al procesar la imagen' }, { status: 500 })
  }
})
