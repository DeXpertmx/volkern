'use client'

// Parámetros compartidos del visor de imágenes OCR: zoom del visor y la lupa
// de precisión que sigue al cursor. Ambos modales (corrección y comparación)
// usan exactamente los mismos valores para que el comportamiento sea idéntico.

// Lupa: tamaño base en px CSS del contenedor y aumento base aplicado al recorte.
export const MAGNIFIER_SIZE = 148
export const MAGNIFIER_ZOOM = 2.75

// Límites del tamaño y del aumento de la lupa adaptativa.
export const LENS_SIZE_MIN = 116
export const LENS_SIZE_MAX = 190
export const LENS_ZOOM_MIN = 1.5
export const LENS_ZOOM_MAX = 4.5

// Zoom del visor: límites y pasos (botones y Ctrl + rueda).
export const ZOOM_MIN = 0.5
export const ZOOM_MAX = 4
export const ZOOM_STEP = 0.25
export const ZOOM_WHEEL_STEP = 0.15

export const clampZoom = (z: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z))

export interface AdaptiveLens {
  size: number
  zoom: number
}

// Ajusta la lupa a la densidad de píxeles de la imagen: con una fuente que
// tiene más píxeles de los que se muestran (naturalWidth > ancho mostrado)
// se puede ampliar más sin pixelar; con una fuente pequeña se limita el
// aumento para no mostrar borroso. Devuelve el tamaño y el aumento a usar.
export function adaptiveLensParams(naturalWidth: number, displayedWidth: number): AdaptiveLens {
  const dpr = naturalWidth > 0 && displayedWidth > 0 ? naturalWidth / displayedWidth : 1
  const zoom = Math.min(LENS_ZOOM_MAX, Math.max(LENS_ZOOM_MIN, dpr))
  const size = Math.round(
    Math.min(LENS_SIZE_MAX, Math.max(LENS_SIZE_MIN, MAGNIFIER_SIZE * Math.sqrt(zoom / MAGNIFIER_ZOOM)))
  )
  return { size, zoom }
}
