/**
 * Cierre del alta: la firma del go-live.
 *
 * Las cuatro piezas y los informes se cierran con hechos de la cuenta; el final
 * no puede cerrarse con un clic de pantalla. Aquí se exige lo que una firma
 * debe tener para significar algo:
 *   - un criterio de éxito escrito, con el que se medirá el alta en 14 días;
 *   - la confirmación de que las plantillas se revisaron con datos reales
 *     (nadie puede comprobarlo por ti: lo firma una persona);
 *   - y que todo lo demás esté cumplido. La firma no tapa un pendiente.
 *
 * Puro: sin Prisma, sin red. La ruta valida, la pantalla avisa y los tests
 * cubren los dos lados.
 */

import type { FirmaGoLive, TareaChecklist } from './estado'

/** Días hasta la revisión con la que se mide si el alta sirvió. */
export const DIAS_REVISION = 14

/** Un criterio de una palabra no se puede medir; se pide algo concreto. */
export const MIN_CRITERIO = 20
export const MAX_CRITERIO = 240

/**
 * Las dos líneas que cierra la propia firma: una porque el firmante confirma
 * que revisó las plantillas, y otra porque él mismo es la firma. No bloquean
 * la firma (sería circular), pero tampoco se tachan sin ella.
 */
const LINEAS_QUE_CIERRA_LA_FIRMA = new Set(['plantillas', 'go_live'])

export interface ResultadoFirma {
  /** `null` cuando hay algo que corregir: no se firma a medias. */
  firma: FirmaGoLive | null
  errores: string[]
}

function limpiarTexto(valor: unknown, tope: number): string {
  if (typeof valor !== 'string') return ''
  return valor.replace(/\s+/g, ' ').trim().slice(0, tope)
}

/**
 * Valida lo que envía la pantalla y devuelve la firma lista para guardar, o los
 * motivos por los que no se puede firmar todavía.
 */
export function normalizarFirma(
  valor: unknown,
  ahora: Date,
  firmadoPor: string | null,
): ResultadoFirma {
  const entrada =
    valor && typeof valor === 'object' && !Array.isArray(valor)
      ? (valor as Record<string, unknown>)
      : {}

  const criterio = limpiarTexto(entrada.criterioExito, MAX_CRITERIO)
  const errores: string[] = []

  if (criterio.length === 0) {
    errores.push('Escribe el criterio de éxito: qué tendrá que ser cierto en 14 días.')
  } else if (criterio.length < MIN_CRITERIO) {
    errores.push(
      `El criterio de éxito es demasiado corto: concreta al menos ${MIN_CRITERIO} caracteres para que se pueda medir.`,
    )
  }

  if (entrada.plantillasRevisadas !== true) {
    errores.push('Confirma que has revisado las plantillas con datos reales antes de firmar.')
  }

  if (errores.length > 0) return { firma: null, errores }

  return {
    firma: {
      criterioExito: criterio,
      plantillasRevisadas: true,
      firmadoEn: ahora.toISOString(),
      firmadoPor,
    },
    errores: [],
  }
}

/**
 * Lee la firma guardada en la base. Un JSON corrupto no se interpreta como
 * firmado: devuelve `null` y el checklist vuelve a abrir el final del alta.
 */
export function leerFirma(valor: unknown): FirmaGoLive | null {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return null
  const objeto = valor as Record<string, unknown>

  const criterio = limpiarTexto(objeto.criterioExito, MAX_CRITERIO)
  const firmadoEn = typeof objeto.firmadoEn === 'string' ? objeto.firmadoEn : ''

  if (!criterio || objeto.plantillasRevisadas !== true) return null
  if (!Number.isFinite(Date.parse(firmadoEn))) return null

  return {
    criterioExito: criterio,
    plantillasRevisadas: true,
    firmadoEn,
    firmadoPor: typeof objeto.firmadoPor === 'string' ? objeto.firmadoPor : null,
  }
}

/** Cuándo toca revisar el alta. `null` si la fecha guardada no es válida. */
export function fechaRevision(firma: FirmaGoLive): Date | null {
  const firmado = Date.parse(firma.firmadoEn)
  if (!Number.isFinite(firmado)) return null
  return new Date(firmado + DIAS_REVISION * 24 * 60 * 60 * 1000)
}

export interface GateFirma {
  listo: boolean
  /** Títulos de lo que falta, en el orden del checklist. */
  pendientes: string[]
}

/**
 * Qué falta para poder firmar. Todo el checklist menos las dos líneas que
 * cierra la propia firma tiene que estar cumplido: datos, informes y las
 * cuatro piezas. Firmar con algo abierto convertiría la firma en un adorno.
 */
export function puedeFirmar(checklist: TareaChecklist[]): GateFirma {
  const pendientes = checklist
    .filter((tarea) => !LINEAS_QUE_CIERRA_LA_FIRMA.has(tarea.id) && !tarea.completada)
    .map((tarea) => tarea.titulo)

  return { listo: checklist.length > 0 && pendientes.length === 0, pendientes }
}
