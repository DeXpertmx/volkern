/**
 * Siguiente pregunta del cuestionario (R3).
 *
 * Doce preguntas en fila se abandonan a la tercera pantalla. En vez de
 * esconder preguntas —lo que dejaría el motor a ciegas—, la pantalla marca
 * cuál toca ahora: la pendiente que más cambia la propuesta. Así quien vuelve
 * al alta sabe por dónde seguir sin recorrer las doce, y lo ya contestado no
 * se mueve de sitio bajo el dedo.
 *
 * La prioridad es una tabla escrita a mano, no una puntuación del modelo: se
 * puede leer, discutir y corregir en un diff. La IA de R3 redacta; el orden de
 * atención lo decide esto, que es testeable.
 *
 * Puro: dos llamadas con el mismo descubrimiento devuelven lo mismo.
 */

import {
  PREGUNTAS,
  respondida,
  type Descubrimiento,
  type PreguntaDescubrimiento,
  type RespuestaId,
} from './descubrimiento'

/**
 * Cuánto cambia la propuesta cada respuesta. El dolor manda porque es el que
 * enciende módulos; el canal de origen solo matiza los que ya salieron.
 */
const PRIORIDAD: Record<RespuestaId, number> = {
  dolor: 10,
  que_vende: 9,
  a_quien: 9,
  ciclo: 8,
  tras_propuesta: 7,
  equipo: 7,
  coste_error: 6,
  herramienta: 5,
  panel: 5,
  decision: 4,
  exito_90d: 4,
  origen: 3,
}

export function prioridadPregunta(id: RespuestaId): number {
  return PRIORIDAD[id]
}

/**
 * Pregunta que toca contestar: la de mayor prioridad entre las pendientes.
 * `null` cuando ya está todo respondido o marcado como «no lo sé».
 */
export function siguientePregunta(d: Descubrimiento): PreguntaDescubrimiento | null {
  const pendientes = PREGUNTAS.filter((p) => !respondida(d, p.id))
  if (pendientes.length === 0) return null

  return pendientes.reduce((mejor, p) => {
    const diferencia = prioridadPregunta(p.id) - prioridadPregunta(mejor.id)
    if (diferencia !== 0) return diferencia > 0 ? p : mejor
    // A igual prioridad, el orden del catálogo: el resultado no oscila.
    return PREGUNTAS.indexOf(p) < PREGUNTAS.indexOf(mejor) ? p : mejor
  })
}
