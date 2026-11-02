/**
 * Informes y plantillas que se llevan el cliente al terminar el alta.
 *
 * El motor (`recomendar.ts`) ya decide *qué* informes y *qué* plantillas
 * encajan con el perfil. Esto es lo que faltaba: que el cliente pueda
 * **elegir** sobre esa propuesta y que la elección quede guardada y aplicada,
 * para no aterrizar en un panel vacío.
 *
 * Reglas que este fichero hace cumplir:
 *   - Los mínimos no son decorativos: sin dos informes el panel vuelve a estar
 *     vacío, y sin plantillas la primera cotización se escribe de cero. Si el
 *     cliente baja del mínimo se completa desde la recomendación, nunca con un
 *     valor inventado, y se le dice en `avisos`.
 *   - Nada se descarta en silencio: cada id desconocido, cada exceso de tope y
 *     cada relleno por mínimo sale en `avisos` en lenguaje de cliente.
 *
 * Puro (sin Prisma, sin red): lo usan la ruta, la pantalla y los tests.
 */

import { INFORMES, PLANTILLAS } from './recomendar'

// ─── Tipos ───────────────────────────────────────────────────────────────────

export interface InformeEntregable {
  id: string
  etiqueta: string
  /** Qué demuestra el informe, en palabras de negocio. */
  demuestra: string
  /** A dónde va el cliente cuando pulsa «ver». */
  enlace: string
  /** Qué hace que el informe deje de estar vacío. */
  primerPaso: string
}

export type TipoPlantilla = 'email' | 'contrato' | 'cotizacion' | 'optin'

export interface PlantillaEntregable {
  id: string
  etiqueta: string
  nota: string
  tipo: TipoPlantilla
  enlace: string
  /**
   * `true` cuando al aplicar el alta se crea un registro real en la cuenta.
   * `false` cuando no hay nada que crear (una plantilla de cotización es
   * configuración, y el briefing es una decisión de cada persona): en ese caso
   * primerPaso dice exactamente qué hacer.
   */
  seCreaSola: boolean
  primerPaso: string
}

export interface SeleccionEntregables {
  informes: string[]
  plantillas: string[]
}

export interface NormalizacionEntregables {
  seleccion: SeleccionEntregables
  /** Cambios aplicados o descartados, en texto legible para el cliente. */
  avisos: string[]
}

// ─── Topes y mínimos ─────────────────────────────────────────────────────────

/** Más de cuatro informes no se mira: se convierte en ruido. */
export const MAX_INFORMES = 4
/** Con menos de dos, el panel vuelve a estar vacío. */
export const MIN_INFORMES = 2
export const MAX_PLANTILLAS = 4
/** Una plantilla como mínimo: el primer contacto sale de algún sitio. */
export const MIN_PLANTILLAS = 1

// ─── Catálogo de informes ────────────────────────────────────────────────────

const INFORMES_EXTRA: Record<string, { enlace: string; primerPaso: string }> = {
  embudo_etapas: {
    enlace: '/dashboard/pipeline',
    primerPaso: 'Crea la primera oportunidad (o importa tus clientes) y el embudo se llena solo.',
  },
  prevision_trimestral: {
    enlace: '/dashboard/ventas/pronosticos',
    primerPaso: 'Pon importe y fecha de cierre prevista a cada oportunidad abierta.',
  },
  actividad_por_comercial: {
    enlace: '/dashboard/sales',
    primerPaso: 'Registra una actividad en cada llamada o visita; con la primera ya se ve el reparto.',
  },
  conversion_por_origen: {
    enlace: '/dashboard/analytics',
    primerPaso: 'Rellena el origen al crear la oportunidad (web, referido, feria…).',
  },
  tiempo_de_cierre: {
    enlace: '/dashboard/deals/metrics',
    primerPaso: 'Necesita al menos una venta cerrada para calcular la media.',
  },
  margen_por_linea: {
    enlace: '/dashboard/finanzas',
    primerPaso: 'Registra el coste de adquisición en el catálogo: sin coste no hay margen que calcular.',
  },
  cobros_pendientes: {
    enlace: '/dashboard/contabilidad',
    primerPaso: 'Emite la primera factura y aparecerá aquí con su vencimiento.',
  },
  oportunidades_sin_accion: {
    enlace: '/dashboard/pipeline',
    primerPaso: 'En cuanto haya oportunidades abiertas, este informe avisa de las que llevan dos semanas quietas.',
  },
}

