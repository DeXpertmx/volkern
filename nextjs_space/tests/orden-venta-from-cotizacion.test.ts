import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Mocks ─────────────────────────────────────────────────────────────────

const prismaMock = {
  ordenVenta: {
    findFirst: vi.fn(),
    create: vi.fn(),
  },
  cotizacion: {
    findFirst: vi.fn(),
    update: vi.fn(),
  },
  perfilFiscalCliente: {
    findFirst: vi.fn(),
  },
  dealActivity: {
    create: vi.fn(),
  },
  auditLog: {
    create: vi.fn(),
  },
}

vi.mock('@/lib/db', () => ({ prisma: prismaMock }))

const { crearOrdenVentaDesdeCotizacion } = await import('@/lib/ordenes-venta/from-cotizacion')

const COTIZACION = {
  id: 'cot-1',
  tenantId: 'tenant-1',
  numero: 'COT-2026-0001',
  titulo: 'Servicios de consultoría',
  estado: 'aceptada',
  subtotal: 1000,
  descuentoPorcentaje: 0,
  descuentoMonto: 0,
  impuestos: 210,
  total: 1210,
  moneda: 'EUR',
  notasCliente: 'Nota para el cliente',
  notasInternas: null,
  leadId: 'lead-1',
  contactId: null,
  dealId: 'deal-1',
  emisorId: 'emisor-1',
  lead: { id: 'lead-1', nombre: 'Ana López' },
  deal: null,
  emisor: { id: 'emisor-1', pais: 'ES', razonSocial: 'Volkern SL' },
  items: [
    {
      id: 'item-1',
      concepto: 'Consultoría',
      descripcion: null,
      cantidad: 2,
      unidad: 'hora',
      precioUnitario: 500,
      descuento: 0,
      tasaImpuestoId: 'iva-1',
      porcentajeImpuesto: 21,
      montoImpuesto: 210,
      aplicaRetencion: false,
      porcentajeRetencion: 0,
      montoRetencion: 0,
      subtotal: 1000,
      total: 1210,
      orden: 1,
      catalogoItemId: null,
      catalogoItem: null,
      tasaImpuesto: { id: 'iva-1', nombre: 'IVA 21%', codigo: 'S1', porcentaje: 21 },
    },
  ],
}

const ORDEN_CREADA = {
  id: 'ov-1',
  numero: 'OV-2026-0001',
  tenantId: 'tenant-1',
  cotizacionId: 'cot-1',
  estado: 'borrador',
  total: 1210,
  moneda: 'EUR',
}

describe('crearOrdenVentaDesdeCotizacion', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    prismaMock.ordenVenta.findFirst.mockResolvedValue(null)
    prismaMock.cotizacion.findFirst.mockResolvedValue(COTIZACION)
    prismaMock.perfilFiscalCliente.findFirst.mockResolvedValue(null)
    prismaMock.ordenVenta.create.mockResolvedValue(ORDEN_CREADA)
    prismaMock.dealActivity.create.mockResolvedValue({})
    prismaMock.auditLog.create.mockResolvedValue({})
  })

  it('crea la orden de venta en estado borrador heredando los items y montos', async () => {
    const resultado = await crearOrdenVentaDesdeCotizacion({
      cotizacionId: 'cot-1',
      tenantId: 'tenant-1',
      userId: 'user-1',
    })

    expect(resultado.yaExistia).toBe(false)
    expect(prismaMock.ordenVenta.create).toHaveBeenCalledTimes(1)
    const arg = prismaMock.ordenVenta.create.mock.calls[0][0]
    expect(arg.data.estado).toBe('borrador')
    expect(arg.data.cotizacionId).toBe('cot-1')
    expect(arg.data.leadId).toBe('lead-1')
    expect(arg.data.dealId).toBe('deal-1')
    expect(arg.data.emisorId).toBe('emisor-1')
    expect(arg.data.referenciaCliente).toBe('COT-2026-0001')
    expect(arg.data.total).toBe(1210)
    expect(arg.data.subtotal).toBe(1000)
    expect(arg.data.totalImpuestos).toBe(210)
    expect(arg.data.items.create).toHaveLength(1)
    expect(arg.data.items.create[0]).toEqual(
      expect.objectContaining({
        concepto: 'Consultoría',
        cantidad: 2,
        precioUnitario: 500,
        porcentajeImpuesto: 21,
        montoImpuesto: 210,
      }),
    )
  })

  it('es idempotente: si la cotización ya tiene orden, devuelve la existente sin duplicar', async () => {
    prismaMock.ordenVenta.findFirst.mockResolvedValueOnce(ORDEN_CREADA)

    const resultado = await crearOrdenVentaDesdeCotizacion({
      cotizacionId: 'cot-1',
      tenantId: 'tenant-1',
    })

    expect(resultado.yaExistia).toBe(true)
    expect(resultado.orden.id).toBe('ov-1')
    expect(prismaMock.ordenVenta.create).not.toHaveBeenCalled()
    expect(prismaMock.cotizacion.findFirst).not.toHaveBeenCalled()
  })

  it('rechaza cotizaciones que no están aceptadas/enviadas/borrador', async () => {
    prismaMock.cotizacion.findFirst.mockResolvedValue({ ...COTIZACION, estado: 'rechazada' })

    await expect(
      crearOrdenVentaDesdeCotizacion({ cotizacionId: 'cot-1', tenantId: 'tenant-1' }),
    ).rejects.toThrow('rechazada')
    expect(prismaMock.ordenVenta.create).not.toHaveBeenCalled()
  })

  it('genera el número secuencial OV-año-XXXX', async () => {
    prismaMock.ordenVenta.findFirst
      .mockResolvedValueOnce(null) // idempotencia
      .mockResolvedValueOnce({ numero: `OV-${new Date().getFullYear()}-0003` }) // última orden

    await crearOrdenVentaDesdeCotizacion({ cotizacionId: 'cot-1', tenantId: 'tenant-1' })

    const arg = prismaMock.ordenVenta.create.mock.calls[0][0]
    expect(arg.data.numero).toBe(`OV-${new Date().getFullYear()}-0004`)
  })
})