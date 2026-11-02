/**
 * Cuestionario de descubrimiento del alta guiada.
 *
 * Doce preguntas en lenguaje de negocio, agrupadas en tres bloques. Cada una
 * desbloquea una decisión del motor (`lib/implantacion/recomendar.ts`); las que
 * no desbloquean nada no se preguntan, porque un cuestionario largo se
 * abandona a la tercera pantalla.
 *
 * Reglas que este fichero hace cumplir:
 *   - «No lo sé» es una respuesta válida y explícita: la pregunta queda en
 *     `noSe` y el motor no recomienda sobre ella. Inventar una recomendación a
 *     partir de una duda es peor que no recomendar.
 *   - `notas` (texto libre) se guarda para no perder matices, pero NO alimenta
 *     reglas. Si un matiz importa, se convierte en opción de una pregunta: un
 *     LLM que interprete texto libre para decidir módulos es justo lo que este
 *     diseño evita.
 *
 * Este módulo es puro (sin Prisma, sin red) y lo importa la pantalla cliente.
 */

// ─── Tipos ───────────────────────────────────────────────────────────────────

export type RespuestaId =
  | 'que_vende'
  | 'a_quien'
  | 'origen'
  | 'equipo'
  | 'ciclo'
  | 'dolor'
  | 'tras_propuesta'
  | 'coste_error'
  | 'herramienta'
  | 'panel'
  | 'decision'
  | 'exito_90d'

export type BloqueDescubrimiento = 'negocio' | 'dolor' | 'control'

export interface OpcionDescubrimiento {
  valor: string
  etiqueta: string
  /** Matiz corto que se muestra bajo la etiqueta. */
  detalle?: string
}

export interface PreguntaDescubrimiento {
  id: RespuestaId
  bloque: BloqueDescubrimiento
  titulo: string
  ayuda: string
  multiple: boolean
  /** Tope de opciones seleccionables en las preguntas múltiples. */
  maxOpciones?: number
  opciones: OpcionDescubrimiento[]
}

export interface Descubrimiento {
  respuestas: Partial<Record<RespuestaId, string[]>>
  /** Preguntas en las que el cliente dijo «no lo sé». */
  noSe: RespuestaId[]
  notas: string
  version: 1
}

export const BLOQUES: { id: BloqueDescubrimiento; titulo: string; ayuda: string }[] = [
  {
    id: 'negocio',
    titulo: 'Tu negocio',
    ayuda: 'Qué vendes y cómo llega un cliente hoy. Es lo que decide el catálogo y el embudo.',
  },
  {
    id: 'dolor',
    titulo: 'Lo que te duele',
    ayuda: 'Sin esto, cualquier propuesta es genérica. Elige lo que más te pese, no lo que suene peor.',
  },
  {
    id: 'control',
    titulo: 'Qué quieres controlar',
    ayuda: 'Lo que mirarás cada lunes y cómo sabrás en 90 días que esto ha funcionado.',
  },
]

// ─── Catálogo de preguntas ───────────────────────────────────────────────────

