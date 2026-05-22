import { z } from 'zod';
import { CommonSchemas } from '../common';

/**
 * Schema para crear una Factura/Invoice
 */
export const InvoiceCreateSchema = z.object({
  leadId: CommonSchemas.id.optional().nullable(),
  contactId: CommonSchemas.id.optional().nullable(),
  dealId: CommonSchemas.id.optional().nullable(),
  numero: z.string().min(1, 'Número de factura requerido').max(50),
  fechaEmision: CommonSchemas.fechaISO,
  fechaVencimiento: z.string().datetime().optional().nullable(),
  subtotal: CommonSchemas.montoPositivo,
  descuentoPorcentaje: z.coerce.number().min(0).max(100).default(0),
  descuentoMonto: z.coerce.number().min(0).default(0),
  impuestos: z.coerce.number().min(0).default(0),
  total: CommonSchemas.montoPositivo,
  moneda: CommonSchemas.moneda,
  estado: z.enum(['borrador', 'emitida', 'pagada', 'anulada', 'vencida']).default('borrador'),
  metodoPago: z.enum(['transferencia', 'tarjeta', 'efectivo', 'domiciliacion', 'paypal', 'stripe']).optional(),
  terminosPago: z.string().max(500).optional().nullable(),
  notas: z.string().max(5000).optional().nullable(),
  notasCliente: z.string().max(5000).optional().nullable(),
  items: z.array(z.object({
    concepto: z.string().min(1, 'Concepto requerido').max(500),
    descripcion: z.string().max(2000).optional().nullable(),
    cantidad: z.coerce.number().min(0.01, 'Cantidad debe ser mayor a 0'),
    precioUnitario: CommonSchemas.montoPositivo,
    descuento: z.coerce.number().min(0).default(0),
    impuestos: z.coerce.number().min(0).default(0),
    total: CommonSchemas.montoPositivo,
    orden: z.coerce.number().int().min(1).default(1),
    tasaImpuestoId: CommonSchemas.id.optional().nullable(),
    catalogoItemId: CommonSchemas.id.optional().nullable(),
  })).min(1, 'Al menos un item requerido').max(200, 'Máximo 200 items'),
  clienteNombre: z.string().max(500).optional().nullable(),
  clienteEmail: z.string().email().optional().nullable(),
  clienteTelefono: z.string().max(30).optional().nullable(),
  clienteEmpresa: z.string().max(255).optional().nullable(),
  clienteRfc: z.string().max(20).optional().nullable(),
  clienteDireccion: z.string().max(500).optional().nullable(),
  emisorId: CommonSchemas.id.optional().nullable(),
});

export type InvoiceCreateInput = z.infer<typeof InvoiceCreateSchema>;

/**
 * Schema para actualizar una Factura
 */
export const InvoiceUpdateSchema = z.object({
  estado: z.enum(['borrador', 'emitida', 'pagada', 'anulada', 'vencida']).optional(),
  metodoPago: z.string().max(50).optional(),
  fechaPago: z.string().datetime().optional().nullable(),
  referenciaPago: z.string().max(255).optional().nullable(),
  notas: z.string().max(5000).optional().nullable(),
  notasCliente: z.string().max(5000).optional().nullable(),
});

/**
 * Schema para crear una Cotización
 */
