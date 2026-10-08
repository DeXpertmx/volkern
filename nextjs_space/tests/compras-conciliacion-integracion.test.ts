import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { prisma } from '@/lib/db'
import { monedaEscritura } from '@/lib/moneda'
import {
  ErrorCompra,
  buscarComprasPendientesDeFactura,
  buscarFacturaSueltaDelProveedor,
  cambiarEstadoCompra,
  conciliarFacturaConCompra,
  crearCompra,
  recibirCompra,
  sugerirConciliacionParaFactura,
} from '@/lib/compras/service'

/**
 * Conciliación factura ↔ pedido, contra la base de datos de verdad.
 *
 * Lo que no se puede probar con módulos puros: que al conciliar NO aparezca un
 * segundo gasto (la única forma de comprobarlo es contar filas), que el gasto
 * provisional quede realmente enganchado al pedido y que la deuda del proveedor
 * acabe cuadrando con lo que dice la factura.
 *
 * Trabaja en un tenant temporal con slug único y lo borra al terminar; el
 * borrado en cascada se lleva pedidos, líneas, stock, movimientos y gastos.
 */

const marca = `test-concil-${Date.now()}`
const anio = new Date().getFullYear()

let tenantId: string
let usuarioId: string
let proveedorId: string
let otroProveedorId: string
let articuloId: string

beforeAll(async () => {
  const tenant = await prisma.tenant.create({
    data: { nombre: `Test Conciliación ${marca}`, slug: marca, moneda: 'EUR' },
  })
  tenantId = tenant.id

  const usuario = await prisma.user.create({ data: { email: `${marca}@example.test`, tenantId } })
  usuarioId = usuario.id

  proveedorId = (
    await prisma.supplier.create({ data: { tenantId, name: 'Proveedor conciliable', category: 'Otros' } })
  ).id
  otroProveedorId = (
    await prisma.supplier.create({ data: { tenantId, name: 'Proveedor ajeno', category: 'Otros' } })
  ).id

  articuloId = (
    await prisma.catalogoItem.create({
      data: { tenantId, nombre: 'Harina (prueba conciliación)', tipo: 'producto', precioBase: 10, isStockable: true },
    })
  ).id

  const almacen = await prisma.warehouse.create({ data: { tenantId, name: 'Almacén de prueba' } })
  await prisma.stockLevel.create({
    data: { tenantId, warehouseId: almacen.id, catalogoItemId: articuloId, quantity: 0 },
  })
}, 60_000)

afterAll(async () => {
  if (!tenantId) return
  await prisma.user.delete({ where: { id: usuarioId } }).catch(() => {})
  await prisma.tenant.delete({ where: { id: tenantId } }).catch(() => {})
}, 60_000)

/**
 * Pedido de una línea con artículo de almacén, enviado y recibido del todo.
 * Devuelve el pedido ya `recibida`, con su gasto provisional.
 */
async function pedidoRecibido(cantidad: number, precioUnitario: number) {
  const compra = await crearCompra({
    tenantId,
    usuarioId,
    proveedorId,
    moneda: 'EUR',
    items: [{ catalogoItemId: articuloId, concepto: 'Harina', cantidad, precioUnitario }],
  })
  await cambiarEstadoCompra({ tenantId, compraId: compra.id, estado: 'enviada' })

  const conLineas = await prisma.compra.findFirstOrThrow({ where: { id: compra.id }, include: { items: true } })
  await recibirCompra({
    tenantId,
    compraId: compra.id,
    usuarioId,
    lineas: [{ itemId: conLineas.items[0].id, cantidad }],
  })

  return prisma.compra.findFirstOrThrow({ where: { id: compra.id } })
}

const contarGastos = () => prisma.expense.count({ where: { tenantId } })
const saldoDe = async (id: string) => Number((await prisma.supplier.findFirstOrThrow({ where: { id } })).balance)

