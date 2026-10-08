/**
 * conciliacion.ts — Reglas puras del emparejamiento entre la factura del
 * proveedor y el pedido que la originó.
 *
 * POR QUÉ EXISTE ESTE MÓDULO
 * El pedido de compra y la factura del proveedor se reciben por caminos
 * distintos y producían **dos gastos contables del mismo suministro**: al
 * completarse la recepción, `recibirCompra` creaba un gasto provisional con el
 * total del pedido; y cuando llegaba la factura, la pantalla de gastos creaba
 * otro con los datos del OCR. El guardia de duplicados no los veía venir porque
 * buscaba por número de factura y el gasto del pedido no tiene número.
 *
 * Aquí vive la única pregunta que hacía falta responder: *¿esta factura es la de
 * aquel pedido?*. Es pura —sin prisma ni next— porque la deciden dos sitios (la
 * ruta de gastos, cuando llega la factura, y la recepción, cuando llega la
 * mercancía antes que el papel) y las dos tienen que decidirlo igual.
 *
 * LA REGLA ES DELIBERADAMENTE CONSERVADORA
 * Sólo se concilia sin preguntar cuando el importe coincide **al céntimo**, la
 * divisa es la misma y hay **un único** candidato. Cualquier otra cosa —dos
 * pedidos del mismo importe, una diferencia de un euro, otra moneda— se
 * devuelve para que la confirme una persona: imputar una factura al pedido
 * equivocado es peor que preguntar.
 */

// ─── Tolerancia de importes ──────────────────────────────────────────────────

/**
 * Margen admitido entre el total del pedido y el total de la factura.
 *
 * Un céntimo por redondeo no debe pedir intervención, pero un 2 % de diferencia
 * sí: eso ya es un porte, un descuento o un error de línea, y merece que alguien
 * lo mire. Se toma el mayor de los dos suelos para que los pedidos pequeños
 * (que redondean mucho en términos relativos) no se queden fuera.
 */
export const TOLERANCIA_MINIMA = 0.5
export const TOLERANCIA_RELATIVA = 0.01

/** Margen absoluto admitido para un importe dado. */
export function toleranciaDeConciliacion(importe: number): number {
  const base = Math.abs(Number(importe) || 0)
  return Math.max(TOLERANCIA_MINIMA, redondear2(base * TOLERANCIA_RELATIVA))
}

function redondear2(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.round((n + Number.EPSILON) * 100) / 100
}

/** `pedido - factura`, redondeado a dos decimales (negativo si la factura es mayor). */
export function diferenciaDeImporte(importePedido: number, importeFactura: number): number {
  return redondear2((Number(importePedido) || 0) - (Number(importeFactura) || 0))
}

/** ¿Cuadran los dos importes dentro del margen admitido? */
export function importesCompatibles(importePedido: number, importeFactura: number): boolean {
  const diferencia = Math.abs(diferenciaDeImporte(importePedido, importeFactura))
  return diferencia <= toleranciaDeConciliacion(importeFactura)
}

/**
 * Divisa normalizada para comparar. Se compara lo que el usuario escribió
 * (`EUR`, `eur`) sin imponer la divisa del tenant: una factura en dólares de un
 * pedido en euros no es conciliable, y eso hay que verlo, no corregirlo solo.
 */
export function normalizarMoneda(moneda: string | null | undefined): string {
  return (moneda ?? '').trim().toUpperCase()
}

export function monedasCompatibles(a: string | null | undefined, b: string | null | undefined): boolean {
  const izq = normalizarMoneda(a)
  const der = normalizarMoneda(b)
  // Sin dato en uno de los dos lados no se descarta el candidato: la pantalla
  // propondrá igualmente y quien concilia ve el importe.
  if (!izq || !der) return true
  return izq === der
}

// ─── Candidatos ──────────────────────────────────────────────────────────────

/**
 * Un pedido recibido cuyo gasto todavía no tiene factura. Es lo que el módulo
 * de compras aporta al emparejamiento; el orden de los campos importa poco, el
 * significado de cada uno no.
 */
