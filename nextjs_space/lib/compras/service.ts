import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { monedaEscritura } from '@/lib/moneda'
import { adjustStock } from '@/lib/skills/inventory-skills'
import { createExpense } from '@/lib/skills/finance-skills'
import {
  PREFIJO_COMPRA,
  calcularLinea,
  calcularTotales,
  categoriaGastoDeCompra,
  ESTADOS_RECIBIBLES,
  esEstadoCompra,
  estadoTrasRecepcion,
  siguienteNumeroCompra,
  pendienteDeLinea,
  redondear2,
  validarRecepcionDeLinea,
  type EstadoCompra,
} from './reglas'
import {
  candidatoDesdePedido,
  emparejarFactura,
  importesCompatibles,
  monedasCompatibles,
  ordenarCandidatos,
  type CandidatoConciliacion,
  type Emparejamiento,
} from './conciliacion'

/**
 * service.ts — Los dos únicos escritores de una compra: `crearCompra` y
 * `recibirCompra` (más `cambiarEstadoCompra`, que solo mueve la etiqueta).
 *
 * POR QUÉ ESTÁ AQUÍ Y NO EN LA RUTA
 * El mismo alta la necesitan la ruta `/api/compras`, la automatización
 * `crear_orden_compra` y cualquier script de administración. Antes había una
 * acción de automatización escribiendo `compra.create` a mano contra un modelo
 * que no existía; con un único camino, eso no puede repetirse.
 *
 * LA RECEPCIÓN NO ES ATÓMICA, Y SE DICE
 * El stock se mueve con `adjustStock` (el ajuste de inventario del ERP), que
 * abre su propia transacción por línea: es el único escritor de existencias
 * bueno —el `stockLevel.upsert` con `lotId: null` revienta en producción, por
 * eso el ERP usa findFirst + update/create—. Cada línea recibida actualiza
 * también su `cantidadRecibida` en cuanto el movimiento de stock ha ido bien,
 * así que el pedido y el almacén nunca cuentan cosas distintas: si la cuarta
 * línea falla, las tres primeras están recibidas y el pedido queda en
 * `parcial` con lo que realmente entró.
 */

export class ErrorCompra extends Error {
  constructor(
    public readonly codigo: 'no_encontrado' | 'conflicto' | 'invalido',
    mensaje: string
  ) {
    super(mensaje)
    this.name = 'ErrorCompra'
  }
}

/** Código HTTP que corresponde a cada motivo de rechazo. */
export function statusDeErrorCompra(codigo: ErrorCompra['codigo']): number {
  if (codigo === 'no_encontrado') return 404
  if (codigo === 'conflicto') return 409
  return 400
}

// ─── Alta ────────────────────────────────────────────────────────────────────

export interface LineaCompraEntrada {
  catalogoItemId?: string | null
  concepto: string
  cantidad: number
  precioUnitario: number
  porcentajeImpuesto?: number | null
}

export interface CrearCompraInput {
  tenantId: string
  usuarioId?: string | null
  proveedorId?: string | null
  almacenId?: string | null
  /**
   * Divisa del pedido. Si no se indica, se toma la del tenant: quien llama no
   * tiene por qué saberla (una automatización no la conoce), y escribir una
   * divisa por defecto a mano factura en euros a una cuenta en pesos.
   */
  moneda?: string | null
  notas?: string | null
  fechaEntrega?: Date | null
  items: LineaCompraEntrada[]
}

/** Último número de la serie del año, leído de la propia base. */
async function calcularNumero(tenantId: string, anio: number): Promise<string> {
  const existentes = await prisma.compra.findMany({
    where: { tenantId, numero: { startsWith: `${PREFIJO_COMPRA}-${anio}-` } },
    select: { numero: true },
  })
  return siguienteNumeroCompra(
    existentes.map((c) => c.numero),
    anio
  )
}

/**
 * Crea un pedido a proveedor en estado `borrador`, con su correlativo
 * (`OC-AAAA-0001`) y sus totales ya calculados y guardados.
 */
