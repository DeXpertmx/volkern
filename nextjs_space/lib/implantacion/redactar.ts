/**
 * Redacción de la propuesta con IA (R3).
 *
 * La IA **no elige módulos**: eso lo decide el motor determinista
 * (`recomendar.ts`). Aquí solo hace dos cosas de lenguaje:
 *   1. Reescribir el motivo de cada módulo con las palabras del cliente.
 *   2. Señalar contradicciones entre respuestas que las reglas no ven.
 *
 * Dos reglas que este fichero hace cumplir:
 *   - **Nada de la IA entra sin validar.** La salida se parsea contra una forma
 *     conocida: ids que no están en la propuesta se descartan, textos vacíos o
 *     kilométricos se recortan. Un modelo que devuelve basura no puede romper
 *     la pantalla.
 *   - **El texto libre del cliente no se envía.** Las `notas` pueden llevar
 *     nombres y teléfonos; el prompt solo lleva opciones cerradas del
 *     cuestionario y los módulos propuestos. Si un matiz importa, se convierte
 *     en opción, no en párrafo.
 *
 * Si el proveedor falla, tarda o devuelve algo inválido, se devuelve la
 * propuesta con sus motivos plantilla y `fuente: 'plantilla'`. El alta se
 * completa igual: la IA mejora el texto, no es requisito para avanzar.
 */

import { callAssistantWithFallback } from '@/lib/assistant/openrouter-client'
import { PREGUNTAS_POR_ID, type Descubrimiento } from './descubrimiento'
import type { Recomendacion } from './recomendar'

/** Lo que la IA aporta a la propuesta, ya validado. */
export interface Redaccion {
  /** Motivos por id de módulo. Solo ids de la propuesta. */
  motivos: Record<string, string>
  /** Frases cortas con contradicciones detectadas; nunca acciones. */
  contradicciones: string[]
  fuente: 'ia' | 'plantilla'
  /** ISO de cuando se redactó; `null` si nunca se llamó al modelo. */
  generadoEn: string | null
  /**
   * Aviso para esta respuesta cuando no se llamó al modelo por cupo. No se
   * guarda: es de la respuesta, no del estado, y mañana sería mentira.
   */
  aviso?: string
}

export type PropuestaRedactada = Recomendacion & { redaccion: Redaccion }

export const REDACCION_VACIA: Redaccion = {
  motivos: {},
  contradicciones: [],
  fuente: 'plantilla',
  generadoEn: null,
}

const MAX_MOTIVO = 240
const MAX_CONTRADICCION = 200
const MAX_CONTRADICCIONES = 3
/** Un motivo más corto que esto no dice nada: se queda el plantilla. */
const MIN_MOTIVO = 12
const TIMEOUT_MS = 8000

/**
 * Aviso legible cuando el tenant agotó su cupo de reescrituras. Habla del tope,
 * no del proveedor: al cliente no le sirve saber qué modelo falló.
 */
export function avisoDeTope(limite: number): string {
  return `Has agotado las ${limite} reescrituras con IA del alta. La propuesta sigue completa con los textos de siempre; el cupo se repone en las próximas 24 horas.`
}

/** La redacción tal y como se guarda: sin el aviso, que es de una sola respuesta. */
export function sinAviso(redaccion: Redaccion): Redaccion {
  return {
    motivos: redaccion.motivos,
    contradicciones: redaccion.contradicciones,
    fuente: redaccion.fuente,
    generadoEn: redaccion.generadoEn,
  }
}

// ─── Validación de la salida ─────────────────────────────────────────────────