describe('Conciliación · la factura completa el gasto del pedido', () => {
  it('recibir deja un gasto provisional, sin factura y sin conciliar', async () => {
    const antes = await contarGastos()
    const compra = await pedidoRecibido(10, 10) // 100 + 21 IVA = 121

    expect(compra.estado).toBe('recibida')
    expect(compra.total).toBe(121)
    expect(await contarGastos()).toBe(antes + 1)

    const gasto = await prisma.expense.findFirstOrThrow({ where: { id: compra.gastoId! } })
    expect(gasto.amount).toBe(121)
    expect(gasto.status).toBe('PENDING')
    expect(gasto.invoiceNumber).toBeNull()
    expect(gasto.reconciledAt).toBeNull()

    // El provisional sí suma en la deuda del proveedor: es mercancía recibida.
    expect(await saldoDe(proveedorId)).toBe(121)
  })

  it('conciliar la factura NO crea un segundo gasto: completa el que ya había', async () => {
    const antes = await contarGastos()
    const compra = await pedidoRecibido(4, 25) // 100 + 21 = 121

    const resultado = await conciliarFacturaConCompra({
      tenantId,
      compraId: compra.id,
      factura: {
        amount: 121,
        supplierId: proveedorId,
        currency: 'EUR',
        invoiceNumber: 'F-2026-0001',
        date: new Date('2026-10-05T00:00:00.000Z'),
        dueDate: new Date('2026-11-04T00:00:00.000Z'),
        taxableBase: 100,
        vatRate: 21,
        vatAmount: 21,
        issuerName: 'Proveedor conciliable S.L.',
        metadata: { serie: 'F-2026' },
      },
    })

    // La clave: el número de gastos no sube.
    expect(await contarGastos()).toBe(antes + 1)
    expect(resultado.diferencia).toBe(0)

    const gasto = await prisma.expense.findFirstOrThrow({ where: { id: resultado.gasto.id } })
    expect(gasto.invoiceNumber).toBe('F-2026-0001')
    expect(gasto.reconciledAt).toBeInstanceOf(Date)
    expect(gasto.taxableBase).toBe(100)
    expect(gasto.vatAmount).toBe(21)
    expect(gasto.dueDate).toBeInstanceOf(Date)
    expect(gasto.issuerName).toBe('Proveedor conciliable S.L.')
    expect(gasto.amount).toBe(121)

    // Sigue siendo el gasto del pedido, y queda la traza de la conciliación.
    const pedido = await prisma.compra.findFirstOrThrow({ where: { id: compra.id } })
    expect(pedido.gastoId).toBe(gasto.id)
    const meta = gasto.metadata as any
    expect(meta?.serie).toBe('F-2026')
    expect(meta?.conciliacion?.numero).toBe(pedido.numero)
    expect(meta?.conciliacion?.importeProvisional).toBe(121)
  })

  it('un pedido ya conciliado no se concilia dos veces', async () => {
    const compra = await prisma.compra.findFirstOrThrow({
      where: { tenantId, gasto: { is: { invoiceNumber: 'F-2026-0001' } } },
    })

    await expect(
      conciliarFacturaConCompra({
        tenantId,
        compraId: compra.id,
        factura: { amount: compra.total, supplierId: proveedorId, invoiceNumber: 'F-2026-0001' },
      })
    ).rejects.toThrow(/ya está conciliado/i)
  })

  it('corrige el importe y la deuda del proveedor cuando la factura no cuadra al céntimo', async () => {
    const compra = await pedidoRecibido(2, 50) // 100 + 21 = 121
    const saldoAntes = await saldoDe(proveedorId)

    // 40 céntimos más: por encima del margen trivial pero dentro de la tolerancia.
    const resultado = await conciliarFacturaConCompra({
      tenantId,
      compraId: compra.id,
      factura: { amount: 121.4, supplierId: proveedorId, invoiceNumber: 'F-2026-0002' },
    })

    expect(resultado.diferencia).toBe(-0.4)

    const gasto = await prisma.expense.findFirstOrThrow({ where: { id: resultado.gasto.id } })
    expect(gasto.amount).toBe(121.4)

    // La deuda sube: la factura es mayor que el provisional.
    expect(await saldoDe(proveedorId)).toBe(Math.round((saldoAntes + 0.4) * 100) / 100)
  })

  it('rechaza una factura cuyo importe no cuadra con el pedido', async () => {
    const compra = await pedidoRecibido(1, 100) // 121

    await expect(
      conciliarFacturaConCompra({
        tenantId,
        compraId: compra.id,
        factura: { amount: 800, supplierId: proveedorId, invoiceNumber: 'F-OTRA' },
      })
    ).rejects.toThrow(/no cuadra/i)

    // Y el gasto provisional sigue sin conciliar.
    const gasto = await prisma.expense.findFirstOrThrow({ where: { id: compra.gastoId! } })
    expect(gasto.reconciledAt).toBeNull()
  })

  it('rechaza imputar la factura de otro proveedor', async () => {
    const compra = await pedidoRecibido(1, 100)

    await expect(
      conciliarFacturaConCompra({
        tenantId,
        compraId: compra.id,
        factura: { amount: compra.total, supplierId: otroProveedorId, invoiceNumber: 'F-AJENA' },
      })
    ).rejects.toThrow(/otro proveedor/i)
  })

  it('no deja conciliar una factura en otra divisa', async () => {
    const compra = await pedidoRecibido(1, 100)

    await expect(
      conciliarFacturaConCompra({
        tenantId,
        compraId: compra.id,
        factura: { amount: compra.total, supplierId: proveedorId, currency: 'USD', invoiceNumber: 'F-USD' },
      })
    ).rejects.toThrow(/no se pueden conciliar sin convertir/i)
  })
})