export async function crearCompra(input: CrearCompraInput) {
  const { tenantId, items } = input

  if (!items || items.length === 0) {
    throw new ErrorCompra('invalido', 'Un pedido necesita al menos una línea')
  }

  if (input.proveedorId) {
    const proveedor = await prisma.supplier.findFirst({
      where: { id: input.proveedorId, tenantId },
      select: { id: true },
    })
    if (!proveedor) throw new ErrorCompra('no_encontrado', 'El proveedor no existe en este espacio de trabajo')
  }

  if (input.almacenId) {
    const almacen = await prisma.warehouse.findFirst({
      where: { id: input.almacenId, tenantId },
      select: { id: true },
    })
    if (!almacen) throw new ErrorCompra('no_encontrado', 'El almacén no existe en este espacio de trabajo')
  }

  const moneda = input.moneda
    ? monedaEscritura(input.moneda)
    : monedaEscritura(
        (await prisma.tenant.findUnique({ where: { id: tenantId }, select: { moneda: true } }))?.moneda
      )

  const totales = calcularTotales(items)
  const anio = new Date().getFullYear()

  // El número es un correlativo por tenant y año: dos altas simultáneas pueden
  // calcular el mismo. La clave única `tenantId_numero` lo corta y aquí se
  // reintenta con el siguiente, en vez de devolver un 500 al operador.
  let ultimoError: unknown = null
  for (let intento = 0; intento < 3; intento++) {
    const numero = await calcularNumero(tenantId, anio)
    try {
      return await prisma.compra.create({
        data: {
          tenantId,
          numero,
          proveedorId: input.proveedorId ?? null,
          almacenId: input.almacenId ?? null,
          estado: 'borrador',
          moneda,
          notas: input.notas ?? null,
          fechaEntrega: input.fechaEntrega ?? null,
          creadoPorId: input.usuarioId ?? null,
          subtotal: totales.subtotal,
          totalImpuestos: totales.totalImpuestos,
          total: totales.total,
          items: {
            create: items.map((linea, indice) => {
              const importe = calcularLinea(linea)
              return {
                catalogoItemId: linea.catalogoItemId ?? null,
                concepto: linea.concepto,
                cantidad: linea.cantidad,
                precioUnitario: linea.precioUnitario,
                porcentajeImpuesto: linea.porcentajeImpuesto ?? 21,
                montoImpuesto: importe.montoImpuesto,
                total: importe.total,
                orden: indice,
              }
            }),
          },
        },
        include: { items: { orderBy: { orden: 'asc' } } },
      })
    } catch (error: any) {
      ultimoError = error
      const esNumeroDuplicado = error?.code === 'P2002'
      if (!esNumeroDuplicado) throw error
    }
  }

  throw new ErrorCompra(
    'conflicto',
    `No se pudo asignar número al pedido: ${ultimoError instanceof Error ? ultimoError.message : 'conflicto de correlativo'}`
  )
}

// ─── Cambio de estado ────────────────────────────────────────────────────────

/** Mueve una orden por su ciclo (`borrador` → `enviada` → …). */
export async function cambiarEstadoCompra(input: {
  tenantId: string
  compraId: string
  estado: string
}) {
  const compra = await prisma.compra.findFirst({
    where: { id: input.compraId, tenantId: input.tenantId },
    select: { id: true, estado: true, numero: true },
  })
  if (!compra) throw new ErrorCompra('no_encontrado', 'Pedido no encontrado')

  if (!esEstadoCompra(input.estado)) {
    throw new ErrorCompra('invalido', `Estado desconocido: ${input.estado}`)
  }
  if (input.estado === compra.estado) return compra

  // La transición la decide una única función pura, para que el botón que
  // enseña la pantalla y lo que acepta el servidor no puedan divergir.
  const desde = compra.estado as EstadoCompra
  const { puedeTransicionar } = await import('./reglas')
  if (!puedeTransicionar(desde, input.estado)) {
    throw new ErrorCompra(
      'conflicto',
      `Un pedido ${desde} no puede pasar a ${input.estado}. «Recibida» solo se alcanza recibiendo la mercancía.`
    )
  }

  return prisma.compra.update({
    where: { id: compra.id },
    data: { estado: input.estado },
    select: { id: true, estado: true, numero: true },
  })
}

// ─── Recepción ───────────────────────────────────────────────────────────────

export interface LineaRecepcionEntrada {
  /** Id de la línea del pedido (`CompraItem.id`). */
  itemId: string
  cantidad: number
}

