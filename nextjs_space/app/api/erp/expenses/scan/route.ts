export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { NextResponse } from 'next/server'
import { withTenantAuth } from '@/lib/api-key-auth'
import { uploadFile } from '@/lib/s3'

interface EmisorInfo {
  nombre: string | null
  nif: string | null
  direccion: string | null
}

interface ReceptorInfo {
  nombre: string | null
  nif: string | null
  direccion: string | null
}

interface LineaFactura {
  descripcion: string | null
  cantidad: number | null
  precio_unitario: number | null
  importe: number | null
}

interface TotalesFactura {
  base_imponible: number | null
  tipo_iva: number | null
  cuota_iva: number | null
  tipo_irpf: number | null
  cuota_irpf: number | null
  total_factura: number | null
}

interface VisionResult {
  // Identificación
  numero_factura: string | null
  serie: string | null
  fecha_emision: string | null   // DD/MM/AAAA
  fecha_operacion: string | null  // DD/MM/AAAA (solo si distinta)

  // Partes
  emisor: EmisorInfo
  receptor: ReceptorInfo

  // Líneas de detalle
  lineas: LineaFactura[]

  // Totales e impuestos
  totales: TotalesFactura

  // IBAN
  iban: string | null

  // Categoría inferida
  category: string

  // ── Campos planos legacy (backward compat con frontend actual) ──
  supplier: string | null
  total: number | null
  nif: string | null
  date: string | null
  invoiceNumber: string | null
  taxableBase: number | null
  vatRate: number | null
  vatAmount: number | null
  operationDate: string | null
  issuerName: string | null
  issuerAddress: string | null
  issuerTaxId: string | null
}

function emptyEmisor(): EmisorInfo {
  return { nombre: null, nif: null, direccion: null }
}

function emptyReceptor(): ReceptorInfo {
  return { nombre: null, nif: null, direccion: null }
}

function emptyTotales(): TotalesFactura {
  return { base_imponible: null, tipo_iva: null, cuota_iva: null, tipo_irpf: null, cuota_irpf: null, total_factura: null }
}

const FALLBACK: VisionResult = {
  numero_factura: null, serie: null, fecha_emision: null, fecha_operacion: null,
  emisor: emptyEmisor(), receptor: emptyReceptor(),
  lineas: [], totales: emptyTotales(), iban: null, category: 'otros',
  supplier: null, total: null, nif: null, date: null,
  invoiceNumber: null, taxableBase: null, vatRate: null, vatAmount: null,
  operationDate: null, issuerName: null, issuerAddress: null, issuerTaxId: null,
}

