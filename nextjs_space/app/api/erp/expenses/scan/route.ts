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

  const timeoutMs = 30000; // 30s por proveedor

  // ── 1. Google Gemini (más fiable para visión) ──
  const googleKey = process.env.GOOGLE_AI_KEY
  if (googleKey) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${googleKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }, { inline_data: { mime_type: mimeType, data: base64 } }] }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 1024 },
        }),
        signal: AbortSignal.timeout(timeoutMs),
      })
      if (res.ok) {
        const json = await res.json()
        const raw = json.candidates?.[0]?.content?.parts?.[0]?.text || ''
        const parsed = parseJsonResult(raw)
        if (parsed) {
          console.log('[Vision] ✅ Gemini extrajo datos correctamente')
          return parsed
        }
      } else {
        const errText = await res.text()
        console.error('[Vision] Google Gemini error:', res.status, errText.substring(0, 300))
      }
    } catch (err: any) {
      console.error('[Vision] Google Gemini fetch error:', err?.message)
    }
  } else {
    console.warn('[Vision] ⚠️ GOOGLE_AI_KEY no configurada — Gemini no disponible')
  }

  // ── 2. DeepSeek — Nota: el endpoint /v1/chat/completions NO soporta imágenes.
  //     DeepSeek tiene un modelo VL separado (deepseek-vl2) pero requiere
  //     el endpoint específico de DeepSeek VL, no el chat estándar.
  //     Mientras no tengamos acceso a ese endpoint, DeepSeek salta.
  const deepseekKey = process.env.DEEPSEEK_API_KEY
  if (deepseekKey) {
    try {
      // Intentamos con el modelo deepseek-chat (texto únicamente).
      // No esperamos que funcione con imágenes — es un intento por si
      // el API Key tiene acceso a un modelo VL en el futuro.
      const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${deepseekKey}` },
        body: JSON.stringify({
          model: 'deepseek-chat',
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
        signal: AbortSignal.timeout(10000), // timeout corto: casi seguro falla
      })
      if (res.ok) {
        const json = await res.json()
        const raw = json.choices?.[0]?.message?.content || ''
        const parsed = parseJsonResult(raw)
        if (parsed) {
          console.log('[Vision] ✅ DeepSeek extrajo datos (solo texto en prompt)')
          return parsed
        }
      }
      // Ignoramos error: DeepSeek chat no soporta imágenes, es esperado
    } catch {
      // Ignorar — DeepSeek text-only no es crítico
    }
  }

  // ── 3. OpenRouter con modelo vision (fallback) ──
  const openrouterKey = process.env.OPENROUTER_API_KEY
  if (openrouterKey) {
    try {
      // Usamos openai/gpt-4o-mini que soporta imágenes, es rápido y económico
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${openrouterKey}` },
        body: JSON.stringify({
          model: 'openai/gpt-4o-mini',
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
        signal: AbortSignal.timeout(timeoutMs),
      })
      if (res.ok) {
        const json = await res.json()
        const raw = json.choices?.[0]?.message?.content || ''
        const parsed = parseJsonResult(raw)
        if (parsed) {
          console.log('[Vision] ✅ OpenRouter GPT-4o-mini extrajo datos correctamente')
          return parsed
        }
      } else {
        const errText = await res.text()
        console.error('[Vision] OpenRouter error:', res.status, errText.substring(0, 300))
      }
    } catch (err: any) {
      console.error('[Vision] OpenRouter fetch error:', err?.message)
    }
  }

  const missingKeys: string[] = []
  if (!googleKey) missingKeys.push('GOOGLE_AI_KEY')
  if (!deepseekKey) missingKeys.push('DEEPSEEK_API_KEY')
  if (!openrouterKey) missingKeys.push('OPENROUTER_API_KEY')
  const diagnostic = missingKeys.length === 3
    ? 'Ninguna API de visión configurada. Se requieren GOOGLE_AI_KEY, DEEPSEEK_API_KEY u OPENROUTER_API_KEY en las variables de entorno.'
    : (missingKeys.length > 0
      ? `Faltan: ${missingKeys.join(', ')}. Las APIs configuradas no devolvieron datos válidos.`
      : 'Las APIs de visión configuradas no pudieron extraer datos de la imagen.')
  console.warn(`[Vision] ❌ ${diagnostic}`)
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

    // Construir mensaje diagnóstico si falló
    let diagnostic: string | null = null
    if (!visionResult) {
      const googleKey = !!process.env.GOOGLE_AI_KEY
      const deepseekKey = !!process.env.DEEPSEEK_API_KEY
      const openrouterKey = !!process.env.OPENROUTER_API_KEY
      const configured = [googleKey, deepseekKey, openrouterKey]
      const configuredCount = configured.filter(Boolean).length

      if (configuredCount === 0) {
        diagnostic = 'Ninguna API de visión configurada. Contacta al administrador para configurar GOOGLE_AI_KEY, DEEPSEEK_API_KEY u OPENROUTER_API_KEY.'
      } else {
        diagnostic = `Las APIs de visión configuradas (${configuredCount} proveedor${configuredCount !== 1 ? 'es' : ''}) no pudieron extraer datos de la imagen. Prueba con mejor iluminación o usa "Sin OCR" para rellenar manualmente.`
      }
    }

    return NextResponse.json({
      success: !!visionResult,
      receiptUrl,
      ocrTimedOut: !visionResult,
      extracted,
      rawText: '',
      diagnostic,
    })
  } catch (error: any) {
    console.error('[ExpenseScan] Error:', error)
    return NextResponse.json({ error: 'Error al procesar la imagen' }, { status: 500 })
  }
})
