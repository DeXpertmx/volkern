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

async function callVision(buffer: Buffer, mimeType: string): Promise<VisionResult | null> {
  const base64 = buffer.toString('base64')
  const dataUrl = `data:${mimeType};base64,${base64}`

  const prompt = `Eres un extractor de datos de facturas españolas. Analiza la imagen y devuelve SOLO un JSON válido sin markdown ni explicaciones. Usa punto para decimales (ej: 121.00).

Campos:
- "supplier": nombre del proveedor
- "total": importe total numérico
- "nif": NIF del emisor
- "date": fecha emisión DD/MM/AAAA
- "category": alimentacion|transporte|suministros|oficina|tecnologia|marketing|profesional|otros
- "invoiceNumber": número de factura
- "taxableBase": base imponible numérica
- "vatRate": tipo IVA numérico (sin %)
- "vatAmount": cuota IVA numérica
- "operationDate": fecha operación DD/MM/AAAA solo si distinta a emisión
- "issuerName": razón social del emisor
- "issuerAddress": domicilio fiscal del emisor
- "issuerTaxId": NIF del emisor

Si un campo no está disponible pon null.`

  // ── Try OpenRouter (DeepSeek V4 Flash, soporta imágenes) ──
  const openrouterKey = process.env.OPENROUTER_API_KEY
  if (openrouterKey) {
    try {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${openrouterKey}`,
        },
        body: JSON.stringify({
          model: 'deepseek/deepseek-chat:free',
          messages: [{
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              { type: 'image_url', image_url: { url: dataUrl } },
            ],
          }],
          temperature: 0.1,
          max_tokens: 1024,
        }),
        signal: AbortSignal.timeout(45000),
      })

      if (res.ok) {
        const json = await res.json()
        const raw = json.choices?.[0]?.message?.content || ''
        return parseJsonResult(raw)
      } else {
        const errText = await res.text()
        console.error('[Vision] OpenRouter error:', res.status, errText)
      }
    } catch (err: any) {
      console.error('[Vision] OpenRouter fetch error:', err?.message)
    }
  }

  // ── Fallback: Google Gemini ──
  const googleKey = process.env.GOOGLE_AI_KEY
  if (googleKey) {
    try {
      const model = process.env.GEMMA_MODEL || 'gemini-1.5-flash'
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${googleKey}`

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            role: 'user',
            parts: [
              { text: prompt },
              { inline_data: { mime_type: mimeType, data: base64 } },
            ],
          }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 1024 },
        }),
        signal: AbortSignal.timeout(45000),
      })

      if (res.ok) {
        const json = await res.json()
        const raw = json.candidates?.[0]?.content?.parts?.[0]?.text || ''
        return parseJsonResult(raw)
      } else {
        const errText = await res.text()
        console.error('[Vision] Google error:', res.status, errText)
      }
    } catch (err: any) {
      console.error('[Vision] Google fetch error:', err?.message)
    }
  }

  return null
}

function parseJsonResult(raw: string): VisionResult | null {
  raw = raw.replace(/```(?:json)?\n?/gi, '').replace(/```\n?$/g, '').trim()
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start === -1 || end === -1) return null
  try {
    return JSON.parse(raw.substring(start, end + 1))
  } catch {
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
      visionResult = await callVision(buffer, file.type || 'image/jpeg')
    } catch (err: any) {
      console.error('[ExpenseScan] Vision error:', err?.message)
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