export interface RecibirCompraInput {
  tenantId: string
  compraId: string
  /** Quién recibe la mercancía: queda en el movimiento de stock y en el gasto. */
  usuarioId: string
  lineas: LineaRecepcionEntrada[]
}

export interface ResultadoRecepcion {
  compra: { id: string; numero: string; estado: string; fechaRecepcion: Date | null; total: number }
  /** Movimientos de stock aplicados (uno por línea con artículo de almacén). */
  movimientos: Array<{ itemId: string; catalogoItemId: string; cantidad: number }>
  gasto: { id: string; amount: number; category: string } | null
  /** Lo que el operador debe saber: líneas sin stock y gasto no generado. */
  avisos: string[]
}

/**
 * Recibe mercancía de un pedido: mueve el stock, apunta lo recibido y, cuando
 * el pedido queda completo, genera el gasto contable con el total.
 */
export async function recibirCompra(input: RecibirCompraInput): Promise<ResultadoRecepcion> {
  const { tenantId, compraId, usuarioId } = input

  const compra = await prisma.compra.findFirst({
    where: { id: compraId, tenantId },
    include: {
      items: { orderBy: { orden: 'asc' } },
      proveedor: { select: { id: true, name: true } },
    },
  })
  if (!compra) throw new ErrorCompra('no_encontrado', 'Pedido no encontrado')

  const estado = compra.estado as EstadoCompra
  if (!ESTADOS_RECIBIBLES.includes(estado)) {
    throw new ErrorCompra(
      'conflicto',
      estado === 'borrador'
        ? 'Envía el pedido al proveedor antes de registrar la recepción'
        : `Un pedido ${estado} no admite recepciones`
    )
  }

  const lineas = input.lineas ?? []
  if (lineas.length === 0) throw new ErrorCompra('invalido', 'Indica al menos una línea a recibir')

  // 1. Validar TODO antes de mover nada: una línea mal escrita no debe dejar
  //    media recepción hecha.
  const porItem = new Map<string, number>()
  for (const entrada of lineas) {
    const item = compra.items.find((i) => i.id === entrada.itemId)
    if (!item) throw new ErrorCompra('invalido', 'Alguna línea no pertenece a este pedido')
    if (porItem.has(entrada.itemId)) {
      throw new ErrorCompra('invalido', 'No repitas la misma línea en una recepción')
    }
    const motivo = validarRecepcionDeLinea(
      { cantidad: item.cantidad, cantidadRecibida: item.cantidadRecibida },
      entrada.cantidad
    )
    if (motivo) throw new ErrorCompra('invalido', `${item.concepto}: ${motivo}`)
    porItem.set(entrada.itemId, entrada.cantidad)
  }

  const avisos: string[] = []
  const movimientos: ResultadoRecepcion['movimientos'] = []

  // 2. Aplicar línea a línea: stock primero, apunte del pedido después.
  for (const item of compra.items) {
    const cantidad = porItem.get(item.id)
    if (!cantidad) continue

    if (item.catalogoItemId) {
      await adjustStock({
        tenantId,
        catalogoItemId: item.catalogoItemId,
        warehouseId: compra.almacenId ?? undefined,
        type: 'IN',
        quantity: cantidad,
        reason: `Recepción ${compra.numero}`,
        userId: usuarioId,
        referenceId: compra.id,
        metadata: {
          origen: 'compras',
          compraId: compra.id,
          numero: compra.numero,
          proveedorId: compra.proveedorId,
        },
      })
      movimientos.push({ itemId: item.id, catalogoItemId: item.catalogoItemId, cantidad })
    } else {
      avisos.push(
        `«${item.concepto}» no tiene artículo de almacén: cuenta como coste, pero no mueve existencias`
      )
    }

    await prisma.compraItem.update({
      where: { id: item.id },
      data: { cantidadRecibida: { increment: cantidad } },
    })
  }

  // 3. El estado sale de lo que hay en las líneas, no de lo que se pidió.
  const itemsActualizados = await prisma.compraItem.findMany({
    where: { compraId: compra.id },
    select: { cantidad: true, cantidadRecibida: true },
  })
  const nuevoEstado = estadoTrasRecepcion(itemsActualizados)
  const fechaRecepcion = new Date()

  const actualizada = await prisma.compra.update({
    where: { id: compra.id },
    data: { estado: nuevoEstado, fechaRecepcion },
    select: { id: true, numero: true, estado: true, fechaRecepcion: true, total: true },
  })

  // 4. El coste entra en contabilidad cuando el pedido está completo. Una
  //    recepción parcial no genera gasto: facturar dos veces la misma orden es
  //    peor que esperar a la factura del proveedor.
  //
  //    Antes de crear nada se mira si la factura del proveedor ya estaba
  //    registrada —pasa cuando el papel llega antes que la mercancía—. En ese
  //    caso el pedido se imputa a aquel gasto y se marca conciliado, en vez de
  //    dejar dos apuntes del mismo suministro.
  let gasto: ResultadoRecepcion['gasto'] = null

  if (nuevoEstado === 'recibida' && !compra.gastoId) {
    if (!compra.proveedorId) {
      avisos.push('El pedido no tiene proveedor: no se ha generado el gasto contable')
    } else {
      const facturaPrevia = await buscarFacturaSueltaDelProveedor({
        tenantId,
        proveedorId: compra.proveedorId,
        importe: actualizada.total,
        moneda: compra.moneda,
      })

      if (facturaPrevia) {
        await prisma.expense.update({
          where: { id: facturaPrevia.id },
          data: {
            reconciledAt: fechaRecepcion,
            metadata: fusionarMetadata(facturaPrevia.metadata, {
              conciliacion: {
                compraId: compra.id,
                numero: compra.numero,
                conciliadoDesde: 'recepcion',
                conciliadoEn: fechaRecepcion.toISOString(),
              },
            }),
          },
        })
        await prisma.compra.update({ where: { id: compra.id }, data: { gastoId: facturaPrevia.id } })
        gasto = { id: facturaPrevia.id, amount: facturaPrevia.amount, category: facturaPrevia.category }
        avisos.push(
          `La factura ${facturaPrevia.invoiceNumber ?? 'del proveedor'} ya estaba registrada: el pedido se ha imputado a ese gasto en lugar de crear uno nuevo`
        )
      } else {
        const category = categoriaGastoDeCompra(compra.items)
        // Mismo camino que la factura del proveedor: el gasto queda encadenado
        // (huella del gasto anterior), con la retención del proveedor aplicada y
        // sumando en las cuentas por pagar. Antes se escribía con
        // `prisma.expense.create` a mano, así que el mismo apunte salía distinto
        // según hubiera entrado por la recepción o por la factura.
        const creado = await createExpense({
          tenantId,
          createdById: usuarioId,
          supplierId: compra.proveedorId,
          description: `Compra ${compra.numero} — ${compra.proveedor?.name ?? 'proveedor'}`,
          amount: actualizada.total,
          currency: compra.moneda,
          date: fechaRecepcion,
          status: 'PENDING',
          category,
          metadataExtra: { origen: 'compras', compraId: compra.id, numero: compra.numero },
        })
        await prisma.compra.update({ where: { id: compra.id }, data: { gastoId: creado.id } })
        gasto = { id: creado.id, amount: creado.amount, category: creado.category }
        avisos.push(
          `Coste de ${creado.amount.toFixed(2)} ${compra.moneda} apuntado como provisional: quedará conciliado cuando registres la factura del pedido ${compra.numero}`
        )
      }
    }
  }

  return { compra: actualizada, movimientos, gasto, avisos }
}

