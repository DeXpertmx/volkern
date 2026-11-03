/** Descarga de texto en el navegador, sin subir el fichero al servidor. */
export function descargarTexto(nombre: string, contenido: string, mime = 'text/csv;charset=utf-8') {
  if (!contenido) return
  // El BOM hace que Excel abra el CSV en UTF-8 y no rompa los acentos.
  const blob = new Blob(['\uFEFF' + contenido], { type: mime })
  const url = URL.createObjectURL(blob)
  const enlace = document.createElement('a')
  enlace.href = url
  enlace.download = nombre
  document.body.appendChild(enlace)
  enlace.click()
  enlace.remove()
  URL.revokeObjectURL(url)
}

export function nombreCuarentena(tipo: string): string {
  return `cuarentena-${tipo}-${new Date().toISOString().slice(0, 10)}.csv`
}