export const CotizacionCreateSchema = z.object({
  dealId: CommonSchemas.id.optional().nullable(),
  leadId: CommonSchemas.id.optional().nullable(),
  contactId: CommonSchemas.id.optional().nullable(),
  titulo: z.string().min(1, 'Título requerido').max(500),
  descripcion: z.string().max(5000).optional().nullable(),
  subtotal: CommonSchemas.montoPositivo,
  descuentoPorcentaje: z.coerce.number().min(0).max(100).default(0),
  descuentoMonto: z.coerce.number().min(0).default(0),
  impuestos: z.coerce.number().min(0).default(0),
  total: CommonSchemas.montoPositivo,
  moneda: CommonSchemas.moneda,
  validezDias: z.coerce.number().int().min(1).max(365).default(30),
  terminosPago: z.string().max(500).optional().nullable(),
  notas: z.string().max(5000).optional().nullable(),
  notasCliente: z.string().max(5000).optional().nullable(),
  clienteNombre: z.string().max(500).optional().nullable(),
  clienteEmail: z.string().email().optional().nullable(),
  items: z.array(z.object({
    concepto: z.string().min(1).max(500),
    descripcion: z.string().max(2000).optional().nullable(),
    cantidad: z.coerce.number().min(0.01),
    precioUnitario: CommonSchemas.montoPositivo,
    descuento: z.coerce.number().min(0).default(0),
    impuestos: z.coerce.number().min(0).default(0),
    total: CommonSchemas.montoPositivo,
    orden: z.coerce.number().int().min(1).default(1),
    tasaImpuestoId: CommonSchemas.id.optional().nullable(),
  })).min(1, 'Al menos un item requerido').max(200, 'Máximo 200 items'),
});

export type CotizacionCreateInput = z.infer<typeof CotizacionCreateSchema>;

/**
 * Schema para crear una Orden de Venta
 */
export const OrdenVentaCreateSchema = z.object({
  dealId: CommonSchemas.id.optional().nullable(),
  leadId: CommonSchemas.id.optional().nullable(),
  contactId: CommonSchemas.id.optional().nullable(),
  cotizacionId: CommonSchemas.id.optional().nullable(),
  contratoId: CommonSchemas.id.optional().nullable(),
  numero: z.string().max(50).optional(),
  titulo: z.string().min(1, 'Título requerido').max(500),
  estado: z.enum(['pendiente', 'en_proceso', 'completada', 'cancelada']).default('pendiente'),
  total: CommonSchemas.montoPositivo,
  moneda: CommonSchemas.moneda,
  notas: z.string().max(5000).optional().nullable(),
});

export type OrdenVentaCreateInput = z.infer<typeof OrdenVentaCreateSchema>;

/**
 * Schema para crear un Contrato
 */
export const ContratoCreateSchema = z.object({
  contactId: CommonSchemas.id,
  dealId: CommonSchemas.id.optional().nullable(),
  leadId: CommonSchemas.id.optional().nullable(),
  cotizacionId: CommonSchemas.id.optional().nullable(),
  titulo: z.string().min(1, 'Título requerido').max(500),
  descripcion: z.string().max(5000).optional().nullable(),
  tipo: z.enum(['servicio', 'producto', 'mixto', 'suscripcion']).default('servicio'),
  items: z.array(z.object({
    concepto: z.string().min(1).max(500),
    descripcion: z.string().max(2000).optional().nullable(),
    cantidad: z.coerce.number().min(1),
    precioUnitario: CommonSchemas.montoPositivo,
    descuento: z.coerce.number().min(0).default(0),
    porcentajeImpuesto: z.coerce.number().min(0).default(0),
  })).optional().default([]),
  descuentoPorcentaje: z.coerce.number().min(0).max(100).optional(),
  descuentoMonto: z.coerce.number().min(0).optional(),
  tasaIva: z.coerce.number().min(0).max(100).optional(),
  incluyeIva: z.boolean().optional(),
  moneda: CommonSchemas.moneda,
  metodoPago: z.string().max(50).optional().nullable(),
  condicionesPago: z.string().max(500).optional().nullable(),
  frecuenciaPago: z.enum(['mensual', 'trimestral', 'anual', 'unico']).optional().nullable(),
  diaPago: z.coerce.number().int().min(1).max(31).optional().nullable(),
  clausulas: z.string().max(10000).optional().nullable(),
  notasInternas: z.string().max(5000).optional().nullable(),
  notasCliente: z.string().max(5000).optional().nullable(),
  fechaInicio: z.string().datetime().optional().nullable(),
  fechaFin: z.string().datetime().optional().nullable(),
});

export type ContratoCreateInput = z.infer<typeof ContratoCreateSchema>;