// ─── Conciliación con la factura del proveedor ───────────────────────────────
//
// Un pedido recibido y la factura que lo justifica son el MISMO coste visto dos
// veces. El pedido lo apunta al recibirse (provisional, `reconciledAt = null`) y
// la factura lo completa: número, base, IVA, vencimiento y justificante. Lo que
// NO puede pasar es que acaben en dos gastos, que es lo que ocurría antes.
//
// El emparejamiento es conservador a propósito (ver `conciliacion.ts`): sólo se
// decide solo cuando el importe cuadra al céntimo, la divisa coincide y hay un
// único candidato. Todo lo demás vuelve a la pantalla para que lo confirme una
// persona, porque imputar una factura al pedido equivocado es peor que preguntar.

/**
 * Mezcla metadatos de izquierda a derecha: lo de la derecha gana.
 *
 * Acepta `unknown` porque las columnas `Json?` de Prisma llegan como `JsonValue`
 * (puede ser un escalar suelto), no como objeto.
 */
export function fusionarMetadata(...fuentes: unknown[]): Prisma.InputJsonObject {
  const salida: Record<string, unknown> = {}
  for (const fuente of fuentes) {
    if (!fuente || typeof fuente !== 'object' || Array.isArray(fuente)) continue
    for (const [clave, valor] of Object.entries(fuente as Record<string, unknown>)) {
      salida[clave] = valor
    }
  }
  return salida as Prisma.InputJsonObject
}

