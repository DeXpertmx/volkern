export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { NextResponse } from 'next/server'
import { withTenantAuth } from '@/lib/api-key-auth'
import { uploadFile } from '@/lib/s3'
import { parseInvoiceText, VisionResult, FALLBACK } from '@/lib/invoice-parser'

async function callVision(buffer: Buffer, mimeType: string): Promise<{ result: VisionResult | null; rawText: string }> {
  const base64 = buffer.toString('base64')
  const dataUrl = `data:${mimeType};base64,${base64}`
  const isPdf = mimeType === 'application/pdf'
  let rawText = ''

  const prompt = `Eres un extractor de datos de facturas españolas. Analiza el ${isPdf ? 'documento PDF' : 'documento/imagen'} y devuelve SOLO un JSON válido sin markdown ni explicaciones. Usa punto para decimales (ej: 121.00). Fechas en formato DD/MM/AAAA.

Estructura exacta del JSON:
{
  "numero_factura": "F2026-00142",
  "serie": "F2026",
  "fecha_emision": "24/07/2026",
  "fecha_operacion": "20/07/2026",

  "emisor": {
    "nombre": "INNOVATECH SOLUCIONES S.L.",
    "nif": "B-87654321",
    "direccion": "Calle Gran Via, 45, Planta 3ª, 28013 Madrid, España"
  },

  "receptor": {
    "nombre": "Carlos Mendoza Gutiérrez",
    "nif": "12345678Z",
    "direccion": "Avenida de la Constitución, 12, 2ºB, 41001 Sevilla, España"
  },

  "lineas": [
    {
      "descripcion": "Servicio de consultoría",
      "cantidad": 1,
      "precio_unitario": 500.00,
      "importe": 500.00
    }
  ],

  "totales": {
    "base_imponible": 1600.00,
    "tipo_iva": 21.0,
    "cuota_iva": 336.00,
    "tipo_irpf": 15.0,
    "cuota_irpf": -240.00,
    "total_factura": 1696.00
  },

  "iban": "ES9100491234561234567890",
  "category": "profesional"
}

Si un campo no está disponible pon null. Si no hay líneas de detalle, pon array vacío [].`

  const timeoutMs = isPdf ? 45000 : 30000
  const maxTokens = isPdf ? 4096 : 1024

  console.log(`[Vision] Procesando ${isPdf ? 'PDF' : 'imagen'} (${(buffer.length / 1024).toFixed(1)} KB, ${mimeType})`)

  // ── 1. OCR.space (proveedor gratuito — 25K requests/mes, soporta PDFs e imágenes) ──
  const ocrSpaceKey = process.env.OCR_SPACE_API_KEY
  if (ocrSpaceKey) {
    try {
      const res = await fetch('https://api.ocr.space/parse/image', {
        method: 'POST',
        headers: {
          'apikey': ocrSpaceKey,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          base64Image: dataUrl,
          language: 'spa',
          isTable: 'true',
          OCREngine: '2',
          filetype: isPdf ? 'PDF' : 'JPG',
        }),
        signal: AbortSignal.timeout(timeoutMs),
      })
      if (res.ok) {
        const json = await res.json()
        if (!json.IsErroredOnProcessing && json.OCRExitCode === 1) {
          rawText = (json.ParsedResults?.[0]?.ParsedText || '').trim()
          if (rawText) {
            console.log(`[Vision] OCR.space extrajo ${rawText.length} caracteres de texto`)
            const parsed = parseInvoiceText(rawText)
            if (parsed) {
              console.log('[Vision] ✅ OCR.space + parseInvoiceText extrajeron datos')
              return { result: parsed, rawText }
            }
            console.warn('[Vision] OCR.space extrajo texto pero parseInvoiceText no encontró campos estructurados')
          }
        } else {
          console.error('[Vision] OCR.space processing error:', json.ErrorMessage || 'Unknown')
        }
      } else {
        const errText = await res.text()
        console.error('[Vision] OCR.space HTTP error:', res.status, errText.substring(0, 200))
      }
    } catch (err: any) {
      console.error('[Vision] OCR.space fetch error:', err?.message)
    }
  }

  // ── 2. OpenRouter con GPT-4o-mini (fallback IA) ──
  const openrouterKey = process.env.OPENROUTER_API_KEY
  if (openrouterKey) {
      try {
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
            max_tokens: maxTokens,
          }),
          signal: AbortSignal.timeout(timeoutMs),
        })
        if (res.ok) {
          const json = await res.json()
          const raw = json.choices?.[0]?.message?.content || ''
          const parsed = parseJsonResult(raw)
          if (parsed) {
            console.log('[Vision] ✅ OpenRouter GPT-4o-mini extrajo datos correctamente')
            return { result: parsed, rawText }
          }
        } else {
          const errText = await res.text()
          console.error('[Vision] OpenRouter error:', res.status, errText.substring(0, 300))
        }
      } catch (err: any) {
        console.error('[Vision] OpenRouter fetch error:', err?.message)
      }
    }

  // ── 3. Google Gemini (fallback — cuota gratuita limitada) ──
  const googleKey = process.env.GOOGLE_AI_KEY
  if (googleKey) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash:generateContent?key=${googleKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }, { inline_data: { mime_type: mimeType, data: base64 } }] }],
          generationConfig: { temperature: 0.1, maxOutputTokens: maxTokens },
        }),
        signal: AbortSignal.timeout(15000),
      })
      if (res.ok) {
        const json = await res.json()
        const raw = json.candidates?.[0]?.content?.parts?.[0]?.text || ''
        const parsed = parseJsonResult(raw)
        if (parsed) {
          console.log('[Vision] ✅ Gemini extrajo datos correctamente')
          return { result: parsed, rawText }
        }
      } else {
        const errText = await res.text()
        console.error('[Vision] Google Gemini error:', res.status, errText.substring(0, 300))
      }
    } catch (err: any) {
      console.error('[Vision] Google Gemini fetch error:', err?.message)
    }
  }

  // ── 4. DeepSeek (solo imágenes, texto plano — no soporta documentos) ──
  const deepseekKey = process.env.DEEPSEEK_API_KEY
  if (deepseekKey && !isPdf) {
    try {
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
          max_tokens: maxTokens,
        }),
        signal: AbortSignal.timeout(10000),
      })
      if (res.ok) {
        const json = await res.json()
        const raw = json.choices?.[0]?.message?.content || ''
        const parsed = parseJsonResult(raw)
        if (parsed) {
          console.log('[Vision] ✅ DeepSeek extrajo datos')
          return { result: parsed, rawText }
        }
      }
    } catch {
      // Ignorar — DeepSeek text-only no es crítico
    }
  }

  const missingKeys: string[] = []
  if (!ocrSpaceKey) missingKeys.push('OCR_SPACE_API_KEY')
  if (!openrouterKey) missingKeys.push('OPENROUTER_API_KEY')
  if (!googleKey) missingKeys.push('GOOGLE_AI_KEY')
  if (!deepseekKey) missingKeys.push('DEEPSEEK_API_KEY')
  const diagnostic = missingKeys.length === 4
    ? 'Ninguna API de visión configurada. Se requieren OCR_SPACE_API_KEY, OPENROUTER_API_KEY, GOOGLE_AI_KEY o DEEPSEEK_API_KEY en las variables de entorno.'
    : (missingKeys.length > 0
      ? `Faltan: ${missingKeys.join(', ')}. Las APIs configuradas no devolvieron datos válidos.`
      : 'Las APIs de visión configuradas (4 proveedores) no pudieron extraer datos de la imagen. Prueba con mejor iluminación o usa "Sin OCR".')
  console.warn(`[Vision] ❌ ${diagnostic}`)
  return { result: null, rawText }
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
    let rawText = ''
    try {
      const visionResponse = await callVision(buffer, file.type || 'image/jpeg')
      visionResult = visionResponse.result
      rawText = visionResponse.rawText
    } catch (err: any) {
      console.error('[ExpenseScan] Vision error:', err?.message)
    }

    const extracted: VisionResult = visionResult || FALLBACK

    // Construir mensaje diagnóstico si falló
    let diagnostic: string | null = null
    if (!visionResult) {
      const ocrSpaceKey = !!process.env.OCR_SPACE_API_KEY
      const openrouterKey = !!process.env.OPENROUTER_API_KEY
      const googleKey = !!process.env.GOOGLE_AI_KEY
      const deepseekKey = !!process.env.DEEPSEEK_API_KEY
      const configured = [ocrSpaceKey, openrouterKey, googleKey, deepseekKey]
      const configuredCount = configured.filter(Boolean).length

      if (configuredCount === 0) {
        diagnostic = 'Ninguna API de visión configurada. Contacta al administrador para configurar OCR_SPACE_API_KEY, GOOGLE_AI_KEY, OPENROUTER_API_KEY o DEEPSEEK_API_KEY.'
      } else {
        diagnostic = `Las APIs de visión configuradas (${configuredCount} proveedor${configuredCount !== 1 ? 'es' : ''}) no pudieron extraer datos de la imagen. Prueba con mejor iluminación o usa "Sin OCR" para rellenar manualmente.`
      }
    }

    return NextResponse.json({
      success: !!visionResult,
      receiptUrl,
      ocrTimedOut: !visionResult,
      extracted,
      rawText,
      diagnostic,
    })
  } catch (error: any) {
    console.error('[ExpenseScan] Error:', error)
    return NextResponse.json({ error: 'Error al procesar la imagen' }, { status: 500 })
  }
})
