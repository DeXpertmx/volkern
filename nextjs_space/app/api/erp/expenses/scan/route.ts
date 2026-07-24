export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { NextResponse } from 'next/server'
import { withTenantAuth } from '@/lib/api-key-auth'
import { uploadFile } from '@/lib/s3'

interface VisionResult {
  supplier: string | null
  total: number | null
  nif: string | null
  date: string | null
  category: string
  invoiceNumber: string | null
  taxableBase: number | null
  vatRate: number | null
  vatAmount: number | null
  operationDate: string | null
  issuerName: string | null
  issuerAddress: string | null
  issuerTaxId: string | null
}

const FALLBACK: VisionResult = {
  supplier: null, total: null, nif: null, date: null, category: 'otros',
  invoiceNumber: null, taxableBase: null, vatRate: null, vatAmount: null,
  operationDate: null, issuerName: null, issuerAddress: null, issuerTaxId: null,
}

async function visionExtract(buffer: Buffer, mimeType: string): Promise<VisionResult | null> {
  const GOOGLE_AI_KEY = process.env.GOOGLE_AI_KEY
  if (!GOOGLE_AI_KEY) return null

  const MODEL = process.env.GEMMA_MODEL || 'gemini-1.5-flash-latest'
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GOOGLE_AI_KEY}`

  const prompt = `Extrae los datos de esta factura o ticket y devuelve SOLO un JSON sin texto adicional (ni markdown, ni code blocks, ni explicaciones). Usa este esquema exacto:
{
  "supplier": "nombre del proveedor o null",
  "total": 123.45 o null,
  "nif": "NIF del emisor o null",
  "date": "DD/MM/AAAA o null",
  "category": "alimentacion|transporte|suministros|oficina|tecnologia|marketing|profesional|otros",
  "invoiceNumber": "número de factura o null",
  "taxableBase": 123.45 o null,
  "vatRate": 21 o null (solo número, sin %),
  "vatAmount": 12.34 o null,
  "operationDate": "DD/MM/AAAA solo si distinta a la fecha de emisión o null",
  "issuerName": "razón social del emisor o null",
  "issuerAddress": "domicilio fiscal completo o null",
  "issuerTaxId": "NIF del emisor o null"
}

Los números decimales usa punto como separador (ej: 123.45). No incluyas nada más que el JSON.`

  try {
    const base64 = buffer.toString('base64')

    const body = {
      contents: [{
        role: 'user',
        parts: [
          { text: prompt },
          { inline_data: { mime_type: mimeType, data: base64 } }
        ]
      }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 1024,
        response_mime_type: 'application/json',
      }
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 45000)

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    clearTimeout(timeout)

    if (!res.ok) {
      const err = await res.text()
      console.error('[VisionExtract] API error:', res.status, err)
      return null
    }

    const data = await res.json()
    let raw = data.candidates?.[0]?.content?.parts?.[0]?.text || ''
    raw = raw.replace(/```json\n?/gi, '').replace(/```\n?$/g, '').trim()

    const parsed: VisionResult = JSON.parse(raw)
    return parsed
  } catch (err: any) {
    console.error('[VisionExtract] Error:', err?.message)
    return null
  }
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

    let visionResult: VisionResult | null = null
    try {
      visionResult = await visionExtract(buffer, file.type || 'image/jpeg')
    } catch (err) {
      console.error('[ExpenseScan] Vision error:', err)
    }

    const extracted: VisionResult = visionResult || FALLBACK

    return NextResponse.json({
      success: !!visionResult,
      receiptUrl,
      ocrTimedOut: !visionResult,
      extracted,
      rawText: '',
    })
  } catch (error: any) {
    console.error('[ExpenseScan] Error:', error)
    return NextResponse.json({ error: 'Error al procesar la imagen' }, { status: 500 })
  }
})
