/**
 * Cuarta pieza de personalización del alta: la marca con la que se firma y los
 * canales por los que entra un cliente.
 *
 * Las dos van juntas porque se estropean juntas: un alta que deja el nombre de
 * la cuenta («tenant_8471») en las propuestas y no dice de dónde vienen los
 * leads acaba con documentos que el cliente no reconoce y con un informe de
 * conversión que no se puede leer.
 *
 * Reglas que gobierna el fichero:
 *   - **Los canales no se inventan.** Son los valores que la plataforma ya usa
 *     en `Lead.canal` (`components/leads-content.tsx`): si el alta propusiera un
 *     canal que el desplegable de leads no ofrece, el dato nacería huérfano.
 *   - **El nombre no se inventa.** Se propone el nombre comercial que ya tenga
 *     la cuenta o, en su defecto, el nombre del tenant limpio. Nunca una marca
 *     nueva: eso lo decide el cliente.
 *   - **El logo no se propone.** Es suyo y no se genera: se dice que falta y
 *     dónde subirlo.
 *   - **Sin respuesta de origen no se adivina el canal**: se proponen los dos
 *     universales (referido y web) y se avisa de por qué.
 *
 * Puro: sin Prisma, sin red, sin fechas. Lo importan la ruta y la pantalla.
 */

import { respuestasDe, type Descubrimiento } from './descubrimiento'

// ─── Catálogo de canales ─────────────────────────────────────────────────────

export type CanalCaptacionId =
  | 'web'
  | 'referido'
  | 'whatsapp'
  | 'redes_sociales'
  | 'linkedin'
  | 'telefono'
  | 'email'
  | 'evento'

export interface CanalCaptacion {
  /** Debe existir como valor de `Lead.canal` en el alta de leads. */
  id: CanalCaptacionId
  nombre: string
  /** Cómo entra un lead por aquí, en una frase. */
  comoEntra: string
  /** Lo primero que hay que hacer para que el canal deje leads en la cuenta. */
  primerPaso: string
  /** Qué hay que conectar o publicar; `null` si no depende de nada externo. */
  requiere: string | null
}

/**
 * El orden no es alfabético: es el de la pantalla, de lo que más rápido da
 * frutos a lo que más tarda en montarse.
 */
export const CANALES_CAPTACION: CanalCaptacion[] = [
  {
    id: 'referido',
    nombre: 'Referidos y boca a boca',
    comoEntra: 'Alguien te presenta y tú das de alta al cliente.',
    primerPaso:
      'Al crear cada lead nuevo, poner el canal «referido» y en «fuente» el nombre de quien lo trajo. Sin ese nombre no se puede agradecer ni repetir.',
    requiere: null,
  },
  {
    id: 'web',
    nombre: 'Formulario en tu web',
    comoEntra: 'Rellenan un formulario y el lead se crea sin que nadie lo copie.',
    primerPaso:
      'Publicar el formulario de contacto y conectarlo a la cuenta para que cada envío cree un lead con canal «web».',
    requiere: 'Un formulario publicado en tu web',
  },
  {
    id: 'telefono',
    nombre: 'Llamadas entrantes',
    comoEntra: 'Llaman al número del negocio y alguien atiende.',
    primerPaso:
      'Registrar la llamada como interacción del lead y su canal como «telefono». Una llamada que no se registra no existe para la previsión.',
    requiere: null,
  },
  {
    id: 'whatsapp',
    nombre: 'WhatsApp',
    comoEntra: 'Escriben al número del negocio y la conversación entra sola.',
    primerPaso:
      'Conectar el número de WhatsApp Business para que los mensajes creen conversación con su lead y su canal.',
    requiere: 'Un número de WhatsApp Business',
  },
  {
    id: 'redes_sociales',
    nombre: 'Instagram y Facebook',
    comoEntra: 'Comentan una publicación o escriben por mensaje directo.',
    primerPaso:
      'Conectar las cuentas de Instagram y Facebook desde Integraciones para que los mensajes directos no se queden en la bandeja de la red.',
    requiere: 'Una cuenta de Instagram o Facebook',
  },
  {
    id: 'email',
    nombre: 'Email y campañas',
    comoEntra: 'Responden a un envío, no a una llamada.',
    primerPaso:
      'Verificar el dominio de envío y etiquetar como canal «email» a quien responda a una campaña.',
    requiere: 'Un dominio de envío verificado',
  },
  {
    id: 'linkedin',
    nombre: 'LinkedIn',
    comoEntra: 'Responden a un mensaje o a una publicación tuya.',
    primerPaso:
      'Registrar el canal «linkedin» al importar la lista de contactos y al crear cada lead que venga de un mensaje.',
    requiere: null,
  },
  {
    id: 'evento',
    nombre: 'Ferias y eventos',
    comoEntra: 'Vuelves con una lista o con tarjetas escaneadas.',
    primerPaso:
      'Importar la lista del evento con el canal «evento» ya puesto, para que el informe de conversión por origen no empiece tuerto.',
    requiere: 'La lista del evento',
  },
]

