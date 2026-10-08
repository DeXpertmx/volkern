/**
 * reglas.ts — Reglas puras del módulo Compras (pedido a proveedor).
 *
 * POR QUÉ ES UN MÓDULO PURO
 * Antes de este módulo no había nada de compras: existía una pantalla de
 * proveedores, el OCR de facturas de gasto y una acción de automatización
 * (`crear_orden_compra`) que escribía en un modelo `compra` que no existía en
 * el esquema — es decir, reventaba en runtime si alguien la disparaba.
 *
 * Todo lo que decide *qué es una compra* (cuánto suma una línea, cuánto un
 * pedido, cuándo está recibida y cuándo se puede cancelar) vive aquí, sin
 * prisma ni next, por tres razones:
 *
 *   1. Se puede probar entero sin base de datos (`tests/compras-reglas.test.ts`),
 *      que es como se fijan las reglas de un ciclo de estados.
 *   2. Lo consumen el servidor (servicio y rutas) y el navegador (el formulario
 *      de pedido muestra los totales mientras se escribe), y las dos partes no
 *      pueden acabar calculando cosas distintas.
 *   3. El estado de una orden NO se escribe a mano: se deriva de lo recibido
 *      (`estadoTrasRecepcion`). Así «recibida» no puede mentir sobre las líneas.
 */

// ─── Estados ─────────────────────────────────────────────────────────────────

export type EstadoCompra =
  /** El pedido se está redactando: se puede editar y borrar entero. */
  | 'borrador'
  /** Se envió al proveedor: ya es un compromiso, no un borrador. */
  | 'enviada'
  /** Ha entrado parte de la mercancía. */
  | 'parcial'
  /** Todas las líneas recibidas: aquí nace el gasto contable. */
  | 'recibida'
  /** Se descartó antes de recibir nada. */
  | 'cancelada'

export const ESTADOS_COMPRA: readonly EstadoCompra[] = [
  'borrador',
  'enviada',
  'parcial',
  'recibida',
  'cancelada',
] as const

/** Etiqueta de cada estado, en el idioma del negocio. */
export const ETIQUETAS_ESTADO: Record<EstadoCompra, string> = {
  borrador: 'Borrador',
  enviada: 'Enviada al proveedor',
  parcial: 'Recepción parcial',
  recibida: 'Recibida',
  cancelada: 'Cancelada',
}

/**
 * Transiciones permitidas. Lo que no está aquí no se puede hacer, aunque el
 * cliente lo pida: una orden recibida no vuelve a borrador y una cancelada no
 * revive (si hiciera falta más mercancía, se pide otra orden).
 */
export const TRANSICIONES: Record<EstadoCompra, readonly EstadoCompra[]> = {
  borrador: ['enviada', 'cancelada'],
  enviada: ['parcial', 'recibida', 'cancelada'],
  parcial: ['parcial', 'recibida', 'cancelada'],
  recibida: [],
  cancelada: [],
}

/** Estados en los que se admite recepción de mercancía. */
export const ESTADOS_RECIBIBLES: readonly EstadoCompra[] = ['enviada', 'parcial'] as const

export function esEstadoCompra(valor: unknown): valor is EstadoCompra {
  return typeof valor === 'string' && (ESTADOS_COMPRA as readonly string[]).includes(valor)
}

export function puedeTransicionar(desde: EstadoCompra, hacia: EstadoCompra): boolean {
  return TRANSICIONES[desde].includes(hacia)
}

/** Estados sobre los que sigue habiendo trabajo pendiente en almacén. */
export function estaPendienteDeRecepcion(estado: EstadoCompra): boolean {
  return ESTADOS_RECIBIBLES.includes(estado)
}

// ─── Importes ────────────────────────────────────────────────────────────────

/**
 * Redondeo a dos decimales.
 *
 * El redondeo se hace en cada línea y al final se suman líneas ya redondeadas:
 * es la misma regla que aplica la orden de venta, y evita que el total del
 * pedido y la suma de lo que se ve en pantalla difieran en un céntimo.
 */
export function redondear2(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.round((n + Number.EPSILON) * 100) / 100
}

export interface LineaImporte {
  cantidad: number
  precioUnitario: number
  /** Tipo de IVA soportado de la línea (21, 10, 4, 0…). Por defecto 21. */
  porcentajeImpuesto?: number | null
}

export interface ImporteLinea {
  subtotal: number
  montoImpuesto: number
  total: number
}

/** Subtotal (sin IVA), cuota de IVA y total de una línea. */
export function calcularLinea(linea: LineaImporte): ImporteLinea {
  const cantidad = Number(linea.cantidad) || 0
  const precio = Number(linea.precioUnitario) || 0
  const porcentaje = Number(linea.porcentajeImpuesto ?? 21) || 0

  const subtotal = redondear2(cantidad * precio)
  const montoImpuesto = redondear2(subtotal * (porcentaje / 100))

  return { subtotal, montoImpuesto, total: redondear2(subtotal + montoImpuesto) }
}

