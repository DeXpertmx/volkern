import { ActionContext } from '../types'
import { createSystemContext } from '@/lib/skills/context'

export async function notifyLowStock(config: any, ctx: ActionContext): Promise<boolean> {
  const { itemNombre, cantidadActual, cantidadMinima, almacenNombre } = config
  const message = `⚠️ *Alerta de Stock Bajo*\n\n📦 *Producto:* ${itemNombre || ctx.state.itemNombre}\n📊 *Stock Actual:* ${cantidadActual || ctx.state.cantidadActual}\n📉 *Mínimo:* ${cantidadMinima || ctx.state.cantidadMinima}\n🏭 *Almacén:* ${almacenNombre || ctx.state.almacenNombre || 'Principal'}`

  const { notifyByTelegram, notifyByEmail } = await import('@/lib/skills/notification-layer')
  const context = createSystemContext(ctx.state.tenantId as any)

  if (config.enviarTelegram) notifyByTelegram(message, context).catch(() => {})
  if (config.enviarEmail && ctx.state.userEmail) (notifyByEmail as any)(ctx.state.userEmail, 'Alerta de Stock Bajo', message, context).catch(() => {})

  await ctx.log('notify_low_stock', 'action', 'success', `Notificación de stock bajo enviada para ${itemNombre || ctx.state.itemNombre}`)
  return true
}

export async function updateInventory(config: any, ctx: ActionContext): Promise<boolean> {
  const { itemId, cantidad, tipo, motivo } = config
  const { getTenantDb } = await import('@/lib/db')
  const tenantClient = await getTenantDb(ctx.state.tenantId)

  const updateData: any = {}
  if (tipo === 'aumentar') updateData.cantidad = { increment: cantidad }
  else if (tipo === 'disminuir') updateData.cantidad = { decrement: cantidad }
  else if (tipo === 'set') updateData.cantidad = cantidad
  if (motivo) updateData.ultimaActualizacion = motivo

  await (tenantClient as any).inventarioItem.update({ where: { id: itemId || ctx.state.itemId }, data: updateData })
  await ctx.log('update_inventory', 'action', 'success', `Inventario actualizado: ${tipo} ${cantidad}`)
  return true
}

/**
 * crear_orden_compra — Pedido a proveedor desde una automatización.
 *
 * Antes escribía `compra.create` a mano contra un modelo que NO existía en el
 * esquema: la acción fallaba en runtime en cuanto alguien la usaba. Ahora crea
 * el pedido por el mismo camino que la pantalla (`lib/compras/service`), así
 * que sale con su correlativo (`OC-AAAA-0001`), sus totales calculados y en el
 * estado inicial del ciclo (`borrador`), no en un `pendiente` que no era
 * ninguno de los estados reales.
 *
 * Config: `{ proveedorId?, almacenId?, notas?, fechaEntrega?, items[] }`, donde
 * cada línea es `{ catalogoItemId|itemId, concepto?, cantidad, precioUnitario|precio, porcentajeImpuesto? }`.
 */
export async function createPurchaseOrder(config: any, ctx: ActionContext): Promise<boolean> {
  const lineasEntrada: any[] = Array.isArray(config.items) ? config.items : []
  const lineas = lineasEntrada
    .filter((item: any) => item?.catalogoItemId || item?.itemId || item?.concepto || item?.nombre)
    .map((item: any) => ({
      catalogoItemId: item.catalogoItemId ?? item.itemId ?? null,
      concepto: item.concepto ?? item.nombre ?? 'Línea de compra',
      cantidad: Number(item.cantidad) || 0,
      precioUnitario: Number(item.precioUnitario ?? item.precio) || 0,
      porcentajeImpuesto: Number(item.porcentajeImpuesto ?? 21),
    }))

  if (lineas.length === 0) {
    await ctx.log(
      'create_purchase_order',
      'action',
      'error',
      'La acción necesita al menos una línea con artículo o concepto (items)'
    )
    return false
  }

  try {
    const { crearCompra } = await import('@/lib/compras/service')
    const compra = await crearCompra({
      // El contexto de una automatización siempre trae el tenant: la acción se
      // ejecuta dentro de él (mismo criterio que el resto de acciones del motor).
      tenantId: ctx.state.tenantId as string,
      proveedorId: config.proveedorId ?? null,
      almacenId: config.almacenId ?? null,
      notas: config.notas ?? null,
      fechaEntrega: config.fechaEntrega ? new Date(config.fechaEntrega) : null,
      // Sin divisa en la acción, el servicio usa la del tenant.
      moneda: config.moneda ?? null,
      items: lineas,
    })
    await ctx.log('create_purchase_order', 'action', 'success', `Pedido de compra ${compra.numero} creado en borrador`)
    return true
  } catch (error) {
    await ctx.log(
      'create_purchase_order',
      'action',
      'error',
      error instanceof Error ? error.message : 'Error al crear el pedido de compra'
    )
    return false
  }
}

export async function adjustStock(config: any, ctx: ActionContext): Promise<boolean> {
  const { itemId, cantidad, tipo, motivo } = config
  const { getTenantDb } = await import('@/lib/db')
  const tenantClient = await getTenantDb(ctx.state.tenantId)

  await (tenantClient as any).inventarioMovimiento.create({
    data: {
      tenantId: ctx.state.tenantId, itemId: itemId || ctx.state.itemId,
      tipo: tipo || 'ajuste', cantidad, motivo: motivo || 'Ajuste manual', usuarioId: ctx.state.userId,
    },
  })
  await ctx.log('adjust_stock', 'action', 'success', `Ajuste de stock registrado: ${cantidad}`)
  return true
}
