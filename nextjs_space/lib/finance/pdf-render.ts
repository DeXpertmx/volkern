// Renderiza páginas PDF a imágenes (data URL) en el navegador.
// Solo debe importarse desde componentes cliente (usa DOM APIs).

async function loadPdf(file: File) {
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`
  const buf = await file.arrayBuffer()
  return pdfjs.getDocument({ data: buf }).promise
}

/** Renderiza una página concreta (indexada desde 1) manteniendo su proporción. */
export async function renderPdfPage(file: File, pageNumber: number, maxDim = 1800): Promise<string> {
  const doc = await loadPdf(file)
  const page = await doc.getPage(pageNumber)
  const viewport1 = page.getViewport({ scale: 1 })
  const scale = Math.min(maxDim / viewport1.width, maxDim / viewport1.height, 2.5)
  const viewport = page.getViewport({ scale })
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(viewport.width)
  canvas.height = Math.ceil(viewport.height)
  await page.render({ canvas, viewport }).promise
  const dataUrl = canvas.toDataURL('image/jpeg', 0.85)
  try { await doc.loadingTask.destroy() } catch { /* el documento ya no es necesario */ }
  return dataUrl
}

/** Renderiza todas las páginas para permitir revisión multipágina. */
export async function renderPdfPages(file: File, maxDim = 1800): Promise<string[]> {
  const doc = await loadPdf(file)
  const pages: string[] = []
  try {
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
      const page = await doc.getPage(pageNumber)
      const viewport1 = page.getViewport({ scale: 1 })
      const scale = Math.min(maxDim / viewport1.width, maxDim / viewport1.height, 2.5)
      const viewport = page.getViewport({ scale })
      const canvas = document.createElement('canvas')
      canvas.width = Math.ceil(viewport.width)
      canvas.height = Math.ceil(viewport.height)
      await page.render({ canvas, viewport }).promise
      pages.push(canvas.toDataURL('image/jpeg', 0.85))
    }
  } finally {
    try { await doc.loadingTask.destroy() } catch { /* el documento ya no es necesario */ }
  }
  return pages
}

export interface PdfDocumentGroup {
  id: string
  pageStart: number
  pageEnd: number
  label: string
  text: string
}

/** Detecta inicios de factura en PDFs con texto; los PDFs escaneados quedan como un lote único. */
export async function detectPdfDocumentGroups(file: File): Promise<PdfDocumentGroup[]> {
  const doc = await loadPdf(file)
  const pageTexts: string[] = []
  try {
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
      const page = await doc.getPage(pageNumber)
      const content = await page.getTextContent()
      pageTexts.push(content.items.map((item: any) => typeof item?.str === 'string' ? item.str : '').join(' ').replace(/\\s+/g, ' ').trim())
    }
  } finally {
    try { await doc.loadingTask.destroy() } catch { /* el documento ya no es necesario */ }
  }

  const hasEmbeddedText = pageTexts.some(Boolean)
  if (!hasEmbeddedText) {
    return [{ id: 'document-1', pageStart: 1, pageEnd: Math.max(1, pageTexts.length), label: 'Documento completo', text: '' }]
  }

  const starts = pageTexts.map((text, index) => index === 0 || /(?:factura|invoice|ticket|albar[aá]n)\\s*(?:n[ºo°]?|number|num)?/i.test(text))
  const groups: PdfDocumentGroup[] = []
  for (let index = 0; index < pageTexts.length; index += 1) {
    if (index > 0 && !starts[index]) continue
    const nextStart = starts.findIndex((isStart, candidate) => candidate > index && isStart)
    const endIndex = nextStart === -1 ? pageTexts.length - 1 : nextStart - 1
    const firstText = pageTexts[index]
    const invoice = firstText.match(/(?:factura|invoice)\\s*(?:n[ºo°]?|number|num)?\\s*[:#-]?\\s*([A-Z0-9][A-Z0-9./_-]{2,})/i)?.[1]
    groups.push({
      id: `document-${groups.length + 1}`,
      pageStart: index + 1,
      pageEnd: endIndex + 1,
      label: invoice ? `Factura ${invoice}` : `Documento ${groups.length + 1}`,
      text: pageTexts.slice(index, endIndex + 1).join(' '),
    })
  }
  return groups.length > 0 ? groups : [{ id: 'document-1', pageStart: 1, pageEnd: pageTexts.length, label: 'Documento completo', text: pageTexts.join(' ') }]
}

/** Crea un PDF temporal con el rango seleccionado para enviarlo al OCR como documento independiente. */
export async function createPdfFromPageRange(file: File, pageStart: number, pageEnd: number, fileName = 'documento.pdf'): Promise<File> {
  const pages = await renderPdfPages(file)
  const { jsPDF } = await import('jspdf')
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
  let added = false
  for (let index = Math.max(1, pageStart); index <= Math.min(pageEnd, pages.length); index += 1) {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image()
      element.onload = () => resolve(element)
      element.onerror = () => reject(new Error('No se pudo preparar la página PDF'))
      element.src = pages[index - 1]
    })
    if (added) pdf.addPage()
    const ratio = image.width > 0 ? image.height / image.width : 1.414
    const pageWidth = 190
    const pageHeight = Math.min(277, pageWidth * ratio)
    pdf.addImage(image, 'JPEG', 10, 10, pageWidth, pageHeight, undefined, 'MEDIUM')
    added = true
  }
  if (!added) throw new Error('El rango PDF seleccionado no contiene páginas')
  const blob = pdf.output('blob')
  return new File([blob], fileName, { type: 'application/pdf' })
}

export async function renderPdfFirstPage(file: File, maxDim = 1800): Promise<string> {
  const pages = await renderPdfPages(file, maxDim)
  if (!pages[0]) throw new Error('El PDF no contiene páginas renderizables')
  return pages[0]
}
