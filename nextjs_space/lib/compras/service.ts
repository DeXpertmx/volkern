import { prisma } from '@/lib/db'
import { monedaEscritura } from '@/lib/moneda'
import { adjustStock } from '@/lib/skills/inventory-skills'
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
  validarRecepcionDeLinea,
  type EstadoCompra,
} from './reglas'

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
  let gasto: ResultadoRecepcion['gasto'] = null

  if (nuevoEstado === 'recibida' && !compra.gastoId) {
    if (!compra.proveedorId) {
      avisos.push('El pedido no tiene proveedor: no se ha generado el gasto contable')
    } else {
      const category = categoriaGastoDeCompra(compra.items)
      const creado = await prisma.expense.create({
        data: {
          tenantId,
          createdById: usuarioId,
          supplierId: compra.proveedorId,
          description: `Compra ${compra.numero} — ${compra.proveedor?.name ?? 'proveedor'}`,
          amount: actualizada.total,
          currency: compra.moneda,
          date: fechaRecepcion,
          status: 'PENDING',
          category,
          metadata: { origen: 'compras', compraId: compra.id, numero: compra.numero },
        },
        select: { id: true, amount: true, category: true },
      })
      await prisma.compra.update({ where: { id: compra.id }, data: { gastoId: creado.id } })
      gasto = creado
    }
  }

  return { compra: actualizada, movimientos, gasto, avisos }
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