/** Quita cercas de markdown y se queda con el primer objeto JSON que haya. */
function extraerJson(texto: string): string | null {
  const sinCercas = texto.replace(/```(?:json)?/gi, '').trim()
  const inicio = sinCercas.indexOf('{')
  const fin = sinCercas.lastIndexOf('}')
  if (inicio === -1 || fin <= inicio) return null
  return sinCercas.slice(inicio, fin + 1)
}

/** Texto de una línea, sin caracteres de control y con tope de longitud. */
function limpiarTexto(valor: unknown, max: number): string | null {
  if (typeof valor !== 'string') return null
  const limpio = valor
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!limpio) return null
  if (limpio.length <= max) return limpio
  // Cortar por palabra para no dejar una frase a medias en mitad de una palabra.
  return `${limpio.slice(0, max - 1).replace(/\s+\S*$/, '')}…`
}

/**
 * Convierte la respuesta del modelo en una `Redaccion` válida para **esta**
 * propuesta: ids desconocidos o no propuestos se ignoran, motivos demasiado
 * cortos también y las contradicciones se deduplican y se acotan.
 *
 * `null` cuando no hay nada aprovechable: entonces no se toca la propuesta.
 */
export function parsearRedaccion(texto: string, modulosPropuestos: string[]): Redaccion | null {
  const json = extraerJson(texto)
  if (!json) return null

  let crudo: unknown
  try {
    crudo = JSON.parse(json)
  } catch {
    return null
  }
  if (!crudo || typeof crudo !== 'object' || Array.isArray(crudo)) return null

  const permitidos = new Set(modulosPropuestos)
  const motivos: Record<string, string> = {}

  const motivosCrudos = (crudo as Record<string, unknown>).motivos
  if (motivosCrudos && typeof motivosCrudos === 'object' && !Array.isArray(motivosCrudos)) {
    for (const [id, valor] of Object.entries(motivosCrudos as Record<string, unknown>)) {
      if (!permitidos.has(id)) continue
      const limpio = limpiarTexto(valor, MAX_MOTIVO)
      if (!limpio || limpio.length < MIN_MOTIVO) continue
      motivos[id] = limpio
    }
  }

  const contradicciones: string[] = []
  const contradiccionesCrudas = (crudo as Record<string, unknown>).contradicciones
  if (Array.isArray(contradiccionesCrudas)) {
    for (const valor of contradiccionesCrudas) {
      const limpio = limpiarTexto(valor, MAX_CONTRADICCION)
      if (!limpio) continue
      const clave = limpio.toLowerCase()
      if (contradicciones.some((c) => c.toLowerCase() === clave)) continue
      contradicciones.push(limpio)
      if (contradicciones.length >= MAX_CONTRADICCIONES) break
    }
  }

  if (Object.keys(motivos).length === 0 && contradicciones.length === 0) return null

  return { motivos, contradicciones, fuente: 'ia', generadoEn: new Date().toISOString() }
}

/** Redacción guardada en la base (JSON), validada al leerla. */
export function leerRedaccion(guardada: unknown): Redaccion | null {
  if (!guardada || typeof guardada !== 'object' || Array.isArray(guardada)) return null
  const bruto = (guardada as Record<string, unknown>).redaccion
  if (!bruto || typeof bruto !== 'object' || Array.isArray(bruto)) return null

  const motivos: Record<string, string> = {}
  const motivosCrudos = (bruto as Record<string, unknown>).motivos
  if (motivosCrudos && typeof motivosCrudos === 'object' && !Array.isArray(motivosCrudos)) {
    for (const [id, valor] of Object.entries(motivosCrudos as Record<string, unknown>)) {
      const limpio = limpiarTexto(valor, MAX_MOTIVO)
      if (limpio) motivos[id] = limpio
    }
  }

  const contradicciones: string[] = []
  const contradiccionesCrudas = (bruto as Record<string, unknown>).contradicciones
  if (Array.isArray(contradiccionesCrudas)) {
    for (const valor of contradiccionesCrudas) {
      const limpio = limpiarTexto(valor, MAX_CONTRADICCION)
      if (limpio) contradicciones.push(limpio)
      if (contradicciones.length >= MAX_CONTRADICCIONES) break
    }
  }

  if (Object.keys(motivos).length === 0 && contradicciones.length === 0) return null

  return {
    motivos,
    contradicciones,
    fuente: (bruto as Record<string, unknown>).fuente === 'ia' ? 'ia' : 'plantilla',
    generadoEn: typeof (bruto as Record<string, unknown>).generadoEn === 'string'
      ? ((bruto as Record<string, unknown>).generadoEn as string)
      : null,
  }
}

// ─── Aplicación sobre la propuesta ───────────────────────────────────────────

/**
 * Devuelve la propuesta con los motivos redactados y las contradicciones
 * añadidas a los riesgos. Puro: no muta la recomendación de entrada, y un id
 * que ya no está en la propuesta (el plan cambió, el cliente rehizo el
 * descubrimiento) simplemente no se aplica.
 */
export function aplicarRedaccion(
  recomendacion: Recomendacion,
  redaccion: Redaccion | null | undefined,
): PropuestaRedactada {
  const efectiva = redaccion ?? REDACCION_VACIA

  const modulos = recomendacion.modulos.map((m) => {
    const texto = efectiva.motivos[m.id]
    return texto ? { ...m, motivo: texto } : { ...m }
  })

  // Las contradicciones se suman a los riesgos, sin duplicar lo que las reglas
  // ya habían dicho: el cliente no necesita leer dos veces lo mismo.
  const riesgos = [...recomendacion.riesgos]
  for (const contradiccion of efectiva.contradicciones) {
    const clave = contradiccion.toLowerCase()
    if (riesgos.some((r) => r.toLowerCase() === clave)) continue
    riesgos.push(contradiccion)
  }

  return {
    ...recomendacion,
    modulos,
    riesgos,
    redaccion: efectiva,
  }
}

// ─── Llamada al modelo ───────────────────────────────────────────────────────

const SISTEMA = `Eres quien redacta la propuesta de un CRM para un cliente que acaba de responder un cuestionario.

Reglas:
- Español de España, segunda persona («tú»), frases cortas. Sin jerga de producto ni superlativos.
- Reescribe SOLO el motivo de los módulos que te doy. No añadas módulos ni los quites.
- Cada motivo debe sonar a lo que el cliente contestó (usa sus palabras), y explicar qué cambia en su semana. Máximo 220 caracteres.
- En «contradicciones», señala solo incoherencias entre respuestas (por ejemplo, vender a empresas y cerrar en menos de una semana). Frases de una línea, sin recomendaciones ni reproches. Si no hay, devuelve [].
- No inventes datos, cifras ni nombres.

Responde únicamente con este JSON:
{"motivos":{"<id_modulo>":"<motivo>"},"contradicciones":["<frase>"]}`

/** Respuestas del cliente en opciones cerradas: etiquetas, nunca `notas`. */
function respuestasLegibles(d: Descubrimiento): string[] {
  const lineas: string[] = []
  for (const pregunta of Object.values(PREGUNTAS_POR_ID)) {
    const valores = d.respuestas[pregunta.id] ?? []
    const etiquetas = valores
      .map((v) => pregunta.opciones.find((o) => o.valor === v)?.etiqueta)
      .filter((e): e is string => typeof e === 'string')
    if (etiquetas.length > 0) {
      lineas.push(`- ${pregunta.titulo} ${etiquetas.join('; ')}`)
    } else if (d.noSe.includes(pregunta.id)) {
      lineas.push(`- ${pregunta.titulo} (no lo sabe)`)
    }
  }
  return lineas
}

function mensajeUsuario(d: Descubrimiento, recomendacion: Recomendacion): string {
  const modulos = recomendacion.modulos
    .map((m) => `- ${m.id} (${m.etiqueta}): ${m.motivo}`)
    .join('\n')

  return `Respuestas del cliente:
${respuestasLegibles(d).join('\n')}

Módulos propuestos (id, nombre y motivo actual que hay que reescribir):
${modulos}`
}

export interface DepsRedaccion {
  llamar?: typeof callAssistantWithFallback
  ahora?: () => Date
}

/**
 * Pide al modelo los motivos redactados y las contradicciones. **Nunca lanza**:
 * cualquier fallo (sin claves, timeout, JSON inválido, modelo caído) devuelve la
 * propuesta con los motivos plantilla y `fuente: 'plantilla'`.
 */
export async function redactarPropuesta(
  descubrimiento: Descubrimiento,
  recomendacion: Recomendacion,
  deps: DepsRedaccion = {},
): Promise<PropuestaRedactada> {
  if (recomendacion.modulos.length === 0) {
    return aplicarRedaccion(recomendacion, REDACCION_VACIA)
  }

  const llamar = deps.llamar ?? callAssistantWithFallback
  const ahora = deps.ahora ?? (() => new Date())

  try {
    const respuesta = await llamar(
      [
        { role: 'system', content: SISTEMA },
        { role: 'user', content: mensajeUsuario(descubrimiento, recomendacion) },
      ],
      TIMEOUT_MS,
    )

    const contenido = respuesta?.choices?.[0]?.message?.content
    if (typeof contenido !== 'string' || !contenido.trim()) {
      return aplicarRedaccion(recomendacion, REDACCION_VACIA)
    }

    const redaccion = parsearRedaccion(contenido, recomendacion.modulos.map((m) => m.id))
    if (!redaccion) return aplicarRedaccion(recomendacion, REDACCION_VACIA)

    return aplicarRedaccion(recomendacion, { ...redaccion, generadoEn: ahora().toISOString() })
  } catch (error) {
    console.warn('[Implantacion] Redacción con IA no disponible, se usan textos plantilla:', error)
    return aplicarRedaccion(recomendacion, REDACCION_VACIA)
  }
}
