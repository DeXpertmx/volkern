/**
 * Tercera pieza de personalización del alta: impuestos, moneda y datos fiscales.
 *
 * Lo que se propone aquí son las tres cosas que, mal puestas, se descubren
 * facturando: el tipo de IVA con el que se emite, la moneda en la que se
 * escriben los importes y el emisor que firma la factura.
 *
 * Regla que gobierna el fichero: **no se inventa nada legal**. Los tipos salen
 * del catálogo que ya usa Configuración fiscal (`TASAS_IVA_PREDETERMINADAS`) y
 * las retenciones se proponen marcadas como «confírmalo con tu asesoría». Si no
 * sabemos el país, no se propone ninguna tasa: es mejor no proponer que
 * proponer el IVA de otro.
 *
 * Puro: sin Prisma, sin red, sin fechas. Lo importa la ruta; la pantalla recibe
 * la propuesta ya calculada.
 */

import { TASAS_IVA_PREDETERMINADAS } from '@/lib/fiscal-validation'
import { MONEDAS_SOPORTADAS, infoMoneda, monedaDePais } from '@/lib/moneda'
import { respuestasDe, type Descubrimiento } from './descubrimiento'

// ─── Tipos ───────────────────────────────────────────────────────────────────

export interface TasaPropuesta {
  codigo: string
  nombre: string
  porcentaje: number
  /** Por qué encaja con lo que vende, en sus palabras. */
  motivo: string
  /** Si es la que se aplica por defecto a los productos del catálogo. */
  porDefecto: boolean
  /**
   * La cifra depende de su situación y de la normativa vigente: se propone, pero
   * se avisa de que hay que confirmarla. No bloquea crearla.
   */
  requiereAsesoria: boolean
  propuesto: boolean
  /** Qué haría falta para que encajara, cuando no se propone. */
  paraEncajar: string | null
}

export interface EmisorFiscal {
  razonSocial: string | null
  idFiscal: string | null
  direccion: string | null
  ciudad: string | null
  codigoPostal: string | null
  email: string | null
}

export interface ContextoFiscal {
  /** ISO 3166-1 alfa-2 del país desde el que se factura; `null` si no se sabe. */
  pais: string | null
  /** `Tenant.moneda`, tal cual está en la cuenta. */
  monedaActual: string
  /** Emisor principal de la cuenta, si ya existe. */
  emisor: EmisorFiscal | null
}

export interface PropuestaMoneda {
  actual: string
  recomendada: string | null
  coincide: boolean
  motivo: string
}

export interface PropuestaFiscal {
  pais: string | null
  /** true cuando el tipo depende del estado/provincia y no se puede fijar solo. */
  requiereEstado: boolean
  moneda: PropuestaMoneda
  tasas: TasaPropuesta[]
  /** Lo que le falta al emisor para poder emitir una factura completa. */
  faltanDatosEmisor: string[]
  /**
   * Cosas que no se crean aquí pero cambian una factura, dichas a tiempo: por
   * ejemplo la retención de IRPF, que se marca por línea y no como tasa.
   */
  notas: string[]
  avisos: string[]
}

export interface MonedaFiscal {
  codigo: string
  nombre: string
  simbolo: string
}

// ─── Países y moneda ─────────────────────────────────────────────────────────

/**
 * Países donde el impuesto no es único: EE. UU. (sales tax por estado), Brasil
 * (ICMS) y México (frontera). Proponer un tipo único sería peor que no proponer.
 */
const PAISES_CON_ESTADO = new Set(['US', 'BR', 'MX'])

const NOMBRE_PAIS: Record<string, string> = {
  ES: 'España',
  MX: 'México',
  US: 'Estados Unidos',
  CL: 'Chile',
  AR: 'Argentina',
  CO: 'Colombia',
  PE: 'Perú',
  BR: 'Brasil',
  GB: 'Reino Unido',
  DE: 'Alemania',
  FR: 'Francia',
  IT: 'Italia',
  PT: 'Portugal',
}