export interface TotalesCompra {
  subtotal: number
  totalImpuestos: number
  total: number
}

/** Totales del pedido a partir de sus líneas. */
export function calcularTotales(lineas: LineaImporte[]): TotalesCompra {
  let subtotal = 0
  let totalImpuestos = 0

  for (const linea of lineas) {
    const importe = calcularLinea(linea)
    subtotal += importe.subtotal
    totalImpuestos += importe.montoImpuesto
  }

  subtotal = redondear2(subtotal)
  totalImpuestos = redondear2(totalImpuestos)

  return { subtotal, totalImpuestos, total: redondear2(subtotal + totalImpuestos) }
}

// ─── Recepción ───────────────────────────────────────────────────────────────

export interface LineaRecepcion {
  cantidad: number
  cantidadRecibida: number
}

/** Lo que falta por recibir de una línea (nunca negativo). */
export function pendienteDeLinea(linea: LineaRecepcion): number {
  return redondear2(Math.max(0, (Number(linea.cantidad) || 0) - (Number(linea.cantidadRecibida) || 0)))
}

/** Lo que falta por recibir del pedido entero. */
export function pendienteDeRecepcion(lineas: LineaRecepcion[]): number {
  return redondear2(lineas.reduce((acc, l) => acc + pendienteDeLinea(l), 0))
}

/** ¿Está el pedido completo? (ninguna línea con pendiente) */
export function estaCompleta(lineas: LineaRecepcion[]): boolean {
  return lineas.length > 0 && lineas.every((l) => pendienteDeLinea(l) === 0)
}

/**
 * Estado que corresponde a lo recibido: `recibida` cuando no falta nada y
 * `parcial` mientras quede alguna línea a medias. Es la única fuente del
 * estado tras una recepción.
 */
export function estadoTrasRecepcion(lineas: LineaRecepcion[]): Extract<EstadoCompra, 'recibida' | 'parcial'> {
  return estaCompleta(lineas) ? 'recibida' : 'parcial'
}

/**
 * Valida la cantidad que se va a recibir de una línea.
 * @returns el motivo del rechazo, o `null` si la cantidad es admisible.
 */
export function validarRecepcionDeLinea(linea: LineaRecepcion, cantidad: number): string | null {
  if (!Number.isFinite(cantidad) || cantidad <= 0) {
    return 'La cantidad a recibir debe ser mayor que cero'
  }
  const pendiente = pendienteDeLinea(linea)
  if (pendiente <= 0) {
    return 'La línea ya está recibida por completo'
  }
  if (cantidad > pendiente + 1e-9) {
    return `No se pueden recibir ${cantidad}: solo faltan ${pendiente}`
  }
  return null
}

// ─── Coste contable ──────────────────────────────────────────────────────────

/**
 * Categoría del gasto que genera una compra recibida.
 *
 * Mercaderías (cuenta 600) cuando el pedido mueve existencias —al menos una
 * línea ligada al catálogo—, y «otros» cuando es un pedido de servicios o
 * gestiones sin artículo de almacén. Se decide con datos, no con una pregunta
 * al operador: la categoría se puede corregir después en el gasto.
 */
export function categoriaGastoDeCompra(lineas: Array<{ catalogoItemId?: string | null }>): string {
  return lineas.some((l) => Boolean(l.catalogoItemId)) ? 'mercaderias' : 'otros'
}

// ─── Numeración ──────────────────────────────────────────────────────────────

/** Prefijo del correlativo de compras. */
export const PREFIJO_COMPRA = 'OC'

/** `OC-2026-0007` */
export function numeroCompra(anio: number, secuencia: number): string {
  return `${PREFIJO_COMPRA}-${anio}-${String(secuencia).padStart(4, '0')}`
}

/**
 * Secuencia de un número existente del año indicado, o `null` si el número no
 * pertenece a ese año (o no tiene la forma esperada). El alta la usa para
 * continuar la serie de cada tenant sin reutilizar números.
 */
export function secuenciaDeNumero(numero: string, anio: number): number | null {
  const match = new RegExp(`^${PREFIJO_COMPRA}-${anio}-(\\d+)$`).exec(numero ?? '')
  if (!match) return null
  const secuencia = Number.parseInt(match[1], 10)
  return Number.isFinite(secuencia) ? secuencia : null
}

/** Siguiente número de la serie del año a partir de los números ya usados. */
export function siguienteNumeroCompra(numerosExistentes: string[], anio: number): string {
  let maximo = 0
  for (const numero of numerosExistentes) {
    const secuencia = secuenciaDeNumero(numero, anio)
    if (secuencia !== null && secuencia > maximo) maximo = secuencia
  }
  return numeroCompra(anio, maximo + 1)
}
