/**
 * Plan de personalización del alta: las piezas que el cliente aprueba y que
 * solo se escriben cuando pulsa aplicar.
 *
 * La primera pieza es el embudo, la que más cambia el día a día: con etapas sin
 * criterio de salida, las oportunidades se quedan en «Propuesta» durante meses
 * y el dato deja de servir. Aquí se propone el embudo del descubrimiento, el
 * cliente lo retoca y la escritura vive en `aplicar-embudo.ts`.
 *
 * Puro: sin Prisma, sin red, sin fechas. Lo usan la ruta, la pantalla y los
 * tests. Las reglas que aplica son deliberadamente visibles:
 *   - Un embudo necesita al menos dos etapas: una abierta y la de cierre.
 *   - Menos de dos no se inventan: se recomponen desde la propuesta y se dice.
 *   - Las probabilidades suben etapa a etapa y la última cierra al 100 %.
 */

export interface EtapaPlan {
  nombre: string
  /** Qué tiene que pasar para que la oportunidad salga de esta etapa. */
  criterio: string
  probabilidad: number
}

export interface EmbudoPlan {
  nombre: string
  etapas: EtapaPlan[]
}

export const MIN_ETAPAS = 2
export const MAX_ETAPAS = 8
export const MAX_NOMBRE = 60
export const MAX_CRITERIO = 160

export interface NormalizacionEmbudo {
  /** `null` cuando ni con la propuesta se llega al mínimo. */
  embudo: EmbudoPlan | null
  avisos: string[]
}

export interface ResumenEmbudo {
  etapas: number
  sinCriterio: number
  completo: boolean
  texto: string
}

// ─── Lectura de la propuesta guardada ────────────────────────────────────────

/**
 * El embudo que el cliente vio en su descubrimiento. Sale de
 * `ImplantacionTenant.recomendacion`, no de un recálculo: si mañana cambian las
 * reglas, su embudo no debe cambiar solo por detrás.
 */
export function embudoPropuesto(recomendacion: unknown): EmbudoPlan | null {
  if (!recomendacion || typeof recomendacion !== 'object') return null
  const guardado = (recomendacion as Record<string, unknown>).embudo
  if (!guardado) return null
  return normalizarEmbudo(guardado, null).embudo
}

// ─── Normalización de lo que envía el cliente ────────────────────────────────

interface EtapaCruda {
  nombre: string
  criterio: string
  probabilidad: number | null
}

function limpiarTexto(valor: unknown, tope: number): string {
  if (typeof valor !== 'string') return ''
  return valor.replace(/\s+/g, ' ').trim().slice(0, tope)
}

function clave(nombre: string): string {
  return nombre.toLocaleLowerCase('es')
}

function etapaCruda(entrada: unknown): EtapaCruda | null {
  if (typeof entrada === 'string') {
    const nombre = limpiarTexto(entrada, MAX_NOMBRE)
    return nombre ? { nombre, criterio: '', probabilidad: null } : null
  }
  if (!entrada || typeof entrada !== 'object' || Array.isArray(entrada)) return null

  const objeto = entrada as Record<string, unknown>
  const nombre = limpiarTexto(objeto.nombre, MAX_NOMBRE)
  if (!nombre) return null

  const bruto = Number(objeto.probabilidad)
  const probabilidad = Number.isFinite(bruto) ? Math.round(bruto) : null

  return { nombre, criterio: limpiarTexto(objeto.criterio, MAX_CRITERIO), probabilidad }
}

/**
 * Convierte lo que llega de la pantalla en un embudo aplicable, y dice en
 * `avisos` cada cosa que se ha tenido que tocar. Nunca devuelve un embudo roto:
 * o cumple las reglas o es `null` con el motivo.
 */
