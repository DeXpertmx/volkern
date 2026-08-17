import { prisma } from '@/lib/db'
import { aplicaInversionSujetoPasivo } from '@/lib/fiscal-validation'

export interface CrearOrdenDesdeCotizacionOptions {
  cotizacionId: string
  tenantId: string
  userId?: string | null
  fechaEntrega?: string | Date | null
  notas?: string | null
  notasInternas?: string | null
  condicionesVenta?: string | null
  referenciaCliente?: string | null
  ajustarPrecios?: boolean
}

/**
 * Convierte una cotización en una Orden de Venta heredando items, cliente,
 * datos fiscales y referencias al catálogo. Es idempotente: si la cotización
 * ya tiene una orden de venta, devuelve la existente sin duplicar.
 *
 * Flujo de ventas: cotización aceptada → orden de venta (revisión) → facturación.
 */
export async function crearOrdenVentaDesdeCotizacion({
  cotizacionId,
  tenantId,
  userId = null,
  fechaEntrega,
  notas,
  notasInternas,
  condicionesVenta,
  referenciaCliente,
  ajustarPrecios = false,
}: CrearOrdenDesdeCotizacionOptions) {
  // Idempotencia: si ya existe una orden para esta cotización, no duplicar.
  const existente = await prisma.ordenVenta.findFirst({
    where: { cotizacionId, tenantId },
    orderBy: { fechaCreacion: 'asc' },
  })
  if (existente) {
    return { orden: existente, yaExistia: true }
  }

  const cotizacion = await prisma.cotizacion.findFirst({
    where: { id: cotizacionId, tenantId },
    include: {
      items: {
        include: {
          catalogoItem: { include: { tasaImpuesto: true } },
          tasaImpuesto: true,
        },
        orderBy: { orden: 'asc' },
      },
      lead: true,
      deal: true,
      emisor: true,
    },
  })

  if (!cotizacion) {
    throw new Error('Cotización no encontrada')
  }

  if (!['aceptada', 'enviada', 'borrador'].includes(cotizacion.estado)) {
    throw new Error(`No se puede convertir cotización en estado: ${cotizacion.estado}`)
  }

  // Perfil fiscal del cliente
  let perfilFiscalCliente = null
  if (cotizacion.leadId) {
    perfilFiscalCliente = await prisma.perfilFiscalCliente.findFirst({
      where: { leadId: cotizacion.leadId },
    })
  } else if (cotizacion.contactId) {
    perfilFiscalCliente = await prisma.perfilFiscalCliente.findFirst({
      where: { contactId: cotizacion.contactId },
    })
  }

  // Inversión de sujeto pasivo (reverse charge)
  const aplicaReverseCharge = cotizacion.emisor && perfilFiscalCliente
    ? aplicaInversionSujetoPasivo(
        cotizacion.emisor.pais,
        perfilFiscalCliente.country,
        !!perfilFiscalCliente.idIntracomunitario
      )
    : false

  // Procesar items
  const itemsProcessed: any[] = []
  let subtotalOrden = 0
  let totalImpuestosOrden = 0
  let totalRetencionesOrden = 0

  for (const item of cotizacion.items) {
    let precioUnitario = item.precioUnitario
    let porcentajeImpuesto = item.porcentajeImpuesto || 0
    let tasaImpuestoId = item.tasaImpuestoId

    if (ajustarPrecios && item.catalogoItem) {
      precioUnitario = item.catalogoItem.precioBase
      porcentajeImpuesto = item.catalogoItem.tasaImpuesto?.porcentaje || 0
      tasaImpuestoId = item.catalogoItem.tasaImpuestoId
    }

    let subtotalItem = item.cantidad * precioUnitario
    if (item.descuento > 0) {
      subtotalItem = subtotalItem * (1 - item.descuento / 100)
    }
    subtotalItem = Math.round(subtotalItem * 100) / 100

    if (perfilFiscalCliente?.exentoImpuestos || aplicaReverseCharge) {
      porcentajeImpuesto = 0
    }

    const montoImpuesto = Math.round(subtotalItem * (porcentajeImpuesto / 100) * 100) / 100

    const aplicaRetencion = item.aplicaRetencion || perfilFiscalCliente?.aplicaRetencion || false
    const porcentajeRetencion = item.porcentajeRetencion || 0
    let montoRetencion = 0
    if (aplicaRetencion && porcentajeRetencion > 0) {
      montoRetencion = Math.round(subtotalItem * (porcentajeRetencion / 100) * 100) / 100
    }

    const totalItem = subtotalItem + montoImpuesto - montoRetencion

    itemsProcessed.push({
      concepto: item.concepto,
      descripcion: item.descripcion,
      cantidad: item.cantidad,
      unidad: item.catalogoItem?.unidad || 'unidad',
      precioUnitario,
      descuento: item.descuento,
      tasaImpuestoId,
      porcentajeImpuesto,
      montoImpuesto,
      aplicaRetencion,
      porcentajeRetencion,
      montoRetencion,
      subtotal: subtotalItem,
      total: totalItem,
      orden: item.orden,
      catalogoItemId: item.catalogoItemId,
    })

    subtotalOrden += subtotalItem
    totalImpuestosOrden += montoImpuesto
    totalRetencionesOrden += montoRetencion
  }

  // Descuento global de la cotización
  const descuentoGlobal = cotizacion.descuentoPorcentaje || 0
  let descuentoGlobalMonto = 0
  if (descuentoGlobal > 0) {
    descuentoGlobalMonto = subtotalOrden * (descuentoGlobal / 100)
  }

  const totalOrden = subtotalOrden - descuentoGlobalMonto + totalImpuestosOrden - totalRetencionesOrden

  // Número de orden
  const year = new Date().getFullYear()
  const ultimaOrden = await prisma.ordenVenta.findFirst({
    where: { tenantId, numero: { startsWith: `OV-${year}` } },
    orderBy: { numero: 'desc' },
  })

  let siguienteNumero = 1
  if (ultimaOrden) {
    const match = ultimaOrden.numero.match(/OV-\d{4}-(\d+)/)
    if (match) siguienteNumero = parseInt(match[1]) + 1
  }
  const numero = `OV-${year}-${String(siguienteNumero).padStart(4, '0')}`

  // Crear la orden de venta
  const orden = await prisma.ordenVenta.create({
    data: {
      tenantId,
      numero,
      leadId: cotizacion.leadId,
      contactId: cotizacion.contactId,
      contratoId: null,
      cotizacionId: cotizacion.id,
      dealId: cotizacion.dealId,
      emisorId: cotizacion.emisorId,
      estado: 'borrador',
      fechaOrden: new Date(),
      fechaEntrega: fechaEntrega ? new Date(fechaEntrega) : null,
      subtotal: subtotalOrden,
      descuentoGlobal,
      tipoDescuento: 'porcentaje',
      totalImpuestos: totalImpuestosOrden,
      totalRetenciones: totalRetencionesOrden,
      total: Math.round(totalOrden * 100) / 100,
      moneda: cotizacion.moneda,
      redondeoLinea: true,
      notas: notas || cotizacion.notasCliente,
      notasInternas: notasInternas || cotizacion.notasInternas,
      condicionesVenta,
      referenciaCliente: referenciaCliente || cotizacion.numero,
      creadoPorId: userId || null,
      items: { create: itemsProcessed },
    },
    include: {
      lead: { select: { id: true, nombre: true, email: true } },
      cotizacion: { select: { id: true, numero: true, titulo: true } },
      emisor: { select: { id: true, razonSocial: true } },
      items: {
        include: {
          catalogoItem: { select: { id: true, nombre: true, sku: true } },
        },
      },
    },
  })

  // La cotización queda aceptada (si aún no lo está)
  if (cotizacion.estado !== 'aceptada') {
    await prisma.cotizacion.update({
      where: { id: cotizacion.id },
      data: { estado: 'aceptada', fechaAceptacion: cotizacion.fechaAceptacion || new Date() },
    })
  }

  // Actividad en el deal
  if (cotizacion.dealId) {
    await prisma.dealActivity.create({
      data: {
        dealId: cotizacion.dealId,
        tenantId,
        userId: userId || '',
        tipo: 'orden_venta',
        titulo: 'Orden de venta creada desde cotización',
        descripcion: `Orden ${numero} creada desde cotización ${cotizacion.numero} por ${orden.total} ${orden.moneda}`,
      },
    }).catch(() => {})
  }

  // Audit log
  await prisma.auditLog.create({
    data: {
      tenantId,
      userId: userId || 'api',
      accion: 'convertir',
      entidad: 'orden_venta',
      entidadId: orden.id,
      descripcion: `Orden de venta ${numero} creada desde cotización ${cotizacion.numero}`,
      cambiosDespues: { ordenId: orden.id, cotizacionId: cotizacion.id },
    },
  }).catch(() => {})

  // Notificación por Telegram (no bloqueante)
  try {
    const { notifyByTelegram } = await import('@/lib/skills/notification-layer')
    const { createSystemContext } = await import('@/lib/skills/context')
    notifyByTelegram(
      `💰 *Nueva Orden de Venta*\n\n📋 *Orden:* ${numero}\n💵 *Monto:* ${orden.total} ${orden.moneda}\n👤 *Cliente:* ${cotizacion.lead?.nombre || 'N/A'}\n📝 *Desde cotización:* ${cotizacion.numero}`,
      createSystemContext(tenantId)
    ).catch((err: any) => console.error('Error en Notificación Telegram:', err))
  } catch (err) {
    console.warn('[crearOrdenVentaDesdeCotizacion] Notificación no disponible:', err)
  }

  return { orden, yaExistia: false }
}