export function nombrePais(pais: string | null | undefined): string | null {
  if (!pais) return null
  return NOMBRE_PAIS[pais.trim().toUpperCase()] ?? pais.toUpperCase()
}

export function esMonedaSoportada(valor: unknown): valor is string {
  return typeof valor === 'string' && (MONEDAS_SOPORTADAS as readonly string[]).includes(valor)
}

/** Las monedas que la pantalla ofrece, con su ficha, para no escribir códigos. */
export function monedasOfrecidas(): MonedaFiscal[] {
  return MONEDAS_SOPORTADAS.map((codigo) => {
    const info = infoMoneda(codigo)
    return {
      codigo,
      nombre: info?.nombre ?? codigo,
      simbolo: info?.simbolo ?? '',
    }
  })
}

// ─── Tasas ───────────────────────────────────────────────────────────────────

/** Los tipos que el cliente vende, según su respuesta. */
function vende(d: Descubrimiento, ...valores: string[]): boolean {
  const respuestas = respuestasDe(d, 'que_vende')
  return valores.some((v) => respuestas.includes(v))
}

function vendeA(d: Descubrimiento, ...valores: string[]): boolean {
  const respuestas = respuestasDe(d, 'a_quien')
  return valores.some((v) => respuestas.includes(v))
}

/**
 * Las tasas del país, con el motivo por el que encajan. El orden es el de la
 * pantalla: primero la general, luego las especiales y al final la retención.
 */
function tasasDelPais(d: Descubrimiento, pais: string): TasaPropuesta[] {
  const predeterminadas = TASAS_IVA_PREDETERMINADAS[pais]
  if (!predeterminadas) return []

  const nombre = nombrePais(pais) ?? pais
  const alojamiento = vende(d, 'alojamiento')
  const tasas: TasaPropuesta[] = []

  // 1. General: la que factura la mayoría. En alojamiento cede el puesto de
  //    «por defecto» al reducido, que es el que se aplica a la estancia.
  tasas.push({
    codigo: `IVA_${pais}_GENERAL`,
    nombre: `IVA general ${pais}`,
    porcentaje: predeterminadas.general,
    motivo: `El tipo general de ${nombre}: con él se factura la mayoría de lo que vendes.`,
    porDefecto: !alojamiento,
    requiereAsesoria: false,
    propuesto: true,
    paraEncajar: null,
  })

  // 2. Reducido: se propone entero cuando vende alojamiento (donde es el tipo
  //    de la estancia) y se ofrece sin marcar en el resto de casos.
  if (predeterminadas.reducida !== undefined) {
    tasas.push({
      codigo: `IVA_${pais}_REDUCIDO`,
      nombre: `IVA reducido ${pais}`,
      porcentaje: predeterminadas.reducida,
      motivo: alojamiento
        ? `La estancia tributa al tipo reducido en ${nombre}: es el que va a usar casi todo tu catálogo.`
        : `Algunos productos y servicios tributan al ${predeterminadas.reducida} % en ${nombre}.`,
      porDefecto: alojamiento,
      requiereAsesoria: false,
      propuesto: alojamiento,
      paraEncajar: alojamiento
        ? null
        : `Márcala si parte de lo que vendes tributa al tipo reducido del ${predeterminadas.reducida} %.`,
    })
  }

  // 3. Superreducido: existe, pero proponerlo por defecto sería suponer que
  //    vende alimentos o libros.
  if (predeterminadas.superReducida !== undefined) {
    tasas.push({
      codigo: `IVA_${pais}_SUPER_REDUCIDO`,
      nombre: `IVA superreducido ${pais}`,
      porcentaje: predeterminadas.superReducida,
      motivo: 'Tipo especial para unos pocos productos (alimentos, libros, medicamentos).',
      porDefecto: false,
      requiereAsesoria: false,
      propuesto: false,
      paraEncajar: `Márcala solo si vendes productos con tipo superreducido del ${predeterminadas.superReducida} %.`,
    })
  }

  // 4. Exento: se crea siempre para que exista, pero no se marca: una factura
  //    exenta sin motivo escrito es un problema con Hacienda.
  tasas.push({
    codigo: `IVA_${pais}_EXENTO`,
    nombre: `Exento de IVA ${pais}`,
    porcentaje: 0,
    motivo: 'Para operaciones exentas o fuera del ámbito del impuesto.',
    porDefecto: false,
    requiereAsesoria: false,
    propuesto: false,
    paraEncajar: 'Márcala si emites operaciones exentas: luego hay que escribir el motivo en cada factura.',
  })

  return tasas
}

