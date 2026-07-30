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

// ─── OCR.space RAW TEXT PARSER ──────────────────────────────────────────────
// Extrae campos de factura española desde texto plano (OCR.space output)
function parseInvoiceText(text: string): VisionResult | null {
  if (!text || text.trim().length < 10) return null

  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  const full = text.replace(/\s+/g, ' ').trim()

  // ── Proveedor: primera línea no vacía que no sea número/fecha ──
  let supplier: string | null = null
  for (const line of lines.slice(0, 5)) {
    if (/^[\d\s\-\/.,:;()]+$/.test(line)) continue
    if (/(?:factura|nº|n[ií]|fecha|total|importe|iva|base|direcci[oó]n|cif|nif|dni)/i.test(line)) continue
    if (line.length > 2 && line.length < 100) {
      supplier = line.replace(/^[\s*•\-]+/, '').trim()
      break
    }
  }

  // ── Total ──
  let total: number | null = null
  const totalMatch = full.match(/(?:total|importe\s+total|neto\s+a\s+pagar|suma)\s*[:.]?\s*€?\s*([\d]{1,10}(?:[.,][\d]{1,2})?)/i)
  if (totalMatch) {
    total = parseFloat(totalMatch[1].replace(',', '.'))
  } else {
    // Fallback: último número con decimales que parezca un total
    const allNums = [...full.matchAll(/([\d]{1,10}(?:[.,][\d]{1,2}))\s*€?/g)]
    if (allNums.length > 0) {
      total = parseFloat(allNums[allNums.length - 1][1].replace(',', '.'))
    }
  }

  // ── NIF ──
  let nif: string | null = null
  const nifMatch = full.match(/\b([A-Za-z]\d{8})\b/)
  if (nifMatch) nif = nifMatch[1].toUpperCase()
  // También buscar después de NIF/CIF/DNI:
  const nifLabelMatch = full.match(/(?:nif|cif|dni)\s*[:.]?\s*([A-Za-z0-9]{9,10})/i)
  if (nifLabelMatch) nif = nifLabelMatch[1].toUpperCase()

  // ── Fecha ──
  let date: string | null = null
  const dateMatch = full.match(/\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})\b/)
  if (dateMatch) {
    const [_, d, m, y] = dateMatch
    const yy = y.length === 2 ? '20' + y : y
    date = `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${yy}`
  }

  // ── Número de factura ──
  let invoiceNumber: string | null = null
  const invMatch = full.match(/(?:factura|nº|numero|n[o°])\s*[:.]?\s*([A-Za-z0-9][A-Za-z0-9\-\/]{1,20})/i)
  if (invMatch) invoiceNumber = invMatch[1].trim()

  // ── Base imponible ──
  let taxableBase: number | null = null
  const baseMatch = full.match(/(?:base\s+imponible|base|subtotal|bruto)\s*[:.]?\s*€?\s*([\d]{1,10}(?:[.,][\d]{1,2})?)/i)
  if (baseMatch) taxableBase = parseFloat(baseMatch[1].replace(',', '.'))

  // ── IVA ──
  let vatRate: number | null = null
  let vatAmount: number | null = null
  const ivaRateMatch = full.match(/(?:iva|i\.v\.a\.)\s*[:.]?\s*(\d{1,2})(?:\s*%|\s*por\s*ciento)?/i)
  if (ivaRateMatch) vatRate = parseFloat(ivaRateMatch[1])
  const ivaAmountMatch = full.match(/(?:iva|cuota\s+iva|i\.v\.a\.)\s*[:.]?\s*€?\s*([\d]{1,10}(?:[.,][\d]{1,2})?)/i)
  if (ivaAmountMatch) vatAmount = parseFloat(ivaAmountMatch[1].replace(',', '.'))

  // ── Emisor (razón social / dirección) ──
  let issuerName: string | null = supplier // Por defecto = supplier
  let issuerAddress: string | null = null
  let issuerTaxId: string | null = nif

  // Buscar dirección
  for (const line of lines) {
    if (/(?:calle|c\/|c\.|avda|avenida|plaza|paseo|carretera|ctra|pol[ií]gono|camino|bulevar|urbanizaci[oó]n)/i.test(line)) {
      issuerAddress = line
      break
    }
  }

  // ── Categoría (heurística) ──
  let category = 'otros'
  const catMap: Record<string, string[]> = {
    alimentacion: ['supermercado', 'restaurante', 'comida', 'alimentaci', 'cafeter', 'bar ', 'panader', 'carnicer'],
    transporte: ['gasolinera', 'combustible', 'carburante', 'peaje', 'aparcamiento', 'parking', 'uber', 'taxi', 'renfe', 'vueling', 'iberia', 'transporte'],
    suministros: ['luz', 'electricidad', 'agua', 'gas', 'telefónica', 'movistar', 'vodafone', 'orange', 'suministro'],
    oficina: ['papelería', 'librería', 'material oficina', 'fichero', 'impresora', 'tóner', 'cartucho'],
    tecnologia: ['apple', 'amazon', 'software', 'hosting', 'dominio', 'aws', 'google cloud', 'azure', 'microsoft', 'adobe', 'tecnolog'],
    marketing: ['google ads', 'facebook ads', 'meta ads', 'publicidad', 'marketing', 'seo', 'sem', 'redes sociales'],
    profesional: ['asesor', 'abogado', 'notario', 'gestor', 'consultor', 'auditor', 'arquitecto', 'ingeniero'],
  }
  for (const [cat, keywords] of Object.entries(catMap)) {
    if (keywords.some(k => full.toLowerCase().includes(k))) {
      category = cat
      break
    }
  }

  // Devolver solo si al menos encontramos algo útil
  if (!supplier && !total && !date) return null

  return {
    supplier,
    total: total && isFinite(total) ? Math.round(total * 100) / 100 : null,
    nif,
    date,
    category,
    invoiceNumber,
    taxableBase: taxableBase && isFinite(taxableBase) ? Math.round(taxableBase * 100) / 100 : null,
    vatRate: vatRate && isFinite(vatRate) ? vatRate : null,
    vatAmount: vatAmount && isFinite(vatAmount) ? Math.round(vatAmount * 100) / 100 : null,
    operationDate: null,
    issuerName,
    issuerAddress,
    issuerTaxId,
  }
}