export const CANAL_CAPTACION_POR_ID: Record<CanalCaptacionId, CanalCaptacion> = CANALES_CAPTACION.reduce(
  (acc, canal) => {
    acc[canal.id] = canal
    return acc
  },
  {} as Record<CanalCaptacionId, CanalCaptacion>,
)

// ─── Propuesta de canales ────────────────────────────────────────────────────

export interface ContextoCanales {
  /**
   * Leads que ya existen en la cuenta por canal, `{ web: 12, referido: 3 }`.
   * Sirve para decir «esto ya lo usas» en vez de proponerlo como nuevo.
   */
  leadsPorCanal?: Record<string, number>
  /**
   * Canales cuya integración ya está conectada (WhatsApp, redes, dominio de
   * email). No cambia la propuesta: cambia lo que se pide en la tarea.
   */
  conectados?: string[]
}

export interface CanalPropuesto extends CanalCaptacion {
  /** Marcado al abrir la pantalla. */
  propuesto: boolean
  /** Por qué encaja con lo que ha contado, en sus palabras. */
  motivo: string
  /** Qué haría falta para que encajara, cuando no se propone. */
  paraEncajar: string | null
  /** Leads que ya hay en la cuenta con este canal. */
  leads: number
  /** Si la integración del canal ya está conectada. */
  conectado: boolean
}

export interface PropuestaCanales {
  canales: CanalPropuesto[]
  /** Por dónde entra hoy el trabajo, según lo que contestó. */
  origenDeclarado: string[]
  avisos: string[]
}

/** Respuestas de `origen` que se traducen a un canal de la plataforma. */
const ORIGEN_A_CANAL: Record<string, CanalCaptacionId> = {
  referidos: 'referido',
  web: 'web',
  redes: 'redes_sociales',
  llamadas: 'telefono',
  ferias: 'evento',
  // Un partner trae trabajo como un referido: el canal es el mismo y su nombre
  // va en `Lead.fuente`, que es texto libre.
  partners: 'referido',
}

function tiene(d: Descubrimiento, id: Parameters<typeof respuestasDe>[1], valor: string): boolean {
  return respuestasDe(d, id).includes(valor)
}

/**
 * Canales que se proponen a partir del perfil. El orden del catálogo manda en la
 * pantalla, así que aquí solo se decide el «sí» y el motivo.
 */
