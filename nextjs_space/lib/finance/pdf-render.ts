// Renderiza la primera página de un PDF a una imagen (data URL) en el navegador.
// Se usa para que el visualizador de corrección OCR funcione también con
// facturas en PDF: pdf.js dibuja la página en un canvas y las cajas de
// palabras se superponen con el mismo aspecto, ya que el visualizador las
// posiciona en porcentajes.
//
// Solo debe importarse desde componentes cliente (usa DOM APIs).

export async function renderPdfFirstPage(file: File, maxDim = 1800): Promise<string> {
  const pdfjs = await import('pdfjs-dist')

  // Worker de pdf.js: se carga desde CDN (jsdelivr) con la versión instalada.
  // Un import `?url` del .mjs no se resuelve como asset en webpack (Next 14),
  // y la app no impone CSP, así que el CDN es la opción fiable.
  pdfjs.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`

  const buf = await file.arrayBuffer()
  const doc = await pdfjs.getDocument({ data: buf }).promise
  const page = await doc.getPage(1)

  const viewport1 = page.getViewport({ scale: 1 })
  // Escala para que la página quepa en maxDim manteniendo el aspecto
  const scale = Math.min(maxDim / viewport1.width, maxDim / viewport1.height, 2.5)
  const viewport = page.getViewport({ scale })

  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(viewport.width)
  canvas.height = Math.ceil(viewport.height)

  await page.render({ canvas, viewport }).promise

  const dataUrl = canvas.toDataURL('image/jpeg', 0.85)
  // Liberar recursos del documento (no bloqueante)
  try {
    await doc.loadingTask.destroy()
  } catch {
    /* el documento ya no es necesario */
  }
  return dataUrl
}