export const PREGUNTAS: PreguntaDescubrimiento[] = [
  {
    id: 'que_vende',
    bloque: 'negocio',
    titulo: '¿Qué vendes?',
    ayuda: 'Con esto decidimos si necesitas catálogo, inventario, cotizaciones o reservas.',
    multiple: false,
    opciones: [
      { valor: 'productos', etiqueta: 'Productos', detalle: 'Cosas que se envían o se entregan' },
      { valor: 'servicios', etiqueta: 'Servicios', detalle: 'Trabajo por horas, proyecto o cuota' },
      { valor: 'ambos', etiqueta: 'Productos y servicios', detalle: 'Instalación con material, por ejemplo' },
      { valor: 'suscripcion', etiqueta: 'Suscripción', detalle: 'Se cobra todos los meses' },
      { valor: 'alojamiento', etiqueta: 'Alojamiento', detalle: 'Habitaciones, casas, plazas' },
    ],
  },
  {
    id: 'a_quien',
    bloque: 'negocio',
    titulo: '¿A quién vendes?',
    ayuda: 'Cambia cuántas personas hay por cuenta y quién firma.',
    multiple: false,
    opciones: [
      { valor: 'empresas', etiqueta: 'Empresas', detalle: 'Varias personas y un decisor' },
      { valor: 'particulares', etiqueta: 'Particulares', detalle: 'Una persona, una decisión' },
      { valor: 'ambos', etiqueta: 'Ambos', detalle: 'Mezcla real de los dos' },
    ],
  },
  {
    id: 'origen',
    bloque: 'negocio',
    titulo: '¿Cómo llega un cliente hoy?',
    ayuda: 'Marca todos los canales que ya te traen trabajo.',
    multiple: true,
    opciones: [
      { valor: 'referidos', etiqueta: 'Referidos y boca a boca' },
      { valor: 'web', etiqueta: 'Mi web' },
      { valor: 'redes', etiqueta: 'Redes sociales' },
      { valor: 'llamadas', etiqueta: 'Llamadas entrantes' },
      { valor: 'ferias', etiqueta: 'Ferias y eventos' },
      { valor: 'partners', etiqueta: 'Partners o distribuidores' },
    ],
  },
  {
    id: 'equipo',
    bloque: 'negocio',
    titulo: '¿Cuántas personas venden?',
    ayuda: 'Cuenta solo quien toca oportunidades; administración y dirección se suman después.',
    multiple: false,
    opciones: [
      { valor: 'solo', etiqueta: 'Solo yo' },
      { valor: '2_5', etiqueta: '2 a 5' },
      { valor: '6_20', etiqueta: '6 a 20' },
      { valor: 'mas_20', etiqueta: 'Más de 20' },
    ],
  },
  {
    id: 'ciclo',
    bloque: 'negocio',
    titulo: '¿Cuánto tarda una venta de media?',
    ayuda: 'Desde el primer contacto hasta el cobro o la firma.',
    multiple: false,
    opciones: [
      { valor: 'menos_7d', etiqueta: 'Menos de 7 días' },
      { valor: '2_4s', etiqueta: '2 a 4 semanas' },
      { valor: '1_3m', etiqueta: '1 a 3 meses' },
      { valor: 'mas_3m', etiqueta: 'Más de 3 meses' },
    ],
  },
  {
    id: 'dolor',
    bloque: 'dolor',
    titulo: '¿Qué te duele más hoy?',
    ayuda: 'Elige el que te quita el sueño, no el que queda mejor en una reunión.',
    multiple: false,
    opciones: [
      { valor: 'leads_frios', etiqueta: 'Se me enfrían los leads', detalle: 'Llegan y nadie los trabaja a tiempo' },
      { valor: 'prevision', etiqueta: 'No sé qué voy a vender el mes que viene' },
      { valor: 'cotizaciones_lentas', etiqueta: 'Las propuestas tardan demasiado' },
      { valor: 'no_se_equipo', etiqueta: 'No sé qué hace mi equipo' },
      { valor: 'pierdo_seguimiento', etiqueta: 'Pierdo el seguimiento tras la propuesta' },
      { valor: 'facturo_tarde', etiqueta: 'Facturo tarde o me equivoco al facturar' },
    ],
  },
  {
    id: 'tras_propuesta',
    bloque: 'dolor',
    titulo: '¿Qué pasa después de enviar una propuesta?',
    ayuda: 'Lo que ocurre de verdad, no el proceso escrito.',
    multiple: false,
    opciones: [
      { valor: 'nada', etiqueta: 'Nada: espero a que contesten' },
      { valor: 'llamo_yo', etiqueta: 'Llamo yo a los días' },
      { valor: 'se_pierde', etiqueta: 'Se pierde en el correo' },
      { valor: 'se_firma_papel', etiqueta: 'Se firma en papel' },
    ],
  },
  {
    id: 'coste_error',
    bloque: 'dolor',
    titulo: '¿Qué te ha costado dinero últimamente?',
    ayuda: 'El error que ya has pagado es el que mejor justifica una automatización.',
    multiple: false,
    opciones: [
      { valor: 'perder_cliente', etiqueta: 'Perder un cliente que estaba hecho' },
      { valor: 'precio', etiqueta: 'Un error de precio o de descuento' },
      { valor: 'factura', etiqueta: 'Una factura mal emitida' },
      { valor: 'no_cobrar', etiqueta: 'Trabajo hecho y no cobrado' },
    ],
  },
  {
    id: 'herramienta',
    bloque: 'dolor',
    titulo: '¿Qué usas hoy y qué odias de ello?',
    ayuda: 'De aquí sale el plan de migración y qué datos hay que traer.',
    multiple: true,
    opciones: [
      { valor: 'excel', etiqueta: 'Excel o Google Sheets' },
      { valor: 'otro_crm', etiqueta: 'Otro CRM' },
      { valor: 'papel', etiqueta: 'Papel y agenda' },
      { valor: 'whatsapp', etiqueta: 'WhatsApp como gestor de clientes' },
      { valor: 'ninguna', etiqueta: 'Nada: todo en la cabeza' },
    ],
  },
  {
    id: 'panel',
    bloque: 'control',
    titulo: '¿Qué quieres ver en un panel cada lunes?',
    ayuda: 'Elige hasta tres. Son los informes que quedan fijados en tu cuenta.',
    multiple: true,
    maxOpciones: 3,
    opciones: [
      { valor: 'embudo', etiqueta: 'Embudo por etapa' },
      { valor: 'prevision', etiqueta: 'Previsión de lo que voy a vender' },
      { valor: 'actividad', etiqueta: 'Actividad por comercial' },
      { valor: 'conversion', etiqueta: 'Conversión por origen' },
      { valor: 'ciclo', etiqueta: 'Tiempo de cierre' },
      { valor: 'margen', etiqueta: 'Margen por producto o servicio' },
      { valor: 'cobros', etiqueta: 'Cobros pendientes' },
    ],
  },
  {
    id: 'decision',
    bloque: 'control',
    titulo: '¿Qué decisión tomas hoy a ojo y quieres tomar con datos?',
    ayuda: 'Una sola: la que más veces al mes te obliga a adivinar.',
    multiple: false,
    opciones: [
      { valor: 'a_quien_llamar', etiqueta: 'A quién llamar primero' },
      { valor: 'que_precio', etiqueta: 'Qué precio o descuento dar' },
      { valor: 'cuando_contratar', etiqueta: 'Cuándo contratar a otra persona' },
      { valor: 'que_producto', etiqueta: 'Qué producto o servicio empujar' },
    ],
  },
  {
    id: 'exito_90d',
    bloque: 'control',
    titulo: '¿Cómo sabrás en 90 días que esto ha funcionado?',
    ayuda: 'Elige el resultado. El número concreto lo pondremos juntos en la revisión.',
    multiple: false,
    opciones: [
      { valor: 'cerrar_mas', etiqueta: 'Cierro más oportunidades' },
      { valor: 'cerrar_antes', etiqueta: 'Cierro antes' },
      { valor: 'no_perder', etiqueta: 'No pierdo oportunidades por olvido' },
      { valor: 'saber_antes', etiqueta: 'Sé antes cómo va el mes' },
      { valor: 'cobrar_antes', etiqueta: 'Cobro antes' },
    ],
  },
]