/** Datos de la factura que se vuelcan sobre el gasto provisional del pedido. */
export interface FacturaParaConciliar {
  amount: number
  supplierId?: string | null
  currency?: string | null
  invoiceNumber?: string | null
  date?: Date | null
  dueDate?: Date | null
  receiptUrl?: string | null
  category?: string | null
  taxableBase?: number | null
  vatRate?: number | null
  vatAmount?: number | null
  issuerName?: string | null
  /** Claves sueltas de la factura (serie, tramos de IVA, IBAN…) para `metadata`. */
  metadata?: Record<string, unknown> | null
}

export interface ResultadoConciliacion {
  compra: { id: string; numero: string; estado: string; total: number }
  gasto: { id: string; amount: number; category: string; invoiceNumber: string | null; reconciledAt: Date }
  /** `importe provisional - importe factura`: lo que se ha corregido en el gasto. */
  diferencia: number
}

/**
 * La factura llegó antes que la mercancía: busca el gasto de factura que ese
 * pedido debería completar en vez de crear uno nuevo al recibirlo.
 *
 * Sólo devuelve algo con coincidencia **exacta y única**. Si hay dos gastos del
 * mismo importe no se adivina: se devuelve `null`, el pedido crea su provisional
 * y la pantalla de gastos marcará el otro como posible duplicado.
 */
export async function buscarFacturaSueltaDelProveedor(input: {
  tenantId: string
  proveedorId: string
  importe: number
  moneda?: string | null
}): Promise<{
  id: string
  amount: number
  category: string
  invoiceNumber: string | null
  metadata: unknown
} | null> {
  const facturas = await prisma.expense.findMany({
    where: {
      tenantId: input.tenantId,
      supplierId: input.proveedorId,
      reconciledAt: null,
      // Sólo una factura de verdad: un gasto sin número no es «el papel» que
      // justifica este pedido, así que no se le imputa.
      invoiceNumber: { not: null },
      // Y que no esté ya imputada a otro pedido.
      compra: { is: null },
    },
    select: { id: true, amount: true, category: true, currency: true, invoiceNumber: true, metadata: true },
    orderBy: { date: 'desc' },
    take: 50,
  })

  const exactas = facturas.filter(
    (f) =>
      monedasCompatibles(f.currency, input.moneda) &&
      redondear2(f.amount - input.importe) === 0
  )

  return exactas.length === 1 ? exactas[0] : null
}

/**
 * Pedidos recibidos cuyo coste sigue siendo provisional, compatibles con el
 * importe de una factura. Es la lista que se le enseña a quien concilia.
 */
export async function buscarComprasPendientesDeFactura(input: {
  tenantId: string
  proveedorId?: string | null
  importeFactura: number
  monedaFactura?: string | null
}): Promise<CandidatoConciliacion[]> {
  const importeFactura = Number(input.importeFactura)
  if (!Number.isFinite(importeFactura)) return []

  const compras = await prisma.compra.findMany({
    where: {
      tenantId: input.tenantId,
      estado: 'recibida',
      gastoId: { not: null },
      // Sólo los pedidos cuyo gasto sigue sin factura.
      gasto: { is: { reconciledAt: null } },
      ...(input.proveedorId ? { proveedorId: input.proveedorId } : {}),
    },
    select: {
      id: true,
      numero: true,
      total: true,
      moneda: true,
      fechaRecepcion: true,
      proveedorId: true,
      proveedor: { select: { name: true } },
    },
    orderBy: { fechaRecepcion: 'desc' },
    take: 50,
  })

  const candidatos: CandidatoConciliacion[] = []
  for (const compra of compras) {
    if (!monedasCompatibles(compra.moneda, input.monedaFactura)) continue
    if (!importesCompatibles(compra.total, importeFactura)) continue
    candidatos.push(
      candidatoDesdePedido({
        compraId: compra.id,
        numero: compra.numero,
        proveedorId: compra.proveedorId,
        proveedorNombre: compra.proveedor?.name ?? null,
        importePedido: compra.total,
        moneda: compra.moneda,
        fechaRecepcion: compra.fechaRecepcion,
        importeFactura,
      })
    )
  }

  return ordenarCandidatos(candidatos)
}

