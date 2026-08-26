import { z } from 'zod'
import { CommonSchemas } from '@/lib/validation/common'

/** Schema de item de cotización que el cliente envía (sin campos calculados) */
export const CotizacionItemInputSchema = z.object({
  concepto: z.string().min(1).max(500),
  descripcion: z.string().max(2000).optional().nullable(),
  cantidad: z.coerce.number().min(0.01),
  precioUnitario: CommonSchemas.montoPositivo,
  descuento: z.coerce.number().min(0).default(0),
  tasaImpuestoId: CommonSchemas.id.optional().nullable(),
  porcentajeImpuesto: z.coerce.number().min(0).max(100).optional(),
  aplicaRetencion: z.boolean().optional(),
  porcentajeRetencion: z.coerce.number().min(0).optional(),
  catalogoItemId: CommonSchemas.id.optional().nullable(),
  categoria: z.string().max(100).optional(),
  sku: z.string().max(50).optional(),
});

/** Schema de cotización que el cliente envía (sin campos calculados) */
export const CotizacionInputSchema = z.object({
  dealId: CommonSchemas.id.optional().nullable(),
  leadId: CommonSchemas.id.optional().nullable(),
  contactId: CommonSchemas.id.optional().nullable(),
  titulo: z.string().min(1, 'Título requerido').max(500),
  descripcion: z.string().max(5000).optional().nullable(),
  items: z.array(CotizacionItemInputSchema).min(1, 'Se requiere al menos un item').max(200),
  descuentoPorcentaje: z.coerce.number().min(0).max(100).default(0),
  // IVA general solo para líneas manuales que no traen porcentaje propio.
  // Los artículos del catálogo conservan su tasa por línea.
  impuestos: z.coerce.number().min(0).max(100).default(0),
  moneda: CommonSchemas.moneda,
  validezDias: z.coerce.number().int().min(1).max(365).default(30),
  terminosPago: z.string().max(500).optional().nullable(),
  clausulas: z.string().max(20000).optional().nullable(),
  notasCliente: z.string().max(5000).optional().nullable(),
  notasInternas: z.string().max(5000).optional().nullable(),
  clienteNombre: z.string().max(500).optional().nullable(),
  clienteEmail: z.string().email().optional().nullable(),
  clienteEmpresa: z.string().max(255).optional().nullable(),
  clienteTelefono: z.string().max(30).optional().nullable(),
  emisorId: CommonSchemas.id.optional().nullable(),
});

/**
 * Calcula las líneas de una cotización.
 * `CotizacionItem.descuento` representa un importe fijo en la moneda de la cotización,
 * no un porcentaje. La interfaz de Nueva Cotización muestra el descuento como euros.
 */
export function calculateCotizacionItems(items: any[], catalogoMap: Map<string, any>, impuestos: number) {
  const processedItems: any[] = []
  let subtotal = 0
  let totalImpuestos = 0

  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    const catalogoItem = item.catalogoItemId ? catalogoMap.get(item.catalogoItemId) : null
    const concepto = item.concepto || catalogoItem?.nombre
    const descripcion = item.descripcion ?? catalogoItem?.descripcion
    const cantidad = Number(item.cantidad) || 1
    const precioUnitario = Number(item.precioUnitario)
    const subtotalBruto = Math.round(cantidad * precioUnitario * 100) / 100
    const descuento = Math.round(Math.max(0, Number(item.descuento) || 0) * 100) / 100

    if (descuento > subtotalBruto + 0.001) {
      return {
        error: `El descuento de «${concepto || `línea ${i + 1}`}» no puede superar ${subtotalBruto.toFixed(2)} ${item.moneda || ''}`.trim(),
      }
    }

    const categoria = item.categoria || catalogoItem?.categoriaFiscal
    const sku = item.sku || catalogoItem?.sku
    const tasaImpuestoId = item.tasaImpuestoId || catalogoItem?.tasaImpuestoId
    const tienePorcentajeExplicito = item.porcentajeImpuesto !== undefined && item.porcentajeImpuesto !== null
    const porcentajeImpuesto = Math.max(0, Number(
      tienePorcentajeExplicito
        ? item.porcentajeImpuesto
        : catalogoItem?.tasaImpuesto?.porcentaje ?? (catalogoItem?.categoriaFiscal === 'exento' ? 0 : impuestos)
    ) || 0)
    const subtotalItem = Math.round((subtotalBruto - descuento) * 100) / 100
    const montoImpuesto = Math.round(subtotalItem * (porcentajeImpuesto / 100) * 100) / 100
    const totalItem = Math.round((subtotalItem + montoImpuesto) * 100) / 100

    processedItems.push({
      catalogoItemId: item.catalogoItemId || null,
      concepto,
      descripcion,
      cantidad,
      precioUnitario,
      descuento,
      subtotal: subtotalItem,
      tasaImpuestoId,
      porcentajeImpuesto,
      montoImpuesto,
      impuestos: montoImpuesto,
      total: totalItem,
      orden: i + 1,
      categoria,
      sku,
      aplicaRetencion: item.aplicaRetencion || false,
      porcentajeRetencion: Number(item.porcentajeRetencion) || 0,
      montoRetencion: 0,
    })

    subtotal += subtotalItem
    totalImpuestos += montoImpuesto
  }

  return { processedItems, subtotal, totalImpuestos }
}