// Detección de cajas de palabras con tesseract.js en el navegador.
//
// OCR.space (cuando está configurado) devuelve el TextOverlay con las cajas,
// pero otros proveedores de visión (OpenRouter, Gemini…) solo devuelven texto
// estructurado, sin coordenadas. Este módulo genera las cajas localmente con
// tesseract.js sobre la MISMA imagen que ve el usuario, de modo que el
// visualizador de corrección y el aprendizaje de plantillas funcionan siempre,
// sin depender de ningún proveedor.
//
// Solo debe importarse desde componentes cliente (usa DOM APIs).

import type { OcrOverlay } from './ocr-template'

let workerPromise: Promise<any> | null = null

async function getWorker(): Promise<any> {
  if (!workerPromise) {
    const tesseract = await import('tesseract.js')
    // 'spa' = español. El modelo se descarga una vez (CDN) y se reutiliza.
    workerPromise = tesseract.createWorker('spa', 1, {
      logger: m => {
        if (m.status === 'recognizing text' && m.progress === 1) {
          console.log('[OcrBoxes] tesseract listo')
        }
      },
    })
  }
  return workerPromise
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('No se pudo cargar la imagen'))
    img.src = src
  })
}

/**
 * Detecta las cajas de palabras de una imagen (URL local, data URL o canvas)
 * con tesseract.js. Escala a maxDim para no saturar el OCR (las coordenadas
 * son relativas al canvas, y el visualizador las posiciona en porcentajes,
 * así que el alineado es independiente de la escala).
 */
export async function detectWordBoxes(source: string, maxDim = 1600): Promise<OcrOverlay | null> {
  try {
    const img = await loadImage(source)
    const scale = Math.min(1, maxDim / Math.max(img.width, img.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(img.width * scale))
    canvas.height = Math.max(1, Math.round(img.height * scale))
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

    const worker = await getWorker()
    // `blocks: true` es imprescindible: sin él tesseract.js v6 solo devuelve text
    const { data } = await worker.recognize(canvas, {}, { blocks: true, tsv: true })

    const words: { text: string; x: number; y: number; w: number; h: number }[] = []
    for (const b of data.blocks || []) {
      for (const p of b.paragraphs || []) {
        for (const l of p.lines || []) {
          for (const w of l.words || []) {
            const text = (w.text || '').trim()
            if (!text || !w.bbox) continue
            if (w.confidence != null && w.confidence < 40) continue
            words.push({ text, x: w.bbox.x0, y: w.bbox.y0, w: w.bbox.x1 - w.bbox.x0, h: w.bbox.y1 - w.bbox.y0 })
          }
        }
      }
    }
    if (words.length === 0) return null
    return { width: canvas.width, height: canvas.height, words }
  } catch (err: any) {
    console.error('[OcrBoxes] Error detectando palabras:', err?.message || err)
    return null
  }
}