describe('Conciliación · la mercancía llega después que el papel', () => {
  it('el pedido se imputa a la factura ya registrada, sin crear un gasto nuevo', async () => {
    // Una factura capturada por la pantalla de gastos: tiene número, no tiene
    // pedido y su importe coincide con el que vamos a recibir.
    const factura = await prisma.expense.create({
      data: {
        tenantId,
        createdById: usuarioId,
        supplierId: proveedorId,
        description: 'Factura capturada antes de recibir',
        amount: 242,
        currency: 'EUR',
        date: new Date('2026-10-02T00:00:00.000Z'),
        status: 'PENDING',
        category: 'mercaderias',
        invoiceNumber: 'F-2026-0009',
        metadata: { serie: 'F-2026' },
      },
    })

    const antes = await contarGastos()
    const compra = await pedidoRecibido(20, 10) // 200 + 42 = 242

    // No se creó otro gasto: el pedido se enganchó al que ya existía.
    expect(await contarGastos()).toBe(antes)

    const pedido = await prisma.compra.findFirstOrThrow({ where: { id: compra.id } })
    expect(pedido.gastoId).toBe(factura.id)

    const gasto = await prisma.expense.findFirstOrThrow({ where: { id: factura.id } })
    expect(gasto.reconciledAt).toBeInstanceOf(Date)
    expect(gasto.invoiceNumber).toBe('F-2026-0009')
    const meta = gasto.metadata as any
    expect(meta?.serie).toBe('F-2026')
    expect(meta?.conciliacion?.numero).toBe(pedido.numero)
    expect(meta?.conciliacion?.conciliadoDesde).toBe('recepcion')
  })

  it('una factura ya imputada a un pedido no se reutiliza para otro', async () => {
    const usadas = await prisma.expense.findMany({
      where: { tenantId, compra: { isNot: null } },
      select: { id: true, amount: true, supplierId: true },
    })
    expect(usadas.length).toBeGreaterThan(0)

    const elegida = usadas[0]
    const candidata = await buscarFacturaSueltaDelProveedor({
      tenantId,
      proveedorId: elegida.supplierId,
      importe: elegida.amount,
      moneda: 'EUR',
    })
    expect(candidata?.id).not.toBe(elegida.id)
  })
})