export interface CandidatoConciliacion {
  compraId: string
  /** `OC-2026-0007` */
  numero: string
  proveedorId: string | null
  proveedorNombre: string | null
  /** Total del pedido, con impuestos. */
  importePedido: number
  moneda: string
  /** Fecha de recepción en ISO, o `null` si el pedido la perdió. */
  fechaRecepcion: string | null
  /** `importePedido - importeFactura`. */
  diferencia: number
  /** El importe cuadra al céntimo: es el único caso que se concilia solo. */
  exacto: boolean
}

/** Construye el candidato de un pedido frente a un importe de factura. */
export function candidatoDesdePedido(input: {
  compraId: string
  numero: string
  proveedorId?: string | null
  proveedorNombre?: string | null
  importePedido: number
  moneda?: string | null
  fechaRecepcion?: Date | string | null
  importeFactura: number
}): CandidatoConciliacion {
  const fecha =
    input.fechaRecepcion instanceof Date
      ? input.fechaRecepcion.toISOString()
      : (input.fechaRecepcion ?? null)

  const diferencia = diferenciaDeImporte(input.importePedido, input.importeFactura)

  return {
    compraId: input.compraId,
    numero: input.numero,
    proveedorId: input.proveedorId ?? null,
    proveedorNombre: input.proveedorNombre ?? null,
    importePedido: redondear2(input.importePedido),
    moneda: normalizarMoneda(input.moneda),
    fechaRecepcion: fecha,
    diferencia,
    exacto: diferencia === 0,
  }
}

// ─── Emparejamiento ──────────────────────────────────────────────────────────

export type Emparejamiento =
  /** Coincidencia única y exacta: se puede conciliar sin preguntar. */
  | { estado: 'automatica'; candidato: CandidatoConciliacion }
  /** Hay algo que encaja, pero no lo suficiente para decidirlo solo. */
  | { estado: 'revisar'; candidatos: CandidatoConciliacion[] }
  /** Ningún pedido encaja: la factura es un gasto nuevo. */
  | { estado: 'ninguna' }

/**
 * Decide qué hacer con la lista de candidatos compatibles de un proveedor.
 *
 * `candidatos` debe venir ya filtrado por proveedor, divisa e importe
 * compatible; aquí sólo se decide *cuánta* certeza hay. El orden de prioridad es
 * exactitud antes que cantidad: si hay una coincidencia exacta y única, da igual
 * que existan otros pedidos parecidos, porque el exacto no admite discusión.
 */
export function emparejarFactura(candidatos: CandidatoConciliacion[]): Emparejamiento {
  const exactos = candidatos.filter((c) => c.exacto)

  if (exactos.length === 1) {
    return { estado: 'automatica', candidato: exactos[0] }
  }
  if (exactos.length > 1) {
    // Dos pedidos del mismo importe y fecha: imposible saber cuál. Se pregunta.
    return { estado: 'revisar', candidatos: exactos }
  }
  if (candidatos.length > 0) {
    return { estado: 'revisar', candidatos }
  }
  return { estado: 'ninguna' }
}

/** Candidatos ordenados por cercanía: primero los exactos y luego los más ajustados. */
export function ordenarCandidatos(candidatos: CandidatoConciliacion[]): CandidatoConciliacion[] {
  return [...candidatos].sort((a, b) => {
    if (a.exacto !== b.exacto) return a.exacto ? -1 : 1
    return Math.abs(a.diferencia) - Math.abs(b.diferencia)
  })
}

/** Frase para la pantalla: «OC-2026-0007 (diferencia de 12,40 €)». */
export function describirCandidato(candidato: CandidatoConciliacion): string {
  if (candidato.exacto) return candidato.numero
  const signo = candidato.diferencia > 0 ? 'el pedido es mayor en' : 'la factura es mayor en'
  return `${candidato.numero} (${signo} ${Math.abs(candidato.diferencia).toFixed(2)})`
}