export const PREGUNTAS_POR_ID: Record<RespuestaId, PreguntaDescubrimiento> =
  PREGUNTAS.reduce((acc, p) => {
    acc[p.id] = p
    return acc
  }, {} as Record<RespuestaId, PreguntaDescubrimiento>)

export const DESCUBRIMIENTO_VACIO: Descubrimiento = {
  respuestas: {},
  noSe: [],
  notas: '',
  version: 1,
}

const MAX_NOTAS = 2000

// ─── Normalización ───────────────────────────────────────────────────────────

export interface NormalizacionDescubrimiento {
  descubrimiento: Descubrimiento
  /** Cambios que se han descartado, en texto legible para el cliente. */
  avisos: string[]
}

/**
 * Convierte lo que llega del navegador (o de la base) en un `Descubrimiento`
 * válido: solo preguntas y opciones del catálogo, sin duplicados, con el tope
 * de opciones de cada pregunta respetado.
 *
 * Un valor desconocido se descarta con un aviso en vez de rechazar el envío
 * entero: perder una respuesta no debe costar las otras once.
 */
export function normalizarDescubrimiento(entrada: unknown): NormalizacionDescubrimiento {
  const avisos: string[] = []
  const bruto = (entrada ?? {}) as Record<string, unknown>
  const respuestasBrutas = (bruto.respuestas ?? {}) as Record<string, unknown>
  const noSeBruto = Array.isArray(bruto.noSe) ? bruto.noSe : []

  const respuestas: Partial<Record<RespuestaId, string[]>> = {}
  const noSe: RespuestaId[] = []

  for (const id of noSeBruto) {
    if (typeof id === 'string' && PREGUNTAS_POR_ID[id as RespuestaId]) {
      const preguntaId = id as RespuestaId
      if (!noSe.includes(preguntaId)) noSe.push(preguntaId)
    }
  }

  for (const pregunta of PREGUNTAS) {
    const valor = respuestasBrutas[pregunta.id]
    if (valor === undefined || valor === null || valor === '') continue

    const crudo = Array.isArray(valor) ? valor : [valor]
    const permitidos = new Set(pregunta.opciones.map((o) => o.valor))
    const limpios: string[] = []

    for (const v of crudo) {
      if (typeof v !== 'string') continue
      if (!permitidos.has(v)) {
        avisos.push(`「${pregunta.titulo}」: la opción «${v}» no existe y se ha ignorado.`)
        continue
      }
      if (!limpios.includes(v)) limpios.push(v)
    }

    if (limpios.length === 0) continue

    // «No lo sé» gana a una respuesta: no se recomienda sobre una duda.
    if (noSe.includes(pregunta.id)) {
      avisos.push(`「${pregunta.titulo}」: marcada como «no lo sé», se ignora la respuesta.`)
      continue
    }

    if (!pregunta.multiple) {
      respuestas[pregunta.id] = [limpios[0]]
      continue
    }

    const tope = pregunta.maxOpciones ?? limpios.length
    if (limpios.length > tope) {
      avisos.push(`「${pregunta.titulo}」: solo se tienen en cuenta ${tope} opciones.`)
    }
    respuestas[pregunta.id] = limpios.slice(0, tope)
  }

  const notas = typeof bruto.notas === 'string' ? bruto.notas.trim().slice(0, MAX_NOTAS) : ''

  return {
    descubrimiento: { respuestas, noSe, notas, version: 1 },
    avisos,
  }
}

