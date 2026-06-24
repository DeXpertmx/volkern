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

export async function createPurchaseOrder(config: any, ctx: ActionContext): Promise<boolean> {
  const { proveedorId, items, notas } = config
  const { getTenantDb } = await import('@/lib/db')
  const tenantClient = await getTenantDb(ctx.state.tenantId)

  const order = await (tenantClient as any).compra.create({
    data: {
      tenantId: ctx.state.tenantId, proveedorId, estado: 'pendiente', notas,
      fechaEntrega: config.fechaEntrega,
      items: { create: items.map((item: any) => ({ itemId: item.itemId, cantidad: item.cantidad, precioUnitario: item.precio })) },
    },
  })
  await ctx.log('create_purchase_order', 'action', 'success', `Orden de compra ${order.id} creada`)
  return true
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