// ─── Spanish Invoice Regex Parser ───────────────────────────────────────────
// Extrae TODOS los campos de una factura española desde texto plano (OCR.space)
function parseInvoiceText(text: string): VisionResult | null {
  if (!text || text.trim().length < 10) return null

  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  const full = text.replace(/\s+/g, ' ').trim()
  const lowerFull = full.toLowerCase()

  // ── parseFloat helper europea ──
  const toNum = (s: string): number | null => {
    const n = parseFloat(s.replace(',', '.'))
    return isFinite(n) ? Math.round(n * 100) / 100 : null
  }

  // ── Número de factura + Serie ──
  let invoiceNumber: string | null = null
  let serie: string | null = null
  const invMatch = full.match(/(?:factura|nº|numero|n[o°]|fact\s*n[o°]?)\s*[:.]?\s*([A-Za-z0-9][A-Za-z0-9\-\/]{1,20})/i)
  if (invMatch) {
    invoiceNumber = invMatch[1].trim()
    // Extraer serie: la parte alfabética inicial (ej: F2026-001 → F2026)
    const serieMatch = invoiceNumber.match(/^([A-Za-z]+\d*)/)
    if (serieMatch) serie = serieMatch[1]
  }

  // ── Fechas ──
  const allDates = [...full.matchAll(/\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})\b/g)]
  const fmtDate = (d: string, m: string, y: string): string => {
    const yy = y.length === 2 ? '20' + y : y
    return `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${yy}`
  }
  let fecha_emision: string | null = null
  let fecha_operacion: string | null = null
  if (allDates.length > 0) {
    const [_, d1, m1, y1] = allDates[0]
    fecha_emision = fmtDate(d1, m1, y1)
    if (allDates.length > 1) {
      const [__, d2, m2, y2] = allDates[1]
      fecha_operacion = fmtDate(d2, m2, y2)
    }
  }

  // ── Emisor (quien vende) ──
  let emisorNombre: string | null = null
  let emisorNif: string | null = null
  let emisorDireccion: string | null = null

  // Buscar bloque del emisor (primeras líneas hasta "Cliente" o "Receptor")
  const emisorEndIdx = lines.findIndex(l => /^(?:cliente|receptor|facturar\s*a|datos\s+del\s+cliente|sr\s+\/|destinatario)/i.test(l))
  const emisorLines = emisorEndIdx > 0 ? lines.slice(0, emisorEndIdx) : lines.slice(0, Math.min(8, lines.length))

  for (const line of emisorLines) {
    // NIF/CIF del emisor
    const nifMatch = line.match(/(?:nif|cif|dni)\s*[:.]?\s*([A-Za-z0-9]{9,10})/i)
    if (nifMatch) { emisorNif = nifMatch[1].toUpperCase(); continue }
    // Dirección
    if (/(?:calle|c\/|c\.|avda|avenida|plaza|paseo|carretera|ctra|pol[ií]gono|camino|bulevar|urb\.)/i.test(line)) {
      emisorDireccion = line; continue
    }
    // Nombre: primera línea con más de 3 caracteres que no sea encabezado
    if (!emisorNombre && line.length > 3 && !/^[\d\s\-\/.,:;()]+$/.test(line) &&
        !/(?:factura|nº|fecha|total|importe|iva|base|direcci[oó]n|proforma)/i.test(line)) {
      emisorNombre = line.replace(/^[\s*•\-]+/, '').trim()
    }
  }

  // Si no encontramos nombre, usar primera línea con contenido
  if (!emisorNombre) {
    for (const line of lines.slice(0, 3)) {
      if (line.length > 3 && !/^[\d\s\-\/.,:;()]+$/.test(line) &&
          !/(?:factura|nº|fecha|total)/i.test(line)) {
        emisorNombre = line.replace(/^[\s*•\-]+/, '').trim()
        break
      }
    }
  }

  // ── Receptor (cliente) ──
  let receptorNombre: string | null = null
  let receptorNif: string | null = null
  let receptorDireccion: string | null = null

  const receptorStart = lines.findIndex(l => /^(?:cliente|receptor|facturar\s*a|datos\s+del\s+cliente|sr\s+\/|destinatario)/i.test(l))
  if (receptorStart >= 0) {
    const receptorLines = lines.slice(receptorStart + 1, Math.min(receptorStart + 6, lines.length))
    for (const line of receptorLines) {
      const nifMatch = line.match(/(?:nif|cif|dni)\s*[:.]?\s*([A-Za-z0-9]{9,10})/i)
      if (nifMatch) { receptorNif = nifMatch[1].toUpperCase(); continue }
      if (/(?:calle|c\/|c\.|avda|avenida|plaza|paseo|carretera)/i.test(line)) {
        receptorDireccion = line; continue
      }
      if (!receptorNombre && line.length > 3 && !/^[\d\s\-\/.,:;()]+$/.test(line)) {
        receptorNombre = line.replace(/^[\s*•\-]+/, '').trim()
      }
    }
  }
  // Si no hay bloque explícito, el receptor podría estar después del emisor
  if (!receptorNombre && emisorEndIdx > 0) {
    const afterLines = lines.slice(emisorEndIdx, emisorEndIdx + 6)
    for (const line of afterLines.slice(1)) { // saltar la línea "Cliente:"
      if (line.length > 3 && !/^[\d\s\-\/.,:;()]+$/.test(line)) {
        if (!receptorNombre) { receptorNombre = line.replace(/^[\s*•\-]+/, '').trim(); continue }
        if (!receptorDireccion && /(?:calle|c\/|c\.|avda|avenida|plaza|paseo|carretera)/i.test(line)) {
          receptorDireccion = line; continue
        }
        const nifMatch = line.match(/(?:nif|cif|dni)\s*[:.]?\s*([A-Za-z0-9]{9,10})/i)
        if (nifMatch) receptorNif = nifMatch[1].toUpperCase()
      }
    }
  }

  // ── Líneas de detalle ──
  const lineas: LineaFactura[] = []
  const lineasStart = lines.findIndex(l => /^(?:cant|cantidad|descripci[oó]n|concepto|art[ií]culo|producto|ref\s*[:.])/i.test(l))
  const lineasEnd = lines.findIndex(l => /^(?:base\s+imponible|subtotal|total|importe\s+total|suma|iva\s*\d)/i.test(l))
  if (lineasStart >= 0 && lineasEnd > lineasStart) {
    for (let i = lineasStart + 1; i < lineasEnd; i++) {
      const line = lines[i]
      // Patrón: cantidad + descripción + precio_unitario + importe
      const liMatch = line.match(/^(\d+[.,]?\d*)\s+(.+?)\s+(\d+[.,]\d{2})\s+(\d+[.,]\d{2})$/)
      if (liMatch) {
        lineas.push({
          descripcion: liMatch[2].trim(),
          cantidad: toNum(liMatch[1]),
          precio_unitario: toNum(liMatch[3]),
          importe: toNum(liMatch[4]),
        })
      } else {
        // Intentar sin cantidad
        const liMatch2 = line.match(/^(.+?)\s+(\d+[.,]\d{2})\s+(\d+[.,]\d{2})$/)
        if (liMatch2 && !/(?:base|total|iva|subtotal)/i.test(line)) {
          lineas.push({
            descripcion: liMatch2[1].trim(),
            cantidad: null,
            precio_unitario: toNum(liMatch2[2]),
            importe: toNum(liMatch2[3]),
          })
        }
      }
    }
  }

  // ── Base Imponible ──
  let baseImponible: number | null = null
  const baseMatch = full.match(/(?:base\s+imponible|base|subtotal|bruto|importe\s+neto)\s*[:.]?\s*€?\s*([\d]{1,10}(?:[.,][\d]{1,2})?)/i)
  if (baseMatch) baseImponible = toNum(baseMatch[1])

  // ── IVA ──
  let tipoIva: number | null = null
  let cuotaIva: number | null = null
  const ivaRateMatch = full.match(/(?:iva|i\.v\.a\.)\s*[:.]?\s*(\d{1,2}(?:[.,]\d+)?)(?:\s*%|\s*por\s*ciento)?/i)
  if (ivaRateMatch) tipoIva = toNum(ivaRateMatch[1])
  const ivaAmtMatch = full.match(/(?:iva|cuota\s+iva|i\.v\.a\.|iva\s+\d+%)\s*[:.]?\s*€?\s*([\d]{1,10}(?:[.,][\d]{1,2})?)/i)
  if (ivaAmtMatch) cuotaIva = toNum(ivaAmtMatch[1])

  // ── IRPF ──
  let tipoIrpf: number | null = null
  let cuotaIrpf: number | null = null
  const irpfRateMatch = full.match(/(?:irpf|retenci[oó]n|i\.r\.p\.f\.)\s*[:.]?\s*(\d{1,2}(?:[.,]\d+)?)(?:\s*%|\s*por\s*ciento)?/i)
  if (irpfRateMatch) tipoIrpf = toNum(irpfRateMatch[1])
  const irpfAmtMatch = full.match(/(?:irpf|retenci[oó]n|i\.r\.p\.f\.|irpf\s+\d+%)\s*[:.]?\s*[-–]?\s*€?\s*([\d]{1,10}(?:[.,][\d]{1,2})?)/i)
  if (irpfAmtMatch) cuotaIrpf = toNum(irpfAmtMatch[1])

  // ── Total Factura ──
  let totalFactura: number | null = null
  const totalMatch = full.match(/(?:total\s+factura|total|importe\s+total|neto\s+a\s+pagar|total\s+a\s+pagar|importe)\s*[:.]?\s*€?\s*([\d]{1,10}(?:[.,][\d]{1,2})?)/i)
  if (totalMatch) totalFactura = toNum(totalMatch[1])
  // Fallback: último número con decimales
  if (!totalFactura) {
    const allNums = [...full.matchAll(/([\d]{1,10}(?:[.,][\d]{1,2}))\s*€?/g)]
    if (allNums.length > 0) {
      totalFactura = toNum(allNums[allNums.length - 1][1])
    }
  }

  // ── IBAN ──
  let iban: string | null = null
  const ibanMatch = full.match(/\b(ES\d{2}\s*(?:\d{4}\s*){2,}\d{1,4})\b/)
  if (ibanMatch) iban = ibanMatch[1].replace(/\s+/g, '')
  // Fallback: cualquier secuencia que parezca IBAN
  if (!iban) {
    const ibanMatch2 = full.match(/\b[A-Z]{2}\d{2}\s*(?:\d{4}\s*){4,}\d{1,4}\b/)
    if (ibanMatch2) iban = ibanMatch2[0].replace(/\s+/g, '')
  }

  // ── Categoría (heurística) ──
  let category = 'otros'
  const catMap: Record<string, string[]> = {
    alimentacion: ['supermercado', 'restaurante', 'comida', 'alimentaci', 'cafeter', 'bar ', 'panader', 'carnicer', 'fruter'],
    transporte: ['gasolinera', 'combustible', 'carburante', 'peaje', 'aparcamiento', 'parking', 'uber', 'taxi', 'renfe', 'vueling', 'iberia', 'transporte', 'gasolina'],
    suministros: ['luz', 'electricidad', 'agua', 'gas', 'telefónica', 'movistar', 'vodafone', 'orange', 'suministro', 'endesa', 'iberdrola', 'naturgy'],
    oficina: ['papelería', 'librería', 'material oficina', 'fichero', 'impresora', 'tóner', 'cartucho', 'oficina'],
    tecnologia: ['apple', 'amazon', 'software', 'hosting', 'dominio', 'aws', 'google cloud', 'azure', 'microsoft', 'adobe', 'tecnolog', 'informática'],
    marketing: ['google ads', 'facebook ads', 'meta ads', 'publicidad', 'marketing', 'seo', 'sem', 'redes sociales'],
    profesional: ['asesor', 'abogado', 'notario', 'gestor', 'consultor', 'auditor', 'arquitecto', 'ingeniero', 'procurador', 'registrador'],
  }
  for (const [cat, keywords] of Object.entries(catMap)) {
    if (keywords.some(k => lowerFull.includes(k))) {
      category = cat
      break
    }
  }

  // ── Sincronizar campos legacy ──
  const hasData = !!(emisorNombre || totalFactura || fecha_emision)
  if (!hasData) return null

  return {
    // Nuevos campos estructurados
    numero_factura: invoiceNumber,
    serie,
    fecha_emision,
    fecha_operacion,
    emisor: {
      nombre: emisorNombre,
      nif: emisorNif,
      direccion: emisorDireccion,
    },
    receptor: {
      nombre: receptorNombre,
      nif: receptorNif,
      direccion: receptorDireccion,
    },
    lineas,
    totales: {
      base_imponible: baseImponible,
      tipo_iva: tipoIva,
      cuota_iva: cuotaIva,
      tipo_irpf: tipoIrpf,
      cuota_irpf: cuotaIrpf,
      total_factura: totalFactura,
    },
    iban,
    category,

    // Campos planos legacy
    supplier: emisorNombre,
    total: totalFactura,
    nif: emisorNif,
    date: fecha_emision,
    invoiceNumber,
    taxableBase: baseImponible,
    vatRate: tipoIva,
    vatAmount: cuotaIva,
    operationDate: fecha_operacion,
    issuerName: emisorNombre,
    issuerAddress: emisorDireccion,
    issuerTaxId: emisorNif,
  }
}

async function callVision(buffer: Buffer, mimeType: string): Promise<VisionResult | null> {
  const base64 = buffer.toString('base64')
  const dataUrl = `data:${mimeType};base64,${base64}`
  const isPdf = mimeType === 'application/pdf'

  const prompt = `Eres un extractor de datos de facturas españolas. Analiza el ${isPdf ? 'documento PDF' : 'documento/imagen'} y devuelve SOLO un JSON válido sin markdown ni explicaciones. Usa punto para decimales (ej: 121.00). Fechas en formato DD/MM/AAAA.

Estructura exacta del JSON:
{
  "numero_factura": "F2026-00142",  // null si no se encuentra
  "serie": "F2026",                   // parte alfabética+numérica inicial del nº factura, null si no
  "fecha_emision": "24/07/2026",
  "fecha_operacion": "20/07/2026",   // null si igual a fecha_emision

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
    "cuota_irpf": -240.00,  // negativo si descuenta
    "total_factura": 1696.00
  },

  "iban": "ES9100491234561234567890",
  "category": "profesional"  // alimentacion|transporte|suministros|oficina|tecnologia|marketing|profesional|otros
}

Si un campo no está disponible pon null. Si no hay líneas de detalle, pon array vacío [].`

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