/**
 * La retención de IRPF **no** se crea como tasa: en esta plataforma se marca por
 * línea (y en el perfil fiscal del cliente), no como un impuesto del catálogo.
 * Crear aquí una fila que nadie lee sería dato muerto que parece configuración.
 */
function notasFiscales(d: Descubrimiento, pais: string | null): string[] {
  const notas: string[] = []

  const servicios = vende(d, 'servicios', 'ambos', 'suscripcion')
  const aEmpresas = vendeA(d, 'empresas', 'ambos')

  if (pais === 'ES' && servicios && aEmpresas) {
    notas.push(
      'Servicios a empresas en España: además del IVA, tu cliente te retiene IRPF (15 %, o 7 % en los primeros años). Se marca en el perfil fiscal del cliente y en cada línea de la cotización; confirma el porcentaje con tu asesoría.',
    )
  }

  if (vende(d, 'alojamiento')) {
    notas.push(
      'Alojamiento: el tipo reducido va en la estancia; los extras (desayuno, actividades) pueden tributar a otro tipo. Revísalo con tu asesoría antes de la primera factura.',
    )
  }

  return notas
}

function datosFaltantes(emisor: EmisorFiscal | null): string[] {
  if (!emisor) {
    return ['Razón social y NIF', 'Dirección fiscal', 'Email para la factura']
  }

  const faltan: string[] = []
  if (!emisor.razonSocial?.trim()) faltan.push('Razón social')
  if (!emisor.idFiscal?.trim()) faltan.push('NIF/CIF')
  if (!emisor.direccion?.trim()) faltan.push('Dirección fiscal')
  if (!emisor.ciudad?.trim()) faltan.push('Ciudad')
  if (!emisor.codigoPostal?.trim()) faltan.push('Código postal')
  if (!emisor.email?.trim()) faltan.push('Email para la factura')
  return faltan
}

// ─── Propuesta ───────────────────────────────────────────────────────────────

export function proponerFiscal(d: Descubrimiento, ctx: ContextoFiscal): PropuestaFiscal {
  const avisos: string[] = []
  const pais = ctx.pais ? ctx.pais.trim().toUpperCase() : null
  const nombre = nombrePais(pais)
  const recomendada = pais ? monedaDePais(pais)?.codigo ?? null : null
  const actual = ctx.monedaActual.trim().toUpperCase()
  const coincide = Boolean(recomendada) && recomendada === actual

  let motivoMoneda: string
  if (!pais) {
    motivoMoneda = `No sabemos desde qué país facturas: tu cuenta sigue en ${actual} hasta que lo confirmes.`
    avisos.push(
      'Sin país fiscal no se proponen impuestos: poner el IVA de otro país es peor que no poner ninguno.',
    )
  } else if (!recomendada) {
    motivoMoneda = `No tenemos una moneda asociada a ${nombre}. Tu cuenta factura en ${actual}.`
    avisos.push(`No hay moneda por defecto para ${nombre}: elige la que uses.`)
  } else if (coincide) {
    motivoMoneda = `Tu cuenta factura en ${actual}, la moneda de ${nombre}.`
  } else {
    motivoMoneda = `Tu cuenta factura en ${actual} y facturas desde ${nombre}, que usa ${recomendada}: los importes se verían en la moneda equivocada.`
  }

  const tasas = pais ? tasasDelPais(d, pais) : []

  if (pais && tasas.length === 0) {
    avisos.push(
      `No tenemos los tipos de impuesto de ${nombre} cargados: créalos a mano en Configuración fiscal antes de facturar.`,
    )
  }

  if (pais && PAISES_CON_ESTADO.has(pais)) {
    avisos.push(
      `En ${nombre} el impuesto depende del estado o la provincia: los tipos de esta lista son una base, confírmalos antes de emitir.`,
    )
  }

  return {
    pais,
    requiereEstado: Boolean(pais && PAISES_CON_ESTADO.has(pais)),
    moneda: { actual, recomendada, coincide, motivo: motivoMoneda },
    tasas,
    faltanDatosEmisor: datosFaltantes(ctx.emisor),
    notas: pais ? notasFiscales(d, pais) : [],
    avisos,
  }
}