/** Candidatos + decisión, que es lo que necesita la ruta de gastos de una vez. */
export async function sugerirConciliacionParaFactura(input: {
  tenantId: string
  proveedorId?: string | null
  importeFactura: number
  monedaFactura?: string | null
}): Promise<{ emparejamiento: Emparejamiento; candidatos: CandidatoConciliacion[] }> {
  const candidatos = await buscarComprasPendientesDeFactura(input)
  return { emparejamiento: emparejarFactura(candidatos), candidatos }
}

/**
 * Completa el gasto provisional del pedido con los datos de la factura y lo
 * marca como conciliado. Es la operación que evita el doble apunte.
 */
export async function conciliarFacturaConCompra(input: {
  tenantId: string
  compraId: string
  factura: FacturaParaConciliar
}): Promise<ResultadoConciliacion> {
  const { tenantId, factura } = input

  if (!Number.isFinite(Number(factura.amount))) {
    throw new ErrorCompra('invalido', 'La factura necesita un importe para poder conciliarse')
  }

  const compra = await prisma.compra.findFirst({
    where: { id: input.compraId, tenantId },
    select: {
      id: true,
      numero: true,
      estado: true,
      total: true,
      moneda: true,
      proveedorId: true,
      proveedor: { select: { name: true } },
      gasto: {
        select: {
          id: true,
          amount: true,
          status: true,
          supplierId: true,
          invoiceNumber: true,
          reconciledAt: true,
          metadata: true,
        },
      },
    },
  })
  if (!compra) throw new ErrorCompra('no_encontrado', 'Pedido no encontrado')

  if (!compra.gasto) {
    throw new ErrorCompra(
      'conflicto',
      `El pedido ${compra.numero} todavía no tiene coste contable: recibe la mercancía antes de conciliar la factura`
    )
  }
  if (compra.gasto.reconciledAt) {
    throw new ErrorCompra(
      'conflicto',
      `El pedido ${compra.numero} ya está conciliado${compra.gasto.invoiceNumber ? ` con la factura ${compra.gasto.invoiceNumber}` : ''}`
    )
  }

  // El proveedor de la factura tiene que ser el del pedido, o se estaría
  // imputando el papel de uno al compromiso de otro.
  if (factura.supplierId && compra.proveedorId && factura.supplierId !== compra.proveedorId) {
    throw new ErrorCompra(
      'invalido',
      `La factura es de otro proveedor: el pedido ${compra.numero} es de ${compra.proveedor?.name ?? 'otro proveedor'}`
    )
  }

  if (!importesCompatibles(compra.total, factura.amount)) {
    throw new ErrorCompra(
      'invalido',
      `El importe de la factura (${redondear2(factura.amount)}) no cuadra con el pedido ${compra.numero} (${redondear2(compra.total)})`
    )
  }

  const moneda = monedaEscritura(factura.currency, compra.moneda)
  if (!monedasCompatibles(moneda, compra.moneda)) {
    throw new ErrorCompra(
      'invalido',
      `La factura está en ${moneda} y el pedido en ${compra.moneda}: no se pueden conciliar sin convertir`
    )
  }

  const anterior = redondear2(compra.gasto.amount)
  const nuevo = redondear2(factura.amount)
  const diferencia = redondear2(anterior - nuevo)
  const conciliadoEn = new Date()

  const actualizado = await prisma.expense.update({
    where: { id: compra.gasto.id },
    data: {
      amount: nuevo,
      currency: moneda,
      reconciledAt: conciliadoEn,
      ...(factura.invoiceNumber ? { invoiceNumber: factura.invoiceNumber } : {}),
      ...(factura.date ? { date: factura.date } : {}),
      ...(factura.dueDate ? { dueDate: factura.dueDate } : {}),
      ...(factura.receiptUrl ? { receiptUrl: factura.receiptUrl } : {}),
      ...(factura.category ? { category: factura.category } : {}),
      ...(factura.taxableBase != null ? { taxableBase: factura.taxableBase } : {}),
      ...(factura.vatRate != null ? { vatRate: factura.vatRate } : {}),
      ...(factura.vatAmount != null ? { vatAmount: factura.vatAmount } : {}),
      ...(factura.issuerName ? { issuerName: factura.issuerName } : {}),
      metadata: fusionarMetadata(compra.gasto.metadata, factura.metadata, {
        conciliacion: {
          compraId: compra.id,
          numero: compra.numero,
          conciliadoDesde: 'factura',
          conciliadoEn: conciliadoEn.toISOString(),
          importeProvisional: anterior,
          diferencia,
        },
      }),
    },
    select: { id: true, amount: true, category: true, invoiceNumber: true, reconciledAt: true },
  })

  // Cuentas por pagar: el provisional ya sumó su importe al saldo del proveedor
  // (lo hace `createExpense` cuando el gasto está PENDING). Si la factura trae
  // otro importe, el saldo se corrige por la diferencia o la deuda miente.
  if (diferencia !== 0 && compra.gasto.status === 'PENDING') {
    await prisma.supplier.update({
      where: { id: compra.gasto.supplierId },
      data: { balance: { increment: diferencia } },
    })
  }

  return {
    compra: { id: compra.id, numero: compra.numero, estado: compra.estado, total: compra.total },
    gasto: {
      id: actualizado.id,
      amount: actualizado.amount,
      category: actualizado.category,
      invoiceNumber: actualizado.invoiceNumber,
      reconciledAt: actualizado.reconciledAt ?? conciliadoEn,
    },
    diferencia,
  }
}