async function callVision(buffer: Buffer, mimeType: string): Promise<VisionResult | null> {
  const base64 = buffer.toString('base64')
  const dataUrl = `data:${mimeType};base64,${base64}`
  const isPdf = mimeType === 'application/pdf'

  const prompt = isPdf
    ? `Eres un extractor de datos de facturas españolas. Analiza el documento PDF y devuelve SOLO un JSON válido sin markdown ni explicaciones. Usa punto para decimales (ej: 121.00).

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
    : `Eres un extractor de datos de facturas españolas. Analiza la imagen y devuelve SOLO un JSON válido sin markdown ni explicaciones. Usa punto para decimales (ej: 121.00).

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

  const timeoutMs = isPdf ? 45000 : 30000; // PDFs necesitan más tiempo
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
          base64Image: dataUrl, // Data URI completo (data:mime;base64,...)
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
          const rawText = (json.ParsedResults?.[0]?.ParsedText || '').trim()
          if (rawText) {
            console.log(`[Vision] OCR.space extrajo ${rawText.length} caracteres de texto`)
            const parsed = parseInvoiceText(rawText)
            if (parsed) {
              console.log('[Vision] ✅ OCR.space + parseInvoiceText extrajeron datos')
              return parsed
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
        signal: AbortSignal.timeout(15000), // timeout corto — cuota se agota rápido
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
          return parsed
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
      rawText: '',
      diagnostic,
    })
  } catch (error: any) {
    console.error('[ExpenseScan] Error:', error)
    return NextResponse.json({ error: 'Error al procesar la imagen' }, { status: 500 })
  }
})