export function normalizarEmbudo(valor: unknown, propuesta: EmbudoPlan | null): NormalizacionEmbudo {
  const avisos: string[] = []
  const entrada =
    valor && typeof valor === 'object' && !Array.isArray(valor) ? (valor as Record<string, unknown>) : {}

  const nombre = limpiarTexto(entrada.nombre, MAX_NOMBRE) || propuesta?.nombre || 'Ventas'
  const lista = Array.isArray(entrada.etapas) ? entrada.etapas : []

  // 1. Etapas con nombre; las vacías se descartan (una etapa sin nombre no es
  //    una etapa, y crearla dejaría un hueco en el tablero).
  const crudas: EtapaCruda[] = []
  for (const item of lista) {
    const etapa = etapaCruda(item)
    if (etapa) crudas.push(etapa)
  }
  const sinNombre = lista.length - crudas.length
  if (sinNombre > 0) {
    avisos.push(
      sinNombre === 1
        ? 'Había una etapa sin nombre: se ha descartado.'
        : `Había ${sinNombre} etapas sin nombre: se han descartado.`,
    )
  }

  // 2. Nombres repetidos: dos columnas con el mismo nombre confunden a quien
  //    arrastra una oportunidad.
  const vistas = new Set<string>()
  const unicas = crudas.filter((etapa) => {
    const k = clave(etapa.nombre)
    if (vistas.has(k)) return false
    vistas.add(k)
    return true
  })
  if (unicas.length < crudas.length) {
    const repetidas = crudas.length - unicas.length
    avisos.push(
      repetidas === 1
        ? 'Había una etapa repetida: se ha quedado una sola con ese nombre.'
        : `Habían ${repetidas} etapas repetidas: se ha quedado una sola de cada nombre.`,
    )
  }

  let etapas = unicas
  if (etapas.length > MAX_ETAPAS) {
    const sobran = etapas.length - MAX_ETAPAS
    etapas = etapas.slice(0, MAX_ETAPAS)
    avisos.push(
      `Solo caben ${MAX_ETAPAS} etapas: se ${sobran === 1 ? 'ha quitado la última' : `han quitado las ${sobran} últimas`}.`,
    )
  }

  // 3. Sin material suficiente se recompone desde la propuesta, nunca de la
  //    nada: el cliente ve el embudo que ya había aprobado en el alta.
  if (etapas.length < MIN_ETAPAS) {
    const antes = etapas.length
    for (const respaldo of propuesta?.etapas ?? []) {
      if (etapas.length >= MIN_ETAPAS) break
      if (etapas.some((etapa) => clave(etapa.nombre) === clave(respaldo.nombre))) continue
      etapas.push({ ...respaldo })
    }

    if (etapas.length < MIN_ETAPAS) {
      return {
        embudo: null,
        avisos: [
          ...avisos,
          `Un embudo necesita al menos ${MIN_ETAPAS} etapas: una abierta y la de cierre. Ahora hay ${antes}.`,
        ],
      }
    }

    avisos.push(
      `Un embudo necesita al menos ${MIN_ETAPAS} etapas: se han recompuesto ${etapas.length - antes} desde tu propuesta.`,
    )
  }

  // 4. Probabilidades: las que falten se toman de la propuesta con el mismo
  //    nombre y, si no hay, se reparten por posición.
  const resueltas = etapas.map((etapa, i) => {
    if (etapa.probabilidad !== null) return etapa.probabilidad
    const dePropuesta = propuesta?.etapas.find((p) => clave(p.nombre) === clave(etapa.nombre))
    if (dePropuesta) return dePropuesta.probabilidad
    return etapas.length === 1 ? 100 : Math.round((i / (etapas.length - 1)) * 100)
  })

  let fueraDeRango = 0
  const probabilidades = resueltas.map((valor) => {
    const acotada = Math.min(100, Math.max(0, Math.round(valor)))
    if (acotada !== Math.round(valor)) fueraDeRango++
    return acotada
  })
  if (fueraDeRango > 0) {
    avisos.push(
      fueraDeRango === 1
        ? 'Una probabilidad se salía de 0–100: se ha acotado.'
        : `${fueraDeRango} probabilidades se salían de 0–100: se han acotado.`,
    )
  }

  // 5. El orden tiene que significar algo: una etapa no puede tener menos
  //    probabilidad que la anterior.
  let bajadas = 0
  for (let i = 1; i < probabilidades.length; i++) {
    if (probabilidades[i] < probabilidades[i - 1]) {
      probabilidades[i] = probabilidades[i - 1]
      bajadas++
    }
  }
  if (bajadas > 0) {
    avisos.push(
      bajadas === 1
        ? 'Una etapa bajaba de probabilidad respecto a la anterior: se ha igualado para que el orden signifique algo.'
        : `${bajadas} etapas bajaban de probabilidad respecto a la anterior: se han igualado para que el orden signifique algo.`,
    )
  }

  // 6. La última etapa es la que cierra: al 100 % para que la previsión no
  //    descuente ventas ya ganadas.
  const ultima = probabilidades.length - 1
  if (probabilidades[ultima] !== 100) {
    probabilidades[ultima] = 100
    avisos.push('La última etapa cierra la venta: se pone al 100 % para que la previsión cuadre.')
  }

  const embudo: EmbudoPlan = {
    nombre,
    etapas: etapas.map((etapa, i) => ({ ...etapa, probabilidad: probabilidades[i] })),
  }

  const sinCriterio = embudo.etapas.filter((etapa) => etapa.criterio.length === 0).length
  if (sinCriterio > 0) {
    avisos.push(
      sinCriterio === 1
        ? 'Una etapa no tiene criterio de salida: sin él nadie sabe cuándo mover la oportunidad.'
        : `${sinCriterio} etapas no tienen criterio de salida: sin él nadie sabe cuándo mover la oportunidad.`,
    )
  }

  return { embudo, avisos }
}

// ─── Resumen para la pantalla ────────────────────────────────────────────────

export function resumenEmbudo(embudo: EmbudoPlan): ResumenEmbudo {
  const etapas = embudo.etapas.length
  const sinCriterio = embudo.etapas.filter((etapa) => etapa.criterio.trim().length === 0).length

  return {
    etapas,
    sinCriterio,
    completo: sinCriterio === 0,
    texto:
      sinCriterio === 0
        ? `${etapas} etapas, todas con criterio de salida.`
        : `${etapas} etapas, ${sinCriterio} sin criterio de salida.`,
  }
}