// ─── Consultas ───────────────────────────────────────────────────────────────

export function respuestasDe(d: Descubrimiento, id: RespuestaId): string[] {
  return d.respuestas[id] ?? []
}

export function respondida(d: Descubrimiento, id: RespuestaId): boolean {
  return respuestasDe(d, id).length > 0 || d.noSe.includes(id)
}

export function dijoNoSe(d: Descubrimiento, id: RespuestaId): boolean {
  return d.noSe.includes(id)
}

/** Preguntas que el cliente aún no ha contestado ni marcado como «no lo sé». */
export function preguntasPendientes(d: Descubrimiento): PreguntaDescubrimiento[] {
  return PREGUNTAS.filter((p) => !respondida(d, p.id))
}

/**
 * ¿Hay material suficiente para proponer algo?
 * Con tres respuestas ya se puede; con una no (sería adivinar).
 */
export const MINIMO_RESPUESTAS_PARA_PROPONER = 3

export function hayMaterialSuficiente(d: Descubrimiento): boolean {
  const contestadas = PREGUNTAS.filter((p) => respuestasDe(d, p.id).length > 0).length
  return contestadas >= MINIMO_RESPUESTAS_PARA_PROPONER
}

export function resumenDescubrimiento(d: Descubrimiento): {
  contestadas: number
  noSe: number
  pendientes: number
  total: number
} {
  const total = PREGUNTAS.length
  const noSe = d.noSe.length
  const contestadas = PREGUNTAS.filter((p) => respuestasDe(d, p.id).length > 0).length
  return { contestadas, noSe, pendientes: total - contestadas - noSe, total }
}