export const INFORMES_ENTREGABLES: InformeEntregable[] = Object.entries(INFORMES).map(
  ([id, informe]) => ({
    id,
    etiqueta: informe.etiqueta,
    demuestra: informe.demuestra,
    enlace: INFORMES_EXTRA[id]?.enlace ?? '/dashboard',
    primerPaso: INFORMES_EXTRA[id]?.primerPaso ?? 'Aún no hay datos: en cuanto trabajes una oportunidad se rellena.',
  }),
)

// ─── Catálogo de plantillas ──────────────────────────────────────────────────

const PLANTILLAS_EXTRA: Record<
  string,
  { tipo: TipoPlantilla; enlace: string; seCreaSola: boolean; primerPaso: string }
> = {
  cotizacion: {
    tipo: 'cotizacion',
    enlace: '/dashboard/cotizaciones',
    seCreaSola: false,
    primerPaso: 'Revisa tus condiciones y días de validez una vez; se aplican a todas las cotizaciones.',
  },
  contrato_desde_cotizacion: {
    tipo: 'contrato',
    enlace: '/dashboard/contratos',
    seCreaSola: true,
    primerPaso: 'Las cláusulas son una base: pásalas por tu asesoría antes del primer contrato real.',
  },
  email_primer_contacto: {
    tipo: 'email',
    enlace: '/dashboard/emails',
    seCreaSola: true,
    primerPaso: 'Edítala con tu nombre y tu teléfono antes de usarla con un cliente.',
  },
  email_seguimiento: {
    tipo: 'email',
    enlace: '/dashboard/emails',
    seCreaSola: true,
    primerPaso: 'Pensada para el «no contestó» de los tres días, no para insistir cada hora.',
  },
  briefing_manana: {
    tipo: 'optin',
    enlace: '/dashboard/perfil',
    seCreaSola: false,
    primerPaso: 'Cada persona la activa en su perfil: no se impone a nadie.',
  },
}

export const PLANTILLAS_ENTREGABLES: PlantillaEntregable[] = Object.entries(PLANTILLAS).map(
  ([id, plantilla]) => {
    const extra = PLANTILLAS_EXTRA[id]
    return {
      id,
      etiqueta: plantilla.etiqueta,
      nota: plantilla.nota,
      tipo: extra?.tipo ?? 'email',
      enlace: extra?.enlace ?? '/dashboard/configuracion',
      seCreaSola: extra?.seCreaSola ?? false,
      primerPaso: extra?.primerPaso ?? 'Se revisa con tu equipo antes de usarla.',
    }
  },
)

export const INFORMES_ENTREGABLES_POR_ID: Record<string, InformeEntregable> =
  INFORMES_ENTREGABLES.reduce<Record<string, InformeEntregable>>((acc, i) => {
    acc[i.id] = i
    return acc
  }, {})

export const PLANTILLAS_ENTREGABLES_POR_ID: Record<string, PlantillaEntregable> =
  PLANTILLAS_ENTREGABLES.reduce<Record<string, PlantillaEntregable>>((acc, p) => {
    acc[p.id] = p
    return acc
  }, {})

// ─── Propuesta y normalización ───────────────────────────────────────────────

/**
 * Lo que viene premarcado al abrir la pantalla: exactamente lo que propuso el
 * motor para este perfil, recortado a los topes.
 */
export function seleccionRecomendada(
  recomendacion: { informes: string[]; plantillas: string[] } | null | undefined,
): SeleccionEntregables {
  const informes = [...new Set((recomendacion?.informes ?? []).filter((id) => INFORMES_ENTREGABLES_POR_ID[id]))]
  const plantillas = [
    ...new Set((recomendacion?.plantillas ?? []).filter((id) => PLANTILLAS_ENTREGABLES_POR_ID[id])),
  ]

  return { informes: informes.slice(0, MAX_INFORMES), plantillas: plantillas.slice(0, MAX_PLANTILLAS) }
}

