export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { NextResponse } from 'next/server'
import { withTenantAuth } from '@/lib/api-key-auth'
import { uploadFile } from '@/lib/s3'
import { associateVatRowsByPosition, normalizeVatBreakdown, parseInvoiceText, sanitizeSupplierName, VisionResult, FALLBACK } from '@/lib/invoice-parser'
import { overlayFromOcrSpace, OcrOverlay } from '@/lib/finance/ocr-template'

export async function callVision(buffer: Buffer, mimeType: string): Promise<{ result: VisionResult | null; rawText: string; overlay: OcrOverlay | null }> {
  const base64 = buffer.toString('base64')
  const dataUrl = `data:${mimeType};base64,${base64}`
  const isPdf = mimeType === 'application/pdf'
  let rawText = ''
  let overlay: OcrOverlay | null = null

  const prompt = `Eres un extractor de datos de facturas españolas. Analiza el ${isPdf ? 'documento PDF' : 'documento/imagen'} y devuelve SOLO un JSON válido sin markdown ni explicaciones. Usa punto para decimales (ej: 121.00). Fechas en formato DD/MM/AAAA.

Estructura exacta del JSON:
{
  "numero_factura": "F2026-00142",
  "serie": "F2026",
  "fecha_emision": "24/07/2026",
  "fecha_operacion": "20/07/2026",
  "fecha_vencimiento": "24/08/2026",
  "moneda": "EUR",
  "forma_pago": "Transferencia bancaria a 30 días",
  "regimen_fiscal": "general",
  "tipo_operacion": "nacional",

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
    "desglose_iva": [
      { "tipo": 21.0, "base": 1000.00, "cuota": 210.00 },
      { "tipo": 10.0, "base": 400.00, "cuota": 40.00 },
      { "tipo": 4.0, "base": 200.00, "cuota": 8.00 }
    ],
    "tipo_irpf": 15.0,
    "cuota_irpf": -240.00,
    "tipo_recargo": 5.2,
    "cuota_recargo": 52.00,
    "total_factura": 1696.00
  },

  "iban": "ES9100491234561234567890",
  "category": "profesional"
}

Reglas importantes:
- Devuelve TODOS los tramos de IVA visibles en la factura dentro de totales.desglose_iva, uno por cada tipo, con tipo, base y cuota. No reduzcas una factura con varios tipos a un único IVA.
- tipo_iva y cuota_iva son solo el tipo de mayor base y la suma de cuotas; el desglose completo siempre va en desglose_iva.
- fecha_emision solo es la fecha etiquetada como emisión, expedición o factura.
- fecha_operacion solo se rellena si existe una etiqueta explícita de operación/devengo. Nunca copies aquí fecha de vencimiento, fecha de pago o fecha de emisión; si no aparece, usa null.
- fecha_vencimiento debe contener exclusivamente la fecha de vencimiento, pago o due date; no la mezcles con fecha_operacion.
- moneda debe ser un código ISO (EUR, USD, MXN…) cuando aparezca; si solo aparece €, devuelve EUR.
- forma_pago debe contener solo el método/condiciones de pago (transferencia, tarjeta, domiciliación, contado…), no una fecha.
- regimen_fiscal debe ser uno de: general, recargo_equivalencia, exenta, no_sujeta, intracomunitaria, inversion_sujeto_pasivo o igic.
- tipo_operacion debe ser uno de: nacional, intracomunitaria, exportacion, inversion_sujeto_pasivo, exenta, no_sujeta o canarias_igic.
- Si existe recargo de equivalencia, devuelve tipo_recargo y cuota_recargo además del IVA normal; no sumes el recargo dentro de cuota_iva.
- emisor es quien vende y receptor es quien compra/recibe. No mezcles nombres, fechas, moneda ni etiquetas de la cabecera con la razón social.
- Si el receptor es tu empresa y no se lee, deja sus campos en null: el formulario los completará con los datos fiscales del tenant.
- Si un campo no está disponible pon null. Si no hay líneas de detalle, pon array vacío [].`

  const timeoutMs = isPdf ? 45000 : 30000
  const maxTokens = isPdf ? 4096 : 1024

  console.log(`[Vision] Procesando ${isPdf ? 'PDF' : 'imagen'} (${(buffer.length / 1024).toFixed(1)} KB, ${mimeType})`)

  // Re-asocia los tramos de IVA por la posición de las palabras en la imagen:
  // el texto plano leído pierde la geometría y puede desordenar o emparejar
  // mal base/cuota; con las cajas de OCR.space se recupera la fila real.
  const finalize = (parsed: VisionResult | null) => {
    if (parsed && overlay && overlay.words.length > 0) {
      const totals = parsed.totales
      const improved = associateVatRowsByPosition(overlay, totals.desglose_iva ?? [], totals)
      if (improved.length > 0 && improved !== totals.desglose_iva) {
        const main = improved.reduce((p, c) => (c.base > p.base ? c : p), improved[0])
        parsed.totales = {
          ...totals,
          desglose_iva: improved,
          tipo_iva: main.tipo,
          cuota_iva: improved.reduce((s, r) => s + r.cuota, 0),
          base_imponible: totals.base_imponible ?? improved.reduce((s, r) => s + r.base, 0),
        }
      }
    }
    return { result: parsed, rawText, overlay }
  }

  // ── 1. OCR.space (proveedor gratuito — 25K requests/mes, soporta PDFs e imágenes) ──
  // Se soporta una clave secundaria (OCR_SPACE_API_KEY_BACKUP) como alternativa:
  // si la principal falla (HTTP, límite mensual, error de procesado o sin texto
  // utilizable), se reintenta automáticamente con la de respaldo antes de caer
  // a los proveedores de IA.
  const ocrSpaceKeys = [
    process.env.OCR_SPACE_API_KEY,
    process.env.OCR_SPACE_API_KEY_BACKUP,
  ].filter((k): k is string => typeof k === 'string' && k.trim().length > 0)

  for (const ocrSpaceKey of ocrSpaceKeys) {
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
          // Las cajas de palabras (TextOverlay) son la base del visualizador
          // de corrección y del aprendizaje de plantillas por proveedor.
          overlay = overlayFromOcrSpace(json)
          if (rawText) {
            console.log(`[Vision] OCR.space extrajo ${rawText.length} caracteres de texto` + (overlay ? ` y ${overlay.words.length} cajas de palabras` : ''))
            const parsed = parseInvoiceText(rawText)
            if (parsed) {
              console.log('[Vision] ✅ OCR.space + parseInvoiceText extrajeron datos')
              return finalize(parsed)
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
    // Queda una clave por probar: avisar y continuar con ella
    if (ocrSpaceKey !== ocrSpaceKeys[ocrSpaceKeys.length - 1]) {
      console.warn('[Vision] OCR.space falló con la clave principal, reintentando con la de respaldo…')
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
            return finalize(parsed)
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
      const res = await fetch(`https://generativelanguage.googleapis.com/v1/models/gemini-3.5-flash-lite:generateContent?key=${googleKey}`, {
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
          return finalize(parsed)
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
          return finalize(parsed)
        }
      }
    } catch {
      // Ignorar — DeepSeek text-only no es crítico
    }
  }

  const missingKeys: string[] = []
  if (ocrSpaceKeys.length === 0) missingKeys.push('OCR_SPACE_API_KEY')
  if (!openrouterKey) missingKeys.push('OPENROUTER_API_KEY')
  if (!googleKey) missingKeys.push('GOOGLE_AI_KEY')
  if (!deepseekKey) missingKeys.push('DEEPSEEK_API_KEY')
  const diagnostic = missingKeys.length === 4
    ? 'Ninguna API de visión configurada. Se requieren OCR_SPACE_API_KEY, OPENROUTER_API_KEY, GOOGLE_AI_KEY o DEEPSEEK_API_KEY en las variables de entorno.'
    : (missingKeys.length > 0
      ? `Faltan: ${missingKeys.join(', ')}. Las APIs configuradas no devolvieron datos válidos.`
      : 'Las APIs de visión configuradas (4 proveedores) no pudieron extraer datos de la imagen. Prueba con mejor iluminación o usa "Sin OCR".')
  console.warn(`[Vision] ❌ ${diagnostic}`)
  return { result: null, rawText, overlay }
}function normalizeVisionResult(input: any): VisionResult | null {
  if (!input || typeof input !== 'object') return null
  const totals = input.totales && typeof input.totales === 'object' ? input.totales : {}

  // Proveedor limpio: la IA a veces arrastra fechas, moneda y demás cabecera
  // al campo de razón social. Sanearlo evita registrar un proveedor con basura.
  const rawSupplier = input.emisor?.nombre ?? input.supplier ?? input.issuerName ?? null
  const cleanedSupplier = sanitizeSupplierName(rawSupplier)
  const rawIssuer = sanitizeSupplierName(input.emisor?.nombre) ?? cleanedSupplier
  const rawSupplierFlat = sanitizeSupplierName(input.supplier ?? input.issuerName) ?? cleanedSupplier

  // Desglose de IVA tolerante a formatos (es/inglés, anidado o plano)
  const desglose_iva = normalizeVatBreakdown(totals.desglose_iva ?? input.desglose_iva)
  // Si el modelo no devolvió desglose pero sí tipo/base/cuota, derivarlo
  const derivedBreakdown =
    desglose_iva.length === 0 &&
    Number.isFinite(Number(totals.tipo_iva)) &&
    Number.isFinite(Number(totals.base_imponible)) &&
    Number.isFinite(Number(totals.cuota_iva)) &&
    Number(totals.base_imponible) > 0
      ? [{ tipo: Number(totals.tipo_iva), base: Number(totals.base_imponible), cuota: Number(totals.cuota_iva) }]
      : desglose_iva

  const normalized: VisionResult = {
    ...FALLBACK,
    ...input,
    emisor: { ...FALLBACK.emisor, ...(input.emisor || {}), nombre: rawIssuer },
    receptor: { ...FALLBACK.receptor, ...(input.receptor || {}) },
    lineas: Array.isArray(input.lineas) ? input.lineas : [],
    supplier: rawSupplierFlat,
    issuerName: rawIssuer,
    totales: { ...FALLBACK.totales, ...totals, desglose_iva: derivedBreakdown.length ? derivedBreakdown : undefined },
  }
  return normalized
}

function parseJsonResult(raw: string): VisionResult | null {
  raw = raw.replace(/```(?:json)?\n?/gi, '').replace(/```\n?$/g, '').trim()
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start === -1 || end === -1) return null
  try {
    return normalizeVisionResult(JSON.parse(raw.substring(start, end + 1)))
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
    let overlay: OcrOverlay | null = null
    try {
      const visionResponse = await callVision(buffer, file.type || 'image/jpeg')
      visionResult = visionResponse.result
      rawText = visionResponse.rawText
      overlay = visionResponse.overlay
    } catch (err: any) {
      console.error('[ExpenseScan] Vision error:', err?.message)
    }

    const extracted: VisionResult = visionResult || FALLBACK

    // Construir mensaje diagnóstico si falló
    let diagnostic: string | null = null
    if (!visionResult) {
      const ocrSpaceKey = !!(process.env.OCR_SPACE_API_KEY || process.env.OCR_SPACE_API_KEY_BACKUP)
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
      overlay,
      diagnostic,
    })
  } catch (error: any) {
    console.error('[ExpenseScan] Error:', error)
    return NextResponse.json({ error: 'Error al procesar la imagen' }, { status: 500 })
  }
}, ['erp:write'])