// ─── Sugerencias de reposición ───────────────────────────────────────────────

export interface SugerenciaCompra {
  catalogoItemId: string
  nombre: string
  sku: string | null
  unidad: string
  almacenId: string
  almacen: string
  cantidadActual: number
  puntoPedido: number
  cantidadSugerida: number
  precioUnitario: number
}

/**
 * Artículos por debajo de su punto de pedido, listos para pasar a una orden.
 *
 * Solo aparecen los artículos con un punto de pedido configurado (> 0): sin
 * umbral no hay sugerencia, porque un cero de stock puede ser perfectamente
 * normal en un artículo que no se repone.
 */
export async function sugerenciasDeReposicion(tenantId: string): Promise<SugerenciaCompra[]> {
  const niveles = await prisma.stockLevel.findMany({
    where: { tenantId },
    include: {
      catalogoItem: { select: { id: true, nombre: true, sku: true, unidad: true, costOfAcquisition: true, inventoryConfig: true } },
      warehouse: { select: { id: true, name: true } },
    },
  })

  const sugerencias: SugerenciaCompra[] = []

  for (const nivel of niveles) {
    const config = nivel.catalogoItem?.inventoryConfig
    const puntoPedido = Math.max(Number(config?.reorderPoint ?? 0), Number(nivel.minStock ?? 0))
    if (puntoPedido <= 0) continue
    if (Number(nivel.quantity) > puntoPedido) continue

    // El techo de reposición vive en el nivel de stock (maxStock), no en la
    // configuración del artículo: sin techo se pide lo justo para volver al
    // punto de pedido.
    const techo = Number(nivel.maxStock ?? 0);
    const objetivo = techo > puntoPedido ? techo : puntoPedido
    const cantidadSugerida = Math.max(Math.round((objetivo - Number(nivel.quantity)) * 100) / 100, 1)

    sugerencias.push({
      catalogoItemId: nivel.catalogoItem.id,
      nombre: nivel.catalogoItem.nombre,
      sku: nivel.catalogoItem.sku,
      unidad: nivel.catalogoItem.unidad,
      almacenId: nivel.warehouse.id,
      almacen: nivel.warehouse.name,
      cantidadActual: Number(nivel.quantity),
      puntoPedido,
      cantidadSugerida,
      precioUnitario: Number(nivel.catalogoItem.costOfAcquisition ?? 0),
    })
  }

  return sugerencias.sort((a, b) => a.cantidadActual - b.cantidadActual || a.nombre.localeCompare(b.nombre))
}