export function proponerCanales(d: Descubrimiento, ctx: ContextoCanales = {}): PropuestaCanales {
  const avisos: string[] = []
  const razones = new Map<CanalCaptacionId, string[]>()
  const origenDeclarado = respuestasDe(d, 'origen')

  const proponer = (id: CanalCaptacionId, motivo: string) => {
    const previas = razones.get(id) ?? []
    if (!previas.includes(motivo)) previas.push(motivo)
    razones.set(id, previas)
  }

  // 1. Lo que el cliente ya sabe que le trae trabajo manda sobre cualquier
  //    inferencia: es el único dato de canal que no estamos suponiendo.
  for (const origen of origenDeclarado) {
    const canal = ORIGEN_A_CANAL[origen]
    if (!canal) continue

    if (origen === 'partners') {
      proponer(
        canal,
        'Un partner te trae trabajo igual que un referido: se registra en el canal «referido» y el nombre del partner, en «fuente».',
      )
      continue
    }

    proponer(canal, MOTIVO_POR_ORIGEN[origen] ?? 'Lo has marcado como una vía por la que ya te llegan clientes.')
  }

  // 2. El dolor y las herramientas dicen cosas que la pregunta de origen no
  //    recoge: quien pierde leads necesita embudo de entrada, no más canales.
  if (tiene(d, 'dolor', 'leads_frios')) {
    proponer(
      'web',
      'Con el dolor que has marcado —se te enfrían los leads— un formulario conectado crea el lead, lo asigna y avisa el mismo día: dos días de espera ya es un lead frío.',
    )
  }

  if (tiene(d, 'herramienta', 'whatsapp')) {
    proponer(
      'whatsapp',
      'Hoy gestionas clientes por WhatsApp: si no se conecta, ese histórico se queda fuera del CRM y el seguimiento depende de la memoria de cada uno.',
    )
  }

  const aEmpresas = tiene(d, 'a_quien', 'empresas') || tiene(d, 'a_quien', 'ambos')
  const cicloLargo = tiene(d, 'ciclo', '1_3m') || tiene(d, 'ciclo', 'mas_3m')
  if (aEmpresas && cicloLargo) {
    proponer(
      'linkedin',
      'Vendes a empresas con un ciclo largo: LinkedIn es donde están los decisores, y sin canal no podrás saber si de ahí sale algo o solo visitas.',
    )
  }

  // 3. Sin respuesta de origen no se adivina: se proponen los dos canales que
  //    existen en cualquier negocio y se dice que es una suposición.
  if (origenDeclarado.length === 0) {
    const noSe = d.noSe.includes('origen')
    proponer('referido', 'Todo negocio tiene boca a boca, aunque no lo mida: registrarlo es lo que permite saber cuánto pesa.')
    proponer('web', 'Casi todo negocio tiene una web que recibe visitas: si no hay formulario conectado, esa visita no deja nada.')
    avisos.push(
      noSe
        ? 'Marcaste «no lo sé» en cómo llega un cliente: estos dos canales salen del perfil del negocio, no de tu respuesta. Cámbialos si no encajan.'
        : 'No nos has dicho cómo llega un cliente hoy: estos dos canales salen del perfil del negocio, no de tu respuesta. Cámbialos si no encajan.',
    )
  }

  const leads = ctx.leadsPorCanal ?? {}
  const conectados = new Set(ctx.conectados ?? [])

  const canales: CanalPropuesto[] = CANALES_CAPTACION.map((canal) => {
    const elegido = razones.get(canal.id) ?? []
    const yaTieneLeads = (leads[canal.id] ?? 0) > 0

    return {
      ...canal,
      propuesto: elegido.length > 0 || yaTieneLeads,
      motivo: elegido.length
        ? elegido.join(' ')
        : yaTieneLeads
          ? 'Ya tienes leads en la cuenta con este canal: la tarea es dejarlo bien etiquetado, no empezar de cero.'
          : '',
      paraEncajar: elegido.length
        ? null
        : yaTieneLeads
          ? null
          : 'Márcalo si también llegan clientes por aquí: sin canal, ese lead no se puede atribuir a nada.',
      leads: leads[canal.id] ?? 0,
      conectado: conectados.has(canal.id),
    }
  })

  // 4. «Conversión por origen» con un solo canal no compara nada.
  const propuestos = canales.filter((canal) => canal.propuesto).length
  if (tiene(d, 'panel', 'conversion') && propuestos < 2) {
    avisos.push(
      'Pediste conversión por origen: con un solo canal no hay nada que comparar. Marca los canales que de verdad usas, aunque traigan poco.',
    )
  }

  return { canales, origenDeclarado, avisos }
}

const MOTIVO_POR_ORIGEN: Record<string, string> = {
  referidos:
    'Lo has marcado como canal que ya te trae trabajo: es el más barato de medir y el que más se olvida de registrar.',
  web: 'Tu web ya recibe visitas: un formulario conectado convierte esa visita en un lead con canal, sin que nadie lo copie a mano.',
  redes:
    'Los mensajes directos de Instagram y Facebook se pierden en la bandeja de la red: conectados, entran al CRM con su canal.',
  llamadas:
    'Las llamadas entrantes se atienden, pero si no se registran no se sabe cuántas acaban en venta.',
  ferias:
    'De una feria vuelves con una lista: importarla con el canal puesto es lo que evita que se quede en un Excel del portátil.',
}

// ─── Propuesta de marca ──────────────────────────────────────────────────────

export interface ContextoMarca {
  /** `Tenant.nombre`: el nombre feo que hay que mejorar si no hay otro. */
  nombreCuenta: string
  /** `Configuracion.business_name`, si ya existe. */
  nombreComercial: string | null
  /** `Tenant.brandingConfig.primaryColor`, si ya existe. */
  colorActual: string | null
  /** Si hay logo corporativo subido (`logo_corporativo` o `brandingConfig.logoUrl`). */
  tieneLogo: boolean
}

export interface ColorPropuesto {
  hex: string
  nombre: string
  motivo: string
}

export interface PropuestaMarca {
  nombre: {
    propuesto: string
    actual: string | null
    cambia: boolean
    motivo: string
  }
  color: {
    propuesto: string
    actual: string | null
    cambia: boolean
    motivo: string
  }
  /** Alternativas para que el cliente elija sin inventarse un hexadecimal. */
  paleta: ColorPropuesto[]
  /** Lo que falta para tener una marca completa, incluido el logo. */
  falta: string[]
}