function depurar(
  valor: unknown,
  permitidos: Record<string, unknown>,
  catalogo: { id: string; etiqueta: string }[],
  max: number,
  avisos: string[],
  singular: string,
): string[] {
  if (!Array.isArray(valor)) return []

  const limpios: string[] = []
  for (const v of valor) {
    if (typeof v !== 'string') continue
    if (!permitidos[v]) {
      avisos.push(`El ${singular} «${v}» no existe en el catálogo y se ha ignorado.`)
      continue
    }
    if (limpios.includes(v)) continue
    limpios.push(v)
  }

  if (limpios.length > max) {
    const recortados = limpios.slice(max)
    const etiquetas = recortados.map((id) => catalogo.find((c) => c.id === id)?.etiqueta ?? id)
    avisos.push(`Solo caben ${max} ${singular}s: fuera ${etiquetas.join(', ')}.`)
    return limpios.slice(0, max)
  }

  return limpios
}

/**
 * Convierte lo que llega del navegador en una selección válida: ids del
 * catálogo, sin duplicados, dentro de los topes y sin bajar de los mínimos.
 *
 * Los mínimos se completan con la propuesta del perfil, en su orden, y solo si
 * la propuesta tiene con qué. Si no lo tiene, se deja la selección como está y
 * se avisa: inventar un informe que el motor no propuso sería peor que avisar.
 */
export function normalizarEntregables(
  entrada: unknown,
  recomendada: SeleccionEntregables,
): NormalizacionEntregables {
  const avisos: string[] = []
  const bruto = (entrada ?? {}) as Record<string, unknown>

  const informes = depurar(
    bruto.informes,
    INFORMES_ENTREGABLES_POR_ID,
    INFORMES_ENTREGABLES,
    MAX_INFORMES,
    avisos,
    'informe',
  )
  const plantillas = depurar(
    bruto.plantillas,
    PLANTILLAS_ENTREGABLES_POR_ID,
    PLANTILLAS_ENTREGABLES,
    MAX_PLANTILLAS,
    avisos,
    'plantilla',
  )

  const informesFinales = completarMinimo(
    informes,
    recomendada.informes.filter((id) => INFORMES_ENTREGABLES_POR_ID[id]),
    MIN_INFORMES,
    'informes',
    avisos,
  )
  const plantillasFinales = completarMinimo(
    plantillas,
    recomendada.plantillas.filter((id) => PLANTILLAS_ENTREGABLES_POR_ID[id]),
    MIN_PLANTILLAS,
    'plantillas',
    avisos,
  )

  return { seleccion: { informes: informesFinales, plantillas: plantillasFinales }, avisos }
}

function completarMinimo(
  seleccion: string[],
  propuesta: string[],
  minimo: number,
  nombre: string,
  avisos: string[],
): string[] {
  if (seleccion.length >= minimo) return seleccion

  const candidatos = propuesta.filter((id) => !seleccion.includes(id))
  const faltan = minimo - seleccion.length
  const anadidos = candidatos.slice(0, faltan)
  const resultado = [...seleccion, ...anadidos]

  if (anadidos.length > 0) {
    avisos.push(
      `Se mantienen ${anadidos.length} ${nombre} de tu propuesta: sin al menos ${minimo} el panel se queda vacío al entrar.`,
    )
  } else if (resultado.length < minimo) {
    avisos.push(
      `Te quedas por debajo del mínimo de ${minimo} ${nombre} y la propuesta no tiene más que encajen: el panel puede quedar vacío.`,
    )
  }

  return resultado
}

// ─── Consultas ───────────────────────────────────────────────────────────────

export function informesDe(seleccion: SeleccionEntregables): InformeEntregable[] {
  return seleccion.informes
    .map((id) => INFORMES_ENTREGABLES_POR_ID[id])
    .filter((i): i is InformeEntregable => Boolean(i))
}

export function plantillasDe(seleccion: SeleccionEntregables): PlantillaEntregable[] {
  return seleccion.plantillas
    .map((id) => PLANTILLAS_ENTREGABLES_POR_ID[id])
    .filter((p): p is PlantillaEntregable => Boolean(p))
}

export function resumenSeleccion(seleccion: SeleccionEntregables): {
  informes: number
  plantillas: number
  seCreanSolas: number
  manuales: number
  completa: boolean
} {
  const plantillas = plantillasDe(seleccion)
  return {
    informes: seleccion.informes.length,
    plantillas: seleccion.plantillas.length,
    seCreanSolas: plantillas.filter((p) => p.seCreaSola).length,
    manuales: plantillas.filter((p) => !p.seCreaSola).length,
    completa: seleccion.informes.length >= MIN_INFORMES && seleccion.plantillas.length >= MIN_PLANTILLAS,
  }
}
