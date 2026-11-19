/**
 * Clasificación centralizada de riesgo de las herramientas del agente (Etapa B).
 *
 * Una sola tabla de clases, igual que propone la auditoría (§7):
 *
 * - **A. Lectura**: ejecución directa (listar, buscar, informes).
 * - **B. Escritura reversible**: ejecución según permisos, con trazabilidad y
 *   deshacer cuando exista (crear tarea/nota, mover etapa…).
 * - **C. Impacto externo**: aprobación antes de enviar comunicaciones o de
 *   generar efectos externos (reutiliza el flujo de aprobaciones MCP).
 * - **D. Destructivo**: confirmación explícita y reautenticación.
 *
 * La clase se decide **aquí**, en backend, y nunca la declara el modelo. El
 * ejecutor la consulta antes de tocar datos: una herramienta C o D no se
 * ejecuta en el chat sin aprobación, aunque el modelo la proponga.
 */

export type ClaseRiesgo = 'A' | 'B' | 'C' | 'D'

export interface ClasificacionRiesgo {
  clase: ClaseRiesgo
  /** Nombre legible para logs y mensajes. */
  etiqueta: string
  /** Clases que no se ejecutan directas: exigen aprobación previa. */
  requiereAprobacion: boolean
  /** Clase D: además de aprobación, exige reautenticación. */
  requiereReautenticacion: boolean
}

const DESCRIPCION: Record<ClaseRiesgo, Omit<ClasificacionRiesgo, 'clase'>> = {
  A: { etiqueta: 'lectura', requiereAprobacion: false, requiereReautenticacion: false },
  B: { etiqueta: 'escritura reversible', requiereAprobacion: false, requiereReautenticacion: false },
  C: { etiqueta: 'impacto externo', requiereAprobacion: true, requiereReautenticacion: false },
  D: { etiqueta: 'destructivo', requiereAprobacion: true, requiereReautenticacion: true },
}

/**
 * Herramientas de clase C/D. Hoy el chat no expone ninguna (las de envío y
 * facturación llegan en la etapa siguiente), pero el registro las declara aquí
 * para que el ejecutor las bloquee desde ya si alguien intenta exponerlas sin
 * su flujo de aprobación.
 */
const CLASES_EXPLICITAS: Record<string, ClaseRiesgo> = {
  // Impacto externo: enviar mensajes reales por los canales.
  send_message: 'C',
  enviar_mensaje: 'C',
  // Destructivo: no hay vuelta atrás.
  delete_ad_schedule: 'D',
  cancel_invoice: 'D',
}

/** Clase por defecto según la acción del permiso de la herramienta. */
export function clasePorAccion(accion: string | undefined): ClaseRiesgo {
  if (accion === 'ver') return 'A'
  return 'B'
}

/** Devuelve la clasificación de una herramienta, con su clase y su contrato. */
export function clasificarRiesgo(herramienta: string, accion?: string): ClasificacionRiesgo {
  const clase = CLASES_EXPLICITAS[herramienta] ?? clasePorAccion(accion)
  return { clase, ...DESCRIPCION[clase] }
}

/** ¿La clase exige aprobación antes de ejecutar en el chat? */
export function requiereAprobacion(clase: ClaseRiesgo): boolean {
  return DESCRIPCION[clase].requiereAprobacion
}