export const MAX_NOMBRE_MARCA = 80

/**
 * Colores de partida por lo que vende el negocio. No es una teoría del color:
 * es un punto de partida razonable para que nadie acabe con el azul del sistema
 * puesto en todos los documentos.
 */
const PALETA_POR_QUE_VENDE: Record<string, ColorPropuesto> = {
  alojamiento: {
    hex: '#0f766e',
    nombre: 'Verde profundo',
    motivo: 'Alojamiento: se vende calma y confianza en la reserva; el verde lo dice sin gritar.',
  },
  servicios: {
    hex: '#1d4ed8',
    nombre: 'Azul profesional',
    motivo: 'Servicios: se compra criterio profesional; el azul es la convención del sector y no cansa.',
  },
  productos: {
    hex: '#b45309',
    nombre: 'Ámbar tostado',
    motivo: 'Productos: destaca en una ficha y en un catálogo impreso sin competir con las fotos.',
  },
  ambos: {
    hex: '#0d9488',
    nombre: 'Turquesa',
    motivo: 'Productos y servicios: un color que sirve para el catálogo y para la propuesta.',
  },
  suscripcion: {
    hex: '#6d28d9',
    nombre: 'Violeta',
    motivo: 'Suscripción: se asocia a producto digital y aguanta bien en pantalla.',
  },
}

export const COLOR_POR_DEFECTO = '#3b82f6'

const HEX = /^#[0-9a-f]{6}$/i

/** Normaliza un color a `#rrggbb` en minúsculas; `null` si no es un hex válido. */
export function normalizarColor(valor: unknown): string | null {
  if (typeof valor !== 'string') return null
  const limpio = valor.trim().toLowerCase()
  if (!limpio) return null

  const conAlmohadilla = limpio.startsWith('#') ? limpio : `#${limpio}`
  // Tres dígitos es lo que devuelve un `<input type="color">` mal copiado; se
  // expande en vez de rechazarlo.
  const corto = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(conAlmohadilla)
  if (corto) return `#${corto[1]}${corto[1]}${corto[2]}${corto[2]}${corto[3]}${corto[3]}`

  return HEX.test(conAlmohadilla) ? conAlmohadilla : null
}

/** Limpia un nombre comercial: espacios colapsados y tope de longitud. */
export function limpiarNombreComercial(valor: unknown): string {
  if (typeof valor !== 'string') return ''
  return valor.replace(/\s+/g, ' ').trim().slice(0, MAX_NOMBRE_MARCA)
}

export function proponerMarca(d: Descubrimiento, ctx: ContextoMarca): PropuestaMarca {
  const actualNombre = limpiarNombreComercial(ctx.nombreComercial) || null
  const actualColor = normalizarColor(ctx.colorActual)

  // El nombre comercial ya puesto manda: cambiarlo sería pisar una decisión.
  const nombrePropuesto =
    actualNombre || limpiarNombreComercial(ctx.nombreCuenta) || 'Tu empresa'

  const queVende = respuestasDe(d, 'que_vende')[0] ?? ''
  const elegido =
    PALETA_POR_QUE_VENDE[queVende] ?? {
      hex: COLOR_POR_DEFECTO,
      nombre: 'Azul de la plataforma',
      motivo:
        'No sabemos qué vendes con suficiente detalle: el azul de la plataforma es neutro y se puede cambiar en cualquier momento.',
    }

  const paleta: ColorPropuesto[] = [
    elegido,
    ...Object.values(PALETA_POR_QUE_VENDE).filter((color) => color.hex !== elegido.hex),
  ]

  const falta: string[] = []
  if (!actualNombre) falta.push('Nombre comercial: el que quieres que aparezca en propuestas y facturas')
  if (!ctx.tieneLogo) falta.push('Logo: no lo generamos, se sube en Identidad Visual')

  const cabecera = `${ctx.nombreCuenta || 'tu cuenta'}`
  return {
    nombre: {
      propuesto: nombrePropuesto,
      actual: actualNombre,
      cambia: actualNombre !== nombrePropuesto,
      motivo: actualNombre
        ? `Ya firmas como «${actualNombre}»: se mantiene y no se toca.`
        : limpiarNombreComercial(ctx.nombreCuenta)
          ? `Tu cuenta se llama «${cabecera}». Es el nombre que saldrá en documentos públicos de aquí en adelante; cámbialo si tu marca es otra.`
          : 'Escribe el nombre con el que firmas: sin él, los documentos salen con el nombre interno de la cuenta.',
    },
    color: {
      propuesto: actualColor ?? elegido.hex,
      actual: actualColor,
      cambia: actualColor !== (actualColor ?? elegido.hex),
      motivo: actualColor
        ? `Ya tienes ${actualColor} como color de marca: se mantiene.`
        : elegido.motivo,
    },
    paleta,
    falta,
  }
}