describe('Conciliación · qué le enseña el servidor a la pantalla', () => {
  it('con una coincidencia exacta propone la automática', async () => {
    const compra = await pedidoRecibido(3, 40) // 120 + 25.2 = 145.2

    const { emparejamiento, candidatos } = await sugerirConciliacionParaFactura({
      tenantId,
      proveedorId,
      importeFactura: compra.total,
      monedaFactura: 'EUR',
    })

    expect(candidatos.length).toBeGreaterThan(0)
    const propuesta = candidatos.find((c) => c.compraId === compra.id)
    expect(propuesta?.exacto).toBe(true)
    // Hay varios pedidos sin factura, pero uno cuadra al céntimo: ese gana.
    expect(emparejamiento.estado).toBe('automatica')
    if (emparejamiento.estado === 'automatica') {
      expect(emparejamiento.candidato.compraId).toBe(compra.id)
    }
  })

  it('con un importe que no encaja no propone nada', async () => {
    const { emparejamiento, candidatos } = await sugerirConciliacionParaFactura({
      tenantId,
      proveedorId,
      importeFactura: 99_999,
      monedaFactura: 'EUR',
    })

    expect(candidatos).toHaveLength(0)
    expect(emparejamiento.estado).toBe('ninguna')
  })

  it('no propone pedidos de otro proveedor', async () => {
    const compra = await pedidoRecibido(1, 100)
    const candidatos = await buscarComprasPendientesDeFactura({
      tenantId,
      proveedorId: otroProveedorId,
      importeFactura: compra.total,
      monedaFactura: 'EUR',
    })
    expect(candidatos.map((c) => c.compraId)).not.toContain(compra.id)
  })

  it('una factura en otra divisa no propone candidatos', async () => {
    const compra = await pedidoRecibido(1, 100)
    const candidatos = await buscarComprasPendientesDeFactura({
      tenantId,
      proveedorId,
      importeFactura: compra.total,
      monedaFactura: 'USD',
    })
    expect(candidatos.map((c) => c.compraId)).not.toContain(compra.id)
  })

  it('no propone los pedidos que todavía no tienen gasto', async () => {
    // Pedido creado pero no recibido: no hay coste provisional que completar.
    const compra = await crearCompra({
      tenantId,
      usuarioId,
      proveedorId,
      moneda: 'EUR',
      items: [{ catalogoItemId: articuloId, concepto: 'Harina', cantidad: 1, precioUnitario: 121 }],
    })

    const candidatos = await buscarComprasPendientesDeFactura({
      tenantId,
      proveedorId,
      importeFactura: compra.total,
      monedaFactura: 'EUR',
    })
    expect(candidatos.map((c) => c.compraId)).not.toContain(compra.id)

    // Y si se intenta conciliar, el error explica qué falta en vez de reventar.
    await expect(
      conciliarFacturaConCompra({
        tenantId,
        compraId: compra.id,
        factura: { amount: compra.total, supplierId: proveedorId, invoiceNumber: 'F-SIN-RECIBIR' },
      })
    ).rejects.toThrow(/recibe la mercancía antes/i)
  })

  it('la moneda por defecto del pedido es la del tenant', () => {
    expect(monedaEscritura(undefined, 'EUR')).toBe('EUR')
  })
})

describe('Conciliación · aislamiento', () => {
  it('no se puede conciliar un pedido de otro tenant', async () => {
    const compra = await prisma.compra.findFirstOrThrow({ where: { tenantId } })

    await expect(
      conciliarFacturaConCompra({
        tenantId: 'tenant-que-no-existe',
        compraId: compra.id,
        factura: { amount: compra.total, invoiceNumber: 'F-X' },
      })
    ).rejects.toBeInstanceOf(ErrorCompra)

    await expect(
      conciliarFacturaConCompra({
        tenantId: 'tenant-que-no-existe',
        compraId: compra.id,
        factura: { amount: compra.total, invoiceNumber: 'F-X' },
      })
    ).rejects.toThrow(/no encontrado/i)
  })
})
