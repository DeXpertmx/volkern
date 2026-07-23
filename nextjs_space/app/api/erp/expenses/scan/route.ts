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

  const amounts = text.match(amountRegex) || []
  const nifs = text.match(nifRegex) || []
  const dates = text.match(dateRegex) || []

  let total = null
  for (const a of amounts.reverse()) {
    const num = parseFloat(a.replace(/\./g, '').replace(',', '.'))
    if (num > 0 && num < 999999) { total = num; break }
  }

  let supplier = ''
  if (lines.length > 0) supplier = lines[0]
  if (lines.length > 1 && !supplier.toLowerCase().includes('factura')) supplier = lines[1]

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
    nif: nifs[0] || null,
    date: dates[0] || null,
    category,
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