// ─── Selección del cliente ───────────────────────────────────────────────────

export interface SeleccionMarcaCanales {
  nombre: string
  color: string
  canales: CanalCaptacionId[]
}

export interface NormalizacionMarca {
  seleccion: SeleccionMarcaCanales
  avisos: string[]
}

/**
 * Convierte lo que envía la pantalla en una selección aplicable: un color que
 * no es hexadecimal no se escribe, un canal que no está en el catálogo no se
 * crea, y un nombre vacío no deja los documentos sin firma.
 */
export function normalizarSeleccionMarcaCanales(
  valor: unknown,
  propuesta: PropuestaMarca,
  canales: CanalPropuesto[],
): NormalizacionMarca {
  const avisos: string[] = []
  const bruto = valor && typeof valor === 'object' && !Array.isArray(valor)
    ? (valor as Record<string, unknown>)
    : {}

  const nombreBruto = bruto.nombre === undefined ? propuesta.nombre.propuesto : limpiarNombreComercial(bruto.nombre)
  let nombre = nombreBruto
  if (!nombre) {
    nombre = propuesta.nombre.propuesto
    avisos.push(`El nombre comercial no puede ir vacío: se queda «${nombre}».`)
  }
  if (typeof bruto.nombre === 'string' && bruto.nombre.trim().length > MAX_NOMBRE_MARCA) {
    avisos.push(`El nombre comercial no cabe en ${MAX_NOMBRE_MARCA} caracteres: se ha recortado.`)
  }

  const colorBruto = bruto.color === undefined ? propuesta.color.propuesto : bruto.color
  const colorNormalizado = normalizarColor(colorBruto)
  const color = colorNormalizado ?? propuesta.color.propuesto
  if (!colorNormalizado && bruto.color !== undefined) {
    avisos.push(`«${String(bruto.color)}» no es un color válido: se mantiene ${color}.`)
  }

  const permitidos = new Set(canales.map((canal) => canal.id))
  const crudos = Array.isArray(bruto.canales) ? bruto.canales : []
  const elegidos: CanalCaptacionId[] = []

  for (const entrada of crudos) {
    if (typeof entrada !== 'string') continue
    if (!permitidos.has(entrada as CanalCaptacionId)) {
      avisos.push(`El canal «${entrada}» no está en el catálogo de captación: se ha ignorado.`)
      continue
    }
    const id = entrada as CanalCaptacionId
    if (!elegidos.includes(id)) elegidos.push(id)
  }

  // Orden del catálogo: la pantalla, la tarea y la auditoría deben leer igual.
  elegidos.sort(
    (a, b) =>
      CANALES_CAPTACION.findIndex((canal) => canal.id === a) -
      CANALES_CAPTACION.findIndex((canal) => canal.id === b),
  )

  if (elegidos.length === 0) {
    avisos.push(
      'Sin ningún canal no hay de dónde entren leads: marca al menos uno, o la marca se aplicará sola.',
    )
  }

  return { seleccion: { nombre, color, canales: elegidos }, avisos }
}

export interface ResumenMarcaCanales {
  canales: number
  nombreCambia: boolean
  colorCambia: boolean
  texto: string
}

export function resumenMarcaCanales(
  seleccion: SeleccionMarcaCanales,
  propuesta: PropuestaMarca,
): ResumenMarcaCanales {
  const nombreCambia = seleccion.nombre !== (propuesta.nombre.actual ?? '')
  const colorCambia = seleccion.color !== (propuesta.color.actual ?? '')
  const detalle = seleccion.canales.length
    ? `${seleccion.canales.length} ${seleccion.canales.length === 1 ? 'canal' : 'canales'}`
    : 'ningún canal'

  const partes: string[] = []
  if (nombreCambia) partes.push(`nombre «${seleccion.nombre}»`)
  if (colorCambia) partes.push(`color ${seleccion.color}`)

  return {
    canales: seleccion.canales.length,
    nombreCambia,
    colorCambia,
    texto: partes.length
      ? `${partes.join(' y ')}, con ${detalle} de captación.`
      : `La marca ya está como la tienes, con ${detalle} de captación.`,
  }
}