// ─── Selección del cliente ───────────────────────────────────────────────────

export interface SeleccionFiscal {
  moneda: string
  /** Códigos de tasa que se crean; el orden de la propuesta, no el de llegada. */
  tasas: string[]
}

export interface NormalizacionFiscal {
  seleccion: SeleccionFiscal
  avisos: string[]
}

/**
 * Convierte lo que envía la pantalla en una selección aplicable. Una moneda que
 * no es ISO, un tipo de cambio inventado o un código de tasa que no está en la
 * propuesta se descartan con aviso en vez de aplicarse.
 */
export function normalizarSeleccionFiscal(
  valor: unknown,
  propuesta: PropuestaFiscal,
): NormalizacionFiscal {
  const avisos: string[] = []
  const entrada =
    valor && typeof valor === 'object' && !Array.isArray(valor) ? (valor as Record<string, unknown>) : {}

  const monedaBruta = typeof entrada.moneda === 'string' ? entrada.moneda.trim().toUpperCase() : ''
  let moneda = propuesta.moneda.recomendada ?? propuesta.moneda.actual

  if (monedaBruta) {
    if (esMonedaSoportada(monedaBruta)) moneda = monedaBruta
    else avisos.push(`«${monedaBruta}» no es una moneda que la plataforma sepa escribir: se mantiene ${moneda}.`)
  }

  const permitidas = new Map(propuesta.tasas.map((t) => [t.codigo, t]))
  const crudas = Array.isArray(entrada.tasas) ? entrada.tasas : []
  const tasas: string[] = []

  for (const codigo of crudas) {
    if (typeof codigo !== 'string') continue
    if (!permitidas.has(codigo)) {
      avisos.push(`La tasa «${codigo}» no está en la propuesta de tu país: se ha ignorado.`)
      continue
    }
    if (!tasas.includes(codigo)) tasas.push(codigo)
  }

  // Orden de la propuesta: la pantalla y la auditoría deben leer igual.
  tasas.sort(
    (a, b) =>
      propuesta.tasas.findIndex((t) => t.codigo === a) - propuesta.tasas.findIndex((t) => t.codigo === b),
  )

  if (propuesta.pais && tasas.length === 0) {
    avisos.push('Sin ningún impuesto no se puede emitir una factura: elige al menos el tipo general.')
  }

  return { seleccion: { moneda, tasas }, avisos }
}

export interface ResumenFiscal {
  tasas: number
  moneda: string
  cambiaMoneda: boolean
  texto: string
}

export function resumenFiscal(seleccion: SeleccionFiscal, propuesta: PropuestaFiscal): ResumenFiscal {
  const cambiaMoneda = seleccion.moneda !== propuesta.moneda.actual
  const detalle = seleccion.tasas.length
    ? `${seleccion.tasas.length} ${seleccion.tasas.length === 1 ? 'impuesto' : 'impuestos'}`
    : 'ningún impuesto'

  return {
    tasas: seleccion.tasas.length,
    moneda: seleccion.moneda,
    cambiaMoneda,
    texto: cambiaMoneda
      ? `${detalle} y la moneda pasa a ${seleccion.moneda}.`
      : `${detalle}, en ${seleccion.moneda}.`,
  }
}
